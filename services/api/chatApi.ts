import type {
  CreateGroupConversationPayload,
  CreateGroupConversationResponse,
  ConversationMessagesResponse,
  ConversationsResponse,
  ChatDirectorySearchResponse,
  ChatUserSearchResponse,
  MarkConversationReadResponse,
  OpenDirectConversationResponse,
  PresignAttachmentsPayload,
  PresignAttachmentsResponse,
  SendMessagePayload,
  SendMessageResponse,
  MessageReactionsResponse,
  MessageReadReceiptsResponse,
  GlobalSearchResponse,
  MessageSearchResponse,
  ImageGalleryPageResponse,
} from "@/Models/chat/types";

import { httpClient } from "./httpClient";

type AiSummarizePayload = {
  conversationId: number;
  question: string;
  from: string;
  to: string;
  dryRun?: boolean;
};

export type AiSummarizeData = {
  traceId: string;
  provider: string;
  model: string;
  summary: string;
  highlights: string[];
  actionItems: string[];
  risks: string[];
};

type AiSummarizeResponse = {
  success: boolean;
  data: AiSummarizeData;
};

/** Summary chunk from GET /ai/my-tasks (first page; fields optional if backend omits). */
export type MyTasksSummary = {
  pending?: number;
  done?: number;
  total?: number;
  assigned_pending?: number;
  created_pending?: number;
  overdue_pending?: number;
};

export type MyTasksResponse = {
  tasks: ConversationTask[];
  nextCursor: number | null;
  summary?: MyTasksSummary | null;
};

/** Personal Cloud file row — mirrors web `PersonalFileItem`. */
export type PersonalFileItem = {
  id: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category: 'image' | 'video' | 'document' | 'other';
  width: number | null;
  height: number | null;
  createdAt: string;
  url: string;
};

/** AI / checklist task row from chat API (shape matches web TaskChecklist + AiAssistant). */
export type ConversationTask = {
  id: number;
  task_title: string;
  status: string;
  approval_status?: string | null;
  created_at?: string;
  updated_at?: string;
  deadline?: string | null;
  assigned_to_user_id?: number | null;
  source_message_id?: number | null;
  conversation_id?: number;
  assigned_to_user?: { full_name?: string; fullName?: string } | null;
  owner_user?: { full_name?: string; fullName?: string } | null;
  confirmed_by_user?: { full_name?: string; fullName?: string } | null;
  /** Web: human vs AI confirmation */
  confirmed_by_ai?: boolean | null;
  completion_confidence?: number | null;
  completion_evidence_message_id?: number | null;
  /** Backend task domain (ERP vs messenger vs …) — hiển thị nhãn trên Trợ lý AI. */
  source_module?: string | null;
  source_message?: {
    sent_at?: string;
    created_at?: string;
    sender?: {
      full_name?: string;
      fullName?: string;
      id?: number;
    };
    sender_id?: number;
  } | null;
};

export const chatApi = {
  async getConversations(): Promise<ConversationsResponse> {
    const { data } = await httpClient.get<ConversationsResponse>("/conversations");

    return data;
  },
  async searchChatDirectory(query: string): Promise<ChatDirectorySearchResponse> {
    const { data } = await httpClient.get<ChatDirectorySearchResponse>("/conversations/directory-search", {
      params: { query },
    });

    return data;
  },
  async getMessages(
    conversationId: number,
    options?: {
      limit?: number;
      beforeMessageId?: number | null;
      filterUserId?: number | null;
      filterDays?: number | null;
      filterStartDate?: string | null;
      filterEndDate?: string | null;
    },
  ): Promise<ConversationMessagesResponse> {
    const { data } = await httpClient.get<ConversationMessagesResponse>(
      `/conversations/${conversationId}/messages`,
      {
        params: {
          limit: options?.limit,
          beforeMessageId: options?.beforeMessageId ?? undefined,
          filterUserId: options?.filterUserId ?? undefined,
          filterDays: options?.filterDays ?? undefined,
          filterStartDate: options?.filterStartDate ?? undefined,
          filterEndDate: options?.filterEndDate ?? undefined,
        },
      },
    );

    return data;
  },

  async getConversationDeleteInfo(conversationId: number): Promise<{
    conversationId: number;
    groupName: string;
    isOwner: boolean;
    messageCount: number;
    pendingTaskCount: number;
  }> {
    const { data } = await httpClient.get<{
      conversationId: number;
      groupName: string;
      isOwner: boolean;
      messageCount: number;
      pendingTaskCount: number;
    }>(`/conversations/${conversationId}/delete-info`);
    return data;
  },
  async markConversationRead(conversationId: number): Promise<MarkConversationReadResponse> {
    const { data } = await httpClient.post<MarkConversationReadResponse>(`/conversations/${conversationId}/read`);

    return data;
  },
  async sendMessage(conversationId: number, payload: SendMessagePayload): Promise<SendMessageResponse> {
    const { data } = await httpClient.post<SendMessageResponse>(`/conversations/${conversationId}/messages`, payload);

    return data;
  },
  async recallMessage(conversationId: number, messageId: number): Promise<SendMessageResponse> {
    const { data } = await httpClient.delete<SendMessageResponse>(`/conversations/${conversationId}/messages/${messageId}`);

    return data;
  },
  async presignAttachments(payload: PresignAttachmentsPayload): Promise<PresignAttachmentsResponse> {
    const { data } = await httpClient.post<PresignAttachmentsResponse>("/chat/attachments/presign", payload);

    return data;
  },
  async searchUsers(query: string): Promise<ChatUserSearchResponse> {
    const { data } = await httpClient.get<ChatUserSearchResponse>("/users/search", {
      params: { query },
    });

    return data;
  },
  async listUsersForGroup(): Promise<ChatUserSearchResponse> {
    const { data } = await httpClient.get<ChatUserSearchResponse>("/users/for-group");

    return data;
  },
  async getUserProfile(username: string): Promise<{ user: import("@/Models/chat/types").ChatUserSummary }> {
    const { data } = await httpClient.get<{ user: import("@/Models/chat/types").ChatUserSummary }>(
      `/users/${encodeURIComponent(username)}/profile`,
    );
    return data;
  },
  async openDirectConversation(username: string): Promise<OpenDirectConversationResponse> {
    const { data } = await httpClient.post<OpenDirectConversationResponse>("/conversations/direct", {
      username,
    });

    return data;
  },

  async openCloudConversation(): Promise<OpenDirectConversationResponse> {
    const { data } = await httpClient.post<OpenDirectConversationResponse>("/conversations/cloud");
    return data;
  },

  async getMyFiles(params?: { category?: string; cursor?: number }): Promise<{
    files: PersonalFileItem[];
    hasMore: boolean;
    nextCursor: number | null;
  }> {
    const { data } = await httpClient.get<{
      files: PersonalFileItem[];
      hasMore: boolean;
      nextCursor: number | null;
    }>("/my-files", { params });
    return data;
  },

  async presignMyFiles(
    files: Array<{ name: string; mimeType: string; sizeBytes: number }>,
  ): Promise<{
    items: Array<{
      objectKey: string;
      uploadUrl: string;
      headers: Record<string, string>;
      expiresAt: string;
    }>;
  }> {
    const { data } = await httpClient.post<{
      items: Array<{
        objectKey: string;
        uploadUrl: string;
        headers: Record<string, string>;
        expiresAt: string;
      }>;
    }>("/my-files/presign", { files });
    return data;
  },

  async confirmMyFiles(
    files: Array<{
      objectKey: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      width?: number | null;
      height?: number | null;
    }>,
  ): Promise<{ files: PersonalFileItem[] }> {
    const { data } = await httpClient.post<{ files: PersonalFileItem[] }>("/my-files", { files });
    return data;
  },

  async deleteMyFile(fileId: number): Promise<void> {
    await httpClient.delete(`/my-files/${fileId}`);
  },

  async getMyFileUrl(fileId: number): Promise<{ url: string }> {
    const { data } = await httpClient.get<{ url: string }>(`/my-files/${fileId}/url`);
    return data;
  },
  async createGroupConversation(payload: CreateGroupConversationPayload): Promise<CreateGroupConversationResponse> {
    const { data } = await httpClient.post<CreateGroupConversationResponse>("/conversations/group", payload);

    return data;
  },
  async updateGroupName(conversationId: number, name: string): Promise<void> {
    await httpClient.put(`/conversations/${conversationId}/name`, { name });
  },
  async updateGroupAvatar(conversationId: number, formData: FormData): Promise<{ conversation: import("@/Models/chat/types").ChatConversation }> {
    const { data } = await httpClient.post(`/conversations/${conversationId}/avatar`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },
  async deleteConversation(conversationId: number): Promise<void> {
    await httpClient.delete(`/conversations/${conversationId}`);
  },
  async removeGroupMember(conversationId: number, userId: number): Promise<{ conversation: import("@/Models/chat/types").ChatConversation }> {
    const { data } = await httpClient.delete(`/conversations/${conversationId}/members/${userId}`);
    return data;
  },
  async getPinnedMessages(conversationId: number): Promise<import("@/Models/chat/types").PinnedMessagesResponse> {
    const { data } = await httpClient.get<import("@/Models/chat/types").PinnedMessagesResponse>(`/conversations/${conversationId}/pins`);

    return data;
  },
  async getAttachments(conversationId: number): Promise<{ attachments: import("@/Models/chat/types").ChatAttachment[] }> {
    const { data } = await httpClient.get<{ attachments: import("@/Models/chat/types").ChatAttachment[] }>(`/conversations/${conversationId}/attachments`);
    return data;
  },
  async getImageAttachmentGallery(
    conversationId: number,
    options?: { limit?: number; beforeId?: number | null },
  ): Promise<ImageGalleryPageResponse> {
    const { data } = await httpClient.get<ImageGalleryPageResponse>(`/conversations/${conversationId}/attachments`, {
      params: {
        type: "image",
        limit: options?.limit ?? 30,
        beforeId: options?.beforeId ?? undefined,
      },
    });
    return data;
  },
  async addGroupMembers(conversationId: number, userIds: number[]): Promise<{ conversation: import("@/Models/chat/types").ChatConversation }> {
    const { data } = await httpClient.post(`/conversations/${conversationId}/members`, { userIds });
    return data;
  },
  async pinMessage(
    conversationId: number,
    messageId: number,
  ): Promise<{
    pin: {
      pinnedAt: string;
      message: import("@/Models/chat/types").ChatMessage;
    };
  }> {
    const { data } = await httpClient.post<{
      pin: {
        pinnedAt: string;
        message: import("@/Models/chat/types").ChatMessage;
      };
    }>(`/conversations/${conversationId}/messages/${messageId}/pin`);

    return data;
  },
  async unpinMessage(conversationId: number, messageId: number): Promise<void> {
    await httpClient.delete(`/conversations/${conversationId}/messages/${messageId}/unpin`);
  },
  async getMessageReactions(messageId: number): Promise<MessageReactionsResponse> {
    const { data } = await httpClient.get<MessageReactionsResponse>(`/messages/${messageId}/reactions`);
    return data;
  },
  async toggleReaction(messageId: number, type: string): Promise<{ action: string; type: string }> {
    const { data } = await httpClient.post<{ action: string; type: string }>(`/messages/${messageId}/reactions`, { type });
    return data;
  },
  async getMessageReadReceipts(conversationId: number, messageId: number): Promise<MessageReadReceiptsResponse> {
    const { data } = await httpClient.get<MessageReadReceiptsResponse>(
      `/conversations/${conversationId}/messages/${messageId}/read-receipts`,
    );
    return data;
  },
  async searchGlobal(query: string): Promise<GlobalSearchResponse> {
    const { data } = await httpClient.get<GlobalSearchResponse>("/chat/search", {
      params: { q: query },
    });
    return data;
  },
  async searchMessages(conversationId: number, query: string): Promise<MessageSearchResponse> {
    const { data } = await httpClient.get<MessageSearchResponse>(
      `/conversations/${conversationId}/messages/search`,
      { params: { q: query } },
    );
    return data;
  },
  async getMessagesAround(conversationId: number, messageId: number): Promise<ConversationMessagesResponse> {
    const { data } = await httpClient.get<ConversationMessagesResponse>(
      `/conversations/${conversationId}/messages/around/${messageId}`,
    );
    return data;
  },

  async getAttachmentEditSource(attachmentId: number): Promise<Blob> {
    const { data } = await httpClient.get<Blob>(
      `/chat/attachments/${attachmentId}/edit-source`,
      { responseType: 'blob' as never },
    );
    return data;
  },

  async sendDirectAttachment(conversationId: number, file: File): Promise<SendMessageResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await httpClient.post<SendMessageResponse>(
      `/conversations/${conversationId}/attachments/direct`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data;
  },

  async summarizeConversation(payload: AiSummarizePayload): Promise<AiSummarizeResponse> {
    const { data } = await httpClient.post<AiSummarizeResponse>("/ai/summarize", payload);
    return data;
  },

  async demoSummarizeConversation(payload: {
    conversationId: number;
    range?: string;
    includeAttachments?: boolean;
    objective?: string;
    groupName?: string;
  }): Promise<{ data?: unknown } & Record<string, unknown>> {
    const { data } = await httpClient.post("/ai/demo-summarize", payload);
    return data;
  },

  async ceoAgentReport(question: string): Promise<string | Record<string, unknown>> {
    const { data } = await httpClient.post<{ data?: unknown }>(
      "/ai/ceo-agent/report",
      { question },
    );
    const payload = data?.data ?? data;
    if (typeof payload === "string") return payload;
    if (payload && typeof payload === "object") {
      return payload as Record<string, unknown>;
    }
    return String(payload ?? "");
  },

  async getAttendanceToday(): Promise<{
    date: string;
    attendance: Array<{
      userId: number;
      fullName: string;
      employeeId: number;
      employeeCode: string | null;
      checkedIn: boolean;
      checkInTime: string | null;
      checkOutTime: string | null;
      status: string;
      hoursWorked: number | null;
    }>;
    error?: string;
  }> {
    const { data } = await httpClient.get("/users/attendance-today");
    return data;
  },

  async getAttendanceTodaySummary(): Promise<{
    date: string;
    badges: Array<{ userId: number; checkedIn: boolean }>;
    error?: string;
  }> {
    const { data } = await httpClient.get("/users/attendance-today/summary");
    return data;
  },

  async getAttendanceTodayForUser(userId: number): Promise<{
    date: string;
    userId: number;
    fullName: string;
    employeeId: number;
    employeeCode: string | null;
    checkedIn: boolean;
    checkInTime: string | null;
    checkOutTime: string | null;
    status: string;
    hoursWorked: number | null;
    error?: string;
  }> {
    const { data } = await httpClient.get(`/users/attendance-today/${userId}`);
    return data;
  },

  async setEmployeeId(
    userId: number,
    employeeId: number | null,
  ): Promise<unknown> {
    const { data } = await httpClient.patch(`/users/${userId}/employee-id`, {
      employee_id: employeeId,
    });
    return data;
  },

  async getEmployeeMapping(): Promise<unknown> {
    const { data } = await httpClient.get("/users/employee-mapping");
    return data;
  },

  async getConversationTasks(conversationId: number): Promise<{ tasks: ConversationTask[] }> {
    const { data } = await httpClient.get<{ tasks: ConversationTask[] }>(
      `/conversations/${conversationId}/tasks`,
    );
    return data;
  },

  async getMyTasks(
    filter?: string,
    cursor?: number | null,
    source?: "messenger" | "erp",
  ): Promise<MyTasksResponse> {
    const { data } = await httpClient.get<MyTasksResponse>("/ai/my-tasks", {
      params: { filter, cursor, source },
    });
    return data;
  },

  async transitionTask(
    taskId: number,
    action: string,
    extra?: { assigned_to_user_id?: number },
  ): Promise<{
    success: boolean;
    task?: unknown;
    error?: string;
    missingConditions?: string[];
    missing_conditions?: string[];
    message?: string;
  }> {
    const { data } = await httpClient.post(`/tasks/${taskId}/transition`, {
      action,
      ...extra,
    });
    return data;
  },

  async completeTask(taskId: number): Promise<{
    success: boolean;
    status: "DONE" | "NOT_DONE";
    missingConditions: string[];
    message: string;
    task?: unknown;
  }> {
    const { data } = await httpClient.post(`/tasks/${taskId}/complete`);
    return data;
  },

  async aiConfirmTask(taskId: number): Promise<unknown> {
    const { data } = await httpClient.post(`/tasks/${taskId}/ai-confirm`);
    return data;
  },

  async aiRejectTask(taskId: number): Promise<unknown> {
    const { data } = await httpClient.post(`/tasks/${taskId}/ai-reject`);
    return data;
  },

  async forceScan(): Promise<unknown> {
    const { data } = await httpClient.get("/ai/force-scan");
    return data;
  },

  async getUserWorkStatuses(names: string[]): Promise<{ statuses?: Array<{ user_id: number; full_name?: string; description?: string; updated_at?: string }> }> {
    const { data } = await httpClient.post("/user-work-statuses", { names });
    return data;
  },

  async updateUserWorkStatus(userId: number, description: string): Promise<unknown> {
    const { data } = await httpClient.post("/user-work-statuses/update", {
      user_id: userId,
      description,
    });
    return data;
  },

  async getUsersTasks(names: string[]): Promise<{ tasks?: Array<Record<string, unknown>> }> {
    const { data } = await httpClient.post("/ai/users-tasks", { names });
    return data;
  },

  async getColorSampleBoard(): Promise<{
    success?: boolean;
    summary?: {
      total: number;
      handoff: number;
      approved: number;
      draft: number;
      overdue: number;
      projects_qaqc_pending?: number;
      projects_ptk_pending_approve?: number;
    };
    by_project?: Array<{
      project_code: string;
      project_name?: string;
      handoff_count: number;
      approved_count: number;
      overdue_count: number;
      palettes: Array<{ id: number; palette_code: string; ptk_status: string | null; days_since_handoff: number }>;
    }>;
  }> {
    const { data } = await httpClient.get("/internal/design-room/color-sample-board");
    return data;
  },

  async markColorSampleDone(taskId: number, notesDone = ""): Promise<unknown> {
    const { data } = await httpClient.post(`/tasks/${taskId}/color-sample-done`, {
      notes_done: notesDone,
    });
    return data;
  },

  async createManualTask(
    conversationId: number,
    payload: {
      task_title: string;
      source_message_id: number | null;
      assigned_to_user_id?: number | null;
      priority?: "low" | "medium" | "high";
      deadline?: string | null;
    },
  ): Promise<{ task?: unknown; deduplicated?: boolean; message?: string }> {
    const { data } = await httpClient.post<{ task?: unknown; deduplicated?: boolean; message?: string }>(
      `/tasks/create-manual/${conversationId}`,
      payload,
    );
    return data;
  },

  async suggestTask(
    conversationId: number,
    messageId: number,
  ): Promise<{
    suggestedTitle: string;
    suggestedAssigneeId?: number;
    suggestedPriority?: "low" | "medium" | "high";
    suggestedDeadline?: string;
  } | null> {
    try {
      const { data } = await httpClient.post<{ tasks?: Array<Record<string, unknown>> }>("/ai/extract-tasks", {
        conversationId,
        messageId,
        limit: 1,
      });
      const task = data.tasks?.[0];
      if (!task) return null;
      return {
        suggestedTitle: String(task.task_title ?? ""),
        suggestedAssigneeId:
          task.assigned_to_user_id != null ? Number(task.assigned_to_user_id) : undefined,
        suggestedPriority:
          task.priority === "low" || task.priority === "high" || task.priority === "medium"
            ? task.priority
            : "medium",
        suggestedDeadline: task.deadline != null ? String(task.deadline) : undefined,
      };
    } catch {
      return null;
    }
  },

  async createQuickTask(
    conversationId: number,
    sourceMessageId: number,
  ): Promise<{ task?: unknown; deduplicated?: boolean; message?: string }> {
    const { data } = await httpClient.post<{ task?: unknown; deduplicated?: boolean; message?: string }>(
      `/tasks/create-quick/${conversationId}`,
      { source_message_id: sourceMessageId },
    );
    return data;
  },
};
