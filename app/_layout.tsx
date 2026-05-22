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
  addNotificationListeners,
  navigateToChatFromNotificationData,
} from '@/services/notifications/pushNotifications';

import { AppThemeProvider, useAppTheme } from '@/contexts/ThemeContext';
import { AppShareIntentProvider } from '@/features/chat/AppShareIntentProvider';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutInner() {
  const { isDark } = useAppTheme();
  const router = useRouter();

  useEffect(() => {
    const cleanup = addNotificationListeners(
      undefined,
      (response) => {
        const data = response.notification.request.content.data as
          | Record<string, unknown>
          | undefined;
        if (data?.conversationId) {
          navigateToChatFromNotificationData(router, data);
        }
      },
    );

    return cleanup;
  }, [router]);

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="ai-assistant" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
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
      <AppShareIntentProvider>
        <RootLayoutInner />
      </AppShareIntentProvider>
    </AppThemeProvider>
  );
}
