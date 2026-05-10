import React, { useState, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { taskApi, extractTaskApiError } from "@/services/api/taskApi";
import type { TaskPriority } from "@/Models/task/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type Member = { id: number; full_name: string };

type Props = {
  visible: boolean;
  /** Message đang được tạo task từ */
  sourceMessage: { id: number; body: string } | null;
  /** Danh sách member trong room để chọn assignee */
  roomMembers?: Member[];
  onClose: () => void;
};

// ── Priority options ──────────────────────────────────────────────────────────

const PRIORITIES: { key: TaskPriority; label: string; color: string }[] = [
  { key: "high",   label: "🔴 Cao",         color: "#DC2626" },
  { key: "medium", label: "🟡 Trung bình",  color: "#D97706" },
  { key: "low",    label: "🟢 Thấp",        color: "#16A34A" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function CreateTaskModal({ visible, sourceMessage, roomMembers = [], onClose }: Props) {
  const router = useRouter();

  // ── Form state ─────────────────────────────────────────────────────────────
  const [title, setTitle]           = useState("");
  const [priority, setPriority]     = useState<TaskPriority>("medium");
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [deadline, setDeadline]     = useState("");  // "YYYY-MM-DD"
  const [submitting, setSubmitting] = useState(false);

  // Reset form khi mở modal mới
  const handleOpen = useCallback(() => {
    setTitle(sourceMessage?.body ? sourceMessage.body.slice(0, 200) : "");
    setPriority("medium");
    setAssigneeId(null);
    setDeadline("");
  }, [sourceMessage]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!sourceMessage) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert("Thiếu thông tin", "Vui lòng nhập tên công việc.");
      return;
    }

    // Validate deadline format
    if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
      Alert.alert("Sai định dạng", "Ngày hạn phải theo định dạng YYYY-MM-DD.");
      return;
    }

    setSubmitting(true);
    try {
      const { task, deduplicated } = await taskApi.createTaskFromMessage({
        source_message_id:   sourceMessage.id,
        title:               trimmedTitle,
        priority,
        assigned_to_user_id: assigneeId ?? undefined,
        deadline:            deadline || undefined,
      });

      onClose();

      if (deduplicated) {
        Alert.alert(
          "Task đã tồn tại",
          "Tin nhắn này đã có task. Mở task để xem chi tiết?",
          [
            { text: "Hủy", style: "cancel" },
            {
              text: "Mở task",
              onPress: () => router.push({ pathname: "/tasks/[id]", params: { id: String(task.id) } }),
            },
          ]
        );
      } else {
        // Navigate thẳng vào TaskDetail
        router.push({ pathname: "/tasks/[id]", params: { id: String(task.id) } });
      }
    } catch (err) {
      const { message } = extractTaskApiError(err);
      Alert.alert("Lỗi tạo task", message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onShow={handleOpen}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          {/* Handle bar */}
          <View style={styles.handle} />

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>📋 Tạo công việc</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Source message preview */}
            {sourceMessage?.body ? (
              <View style={styles.sourcePreview}>
                <Text style={styles.sourceLabel}>Từ tin nhắn:</Text>
                <Text style={styles.sourceBody} numberOfLines={2}>
                  {sourceMessage.body}
                </Text>
              </View>
            ) : null}

            {/* Title */}
            <View style={styles.field}>
              <Text style={styles.label}>Tên công việc *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Nhập tên công việc..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={2}
                maxLength={500}
                autoFocus
              />
            </View>

            {/* Priority */}
            <View style={styles.field}>
              <Text style={styles.label}>Độ ưu tiên</Text>
              <View style={styles.priorityRow}>
                {PRIORITIES.map((p) => (
                  <TouchableOpacity
                    key={p.key}
                    style={[
                      styles.priorityChip,
                      priority === p.key && { borderColor: p.color, backgroundColor: p.color + "18" },
                    ]}
                    onPress={() => setPriority(p.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.priorityChipText,
                      priority === p.key && { color: p.color, fontWeight: "700" },
                    ]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Assignee (nếu có members) */}
            {roomMembers.length > 0 && (
              <View style={styles.field}>
                <Text style={styles.label}>Giao cho</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.assigneeRow}
                >
                  <TouchableOpacity
                    style={[styles.assigneeChip, assigneeId === null && styles.assigneeChipActive]}
                    onPress={() => setAssigneeId(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.assigneeChipText,
                      assigneeId === null && styles.assigneeChipTextActive,
                    ]}>
                      Chưa giao
                    </Text>
                  </TouchableOpacity>
                  {roomMembers.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[
                        styles.assigneeChip,
                        assigneeId === m.id && styles.assigneeChipActive,
                      ]}
                      onPress={() => setAssigneeId(m.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.assigneeChipText,
                        assigneeId === m.id && styles.assigneeChipTextActive,
                      ]}>
                        {m.full_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Deadline */}
            <View style={styles.field}>
              <Text style={styles.label}>Hạn hoàn thành (tùy chọn)</Text>
              <TextInput
                style={[styles.input, styles.inputSingle]}
                value={deadline}
                onChangeText={setDeadline}
                placeholder="YYYY-MM-DD  (vd: 2026-05-20)"
                placeholderTextColor="#9CA3AF"
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
            </View>

            {/* Submit button */}
            <TouchableOpacity
              style={[styles.createBtn, submitting && styles.createBtnDisabled]}
              onPress={handleCreate}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.createBtnText}>Tạo công việc</Text>
              )}
            </TouchableOpacity>

            <View style={{ height: Platform.OS === "ios" ? 20 : 12 }} />
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 8,
    maxHeight: "90%",
  },
  handle: {
    width: 36, height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  headerTitle:  { fontSize: 16, fontWeight: "700", color: "#111827" },
  closeBtn:     { padding: 4 },
  closeBtnText: { fontSize: 18, color: "#9CA3AF" },

  // Source preview
  sourcePreview: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8, padding: 10,
    marginBottom: 12,
    borderLeftWidth: 3, borderLeftColor: "#6366F1",
  },
  sourceLabel: { fontSize: 11, color: "#6B7280", marginBottom: 2 },
  sourceBody:  { fontSize: 13, color: "#374151", lineHeight: 18 },

  // Fields
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: "#E5E7EB",
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: "#111827", backgroundColor: "#F9FAFB",
    textAlignVertical: "top",
  },
  inputSingle: { height: 44, textAlignVertical: "center" },

  // Priority chips
  priorityRow: { flexDirection: "row", gap: 8 },
  priorityChip: {
    borderWidth: 1.5, borderColor: "#E5E7EB",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  priorityChipText: { fontSize: 13, color: "#6B7280" },

  // Assignee chips
  assigneeRow: { gap: 8, paddingVertical: 2 },
  assigneeChip: {
    borderWidth: 1, borderColor: "#E5E7EB",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: "#F9FAFB",
  },
  assigneeChipActive:     { borderColor: "#6366F1", backgroundColor: "#EEF2FF" },
  assigneeChipText:       { fontSize: 13, color: "#374151" },
  assigneeChipTextActive: { color: "#4338CA", fontWeight: "600" },

  // Submit
  createBtn: {
    backgroundColor: "#6366F1",
    borderRadius: 12, paddingVertical: 14,
    alignItems: "center", marginTop: 6,
  },
  createBtnDisabled: { backgroundColor: "#A5B4FC" },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
