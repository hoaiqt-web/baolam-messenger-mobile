import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { httpClient } from '../api/httpClient';

// Configure how notifications appear when app is in foreground.
// Only register the handler outside Expo Go because expo-notifications
// removed push support from Expo Go in SDK 53 and the bare import
// triggers a noisy red Console Error banner otherwise.
if (Constants.appOwnership !== 'expo') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Request permission and register for push notifications.
 * Sends the Expo push token to the backend for storage.
 * NOTE: Push notifications are NOT supported in Expo Go since SDK 53.
 *       This only works in development builds (expo-dev-client) or production.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Skip in Expo Go — push notifications removed since SDK 53
  const isExpoGo = Constants.appOwnership === 'expo';
  if (isExpoGo) {
    console.log('Push notifications skipped (Expo Go not supported since SDK 53)');
    return null;
  }

  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Check existing permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request if not granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  // Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Tin nhắn',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1E3A8A',
    });
  }

  // Get Expo push token
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenData.data;
    console.log('Expo push token:', pushToken);

    // Send token to backend
    await httpClient.post('/users/push-token', {
      token: pushToken,
      platform: Platform.OS,
    });

    return pushToken;
  } catch (error: any) {
    // In Expo Go dev mode, projectId is not available — this is expected.
    // Push tokens will work after EAS Build with proper app.json config.
    console.warn('Push token not available (dev mode):', error?.message || error);
    return null;
  }
}

/**
 * Add listeners for incoming notifications and tap actions.
 */
export function addNotificationListeners(
  onReceive?: (notification: Notifications.Notification) => void,
  onTap?: (response: Notifications.NotificationResponse) => void,
) {
  // Skip in Expo Go — all notification APIs removed since SDK 53
  if (Constants.appOwnership === 'expo') {
    return () => {}; // no-op cleanup
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

/**
 * Set badge count on app icon.
 */
export async function setBadgeCount(count: number) {
  // Skip in Expo Go — badge API removed since SDK 53
  if (Constants.appOwnership === 'expo') return;
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {
    // Silently fail on unsupported platforms
  }
}
