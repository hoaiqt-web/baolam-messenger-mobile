import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

import { chatApi, type ConversationTask } from '@/services/api/chatApi';

const EVIDENCE_WARNING_KEY = 'disable_evidence_warning';

function toUtcDate(dateString: string | undefined | null): Date {
  if (!dateString) return new Date(0);
  const s = String(dateString).trim();
  const hasOffset = s.endsWith('Z') || /[+\-]\d{2}:?\d{2}$/.test(s);
  return new Date(hasOffset ? s : `${s}Z`);
}

function sortTasks(raw: ConversationTask[]): ConversationTask[] {
  const next = [...raw];
  next.sort((a, b) => {
    const priority: Record<string, number> = { PENDING: 0, DONE: 1, REJECTED: 2 };
    const pa = priority[a.status] ?? 99;
    const pb = priority[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    const tA = toUtcDate(a.source_message?.sent_at || a.created_at).getTime();
    const tB = toUtcDate(b.source_message?.sent_at || b.created_at).getTime();
    return tB - tA;
  });
  return next;
}

function personName(
  u?: { full_name?: string; fullName?: string } | null,
): string {
  if (!u) return '';
  return String(u.full_name ?? u.fullName ?? '').trim();
}

export type TaskChecklistModalProps = {
  visible: boolean;
  onClose: () => void;
  conversationId: number;
  currentUserId: number | null;
  /** Bump from Reverb `.task.updated` to refetch while sheet is open. */
  remoteRefreshTick: number;
  onJumpToMessage: (messageId: number) => void | Promise<void>;
  isDark: boolean;
  onForceScanSuccess?: () => void;
};

export function TaskChecklistModal({
  visible,
  onClose,
  conversationId,
  currentUserId,
  remoteRefreshTick,
  onJumpToMessage,
  isDark,
  onForceScanSuccess,
}: TaskChecklistModalProps) {
  const { height: screenHeight } = Dimensions.get('window');
  const [tasks, setTasks] = useState<ConversationTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [ruleFeedback, setRuleFeedback] = useState<{
    title: string;
    missing: string[];
  } | null>(null);
  const [evidenceTask, setEvidenceTask] = useState<ConversationTask | null>(
    null,
  );
  const [disableEvidenceFuture, setDisableEvidenceFuture] = useState(false);
  const [isWarningDisabled, setIsWarningDisabled] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const v = await AsyncStorage.getItem(EVIDENCE_WARNING_KEY);
        setIsWarningDisabled(v === 'true');
      } catch {
        setIsWarningDisabled(false);
      }
    })();
  }, []);

  const loadTasks = useCallback(async () => {
    if (!Number.isFinite(conversationId) || conversationId <= 0) return;
    setLoading(true);
    try {
      const data = await chatApi.getConversationTasks(conversationId);
      const list = Array.isArray(data.tasks) ? data.tasks : [];
      setTasks(sortTasks(list as ConversationTask[]));
    } catch (e) {
      console.warn('[TaskChecklist] fetch failed', e);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (visible) {
      void loadTasks();
    }
  }, [visible, loadTasks, remoteRefreshTick]);

  const runTransition = async (taskId: number, action: string) => {
    setActionId(taskId);
    try {
      const result = await chatApi.transitionTask(taskId, action);
      if (result.success) {
        await loadTasks();
      } else {
        const r = result as Record<string, unknown>;
        const missingRaw =
          r.missingConditions ?? r.missing_conditions ?? r.missing;
        const missing = Array.isArray(missingRaw)
          ? (missingRaw as string[])
          : undefined;
        const task = tasks.find((t) => t.id === taskId);
        if (missing?.length) {
          setRuleFeedback({
            title: task?.task_title || 'Công việc',
            missing,
          });
        } else if (result.message || result.error) {
          Alert.alert(
            'Thông báo',
            String(result.message || result.error || 'Không thể cập nhật.'),
          );
        }
      }
    } catch (e: any) {
      const missing = e?.response?.data?.missingConditions;
      const task = tasks.find((t) => t.id === taskId);
      if (Array.isArray(missing) && missing.length > 0) {
        setRuleFeedback({
          title: task?.task_title || 'Công việc',
          missing,
        });
      } else {
        Alert.alert(
          'Lỗi',
          String(
            e?.response?.data?.error ||
              e?.response?.data?.message ||
              'Có lỗi khi cập nhật task.',
          ),
        );
      }
    } finally {
      setActionId(null);
    }
  };

  const handleMarkDone = (task: ConversationTask) => {
    if (task.status === 'DONE' || task.status === 'REJECTED') return;
    const assigneeId = task.assigned_to_user_id ?? null;
    const isAssignee =
      assigneeId != null &&
      currentUserId != null &&
      Number(assigneeId) === Number(currentUserId);
    const isPendingReview = task.approval_status === 'PENDING_REVIEW';
    if (isAssignee && !isPendingReview && !isWarningDisabled) {
      setDisableEvidenceFuture(false);
      setEvidenceTask(task);
      return;
    }
    void runTransition(task.id, 'DONE');
  };

  const confirmEvidenceDone = async () => {
    const t = evidenceTask;
    if (!t) return;
    if (disableEvidenceFuture) {
      try {
        await AsyncStorage.setItem(EVIDENCE_WARNING_KEY, 'true');
      } catch {
        // non-fatal
      }
      setIsWarningDisabled(true);
    }
    setEvidenceTask(null);
    await runTransition(t.id, 'DONE');
  };

  const openTaskMenu = (task: ConversationTask) => {
    const buttons: {
      text: string;
      style?: 'cancel' | 'destructive' | 'default';
      onPress?: () => void;
    }[] = [];

    if (task.source_message_id) {
      buttons.push({
        text: 'Xem tin nhắn gốc',
        onPress: () => {
          onClose();
          void onJumpToMessage(Number(task.source_message_id));
        },
      });
    }

    if (task.status !== 'DONE' && task.status !== 'REJECTED') {
      buttons.push({
        text: 'Từ chối công việc',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Xác nhận',
            'Từ chối công việc này?',
            [
              { text: 'Hủy', style: 'cancel' },
              {
                text: 'Từ chối',
                style: 'destructive',
                onPress: () => void runTransition(task.id, 'REJECT'),
              },
            ],
          );
        },
      });
    }

    buttons.push({ text: 'Đóng', style: 'cancel' });

    Alert.alert(task.task_title || 'Công việc', undefined, buttons);
  };

  const handleForceScan = async () => {
    setScanning(true);
    try {
      await chatApi.forceScan();
      onForceScanSuccess?.();
      Alert.alert('Thành công', 'Đã gửi yêu cầu quét AI.');
    } catch (e: any) {
      Alert.alert(
        'Lỗi quét AI',
        String(e?.response?.data?.message || e?.message || e),
      );
    } finally {
      setScanning(false);
    }
  };

  const bgOverlay = isDark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.4)';
  const sheetBg = isDark ? '#121B2A' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#111827';
  const textSecondary = isDark ? '#9CA3AF' : '#6B7280';
  const borderCol = isDark ? '#1e3e55' : '#E5E7EB';
  const accent = isDark ? '#00D9FF' : '#1E3A8A';

  const renderTask = ({ item: task }: { item: ConversationTask }) => {
    const done = task.status === 'DONE';
    const rejected = task.status === 'REJECTED';
    const pending = task.status === 'PENDING';
    const busy = actionId === task.id;
    const showEvidenceHint =
      task.status === 'PENDING' &&
      task.approval_status !== 'PENDING_REVIEW' &&
      !isWarningDisabled;

    const onCompletePress = () => handleMarkDone(task);

    return (
      <View style={[styles.row, { borderColor: borderCol }]}>
        <TouchableOpacity
          onPress={onCompletePress}
          disabled={done || rejected || busy}
          style={styles.rowIconBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Đánh dấu hoàn thành"
        >
          {busy ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <Ionicons
              name={done ? 'checkbox' : 'square-outline'}
              size={22}
              color={done ? '#10B981' : rejected ? '#EF4444' : accent}
            />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.rowBody}
          onPress={() => openTaskMenu(task)}
          activeOpacity={0.75}
        >
          <View style={styles.rowTitleLine}>
            <Text
              style={[
                styles.rowTitle,
                { color: textPrimary },
                done && styles.rowTitleDone,
              ]}
              numberOfLines={3}
            >
              {task.task_title}
            </Text>
            {showEvidenceHint ? (
              <Ionicons
                name="warning-outline"
                size={16}
                color="#F97316"
                style={{ marginLeft: 4 }}
              />
            ) : null}
          </View>
          <Text style={[styles.rowMeta, { color: textSecondary }]}>
            {(task.status === 'PENDING'
              ? 'Đang làm'
              : done
                ? 'Hoàn thành'
                : rejected
                  ? 'Từ chối'
                  : task.status) +
              (personName(task.assigned_to_user)
                ? ` · ${personName(task.assigned_to_user)}`
                : '')}
          </Text>
          {done && personName(task.confirmed_by_user) ? (
            <Text style={[styles.rowSmall, { color: '#10B981' }]}>
              Xác nhận: {personName(task.confirmed_by_user)}
            </Text>
          ) : null}
        </TouchableOpacity>
        {pending && !rejected ? (
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={onCompletePress}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Hoàn thành công việc"
          >
            <Text style={styles.doneBtnText}>Hoàn thành</Text>
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={textSecondary} />
        )}
      </View>
    );
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <TouchableOpacity
          style={[styles.overlay, { backgroundColor: bgOverlay }]}
          activeOpacity={1}
          onPress={onClose}
        >
          <TouchableOpacity
            style={[
              styles.sheet,
              {
                backgroundColor: sheetBg,
                maxHeight: screenHeight * 0.85,
              },
            ]}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.header}>
              <Text style={[styles.headerTitle, { color: textPrimary }]}>
                Checklist công việc
              </Text>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  onPress={() => void loadTasks()}
                  style={styles.iconBtn}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={accent} />
                  ) : (
                    <Ionicons name="refresh" size={22} color={accent} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                  <Ionicons name="close" size={24} color={textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.toolbar, { borderColor: borderCol }]}>
              <TouchableOpacity
                style={[styles.scanBtn, { borderColor: accent }]}
                onPress={() => void handleForceScan()}
                disabled={scanning}
              >
                {scanning ? (
                  <ActivityIndicator size="small" color={accent} />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={18} color={accent} />
                    <Text style={[styles.scanBtnText, { color: accent }]}>
                      Quét AI ngay
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={[styles.count, { color: textSecondary }]}>
                {tasks.length} việc
              </Text>
            </View>

            {loading && tasks.length === 0 ? (
              <View style={styles.centerPad}>
                <ActivityIndicator size="large" color={accent} />
              </View>
            ) : tasks.length === 0 ? (
              <View style={styles.centerPad}>
                <Text style={[styles.empty, { color: textSecondary }]}>
                  Chưa có task nào.
                </Text>
              </View>
            ) : (
              <FlatList
                data={tasks}
                keyExtractor={(t) => String(t.id)}
                renderItem={renderTask}
                contentContainerStyle={styles.listPad}
                keyboardShouldPersistTaps="handled"
              />
            )}

            <TouchableOpacity style={styles.bottomClose} onPress={onClose}>
              <Text style={[styles.bottomCloseText, { color: textSecondary }]}>
                Đóng
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={!!ruleFeedback}
        transparent
        animationType="fade"
        onRequestClose={() => setRuleFeedback(null)}
      >
        <View style={[styles.dialogOverlay, { backgroundColor: bgOverlay }]}>
          <View style={[styles.dialogBox, { backgroundColor: sheetBg }]}>
            <Text style={[styles.dialogTitle, { color: '#F97316' }]}>
              Chưa thể hoàn thành
            </Text>
            <Text style={[styles.dialogBody, { color: textPrimary }]}>
              Để hoàn thành &quot;{ruleFeedback?.title}&quot;, cần đáp ứng:
            </Text>
            <ScrollView style={styles.dialogScroll}>
              {(ruleFeedback?.missing ?? []).map((m, i) => (
                <Text
                  key={i}
                  style={[styles.bullet, { color: textSecondary, borderColor: borderCol }]}
                >
                  • {m}
                </Text>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: accent }]}
              onPress={() => setRuleFeedback(null)}
            >
              <Text style={styles.primaryBtnText}>Đã hiểu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!evidenceTask}
        transparent
        animationType="fade"
        onRequestClose={() => setEvidenceTask(null)}
      >
        <View style={[styles.dialogOverlay, { backgroundColor: bgOverlay }]}>
          <View style={[styles.dialogBox, { backgroundColor: sheetBg }]}>
            <Text style={[styles.dialogTitle, { color: '#F97316' }]}>
              Cảnh báo thiếu bằng chứng
            </Text>
            <Text style={[styles.dialogBody, { color: textPrimary }]}>
              AI chưa thấy bằng chứng hoàn thành cho:
            </Text>
            <Text
              style={[
                styles.evidenceQuote,
                { color: textPrimary, borderColor: borderCol },
              ]}
            >
              {evidenceTask?.task_title}
            </Text>
            <Text style={[styles.dialogBody, { color: textSecondary }]}>
              Bạn có chắc muốn báo cáo hoàn thành?
            </Text>
            <View style={styles.switchRow}>
              <Switch
                value={disableEvidenceFuture}
                onValueChange={setDisableEvidenceFuture}
              />
              <Text style={[styles.switchLabel, { color: textSecondary }]}>
                Tắt cảnh báo này sau này
              </Text>
            </View>
            <View style={styles.dialogActions}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: borderCol }]}
                onPress={() => setEvidenceTask(null)}
              >
                <Text style={{ color: textSecondary }}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: accent, flex: 1 }]}
                onPress={() => void confirmEvidenceDone()}
              >
                <Text style={styles.primaryBtnText}>Tiếp tục hoàn thành</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { padding: 8 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  scanBtnText: { fontWeight: '600', fontSize: 14 },
  count: { fontSize: 13 },
  listPad: { paddingHorizontal: 12, paddingBottom: 12 },
  centerPad: { paddingVertical: 40, alignItems: 'center' },
  empty: { fontSize: 14, fontStyle: 'italic' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  rowIconBtn: { marginRight: 8 },
  rowBody: { flex: 1, minWidth: 0 },
  doneBtn: {
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: '#059669',
    marginLeft: 6,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'flex-start' },
  rowTitle: { fontSize: 15, fontWeight: '600', flex: 1 },
  rowTitleDone: { textDecorationLine: 'line-through', opacity: 0.7 },
  rowMeta: { fontSize: 12, marginTop: 4 },
  rowSmall: { fontSize: 11, marginTop: 4 },
  bottomClose: { alignItems: 'center', paddingVertical: 8 },
  bottomCloseText: { fontSize: 14 },
  dialogOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialogBox: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 14,
    padding: 18,
  },
  dialogTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  dialogBody: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  dialogScroll: { maxHeight: 220, marginVertical: 8 },
  bullet: {
    fontSize: 13,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  primaryBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  evidenceQuote: {
    fontSize: 14,
    fontStyle: 'italic',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 8,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  switchLabel: { flex: 1, fontSize: 13 },
  dialogActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
  },
});
