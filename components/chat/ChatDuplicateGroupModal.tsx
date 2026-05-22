import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import type { ChatConversation } from '@/Models/chat/types';

type Props = {
  visible: boolean;
  existing: ChatConversation | null;
  isDark: boolean;
  onGoToExisting: (c: ChatConversation) => void;
  onEditSelection: () => void;
  onClose: () => void;
};

/**
 * Backend returns 409 DUPLICATE_GROUP when same owner + same member set exists.
 * "Tạo mới" thật sự cần đổi thành viên/tên — không có force API.
 */
export function ChatDuplicateGroupModal({
  visible,
  existing,
  isDark,
  onGoToExisting,
  onEditSelection,
  onClose,
}: Props) {
  const { height } = useWindowDimensions();
  if (!existing) return null;

  const bg = isDark ? '#0f1923' : '#FFFFFF';
  const text = isDark ? '#F8FAFC' : '#111827';
  const muted = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? 'rgba(0,217,255,0.25)' : '#BAE6FD';
  const memberCount = existing.participants?.length ?? 0;
  const initial = (existing.name ?? 'N').charAt(0).toUpperCase();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: bg, borderColor: border, maxHeight: height * 0.85 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: text }]}>Nhóm tương tự đã tồn tại</Text>
          <Text style={[styles.sub, { color: muted }]}>Cùng bạn sở hữu và cùng danh sách thành viên.</Text>

          <View style={[styles.card, { borderColor: border, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC' }]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.convName, { color: text }]} numberOfLines={1}>
                {existing.name || 'Nhóm không tên'}
              </Text>
              <Text style={[styles.meta, { color: muted }]}>{memberCount} thành viên</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.btnCyan} onPress={() => onGoToExisting(existing)}>
            <Text style={styles.btnCyanText}>Đi đến nhóm hiện có</Text>
          </TouchableOpacity>

          <View style={styles.row2}>
            <TouchableOpacity style={[styles.outline, { borderColor: border }]} onPress={onClose}>
              <Text style={{ color: muted, fontWeight: '600' }}>Đóng</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.outline, { borderColor: '#F59E0B' }]} onPress={onEditSelection}>
              <Text style={{ color: '#D97706', fontWeight: '600' }}>Chỉnh sửa & thử lại</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 20, borderWidth: 1, padding: 20 },
  title: { fontSize: 18, fontWeight: '800' },
  sub: { fontSize: 14, marginTop: 6, marginBottom: 14 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,217,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  convName: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2 },
  btnCyan: { backgroundColor: '#00D9FF', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  btnCyanText: { color: '#0a1628', fontWeight: '800', fontSize: 15 },
  row2: { flexDirection: 'row', gap: 10 },
  outline: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
});
