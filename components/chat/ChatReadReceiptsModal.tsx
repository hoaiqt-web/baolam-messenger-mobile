import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import { chatApi } from '@/services/api/chatApi';
import type { ChatUserSummary } from '@/Models/chat/types';

type Props = {
  visible: boolean;
  conversationId: number;
  messageId: number;
  isDark: boolean;
  onClose: () => void;
};

export function ChatReadReceiptsModal({ visible, conversationId, messageId, isDark, onClose }: Props) {
  const { height } = useWindowDimensions();
  const [readers, setReaders] = useState<ChatUserSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible || messageId <= 0) return;
    setLoading(true);
    void chatApi
      .getMessageReadReceipts(conversationId, messageId)
      .then((res) => setReaders(Array.isArray(res.readers) ? res.readers : []))
      .catch(() => setReaders([]))
      .finally(() => setLoading(false));
  }, [visible, conversationId, messageId]);

  const bg = isDark ? '#121B2A' : '#FFFFFF';
  const text = isDark ? '#F8FAFC' : '#111827';
  const muted = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? '#334155' : '#E5E7EB';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: bg, borderColor: border, maxHeight: height * 0.72 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: text }]}>Đã xem bởi</Text>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#6366F1" />
            </View>
          ) : readers.length === 0 ? (
            <Text style={[styles.empty, { color: muted }]}>Chưa có ai xem tin nhắn này.</Text>
          ) : (
            <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
              {readers.map((u) => {
                const initial = (u.fullName || u.username || '?')[0]?.toUpperCase() ?? '?';
                return (
                  <View key={u.id} style={[styles.row, { borderBottomColor: border }]}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarTxt}>{initial}</Text>
                    </View>
                    <View>
                      <Text style={[styles.name, { color: text }]}>{u.fullName}</Text>
                      <Text style={[styles.un, { color: muted }]}>@{u.username}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
          <TouchableOpacity style={[styles.closeBtn, { borderColor: border }]} onPress={onClose}>
            <Text style={{ color: muted, fontWeight: '600' }}>Đóng</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 16, borderWidth: 1, padding: 16 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  center: { paddingVertical: 40, alignItems: 'center' },
  empty: { textAlign: 'center', paddingVertical: 28, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { color: '#FFF', fontWeight: '800' },
  name: { fontSize: 15, fontWeight: '700' },
  un: { fontSize: 12, marginTop: 2 },
  closeBtn: { marginTop: 8, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1 },
});
