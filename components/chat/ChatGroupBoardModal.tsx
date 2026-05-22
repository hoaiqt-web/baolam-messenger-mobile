import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import type { PinnedMessage } from '@/Models/chat/types';

type Props = {
  visible: boolean;
  pins: PinnedMessage[];
  isDark: boolean;
  onClose: () => void;
  onOpenMessage?: (messageId: number) => void;
};

export function ChatGroupBoardModal({ visible, pins, isDark, onClose, onOpenMessage }: Props) {
  const { height } = useWindowDimensions();
  const bg = isDark ? '#121B2A' : '#FFFFFF';
  const text = isDark ? '#F8FAFC' : '#111827';
  const muted = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? '#2C3E50' : '#E5E7EB';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: bg, maxHeight: height * 0.9 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.header, { borderBottomColor: border }]}>
            <Text style={[styles.title, { color: text }]}>Bảng tin nhóm</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={{ color: muted, fontSize: 22 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.tab, { color: '#6366F1' }]}>Ghi chú ({pins.length})</Text>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            {pins.length === 0 ? (
              <Text style={[styles.empty, { color: muted }]}>Chưa có ghi chú ghim.</Text>
            ) : null}
            {pins.map((pin) => {
              const body = pin.message?.body?.trim();
              const preview = body && body.length > 0 ? body : 'Hình ảnh / file đính kèm';
              const by = pin.pinnedBy?.fullName || pin.pinnedBy?.username || '';
              return (
                <TouchableOpacity
                  key={pin.message.id}
                  style={[styles.card, { borderColor: border, backgroundColor: isDark ? '#1E293B' : '#F9FAFB' }]}
                  activeOpacity={0.75}
                  onPress={() => onOpenMessage?.(pin.message.id)}
                >
                  <Text style={[styles.sender, { color: text }]} numberOfLines={1}>
                    {pin.message?.sender?.fullName || pin.message?.sender?.username || '—'}
                  </Text>
                  <Text style={[styles.preview, { color: text }]} numberOfLines={6}>
                    {preview}
                  </Text>
                  <Text style={[styles.meta, { color: muted }]}>
                    Người ghim: {by}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 17, fontWeight: '800' },
  tab: { fontSize: 13, fontWeight: '700', paddingHorizontal: 16, paddingTop: 12 },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 14 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  sender: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  preview: { fontSize: 14, lineHeight: 20 },
  meta: { fontSize: 11, marginTop: 8 },
});
