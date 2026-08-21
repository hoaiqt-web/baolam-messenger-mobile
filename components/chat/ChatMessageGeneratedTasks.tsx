import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { chatApi } from '@/services/api/chatApi';
import type { ChatGeneratedTask } from '@/Models/chat/types';
import type { AuthUser } from '@/Models/auth/types';
import { parsePycvtMeta } from '@/features/chat/pycvtParsers';

type Props = {
  tasks: ChatGeneratedTask[];
  currentUser?: AuthUser | null;
  messageBody?: string | null;
  onTaskUpdated?: () => void;
};

const PYCVT_QAQC_APPROVER_ROLES = new Set(['CEO', 'ADMIN', 'QAQC_NM', 'QA_QC_NM', 'CB_KYTHUAT', 'CBKT']);

function isWaitingQaqcAggregateStatus(status: string | null | undefined): boolean {
  return String(status ?? '').toLowerCase().includes('chờ qaqc');
}

function isQaqcPycvtApprover(user?: AuthUser | null): boolean {
  const role = String(user?.role_code ?? '').toUpperCase();
  return PYCVT_QAQC_APPROVER_ROLES.has(role);
}

function taskMetadata(task: ChatGeneratedTask): Record<string, unknown> {
  const trail = task.audit_trail as { metadata?: Record<string, unknown> } | undefined;
  return (trail?.metadata ?? trail ?? {}) as Record<string, unknown>;
}

function isAuthorizedApprover(task: ChatGeneratedTask, user?: AuthUser | null): boolean {
  if (!user) return false;
  const role = String(user.role_code ?? '').toUpperCase();
  if (role === 'CEO' || role === 'CFO' || role === 'ADMIN') return true;

  const meta = taskMetadata(task);
  const approvers = Array.isArray(meta.authorized_approvers)
    ? (meta.authorized_approvers as string[])
    : [];
  if (!approvers.length) return false;

  const keys = [
    String(user.username ?? '').toLowerCase(),
    String(user.email ?? '').toLowerCase(),
    String(user.full_name ?? '').toLowerCase(),
  ].filter(Boolean);

  return approvers.some((a) => keys.includes(String(a).toLowerCase()));
}

type CustomButton = {
  action?: string;
  label?: string;
  text?: string;
  color?: string;
  line_idx?: number;
};

function PoTaskCard({
  task,
  currentUser,
  onTaskUpdated,
}: {
  task: ChatGeneratedTask;
  currentUser?: AuthUser | null;
  onTaskUpdated?: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const meta = taskMetadata(task);
  const isVehicle = meta.request_type === 'vehicle_cost_proposal';
  const isDone = task.status === 'DONE';
  const isRejected = task.status === 'REJECTED';
  const sourceId = task.source_ref_id ?? meta.source_ref_id ?? '…';
  const rawTitle =
    String(meta.message_title ?? '') ||
    (isVehicle ? 'ĐỀ XUẤT CHI PHÍ VẬN CHUYỂN' : `PHÊ DUYỆT PO #${sourceId}`);
  const title = rawTitle.replace(/\*\*|🏛️|🚚/g, '').trim();
  const customButtons = (Array.isArray(meta.custom_buttons) ? meta.custom_buttons : []) as CustomButton[];
  const authorized = isAuthorizedApprover(task, currentUser);

  const accent = isVehicle ? '#7eb8f5' : '#5ee9b5';
  const border = isVehicle ? '#4a7ab555' : '#3d8f6e';
  const bg = isVehicle ? '#0c1522' : '#0b1611';

  const runAction = (action: string, extra?: Record<string, unknown>) => {
    const isApprove = action === 'DONE';
    const label = isApprove ? 'DUYỆT' : 'TỪ CHỐI';
    Alert.alert(
      `Xác nhận ${label}`,
      `Bạn có chắc chắn muốn ${label} yêu cầu này không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: label,
          style: isApprove ? 'default' : 'destructive',
          onPress: () => {
            setLoading(action);
            void chatApi
              .transitionTask(task.id, action, extra as { assigned_to_user_id?: number })
              .then((res) => {
                if (res.success) {
                  Alert.alert('Thành công', 'Thao tác đã được ghi nhận.');
                  onTaskUpdated?.();
                } else {
                  Alert.alert('Lỗi', res.message || res.error || 'Không thể thực hiện thao tác.');
                }
              })
              .catch((e: unknown) => {
                const msg =
                  (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
                    ?.message
                  || (e as { response?: { data?: { error?: string } } })?.response?.data?.error
                  || (e as Error)?.message
                  || 'Đã xảy ra lỗi, vui lòng thử lại!';
                Alert.alert('Lỗi', msg);
              })
              .finally(() => setLoading(null));
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.taskCard, { backgroundColor: bg, borderColor: border }]}>
      <View style={styles.taskHeader}>
        <View style={styles.taskTitleRow}>
          <Ionicons name={isVehicle ? 'bus-outline' : 'flash-outline'} size={16} color={accent} />
          <Text style={[styles.taskTitle, { color: accent }]} numberOfLines={2}>
            {title}
          </Text>
        </View>
        {isDone ? (
          <View style={[styles.badge, styles.badgeDone]}>
            <Text style={styles.badgeDoneText}>ĐÃ DUYỆT</Text>
          </View>
        ) : null}
        {isRejected ? (
          <View style={[styles.badge, styles.badgeReject]}>
            <Text style={styles.badgeRejectText}>TỪ CHỐI</Text>
          </View>
        ) : null}
      </View>

      {isDone || isRejected ? (
        <View style={styles.taskStatusRow}>
          <View style={[styles.statusDot, { backgroundColor: isDone ? '#10b981' : '#ef4444' }]} />
          <Text style={styles.taskStatusText}>
            {isDone
              ? isVehicle
                ? 'Chi phí đã được phê duyệt.'
                : 'Đơn hàng đã được phê duyệt.'
              : 'Yêu cầu đã bị từ chối.'}
          </Text>
        </View>
      ) : authorized ? (
        <View style={styles.actionRow}>
          {customButtons.length > 0
            ? customButtons.map((btn, idx) => {
                const action = btn.action === 'reject_all' ? 'REJECT' : 'DONE';
                const isRed = btn.color === 'red' || action === 'REJECT';
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.actionBtn,
                      isRed ? styles.actionReject : styles.actionApprove,
                      loading === action && styles.actionDisabled,
                    ]}
                    disabled={!!loading}
                    onPress={() =>
                      runAction(
                        action,
                        btn.line_idx !== undefined ? { line_idx: btn.line_idx } : undefined,
                      )
                    }
                  >
                    {loading === action ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.actionBtnText}>{btn.label || btn.text || (isRed ? 'Từ chối' : 'Duyệt')}</Text>
                    )}
                  </TouchableOpacity>
                );
              })
            : (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionApprove, loading === 'DONE' && styles.actionDisabled]}
                  disabled={!!loading}
                  onPress={() => runAction('DONE')}
                >
                  {loading === 'DONE' ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>Duyệt mua</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionReject, loading === 'REJECT' && styles.actionDisabled]}
                  disabled={!!loading}
                  onPress={() => runAction('REJECT')}
                >
                  {loading === 'REJECT' ? (
                    <ActivityIndicator size="small" color="#f87171" />
                  ) : (
                    <>
                      <Ionicons name="close-circle-outline" size={16} color="#f87171" />
                      <Text style={[styles.actionBtnText, styles.actionRejectText]}>Từ chối</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
        </View>
      ) : (
        <Text style={styles.taskPendingText}>
          Chờ CEO/CFO duyệt trong tab Nhiệm vụ.
        </Text>
      )}
    </View>
  );
}

function QaqcTaskCard({
  task,
  currentUser,
  messageBody,
  onTaskUpdated,
}: {
  task: ChatGeneratedTask;
  currentUser?: AuthUser | null;
  messageBody?: string | null;
  onTaskUpdated?: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const meta = taskMetadata(task);
  const isDone = task.status === 'DONE';
  const isRejected = task.status === 'REJECTED';
  const sourceId = task.source_ref_id ?? meta.source_ref_id ?? '…';
  const title = String(meta.message_title ?? `PHÊ DUYỆT PYCVT #${sourceId}`).replace(/\*\*|🏛️|🚚/g, '').trim();
  const pycvtMeta = parsePycvtMeta(messageBody);
  const waitingQaqc = isWaitingQaqcAggregateStatus(pycvtMeta?.aggregate_status);
  const authorized = isQaqcPycvtApprover(currentUser);

  if (!waitingQaqc && !isDone && !isRejected) {
    return null;
  }

  const runAction = (action: string) => {
    const isApprove = action === 'DONE';
    const label = isApprove ? 'DUYỆT' : 'TỪ CHỐI';
    const slipCode = String(pycvtMeta?.batch_key ?? pycvtMeta?.request_code ?? sourceId);
    const confirmBody = isApprove
      ? `Duyệt TẤT CẢ vật tư trong phiếu PYCVT #${slipCode}? (không ảnh hưởng phiếu khác)`
      : `Từ chối TẤT CẢ vật tư trong phiếu PYCVT #${slipCode}?`;
    Alert.alert(
      `Xác nhận ${label}`,
      confirmBody,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: label,
          style: isApprove ? 'default' : 'destructive',
          onPress: () => {
            setLoading(action);
            void chatApi
              .transitionTask(task.id, action)
              .then((res) => {
                if (res.success) {
                  Alert.alert('Thành công', 'Thao tác đã được ghi nhận.');
                  onTaskUpdated?.();
                } else {
                  Alert.alert('Lỗi', res.message || res.error || 'Không thể thực hiện thao tác.');
                }
              })
              .catch((e: unknown) => {
                const msg =
                  (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
                    ?.message
                  || (e as { response?: { data?: { error?: string } } })?.response?.data?.error
                  || (e as Error)?.message
                  || 'Đã xảy ra lỗi, vui lòng thử lại!';
                Alert.alert('Lỗi', msg);
              })
              .finally(() => setLoading(null));
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.taskCard, { backgroundColor: '#0b1611', borderColor: '#3d8f6e' }]}>
      <View style={styles.taskHeader}>
        <View style={styles.taskTitleRow}>
          <Ionicons name="flash-outline" size={16} color="#5ee9b5" />
          <Text style={[styles.taskTitle, { color: '#5ee9b5' }]} numberOfLines={2}>
            {title}
          </Text>
        </View>
        {isDone ? (
          <View style={[styles.badge, styles.badgeDone]}>
            <Text style={styles.badgeDoneText}>ĐÃ DUYỆT</Text>
          </View>
        ) : null}
        {isRejected ? (
          <View style={[styles.badge, styles.badgeReject]}>
            <Text style={styles.badgeRejectText}>TỪ CHỐI</Text>
          </View>
        ) : null}
      </View>

      {isDone || isRejected ? (
        <View style={styles.taskStatusRow}>
          <View style={[styles.statusDot, { backgroundColor: isDone ? '#10b981' : '#ef4444' }]} />
          <Text style={styles.taskStatusText}>
            {isDone ? 'Phiếu PYCVT đã được QAQC duyệt.' : 'Yêu cầu đã bị từ chối.'}
          </Text>
        </View>
      ) : authorized && waitingQaqc ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionApprove, loading === 'DONE' && styles.actionDisabled]}
            disabled={!!loading}
            onPress={() => runAction('DONE')}
          >
            {loading === 'DONE' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>QAQC Duyệt tất cả</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionReject, loading === 'REJECT' && styles.actionDisabled]}
            disabled={!!loading}
            onPress={() => runAction('REJECT')}
          >
            {loading === 'REJECT' ? (
              <ActivityIndicator size="small" color="#f87171" />
            ) : (
              <>
                <Ionicons name="close-circle-outline" size={16} color="#f87171" />
                <Text style={[styles.actionBtnText, styles.actionRejectText]}>Từ chối</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : waitingQaqc ? (
        <Text style={styles.taskPendingText}>
          Chỉ role QAQC_NM, CB_KYTHUAT hoặc CEO/Admin mới có quyền duyệt phiếu này.
        </Text>
      ) : null}
    </View>
  );
}

function PoCancelTaskCard({
  task,
  currentUser,
  onTaskUpdated,
}: {
  task: ChatGeneratedTask;
  currentUser?: AuthUser | null;
  onTaskUpdated?: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const meta = taskMetadata(task);
  const isDone = task.status === 'DONE';
  const isRejected = task.status === 'REJECTED';
  const poId = meta.po_id ?? task.source_ref_id ?? '…';
  const title = String(meta.message_title ?? `YÊU CẦU HUỶ PO #${poId}`).replace(/\*\*|🚫/g, '').trim();
  const role = String(currentUser?.role_code ?? '').toUpperCase();
  const authorized = role === 'CEO' || role === 'CFO';

  const runApprove = () => {
    Alert.alert('Duyệt huỷ PO', `Duyệt huỷ PO #${poId}? PO sẽ chuyển CANCELLED.`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Duyệt huỷ',
        style: 'destructive',
        onPress: () => {
          setLoading('DONE');
          void chatApi
            .transitionTask(task.id, 'DONE')
            .then((res) => {
              if (res.success) {
                Alert.alert('Thành công', 'Đã duyệt huỷ PO.');
                onTaskUpdated?.();
              } else {
                Alert.alert('Lỗi', res.message || res.error || 'Không duyệt được.');
              }
            })
            .catch((e: unknown) => {
              Alert.alert(
                'Lỗi',
                (e as { response?: { data?: { message?: string } } })?.response?.data?.message
                  || (e as Error)?.message
                  || 'Đã xảy ra lỗi',
              );
            })
            .finally(() => setLoading(null));
        },
      },
    ]);
  };

  const submitReject = (reason: string) => {
    const note = reason.trim();
    if (note.length < 3) {
      Alert.alert('Lỗi', 'Lý do từ chối tối thiểu 3 ký tự.');
      return;
    }
    setLoading('REJECT');
    void chatApi
      .transitionTask(task.id, 'REJECT', { reason: note })
      .then((res) => {
        if (res.success) {
          Alert.alert('Thành công', 'Đã từ chối huỷ PO.');
          onTaskUpdated?.();
        } else {
          Alert.alert('Lỗi', res.message || res.error || 'Không từ chối được.');
        }
      })
      .catch((e: unknown) => {
        Alert.alert(
          'Lỗi',
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message
            || (e as Error)?.message
            || 'Đã xảy ra lỗi',
        );
      })
      .finally(() => setLoading(null));
  };

  const runReject = () => {
    if (typeof Alert.prompt === 'function') {
      Alert.prompt(
        'Từ chối huỷ PO',
        `PO #${poId} — nhập lý do từ chối (tối thiểu 3 ký tự)`,
        [
          { text: 'Hủy', style: 'cancel' },
          { text: 'Từ chối', onPress: (text?: string) => submitReject(String(text ?? '')) },
        ],
        'plain-text',
      );
      return;
    }
    Alert.alert('Từ chối huỷ PO', `Từ chối yêu cầu huỷ PO #${poId}?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Từ chối',
        onPress: () => submitReject('Từ chối huỷ PO qua Messenger'),
      },
    ]);
  };

  return (
    <View style={[styles.taskCard, { backgroundColor: '#1a1208', borderColor: '#9a5b2a55' }]}>
      <View style={styles.taskHeader}>
        <View style={styles.taskTitleRow}>
          <Ionicons name="ban-outline" size={16} color="#fb923c" />
          <Text style={[styles.taskTitle, { color: '#fb923c' }]} numberOfLines={2}>
            {title}
          </Text>
        </View>
        {isDone ? (
          <View style={[styles.badge, styles.badgeReject]}>
            <Text style={styles.badgeRejectText}>ĐÃ HUỶ</Text>
          </View>
        ) : null}
        {isRejected ? (
          <View style={[styles.badge, styles.badgeDone]}>
            <Text style={styles.badgeDoneText}>GIỮ PO</Text>
          </View>
        ) : null}
      </View>

      {isDone || isRejected ? (
        <View style={styles.taskStatusRow}>
          <View style={[styles.statusDot, { backgroundColor: isDone ? '#f43f5e' : '#f59e0b' }]} />
          <Text style={styles.taskStatusText}>
            {isDone ? 'PO đã được huỷ (CANCELLED).' : 'Yêu cầu huỷ đã bị từ chối — PO giữ nguyên.'}
          </Text>
        </View>
      ) : authorized ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionReject, loading === 'DONE' && styles.actionDisabled]}
            disabled={!!loading}
            onPress={runApprove}
          >
            {loading === 'DONE' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>Duyệt huỷ</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionApprove, loading === 'REJECT' && styles.actionDisabled]}
            disabled={!!loading}
            onPress={runReject}
          >
            {loading === 'REJECT' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>Từ chối huỷ</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.taskPendingText}>Chỉ CFO / CEO mới duyệt hoặc từ chối huỷ PO.</Text>
      )}
    </View>
  );
}

export function ChatMessageGeneratedTasks({ tasks, currentUser, messageBody, onTaskUpdated }: Props) {
  const list = Array.isArray(tasks) ? tasks : [];
  if (!list.length) return null;

  return (
    <View style={styles.wrap}>
      {list.map((task) => {
        if (task.source_module === 'erp_po_approval') {
          return (
            <PoTaskCard
              key={String(task.id)}
              task={task}
              currentUser={currentUser}
              onTaskUpdated={onTaskUpdated}
            />
          );
        }
        if (task.source_module === 'erp_po_cancel_approval') {
          return (
            <PoCancelTaskCard
              key={String(task.id)}
              task={task}
              currentUser={currentUser}
              onTaskUpdated={onTaskUpdated}
            />
          );
        }
        if (task.source_module === 'erp_pycvt_qaqc_approval') {
          return (
            <QaqcTaskCard
              key={String(task.id)}
              task={task}
              currentUser={currentUser}
              messageBody={messageBody}
              onTaskUpdated={onTaskUpdated}
            />
          );
        }
        if (task.source_module === 'group_delete_approval') {
          const isDone = task.status === 'DONE';
          const isRejected = task.status === 'REJECTED';
          const isCeo =
            String(currentUser?.username ?? '').toLowerCase() === 'ceo_hoai'
            || String(currentUser?.role_code ?? '').toUpperCase() === 'CEO';
          return (
            <View key={String(task.id)} style={[styles.taskCard, styles.deleteCard]}>
              <View style={styles.taskHeader}>
                <Text style={styles.deleteTitle}>DUYỆT XÓA NHÓM</Text>
                {isDone ? (
                  <View style={[styles.badge, styles.badgeDone]}>
                    <Text style={styles.badgeDoneText}>ĐÃ DUYỆT</Text>
                  </View>
                ) : null}
                {isRejected ? (
                  <View style={[styles.badge, styles.badgeReject]}>
                    <Text style={styles.badgeRejectText}>TỪ CHỐI</Text>
                  </View>
                ) : null}
              </View>
              {!isDone && !isRejected && isCeo ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionApprove]}
                    onPress={() => {
                      Alert.alert('Xác nhận', 'Duyệt xóa nhóm?', [
                        { text: 'Hủy', style: 'cancel' },
                        {
                          text: 'Duyệt',
                          onPress: () => {
                            void chatApi.transitionTask(task.id, 'DONE').then(() => onTaskUpdated?.());
                          },
                        },
                      ]);
                    }}
                  >
                    <Text style={styles.actionBtnText}>Duyệt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionReject]}
                    onPress={() => {
                      Alert.alert('Xác nhận', 'Từ chối xóa nhóm?', [
                        { text: 'Hủy', style: 'cancel' },
                        {
                          text: 'Từ chối',
                          style: 'destructive',
                          onPress: () => {
                            void chatApi.transitionTask(task.id, 'REJECT').then(() => onTaskUpdated?.());
                          },
                        },
                      ]);
                    }}
                  >
                    <Text style={[styles.actionBtnText, styles.actionRejectText]}>Từ chối</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        }
        const isDone = task.status === 'DONE';
        return (
          <View key={String(task.id)} style={[styles.miniTask, isDone ? styles.miniDone : styles.miniOpen]}>
            <Ionicons
              name={isDone ? 'checkmark-circle-outline' : 'clipboard-outline'}
              size={14}
              color={isDone ? '#34d399' : '#60a5fa'}
            />
            <Text style={[styles.miniText, { color: isDone ? '#34d399' : '#60a5fa' }]}>
              Task #{task.id}
              {isDone ? ' — ĐÃ XONG' : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    gap: 8,
    width: '100%',
    alignSelf: 'stretch',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    paddingTop: 8,
  },
  taskCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 8,
    width: '100%',
  },
  deleteCard: {
    backgroundColor: '#450a0a44',
    borderColor: '#ef444440',
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  taskTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 6, minWidth: 0 },
  taskTitle: { flex: 1, fontSize: 11, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },
  deleteTitle: { fontSize: 11, fontWeight: '800', color: '#f87171', letterSpacing: 0.3 },
  badge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  badgeDone: { backgroundColor: '#0f2e22', borderColor: '#2d6b52' },
  badgeDoneText: { fontSize: 10, fontWeight: '800', color: '#6ee7b7' },
  badgeReject: { backgroundColor: '#2a1212', borderColor: '#8b3a3a' },
  badgeRejectText: { fontSize: 10, fontWeight: '800', color: '#fecaca' },
  taskStatusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  taskStatusText: { flex: 1, fontSize: 12, color: '#c5d0dc', lineHeight: 17 },
  taskPendingText: { fontSize: 11, color: '#9db0c4', lineHeight: 16 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  actionApprove: { backgroundColor: '#059669' },
  actionReject: { backgroundColor: '#450a0a88', borderWidth: 1, borderColor: '#ef444466' },
  actionDisabled: { opacity: 0.6 },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  actionRejectText: { color: '#f87171' },
  miniTask: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  miniDone: { backgroundColor: '#10b98118' },
  miniOpen: { backgroundColor: '#3b82f618' },
  miniText: { fontSize: 11, fontWeight: '600' },
});
