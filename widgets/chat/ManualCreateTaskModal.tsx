import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ChatConversation } from '@/Models/chat/types';
import type { MentionParticipant } from '@/features/chat/mentionUtils';
import { getSenderName } from '@/app/chat/chatHelpers';
import { chatApi } from '@/services/api/chatApi';

function participantLabel(p: MentionParticipant): string {
  return String(
    p.fullName ?? (p as { full_name?: string }).full_name ?? p.username ?? '',
  ).trim();
}

function messageBody(m: any): string {
  return String(m?.body ?? '').trim();
}

function messageMentionIds(m: any): number[] {
  const raw = m?.mentions;
  if (!Array.isArray(raw)) return [];
  const ids: number[] = [];
  for (const x of raw) {
    const id = Number((x as { id?: number })?.id);
    if (Number.isFinite(id) && id > 0) ids.push(id);
  }
  return ids;
}

export type ManualCreateTaskModalProps = {
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  variant: 'fromMessage' | 'standalone';
  /** Known conversation when opening from chat (required for fromMessage). */
  conversationId: number | null;
  message: any | null;
  conversations: ChatConversation[];
  /** From chat: checklist participants for assignees */
  initialParticipants?: MentionParticipant[];
  onCreated?: () => void;
};

const PRIORITIES = [
  { value: 'low' as const, label: 'Thấp' },
  { value: 'medium' as const, label: 'Trung bình' },
  { value: 'high' as const, label: 'Cao' },
];

export function ManualCreateTaskModal({
  visible,
  onClose,
  isDark,
  variant,
  conversationId,
  message,
  conversations,
  initialParticipants = [],
  onCreated,
}: ManualCreateTaskModalProps) {
  const accent = '#34D399';
  const bg = isDark ? '#1a2332' : '#FFFFFF';
  const card = isDark ? '#121B2A' : '#F8FAFC';
  const border = isDark ? '#2C3E50' : '#E2E8F0';
  const textMain = isDark ? '#F1F5F9' : '#0F172A';
  const textMuted = isDark ? '#94A3B8' : '#64748B';

  const [selectedConvId, setSelectedConvId] = useState<number | null>(conversationId);
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState<string>('none');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [deadline, setDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subPicker, setSubPicker] = useState<'assignee' | 'priority' | 'conversation' | null>(
    null,
  );

  const effectiveConvId = variant === 'fromMessage' ? conversationId : selectedConvId;

  const assigneeParticipants = useMemo((): MentionParticipant[] => {
    if (variant === 'fromMessage' && initialParticipants.length > 0) {
      return initialParticipants;
    }
    if (!selectedConvId) return [];
    const c = conversations.find((x) => x.id === selectedConvId);
    return (c?.participants ?? []) as MentionParticipant[];
  }, [variant, initialParticipants, selectedConvId, conversations]);

  const assigneeLabel = useMemo(() => {
    if (assigneeId === 'none') return 'Chưa gán';
    const id = Number(assigneeId);
    const p = assigneeParticipants.find((x) => Number(x.id) === id);
    return p ? participantLabel(p) || `#${id}` : `#${id}`;
  }, [assigneeId, assigneeParticipants]);

  const priorityLabel =
    PRIORITIES.find((p) => p.value === priority)?.label ?? 'Trung bình';

  const selectedConversationTitle = useMemo(() => {
    if (!selectedConvId) return '';
    const c = conversations.find((x) => x.id === selectedConvId);
    return c?.name?.trim() || 'Hội thoại trực tiếp';
  }, [selectedConvId, conversations]);

  const resetAndPrime = useCallback(() => {
    setError(null);
    setSubmitting(false);
    setAiLoading(false);
    setSubPicker(null);

    if (variant === 'fromMessage') {
      setSelectedConvId(conversationId);
      const m = message;
      const body = messageBody(m);
      const mid = Number(m?.id);
      const initialTitle = body
        ? body.slice(0, 200)
        : mid
          ? `Task từ tin nhắn #${mid}`
          : '';
      setTitle(initialTitle);
      const mids = messageMentionIds(m);
      if (mids.length === 1) setAssigneeId(String(mids[0]));
      else setAssigneeId('none');
      setPriority('medium');
      setDeadline('');
    } else {
      setSelectedConvId((prev) => {
        if (prev && conversations.some((c) => c.id === prev)) return prev;
        return conversations[0]?.id ?? null;
      });
      setTitle('');
      setAssigneeId('none');
      setPriority('medium');
      setDeadline('');
    }
  }, [variant, conversationId, message, conversations]);

  useEffect(() => {
    if (!visible) return;
    resetAndPrime();
  }, [visible, resetAndPrime]);

  useEffect(() => {
    if (!visible || variant !== 'fromMessage' || !message) return;
    const mid = Number(message.id);
    const cid = Number(conversationId);
    if (!Number.isFinite(mid) || mid <= 0 || !Number.isFinite(cid) || cid <= 0) return;

    let cancelled = false;
    const defaultTitle = messageBody(message).slice(0, 200);
    setAiLoading(true);
    void (async () => {
      try {
        const suggestion = await chatApi.suggestTask(cid, mid);
        if (cancelled || !suggestion) return;
        setTitle((prev) => (prev === defaultTitle ? suggestion.suggestedTitle || prev : prev));
        if (suggestion.suggestedAssigneeId) {
          setAssigneeId(String(suggestion.suggestedAssigneeId));
        }
        if (suggestion.suggestedPriority) setPriority(suggestion.suggestedPriority);
        if (suggestion.suggestedDeadline) setDeadline(String(suggestion.suggestedDeadline).slice(0, 10));
      } catch {
        /* non-blocking */
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, variant, message, conversationId]);

  const canSubmit =
    Number.isFinite(Number(effectiveConvId)) &&
    Number(effectiveConvId) > 0 &&
    title.trim().length > 0;

  const deadlineOk = (() => {
    const d = deadline.trim();
    if (!d) return true;
    return /^\d{4}-\d{2}-\d{2}$/.test(d);
  })();

  const handleSubmit = async () => {
    const cid = Number(effectiveConvId);
    if (!Number.isFinite(cid) || cid <= 0) {
      setError('Vui lòng chọn cuộc hội thoại.');
      return;
    }
    if (!title.trim()) return;
    if (!deadlineOk) {
      setError('Deadline: dùng định dạng YYYY-MM-DD hoặc để trống.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await chatApi.createManualTask(cid, {
        task_title: title.trim(),
        source_message_id:
          variant === 'fromMessage' && message && Number(message.id) > 0
            ? Number(message.id)
            : null,
        assigned_to_user_id: assigneeId === 'none' ? null : Number(assigneeId),
        priority,
        deadline: deadline.trim() || null,
      });

      if (result.deduplicated) {
        setError(String(result.message ?? 'Tin nhắn này đã có task.'));
        return;
      }
      if (result.task) {
        onCreated?.();
        onClose();
      }
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Có lỗi xảy ra khi tạo task.';
      setError(String(msg));
    } finally {
      setSubmitting(false);
    }
  };

  const headerTitle =
    variant === 'fromMessage' ? 'Tạo Task từ tin nhắn' : 'Tạo nhiệm vụ mới';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: bg, borderColor: border }]}>
          <View style={styles.headerRow}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="clipboard-outline" size={22} color={accent} />
              <Text style={[styles.headerTitle, { color: textMain }]}>{headerTitle}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Đóng">
              <Ionicons name="close" size={26} color={textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {variant === 'standalone' && conversations.length > 0 ? (
              <View style={styles.field}>
                <Text style={[styles.label, { color: textMuted }]}>Chọn cuộc hội thoại</Text>
                <TouchableOpacity
                  style={[styles.selectBtn, { borderColor: border, backgroundColor: card }]}
                  onPress={() => setSubPicker('conversation')}
                >
                  <Text style={[styles.selectBtnText, { color: textMain }]}>
                    {selectedConvId ? selectedConversationTitle : 'Chọn nhóm hoặc người nhận'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={textMuted} />
                </TouchableOpacity>
              </View>
            ) : null}

            {variant === 'fromMessage' && message ? (
              <View style={[styles.sourceBox, { backgroundColor: card, borderColor: border }]}>
                <Text style={[styles.sourceLabel, { color: textMuted }]}>TIN NHẮN GỐC:</Text>
                <Text style={[styles.sourceQuote, { color: textMuted }]}>
                  &quot;{messageBody(message) || '(Không có nội dung)'}&quot;
                </Text>
                <Text style={[styles.sourceBy, { color: textMuted }]}>
                  — {getSenderName(message)}
                </Text>
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={[styles.label, { color: textMuted }]}>Tiêu đề Task</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Nhập tiêu đề công việc..."
                placeholderTextColor={textMuted}
                style={[
                  styles.input,
                  { borderColor: border, backgroundColor: card, color: textMain },
                ]}
              />
              {aiLoading ? (
                <Text style={[styles.aiHint, { color: accent }]}>
                  AI đang gợi ý nội dung...
                </Text>
              ) : null}
            </View>

            <View style={styles.row2}>
              <View style={styles.half}>
                <Text style={[styles.label, { color: textMuted }]}>Giao cho</Text>
                <TouchableOpacity
                  style={[styles.selectBtn, { borderColor: border, backgroundColor: card }]}
                  onPress={() => setSubPicker('assignee')}
                >
                  <Text style={[styles.selectBtnText, { color: textMain }]} numberOfLines={1}>
                    {assigneeLabel}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={textMuted} />
                </TouchableOpacity>
              </View>
              <View style={styles.half}>
                <Text style={[styles.label, { color: textMuted }]}>Ưu tiên</Text>
                <TouchableOpacity
                  style={[styles.selectBtn, { borderColor: border, backgroundColor: card }]}
                  onPress={() => setSubPicker('priority')}
                >
                  <Text style={[styles.selectBtnText, { color: textMain }]}>{priorityLabel}</Text>
                  <Ionicons name="chevron-down" size={18} color={textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: textMuted }]}>
                Hạn hoàn thành (YYYY-MM-DD)
              </Text>
              <TextInput
                value={deadline}
                onChangeText={setDeadline}
                placeholder="Để trống hoặc ví dụ 2026-06-01"
                placeholderTextColor={textMuted}
                style={[
                  styles.input,
                  { borderColor: border, backgroundColor: card, color: textMain },
                ]}
              />
            </View>

            {error ? (
              <View style={[styles.errorBox, { borderColor: '#F87171', backgroundColor: isDark ? '#450A0A' : '#FEF2F2' }]}>
                <Ionicons name="alert-circle-outline" size={18} color="#F87171" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity onPress={onClose} disabled={submitting}>
              <Text style={[styles.ghostBtn, { color: textMuted }]}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: accent, opacity: canSubmit && deadlineOk && !submitting ? 1 : 0.5 },
              ]}
              disabled={!canSubmit || !deadlineOk || submitting}
              onPress={() => void handleSubmit()}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="clipboard-outline" size={18} color="#FFF" />
                  <Text style={styles.primaryBtnText}>Tạo Task</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={subPicker !== null} transparent animationType="fade">
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setSubPicker(null)}
        >
          <View style={[styles.pickerSheet, { backgroundColor: bg, borderColor: border }]}>
            <Text style={[styles.pickerTitle, { color: textMain }]}>
              {subPicker === 'assignee'
                ? 'Giao cho'
                : subPicker === 'priority'
                  ? 'Ưu tiên'
                  : 'Chọn cuộc hội thoại'}
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {subPicker === 'conversation'
                ? conversations.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.pickerRow}
                      onPress={() => {
                        setSelectedConvId(c.id);
                        setAssigneeId('none');
                        setSubPicker(null);
                      }}
                    >
                      <Text style={{ color: textMain }}>
                        {c.name?.trim() || 'Hội thoại trực tiếp'}
                      </Text>
                    </TouchableOpacity>
                  ))
                : null}
              {subPicker === 'assignee' ? (
                <>
                  <TouchableOpacity
                    style={styles.pickerRow}
                    onPress={() => {
                      setAssigneeId('none');
                      setSubPicker(null);
                    }}
                  >
                    <Text style={{ color: textMain }}>Chưa gán</Text>
                  </TouchableOpacity>
                  {assigneeParticipants.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.pickerRow}
                      onPress={() => {
                        setAssigneeId(String(p.id));
                        setSubPicker(null);
                      }}
                    >
                      <Text style={{ color: textMain }}>{participantLabel(p) || p.username}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              ) : null}
              {subPicker === 'priority'
                ? PRIORITIES.map((p) => (
                    <TouchableOpacity
                      key={p.value}
                      style={styles.pickerRow}
                      onPress={() => {
                        setPriority(p.value);
                        setSubPicker(null);
                      }}
                    >
                      <Text style={{ color: textMain }}>{p.label}</Text>
                    </TouchableOpacity>
                  ))
                : null}
            </ScrollView>
            <TouchableOpacity style={styles.pickerClose} onPress={() => setSubPicker(null)}>
              <Text style={{ color: accent, fontWeight: '600' }}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700', flex: 1 },
  scroll: { maxHeight: 480 },
  sourceBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  sourceLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  sourceQuote: { fontSize: 14, fontStyle: 'italic' },
  sourceBy: { fontSize: 11, marginTop: 6 },
  field: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 15,
  },
  aiHint: { fontSize: 11, marginTop: 4 },
  row2: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  half: { flex: 1 },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  selectBtnText: { fontSize: 14, flex: 1, marginRight: 6 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  errorText: { flex: 1, color: '#F87171', fontSize: 13 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#33415555',
  },
  ghostBtn: { fontSize: 16, paddingVertical: 8, paddingHorizontal: 8 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  pickerSheet: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    maxHeight: '70%',
  },
  pickerTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  pickerRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#64748B44' },
  pickerClose: { alignItems: 'center', paddingVertical: 12 },
});
