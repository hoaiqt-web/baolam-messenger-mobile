import { useState, useCallback, useRef } from "react";
import { taskApi, extractTaskApiError } from "@/services/api/taskApi";
import type { TaskSummary, TaskStatus, MyTasksFilter } from "@/Models/task/types";

type FilterTab = "all" | "pending" | "in_progress" | "done";

const FILTER_TO_STATUS: Record<FilterTab, TaskStatus | undefined> = {
  all:         undefined,
  pending:     "PENDING",
  in_progress: "IN_PROGRESS",
  done:        "DONE",
};

type UseMyTasksReturn = {
  tasks: TaskSummary[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  filterTab: FilterTab;
  summary: { total: number; pending: number; in_progress: number; done: number } | null;
  hasMore: boolean;
  setFilter: (tab: FilterTab) => void;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
};

export function useMyTasks(): UseMyTasksReturn {
  const [tasks, setTasks]         = useState<TaskSummary[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [summary, setSummary]     = useState<UseMyTasksReturn["summary"]>(null);
  const [page, setPage]           = useState(1);
  const [hasMore, setHasMore]     = useState(false);

  // Ref để tránh race condition khi filter thay đổi nhanh
  const currentFilterRef = useRef<FilterTab>("all");

  const fetchTasks = useCallback(async (tab: FilterTab, currentPage: number, append: boolean) => {
    const params: MyTasksFilter = {
      filter:   tab === "all" ? "all" : "assigned_to_me",
      status:   FILTER_TO_STATUS[tab],
      page:     currentPage,
      per_page: 20,
    };

    try {
      const res = await taskApi.getMyTasks(params);

      // Guard: nếu filter đã đổi khi request đang bay → bỏ qua
      if (currentFilterRef.current !== tab) return;

      setTasks(prev => append ? [...prev, ...res.data] : res.data);
      setSummary(res.summary);
      setHasMore(currentPage < res.meta.last_page);
      setError(null);
    } catch (err) {
      if (currentFilterRef.current !== tab) return;
      const { message } = extractTaskApiError(err);
      setError(message);
    }
  }, []);

  // Initial load + reload khi mount
  const load = useCallback(async (tab: FilterTab) => {
    setLoading(true);
    setPage(1);
    setTasks([]);
    await fetchTasks(tab, 1, false);
    setLoading(false);
  }, [fetchTasks]);

  // Pull-to-refresh
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setPage(1);
    await fetchTasks(currentFilterRef.current, 1, false);
    setRefreshing(false);
  }, [fetchTasks]);

  // Infinite scroll
  const loadMore = useCallback(async () => {
    if (!hasMore || loading || refreshing) return;
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchTasks(currentFilterRef.current, nextPage, true);
  }, [hasMore, loading, refreshing, page, fetchTasks]);

  // Filter change
  const setFilter = useCallback((tab: FilterTab) => {
    currentFilterRef.current = tab;
    setFilterTab(tab);
    load(tab);
  }, [load]);

  // Initial load once
  const initialLoadDone = useRef(false);
  if (!initialLoadDone.current) {
    initialLoadDone.current = true;
    load("all");
  }

  return { tasks, loading, refreshing, error, filterTab, summary, hasMore, setFilter, refresh, loadMore };
}
