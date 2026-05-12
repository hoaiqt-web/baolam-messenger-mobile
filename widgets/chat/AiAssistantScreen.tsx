import { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { httpClient } from '@/services/api/httpClient';
import {
  chatApi,
  type ConversationTask,
  type MyTasksSummary,
} from '@/services/api/chatApi';
import type { ChatConversation } from '@/Models/chat/types';
import { ManualCreateTaskModal } from '@/widgets/chat/ManualCreateTaskModal';
import { useAppTheme } from '@/contexts/ThemeContext';

const EVIDENCE_WARNING_KEY = 'disable_evidence_warning';
const VN_TZ = 'Asia/Ho_Chi_Minh';

function toUtcDate(dateString: string | undefined | null): Date {
  if (!dateString) return new Date(0);
  const s = String(dateString).trim();
  const hasOffset = s.endsWith('Z') || /[+\-]\d{2}:?\d{2}$/.test(s);
  return new Date(hasOffset ? s : `${s}Z`);
}

function formatVN(dateString: string | undefined | null): string {
  if (!dateString) return '';
  try {
    return toUtcDate(dateString).toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: VN_TZ,
    });
  } catch {
    return '';
  }
}

function personName(
  u?: { full_name?: string; fullName?: string } | null,
): string {
  if (!u) return '';
  return String(u.full_name ?? u.fullName ?? '').trim();
}

function sourceSenderName(task: ConversationTask): string {
  return (
    personName(task.source_message?.sender) ||
    'AI tự động trích xuất'
  );
}

type TabKey = 'assigned' | 'created' | 'overdue';

function tabToFilter(tab: TabKey): string {
  if (tab === 'assigned') return 'assigned_to_me';
  if (tab === 'created') return 'created_by_me';
  return 'overdue';
}

function timeAgoShort(dateString: string | undefined | null): string {
  if (!dateString) return '';
  const date = toUtcDate(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Vừa xong';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return date.toLocaleDateString('vi-VN', { timeZone: VN_TZ });
}

/** Cùng rule với web TaskChecklistWidget: PENDING → DONE → REJECTED, rồi mới → cũ theo tin/created_at. */
function sortAiAssistantTasks(tasks: ConversationTask[]): ConversationTask[] {
  const out = [...tasks];
  out.sort((a, b) => {
    const priority = { PENDING: 0, DONE: 1, REJECTED: 2 } as const;
    const pa =
      priority[a.status as keyof typeof priority] ?? 99;
    const pb =
      priority[b.status as keyof typeof priority] ?? 99;
    if (a.status !== b.status) return pa - pb;
    const tA = toUtcDate(
      a.source_message?.sent_at || a.created_at,
    ).getTime();
    const tB = toUtcDate(
      b.source_message?.sent_at || b.created_at,
    ).getTime();
    return tB - tA;
  });
  return out;
}

type AiTaskRowProps = {
  task: ConversationTask;
  isDark: boolean;
  currentUserId: number | null;
  isWarningDisabled: boolean;
  completeLoadingId: number | null;
  overrideLoadingId: number | null;
  completionError?: { taskId: number; message: string } | null;
  onOpenChat: (conversationId: number, messageId: number) => void;
  onComplete: (task: ConversationTask) => void;
  onAiConfirm: (taskId: number) => void;
  onAiReject: (taskId: number) => void;
  onJumpEvidence: (conversationId: number, messageId: number) => void;
};

const AiTaskRow = memo(function AiTaskRow({
  task,
  isDark,
  currentUserId,
  isWarningDisabled,
  completeLoadingId,
  overrideLoadingId,
  completionError,
  onOpenChat,
  onComplete,
  onAiConfirm,
  onAiReject,
  onJumpEvidence,
}: AiTaskRowProps) {
  const accent = isDark ? '#00D9FF' : '#1E3A8A';
  const textPrimary = isDark ? '#F8FAFC' : '#111827';
  const textMuted = isDark ? '#94A3B8' : '#6B7280';
  const cardBg = isDark ? '#152033' : '#F8FAFC';
  const borderCol = isDark ? '#1e3e55' : '#E2E8F0';

  const done = task.status === 'DONE';
  const pending = task.status === 'PENDING';
  const senderId = task.source_message?.sender_id ?? task.source_message?.sender?.id;
  const canActComplete =
    currentUserId != null &&
    pending &&
    (Number(task.assigned_to_user_id) === Number(currentUserId) ||
      (senderId != null && Number(senderId) === Number(currentUserId)));

  const canOverrideAi =
    currentUserId != null &&
    task.confirmed_by_ai &&
    (Number(task.assigned_to_user_id) === Number(currentUserId) ||
      (senderId != null && Number(senderId) === Number(currentUserId)));

  const convId = task.conversation_id;
  const srcId = task.source_message_id;

  const showEvidenceHint =
    pending &&
    task.approval_status !== 'PENDING_REVIEW' &&
    !isWarningDisabled;

  const busyComplete = completeLoadingId === task.id;
  const busyOverride = overrideLoadingId === task.id;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: cardBg,
          borderColor: borderCol,
          opacity: done ? 0.85 : 1,
        },
      ]}
      onPress={() => {
        if (convId && srcId) {
          onOpenChat(Number(convId), Number(srcId));
        }
      }}
      activeOpacity={0.85}
      disabled={!convId || !srcId}
    >
      <View style={styles.cardTop}>
        <Ionicons
          name={done ? 'checkbox' : 'square-outline'}
          size={22}
          color={done ? '#10B981' : accent}
        />
        <View style={styles.cardTitleCol}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <Text
              style={[
                styles.cardTitle,
                { color: textPrimary },
                done && styles.cardTitleDone,
              ]}
              numberOfLines={4}
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
          <Text style={[styles.cardMeta, { color: textMuted }]}>
            Giao bởi:{' '}
            <Text style={{ color: textPrimary, fontWeight: '600' }}>
              {sourceSenderName(task)}
            </Text>
          </Text>
          <Text style={[styles.cardMeta, { color: textMuted }]}>
            Người nhận:{' '}
            <Text style={{ color: textPrimary, fontWeight: '600' }}>
              {personName(task.assigned_to_user) || 'Chưa xác định'}
            </Text>
          </Text>
          <Text style={[styles.cardMeta, { color: textMuted }]}>
            Tạo lúc:{' '}
            {formatVN(
              task.source_message?.sent_at ||
                task.source_message?.created_at ||
                task.created_at,
            )}
          </Text>

          {done && task.confirmed_by_user && !task.confirmed_by_ai ? (
            <Text style={styles.confirmedLine}>
              {personName(task.confirmed_by_user)} đã báo cáo hoàn thành (
              {timeAgoShort(task.updated_at)})
            </Text>
          ) : null}

          {task.confirmed_by_ai ? (
            <View style={styles.aiBanner}>
              <Ionicons name="sparkles" size={16} color="#C4B5FD" />
              <Text style={styles.aiBannerText}>
                AI phát hiện hoàn thành
                {task.completion_confidence != null
                  ? ` (${Math.round(Number(task.completion_confidence) * 100)}%)`
                  : ''}
              </Text>
              {task.completion_evidence_message_id && convId ? (
                <TouchableOpacity
                  onPress={() =>
                    onJumpEvidence(
                      Number(convId),
                      Number(task.completion_evidence_message_id),
                    )
                  }
                >
                  <Text style={styles.evidenceLink}>Bằng chứng</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {canOverrideAi ? (
            <View style={styles.overrideRow}>
              <TouchableOpacity
                style={[styles.overrideBtn, styles.overrideOk]}
                onPress={() => onAiConfirm(task.id)}
                disabled={busyOverride}
              >
                {busyOverride ? (
                  <ActivityIndicator size="small" color="#D1FAE5" />
                ) : (
                  <Text style={styles.overrideBtnText}>Xác nhận</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.overrideBtn, styles.overrideNo]}
                onPress={() => onAiReject(task.id)}
                disabled={busyOverride}
              >
                <Text style={styles.overrideBtnTextReject}>Mở lại</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {completionError && completionError.taskId === task.id ? (
            <Text style={styles.errInline}>{completionError.message}</Text>
          ) : null}

          {canActComplete ? (
            <TouchableOpacity
              style={styles.completeBtn}
              onPress={() => onComplete(task)}
              disabled={busyComplete}
            >
              {busyComplete ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                  <Text style={styles.completeBtnText}>Hoàn thành</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
});

export function AiAssistantScreen({
  showHeaderChrome = true,
}: {
  showHeaderChrome?: boolean;
}) {
  const { isDark } = useAppTheme();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('assigned');
  const [tasks, setTasks] = useState<ConversationTask[]>([]);
  const [summary, setSummary] = useState<MyTasksSummary | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [isWarningDisabled, setIsWarningDisabled] = useState(false);
  const [completeLoadingId, setCompleteLoadingId] = useState<number | null>(
    null,
  );
  const [overrideLoadingId, setOverrideLoadingId] = useState<number | null>(
    null,
  );
  const [completionError, setCompletionError] = useState<{
    taskId: number;
    message: string;
  } | null>(null);
  const [evidenceTask, setEvidenceTask] = useState<ConversationTask | null>(
    null,
  );
  const [disableEvidenceFuture, setDisableEvidenceFuture] = useState(false);
  const [ruleModal, setRuleModal] = useState<{
    title: string;
    missing: string[];
  } | null>(null);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskConversations, setCreateTaskConversations] = useState<
    ChatConversation[]
  >([]);

  const accent = isDark ? '#00D9FF' : '#1E3A8A';
  const bg = isDark ? '#0B131F' : '#F0F2F5';
  const textPrimary = isDark ? '#F8FAFC' : '#111827';
  const textMuted = isDark ? '#94A3B8' : '#64748B';

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

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await httpClient.get('/auth/me');
        const id = data.user?.id ?? data.id;
        setCurrentUserId(Number(id) || null);
      } catch {
        setCurrentUserId(null);
      }
    })();
  }, []);

  const fetchPage = useCallback(
    async (cursor: number | null, append: boolean) => {
      const filter = tabToFilter(tab);
      try {
        const res = await chatApi.getMyTasks(filter, cursor);
        const next = Array.isArray(res.tasks) ? res.tasks : [];
        setSummary((prev) => res.summary ?? prev);
        setNextCursor(
          res.nextCursor === undefined ? null : res.nextCursor,
        );
        if (append) {
          setTasks((prev) => {
            const seen = new Set(prev.map((t) => t.id));
            const merged = [...prev];
            for (const t of next) {
              if (!seen.has(t.id)) {
                seen.add(t.id);
                merged.push(t);
              }
            }
            return sortAiAssistantTasks(merged);
          });
        } else {
          setTasks(sortAiAssistantTasks(next));
        }
      } catch (e) {
        console.warn('[AiAssistant] load failed', e);
        if (!append) setTasks([]);
      }
    },
    [tab],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      await fetchPage(null, false);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, fetchPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchPage(null, false);
    } finally {
      setRefreshing(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (nextCursor == null || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      await fetchPage(nextCursor, true);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, loading, fetchPage]);

  const openChat = useCallback(
    (conversationId: number, messageId: number) => {
      router.push({
        pathname: '/chat/[id]',
        params: {
          id: String(conversationId),
          jumpMessageId: String(messageId),
          name: 'Hội thoại',
          type: 'group',
        },
      });
    },
    [router],
  );

  const executeComplete = async (taskId: number) => {
    setCompleteLoadingId(taskId);
    setCompletionError(null);
    try {
      const res = await chatApi.completeTask(taskId);
      if (res.success) {
        await fetchPage(null, false);
      } else {
        const miss = res.missingConditions?.length
          ? res.missingConditions
          : [];
        if (miss.length > 0) {
          const t = tasks.find((x) => x.id === taskId);
          setRuleModal({
            title: t?.task_title || 'Công việc',
            missing: miss,
          });
        } else {
          setCompletionError({
            taskId,
            message: res.message || 'Chưa đủ điều kiện hoàn thành.',
          });
        }
      }
    } catch (e: any) {
      setCompletionError({
        taskId,
        message: String(
          e?.response?.data?.message || e?.message || 'Lỗi hoàn thành.',
        ),
      });
    } finally {
      setCompleteLoadingId(null);
    }
  };

  const handleComplete = (task: ConversationTask) => {
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
    void executeComplete(task.id);
  };

  const confirmEvidenceDone = async () => {
    const t = evidenceTask;
    if (!t) return;
    if (disableEvidenceFuture) {
      try {
        await AsyncStorage.setItem(EVIDENCE_WARNING_KEY, 'true');
      } catch {
        /* ignore */
      }
      setIsWarningDisabled(true);
    }
    setEvidenceTask(null);
    await executeComplete(t.id);
  };

  const handleAiConfirm = async (taskId: number) => {
    setOverrideLoadingId(taskId);
    try {
      await chatApi.aiConfirmTask(taskId);
      await fetchPage(null, false);
    } catch (e) {
      console.warn(e);
    } finally {
      setOverrideLoadingId(null);
    }
  };

  const handleAiReject = async (taskId: number) => {
    setOverrideLoadingId(taskId);
    try {
      await chatApi.aiRejectTask(taskId);
      await fetchPage(null, false);
    } catch (e) {
      console.warn(e);
    } finally {
      setOverrideLoadingId(null);
    }
  };

  const onCreateTaskPress = () => {
    setCreateTaskOpen(true);
    void (async () => {
      try {
        const res = await chatApi.getConversations();
        const list = res.conversations ?? [];
        setCreateTaskConversations(Array.isArray(list) ? list : []);
      } catch {
        setCreateTaskConversations([]);
      }
    })();
  };

  const tabBadge = (t: TabKey): number => {
    const s = summary;
    if (!s) return 0;
    if (t === 'assigned') return Number(s.assigned_pending ?? 0);
    if (t === 'created') return Number(s.created_pending ?? 0);
    return Number(s.overdue_pending ?? 0);
  };

  const statsTitle =
    tab === 'assigned'
      ? 'Nhiệm vụ cần xử lý'
      : tab === 'created'
        ? 'Nhiệm vụ bạn đã giao'
        : 'Nhiệm vụ quá hạn';

  const sheetBg = isDark ? '#121B2A' : '#FFFFFF';
  const borderCol = isDark ? '#1e3e55' : '#E5E7EB';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={['top', 'bottom']}>
      {showHeaderChrome ? (
        <View style={[styles.topBar, { borderColor: borderCol }]}>
          <View style={styles.topBarMain}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Quay lại"
            >
              <Ionicons name="chevron-back" size={26} color={accent} />
            </TouchableOpacity>
            <View style={styles.topBarLeft}>
              <View style={[styles.botIcon, { backgroundColor: `${accent}22` }]}>
                <Ionicons name="hardware-chip-outline" size={22} color={accent} />
              </View>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.topTitle, { color: textPrimary }]}>
                    Trợ lý ERP
                  </Text>
                  <View style={[styles.aiPill, { backgroundColor: `${accent}28` }]}>
                    <Text style={[styles.aiPillText, { color: accent }]}>AI</Text>
                  </View>
                </View>
                <Text style={[styles.online, { color: '#34D399' }]}>Trực tuyến</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.createBtn, { borderColor: accent }]}
            onPress={onCreateTaskPress}
          >
            <Ionicons name="add" size={18} color={accent} />
            <Text style={[styles.createBtnText, { color: accent }]}>
              Tạo nhiệm vụ
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.bodyPad}>
        <View style={[styles.welcome, { backgroundColor: sheetBg, borderColor: borderCol }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={accent} />
          <Text style={[styles.welcomeText, { color: textMuted }]}>
            Đây là bảng tổng hợp nhiệm vụ. Chạm một dòng để mở tin nhắn gốc trong
            chat.
          </Text>
        </View>

        <View style={[styles.tabRow, { backgroundColor: isDark ? '#0F172A' : '#E2E8F0' }]}>
          {(
            [
              { key: 'assigned' as const, label: 'Của bạn', icon: 'person-outline' as const },
              { key: 'created' as const, label: 'Bạn giao', icon: 'send-outline' as const },
              { key: 'overdue' as const, label: 'Trễ hạn', icon: 'time-outline' as const },
            ] as const
          ).map((item) => {
            const active = tab === item.key;
            const b = tabBadge(item.key);
            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.tabBtn,
                  active && { backgroundColor: isDark ? '#6366F1' : '#4F46E5' },
                ]}
                onPress={() => setTab(item.key)}
              >
                <Ionicons
                  name={item.icon}
                  size={14}
                  color={active ? '#FFFFFF' : textMuted}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    { color: active ? '#FFFFFF' : textMuted },
                  ]}
                >
                  {item.label}
                </Text>
                {b > 0 ? (
                  <View
                    style={[
                      styles.tabBadge,
                      {
                        backgroundColor: active
                          ? 'rgba(255,255,255,0.25)'
                          : isDark
                            ? '#334155'
                            : '#CBD5E1',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '700',
                        color: active ? '#FFF' : textPrimary,
                      }}
                    >
                      {b}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.statsRow}>
          <Text style={[styles.statsTitle, { color: textMuted }]}>
            {statsTitle}
          </Text>
          <View style={styles.statsPills}>
            <Text style={[styles.pill, { color: textMuted, backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
              Tổng: {summary?.total ?? tasks.length}
            </Text>
            <Text style={[styles.pill, { color: '#FDBA74', backgroundColor: isDark ? '#422006' : '#FFEDD5' }]}>
              Chưa xong: {summary?.pending ?? '—'}
            </Text>
            <Text style={[styles.pill, { color: '#6EE7B7', backgroundColor: isDark ? '#052E16' : '#D1FAE5' }]}>
              Xong: {summary?.done ?? '—'}
            </Text>
          </View>
        </View>

        {loading && tasks.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={accent} />
          </View>
        ) : (
          <FlatList
            data={tasks}
            keyExtractor={(t) => String(t.id)}
            renderItem={({ item }) => (
              <AiTaskRow
                task={item}
                isDark={isDark}
                currentUserId={currentUserId}
                isWarningDisabled={isWarningDisabled}
                completeLoadingId={completeLoadingId}
                overrideLoadingId={overrideLoadingId}
                completionError={completionError}
                onOpenChat={openChat}
                onComplete={handleComplete}
                onAiConfirm={handleAiConfirm}
                onAiReject={handleAiReject}
                onJumpEvidence={openChat}
              />
            )}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            onEndReached={() => {
              void loadMore();
            }}
            onEndReachedThreshold={0.35}
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator style={{ marginVertical: 16 }} color={accent} />
              ) : nextCursor != null ? (
                <TouchableOpacity onPress={() => void loadMore()} style={{ padding: 12 }}>
                  <Text style={{ textAlign: 'center', color: accent }}>
                    Xem thêm
                  </Text>
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              <Text style={[styles.empty, { color: textMuted }]}>
                Chưa có nhiệm vụ nào.
              </Text>
            }
            contentContainerStyle={{ paddingBottom: 24 }}
            windowSize={10}
            maxToRenderPerBatch={10}
            initialNumToRender={12}
            removeClippedSubviews={Platform.OS === 'android'}
          />
        )}
      </View>

      <Modal
        visible={!!ruleModal}
        transparent
        animationType="fade"
        onRequestClose={() => setRuleModal(null)}
      >
        <View style={styles.dialogOverlay}>
          <View style={[styles.dialogBox, { backgroundColor: sheetBg }]}>
            <Text style={styles.dialogTitle}>Chưa thể hoàn thành</Text>
            <Text style={[styles.dialogBody, { color: textPrimary }]}>
              &quot;{ruleModal?.title}&quot;
            </Text>
            <ScrollView style={{ maxHeight: 200 }}>
              {(ruleModal?.missing ?? []).map((m, i) => (
                <Text key={i} style={[styles.bullet, { color: textMuted }]}>
                  • {m}
                </Text>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.dialogOk, { backgroundColor: accent }]}
              onPress={() => setRuleModal(null)}
            >
              <Text style={styles.dialogOkText}>Đã hiểu</Text>
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
        <View style={styles.dialogOverlay}>
          <View style={[styles.dialogBox, { backgroundColor: sheetBg }]}>
            <Text style={styles.dialogTitle}>Cảnh báo thiếu bằng chứng</Text>
            <Text style={[styles.dialogBody, { color: textMuted }]}>
              {evidenceTask?.task_title}
            </Text>
            <View style={styles.switchRow}>
              <Switch
                value={disableEvidenceFuture}
                onValueChange={setDisableEvidenceFuture}
              />
              <Text style={{ flex: 1, color: textMuted, fontSize: 13 }}>
                Tắt cảnh báo sau này
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: borderCol }]}
                onPress={() => setEvidenceTask(null)}
              >
                <Text style={{ color: textMuted }}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogOk, { backgroundColor: accent, flex: 1 }]}
                onPress={() => void confirmEvidenceDone()}
              >
                <Text style={styles.dialogOkText}>Tiếp tục hoàn thành</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ManualCreateTaskModal
        visible={createTaskOpen}
        onClose={() => setCreateTaskOpen(false)}
        isDark={isDark}
        variant="standalone"
        conversationId={null}
        message={null}
        conversations={createTaskConversations}
        onCreated={() => void fetchPage(null, false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  backBtn: { padding: 4 },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  botIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { fontSize: 16, fontWeight: '700' },
  aiPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  aiPillText: { fontSize: 10, fontWeight: '800' },
  online: { fontSize: 12, marginTop: 2 },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    flexShrink: 0,
  },
  createBtnText: { fontSize: 12, fontWeight: '600' },
  bodyPad: { flex: 1, paddingHorizontal: 14 },
  welcome: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
    marginBottom: 12,
  },
  welcomeText: { flex: 1, fontSize: 13, lineHeight: 18 },
  tabRow: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabLabel: { fontSize: 11, fontWeight: '700' },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  statsRow: { marginBottom: 10 },
  statsTitle: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  statsPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { fontSize: 11, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  center: { paddingVertical: 48, alignItems: 'center' },
  empty: { textAlign: 'center', paddingVertical: 32, fontStyle: 'italic' },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitleCol: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardTitleDone: { textDecorationLine: 'line-through', opacity: 0.75 },
  cardMeta: { fontSize: 12, marginTop: 4 },
  confirmedLine: {
    fontSize: 12,
    color: '#10B981',
    marginTop: 6,
  },
  aiBanner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(139,92,246,0.12)',
  },
  aiBannerText: { fontSize: 12, color: '#C4B5FD', flex: 1, minWidth: 120 },
  evidenceLink: {
    fontSize: 12,
    color: '#A78BFA',
    textDecorationLine: 'underline',
  },
  overrideRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  overrideBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  overrideOk: { backgroundColor: 'rgba(16,185,129,0.25)' },
  overrideNo: { backgroundColor: 'rgba(239,68,68,0.25)' },
  overrideBtnText: { fontSize: 12, color: '#A7F3D0', fontWeight: '600' },
  overrideBtnTextReject: { fontSize: 12, color: '#FECACA', fontWeight: '600' },
  errInline: {
    fontSize: 12,
    color: '#FDBA74',
    marginTop: 8,
  },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 10,
  },
  completeBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  dialogBox: { borderRadius: 14, padding: 18 },
  dialogTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F97316',
    marginBottom: 8,
  },
  dialogBody: { fontSize: 14, marginBottom: 8 },
  bullet: { fontSize: 13, marginBottom: 6 },
  dialogOk: { paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  dialogOkText: { color: '#FFFFFF', fontWeight: '700' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
  },
});
