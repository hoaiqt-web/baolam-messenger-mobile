import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMyTasks } from "@/hooks/useMyTasks";
import { TaskItem } from "@/components/task/TaskItem";
import type { TaskSummary } from "@/Models/task/types";

// ── Filter tabs config ────────────────────────────────────────────────────────

type FilterTab = "all" | "pending" | "in_progress" | "done";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all",         label: "Tất cả" },
  { key: "pending",     label: "Chờ" },
  { key: "in_progress", label: "Đang làm" },
  { key: "done",        label: "Xong" },
];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MyTasksScreen() {
  const router = useRouter();
  const {
    tasks, loading, refreshing, error,
    filterTab, summary, hasMore,
    setFilter, refresh, loadMore,
  } = useMyTasks();

  const handleTaskPress = (task: TaskSummary) => {
    router.push({
      pathname: "/tasks/[id]",
      params: { id: String(task.id) },
    });
  };

  // ── Sub-renders ─────────────────────────────────────────────────────────────

  const renderFilterTabs = () => (
    <View style={styles.filterRow}>
      {FILTER_TABS.map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.filterTab, filterTab === tab.key && styles.filterTabActive]}
          onPress={() => setFilter(tab.key)}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterTabText, filterTab === tab.key && styles.filterTabTextActive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderSummaryBar = () => {
    if (!summary) return null;
    return (
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>
          {summary.pending > 0 && `⏳ ${summary.pending} chờ  `}
          {summary.in_progress > 0 && `🔄 ${summary.in_progress} đang làm  `}
          {summary.done > 0 && `✅ ${summary.done} xong`}
        </Text>
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.centerBox}>
        <Text style={styles.emptyIcon}>📋</Text>
        <Text style={styles.emptyTitle}>Chưa có công việc</Text>
        <Text style={styles.emptySubtitle}>
          {filterTab === "all"
            ? "Chưa có task nào được giao cho bạn."
            : "Không có task nào ở trạng thái này."}
        </Text>
      </View>
    );
  };

  const renderError = () => (
    <View style={styles.centerBox}>
      <Text style={styles.emptyIcon}>⚠️</Text>
      <Text style={styles.emptyTitle}>Đã có lỗi xảy ra</Text>
      <Text style={styles.emptySubtitle}>{error}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={refresh}>
        <Text style={styles.retryText}>Thử lại</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFooter = () => {
    if (!hasMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#6366F1" />
      </View>
    );
  };

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Công việc của tôi</Text>
      </View>

      {/* Filter tabs */}
      {renderFilterTabs()}

      {/* Summary bar */}
      {renderSummaryBar()}

      {/* Content */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>Đang tải...</Text>
        </View>
      ) : error ? (
        renderError()
      ) : (
        <FlatList<TaskSummary>
          data={tasks}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TaskItem task={item} onPress={handleTaskPress} />
          )}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor="#6366F1"
              colors={["#6366F1"]}
            />
          }
          contentContainerStyle={tasks.length === 0 ? styles.emptyContainer : styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  header: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },

  // Filter tabs
  filterRow: {
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
  },
  filterTabActive: {
    backgroundColor: "#6366F1",
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  filterTabTextActive: {
    color: "#fff",
    fontWeight: "600",
  },

  // Summary bar
  summaryBar: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "#EEF2FF",
  },
  summaryText: {
    fontSize: 12,
    color: "#4338CA",
    fontWeight: "500",
  },

  // List
  listContent: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  emptyContainer: {
    flex: 1,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: "center",
  },

  // Center states (empty / loading / error)
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 18,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    color: "#9CA3AF",
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: "#6366F1",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});
