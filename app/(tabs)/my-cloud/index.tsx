import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import ChatScreen from '@/app/chat/[id]';
import { chatApi } from '@/services/api/chatApi';
import {
  ChatPresentationExtrasContext,
  ChatRouteParamsOverrideContext,
} from '@/features/chat/ChatEmbedContext';
import { useRouter } from 'expo-router';
import { useAppTheme } from '@/contexts/ThemeContext';

/**
 * Tab Cloud — mặc định: hội thoại "Cloud của tôi" (giống web).
 * Màn tài liệu (/documents) mở từ nút folder trên header chat.
 */
export default function CloudTabChatScreen() {
  const router = useRouter();
  const { isDark } = useAppTheme();
  const [conv, setConv] = useState<{
    id: number;
    name: string;
    type: string;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { conversation } = await chatApi.openCloudConversation();
        if (!cancelled) {
          setConv({
            id: conversation.id,
            name: conversation.name?.trim()
              ? conversation.name
              : 'Cloud của tôi',
            type: conversation.type || 'cloud',
          });
        }
      } catch {
        if (!cancelled) setErr('Không mở được Cloud của tôi.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openDocuments = useCallback(() => {
    router.push('/my-cloud/documents' as import('expo-router').Href);
  }, [router]);

  if (err) {
    return (
      <View style={[styles.center, isDark && styles.centerDark]}>
        <Text style={[styles.err, isDark && styles.errDark]}>{err}</Text>
      </View>
    );
  }

  if (!conv) {
    return (
      <View style={[styles.center, isDark && styles.centerDark]}>
        <ActivityIndicator size="large" color={isDark ? '#00D9FF' : '#1E3A8A'} />
        <Text style={[styles.hint, isDark && styles.hintDark]}>Đang mở Cloud...</Text>
      </View>
    );
  }

  const override = {
    id: String(conv.id),
    name: conv.name,
    type: conv.type,
  };

  return (
    <ChatRouteParamsOverrideContext.Provider value={override}>
      <ChatPresentationExtrasContext.Provider
        value={{
          cloudTabDocumentsNav: { onOpenDocuments: openDocuments },
          hideHeaderBack: true,
        }}
      >
        <ChatScreen />
      </ChatPresentationExtrasContext.Provider>
    </ChatRouteParamsOverrideContext.Provider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F8FAFC',
  },
  centerDark: { backgroundColor: '#0B131F' },
  err: { fontSize: 16, color: '#B91C1C', textAlign: 'center' },
  errDark: { color: '#FCA5A5' },
  hint: { marginTop: 12, fontSize: 14, color: '#64748B' },
  hintDark: { color: '#94A3B8' },
});
