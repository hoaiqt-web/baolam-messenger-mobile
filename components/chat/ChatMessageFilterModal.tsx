import { useEffect, useState } from 'react';
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

type Member = { id: number; fullName?: string; full_name?: string; username?: string };

export type MessageListFilter = {
  filterUserId: number | null;
  filterDays: number | null;
  filterStartDate: string | null;
  filterEndDate: string | null;
};

type Props = {
  visible: boolean;
  members: Member[];
  currentUserId: number | null;
  filter: MessageListFilter;
  isDark: boolean;
  onApply: (f: MessageListFilter) => void;
  onClear: () => void;
  onClose: () => void;
};

const DAY_PRESETS: { label: string; days: number | null }[] = [
  { label: 'Không lọc ngày', days: null },
  { label: '1 ngày', days: 1 },
  { label: '7 ngày', days: 7 },
  { label: '30 ngày', days: 30 },
];

export function ChatMessageFilterModal({
  visible,
  members,
  currentUserId,
  filter,
  isDark,
  onApply,
  onClose,
  onClear,
}: Props) {
  const { height } = useWindowDimensions();
  const [userId, setUserId] = useState<number | null>(filter.filterUserId);
  const [days, setDays] = useState<number | null>(filter.filterDays);

  useEffect(() => {
    if (!visible) return;
    setUserId(filter.filterUserId);
    setDays(filter.filterDays);
  }, [visible, filter.filterUserId, filter.filterDays]);

  const bg = isDark ? '#121B2A' : '#FFFFFF';
  const text = isDark ? '#F8FAFC' : '#111827';
  const muted = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? '#334155' : '#E5E7EB';

  const others = members.filter((m) => Number(m.id) !== Number(currentUserId));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: bg, maxHeight: height * 0.88 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: text }]}>Lọc tin nhắn</Text>
          <Text style={[styles.section, { color: muted }]}>Theo người gửi</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <TouchableOpacity
              style={[styles.chip, { borderColor: border }, userId === null && styles.chipOn]}
              onPress={() => setUserId(null)}
            >
              <Text style={[styles.chipText, { color: userId === null ? '#FFF' : text }]}>Tất cả</Text>
            </TouchableOpacity>
            {others.map((m) => {
              const label = m.fullName || m.full_name || m.username || String(m.id);
              const on = userId === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.chip, { borderColor: border }, on && styles.chipOn]}
                  onPress={() => setUserId(m.id)}
                >
                  <Text style={[styles.chipText, { color: on ? '#FFF' : text }]} numberOfLines={1}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[styles.section, { color: muted }]}>Theo khoảng thời gian</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {DAY_PRESETS.map((p) => {
              const on = days === p.days;
              return (
                <TouchableOpacity
                  key={String(p.days)}
                  style={[styles.chip, { borderColor: border }, on && styles.chipOn]}
                  onPress={() => setDays(p.days)}
                >
                  <Text style={[styles.chipText, { color: on ? '#FFF' : text, fontSize: 13 }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.btnGhost, { borderColor: border }]} onPress={() => { onClear(); onClose(); }}>
              <Text style={{ color: muted, fontWeight: '700' }}>Xóa lọc</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnGo}
              onPress={() => {
                onApply({
                  filterUserId: userId,
                  filterDays: days,
                  filterStartDate: null,
                  filterEndDate: null,
                });
                onClose();
              }}
            >
              <Text style={{ color: '#FFF', fontWeight: '800' }}>Áp dụng</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  section: { fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
  },
  chipOn: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  chipText: { fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btnGhost: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  btnGo: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: '#1E3A8A' },
});
