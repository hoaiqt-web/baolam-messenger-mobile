import Echo from 'laravel-echo';
import { Platform } from 'react-native';

import { authStorage } from '@/features/auth/authStorage';
import { env } from '@/shared/config/env';

function resolvePusherConstructor(mod: any) {
  if (typeof mod === 'function') {
    return mod;
  }
  if (mod && typeof mod.default === 'function') {
    return mod.default;
  }
  if (mod && typeof mod.Pusher === 'function') {
    return mod.Pusher;
  }
  throw new Error('Invalid Pusher module export.');
}

// Metro/Hermes interop can return namespace objects; normalize to a callable constructor.
const pusherModule =
  Platform.OS === 'web' ? require('pusher-js') : require('pusher-js/react-native');
const PusherCtor = resolvePusherConstructor(pusherModule);
(globalThis as any).Pusher = PusherCtor;

export type ReverbMessageEventPayload = {
  message: {
    id: number;
    conversationId: number;
    body: string;
    isRecalled?: boolean;
    recalledAt?: string | null;
    clientMessageId: string;
    traceId: string;
    sentAt: string | null;
    replyTo?: {
      id: number;
      body: string;
      sender?: {
        id: number;
        username: string;
        fullName: string;
      };
    } | null;
    forwardedFrom?: {
      id: number;
      sourceConversationId: number;
      body: string;
      isRecalled?: boolean;
      sender?: {
        id: number;
        username: string;
        fullName: string;
      };
    } | null;
    mentions?: Array<{
      id: number;
      username: string;
      fullName: string;
    }>;
    attachments: Array<{
      id: number;
      objectKey: string;
      mimeType: string;
      size: number;
      originalName: string;
      width: number | null;
      height: number | null;
      url: string | null;
    }>;
    sender: {
      id: number;
      username: string;
      fullName: string;
    };
  };
};

type ReverbConversationCreatedPayload = {
  conversation: {
    id: number;
    name: string;
    type: string;
    hasUnread?: boolean;
    participants: Array<{
      id: number;
      username: string;
      fullName: string;
      role?: string;
    }>;
    latestMessage: {
      id: number;
      body: string;
      sentAt: string | null;
      sender: {
        id: number;
        username: string;
        fullName: string;
      };
    } | null;
  };
};

type ReverbMessagePinnedPayload = {
  message: ReverbMessageEventPayload['message'];
};

type ReverbMessageUnpinnedPayload = {
  conversationId: number;
  messageId: number;
};

type ReverbMessageReactionUpdatedPayload = {
  messageId: number;
  conversationId: number;
  reactionType: string;
  userId: number;
  action: 'added' | 'removed';
  reactions_summary: Record<string, number>;
};

type ReverbConversationReadUpdatedPayload = {
  conversationId: number;
  userId: number;
  lastReadMessageId: number;
};

export type ReverbTaskUpdatedPayload = {
  task: unknown;
  message: string;
};

export type ReverbConversationDeletedPayload = {
  conversationId: number;
};

type RealtimeConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'unavailable'
  | 'error';
type RealtimeConnectionListener = (state: RealtimeConnectionState) => void;

let echoClient: Echo<'reverb'> | null = null;
let connectionListeners = new Set<RealtimeConnectionListener>();
let lastInboundActivityAt = Date.now();
let currentConnectionState: RealtimeConnectionState = 'disconnected';

function emitConnectionState(state: RealtimeConnectionState) {
  currentConnectionState = state;
  if (state === 'connected') {
    // Treat successful reconnect as fresh activity to avoid immediate watchdog reconnect.
    markRealtimeInboundActivity();
  }
  connectionListeners.forEach((listener) => {
    try {
      listener(state);
    } catch {
      // Keep listener fanout resilient.
    }
  });
}

function bindConnectionListeners(echo: Echo<'reverb'>) {
  const pusher = (echo.connector as any)?.pusher;
  const connection = pusher?.connection;
  if (!connection?.bind) {
    return;
  }

  connection.bind('connecting', () => emitConnectionState('connecting'));
  connection.bind('connected', () => emitConnectionState('connected'));
  connection.bind('disconnected', () => emitConnectionState('disconnected'));
  connection.bind('unavailable', () => emitConnectionState('unavailable'));
  connection.bind('error', () => emitConnectionState('error'));

  // Every inbound websocket frame (including Pusher heartbeat pong) counts as
  // liveness so the FE watchdog doesn't flag an idle but healthy room as a
  // zombie connection.
  connection.bind('message', () => {
    markRealtimeInboundActivity();
  });
}

function getEchoClient(): Echo<'reverb'> | null {
  const token = authStorage.getToken();
  if (!token || !env.reverbKey) {
    return null;
  }

  if (!echoClient) {
    const transportPort =
      Number.isFinite(env.reverbPort) && env.reverbPort > 0
        ? env.reverbPort
        : undefined;
    echoClient = new Echo({
      broadcaster: 'reverb',
      key: env.reverbKey,
      wsHost: env.reverbHost,
      wsPort: transportPort,
      wssPort: transportPort,
      forceTLS: env.reverbScheme === 'https',
      enabledTransports: ['ws', 'wss'],
      authEndpoint: `${env.apiBaseUrl}/broadcasting/auth`,
      // Always resolve channel auth with the latest access token to avoid stale
      // Authorization headers after refresh-token rotation.
      authorizer: (channel: { name: string }) => ({
        authorize: (
          socketId: string,
          callback: (error: any, data: any) => void,
        ): void => {
          const latestToken = authStorage.getToken();
          if (!latestToken) {
            callback(true, { message: 'Missing auth token.' });
            return;
          }

          void fetch(`${env.apiBaseUrl}/broadcasting/auth`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: `Bearer ${latestToken}`,
            },
            body: JSON.stringify({
              socket_id: socketId,
              channel_name: channel.name,
            }),
          })
            .then(async (response) => {
              const payload = await response.json().catch(() => ({}));
              if (!response.ok) {
                callback(
                  true,
                  payload ?? {
                    message: 'Realtime auth request failed.',
                  },
                );
                return;
              }
              callback(false, payload);
            })
            .catch((error) => {
              callback(true, {
                message: 'Realtime auth request failed.',
                error: error instanceof Error ? error.message : String(error),
              });
            });
        },
      }),
    });
    bindConnectionListeners(echoClient);
  }

  return echoClient;
}

export function markRealtimeInboundActivity() {
  lastInboundActivityAt = Date.now();
}

export function getLastRealtimeInboundActivityAt() {
  return lastInboundActivityAt;
}

export function getRealtimeConnectionState() {
  return currentConnectionState;
}

export function addRealtimeConnectionListener(
  listener: RealtimeConnectionListener,
): () => void {
  connectionListeners.add(listener);
  return () => {
    connectionListeners.delete(listener);
  };
}

export function reconnectReverbClient() {
  const echo = getEchoClient();
  if (!echo) {
    return;
  }

  const pusher = (echo.connector as any)?.pusher;
  const connection = pusher?.connection;

  if (connection?.disconnect && connection?.connect) {
    connection.disconnect();
    connection.connect();
    return;
  }

  if (echo.disconnect && echo.connect) {
    echo.disconnect();
    echo.connect();
  }
}

export function closeReverbClient() {
  if (!echoClient) {
    return;
  }

  echoClient.disconnect();
  echoClient = null;
  currentConnectionState = 'disconnected';
}

export function getReverbSocketId(): string | null {
  const echo = getEchoClient();
  if (!echo) {
    return null;
  }

  const echoSocketId =
    typeof echo.socketId === 'function' ? echo.socketId() : null;
  if (typeof echoSocketId === 'string' && echoSocketId.length > 0) {
    return echoSocketId;
  }

  const fallbackSocketId = (echo.connector as any)?.pusher?.connection
    ?.socket_id;
  if (typeof fallbackSocketId === 'string' && fallbackSocketId.length > 0) {
    return fallbackSocketId;
  }

  return null;
}

export function subscribeConversationMessages(
  conversationId: number,
  onMessage: (payload: ReverbMessageEventPayload) => void,
  onPinned?: (payload: ReverbMessagePinnedPayload) => void,
  onUnpinned?: (payload: ReverbMessageUnpinnedPayload) => void,
  onRecalled?: (payload: ReverbMessageEventPayload) => void,
  onReactionUpdated?: (payload: ReverbMessageReactionUpdatedPayload) => void,
  onReadUpdated?: (payload: ReverbConversationReadUpdatedPayload) => void,
  onTaskUpdated?: (payload: ReverbTaskUpdatedPayload) => void,
): () => void {
  const echo = getEchoClient();
  if (!echo) {
    return () => undefined;
  }

  const channelName = `chat.conversation.${conversationId}`;
  const channel = echo.private(channelName);
  const onMessageWithHeartbeat = (payload: ReverbMessageEventPayload) => {
    markRealtimeInboundActivity();
    onMessage(payload);
  };
  channel.listen('.message.sent', onMessageWithHeartbeat);

  let onPinnedWithHeartbeat:
    | ((payload: ReverbMessagePinnedPayload) => void)
    | undefined;
  if (onPinned) {
    onPinnedWithHeartbeat = (payload: ReverbMessagePinnedPayload) => {
      markRealtimeInboundActivity();
      onPinned(payload);
    };
    channel.listen('.message.pinned', onPinnedWithHeartbeat);
  }
  let onUnpinnedWithHeartbeat:
    | ((payload: ReverbMessageUnpinnedPayload) => void)
    | undefined;
  if (onUnpinned) {
    onUnpinnedWithHeartbeat = (payload: ReverbMessageUnpinnedPayload) => {
      markRealtimeInboundActivity();
      onUnpinned(payload);
    };
    channel.listen('.message.unpinned', onUnpinnedWithHeartbeat);
  }
  let onRecalledWithHeartbeat:
    | ((payload: ReverbMessageEventPayload) => void)
    | undefined;
  if (onRecalled) {
    onRecalledWithHeartbeat = (payload: ReverbMessageEventPayload) => {
      markRealtimeInboundActivity();
      onRecalled(payload);
    };
    channel.listen('.message.recalled', onRecalledWithHeartbeat);
  }
  let onReactionUpdatedWithHeartbeat:
    | ((payload: ReverbMessageReactionUpdatedPayload) => void)
    | undefined;
  if (onReactionUpdated) {
    onReactionUpdatedWithHeartbeat = (
      payload: ReverbMessageReactionUpdatedPayload,
    ) => {
      markRealtimeInboundActivity();
      onReactionUpdated(payload);
    };
    channel.listen('.message.reaction.updated', onReactionUpdatedWithHeartbeat);
  }
  let onReadUpdatedWithHeartbeat:
    | ((payload: ReverbConversationReadUpdatedPayload) => void)
    | undefined;
  if (onReadUpdated) {
    onReadUpdatedWithHeartbeat = (
      payload: ReverbConversationReadUpdatedPayload,
    ) => {
      markRealtimeInboundActivity();
      onReadUpdated(payload);
    };
    channel.listen('.conversation.read.updated', onReadUpdatedWithHeartbeat);
  }
  let onTaskUpdatedWithHeartbeat:
    | ((payload: ReverbTaskUpdatedPayload) => void)
    | undefined;
  if (onTaskUpdated) {
    onTaskUpdatedWithHeartbeat = (payload: ReverbTaskUpdatedPayload) => {
      markRealtimeInboundActivity();
      onTaskUpdated(payload);
    };
    channel.listen('.task.updated', onTaskUpdatedWithHeartbeat);
  }

  return () => {
    channel.stopListening('.message.sent', onMessageWithHeartbeat);
    if (onPinnedWithHeartbeat) {
      channel.stopListening('.message.pinned', onPinnedWithHeartbeat);
    }
    if (onUnpinnedWithHeartbeat) {
      channel.stopListening('.message.unpinned', onUnpinnedWithHeartbeat);
    }
    if (onRecalledWithHeartbeat) {
      channel.stopListening('.message.recalled', onRecalledWithHeartbeat);
    }
    if (onReactionUpdatedWithHeartbeat) {
      channel.stopListening(
        '.message.reaction.updated',
        onReactionUpdatedWithHeartbeat,
      );
    }
    if (onReadUpdatedWithHeartbeat) {
      channel.stopListening(
        '.conversation.read.updated',
        onReadUpdatedWithHeartbeat,
      );
    }
    if (onTaskUpdatedWithHeartbeat) {
      channel.stopListening('.task.updated', onTaskUpdatedWithHeartbeat);
    }
    echo.leave(channelName);
  };
}

export function subscribeUserInboxMessages(
  userId: number,
  onMessage: (payload: ReverbMessageEventPayload) => void,
  onConversationCreated?: (payload: ReverbConversationCreatedPayload) => void,
  onConversationUpdated?: (payload: ReverbConversationCreatedPayload) => void,
  onConversationDeleted?: (payload: ReverbConversationDeletedPayload) => void,
): () => void {
  const echo = getEchoClient();
  if (!echo) {
    return () => undefined;
  }

  const channelName = `chat.user.${userId}`;
  const channel = echo.private(channelName);
  const onMessageWithHeartbeat = (payload: ReverbMessageEventPayload) => {
    markRealtimeInboundActivity();
    onMessage(payload);
  };
  channel.listen('.message.sent', onMessageWithHeartbeat);
  let onConversationCreatedWithHeartbeat:
    | ((payload: ReverbConversationCreatedPayload) => void)
    | undefined;
  if (onConversationCreated) {
    onConversationCreatedWithHeartbeat = (
      payload: ReverbConversationCreatedPayload,
    ) => {
      markRealtimeInboundActivity();
      onConversationCreated(payload);
    };
    channel.listen('.conversation.created', onConversationCreatedWithHeartbeat);
  }
  let onConversationUpdatedWithHeartbeat:
    | ((payload: ReverbConversationCreatedPayload) => void)
    | undefined;
  if (onConversationUpdated) {
    onConversationUpdatedWithHeartbeat = (
      payload: ReverbConversationCreatedPayload,
    ) => {
      markRealtimeInboundActivity();
      onConversationUpdated(payload);
    };
    channel.listen('.conversation.updated', onConversationUpdatedWithHeartbeat);
  }
  let onConversationDeletedWithHeartbeat:
    | ((payload: ReverbConversationDeletedPayload) => void)
    | undefined;
  if (onConversationDeleted) {
    onConversationDeletedWithHeartbeat = (payload: ReverbConversationDeletedPayload) => {
      markRealtimeInboundActivity();
      onConversationDeleted(payload);
    };
    channel.listen('.conversation.deleted', onConversationDeletedWithHeartbeat);
  }

  return () => {
    channel.stopListening('.message.sent', onMessageWithHeartbeat);
    if (onConversationCreatedWithHeartbeat) {
      channel.stopListening(
        '.conversation.created',
        onConversationCreatedWithHeartbeat,
      );
    }
    if (onConversationUpdatedWithHeartbeat) {
      channel.stopListening(
        '.conversation.updated',
        onConversationUpdatedWithHeartbeat,
      );
    }
    if (onConversationDeletedWithHeartbeat) {
      channel.stopListening('.conversation.deleted', onConversationDeletedWithHeartbeat);
    }
    echo.leave(channelName);
  };
}
