import React from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
  StyleSheet, SafeAreaView,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTaskDetail } from "@/hooks/useTaskDetail";
import { useTaskAttachmentUpload } from "@/hooks/useTaskAttachmentUpload";
import { TaskEvidenceUploadButton } from "@/components/task/TaskEvidenceUploadButton";
import type { TaskDetail, TaskStatus, TaskAttachment, TaskComment } from "@/Models/task/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING:     "Chờ xử lý",
  IN_PROGRESS: "Đang làm",
  DONE:        "Hoàn thành",
  REJECTED:    "Từ chối",
  BLOCKED:     "Bị chặn",
};

const STATUS_COLOR: Record<TaskStatus, { bg: string; text: string }> = {
  PENDING:     { bg: "#FEF3C7", text: "#92400E" },
  IN_PROGRESS: { bg: "#DBEAFE", text: "#1E40AF" },
  DONE:        { bg: "#D1FAE5", text: "#065F46" },
  REJECTED:    { bg: "#FEE2E2", text: "#991B1B" },
  BLOCKED:     { bg: "#FED7AA", text: "#9A3412" },
};

const PRIORITY_LABEL = { high: "Cao 🔴", medium: "Trung bình 🟡", low: "Thấp 🟢" };

function formatDate(d: string | null): string {
  if (!d) return "Không có";
  const date = new Date(d);
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

function formatDateTime(d: string): string {
  const date = new Date(d);
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m} ${date.getDate()}/${date.getMonth() + 1}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function AttachmentList({ attachments }: { attachments: TaskAttachment[] }) {
  if (attachments.length === 0) return null;

  const images  = attachments.filter((a) => a.is_image);
  const others  = attachments.filter((a) => !a.is_image);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>📎 Bằng chứng đính kèm ({attachments.length})</Text>

      {/* Image thumbnails grid */}
      {images.length > 0 && (
        <View style={styles.imageGrid}>
          {images.map((att) => (
            <Image
              key={att.id}
              source={{ uri: att.public_url ?? undefined }}
              style={styles.imageThumbnail}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ))}
        </View>
      )}

      {/* Non-image files */}
      {others.map((att) => (
        <View key={att.id} style={styles.attachmentRow}>
          <Text style={styles.attachIcon}>📄</Text>
          <View style={styles.attachInfo}>
            <Text style={styles.attachName} numberOfLines={1}>{att.original_name}</Text>
            <Text style={styles.attachMeta}>
              {att.size_human} · {att.uploader?.full_name ?? "Hệ thống"}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const COMMENT_TYPE_ICON: Record<string, string> = {
  comment:          "💬",
  status_change:    "🔄",
  assignment:       "👤",
  attachment_added: "📎",
  system:           "🤖",
};

function CommentList({ comments }: { comments: TaskComment[] }) {
  if (comments.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>📋 Hoạt động ({comments.length})</Text>
      {comments.map((c) => (
        <View key={c.id} style={styles.commentRow}>
          <Text style={styles.commentIcon}>
            {COMMENT_TYPE_ICON[c.type] ?? "📌"}
          </Text>
          <View style={styles.commentContent}>
            <View style={styles.commentHeader}>
              <Text style={styles.commentUser}>{c.user.full_name}</Text>
              <Text style={styles.commentTime}>{formatDateTime(c.created_at)}</Text>
            </View>
            <Text style={[
              styles.commentBody,
              c.type !== "comment" && styles.commentBodySystem,
            ]}>
              {c.body}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Action buttons logic ──────────────────────────────────────────────────────

type ActionConfig = { label: string; nextStatus: TaskStatus; color: string } | null;

function getActions(task: TaskDetail): { primary: ActionConfig; secondary: ActionConfig } {
  // PO Approval specific flow
  if (task.source_module === "erp_po_approval") {
    if (task.status === "PENDING") {
      return {
        primary:   { label: "✅ Duyệt mua",    nextStatus: "DONE",     color: "#16A34A" },
        secondary: { label: "❌ Từ chối",     nextStatus: "REJECTED",    color: "#DC2626" },
      };
    }
    if (task.status === "DONE" || task.status === "REJECTED") {
      return { primary: null, secondary: null }; // Cannot undo PO action from mobile yet
    }
  }

  switch (task.status) {
    case "PENDING":
      return {
        primary:   { label: "▶ Bắt đầu",    nextStatus: "IN_PROGRESS", color: "#2563EB" },
        secondary: { label: "✕ Từ chối",     nextStatus: "REJECTED",    color: "#DC2626" },
      };
    case "IN_PROGRESS":
      return {
        primary:   { label: "✓ Hoàn thành", nextStatus: "DONE",        color: "#16A34A" },
        secondary: { label: "↩ Hoàn tác",   nextStatus: "PENDING",     color: "#6B7280" },
      };
    case "DONE":
      return {
        primary:   null,
        secondary: { label: "↩ Mở lại",     nextStatus: "PENDING",     color: "#6B7280" },
      };
    default:
      return { primary: null, secondary: null };
  }
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function TaskDetailScreen() {
  const router  = useRouter();
  const params  = useLocalSearchParams<{ id: string }>();
  const taskId  = Number(params.id);

  const { task, loading, error, updating, refresh, updateStatus, setTask } = useTaskDetail(taskId);

  const { uploadState, pickAndUpload, canUpload } = useTaskAttachmentUpload(
    task,
    (updated) => setTask(updated),
  );

  const handleStatusAction = async (cfg: ActionConfig) => {
    if (!cfg || !task) return;
    Alert.alert(
      cfg.label,
      `Xác nhận chuyển sang "${STATUS_LABEL[cfg.nextStatus]}"?`,
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Xác nhận",
          onPress: async () => {
            const { ok, error: err } = await updateStatus(cfg.nextStatus);
            if (!ok) Alert.alert("Lỗi", err ?? "Không thể cập nhật trạng thái.");
          },
        },
      ]
    );
  };

  // ── States ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Đang tải...</Text>
      </SafeAreaView>
    );
  }

  if (error || !task) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{error ?? "Không tìm thấy task."}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={refresh}>
          <Text style={styles.retryText}>Thử lại</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const statusCfg = STATUS_COLOR[task.status];
  const actions   = getActions(task);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      {/* Custom header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Chi tiết công việc</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#6366F1" />
        }
      >
        {/* ── Title + badges ─────────────────────────────────────────────── */}
        <View style={styles.titleCard}>
          <Text style={styles.taskTitle}>{task.title}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: statusCfg.bg }]}>
              <Text style={[styles.badgeText, { color: statusCfg.text }]}>
                {STATUS_LABEL[task.status]}
              </Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {PRIORITY_LABEL[task.priority ?? "medium"]}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Info block ─────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Thông tin</Text>
          <InfoRow label="Người giao"   value={task.creator?.full_name ?? "AI"} />
          <InfoRow label="Người nhận"   value={task.assignee?.full_name ?? "Chưa giao"} />
          <InfoRow label="Hạn hoàn thành" value={formatDate(task.deadline)} />
          {task.completed_at && (
            <InfoRow label="Hoàn thành lúc" value={formatDateTime(task.completed_at)} />
          )}
          {task.conversation && (
            <InfoRow label="Phòng chat" value={task.conversation.name} />
          )}
        </View>

        {/* ── Description ────────────────────────────────────────────────── */}
        {task.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mô tả</Text>
            <Text style={styles.description}>{task.description}</Text>
          </View>
        ) : null}

        {/* ── Action buttons ──────────────────────────────────────────────── */}
        {(actions.primary || actions.secondary) && (
          <View style={styles.actionSection}>
            {updating && (
              <ActivityIndicator size="small" color="#6366F1" style={{ marginBottom: 8 }} />
            )}
            <View style={styles.actionRow}>
              {actions.primary && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: actions.primary.color }]}
                  onPress={() => handleStatusAction(actions.primary)}
                  disabled={updating}
                  activeOpacity={0.8}
                >
                  <Text style={styles.actionBtnText}>{actions.primary.label}</Text>
                </TouchableOpacity>
              )}
              {actions.secondary && (
                <TouchableOpacity
                  style={[styles.actionBtnOutline, { borderColor: actions.secondary.color }]}
                  onPress={() => handleStatusAction(actions.secondary)}
                  disabled={updating}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.actionBtnOutlineText, { color: actions.secondary.color }]}>
                    {actions.secondary.label}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ── Attachments ─────────────────────────────────────────────────── */}
        <AttachmentList attachments={task.attachments} />

        {/* ── Upload bằng chứng ───────────────────────────────────────────── */}
        {task.status !== "REJECTED" && (
          <View style={styles.uploadSection}>
            <Text style={styles.sectionTitle}>📸 Upload bằng chứng</Text>
            <TaskEvidenceUploadButton
              uploadState={uploadState}
              onPress={pickAndUpload}
              disabled={!canUpload || updating}
            />
          </View>
        )}

        {/* ── Comments / Activity ─────────────────────────────────────────── */}
        <CommentList comments={task.comments} />

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: "#F9FAFB" },
  scroll:  { flex: 1 },
  centered: {
    flex: 1, justifyContent: "center", alignItems: "center",
    backgroundColor: "#F9FAFB", gap: 10, padding: 24,
  },

  // Header
  header: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#fff", paddingHorizontal: 8,
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  backBtn:     { width: 36, alignItems: "center" },
  backIcon:    { fontSize: 28, color: "#6366F1", lineHeight: 32 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: "600", color: "#111827", textAlign: "center" },

  // Title card
  titleCard: {
    backgroundColor: "#fff", margin: 12, borderRadius: 12,
    padding: 16, gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  taskTitle: { fontSize: 17, fontWeight: "700", color: "#111827", lineHeight: 24 },
  badgeRow:  { flexDirection: "row", gap: 8 },
  badge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: "#F3F4F6",
  },
  badgeText: { fontSize: 12, fontWeight: "600", color: "#374151" },

  // Section
  section: {
    backgroundColor: "#fff", marginHorizontal: 12, marginBottom: 10,
    borderRadius: 12, padding: 14, gap: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#6B7280", marginBottom: 4 },

  // Info rows
  infoRow:   { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  infoLabel: { fontSize: 13, color: "#9CA3AF", flex: 1 },
  infoValue: { fontSize: 13, color: "#111827", fontWeight: "500", flex: 2, textAlign: "right" },

  // Description
  description: { fontSize: 14, color: "#374151", lineHeight: 20 },

  // Action buttons
  actionSection: {
    marginHorizontal: 12, marginBottom: 10,
    backgroundColor: "#fff", borderRadius: 12, padding: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  actionRow:    { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  actionBtnText:        { color: "#fff", fontWeight: "700", fontSize: 14 },
  actionBtnOutline: {
    flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  actionBtnOutlineText: { fontWeight: "700", fontSize: 14 },

  // Upload section
  uploadSection: {
    backgroundColor: "#fff", marginHorizontal: 12, marginBottom: 10,
    borderRadius: 12, padding: 14, gap: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },

  // Attachment
  imageGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6,
  },
  imageThumbnail: {
    width: 88, height: 88, borderRadius: 8, backgroundColor: "#F3F4F6",
  },
  attachmentRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#F3F4F6",
  },
  attachIcon: { fontSize: 22 },
  attachInfo: { flex: 1 },
  attachName: { fontSize: 13, color: "#111827", fontWeight: "500" },
  attachMeta: { fontSize: 11, color: "#9CA3AF", marginTop: 1 },

  // Comment
  commentRow: {
    flexDirection: "row", gap: 8, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#F3F4F6",
  },
  commentIcon:       { fontSize: 16, marginTop: 2 },
  commentContent:    { flex: 1 },
  commentHeader:     { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  commentUser:       { fontSize: 12, fontWeight: "600", color: "#374151" },
  commentTime:       { fontSize: 11, color: "#9CA3AF" },
  commentBody:       { fontSize: 13, color: "#111827", lineHeight: 18 },
  commentBodySystem: { color: "#6B7280", fontStyle: "italic" },

  // States
  loadingText: { fontSize: 13, color: "#9CA3AF", marginTop: 8 },
  errorIcon:   { fontSize: 36, marginBottom: 4 },
  errorText:   { fontSize: 14, color: "#374151", textAlign: "center" },
  retryBtn:    { marginTop: 12, backgroundColor: "#6366F1", paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  retryText:   { color: "#fff", fontWeight: "600" },
});
