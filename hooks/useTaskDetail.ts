import { useState, useCallback, useRef } from "react";
import { taskApi, extractTaskApiError } from "@/services/api/taskApi";
import type { TaskDetail, TaskStatus } from "@/Models/task/types";

type UseTaskDetailReturn = {
  task: TaskDetail | null;
  loading: boolean;
  error: string | null;
  updating: boolean;
  refresh: () => Promise<void>;
  setTask: (task: TaskDetail) => void;
  updateStatus: (status: TaskStatus, note?: string) => Promise<{ ok: boolean; error?: string }>;
};

export function useTaskDetail(taskId: number): UseTaskDetailReturn {
  const [task, setTask]       = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const fetch = useCallback(async () => {
    try {
      const detail = await taskApi.getTaskDetail(taskId);
      setTask(detail);
      setError(null);
    } catch (err) {
      const { message } = extractTaskApiError(err);
      setError(message);
    }
  }, [taskId]);

  // Initial load (idempotent via ref)
  const loadedRef = useRef(false);
  if (!loadedRef.current) {
    loadedRef.current = true;
    fetch().finally(() => setLoading(false));
  }

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetch();
    setLoading(false);
  }, [fetch]);

  const updateStatus = useCallback(async (
    status: TaskStatus,
    note?: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!task) return { ok: false, error: "Task chưa load xong." };
    setUpdating(true);
    try {
      const { task: updated } = await taskApi.updateTaskStatus(task.id, { status, note });
      setTask(updated);
      return { ok: true };
    } catch (err) {
      const { message } = extractTaskApiError(err);
      return { ok: false, error: message };
    } finally {
      setUpdating(false);
    }
  }, [task]);

  return { task, loading, error, updating, refresh, setTask, updateStatus };
}
