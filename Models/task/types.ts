// ─────────────────────────────────────────────────────────────────────────────
// Task Types — Sprint M1
// Map 1-1 với backend Resource classes (Phase 7A)
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared sub-types ─────────────────────────────────────────────────────────

export type TaskUserRef = {
  id: number;
  full_name: string;
};

export type TaskConversationRef = {
  id: number;
  name: string;
  type?: "direct" | "group";
};

export type TaskSourceMessage = {
  id: number;
  body: string;
  sent_at: string; // ISO 8601
  sender: TaskUserRef | null;
};

// ── Enums ─────────────────────────────────────────────────────────────────────

export type TaskStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "REJECTED" | "BLOCKED";
export type TaskPriority = "low" | "medium" | "high";
export type TaskOriginType = "manual" | "message" | "ai_scan" | "qlnm_bridge";
export type TaskApprovalStatus = "SUGGESTED" | "CONFIRMED" | "REJECTED";
export type TaskSourceModule = "messenger" | "qlnm" | "erp_project" | "erp_po_approval" | "ai_agent" | "manual";

export type TaskCommentType =
  | "comment"
  | "status_change"
  | "assignment"
  | "attachment_added"
  | "system";

// ── Attachment ────────────────────────────────────────────────────────────────

export type TaskAttachment = {
  id: number;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  size_human: string;   // "200 KB" — computed by backend
  is_image: boolean;    // computed by backend
  public_url: string | null;
  metadata: Record<string, unknown>;
  uploader: TaskUserRef | null;
  created_at: string;
};

// ── Comment / Activity ────────────────────────────────────────────────────────

export type TaskComment = {
  id: number;
  type: TaskCommentType;
  body: string;
  metadata: Record<string, unknown>;
  user: TaskUserRef; // withDefault → không bao giờ null (system = { id: null, full_name: "Hệ thống" })
  is_system: boolean;
  created_at: string;
};

// ── Task Summary (list endpoint) ──────────────────────────────────────────────

export type TaskSummary = {
  id: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string | null;       // "YYYY-MM-DD"
  completed_at: string | null;   // ISO 8601
  created_at: string;
  assignee: TaskUserRef | null;
  creator: TaskUserRef | null;
  conversation: TaskConversationRef | null;
  attachment_count: number;
  comment_count: number;
  // Phase 9B — ERP context fields (optional, nullable)
  source_module?: TaskSourceModule;
  project_code?: string | null;
  department_code?: string | null;
  progress_pct?: number;         // 0-100
  evidence_required?: boolean;
  assignee_name_legacy?: string | null;
};

// ── Task Detail (show endpoint) ───────────────────────────────────────────────

export type TaskDetail = TaskSummary & {
  description: string | null;
  origin_type: TaskOriginType;
  approval_status: TaskApprovalStatus;
  created_by_ai: boolean;
  owner: TaskUserRef | null;
  source_message: TaskSourceMessage | null;
  attachments: TaskAttachment[];
  comments: TaskComment[];
};

// ── API request payloads ─────────────────────────────────────────────────────

export type CreateTaskPayload = {
  conversation_id: number;
  title: string;
  description?: string;
  assigned_to_user_id?: number | null;
  priority?: TaskPriority;
  deadline?: string | null;   // "YYYY-MM-DD"
  source_message_id?: number | null;
};

export type CreateTaskFromMessagePayload = {
  source_message_id: number;
  title?: string;              // Optional — Quick Task: backend lấy message body
  assigned_to_user_id?: number | null;
  priority?: TaskPriority;
  deadline?: string | null;
};

export type UpdateTaskPayload = {
  title?: string;
  description?: string | null;
  assigned_to_user_id?: number | null;
  priority?: TaskPriority;
  deadline?: string | null;
};

export type UpdateTaskStatusPayload = {
  status: TaskStatus;
  note?: string;
};

export type RegisterAttachmentPayload = {
  gcs_key: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  public_url?: string | null;
  metadata?: Record<string, unknown>;
};

// ── API response wrappers ─────────────────────────────────────────────────────

export type TaskListMeta = {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
};

export type TaskListSummary = {
  total: number;
  pending: number;
  in_progress: number;
  done: number;
  blocked?: number;  // Phase 9B
};

export type MyTasksResponse = {
  data: TaskSummary[];
  summary: TaskListSummary;
  meta: TaskListMeta;
};

export type RoomTasksResponse = {
  conversation: TaskConversationRef;
  data: TaskSummary[];
  summary: TaskListSummary;
  meta: TaskListMeta;
};

export type MessageTasksResponse = {
  tasks: TaskSummary[];
};

// ── Filter types ──────────────────────────────────────────────────────────────

export type MyTasksFilter = {
  filter?: "assigned_to_me" | "created_by_me" | "all";
  status?: TaskStatus;
  priority?: TaskPriority;
  due?: "today" | "overdue" | "upcoming" | "all";
  page?: number;
  per_page?: number;
};

export type RoomTasksFilter = {
  status?: TaskStatus;
  priority?: TaskPriority;
  page?: number;
  per_page?: number;
};
