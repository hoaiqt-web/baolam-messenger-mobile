import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';

import { useChatUiStore } from '@/features/chat/chatUiStore';

const SHARE_SCHEME = 'baolammessengermobile';

/**
 * Nhận share intent (Android gallery / …), lưu file vào store và đưa user về tab Tin nhắn để chọn hội thoại.
 */
function ShareIntentConsumer() {
  const { hasShareIntent, shareIntent, resetShareIntent, isReady } =
    useShareIntentContext();
  const setPendingOutgoingShare = useChatUiStore((s) => s.setPendingOutgoingShare);
  const router = useRouter();
  const lastHandledKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    if (!hasShareIntent) {
      lastHandledKeyRef.current = null;
      return;
    }
    const files = shareIntent.files;
    if (!files?.length) {
      return;
    }

    const key = files.map((f) => `${f.path}|${f.fileName}`).join(';;');
    if (lastHandledKeyRef.current === key) {
      return;
    }
    lastHandledKeyRef.current = key;

    setPendingOutgoingShare({
      files: files.map((f) => ({
        uri: f.path,
        mimeType: f.mimeType && f.mimeType.length > 0 ? f.mimeType : 'image/jpeg',
        name: f.fileName && f.fileName.length > 0 ? f.fileName : `shared-${Date.now()}.jpg`,
      })),
    });

    resetShareIntent(true);
    router.replace('/(tabs)' as Href);
  }, [hasShareIntent, isReady, resetShareIntent, router, setPendingOutgoingShare, shareIntent]);

  return null;
}

export function AppShareIntentProvider({ children }: { children: ReactNode }) {
  if (Platform.OS === 'web') {
    return children;
  }

  return (
    <ShareIntentProvider
      options={{
        scheme: SHARE_SCHEME,
        /** Giữ payload khi user chuyển app ngắn (mặc định true có thể xóa trước khi chọn chat). */
        resetOnBackground: false,
        disabled: false,
      }}
    >
      <ShareIntentConsumer />
      {children}
    </ShareIntentProvider>
  );
}
