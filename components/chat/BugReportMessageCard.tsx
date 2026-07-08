import { useEffect, useState } from 'react';
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

import type { ChatMessage, BugReportLifecycle } from '@/Models/chat/types';
import { useAuthStore } from '@/features/auth/authStore';
import { httpClient } from '@/services/api/httpClient';

const IT_USER_IDS = [5, 23, 50, 52];

function findLineValue(lines: string[], prefix: string): string {
  const line = lines.find((l) => l.includes(prefix));
  if (!line) return '';
  const idx = line.indexOf(prefix);
  return line.slice(idx + prefix.length).trim().replace(/\*+/g, '').trim();
}

export function isBugReportMessage(body: string | null | undefined): boolean {
  return String(body ?? '').trim().startsWith('🐛');
}

const SEV_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  CRITICAL: { text: '#fca5a5', bg: 'rgba(239,68,68,0.18)', border: 'rgba(239,68,68,0.4)' },
  HIGH:     { text: '#fdba74', bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.35)' },
  MEDIUM:   { text: '#fde047', bg: 'rgba(234,179,8,0.15)',  border: 'rgba(234,179,8,0.35)' },
  LOW:      { text: '#86efac', bg: 'rgba(34,197,94,0.13)',  border: 'rgba(34,197,94,0.3)' },
};

type Props = {
  message: ChatMessage;
  currentUserId: number | null;
  isMine: boolean;
  isDark: boolean;
};

export function BugReportMessageCard({ message, currentUserId, isMine, isDark }: Props) {
  const authUser = useAuthStore((state) => state.user);
  const body = message.body ?? '';
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);

  const reporter = findLineValue(lines, '👤 Người báo:');
  const page = findLineValue(lines, '📍 Trang:');
  const issueType = findLineValue(lines, '🔖 Loại:');
  
  const descriptionMatch = body.match(/📝([\s\S]*)/);
  const description = descriptionMatch ? descriptionMatch[1].trim() : '';

  const severityLine = lines.find((l) => l.includes('Mức độ:')) ?? '';
  const severity = severityLine.includes('Mức độ:')
    ? severityLine.slice(severityLine.indexOf('Mức độ:') + 7).trim().replace(/\*+/g, '').trim()
    : '';

  const sev = SEV_COLORS[severity] ?? SEV_COLORS.HIGH;

  const [lc, setLc] = useState<BugReportLifecycle | null | undefined>(message.bug_report_lifecycle);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const busy = busyAction !== null;
  const [err, setErr] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (busyAction !== null) return;
    if (message.bug_report_lifecycle !== undefined) {
      setLc(message.bug_report_lifecycle);
    }
  }, [message.bug_report_lifecycle, busyAction]);

  const taskId = lc?.task_id;
  const isIT = currentUserId !== null && IT_USER_IDS.includes(currentUserId);

  async function callApi(
    path: string,
    actionName: string,
    applyOptimistic: () => void,
    onSuccess?: (data: unknown) => void,
    bodyData?: Record<string, unknown>,
  ) {
    if (!taskId || busy) return;
    const snapshot = lc;
    setBusyAction(actionName);
    setErr(null);
    applyOptimistic();
    try {
      const res = await httpClient.post(`/bug-reports/${taskId}/${path}`, bodyData);
      onSuccess?.(res.data);
    } catch (e: unknown) {
      setLc(snapshot);
      const errObj = e as { response?: { data?: { message?: string } } };
      setErr(errObj?.response?.data?.message ?? 'Lỗi, thử lại sau');
      throw e;
    } finally {
      setBusyAction(null);
    }
  }

  function handleAccept() {
    const displayName = authUser?.full_name || authUser?.username || '—';
    callApi('accept', 'accept', () => {
      setLc((prev: any) => prev ? {
        ...prev,
        accepted_by_user_id: currentUserId,
        accepted_by_name: displayName,
        accepted_at: new Date().toISOString(),
      } : prev);
    }, (data) => {
      const payload = data as { accepted_by_name?: string };
      const name = payload?.accepted_by_name;
      if (name) {
        setLc((prev: any) => prev ? { ...prev, accepted_by_name: name } : prev);
      }
    });
  }

  function handleRequestVerification() {
    callApi('request-verification', 'request', () => {
      setLc((prev: any) => prev ? { ...prev, verification_requested_at: new Date().toISOString() } : prev);
    });
  }

  function handleVerify() {
    callApi('verify', 'verify', () => {
      setLc((prev: any) => prev ? { ...prev, verified_at: new Date().toISOString() } : prev);
    });
  }

  async function handleRejectConfirm() {
    const reason = rejectReason.trim();
    if (reason.length < 2) {
      Alert.alert('Lỗi', 'Vui lòng nhập lý do từ chối (tối thiểu 2 ký tự).');
      return;
    }
    setRejectOpen(false);
    await callApi('reject', 'reject', () => {
      setLc((prev: any) => prev ? {
        ...prev,
        verification_requested_at: null,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
      } : prev);
    }, undefined, { reason });
    setRejectReason('');
  }

  let lifecycleBlock = null;

  if (!lc) {
    // no lifecycle
  } else if (lc.verified_at) {
    lifecycleBlock = (
      <Text style={styles.verifiedText}>
        ✅ Đã nghiệm thu lúc {new Date(lc.verified_at).toLocaleString('vi-VN')}
      </Text>
    );
  } else if (lc.verification_requested_at) {
    lifecycleBlock = (
      <View style={styles.lifecycleActions}>
        <Text style={[styles.lifecycleStatusText, { color: isDark ? '#A7F3D0' : '#10B981' }]}>
          🔔 Đã sửa xong, chờ nghiệm thu
        </Text>
        {currentUserId === lc.reporter_user_id && (
          <View style={styles.btnRow}>
            <TouchableOpacity
              disabled={busy}
              onPress={handleVerify}
              style={[styles.btn, { backgroundColor: '#22c55e' }]}
            >
              <Text style={styles.btnTextBlack}>
                {busyAction === 'verify' ? '...' : '🎉 Nghiệm thu'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={busy}
              onPress={() => setRejectOpen(true)}
              style={[styles.btn, styles.btnOutline]}
            >
              <Text style={styles.btnTextRed}>
                {busyAction === 'reject' ? '...' : '❌ Không nghiệm thu'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  } else if (lc.accepted_at) {
    lifecycleBlock = (
      <View style={styles.lifecycleActions}>
        {lc.rejection_reason ? (
          <View style={[styles.rejectReasonBox, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
            <Text style={styles.rejectReasonTitle}>❌ Không nghiệm thu</Text>
            <Text style={[styles.rejectReasonBody, { color: isDark ? '#FCA5A5' : '#EF4444' }]}>
              Lý do: {lc.rejection_reason}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.lifecycleStatusText, { color: '#cbd5e1' }]}>
          🔧 Đang xử lý bởi: <Text style={{ color: '#fbbf24', fontWeight: 'bold' }}>{lc.accepted_by_name ?? '—'}</Text>
        </Text>
        {currentUserId === lc.accepted_by_user_id && (
          <TouchableOpacity
            disabled={busy}
            onPress={handleRequestVerification}
            style={[styles.btn, { backgroundColor: '#12d8f4' }]}
          >
            <Text style={styles.btnTextBlack}>
              {busyAction === 'request' ? '...' : '✅ Đề nghị nghiệm thu'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  } else {
    lifecycleBlock = isIT ? (
      <TouchableOpacity
        disabled={busy}
        onPress={handleAccept}
        style={[styles.btn, { backgroundColor: '#f97316' }]}
      >
        <Text style={styles.btnTextBlack}>
          {busyAction === 'accept' ? '...' : '🚀 Nhận Fix Bug'}
        </Text>
      </TouchableOpacity>
    ) : null;
  }

  const borderColors = isMine
    ? { border: 'rgba(239,68,68,0.3)', bg: '#240c0c' }
    : { border: 'rgba(239,68,68,0.25)', bg: '#1a0d0d' };

  return (
    <View style={[styles.card, { backgroundColor: borderColors.bg, borderColor: borderColors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>🐛</Text>
        <Text style={[styles.headerTitle, { color: sev.text }]}>Báo lỗi phần mềm</Text>
        {severity ? (
          <View style={[styles.badge, { backgroundColor: sev.bg, borderColor: sev.border }]}>
            <Text style={[styles.badgeText, { color: sev.text }]}>{severity}</Text>
          </View>
        ) : null}
      </View>

      {/* Fields */}
      <View style={styles.body}>
        {reporter ? (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Người báo</Text>
            <Text style={styles.fieldValue}>{reporter}</Text>
          </View>
        ) : null}
        {page ? (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Trang lỗi</Text>
            <Text style={styles.fieldValueMono}>{page}</Text>
          </View>
        ) : null}
        {issueType ? (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Loại vấn đề</Text>
            <Text style={styles.fieldValue}>{issueType}</Text>
          </View>
        ) : null}
        {description ? (
          <View style={styles.descBox}>
            <Text style={styles.fieldLabel}>Mô tả</Text>
            <Text style={styles.descText}>{description}</Text>
          </View>
        ) : null}
      </View>

      {/* Lifecycle block */}
      {lc !== undefined && lc !== null && (
        <View style={styles.lifecycleContainer}>
          {lifecycleBlock}
          {err && <Text style={styles.errorText}>{err}</Text>}
        </View>
      )}

      {/* Reject prompt modal */}
      <Modal visible={rejectOpen} transparent animationType="fade" onRequestClose={() => setRejectOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDark ? '#111A2E' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
            <Text style={[styles.modalTitle, { color: isDark ? '#FFF' : '#000' }]}>Không nghiệm thu</Text>
            <Text style={styles.modalSubTitle}>
              Vui lòng nhập lý do không nghiệm thu để người nhận việc biết cần chỉnh sửa gì.
            </Text>
            <TextInput
              style={[styles.modalInput, { color: isDark ? '#FFF' : '#000', borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? '#0b131f' : '#f3f4f6' }]}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Nhập lý do không nghiệm thu..."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={4}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setRejectOpen(false)}>
                <Text style={styles.modalBtnCancelText}>Hủy</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.15)', paddingBottom: 6 },
  headerEmoji: { fontSize: 16 },
  headerTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 },
  badge: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1.5 },
  badgeText: { fontSize: 9, fontWeight: '700' },
  body: { gap: 8 },
  field: { gap: 1 },
  fieldLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: 0.4 },
  fieldValue: { fontSize: 12, fontWeight: '600', color: '#f8fafc' },
  fieldValueMono: { fontSize: 11, fontFamily: 'monospace', color: '#22d3ee' },
  descBox: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.2)', padding: 8, gap: 4 },
  descText: { fontSize: 12, lineHeight: 17, color: '#e2e8f0' },
  lifecycleContainer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 8, gap: 4 },
  verifiedText: { fontSize: 11, fontStyle: 'italic', color: '#94a3b8' },
  lifecycleStatusText: { fontSize: 11, fontWeight: '600' },
  lifecycleActions: { gap: 6 },
  btnRow: { flexDirection: 'row', gap: 6 },
  btn: { height: 32, borderRadius: 6, justifyContent: 'center', alignItems: 'center', flex: 1 },
  btnOutline: { borderWidth: 1, borderColor: '#ef4444', backgroundColor: 'transparent' },
  btnTextBlack: { color: '#000', fontSize: 11, fontWeight: '700' },
  btnTextRed: { color: '#ef4444', fontSize: 11, fontWeight: '700' },
  rejectReasonBox: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(239,68,68,0.2)', padding: 8, gap: 2 },
  rejectReasonTitle: { fontSize: 11, fontWeight: '700', color: '#f87171' },
  rejectReasonBody: { fontSize: 11, lineHeight: 15 },
  errorText: { color: '#ef4444', fontSize: 11, marginTop: 2 },
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 340, borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  modalSubTitle: { fontSize: 12, lineHeight: 17, color: '#94A3B8' },
  modalInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 13, textAlignVertical: 'top', height: 80 },
  modalButtons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  modalBtnCancel: { flex: 1, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancelText: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  modalBtnConfirm: { flex: 1, height: 36, backgroundColor: '#dc2626', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalBtnConfirmText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
