import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { Ionicons } from '@expo/vector-icons';

import type { PinnedMessage } from '@/Models/chat/types';
import { chatApi } from '@/services/api/chatApi';
import { getChatMessagePreview } from '@/features/chat/messagePreview';

type BoardTab = 'ghi-chu' | 'cong-viec' | 'dang-lam' | 'mau-mau' | 'thong-ke';

type Member = { id?: number; fullName?: string; full_name?: string; username?: string };

type Props = {
  visible: boolean;
  pins: PinnedMessage[];
  conversationId: number;
  conversationName?: string;
  members: Member[];
  currentUserId: number | null;
  isDark: boolean;
  onClose: () => void;
  onOpenMessage?: (messageId: number) => void;
  onUnpin?: (messageId: number) => void;
  onRefreshPins?: () => void;
};

const HOA_SI_KEYWORDS = ['họa sĩ', 'hoa si', 'hoasi'];

function isHoaSiGroup(name: string): boolean {
  const lower = name.toLowerCase();
  return HOA_SI_KEYWORDS.some((kw) => lower.includes(kw));
}

function memberName(m: Member): string {
  return String(m.fullName || m.full_name || m.username || '').trim();
}

export function ChatGroupBoardModal({
  visible,
  pins,
  conversationId,
  conversationName = '',
  members,
  currentUserId,
  isDark,
  onClose,
  onOpenMessage,
  onUnpin,
  onRefreshPins,
}: Props) {
  const { height } = useWindowDimensions();
  const [tab, setTab] = useState<BoardTab>('ghi-chu');
  const [tasks, setTasks] = useState<any[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>('Tất cả');
  const [taskTab, setTaskTab] = useState<'pending' | 'done'>('pending');

  const [workStatuses, setWorkStatuses] = useState<any[]>([]);
  const [statusInputs, setStatusInputs] = useState<Record<number, string>>({});
  const [savingUserId, setSavingUserId] = useState<number | null>(null);
  const [loadingStatuses, setLoadingStatuses] = useState(false);

  const [boardData, setBoardData] = useState<Awaited<ReturnType<typeof chatApi.getColorSampleBoard>> | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(false);

  const showColorTab = isHoaSiGroup(conversationName);
  const showWorkStatusTab = Number(conversationId) === 17;

  const participantNames = useMemo(
    () => members.map(memberName).filter(Boolean),
    [members],
  );

  const bg = isDark ? '#121B2A' : '#FFFFFF';
  const text = isDark ? '#F8FAFC' : '#111827';
  const muted = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? '#334155' : '#E5E7EB';

  const fetchTasks = useCallback(async () => {
    if (!participantNames.length) return;
    setLoadingTasks(true);
    try {
      const data = await chatApi.getUsersTasks(participantNames);
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch {
      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  }, [participantNames]);

  const fetchWorkStatuses = useCallback(async () => {
    if (!participantNames.length) return;
    setLoadingStatuses(true);
    try {
      const data = await chatApi.getUserWorkStatuses(participantNames);
      const statuses = data.statuses ?? [];
      setWorkStatuses(statuses);
      const inputs: Record<number, string> = {};
      statuses.forEach((s) => {
        inputs[s.user_id] = s.description || '';
      });
      setStatusInputs(inputs);
    } catch {
      setWorkStatuses([]);
    } finally {
      setLoadingStatuses(false);
    }
  }, [participantNames]);

  const fetchBoard = useCallback(async () => {
    setLoadingBoard(true);
    try {
      const data = await chatApi.getColorSampleBoard();
      setBoardData(data);
    } catch {
      setBoardData(null);
    } finally {
      setLoadingBoard(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (tab === 'cong-viec') void fetchTasks();
    if (tab === 'dang-lam') void fetchWorkStatuses();
    if ((tab === 'mau-mau' || tab === 'thong-ke') && showColorTab) void fetchBoard();
  }, [visible, tab, fetchTasks, fetchWorkStatuses, fetchBoard, showColorTab]);

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (selectedUser !== 'Tất cả') {
      list = list.filter((t) => String(t.assignee_name || t.user_name || '') === selectedUser);
    }
    const isDone = (t: any) =>
      ['done', 'completed', 'cancelled'].includes(String(t.status || '').toLowerCase());
    return list.filter((t) => (taskTab === 'done' ? isDone(t) : !isDone(t)));
  }, [tasks, selectedUser, taskTab]);

  const userTaskCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      const name = String(t.assignee_name || t.user_name || '');
      if (!name) continue;
      const done = ['done', 'completed', 'cancelled'].includes(String(t.status || '').toLowerCase());
      if (!done) map.set(name, (map.get(name) || 0) + 1);
    }
    return map;
  }, [tasks]);

  const handleSaveStatus = async (userId: number) => {
    setSavingUserId(userId);
    try {
      await chatApi.updateUserWorkStatus(userId, statusInputs[userId] || '');
      await fetchWorkStatuses();
      Alert.alert('✅', 'Đã lưu trạng thái làm việc');
    } catch {
      Alert.alert('Lỗi', 'Không thể lưu trạng thái');
    } finally {
      setSavingUserId(null);
    }
  };

  const handleMarkSampleDone = async (taskId: number) => {
    try {
      await chatApi.markColorSampleDone(taskId);
      Alert.alert('✅', 'Đã xác nhận làm mẫu xong');
      void fetchBoard();
    } catch {
      Alert.alert('Lỗi', 'Không thể cập nhật mẫu màu');
    }
  };

  const tabs: { key: BoardTab; label: string; show?: boolean }[] = [
    { key: 'ghi-chu', label: `Ghi chú (${pins.length})` },
    { key: 'cong-viec', label: 'CV thành viên' },
    { key: 'dang-lam', label: 'Đang làm', show: showWorkStatusTab },
    { key: 'mau-mau', label: 'Mẫu màu', show: showColorTab },
    { key: 'thong-ke', label: 'Thống kê', show: showColorTab },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: bg, maxHeight: height * 0.92 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.header, { borderBottomColor: border }]}>
            <Text style={[styles.title, { color: text }]}>Bảng tin nhóm</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={muted} />
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabBar, { borderBottomColor: border }]}>
            {tabs.filter((t) => t.show !== false).map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, tab === t.key && styles.tabActive]}
                onPress={() => setTab(t.key)}
              >
                <Text style={[styles.tabText, { color: tab === t.key ? '#6366F1' : muted }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
            {tab === 'ghi-chu' ? (
              pins.length === 0 ? (
                <Text style={[styles.empty, { color: muted }]}>Chưa có ghi chú ghim.</Text>
              ) : (
                pins.map((pin) => {
                  const preview = getChatMessagePreview(pin.message?.body || '') || 'Hình ảnh / file';
                  const by = pin.pinnedBy?.fullName || pin.pinnedBy?.username || '';
                  return (
                    <View key={pin.message.id} style={[styles.pinCard, { borderColor: border, backgroundColor: isDark ? '#1E293B' : '#F9FAFB' }]}>
                      <TouchableOpacity activeOpacity={0.8} onPress={() => onOpenMessage?.(pin.message.id)}>
                        <Text style={[styles.pinSender, { color: text }]}>
                          {pin.message?.sender?.fullName || pin.message?.sender?.username || '—'}
                        </Text>
                        <Text style={[styles.pinBody, { color: muted }]} numberOfLines={5}>
                          {preview}
                        </Text>
                        <Text style={[styles.pinMeta, { color: muted }]}>Ghim bởi: {by}</Text>
                      </TouchableOpacity>
                      {onUnpin ? (
                        <TouchableOpacity
                          style={styles.unpinBtn}
                          onPress={() => {
                            void onUnpin(pin.message.id);
                            onRefreshPins?.();
                          }}
                        >
                          <Ionicons name="pin-outline" size={16} color="#ef4444" />
                          <Text style={styles.unpinText}>Bỏ ghim</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })
              )
            ) : null}

            {tab === 'cong-viec' ? (
              loadingTasks ? (
                <ActivityIndicator color="#6366F1" style={{ marginTop: 24 }} />
              ) : (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    {['Tất cả', ...participantNames].map((name) => (
                      <TouchableOpacity
                        key={name}
                        style={[styles.chip, selectedUser === name && styles.chipOn, { borderColor: border }]}
                        onPress={() => setSelectedUser(name)}
                      >
                        <Text style={{ color: selectedUser === name ? '#FFF' : text, fontSize: 12, fontWeight: '700' }}>
                          {name}
                          {name !== 'Tất cả' && userTaskCounts.get(name) ? ` (${userTaskCounts.get(name)})` : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <View style={styles.row2}>
                    {(['pending', 'done'] as const).map((k) => (
                      <TouchableOpacity
                        key={k}
                        style={[styles.chip, taskTab === k && styles.chipOn, { borderColor: border, flex: 1 }]}
                        onPress={() => setTaskTab(k)}
                      >
                        <Text style={{ color: taskTab === k ? '#FFF' : text, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>
                          {k === 'pending' ? 'Chưa xong' : 'Đã xong'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {filteredTasks.length === 0 ? (
                    <Text style={[styles.empty, { color: muted }]}>Không có công việc.</Text>
                  ) : (
                    filteredTasks.map((task) => (
                      <TouchableOpacity
                        key={String(task.id)}
                        style={[styles.taskCard, { borderColor: border }]}
                        onPress={() => {
                          const mid = Number(task.source_message_id || task.message_id);
                          if (mid > 0) {
                            onClose();
                            onOpenMessage?.(mid);
                          }
                        }}
                      >
                        <Text style={[styles.taskTitle, { color: text }]}>{task.title || task.task_title || '—'}</Text>
                        <Text style={{ color: muted, fontSize: 11 }}>
                          {task.assignee_name || task.user_name || ''}
                          {task.source_type === 'ERP' ? ' • [ERP]' : task.auto_created ? ' • [AUTO]' : ''}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </>
              )
            ) : null}

            {tab === 'dang-lam' ? (
              loadingStatuses ? (
                <ActivityIndicator color="#6366F1" style={{ marginTop: 24 }} />
              ) : workStatuses.length === 0 ? (
                <Text style={[styles.empty, { color: muted }]}>Chưa có dữ liệu trạng thái.</Text>
              ) : (
                workStatuses.map((s) => (
                  <View key={s.user_id} style={[styles.statusCard, { borderColor: border }]}>
                    <Text style={[styles.statusName, { color: text }]}>{s.full_name || `User #${s.user_id}`}</Text>
                    {s.updated_at ? (
                      <Text style={{ color: muted, fontSize: 10, marginBottom: 6 }}>Cập nhật: {s.updated_at}</Text>
                    ) : null}
                    <TextInput
                      style={[styles.statusInput, { color: text, borderColor: border, backgroundColor: isDark ? '#0F172A' : '#FFF' }]}
                      multiline
                      placeholder="Mình đang làm gì..."
                      placeholderTextColor={muted}
                      value={statusInputs[s.user_id] ?? ''}
                      onChangeText={(v) => setStatusInputs((prev) => ({ ...prev, [s.user_id]: v }))}
                    />
                    <TouchableOpacity
                      style={styles.saveBtn}
                      disabled={savingUserId === s.user_id}
                      onPress={() => void handleSaveStatus(s.user_id)}
                    >
                      {savingUserId === s.user_id ? (
                        <ActivityIndicator color="#FFF" size="small" />
                      ) : (
                        <Text style={styles.saveBtnText}>Lưu</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ))
              )
            ) : null}

            {(tab === 'mau-mau' || tab === 'thong-ke') && showColorTab ? (
              loadingBoard ? (
                <ActivityIndicator color="#6366F1" style={{ marginTop: 24 }} />
              ) : !boardData?.by_project?.length ? (
                <Text style={[styles.empty, { color: muted }]}>Chưa có dữ liệu mẫu màu.</Text>
              ) : tab === 'thong-ke' ? (
                <View style={styles.statsGrid}>
                  {[
                    { label: 'Đề nghị làm mẫu', v: boardData.summary?.handoff ?? 0 },
                    { label: 'QAQC nợ mẫu', v: boardData.summary?.overdue ?? 0 },
                    { label: 'PTK nợ duyệt', v: boardData.summary?.projects_ptk_pending_approve ?? 0 },
                    { label: 'Đã hoàn thành', v: boardData.summary?.approved ?? 0 },
                  ].map((cell) => (
                    <View key={cell.label} style={[styles.statCell, { borderColor: border }]}>
                      <Text style={{ color: muted, fontSize: 10 }}>{cell.label}</Text>
                      <Text style={{ color: text, fontSize: 22, fontWeight: '800' }}>{cell.v}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                boardData.by_project.map((proj) => (
                  <View key={proj.project_code} style={[styles.projectCard, { borderColor: border }]}>
                    <Text style={[styles.projectTitle, { color: text }]}>
                      {proj.project_code} {proj.project_name ? `— ${proj.project_name}` : ''}
                    </Text>
                    <Text style={{ color: muted, fontSize: 11, marginBottom: 8 }}>
                      Chờ QAQC: {proj.handoff_count} • Đã duyệt: {proj.approved_count}
                    </Text>
                    {proj.palettes?.map((p) => (
                      <View key={p.id} style={[styles.paletteRow, { borderTopColor: border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: text, fontSize: 13, fontWeight: '600' }}>{p.palette_code}</Text>
                          <Text style={{ color: muted, fontSize: 10 }}>{p.ptk_status || 'DRAFT'}</Text>
                        </View>
                        {p.ptk_status === 'HANDOFF' ? (
                          <TouchableOpacity style={styles.doneBtn} onPress={() => void handleMarkSampleDone(p.id)}>
                            <Text style={styles.doneBtnText}>Xong</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ))
              )
            ) : null}
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
  tabBar: { borderBottomWidth: StyleSheet.hairlineWidth, maxHeight: 48 },
  tab: { paddingHorizontal: 14, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#6366F1' },
  tabText: { fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 14 },
  pinCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  pinSender: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  pinBody: { fontSize: 14, lineHeight: 20 },
  pinMeta: { fontSize: 11, marginTop: 8 },
  unpinBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, alignSelf: 'flex-end' },
  unpinText: { color: '#ef4444', fontSize: 12, fontWeight: '700' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, marginRight: 8 },
  chipOn: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  row2: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  taskCard: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  taskTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  statusCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  statusName: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  statusInput: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 72, textAlignVertical: 'top', fontSize: 14 },
  saveBtn: { marginTop: 8, backgroundColor: '#1E3A8A', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontWeight: '800' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCell: { width: '47%', borderWidth: 1, borderRadius: 12, padding: 12 },
  projectCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  projectTitle: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  paletteRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  doneBtn: { backgroundColor: '#059669', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  doneBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
});
