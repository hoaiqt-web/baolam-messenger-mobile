import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

export type DeleteGroupInfo = {
  conversationId: number;
  groupName: string;
  isOwner: boolean;
  messageCount: number;
  pendingTaskCount: number;
};

type Props = {
  visible: boolean;
  info: DeleteGroupInfo | null;
  isDeleting: boolean;
  isDark: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ChatDeleteGroupModal({
  visible,
  info,
  isDeleting,
  isDark,
  onConfirm,
  onClose,
}: Props) {
  const { height } = useWindowDimensions();
  const [step, setStep] = useState(1);
  const [typedName, setTypedName] = useState('');

  useEffect(() => {
    if (visible) {
      setStep(1);
      setTypedName('');
    }
  }, [visible]);

  if (!info) return null;

  const bg = isDark ? '#0f1923' : '#FFFFFF';
  const text = isDark ? '#F8FAFC' : '#111827';
  const muted = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? 'rgba(255,255,255,0.12)' : '#E5E7EB';

  const { groupName, messageCount, pendingTaskCount } = info;
  const tier = messageCount === 0 ? 1 : messageCount <= 20 ? 2 : 3;
  const hasHighRisk = tier === 3 || pendingTaskCount > 0;

  const canConfirm =
    tier === 1
      ? true
      : tier === 2
        ? step === 2
        : typedName.trim() === groupName.trim();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: bg, borderColor: border, maxHeight: height * 0.88 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollInner}>
            <View
              style={[
                styles.head,
                { backgroundColor: hasHighRisk ? (isDark ? '#450A0A88' : '#FEF2F2') : isDark ? '#42200688' : '#FFFBEB' },
              ]}
            >
              <Text style={[styles.headTitle, { color: text }]}>
                {tier === 1
                  ? 'Xác nhận xóa nhóm'
                  : tier === 2
                    ? 'Cảnh báo xóa nhóm'
                    : 'Xóa nhóm có dữ liệu'}
              </Text>
              <Text style={[styles.headSub, { color: muted }]} numberOfLines={2}>
                &quot;{groupName}&quot;
              </Text>
            </View>

            <View style={styles.statsRow}>
              <Text style={[styles.badge, messageCount === 0 ? styles.badgeNeutral : messageCount <= 20 ? styles.badgeWarn : styles.badgeDanger]}>
                {messageCount} tin nhắn
              </Text>
              {pendingTaskCount > 0 ? (
                <Text style={[styles.badge, styles.badgeDanger]}>{pendingTaskCount} task</Text>
              ) : null}
            </View>

            {tier === 1 ? (
              <Text style={[styles.body, { color: muted }]}>Nhóm chưa có tin nhắn — có thể xóa an toàn.</Text>
            ) : null}

            {tier === 2 && step === 1 ? (
              <Text style={[styles.body, { color: muted }]}>
                {messageCount} tin nhắn sẽ mất vĩnh viễn. Thao tác không hoàn tác.
              </Text>
            ) : null}

            {tier === 2 && step === 2 ? (
              <Text style={[styles.body, { color: '#D97706' }]}>⚠️ Xác nhận lần cuối — nhấn &quot;Xóa nhóm&quot;.</Text>
            ) : null}

            {tier === 3 ? (
              <>
                <Text style={[styles.body, { color: muted }]}>
                  Gõ chính xác tên nhóm để xác nhận:
                </Text>
                <TextInput
                  value={typedName}
                  onChangeText={setTypedName}
                  placeholder={groupName}
                  placeholderTextColor={muted}
                  style={[styles.input, { color: text, borderColor: border, backgroundColor: isDark ? '#1a2535' : '#F9FAFB' }]}
                />
              </>
            ) : null}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: border }]}>
            <TouchableOpacity style={[styles.btnGhost, { borderColor: border }]} onPress={onClose} disabled={isDeleting}>
              <Text style={{ color: muted, fontWeight: '600' }}>Hủy</Text>
            </TouchableOpacity>
            {tier === 2 && step === 1 ? (
              <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: '#D97706' }]} onPress={() => setStep(2)}>
                <Text style={styles.btnPrimaryText}>Tiếp tục</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.btnDanger, { opacity: !canConfirm || isDeleting ? 0.45 : 1 }]}
                onPress={onConfirm}
                disabled={!canConfirm || isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Xóa nhóm</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  scrollInner: { padding: 20, paddingBottom: 8 },
  head: { padding: 14, borderRadius: 12, marginBottom: 12 },
  headTitle: { fontSize: 17, fontWeight: '700' },
  headSub: { fontSize: 14, marginTop: 6 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  badge: { fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeNeutral: { backgroundColor: '#33415544', color: '#94A3B8' },
  badgeWarn: { backgroundColor: '#F59E0B33', color: '#D97706' },
  badgeDanger: { backgroundColor: '#EF444433', color: '#DC2626' },
  body: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  btnGhost: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  btnPrimary: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12 },
  btnDanger: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: '#DC2626' },
  btnPrimaryText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});
