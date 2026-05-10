import { httpClient } from "./httpClient";
import type {
  CreateTaskFromMessagePayload,
  CreateTaskPayload,
  MessageTasksResponse,
  MyTasksFilter,
  MyTasksResponse,
  RegisterAttachmentPayload,
  RoomTasksFilter,
  RoomTasksResponse,
  TaskAttachment,
  TaskComment,
  TaskDetail,
  UpdateTaskPayload,
  UpdateTaskStatusPayload,
} from "@/Models/task/types";

// ─────────────────────────────────────────────────────────────────────────────
// Task API — Sprint M1
// Prefix: /mobile/*
// Auth: injected automatically by httpClient interceptor (Bearer token)
// ─────────────────────────────────────────────────────────────────────────────

export const taskApi = {

  // ── 1. GET /mobile/tasks — My Tasks ────────────────────────────────────────

  async getMyTasks(params?: MyTasksFilter): Promise<MyTasksResponse> {
    const { data } = await httpClient.get<MyTasksResponse>("/mobile/tasks", {
      params,
    });
    return data;
  },

  // ── 2. GET /mobile/tasks/{id} — Task Detail ─────────────────────────────────

  async getTaskDetail(taskId: number): Promise<TaskDetail> {
    const { data } = await httpClient.get<{ task: TaskDetail }>(
      `/mobile/tasks/${taskId}`
    );
    return data.task;
  },

  // ── 3. POST /mobile/tasks — Create Manual ──────────────────────────────────

  async createTask(payload: CreateTaskPayload): Promise<TaskDetail> {
    const { data } = await httpClient.post<{ task: TaskDetail }>(
      "/mobile/tasks",
      payload
    );
    return data.task;
  },

  // ── 4. POST /mobile/tasks/from-message ─────────────────────────────────────

  async createTaskFromMessage(
    payload: CreateTaskFromMessagePayload
  ): Promise<{ task: TaskDetail; deduplicated: boolean; message: string }> {
    const { data } = await httpClient.post<{
      task: TaskDetail;
      deduplicated: boolean;
      message: string;
    }>("/mobile/tasks/from-message", payload);
    return data;
  },

  // ── 5. PATCH /mobile/tasks/{id} — Update Fields ────────────────────────────

  async updateTask(taskId: number, payload: UpdateTaskPayload): Promise<TaskDetail> {
    const { data } = await httpClient.patch<{ task: TaskDetail }>(
      `/mobile/tasks/${taskId}`,
      payload
    );
    return data.task;
  },

  // ── 6. PATCH /mobile/tasks/{id}/status — Update Status ────────────────────

  /**
   * Returns { task, message } on success.
   * On invalid transition (422) → axios throws → caller must catch.
   *
   * Error shape: { error: 'invalid_transition', current_status, requested_status }
   */
  async updateTaskStatus(
    taskId: number,
    payload: UpdateTaskStatusPayload
  ): Promise<{ task: TaskDetail; message: string }> {
    const { data } = await httpClient.patch<{ task: TaskDetail; message: string }>(
      `/mobile/tasks/${taskId}/status`,
      payload
    );
    return data;
  },

  // ── 7. POST /mobile/tasks/{id}/attachments — Register Attachment ───────────

  /**
   * Gọi sau khi GCS upload hoàn thành.
   * On duplicate (409) → axios throws → caller must catch.
   */
  async registerAttachment(
    taskId: number,
    payload: RegisterAttachmentPayload
  ): Promise<{ attachment: TaskAttachment; message: string }> {
    const { data } = await httpClient.post<{
      attachment: TaskAttachment;
      message: string;
    }>(`/mobile/tasks/${taskId}/attachments`, payload);
    return data;
  },

  // ── 8. POST /mobile/tasks/{id}/comments — Add Comment ─────────────────────

  async addComment(
    taskId: number,
    body: string
  ): Promise<{ comment: TaskComment }> {
    const { data } = await httpClient.post<{ comment: TaskComment }>(
      `/mobile/tasks/${taskId}/comments`,
      { body }
    );
    return data;
  },

  // ── 9. GET /mobile/rooms/{conv}/tasks — Room Tasks ────────────────────────

  async getRoomTasks(
    conversationId: number,
    params?: RoomTasksFilter
  ): Promise<RoomTasksResponse> {
    const { data } = await httpClient.get<RoomTasksResponse>(
      `/mobile/rooms/${conversationId}/tasks`,
      { params }
    );
    return data;
  },

  // ── 10. GET /mobile/messages/{msg}/tasks — Message Linked Tasks ────────────

  async getMessageTasks(messageId: number): Promise<MessageTasksResponse> {
    const { data } = await httpClient.get<MessageTasksResponse>(
      `/mobile/messages/${messageId}/tasks`
    );
    return data;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Error helpers — dùng trong UI để extract lỗi có kiểu
// ─────────────────────────────────────────────────────────────────────────────

import type { AxiosError } from "axios";

type ApiErrorBody = {
  error?: string;
  message?: string;
  errors?: Record<string, string[]>;
  current_status?: string;
  requested_status?: string;
};

/** Extract error message từ AxiosError — dùng trong catch block UI */
export function extractTaskApiError(err: unknown): {
  type: "invalid_transition" | "duplicate_attachment" | "forbidden" | "validation" | "unknown";
  message: string;
  errors?: Record<string, string[]>;
  currentStatus?: string;
  requestedStatus?: string;
} {
  const axiosErr = err as AxiosError<ApiErrorBody>;
  const body = axiosErr?.response?.data;
  const status = axiosErr?.response?.status;

  if (body?.error === "invalid_transition") {
    return {
      type: "invalid_transition",
      message: body.message ?? "Không thể chuyển trạng thái này.",
      currentStatus: body.current_status,
      requestedStatus: body.requested_status,
    };
  }

  if (body?.error === "duplicate_attachment" || status === 409) {
    return {
      type: "duplicate_attachment",
      message: body?.message ?? "File này đã được đính kèm trước đó.",
    };
  }

  if (status === 403) {
    return {
      type: "forbidden",
      message: body?.message ?? "Bạn không có quyền thực hiện thao tác này.",
    };
  }

  if (status === 422 && body?.errors) {
    const firstError = Object.values(body.errors)[0]?.[0] ?? "Dữ liệu không hợp lệ.";
    return { type: "validation", message: firstError, errors: body.errors };
  }

  return {
    type: "unknown",
    message: body?.message ?? "Đã có lỗi xảy ra. Vui lòng thử lại.",
  };
}
