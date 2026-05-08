import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import type { Router } from 'expo-router';

import { httpClient } from '../api/httpClient';

export const CHAT_MESSAGE_NOTIFICATION_DATA_TYPE = 'chat_message';

const PUSH_TOKEN_STORAGE_KEY = 'messenger.expo_push_token';
const PENDING_NOTIFICATION_NAV_KEY = 'messenger.pending_notification_nav';

export type ChatNotificationNavPayload = {
  conversationId: string;
  conversationName: string;
  conversationType: string;
};

// Configure how notifications appear when app is in foreground.
// Remote chat pushes are suppressed while active to avoid duplicate banners
// when combined with local/socket-driven notifications (plan: strategy A).
if (Constants.appOwnership !== 'expo') {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content
        .data as Record<string, unknown> | undefined;
      const type = data?.type != null ? String(data.type) : '';
      const isChatPush = type === CHAT_MESSAGE_NOTIFICATION_DATA_TYPE;
      const appActive = AppState.currentState === 'active';

      if (isChatPush && appActive) {
        return {
          shouldShowAlert: false,
          shouldPlaySound: false,
          shouldSetBadge: true,
          shouldShowBanner: false,
          shouldShowList: false,
        };
      }

      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    },
  });
}

function normalizeNavPayload(
  data: Record<string, unknown>,
): ChatNotificationNavPayload | null {
  const conversationId = data.conversationId != null ? String(data.conversationId) : '';
  if (!conversationId) {
    return null;
  }
  return {
    conversationId,
    conversationName:
      data.conversationName != null ? String(data.conversationName) : 'Tin nhắn',
    conversationType:
      data.conversationType != null ? String(data.conversationType) : 'direct',
  };
}

export function navigateToChatFromNotificationData(
  router: Router,
  data: Record<string, unknown>,
): void {
  const payload = normalizeNavPayload(data);
  if (!payload) {
    return;
  }
  router.push({
    pathname: '/chat/[id]',
    params: {
      id: payload.conversationId,
      name: payload.conversationName,
      type: payload.conversationType,
    },
  });
}

export async function persistPendingChatNotificationNav(
  data: Record<string, unknown>,
): Promise<void> {
  const payload = normalizeNavPayload(data);
  if (!payload) {
    return;
  }
  await AsyncStorage.setItem(PENDING_NOTIFICATION_NAV_KEY, JSON.stringify(payload));
}

export async function consumePendingChatNotificationNav(
  router: Router,
): Promise<void> {
  const raw = await AsyncStorage.getItem(PENDING_NOTIFICATION_NAV_KEY);
  if (!raw) {
    return;
  }
  await AsyncStorage.removeItem(PENDING_NOTIFICATION_NAV_KEY);
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    navigateToChatFromNotificationData(router, parsed);
  } catch {
    // ignore corrupt storage
  }
}

/** Cold open / resume: navigate if user opened the app from a chat notification. */
export async function processLaunchNotificationResponse(
  router: Router,
  options: { isAuthenticated: boolean },
): Promise<void> {
  if (Constants.appOwnership === 'expo') {
    return;
  }

  const response = await Notifications.getLastNotificationResponseAsync();
  const data = response?.notification.request.content
    .data as Record<string, unknown> | undefined;
  if (!data?.conversationId) {
    return;
  }

  if (!options.isAuthenticated) {
    await persistPendingChatNotificationNav(data);
    return;
  }

  navigateToChatFromNotificationData(router, data);
}

/**
 * Request permission and register for push notifications.
 * Sends the Expo push token to the backend for storage.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  const isExpoGo = Constants.appOwnership === 'expo';
  if (isExpoGo) {
    console.log('Push notifications skipped (Expo Go not supported since SDK 53)');
    return null;
  }

  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Tin nhắn',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1E3A8A',
    });
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenData.data;
    console.log('Expo push token:', pushToken);

    try {
      await httpClient.post('/users/push-token', {
        token: pushToken,
        platform: Platform.OS,
      });
      await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, pushToken);
    } catch (e: unknown) {
      console.warn('Failed to register push token with backend:', e);
    }

    return pushToken;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('Push token not available:', msg);
    return null;
  }
}

export async function unregisterPushTokenFromBackend(): Promise<void> {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  if (!token) {
    return;
  }
  try {
    await httpClient.delete('/users/push-token', { data: { token } });
  } catch {
    // best-effort
  }
  await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
}

export function addNotificationListeners(
  onReceive?: (notification: Notifications.Notification) => void,
  onTap?: (response: Notifications.NotificationResponse) => void,
) {
  if (Constants.appOwnership === 'expo') {
    return () => {};
  }

  const receiveSub = Notifications.addNotificationReceivedListener((notification) => {
    onReceive?.(notification);
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    onTap?.(response);
  });

  return () => {
    receiveSub.remove();
    responseSub.remove();
  };
}

/** Foreground inbox: show a local notification (remote chat banners are suppressed when active). */
export async function presentLocalChatMessageNotification(input: {
  conversationId: number;
  conversationName: string;
  conversationType: string;
  title: string;
  body: string;
  senderId: number;
  messageId: number;
  /** Non-mention group: quieter local banner */
  muted?: boolean;
}): Promise<void> {
  if (Constants.appOwnership === 'expo') {
    return;
  }

  const idStr = String(input.conversationId);
  await Notifications.scheduleNotificationAsync({
    identifier: `chat-thread-${idStr}`,
    content: {
      title: input.title,
      body: input.body,
      sound: input.muted ? undefined : 'default',
      data: {
        type: CHAT_MESSAGE_NOTIFICATION_DATA_TYPE,
        conversationId: idStr,
        senderId: String(input.senderId),
        messageId: String(input.messageId),
        conversationName: input.conversationName,
        conversationType: input.conversationType,
      },
    },
    trigger: null,
  });
}

export async function setBadgeCount(count: number) {
  if (Constants.appOwnership === 'expo') {
    return;
  }
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {
    // unsupported
  }
}
