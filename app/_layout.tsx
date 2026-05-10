import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { I18nManager, LogBox } from 'react-native';
import { useEffect } from 'react';
import 'react-native-reanimated';

// Suppress the expo-notifications Console Error in Expo Go (SDK 53).
// Push notifications are only available in development/production builds,
// but the library emits an error on import — this is cosmetic only.
LogBox.ignoreLogs([
  'expo-notifications',
]);

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  registerForPushNotifications,
  addNotificationListeners,
} from '@/services/notifications/pushNotifications';

import { AppThemeProvider, useAppTheme } from '@/contexts/ThemeContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutInner() {
  const { isDark } = useAppTheme();
  const router = useRouter();

  // Register push notifications on app start
  useEffect(() => {
    registerForPushNotifications();

    const cleanup = addNotificationListeners(
      undefined, // onReceive: handled by notification handler
      (response) => {
        // When user taps a notification, navigate to the chat
        const data = response.notification.request.content.data;
        if (data?.conversationId) {
          router.push({
            pathname: '/chat/[id]',
            params: {
              id: String(data.conversationId),
              name: String(data.conversationName || 'Tin nhắn'),
              type: String(data.conversationType || 'direct'),
            },
          });
        }
      },
    );

    return cleanup;
  }, []);

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal"  options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="tasks/[id]" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  // Lock app to LTR to avoid accidental mirrored UI on simulator/device RTL mode.
  I18nManager.allowRTL(false);
  I18nManager.forceRTL(false);

  return (
    <AppThemeProvider>
      <RootLayoutInner />
    </AppThemeProvider>
  );
}
