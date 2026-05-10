import React, { memo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import type { TaskSummary, TaskStatus, TaskPriority } from "@/Models/task/types";

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TaskStatus, { label: string; bg: string; color: string }> = {
  PENDING:     { label: "Chờ",        bg: "#FEF3C7", color: "#92400E" },
  IN_PROGRESS: { label: "Đang làm",   bg: "#DBEAFE", color: "#1E40AF" },
  DONE:        { label: "Hoàn thành", bg: "#D1FAE5", color: "#065F46" },
  REJECTED:    { label: "Từ chối",   bg: "#FEE2E2", color: "#991B1B" },
  BLOCKED:     { label: "Bị chặn",    bg: "#FED7AA", color: "#9A3412" },
};

const PRIORITY_CONFIG: Record<TaskPriority, { icon: string; color: string }> = {
  high:   { icon: "🔴", color: "#DC2626" },
  medium: { icon: "🟡", color: "#D97706" },
  low:    { icon: "🟢", color: "#16A34A" },
};

// ── Helper ────────────────────────────────────────────────────────────────────

function formatDeadline(deadline: string | null): { text: string; overdue: boolean } | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = d < today;
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);

  let text: string;
  if (diff === 0)       text = "Hôm nay";
  else if (diff === 1)  text = "Ngày mai";
  else if (diff === -1) text = "Hôm qua";
  else if (diff < 0)    text = `Trễ ${Math.abs(diff)} ngày`;
  else                  text = `${d.getDate()}/${d.getMonth() + 1}`;

  return { text, overdue };
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  task: TaskSummary;
  onPress: (task: TaskSummary) => void;
};

export const TaskItem = memo(function TaskItem({ task, onPress }: Props) {
  const statusCfg   = STATUS_CONFIG[task.status];
  const priorityCfg = PRIORITY_CONFIG[task.priority ?? "medium"];
  const deadline    = formatDeadline(task.deadline);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(task)}
      activeOpacity={0.7}
    >
      {/* Row 1: priority icon + title + status badge */}
      <View style={styles.row}>
        <Text style={styles.priorityIcon}>{priorityCfg.icon}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {task.title}
        </Text>
        <View style={[styles.badge, { backgroundColor: statusCfg.bg }]}>
          <Text style={[styles.badgeText, { color: statusCfg.color }]}>
            {statusCfg.label}
          </Text>
        </View>
      </View>

      {/* Row 2: meta info */}
      <View style={styles.meta}>
        {/* Assignee */}
        {task.assignee && (
          <Text style={styles.metaText} numberOfLines={1}>
            👤 {task.assignee.full_name}
          </Text>
        )}

        {/* Deadline */}
        {deadline && (
          <Text style={[styles.metaText, deadline.overdue && styles.overdueText]}>
            📅 {deadline.text}
          </Text>
        )}

        {/* Conversation */}
        {task.conversation && (
          <Text style={styles.metaText} numberOfLines={1}>
            💬 {task.conversation.name}
          </Text>
        )}

        {/* Attachment count */}
        {task.attachment_count > 0 && (
          <Text style={styles.metaText}>
            📎 {task.attachment_count}
          </Text>
        )}

        {/* Progress bar (IN_PROGRESS tasks) */}
        {task.status === 'IN_PROGRESS' && (task.progress_pct ?? 0) > 0 && (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${task.progress_pct}%` as any }]} />
            </View>
            <Text style={styles.progressLabel}>{task.progress_pct}%</Text>
          </View>
        )}

        {/* QLNM source badge */}
        {task.source_module === 'qlnm' && (
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceText}>🏭 QLNM</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 10,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  priorityIcon: {
    fontSize: 14,
    marginTop: 1,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    lineHeight: 20,
  },
  badge: {
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: "flex-start",
    marginLeft: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
    gap: 8,
  },
  metaText: {
    fontSize: 12,
    color: "#6B7280",
  },
  overdueText: {
    color: "#DC2626",
    fontWeight: "600",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
    marginTop: 2,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    backgroundColor: "#3B82F6",
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 11,
    color: "#6B7280",
    minWidth: 28,
    textAlign: "right",
  },
  sourceBadge: {
    backgroundColor: "#F3F4F6",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  sourceText: {
    fontSize: 10,
    color: "#6B7280",
    fontWeight: "600",
  },
});
