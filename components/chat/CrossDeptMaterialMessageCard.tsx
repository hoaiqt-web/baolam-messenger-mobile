import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '@/features/auth/authStore';
import { httpClient } from '@/services/api/httpClient';
import {
  pycvtRoleLabelColor,
  pycvtRolePersonColor,
  type PycvtTimelineEntry,
} from '@/features/chat/pycvtParsers';
import {
  getErpMessengerCardPalette,
  departmentStatusColors,
} from '@/features/chat/erpCardTheme';

const META_START = '[[CROSS_DEPT_MAT_META]]';
const META_END = '[[/CROSS_DEPT_MAT_META]]';
const MESSAGE_MARKER = 'ĐỀ XUẤT VẬT TƯ MỚI';

export type CrossDeptConfirmRole = 'PTK' | 'PKH';

export interface CrossDeptMaterialMeta {
  proposal_id?: string;
  header_title?: string;
  project_code?: string;
  project_name?: string;
  aggregate_status?: string;
  proposer_name?: string;
  proposer_dept?: string;
  material_name?: string;
  quantity_label?: string;
  unit?: string;
  category?: string;
  reason?: string;
  rejection_reason?: string;
  rejected_by?: string;
  rejected_role?: string;
  status_code?: string;
  confirm_role?: CrossDeptConfirmRole | '';
  is_actionable?: boolean;
  timeline?: PycvtTimelineEntry[];
}

export function parseCrossDeptMaterialMeta(body: string | null | undefined): CrossDeptMaterialMeta | null {
  const text = String(body ?? '');
  const start = text.indexOf(META_START);
  const end = text.indexOf(META_END, start);
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(text.slice(start + META_START.length, end)) as CrossDeptMaterialMeta;
  } catch {
    return null;
  }
}

export function stripCrossDeptMaterialMeta(body: string): string {
  const start = body.indexOf(META_START);
  if (start < 0) return body;
  const end = body.indexOf(META_END, start);
  if (end < 0) return body.slice(0, start).trimEnd();
  return (body.slice(0, start) + body.slice(end + META_END.length)).trimEnd();
}

export function isCrossDeptMaterialMessage(body: string | null | undefined): boolean {
  const raw = String(body ?? '');
  const parsed = parseCrossDeptMaterialMeta(raw);
  if (parsed?.proposal_id) return true;
  return stripCrossDeptMaterialMeta(raw).includes(MESSAGE_MARKER);
}

function resolveConfirmRole(meta: CrossDeptMaterialMeta | null): CrossDeptConfirmRole | null {
  if (meta?.confirm_role === 'PTK' || meta?.confirm_role === 'PKH') {
    return meta.confirm_role;
  }
  if (meta?.status_code === 'WAITING_PTK') return 'PTK';
  if (meta?.status_code === 'WAITING_PKH') return 'PKH';
  if (meta?.proposer_dept === 'PKH') return 'PTK';
  if (meta?.proposer_dept === 'PTK') return 'PKH';
  const agg = (meta?.aggregate_status ?? '').toUpperCase();
  if (agg.includes('CHỜ TP THIẾT KẾ') || agg.includes('CHỜ TP THIET KE')) return 'PTK';
  if (agg.includes('CHỜ TP KẾ HOẠCH') || agg.includes('CHỜ TP KE HOACH')) return 'PKH';
  return null;
}

function isProposalActionable(meta: CrossDeptMaterialMeta | null): boolean {
  if (!meta) return false;
  if (meta.is_actionable === false) return false;
  if (meta.is_actionable === true) return true;
  const status = (meta.status_code ?? '').toUpperCase();
  if (status === 'WAITING_PTK' || status === 'WAITING_PKH') return true;
  return resolveConfirmRole(meta) !== null;
}

function canUserActOnProposal(
  roleCode: string | undefined,
  department: string | undefined,
  confirmRole: CrossDeptConfirmRole,
): boolean {
  const role = (roleCode ?? '').toUpperCase();
  const dept = (department ?? '').toUpperCase();

  if (role === 'CEO' || role === 'ADMIN') {
    return true;
  }

  if (confirmRole === 'PTK') {
    return role === 'TP_THIETKE' || dept.includes('THIẾT KẾ') || dept.includes('THIET KE');
  }

  return role === 'TP_KEHOACH' || dept.includes('KẾ HOẠCH') || dept.includes('KE HOACH');
}

type Props = {
  body: string;
  isMine: boolean;
  isDark: boolean;
};

export function CrossDeptMaterialMessageCard({ body, isMine, isDark }: Props) {
  const user = useAuthStore((state) => state.user);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  
  const meta = useMemo(() => parseCrossDeptMaterialMeta(body), [body]);
  const palette = getErpMessengerCardPalette(isMine, 'emerald');

  if (!meta) return null;

  const status = meta.aggregate_status ?? '';
  const statusColors = departmentStatusColors(status, isDark);
  const timelineRows = meta.timeline ?? [];
  const confirmRole = resolveConfirmRole(meta);
  const canAct =
    isProposalActionable(meta) &&
    confirmRole !== null &&
    canUserActOnProposal(user?.role_code ?? undefined, user?.department ?? undefined, confirmRole);

  const borderColors = isMine
    ? { border: 'rgba(16,185,129,0.3)', bg: '#0a1d17' }
    : { border: 'rgba(139,92,246,0.25)', bg: '#140c21' };

  const handleConfirm = () => {
    if (!meta.proposal_id || !confirmRole) return;
    Alert.alert(
      'Duyệt đề xuất',
      `Bạn có chắc chắn muốn duyệt đề xuất vật tư «${meta.material_name ?? meta.proposal_id}» không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Duyệt',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              const { data } = await httpClient.post<{ success: boolean; message?: string }>(
                `/v1/cross-dept-material-proposals/${meta.proposal_id}/confirm`,
                { role: confirmRole },
              );
              if (data.success) {
                Alert.alert('Thành công', data.message || 'Đã duyệt thành công.');
              } else {
                Alert.alert('Thất bại', data.message || 'Không duyệt được.');
              }
            } catch (err: unknown) {
              const msg =
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
                'Đã xảy ra lỗi, vui lòng thử lại.';
              Alert.alert('Lỗi', msg);
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ],
    );
  };

  const handleRejectConfirm = async () => {
    if (!meta.proposal_id || !confirmRole) return;
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      Alert.alert('Lỗi', 'Lý do từ chối phải có ít nhất 3 ký tự.');
      return;
    }
    setRejectModalOpen(false);
    setIsSubmitting(true);
    try {
      const { data } = await httpClient.post<{ success: boolean; message?: string }>(
        `/v1/cross-dept-material-proposals/${meta.proposal_id}/reject`,
        { role: confirmRole, reason },
      );
      if (data.success) {
        Alert.alert('Thành công', data.message || 'Đã từ chối đề xuất.');
      } else {
        Alert.alert('Thất bại', data.message || 'Không từ chối được.');
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Đã xảy ra lỗi, vui lòng thử lại.';
      Alert.alert('Lỗi', msg);
    } finally {
      setIsSubmitting(false);
      setRejectReason('');
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: borderColors.bg, borderColor: borderColors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>🆕</Text>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.headerTitle, { color: palette.text }]}>
            {meta.header_title || 'Đề xuất vật tư mới'}
          </Text>
          {meta.project_code ? (
            <Text style={[styles.headerSub, { color: palette.textMuted }]}>
              {meta.project_code}
              {meta.project_name ? ` — ${meta.project_name}` : ''}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.body}>
        {/* Status */}
        {status ? (
          <View style={[styles.statusBox, { borderColor: statusColors.border, backgroundColor: statusColors.bg }]}>
            <Text style={[styles.statusLabel, { color: palette.textMuted }]}>TRẠNG THÁI</Text>
            <Text style={[styles.statusValue, { color: statusColors.text }]}>{status}</Text>
          </View>
        ) : null}

        {/* Material Details */}
        {meta.material_name ? (
          <View style={[styles.materialBox, { borderColor: palette.tableBorder }]}>
            <Text style={[styles.statusLabel, { color: palette.textMuted }]}>VẬT TƯ</Text>
            <Text style={[styles.materialName, { color: palette.text }]}>{meta.material_name}</Text>
            {meta.unit || meta.quantity_label ? (
              <Text style={[styles.materialQty, { color: '#fbbf24' }]}>
                ĐVT: {meta.unit || meta.quantity_label}
              </Text>
            ) : null}
            {meta.category ? (
              <Text style={[styles.materialQty, { color: '#67e8f9' }]}>Danh mục: {meta.category}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Timeline */}
        {timelineRows.length > 0 ? (
          <View style={[styles.table, { borderColor: palette.tableBorder }]}>
            <View style={[styles.tableHead, { backgroundColor: palette.tableHeadBg, borderBottomColor: palette.tableBorder }]}>
              <Text style={[styles.th, { width: 75, color: palette.tableHeadText, borderRightColor: palette.tableBorder, borderRightWidth: StyleSheet.hairlineWidth }]}>VAI TRÒ</Text>
              <Text style={[styles.th, { flex: 1, color: palette.tableHeadText, borderRightColor: palette.tableBorder, borderRightWidth: StyleSheet.hairlineWidth }]}>NGƯỜI PHỤ TRÁCH</Text>
              <Text style={[styles.th, { width: 44, color: palette.tableHeadText, textAlign: 'center', borderRightColor: palette.tableBorder, borderRightWidth: StyleSheet.hairlineWidth }]}>GIỜ</Text>
              <Text style={[styles.th, { width: 50, color: palette.tableHeadText, textAlign: 'center' }]}>NGÀY</Text>
            </View>
            {timelineRows.map((row, index) => (
              <View key={index} style={[styles.tableRow, { borderBottomColor: palette.tableBorder, borderBottomWidth: index === timelineRows.length - 1 ? 0 : StyleSheet.hairlineWidth }]}>
                <Text style={[styles.td, { width: 75, color: pycvtRoleLabelColor(row.role || ''), borderRightColor: palette.tableBorder, borderRightWidth: StyleSheet.hairlineWidth }]} numberOfLines={1}>
                  {row.role || '—'}
                </Text>
                <Text style={[styles.td, { flex: 1, color: pycvtRolePersonColor(row.role || ''), fontWeight: '700', borderRightColor: palette.tableBorder, borderRightWidth: StyleSheet.hairlineWidth }]} numberOfLines={1}>
                  {row.person || '—'}
                </Text>
                <Text style={[styles.td, { width: 44, color: palette.textMuted, textAlign: 'center', fontFamily: 'monospace', borderRightColor: palette.tableBorder, borderRightWidth: StyleSheet.hairlineWidth }]}>
                  {row.time || '—'}
                </Text>
                <Text style={[styles.td, { width: 50, color: palette.textMuted, textAlign: 'center', fontFamily: 'monospace' }]}>
                  {row.date || '—'}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Reason / Notes */}
        {meta.reason ? (
          <View style={[styles.noteBox, { backgroundColor: 'rgba(139,92,246,0.06)', borderColor: 'rgba(139,92,246,0.2)' }]}>
            <Text style={[styles.noteTitle, { color: '#a78bfa' }]}>💬 Ghi chú:</Text>
            <Text style={[styles.noteBody, { color: palette.text }]}>{meta.reason}</Text>
          </View>
        ) : null}

        {/* Rejection Reason */}
        {meta.rejection_reason ? (
          <View style={[styles.noteBox, { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }]}>
            <Text style={[styles.noteTitle, { color: '#f87171' }]}>
              ❌ Lý do từ chối{meta.rejected_role ? ` (${meta.rejected_role})` : ''}:
            </Text>
            <Text style={[styles.noteBody, { color: palette.text }]}>{meta.rejection_reason}</Text>
            {meta.rejected_by ? (
              <Text style={{ color: palette.textMuted, fontSize: 10, marginTop: 4 }}>
                Người từ chối: {meta.rejected_by}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Actions */}
        {canAct ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnConfirm]}
              disabled={isSubmitting}
              onPress={handleConfirm}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={styles.btnText}>Duyệt</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnReject]}
              disabled={isSubmitting}
              onPress={() => setRejectModalOpen(true)}
            >
              <Ionicons name="close-circle-outline" size={16} color="#ef4444" style={{ marginRight: 4 }} />
              <Text style={[styles.btnText, { color: '#ef4444' }]}>Từ chối</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {/* Reject Reason Modal Dialog */}
      <Modal visible={rejectModalOpen} transparent animationType="fade" onRequestClose={() => setRejectModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDark ? '#111A2E' : '#FFFFFF', borderColor: palette.tableBorder }]}>
            <Text style={[styles.modalTitle, { color: isDark ? '#FFF' : '#000' }]}>Không duyệt đề xuất</Text>
            <Text style={[styles.modalSubTitle, { color: palette.textMuted }]}>
              Vui lòng nhập lý do không duyệt đề xuất vật tư để người gửi biết cần chỉnh sửa gì.
            </Text>
            <TextInput
              style={[styles.modalInput, { color: palette.text, borderColor: palette.tableBorder, backgroundColor: isDark ? '#0b131f' : '#f3f4f6' }]}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Nhập lý do từ chối..."
              placeholderTextColor={palette.textMuted}
              multiline
              numberOfLines={4}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setRejectModalOpen(false)}>
                <Text style={[styles.modalBtnCancelText, { color: palette.textMuted }]}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnConfirm} onPress={handleRejectConfirm}>
                <Text style={styles.modalBtnConfirmText}>Xác nhận</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, maxWidth: '100%', width: '100%', minWidth: 260, alignSelf: 'stretch', padding: 12, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  headerEmoji: { fontSize: 18 },
  headerTextWrap: { flex: 1, minWidth: 0, gap: 2 },
  headerTitle: { fontSize: 14, fontWeight: '800', lineHeight: 20 },
  headerSub: { fontSize: 12 },
  body: { gap: 8 },
  statusBox: { borderRadius: 8, borderWidth: 1, padding: 8, gap: 2 },
  statusLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },
  statusValue: { fontSize: 12, fontWeight: '800' },
  materialBox: { borderRadius: 8, borderWidth: 1, padding: 8, gap: 2, backgroundColor: 'rgba(0,0,0,0.1)' },
  materialName: { fontSize: 13, fontWeight: '700' },
  materialQty: { fontSize: 11, fontWeight: '600' },
  table: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  tableHead: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  tableRow: { flexDirection: 'row', paddingVertical: 4 },
  th: { fontSize: 9, fontWeight: '700', paddingHorizontal: 4 },
  td: { fontSize: 10, paddingHorizontal: 4 },
  noteBox: { borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, padding: 8 },
  noteTitle: { fontSize: 11, fontWeight: '700' },
  noteBody: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  btn: { flex: 1, height: 36, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnConfirm: { backgroundColor: '#059669' },
  btnReject: { borderWidth: 1, borderColor: '#ef4444', backgroundColor: 'transparent' },
  btnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 340, borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  modalSubTitle: { fontSize: 12, lineHeight: 17 },
  modalInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 13, textAlignVertical: 'top', height: 80 },
  modalButtons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  modalBtnCancel: { flex: 1, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancelText: { fontSize: 13, fontWeight: '600' },
  modalBtnConfirm: { flex: 1, height: 36, backgroundColor: '#dc2626', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalBtnConfirmText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
