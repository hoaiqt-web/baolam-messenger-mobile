import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { I18nManager, Text, TextInput } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

// Disable system font scaling globally – ensures our pixel-perfect sizes
// are never multiplied by Android accessibility font scale (often 1.15–1.3x).
// @ts-ignore – defaultProps is valid at runtime
if (Text.defaultProps == null) Text.defaultProps = {};
Text.defaultProps.allowFontScaling = false;
// @ts-ignore
if (TextInput.defaultProps == null) TextInput.defaultProps = {};
TextInput.defaultProps.allowFontScaling = false;
export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  // Lock app to LTR to avoid accidental mirrored UI on simulator/device RTL mode.
  I18nManager.allowRTL(false);
  I18nManager.forceRTL(false);
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
