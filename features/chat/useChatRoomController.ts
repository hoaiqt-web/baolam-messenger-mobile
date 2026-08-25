import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import {
  useCreateGroupConversationMutation,
  useOpenDirectConversationMutation,
  useSendMessageMutation,
} from '@/features/chat/mutations';
import {
  useAttachmentsQuery,
  useConversationsQuery,
  useMessagesQuery,
  usePinnedMessagesQuery,
} from '@/features/chat/queries';
import {
  resolveNotificationConversationContext,
  shouldNotifyForGroupMessage,
} from '@/features/chat/groupNotificationPolicy';
import { useChatUiStore } from '@/features/chat/chatUiStore';
import type {
  ChatConversation,
  ChatMessage,
  ChatMessageForwardedSummary,
  ChatMessageReplySummary,
  ComposerAttachmentDraft,
  SendMessageAttachmentPayload,
} from '@/Models/chat/types';
import { chatApi } from '@/services/api/chatApi';
import {
  addRealtimeConnectionListener,
  closeReverbClient,
  getLastRealtimeInboundActivityAt,
  getRealtimeConnectionState,
  reconnectReverbClient,
  subscribeConversationMessages,
  subscribeUserInboxMessages,
  type ReverbMessageEventPayload,
} from '@/services/realtime/reverbClient';
import {
  getBrowserNotificationPermission,
  isBrowserNotificationsDebugEnabled,
  loadBrowserNotificationsEnabled,
  notifyBrowserMessage,
  playNotificationSound,
  requestBrowserNotificationPermission,
  setBrowserNotificationsEnabled,
  type BrowserNotificationPermission,
} from '@/services/notifications/browserNotifications';
import { env } from '@/shared/config/env';
import { getTaskVerificationPreview } from '@/features/chat/taskVerificationParsers';
import { getBugOutstandingDigestPreview } from '@/features/chat/bugOutstandingDigestParsers';
import { normalizeReplyAttachmentsFromApi } from '@/widgets/chat-layout/chatLayoutHelpers';
function conversationListPreviewBody(message: ChatMessage): string {
  const trimmed = (message.body ?? '').trim();
  const digestPreview = getBugOutstandingDigestPreview(trimmed);
  if (digestPreview) return digestPreview;
  const verificationPreview = getTaskVerificationPreview(trimmed);
  if (verificationPreview) return verificationPreview;
  if (trimmed) return trimmed;
  if ((message.attachments?.length ?? 0) > 0) return 'Hình ảnh';
  if (message.forwardedFrom) {
    const forwardedBody = (message.forwardedFrom.body ?? '').trim();
    if (forwardedBody) return forwardedBody;
    if ((message.forwardedFrom.attachments?.length ?? 0) > 0) return 'Hình ảnh';
  }
  return '';
}

const REALTIME_WATCHDOG_INTERVAL_MS = 5000;
const REALTIME_RECONNECT_BASE_DELAY_MS = 1000;
const REALTIME_RECONNECT_MAX_DELAY_MS = 15000;
// Pusher sometimes reports `connected` even after a silent network partition
// (e.g. NAT rebinding, mobile network handoff). If nothing has been heard from
// the server within this window, force a reconnect to re-establish liveness.
// Chosen to sit comfortably above `ping_interval + activity_timeout` on the
// Reverb side so normal pings keep the heartbeat fresh.
const REALTIME_SILENT_CONNECTION_THRESHOLD_MS = 45_000;

// Monotonically-decreasing counter to guarantee each optimistic message gets a
// unique negative id even when multiple messages are sent inside the same
// millisecond on a fast device. Server ids are always positive.
let optimisticIdCounter = 0;
function nextOptimisticMessageId(): number {
  optimisticIdCounter += 1;
  return -(Date.now() * 1000 + optimisticIdCounter);
}

const latencyTraceTimeline = new Map<string, Map<string, number>>();

function getLatencyTs(payload: Record<string, unknown>): number | null {
  const serverMs = payload.serverTsMs;
  if (typeof serverMs === 'number' && Number.isFinite(serverMs)) {
    return serverMs;
  }
  const ms = payload.clientNowMs;
  return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
}

function logLatencyHop(hop: string, payload: Record<string, unknown>) {
  if (!env.chatLatencyEnabled) {
    return;
  }

  console.info('chat_latency', { hop, ...payload });
  const traceId = typeof payload.traceId === 'string' ? payload.traceId : '';
  const ts = getLatencyTs(payload);
  if (!traceId || ts === null) {
    return;
  }

  const timeline =
    latencyTraceTimeline.get(traceId) ?? new Map<string, number>();
  timeline.set(hop, ts);
  latencyTraceTimeline.set(traceId, timeline);

  const apiReceived = timeline.get('api_received');
  const dbCommitted = timeline.get('db_committed');
  const eventDispatched = timeline.get('event_dispatched');
  const feAck = timeline.get('fe_ack');
  const feReceived = timeline.get('fe_received');
  const feRendered = timeline.get('fe_rendered');

  if (
    !apiReceived ||
    !dbCommitted ||
    !eventDispatched ||
    !feReceived ||
    !feRendered
  ) {
    return;
  }

  console.info('chat_latency_summary', {
    traceId,
    apiToDbMs: dbCommitted - apiReceived,
    dbToDispatchMs: eventDispatched - dbCommitted,
    dispatchToReceiveMs: feReceived - eventDispatched,
    receiveToRenderMs: feRendered - feReceived,
    apiToRenderMs: feRendered - apiReceived,
    apiToAckMs: feAck ? feAck - apiReceived : null,
  });
}

function normalizeConversation(raw: ChatConversation): ChatConversation {
  return {
    ...raw,
    id: Number(raw.id),
    hasUnread: Boolean(raw.hasUnread),
    hasUnreadMention: Boolean(raw.hasUnreadMention),
    participants: (raw.participants ?? []).map((participant) => ({
      ...participant,
      id: Number(participant.id),
    })),
    latestMessage: raw.latestMessage
      ? {
          ...raw.latestMessage,
          id: Number(raw.latestMessage.id),
          sender: {
            ...raw.latestMessage.sender,
            id: Number(raw.latestMessage.sender.id),
          },
        }
      : null,
  };
}

type UseChatRoomState = {
  conversations: ChatConversation[];
  activeConversationId: number | null;
  messages: ChatMessage[];
  hasMoreMessages: boolean;
  isLoadingOlderMessages: boolean;
  pinnedMessages: import('@/Models/chat/types').PinnedMessage[];
  attachments: import('@/Models/chat/types').ChatAttachment[];
  isLoading: boolean;
  error: string | null;
  createGroupConversation: (
    name: string,
    participantIds: number[],
  ) => Promise<void>;
  openConversationByUsername: (username: string) => Promise<boolean>;
  setActiveConversationId: (conversationId: number) => void;
  sendMessage: (
    body: string,
    draftAttachments: ComposerAttachmentDraft[],
    options?: {
      replyTo?: ChatMessageReplySummary | null;
      forwardedFrom?: ChatMessageForwardedSummary | null;
      mentionIds?: number[];
    },
  ) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  pinMessage: (messageId: number) => Promise<void>;
  unpinMessage: (messageId: number) => Promise<void>;
  recallMessage: (messageId: number) => Promise<void>;
  updateGroupName: (name: string) => Promise<void>;
  updateGroupAvatar: (file: File) => Promise<void>;
  deleteConversation: (conversationId: number) => Promise<void>;
  removeGroupMember: (userId: number) => Promise<void>;
  addGroupMembers: (userIds: number[]) => Promise<void>;
  updateMessageAcrossLoadedPages: (conversationId: number, messageId: number, updater: (message: ChatMessage) => ChatMessage) => void;
  jumpToMessage: (conversationId: number, messageId: number) => Promise<void>;
  notificationsEnabled: boolean;
  notificationPermission: BrowserNotificationPermission;
  toggleNotifications: () => Promise<void>;
  reload: () => Promise<void>;
};

type MessagesQueryData = {
  messages: ChatMessage[];
  hasMore: boolean;
};

type InfiniteMessagesQueryData = InfiniteData<MessagesQueryData>;

export function useChatRoomController(): UseChatRoomState {
  const normalizeMessage = useCallback((message: ChatMessage): ChatMessage => {
    const rawReplyTo = message.replyTo;
    const replyTo =
      rawReplyTo &&
      typeof rawReplyTo === 'object' &&
      rawReplyTo.sender &&
      typeof rawReplyTo.sender === 'object' &&
      Number.isFinite(Number(rawReplyTo.id))
        ? {
            id: Number(rawReplyTo.id),
            body:
              typeof rawReplyTo.body === 'string'
                ? rawReplyTo.body
                : 'Tin nhắn đã được thu hồi',
            isRecalled:
              Boolean((rawReplyTo as any).isRecalled) ||
              String(rawReplyTo.body ?? '').trim() === 'Tin nhắn đã được thu hồi' ||
              String(rawReplyTo.body ?? '').trim() === '[Tin nhắn đã thu hồi]',
            sender: {
              id: Number(rawReplyTo.sender.id),
              username: String(rawReplyTo.sender.username ?? ''),
              fullName: String(rawReplyTo.sender.fullName ?? ''),
            },
            attachments: normalizeReplyAttachmentsFromApi(
              (rawReplyTo as { attachments?: unknown }).attachments,
            ),
          }
        : null;

    const rawForwardedFrom = (message as ChatMessage).forwardedFrom;
    const forwardedFrom =
      rawForwardedFrom &&
      typeof rawForwardedFrom === 'object' &&
      rawForwardedFrom.sender &&
      typeof rawForwardedFrom.sender === 'object' &&
      Number.isFinite(Number(rawForwardedFrom.id)) &&
      Number.isFinite(Number(rawForwardedFrom.sourceConversationId))
        ? {
            id: Number(rawForwardedFrom.id),
            sourceConversationId: Number(rawForwardedFrom.sourceConversationId),
            body:
              typeof rawForwardedFrom.body === 'string'
                ? rawForwardedFrom.body
                : 'Tin nhắn đã được thu hồi',
            isRecalled:
              Boolean((rawForwardedFrom as { isRecalled?: boolean }).isRecalled) ||
              String(rawForwardedFrom.body ?? '').trim() === 'Tin nhắn đã được thu hồi' ||
              String(rawForwardedFrom.body ?? '').trim() === '[Tin nhắn đã thu hồi]',
            sender: {
              id: Number(rawForwardedFrom.sender.id),
              username: String(rawForwardedFrom.sender.username ?? ''),
              fullName: String(rawForwardedFrom.sender.fullName ?? ''),
            },
            attachments: normalizeReplyAttachmentsFromApi(
              (rawForwardedFrom as { attachments?: unknown }).attachments,
            ),
          }
        : null;

    const mentions = (message.mentions ?? [])
      .filter(
        (mention) =>
          mention &&
          typeof mention === 'object' &&
          Number.isFinite(Number(mention.id)),
      )
      .map((mention) => ({
        id: Number(mention.id),
        username: String(mention.username ?? ''),
        fullName: String(mention.fullName ?? ''),
      }));

    const sender = message.sender;
    const normalizedSender =
      sender && typeof sender === 'object'
        ? {
            id: Number(sender.id),
            username: String(sender.username ?? ''),
            fullName: String(sender.fullName ?? ''),
          }
        : { id: 0, username: '', fullName: '' };

    const normalizedAttachments = message.attachments ?? [];
    const fallbackForwardedAttachments = forwardedFrom?.attachments ?? [];
    const resolvedAttachments =
      normalizedAttachments.length > 0
        ? normalizedAttachments
        : fallbackForwardedAttachments;
    let resolvedBody =
      String(message.body ?? '').trim().length > 0
        ? String(message.body)
        : String(forwardedFrom?.body ?? '');
    if (resolvedBody.trim().length === 0) {
      if (resolvedAttachments.length > 0) {
        resolvedBody = 'Tệp đính kèm';
      } else if (forwardedFrom) {
        resolvedBody = 'Tin nhắn';
      }
    }

    return {
      ...message,
      id: Number(message.id),
      conversationId: Number(message.conversationId),
      body: resolvedBody,
      isRecalled: Boolean((message as any).isRecalled),
      recalledAt: (message as any).recalledAt ?? null,
      traceId: message.traceId ?? message.clientMessageId ?? String(message.id),
      attachments: resolvedAttachments,
      replyTo,
      forwardedFrom,
      mentions,
      sender: normalizedSender,
    };
  }, []);

  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const activeConversationId = useChatUiStore(
    (state) => state.activeConversationId,
  );
  const setActiveConversationId = useChatUiStore(
    (state) => state.setActiveConversationId,
  );
  const setHighlightedMessageId = useChatUiStore(
    (state) => state.setHighlightedMessageId,
  );
  const error = useChatUiStore((state) => state.error);
  const setError = useChatUiStore((state) => state.setError);
  const reset = useChatUiStore((state) => state.reset);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() =>
    loadBrowserNotificationsEnabled(),
  );
  const [notificationPermission, setNotificationPermission] =
    useState<BrowserNotificationPermission>(() =>
      getBrowserNotificationPermission(),
    );
  const lastNotifiedMessageKeyRef = useRef<string | null>(null);
  // Refs mirror latest state so long-lived realtime subscriptions can read fresh
  // values without being torn down & recreated on every state change (which
  // would otherwise drop events during the re-subscribe auth round-trip).
  const activeConversationIdRef = useRef(activeConversationId);
  const notificationsEnabledRef = useRef(notificationsEnabled);
  const setActiveConversationIdRef = useRef(setActiveConversationId);
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    typeof document === 'undefined'
      ? true
      : document.visibilityState === 'visible',
  );
  const isDocumentVisibleRef = useRef(isDocumentVisible);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(() =>
    getRealtimeConnectionState() === 'connected',
  );

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    isDocumentVisibleRef.current = isDocumentVisible;
  }, [isDocumentVisible]);

  useEffect(() => {
    notificationsEnabledRef.current = notificationsEnabled;
  }, [notificationsEnabled]);

  useEffect(() => {
    setActiveConversationIdRef.current = setActiveConversationId;
  }, [setActiveConversationId]);

  const hasCurrentUser = Boolean(currentUser);
  const hasActiveConversation = Boolean(
    currentUser && activeConversationId && activeConversationId > 0,
  );
  const shouldPollChatQueries = !isRealtimeConnected || !isDocumentVisible;
  const conversationsQuery = useConversationsQuery({
    enabled: hasCurrentUser,
    isDocumentVisible,
    shouldPoll: shouldPollChatQueries,
  });

  const conversations = conversationsQuery.data?.conversations ?? [];
  const activeConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === activeConversationId,
      ) ?? null,
    [activeConversationId, conversations],
  );

  const messagesQuery = useMessagesQuery({
    activeConversationId,
    enabled: hasActiveConversation,
    isDocumentVisible,
    shouldPoll: shouldPollChatQueries,
  });

  const messages = useMemo(
    () =>
      (messagesQuery.data?.pages ?? [])
        .slice()
        .reverse()
        .flatMap((page) => page.messages ?? []),
    [messagesQuery.data?.pages],
  );
  const hasMoreMessages = Boolean(messagesQuery.hasNextPage);
  const isLoadingOlderMessages = messagesQuery.isFetchingNextPage;

  const pinnedMessagesQuery = usePinnedMessagesQuery({
    activeConversationId,
    enabled: hasActiveConversation,
  });

  const pinnedMessages = pinnedMessagesQuery.data?.pins ?? [];

  const isDetailsPanelVisible = useChatUiStore(
    (state) => state.isDetailsPanelVisible,
  );

  const attachmentsQuery = useAttachmentsQuery({
    activeConversationId,
    enabled: hasActiveConversation && isDetailsPanelVisible,
  });

  const attachments = attachmentsQuery.data?.attachments ?? [];

  const lastStableMessageId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const id = messages[index]?.id;
      if (typeof id === 'number' && id > 0) {
        return id;
      }
    }
    return null;
  }, [messages]);

  const markReadRunId = useRef(0);
  const lastMarkReadRef = useRef<{ conversationId: number; messageId: number | null } | null>(null);

  const updateLatestMessagesPage = useCallback(
    (
      conversationId: number,
      updater: (page: MessagesQueryData) => MessagesQueryData,
    ) => {
      queryClient.setQueryData<InfiniteMessagesQueryData>(
        ['chat', 'messages', conversationId],
        (prev) => {
          const pageZero: MessagesQueryData = prev?.pages[0] ?? {
            messages: [],
            hasMore: false,
          };
          const nextPageZero = updater(pageZero);

          if (!prev || prev.pages.length === 0) {
            return {
              pageParams: [null],
              pages: [nextPageZero],
            };
          }

          const pages = [...prev.pages];
          pages[0] = nextPageZero;
          return {
            ...prev,
            pages,
          };
        },
      );
    },
    [queryClient],
  );

  const updateMessageAcrossLoadedPages = useCallback(
    (conversationId: number, messageId: number, updater: (message: ChatMessage) => ChatMessage) => {
      queryClient.setQueryData<InfiniteMessagesQueryData>(
        ['chat', 'messages', conversationId],
        (prev) => {
          if (!prev) {
            return prev;
          }

          const pages = prev.pages.map((page) => ({
            ...page,
            messages: (page.messages ?? []).map((item) =>
              Number(item.id) === Number(messageId) ? updater(item) : item,
            ),
          }));

          return {
            ...prev,
            pages,
          };
        },
      );
    },
    [queryClient],
  );

  const jumpToMessage = useCallback(
    async (conversationId: number, messageId: number) => {
      // 1. Ensure conversation is active
      if (activeConversationId !== conversationId) {
        setActiveConversationId(conversationId);
      }

      // 2. Check if message exists in current state
      const currentMessages = (queryClient.getQueryData<InfiniteMessagesQueryData>(['chat', 'messages', conversationId])?.pages ?? [])
        .flatMap(p => p.messages ?? []);
      
      const exists = currentMessages.some(m => Number(m.id) === Number(messageId));

      if (exists) {
        // Just highlight and return
        setHighlightedMessageId(messageId);
        window.setTimeout(() => setHighlightedMessageId(null), 3000);
        return;
      }

      // 3. Not in state, fetch around
      try {
        const response = await chatApi.getMessagesAround(conversationId, messageId);
        const normalized = response.messages.map(normalizeMessage);

        // Reset query data with the "around" window
        queryClient.setQueryData<InfiniteMessagesQueryData>(
          ['chat', 'messages', conversationId],
          {
            pageParams: [null],
            pages: [{
              messages: normalized,
              hasMore: response.hasMore ?? false
            }]
          }
        );

        // Highlight
        setHighlightedMessageId(messageId);
        window.setTimeout(() => setHighlightedMessageId(null), 3000);
      } catch (err) {
        console.error('Failed to jump to message', err);
        setError('Không thể tải tin nhắn này.');
      }
    },
    [activeConversationId, setActiveConversationId, queryClient, normalizeMessage, setHighlightedMessageId, setError]
  );

  const compareMessageOrder = useCallback(
    (
      incoming: { id: number; sentAt: string | null | undefined },
      existing:
        | { id: number; sentAt: string | null | undefined }
        | null
        | undefined,
    ): number => {
      if (!existing) {
        return 1;
      }

      const incomingTime = incoming.sentAt
        ? Date.parse(incoming.sentAt)
        : Number.NaN;
      const existingTime = existing.sentAt
        ? Date.parse(existing.sentAt)
        : Number.NaN;
      const hasIncomingTime = Number.isFinite(incomingTime);
      const hasExistingTime = Number.isFinite(existingTime);

      if (hasIncomingTime && hasExistingTime && incomingTime !== existingTime) {
        return incomingTime > existingTime ? 1 : -1;
      }

      if (incoming.id === existing.id) {
        return 0;
      }

      return incoming.id > existing.id ? 1 : -1;
    },
    [],
  );

  const markConversationReadAndSync = useCallback(
    async (conversationId: number, runId?: number) => {
      const result = await chatApi.markConversationRead(conversationId);
      if (typeof runId === 'number' && markReadRunId.current !== runId) {
        return;
      }

      // Local cache update is enough; avoid invalidating the whole conversations
      // list on every new message because realtime already keeps it fresh and
      // repeated refetches cause sidebar flicker + request spam.
      queryClient.setQueryData<{ conversations: ChatConversation[] }>(
        ['chat', 'conversations'],
        (prev) => ({
          conversations: (prev?.conversations ?? []).map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  hasUnread: result.hasUnread,
                  hasUnreadMention: result.hasUnreadMention ?? false,
                }
              : conversation,
          ),
        }),
      );
    },
    [queryClient],
  );

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const syncVisibility = () => {
      setIsDocumentVisible(document.visibilityState === 'visible');
    };

    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setIsRealtimeConnected(false);
      return;
    }

    setIsRealtimeConnected(getRealtimeConnectionState() === 'connected');
    return addRealtimeConnectionListener((state) => {
      setIsRealtimeConnected(state === 'connected');
    });
  }, [currentUser]);

  useEffect(() => {
    const refreshPermission = () => {
      setNotificationPermission(getBrowserNotificationPermission());
    };

    refreshPermission();
    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('focus', refreshPermission);
    window.addEventListener('visibilitychange', refreshPermission);

    return () => {
      window.removeEventListener('focus', refreshPermission);
      window.removeEventListener('visibilitychange', refreshPermission);
    };
  }, []);

  useEffect(() => {
    if (!currentUser || !activeConversationId || !messagesQuery.isSuccess) {
      return;
    }

    const prev = lastMarkReadRef.current;
    if (
      prev &&
      prev.conversationId === activeConversationId &&
      prev.messageId === lastStableMessageId
    ) {
      return;
    }

    lastMarkReadRef.current = {
      conversationId: activeConversationId,
      messageId: lastStableMessageId,
    };

    const conversationId = activeConversationId;
    const runId = (markReadRunId.current += 1);

    void (async () => {
      try {
        await markConversationReadAndSync(conversationId, runId);
      } catch {
        // Keep optimistic UI; next refetch/reconnect can recover.
      }
    })();
  }, [
    activeConversationId,
    currentUser,
    lastStableMessageId,
    markConversationReadAndSync,
    messagesQuery.isSuccess,
  ]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    let reconnectTimeoutId: number | null = null;
    let reconnectAttempt = 0;
    // Only trigger catch-up refetch after we've seen a non-connected state; the
    // initial 'connected' after mount already has fresh query data.
    let hasBeenDisconnected = false;

    const clearReconnectTimer = () => {
      if (reconnectTimeoutId !== null) {
        window.clearTimeout(reconnectTimeoutId);
        reconnectTimeoutId = null;
      }
    };

    const scheduleReconnect = (
      reason: 'connection_event' | 'watchdog_stale',
    ) => {
      if (reconnectTimeoutId !== null) {
        return;
      }
      const delayMs = Math.min(
        REALTIME_RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempt),
        REALTIME_RECONNECT_MAX_DELAY_MS,
      );
      reconnectTimeoutId = window.setTimeout(() => {
        reconnectTimeoutId = null;
        reconnectReverbClient();
      }, delayMs);
      reconnectAttempt = Math.min(reconnectAttempt + 1, 10);

      if (env.chatLatencyEnabled) {
        console.info('chat_realtime_reconnect_scheduled', {
          reason,
          attempt: reconnectAttempt,
          delayMs,
          clientNowMs: Date.now(),
        });
      }
    };

    const removeConnectionListener = addRealtimeConnectionListener((state) => {
      if (env.chatLatencyEnabled) {
        console.info('chat_realtime_connection', {
          state,
          clientNowMs: Date.now(),
        });
      }
      if (state === 'connected') {
        reconnectAttempt = 0;
        clearReconnectTimer();

        // Catch-up: events published during the outage are lost on Reverb
        // (no replay). Refetch the user-visible caches so the sidebar and the
        // open room reflect reality again.
        if (hasBeenDisconnected) {
          hasBeenDisconnected = false;
          void queryClient.invalidateQueries({
            queryKey: ['chat', 'conversations'],
          });
          const activeId = activeConversationIdRef.current;
          if (activeId && activeId > 0) {
            void queryClient.invalidateQueries({
              queryKey: ['chat', 'messages', activeId],
            });
            void queryClient.invalidateQueries({
              queryKey: ['chat', 'pins', activeId],
            });
            void queryClient.invalidateQueries({
              queryKey: ['chat', 'attachments', activeId],
            });
          }
        }
      }
      if (
        state === 'disconnected' ||
        state === 'unavailable' ||
        state === 'error'
      ) {
        hasBeenDisconnected = true;
        scheduleReconnect('connection_event');
      }
    });

    const watchdog = window.setInterval(() => {
      const connectionState = getRealtimeConnectionState();
      if (connectionState !== 'connected') {
        if (env.chatLatencyEnabled) {
          console.info('chat_realtime_watchdog', {
            reason: 'connection_not_connected',
            state: connectionState,
            clientNowMs: Date.now(),
          });
        }
        scheduleReconnect('connection_event');
        return;
      }

      // Liveness check: socket says "connected" but if we have not seen any
      // inbound activity (message event or Pusher ping ack) for a while, the
      // connection is probably a zombie — force a reconnect.
      const idleMs = Date.now() - getLastRealtimeInboundActivityAt();
      if (idleMs > REALTIME_SILENT_CONNECTION_THRESHOLD_MS) {
        if (env.chatLatencyEnabled) {
          console.info('chat_realtime_watchdog', {
            reason: 'silent_connection',
            idleMs,
            clientNowMs: Date.now(),
          });
        }
        hasBeenDisconnected = true;
        scheduleReconnect('watchdog_stale');
      }
    }, REALTIME_WATCHDOG_INTERVAL_MS);

    return () => {
      clearReconnectTimer();
      removeConnectionListener();
      window.clearInterval(watchdog);
    };
  }, [currentUser, queryClient]);

  useEffect(() => {
    if (!currentUser) {
      reset();
      queryClient.removeQueries({ queryKey: ['chat'] });
      closeReverbClient();
      return;
    }

    if (!activeConversationId && conversations.length > 0) {
      setActiveConversationId(conversations[0].id);
    }
  }, [
    activeConversationId,
    conversations,
    currentUser,
    queryClient,
    reset,
    setActiveConversationId,
  ]);

  useEffect(() => {
    if (!activeConversationId) {
      return;
    }

    return subscribeConversationMessages(
      activeConversationId,
      ({ message }) => {
        const normalizedMessage = normalizeMessage(message as ChatMessage);

        logLatencyHop('fe_received', {
          traceId: normalizedMessage.traceId,
          conversationId: normalizedMessage.conversationId,
          messageId: normalizedMessage.id,
          clientNowMs: Date.now(),
        });

        // Update messages query
        updateLatestMessagesPage(activeConversationId, (page) => {
            const previousMessages = page.messages ?? [];
            const normalizedClientMessageId =
              normalizedMessage.clientMessageId || null;
            const hasMessage = previousMessages.some(
              (item) =>
                item.id === normalizedMessage.id ||
                (normalizedClientMessageId !== null &&
                  item.clientMessageId === normalizedClientMessageId),
            );

            if (hasMessage) {
              return {
                messages: previousMessages.map((item) =>
                  item.id === normalizedMessage.id ||
                  (normalizedClientMessageId !== null &&
                    item.clientMessageId === normalizedClientMessageId)
                    ? { ...normalizedMessage, status: 'sent' }
                    : item,
                ),
                hasMore: page.hasMore,
              };
            }

            // Insert in the correct position by sentAt (fallback: id). Events
            // normally arrive in order so `push` would work, but after a
            // reconnect Reverb may deliver buffered events out of order.
            const messageToInsert = {
              ...normalizedMessage,
              status: 'sent' as const,
            };
            let insertAt = previousMessages.length;
            while (insertAt > 0) {
              const prior = previousMessages[insertAt - 1];
              const order = compareMessageOrder(
                {
                  id: Number(messageToInsert.id),
                  sentAt: messageToInsert.sentAt,
                },
                { id: Number(prior.id), sentAt: prior.sentAt },
              );
              if (order >= 0) {
                break;
              }
              insertAt -= 1;
            }

            const nextMessages = previousMessages.slice();
            nextMessages.splice(insertAt, 0, messageToInsert);
            return {
              messages: nextMessages,
              hasMore: page.hasMore,
            };
          });

        // Update conversation list item
        queryClient.setQueryData<{ conversations: ChatConversation[] }>(
          ['chat', 'conversations'],
          (prev) => {
            const previousConversations = prev?.conversations ?? [];
            return {
              conversations: previousConversations.map((conversation) =>
                conversation.id !== activeConversationId
                  ? conversation
                  : compareMessageOrder(
                        {
                          id: normalizedMessage.id,
                          sentAt: normalizedMessage.sentAt,
                        },
                        conversation.latestMessage,
                      ) < 0
                    ? conversation
                    : {
                        ...conversation,
                        hasUnread: false,
                        hasUnreadMention: false,
                        latestMessage: {
                          id: normalizedMessage.id,
                          body: conversationListPreviewBody(normalizedMessage),
                          sentAt: normalizedMessage.sentAt,
                          sender: {
                            id: normalizedMessage.sender.id,
                            username: normalizedMessage.sender.username,
                            fullName: normalizedMessage.sender.fullName,
                          },
                        },
                      },
              ),
            };
          },
        );

        // Invalidate queries for attachments if needed
        const missingAttachmentUrls = (message.attachments ?? []).some(
          (attachment) => !attachment.url,
        );
        if (missingAttachmentUrls) {
          void queryClient.invalidateQueries({
            queryKey: ['chat', 'messages', activeConversationId],
          });
        }
        if (
          normalizedMessage.attachments &&
          normalizedMessage.attachments.length > 0
        ) {
          void queryClient.invalidateQueries({
            queryKey: ['chat', 'attachments', activeConversationId],
          });
        }
      },
      ({ message }) => {
        queryClient.setQueryData<{
          pins: import('@/Models/chat/types').PinnedMessage[];
        }>(['chat', 'pins', activeConversationId], (prev) => {
          const pins = prev?.pins ?? [];
          if (pins.some((p) => p.message.id === Number(message.id))) {
            return prev;
          }
          const newPin: import('@/Models/chat/types').PinnedMessage = {
            pinnedAt: new Date().toISOString(),
            pinnedBy: {
              id: Number(message.sender.id),
              username: message.sender.username,
              fullName: message.sender.fullName,
            },
            message: {
              ...(message as ChatMessage),
              id: Number(message.id),
              conversationId: Number(message.conversationId),
              sender: { ...message.sender, id: Number(message.sender.id) },
              replyTo: (message as any).replyTo || null,
              forwardedFrom: (message as any).forwardedFrom || null,
            },
          };
          return { pins: [newPin, ...pins].slice(0, 3) };
        });
      },
      ({ messageId }) => {
        queryClient.setQueryData<{
          pins: import('@/Models/chat/types').PinnedMessage[];
        }>(['chat', 'pins', activeConversationId], (prev) => {
          const pins = prev?.pins ?? [];
          return {
            pins: pins.filter((p) => p.message.id !== Number(messageId)),
          };
        });
      },
      ({ message }) => {
        const normalizedMessage = normalizeMessage(message as ChatMessage);
        const recalledBody =
          normalizedMessage.body?.trim() || 'Tin nhắn đã được thu hồi';

        updateMessageAcrossLoadedPages(
          activeConversationId,
          normalizedMessage.id,
          (item) => ({
            ...normalizedMessage,
            status: item.status ?? 'sent',
            isRecalled: true,
            recalledAt: normalizedMessage.recalledAt ?? new Date().toISOString(),
            body: recalledBody,
            attachments: [],
          }),
        );

        queryClient.setQueryData<{ conversations: ChatConversation[] }>(
          ['chat', 'conversations'],
          (prev) => ({
            conversations: (prev?.conversations ?? []).map((conversation) =>
              conversation.id !== activeConversationId ||
              conversation.latestMessage?.id !== normalizedMessage.id
                ? conversation
                : {
                    ...conversation,
                    latestMessage: {
                      ...conversation.latestMessage,
                      body: recalledBody,
                    },
                  },
            ),
          }),
        );

        queryClient.setQueryData<{
          pins: import('@/Models/chat/types').PinnedMessage[];
        }>(['chat', 'pins', activeConversationId], (prev) => {
          const pins = prev?.pins ?? [];
          return {
            pins: pins.filter((p) => p.message.id !== normalizedMessage.id),
          };
        });
      },
      ({ messageId, reactions_summary, userId, reactionType, action }) => {
        updateMessageAcrossLoadedPages(activeConversationId, messageId, (msg) => {
          const updates: Partial<ChatMessage> = { reactions_summary };
          if (currentUser && Number(userId) === Number(currentUser.id)) {
            updates.user_reaction = action === 'added' ? reactionType : null;
          }
          return { ...msg, ...updates };
        });
      },
      ({ userId, lastReadMessageId }) => {
        // Mark all messages as read by this user up to lastReadMessageId
        queryClient.setQueryData<InfiniteMessagesQueryData>(
          ['chat', 'messages', activeConversationId],
          (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              pages: prev.pages.map((page) => ({
                ...page,
                messages: (page.messages ?? []).map((msg) => {
                  if (msg.id <= lastReadMessageId) {
                    const readBySet = new Set(msg.read_by || []);
                    readBySet.add(userId);
                    return { ...msg, read_by: Array.from(readBySet) };
                  }
                  return msg;
                }),
              })),
            };
          }
        );
      },
      undefined,
      ({ message }) => {
        const normalizedMessage = normalizeMessage(message as ChatMessage);

        updateMessageAcrossLoadedPages(
          activeConversationId,
          normalizedMessage.id,
          (item) => ({
            ...item,
            ...normalizedMessage,
            status: item.status ?? 'sent',
          }),
        );

        queryClient.setQueryData<{ conversations: ChatConversation[] }>(
          ['chat', 'conversations'],
          (prev) => ({
            conversations: (prev?.conversations ?? []).map((conversation) =>
              conversation.id !== activeConversationId ||
              conversation.latestMessage?.id !== normalizedMessage.id
                ? conversation
                : {
                    ...conversation,
                    latestMessage: {
                      ...conversation.latestMessage!,
                      body: conversationListPreviewBody(normalizedMessage),
                    },
                  },
            ),
          }),
        );
      },
    );
  }, [
    activeConversationId,
    compareMessageOrder,
    normalizeMessage,
    queryClient,
    updateMessageAcrossLoadedPages,
  ]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    return subscribeUserInboxMessages(
      currentUser.id,
      ({ message, conversation: socketConversation }: ReverbMessageEventPayload) => {
        const normalizedSocketMessage = normalizeMessage(
          message as ChatMessage,
        );
        const debugEnabled = isBrowserNotificationsDebugEnabled();
        const normalizedConversationId = Number(
          normalizedSocketMessage.conversationId,
        );
        const missingAttachmentUrls = (
          normalizedSocketMessage.attachments ?? []
        ).some((attachment) => !attachment.url);

        let targetConversationType: string | null = null;
        let targetConversationName = '';
        queryClient.setQueryData<{ conversations: ChatConversation[] }>(
          ['chat', 'conversations'],
          (prev) => {
            const previousConversations = prev?.conversations ?? [];
            const existingConversation = previousConversations.find(
              (conversation) => conversation.id === normalizedConversationId,
            );
            if (!existingConversation) {
              void queryClient.invalidateQueries({
                queryKey: ['chat', 'conversations'],
              });
              return prev;
            }

            const isActive =
              activeConversationIdRef.current === normalizedConversationId;
            const fromOther =
              normalizedSocketMessage.sender.id !== Number(currentUser.id);
            const incomingMessageId = Number(normalizedSocketMessage.id);
            const orderVsCurrent = compareMessageOrder(
              { id: incomingMessageId, sentAt: normalizedSocketMessage.sentAt },
              existingConversation.latestMessage,
            );
            const isDuplicateLatest = orderVsCurrent === 0;
            const isOlderThanCurrent = orderVsCurrent < 0;

            if (isOlderThanCurrent) {
              return prev;
            }

            const messageHasMentionToMe = (normalizedSocketMessage.mentions ?? []).some(
              (m) => Number(m.id) === Number(currentUser.id)
            );

            const updatedConversation: ChatConversation = {
              ...existingConversation,
              hasUnread: isDuplicateLatest
                ? existingConversation.hasUnread
                : isActive
                  ? false
                  : fromOther,
              hasUnreadMention: isDuplicateLatest
                ? existingConversation.hasUnreadMention
                : isActive
                  ? false
                  : existingConversation.hasUnreadMention || (fromOther && messageHasMentionToMe),
              latestMessage: {
                id: incomingMessageId,
                body: conversationListPreviewBody(normalizedSocketMessage),
                sentAt: normalizedSocketMessage.sentAt,
                sender: {
                  id: normalizedSocketMessage.sender.id,
                  username: normalizedSocketMessage.sender.username,
                  fullName: normalizedSocketMessage.sender.fullName,
                },
              },
            };
            targetConversationType = updatedConversation.type;
            targetConversationName = updatedConversation.name;

            return {
              conversations: [
                updatedConversation,
                ...previousConversations.filter(
                  (conversation) =>
                    conversation.id !== normalizedConversationId,
                ),
              ],
            };
          },
        );

        const notificationMessageId = Number(normalizedSocketMessage.id);
        const normalizedMessageId = Number.isFinite(notificationMessageId)
          ? notificationMessageId
          : null;
        const normalizedMessageKey =
          normalizedMessageId !== null && normalizedMessageId > 0
            ? `${normalizedConversationId}:${normalizedMessageId}`
            : null;
        const fromOther =
          normalizedSocketMessage.sender.id !== Number(currentUser.id);
        const isFocusedConversation =
          activeConversationIdRef.current === normalizedConversationId;
        const isTabHidden = !isDocumentVisibleRef.current;
        const notificationsEnabledNow = notificationsEnabledRef.current;
        const shouldNotify =
          notificationsEnabledNow && fromOther && (!isFocusedConversation || isTabHidden);
        const isDuplicateNotification =
          normalizedMessageKey !== null &&
          lastNotifiedMessageKeyRef.current === normalizedMessageKey;
        
        const isMentioned = normalizedSocketMessage.mentions?.some(
          (m) => Number(m.id) === Number(currentUser.id)
        );
        const convContext = resolveNotificationConversationContext(
          socketConversation,
          targetConversationType,
          targetConversationName,
        );
        const satisfiesPolicy = shouldNotifyForGroupMessage({
          isGroup: convContext.isGroup,
          isMentioned: Boolean(isMentioned),
          conversationName: convContext.name,
          messageBody: normalizedSocketMessage.body ?? '',
        });

        if (debugEnabled) {
          console.info('chat_notification_trace', {
            step: 'decision',
            normalizedConversationId,
            normalizedMessageId,
            normalizedMessageKey,
            fromOther,
            isFocusedConversation,
            notificationsEnabled: notificationsEnabledNow,
            isGroup: convContext.isGroup,
            conversationType: convContext.type,
            conversationName: convContext.name,
            isMentioned,
            satisfiesPolicy,
            shouldNotify,
            isDuplicateNotification,
            lastNotifiedMessageKey: lastNotifiedMessageKeyRef.current,
            permission: getBrowserNotificationPermission(),
            activeConversationId: activeConversationIdRef.current,
            currentUserId: Number(currentUser.id),
            senderId: normalizedSocketMessage.sender.id,
          });
        }

        if (
          shouldNotify &&
          satisfiesPolicy &&
          normalizedMessageKey !== null &&
          !isDuplicateNotification
        ) {
          const isErpWidgetEmbed = () => {
            const params = new URLSearchParams(window.location.search);
            return (
              window.self !== window.top &&
              (params.get('layout') === 'erp_widget' ||
                params.get('mode') === 'embed')
            );
          };
          const erpWidgetEmbed = isErpWidgetEmbed();
          if (
            !(
              erpWidgetEmbed &&
              typeof document !== 'undefined' &&
              document.visibilityState !== 'visible'
            )
          ) {
            playNotificationSound();
          }

          const title = convContext.isDirect
              ? normalizedSocketMessage.sender.fullName ||
                normalizedSocketMessage.sender.username
              : convContext.name ||
                normalizedSocketMessage.sender.fullName ||
                normalizedSocketMessage.sender.username;
          const senderLabel =
            normalizedSocketMessage.sender.fullName ||
            normalizedSocketMessage.sender.username ||
            'Thành viên';
          const messagePreview =
            normalizedSocketMessage.body?.trim() ||
            ((normalizedSocketMessage.attachments?.length ?? 0) > 0
              ? 'Hình ảnh'
              : 'Tin nhắn mới');
          const body = convContext.isGroup
              ? `${senderLabel}: ${messagePreview}`
              : messagePreview;
          const notifyResult = notifyBrowserMessage({
            title,
            body,
            tag: `chat-conversation-${normalizedConversationId}`,
          });
          if (erpWidgetEmbed && window.parent) {
            window.parent.postMessage(
              {
                type: 'BAOLAM_ERP_CHAT_NOTIFY',
                payload: {
                  title,
                  body,
                  conversationId: normalizedConversationId,
                  messageId: normalizedMessageId,
                },
              },
              '*',
            );
          }
          if (debugEnabled) {
            console.info('chat_notification_trace', {
              step: 'notify_result',
              normalizedConversationId,
              normalizedMessageId,
              normalizedMessageKey,
              notifyResult,
              title,
              body,
            });
          }
          if (notifyResult.ok || erpWidgetEmbed) {
            lastNotifiedMessageKeyRef.current = normalizedMessageKey;
          }
        }

        if (
          activeConversationIdRef.current === normalizedConversationId &&
          missingAttachmentUrls
        ) {
          void queryClient.invalidateQueries({
            queryKey: ['chat', 'messages', normalizedConversationId],
          });
        }
      },
      ({ conversation }) => {
        const normalizedConversation = normalizeConversation(
          conversation as any,
        );

        queryClient.setQueryData<{ conversations: ChatConversation[] }>(
          ['chat', 'conversations'],
          (prev) => {
            const previousConversations = prev?.conversations ?? [];
            const withoutCurrent = previousConversations.filter(
              (item) => item.id !== normalizedConversation.id,
            );

            return {
              conversations: [normalizedConversation, ...withoutCurrent],
            };
          },
        );
      },
      ({ conversation }) => {
        const normalizedConversation = normalizeConversation(
          conversation as any,
        );

        queryClient.setQueryData<{ conversations: ChatConversation[] }>(
          ['chat', 'conversations'],
          (prev) => {
            const previousConversations = prev?.conversations ?? [];
            return {
              conversations: previousConversations.map((c) =>
                c.id === normalizedConversation.id ? normalizedConversation : c,
              ),
            };
          },
        );
      },
      ({ conversationId }) => {
        const id = Number(conversationId);
        if (!Number.isFinite(id) || id <= 0) {
          return;
        }
        queryClient.removeQueries({ queryKey: ['chat', 'messages', id] });
        queryClient.removeQueries({ queryKey: ['chat', 'pins', id] });
        queryClient.removeQueries({ queryKey: ['chat', 'attachments', id] });
        queryClient.setQueryData<{ conversations: ChatConversation[] }>(
          ['chat', 'conversations'],
          (prev) => {
            const previousConversations = prev?.conversations ?? [];
            const newConversations = previousConversations.filter(
              (c) => c.id !== id,
            );
            if (activeConversationIdRef.current === id) {
              const nextConv =
                newConversations.length > 0 ? newConversations[0] : null;
              setActiveConversationIdRef.current(nextConv?.id ?? -1);
            }
            return { conversations: newConversations };
          },
        );
      },
      ({ message }) => {
        const normalizedMessage = normalizeMessage(message as ChatMessage);
        const normalizedConversationId = Number(
          normalizedMessage.conversationId,
        );

        updateLatestMessagesPage(normalizedConversationId, (page) => {
          const previousMessages = page.messages ?? [];
          const hasMessage = previousMessages.some(
            (item) => item.id === normalizedMessage.id,
          );
          if (!hasMessage) {
            return page;
          }

          return {
            messages: previousMessages.map((item) =>
              item.id === normalizedMessage.id
                ? { ...normalizedMessage, status: 'sent' as const }
                : item,
            ),
            hasMore: page.hasMore,
          };
        });

        if (activeConversationIdRef.current === normalizedConversationId) {
          updateMessageAcrossLoadedPages(
            normalizedConversationId,
            normalizedMessage.id,
            (item) => ({
              ...item,
              ...normalizedMessage,
              status: item.status ?? 'sent',
            }),
          );
          void queryClient.invalidateQueries({
            queryKey: ['chat', 'messages', normalizedConversationId],
          });
        } else {
          void queryClient.invalidateQueries({
            queryKey: ['chat', 'messages', normalizedConversationId],
          });
        }

        queryClient.setQueryData<{ conversations: ChatConversation[] }>(
          ['chat', 'conversations'],
          (prev) => ({
            conversations: (prev?.conversations ?? []).map((conversation) =>
              conversation.id !== normalizedConversationId ||
              conversation.latestMessage?.id !== normalizedMessage.id
                ? conversation
                : {
                    ...conversation,
                    latestMessage: {
                      ...conversation.latestMessage!,
                      body: conversationListPreviewBody(normalizedMessage),
                    },
                  },
            ),
          }),
        );
      },
    );
    // Intentionally only depends on the user identity + stable helpers.
    // activeConversationId and notificationsEnabled are read from refs so that
    // switching rooms or toggling notifications does NOT tear down and rebuild
    // the inbox subscription (which would briefly miss realtime events during
    // the re-subscribe auth round-trip).
  }, [compareMessageOrder, currentUser, normalizeMessage, queryClient, updateMessageAcrossLoadedPages]);

  const toggleNotifications = useCallback(async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      setBrowserNotificationsEnabled(false);
      return;
    }

    const currentPermission = getBrowserNotificationPermission();
    setNotificationPermission(currentPermission);
    if (currentPermission === 'unsupported' || currentPermission === 'denied') {
      setNotificationsEnabled(false);
      setBrowserNotificationsEnabled(false);
      return;
    }

    if (currentPermission === 'default') {
      const nextPermission = await requestBrowserNotificationPermission();
      setNotificationPermission(nextPermission);
      if (nextPermission !== 'granted') {
        setNotificationsEnabled(false);
        setBrowserNotificationsEnabled(false);
        return;
      }
    }

    setNotificationsEnabled(true);
    setBrowserNotificationsEnabled(true);
  }, [notificationsEnabled]);

  const createGroupConversationMutation = useCreateGroupConversationMutation();
  const openDirectConversationMutation = useOpenDirectConversationMutation();
  const sendMessageMutation = useSendMessageMutation();

  const uploadToSignedUrl = useCallback(
    async (uploadUrl: string, file: File, headers: Record<string, string>) => {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers,
        body: file,
      });
      if (!response.ok) {
        throw new Error('Upload failed');
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (
      body: string,
      draftAttachments: ComposerAttachmentDraft[],
      options?: {
        replyTo?: ChatMessageReplySummary | null;
        forwardedFrom?: ChatMessageForwardedSummary | null;
        mentionIds?: number[];
      },
    ) => {
      if (!activeConversationId || !currentUser) {
        return;
      }

      const trimmedBody = body.trim();
      const hasForward = Boolean(options?.forwardedFrom);
      if (!trimmedBody && draftAttachments.length === 0 && !hasForward) {
        return;
      }

      const traceId = crypto.randomUUID();
      const clientMessageId = traceId;
      const clientSentAt = Date.now();
      logLatencyHop('fe_send', {
        traceId,
        conversationId: activeConversationId,
        clientNowMs: clientSentAt,
      });
      const hasImages = draftAttachments.some((a) =>
        a.file.type.startsWith('image/'),
      );
      const forwardSnap = options?.forwardedFrom ?? null;
      const optimisticBody =
        trimmedBody ||
        (forwardSnap
          ? forwardSnap.body || 'Chuyển tiếp tin nhắn'
          : '') ||
        (hasImages ? 'Hình ảnh' : 'Đang gửi tệp...');
      const mentionIds = Array.from(
        new Set((options?.mentionIds ?? []).map((id) => Number(id))),
      ).filter((id) => Number.isFinite(id) && id > 0);
      const mentions = (activeConversation?.participants ?? []).filter(
        (participant) => mentionIds.includes(Number(participant.id)),
      );
      const optimisticMessage: ChatMessage = {
        id: nextOptimisticMessageId(),
        conversationId: activeConversationId,
        body: forwardSnap
          ? trimmedBody
          : trimmedBody || optimisticBody,
        clientMessageId,
        traceId,
        sentAt: new Date().toISOString(),
        attachments: [],
        replyTo: forwardSnap ? null : (options?.replyTo ?? null),
        forwardedFrom: forwardSnap,
        mentions,
        sender: {
          id: currentUser.id,
          username: currentUser.username,
          fullName: currentUser.full_name || currentUser.username,
        },
        status: 'pending',
      };

      updateLatestMessagesPage(activeConversationId, (page) => ({
        messages: [...(page.messages ?? []), optimisticMessage],
        hasMore: page.hasMore,
      }));

      try {
        let attachments: SendMessageAttachmentPayload[] = [];
        if (draftAttachments.length > 0) {
          const presignResponse = await chatApi.presignAttachments({
            conversationId: activeConversationId,
            files: draftAttachments.map((item) => ({
              clientFileId: item.id,
              name: item.file.name,
              mimeType: item.file.type || 'application/octet-stream',
              size: item.file.size,
            })),
          });

          attachments = await Promise.all(
            presignResponse.items.map(async (item) => {
              const draft = draftAttachments.find(
                (value) => value.id === item.clientFileId,
              );
              if (!draft) {
                throw new Error('Missing draft attachment for upload.');
              }

              await uploadToSignedUrl(item.uploadUrl, draft.file, item.headers);

              return {
                clientFileId: item.clientFileId,
                objectKey: item.objectKey,
                mimeType: draft.file.type || 'application/octet-stream',
                size: draft.file.size,
                originalName: draft.file.name,
              };
            }),
          );
        }

        const response = await sendMessageMutation.mutateAsync({
          conversationId: activeConversationId,
          body: trimmedBody,
          clientMessageId,
          traceId,
          clientSentAt,
          replyToMessageId: forwardSnap ? undefined : options?.replyTo?.id,
          forwardedFromMessageId: forwardSnap?.id,
          mentions: mentionIds,
          attachments,
        });

        logLatencyHop('fe_ack', {
          traceId,
          conversationId: activeConversationId,
          messageId: response.message.id,
          clientNowMs: Date.now(),
        });

        updateLatestMessagesPage(activeConversationId, (page) => ({
            messages: (page.messages ?? []).map((item) =>
              item.clientMessageId === clientMessageId
                ? { ...normalizeMessage(response.message), status: 'sent' }
                : item,
            ),
            hasMore: page.hasMore,
          }));

        queryClient.setQueryData<{ conversations: ChatConversation[] }>(
          ['chat', 'conversations'],
          (prev) => ({
            conversations: (prev?.conversations ?? []).map((conversation) =>
              conversation.id !== activeConversationId
                ? conversation
                : {
                    ...conversation,
                    hasUnread: false,
                    hasUnreadMention: false,
                    latestMessage: {
                      id: response.message.id,
                      body: conversationListPreviewBody(
                        normalizeMessage(response.message),
                      ),
                      sentAt: response.message.sentAt,
                      sender: {
                        id: response.message.sender.id,
                        username: response.message.sender.username,
                        fullName: response.message.sender.fullName,
                      },
                    },
                  },
            ),
          }),
        );

        if (
          response.message.attachments &&
          response.message.attachments.length > 0
        ) {
          void queryClient.invalidateQueries({
            queryKey: ['chat', 'attachments', activeConversationId],
          });
        }
      } catch {
        updateLatestMessagesPage(activeConversationId, (page) => ({
            messages: (page.messages ?? []).map((item) =>
              item.clientMessageId === clientMessageId
                ? { ...item, status: 'failed' }
                : item,
            ),
            hasMore: page.hasMore,
          }));
      }
    },
    [
      activeConversation,
      activeConversationId,
      currentUser,
      normalizeMessage,
      queryClient,
      sendMessageMutation,
      uploadToSignedUrl,
    ],
  );

  const selectConversation = useCallback(
    (conversationId: number) => {
      setActiveConversationId(conversationId);
      queryClient.setQueryData<{ conversations: ChatConversation[] }>(
        ['chat', 'conversations'],
        (prev) => ({
          conversations: (prev?.conversations ?? []).map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, hasUnread: false, hasUnreadMention: false }
              : conversation,
          ),
        }),
      );
    },
    [queryClient, setActiveConversationId],
  );

  const loadOlderMessages = useCallback(async () => {
    if (
      !activeConversationId ||
      isLoadingOlderMessages ||
      !hasMoreMessages
    ) {
      return;
    }
    await messagesQuery.fetchNextPage();
  }, [
    activeConversationId,
    hasMoreMessages,
    isLoadingOlderMessages,
    messagesQuery,
  ]);

  const openConversationByUsername = useCallback(
    async (username: string) => {
      const normalized = username.trim();
      if (!normalized) {
        return false;
      }

      try {
        const response =
          await openDirectConversationMutation.mutateAsync(normalized);
        const conversation = normalizeConversation(response.conversation);

        queryClient.setQueryData<{ conversations: ChatConversation[] }>(
          ['chat', 'conversations'],
          (prev) => {
            const previousConversations = prev?.conversations ?? [];
            const withoutCurrent = previousConversations.filter(
              (item) => item.id !== conversation.id,
            );

            return { conversations: [conversation, ...withoutCurrent] };
          },
        );

        selectConversation(conversation.id);
        setError(null);
        return true;
      } catch {
        setError('Khong mo duoc tro chuyen truc tiep.');
        return false;
      }
    },
    [openDirectConversationMutation, queryClient, selectConversation, setError],
  );

  const createGroupConversation = useCallback(
    async (name: string, participantIds: number[]) => {
      const normalizedName = name.trim();
      const normalizedParticipantIds = Array.from(
        new Set(
          participantIds
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id > 0),
        ),
      );
      if (!normalizedName || normalizedParticipantIds.length === 0) {
        return;
      }

      try {
        const response = await createGroupConversationMutation.mutateAsync({
          name: normalizedName,
          participantIds: normalizedParticipantIds,
        });
        const conversation = normalizeConversation(response.conversation);

        queryClient.setQueryData<{ conversations: ChatConversation[] }>(
          ['chat', 'conversations'],
          (prev) => {
            const previousConversations = prev?.conversations ?? [];
            const withoutCurrent = previousConversations.filter(
              (item) => item.id !== conversation.id,
            );

            return { conversations: [conversation, ...withoutCurrent] };
          },
        );

        selectConversation(conversation.id);
        setError(null);
      } catch {
        setError('Khong tao duoc nhom chat.');
      }
    },
    [
      createGroupConversationMutation,
      queryClient,
      selectConversation,
      setError,
    ],
  );

  const isLoading =
    conversationsQuery.isPending ||
    (Boolean(activeConversationId) && messagesQuery.isPending);

  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    if (!latestMessage) {
      return;
    }

    const traceId =
      latestMessage.traceId ??
      latestMessage.clientMessageId ??
      String(latestMessage.id);
    logLatencyHop('fe_rendered', {
      traceId,
      conversationId: latestMessage.conversationId,
      messageId: latestMessage.id,
      clientNowMs: Date.now(),
    });
  }, [messages]);

  useEffect(() => {
    if (conversationsQuery.isError) {
      setError('Khong tai duoc danh sach hoi thoai.');
    } else if (messagesQuery.isError) {
      setError('Khong tai duoc lich su tin nhan.');
    } else {
      setError(null);
    }
  }, [conversationsQuery.isError, messagesQuery.isError, setError]);

  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ['chat', 'conversations'],
    });
  }, [queryClient]);

  const pinMessage = useCallback(
    async (messageId: number) => {
      if (!activeConversationId || !currentUser) return;

      const pinsKey = ['chat', 'pins', activeConversationId] as const;
      const previousPins =
        queryClient.getQueryData<{
          pins: import('@/Models/chat/types').PinnedMessage[];
        }>(pinsKey)?.pins ?? [];

      if (previousPins.some((p) => Number(p.message.id) === Number(messageId))) {
        return;
      }

      const pagesData = queryClient.getQueryData<InfiniteMessagesQueryData>([
        'chat',
        'messages',
        activeConversationId,
      ]);
      const sourceMessage = (pagesData?.pages ?? [])
        .flatMap((page) => page.messages ?? [])
        .find((item) => Number(item.id) === Number(messageId));

      if (!sourceMessage) {
        setError('Khong the ghim tin nhan.');
        return;
      }

      const optimisticPin: import('@/Models/chat/types').PinnedMessage = {
        pinnedAt: new Date().toISOString(),
        pinnedBy: {
          id: Number(currentUser.id),
          username: currentUser.username,
          fullName: currentUser.full_name || currentUser.username,
        },
        message: sourceMessage,
      };

      queryClient.setQueryData<{
        pins: import('@/Models/chat/types').PinnedMessage[];
      }>(pinsKey, (prev) => ({
        pins: [optimisticPin, ...(prev?.pins ?? [])].slice(0, 3),
      }));

      try {
        const response = await chatApi.pinMessage(
          activeConversationId,
          messageId,
        );
        const serverMessage = normalizeMessage(response.pin.message);

        queryClient.setQueryData<{
          pins: import('@/Models/chat/types').PinnedMessage[];
        }>(pinsKey, (prev) => {
          const pins = prev?.pins ?? [];
          return {
            pins: pins.map((pin) =>
              Number(pin.message.id) === Number(messageId)
                ? {
                    ...pin,
                    pinnedAt: response.pin.pinnedAt,
                    message: serverMessage,
                  }
                : pin,
            ),
          };
        });
      } catch (err: any) {
        queryClient.setQueryData<{
          pins: import('@/Models/chat/types').PinnedMessage[];
        }>(pinsKey, { pins: previousPins });
        setError(err.response?.data?.message || 'Khong the ghim tin nhan.');
      }
    },
    [activeConversationId, currentUser, normalizeMessage, queryClient, setError],
  );

  const unpinMessage = useCallback(
    async (messageId: number) => {
      if (!activeConversationId) return;

      const pinsKey = ['chat', 'pins', activeConversationId] as const;
      const previousPins =
        queryClient.getQueryData<{
          pins: import('@/Models/chat/types').PinnedMessage[];
        }>(pinsKey)?.pins ?? [];

      queryClient.setQueryData<{
        pins: import('@/Models/chat/types').PinnedMessage[];
      }>(pinsKey, {
        pins: previousPins.filter(
          (pin) => Number(pin.message.id) !== Number(messageId),
        ),
      });

      try {
        await chatApi.unpinMessage(activeConversationId, messageId);
      } catch (err: any) {
        queryClient.setQueryData<{
          pins: import('@/Models/chat/types').PinnedMessage[];
        }>(pinsKey, { pins: previousPins });
        setError(err.response?.data?.message || 'Khong thể bỏ ghim tin nhắn.');
      }
    },
    [activeConversationId, queryClient, setError],
  );

  const recallMessage = useCallback(
    async (messageId: number) => {
      if (!activeConversationId) return;
      updateMessageAcrossLoadedPages(
        activeConversationId,
        messageId,
        (item) => ({
          ...item,
          isRecalled: true,
          recalledAt: item.recalledAt ?? new Date().toISOString(),
          body: item.body?.trim() ? item.body : 'Tin nhắn đã được thu hồi',
          attachments: [],
        }),
      );
      try {
        const response = await chatApi.recallMessage(activeConversationId, messageId);
        const recalled = normalizeMessage(response.message);
        const recalledBody = recalled.body?.trim() || 'Tin nhắn đã được thu hồi';

        updateMessageAcrossLoadedPages(
          activeConversationId,
          recalled.id,
          (item) => ({
            ...recalled,
            status: item.status ?? 'sent',
            isRecalled: true,
            recalledAt: recalled.recalledAt ?? new Date().toISOString(),
            body: recalledBody,
            attachments: [],
          }),
        );

        queryClient.setQueryData<{ conversations: ChatConversation[] }>(
          ['chat', 'conversations'],
          (prev) => ({
            conversations: (prev?.conversations ?? []).map((conversation) =>
              conversation.id !== activeConversationId ||
              conversation.latestMessage?.id !== recalled.id
                ? conversation
                : {
                    ...conversation,
                    latestMessage: {
                      ...conversation.latestMessage,
                      body: recalledBody,
                    },
                  },
            ),
          }),
        );

        queryClient.setQueryData<{
          pins: import('@/Models/chat/types').PinnedMessage[];
        }>(['chat', 'pins', activeConversationId], (prev) => {
          const pins = prev?.pins ?? [];
          return {
            pins: pins.filter((p) => p.message.id !== recalled.id),
          };
        });
      } catch (err: any) {
        setError(err.response?.data?.message || 'Khong the thu hoi tin nhan.');
      }
    },
    [
      activeConversationId,
      normalizeMessage,
      queryClient,
      setError,
      updateMessageAcrossLoadedPages,
    ],
  );

  const updateGroupName = useCallback(
    async (name: string) => {
      if (!activeConversationId) return;
      try {
        await chatApi.updateGroupName(activeConversationId, name);
        // Optimistic update
        queryClient.setQueryData<{ conversations: ChatConversation[] }>(
          ['chat', 'conversations'],
          (prev) => {
            const previousConversations = prev?.conversations ?? [];
            return {
              conversations: previousConversations.map((c) =>
                c.id === activeConversationId ? { ...c, name: name.trim() } : c,
              ),
            };
          },
        );
      } catch (err: any) {
        setError(err.response?.data?.message || 'Không thể đổi tên nhóm.');
      }
    },
    [activeConversationId, queryClient, setError],
  );

  const updateGroupAvatar = useCallback(
    async (file: File) => {
      if (!activeConversationId) return;
      try {
        const formData = new FormData();
        formData.append('avatar', file);
        const { conversation } = await chatApi.updateGroupAvatar(
          activeConversationId,
          formData,
        );

        // Update local state
        queryClient.setQueryData<{ conversations: ChatConversation[] }>(
          ['chat', 'conversations'],
          (prev) => {
            const previousConversations = prev?.conversations ?? [];
            return {
              conversations: previousConversations.map((c) =>
                c.id === activeConversationId
                  ? { ...c, avatarUrl: conversation.avatarUrl }
                  : c,
              ),
            };
          },
        );
      } catch (err: any) {
        setError(
          err.response?.data?.message ||
            'Không thể cập nhật ảnh đại diện nhóm.',
        );
      }
    },
    [activeConversationId, queryClient, setError],
  );

  const deleteConversation = useCallback(
    async (conversationId: number) => {
      try {
        await chatApi.deleteConversation(conversationId);
        queryClient.setQueryData<{ conversations: ChatConversation[] }>(
          ['chat', 'conversations'],
          (prev) => {
            const newConversations = (prev?.conversations ?? []).filter(
              (c) => c.id !== conversationId,
            );
            if (activeConversationId === conversationId) {
              const nextConv =
                newConversations.length > 0 ? newConversations[0] : null;
              setActiveConversationId(nextConv?.id ?? -1);
            }
            return { conversations: newConversations };
          },
        );
      } catch (err: any) {
        setError(err.response?.data?.message || 'Không thể xóa hội thoại.');
      }
    },
    [activeConversationId, queryClient, setActiveConversationId, setError],
  );

  const removeGroupMember = useCallback(
    async (userId: number) => {
      if (!activeConversationId) return;
      try {
        const { conversation } = await chatApi.removeGroupMember(
          activeConversationId,
          userId,
        );

        queryClient.setQueryData<{ conversations: ChatConversation[] }>(
          ['chat', 'conversations'],
          (prev) => {
            const previousConversations = prev?.conversations ?? [];
            return {
              conversations: previousConversations.map((c) =>
                c.id === activeConversationId ? conversation : c,
              ),
            };
          },
        );
      } catch (err: any) {
        setError(
          err.response?.data?.message || 'Không thể xóa thành viên / rời nhóm.',
        );
      }
    },
    [activeConversationId, queryClient, setError],
  );

  const addGroupMembers = useCallback(
    async (userIds: number[]) => {
      if (!activeConversationId) return;
      try {
        const { conversation } = await chatApi.addGroupMembers(
          activeConversationId,
          userIds,
        );
        queryClient.setQueryData<{ conversations: ChatConversation[] }>(
          ['chat', 'conversations'],
          (prev) => {
            const previousConversations = prev?.conversations ?? [];
            return {
              conversations: previousConversations.map((c) =>
                c.id === activeConversationId
                  ? normalizeConversation(conversation)
                  : c,
              ),
            };
          },
        );
      } catch (err: any) {
        setError(
          err.response?.data?.message || 'Không thể thêm thành viên vào nhóm.',
        );
      }
    },
    [activeConversationId, queryClient, setError],
  );

  return useMemo(
    () => ({
      conversations,
      activeConversationId,
      messages,
      hasMoreMessages,
      isLoadingOlderMessages,
      pinnedMessages,
      attachments,
      isLoading:
        isLoading ||
        pinnedMessagesQuery.isLoading,
      error,
      createGroupConversation,
      openConversationByUsername,
      setActiveConversationId: selectConversation,
      sendMessage,
      loadOlderMessages,
      pinMessage,
      unpinMessage,
      recallMessage,
      updateGroupName,
      updateGroupAvatar,
      deleteConversation,
      removeGroupMember,
      addGroupMembers,
      updateMessageAcrossLoadedPages,
      jumpToMessage,
      notificationsEnabled,
      notificationPermission,
      toggleNotifications,
      reload,
    }),
    [
      conversations,
      activeConversationId,
      messages,
      hasMoreMessages,
      isLoadingOlderMessages,
      pinnedMessages,
      attachments,
      isLoading,
      error,
      createGroupConversation,
      openConversationByUsername,
      setActiveConversationId,
      sendMessage,
      loadOlderMessages,
      pinMessage,
      unpinMessage,
      recallMessage,
      updateGroupName,
      updateGroupAvatar,
      deleteConversation,
      removeGroupMember,
      addGroupMembers,
      updateMessageAcrossLoadedPages,
      jumpToMessage,
      notificationsEnabled,
      notificationPermission,
      toggleNotifications,
      reload,
    ],
  );
}
