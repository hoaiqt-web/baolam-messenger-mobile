import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { chatApi } from '@/services/api/chatApi';
import { useAppTheme } from '@/contexts/ThemeContext';

export function AiAssistantHomeCard() {
  const { isDark } = useAppTheme();
  const router = useRouter();
  const [pending, setPending] = useState(0);

  const load = useCallback(() => {
    void chatApi
      .getMyTasks('assigned_to_me', null)
      .then((res) => {
        setPending(Number(res.summary?.pending ?? 0));
      })
      .catch(() => {
        setPending(0);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const border = isDark ? '#1e3e55' : '#E2E8F0';
  const bg = isDark ? '#152033' : '#FFFFFF';
  const textTitle = isDark ? '#F8FAFC' : '#111827';
  const textSub = isDark ? '#CBD5E1' : '#475569';
  const accent = isDark ? '#00D9FF' : '#1E3A8A';

  return (
    <TouchableOpacity
      style={[styles.wrap, { borderColor: border, backgroundColor: bg }]}
      onPress={() => router.push('/ai-assistant')}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Mở trợ lý AI"
    >
      <View style={[styles.iconCircle, { backgroundColor: `${accent}18` }]}>
        <Ionicons name="hardware-chip-outline" size={22} color={accent} />
        {pending > 0 ? (
          <View
            style={[
              styles.badge,
              { borderColor: isDark ? '#152033' : '#FFFFFF' },
            ]}
          >
            <Text style={styles.badgeText}>{pending > 99 ? '99+' : pending}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.textCol}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: textTitle }]}>Trợ lý của bạn</Text>
          <View style={[styles.aiTag, { backgroundColor: `${accent}28` }]}>
            <Text style={[styles.aiTagText, { color: accent }]}>AI</Text>
          </View>
        </View>
        <Text style={[styles.sub, { color: textSub }]}>
          Bạn có{' '}
          <Text style={styles.greenCount}>
            {pending} nhiệm vụ
          </Text>{' '}
          đang chờ xử lý.
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
  },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  textCol: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 15, fontWeight: '700' },
  aiTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  aiTagText: { fontSize: 10, fontWeight: '800' },
  sub: { fontSize: 12, marginTop: 6, lineHeight: 18 },
  greenCount: { color: '#34D399', fontWeight: '800' },
});
