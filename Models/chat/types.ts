export type ChatUserSummary = {
  id: number;
  username: string;
  fullName: string;
  avatarUrl?: string | null;
  gender?: string | null;
  dob?: string | null;
  phone?: string | null;
};

export type ChatMessageReplySummary = {
  id: number;
  body: string;
  isRecalled?: boolean;
  sender: ChatUserSummary;
  /** Present when API includes quoted message attachments (images/files). */
  attachments?: ChatAttachment[];
};

export type ChatMessageForwardedSummary = {
  id: number;
  sourceConversationId: number;
  body: string;
  isRecalled?: boolean;
  sender: ChatUserSummary;
  /** Present when API includes source message attachments (images/files). */
  attachments?: ChatAttachment[];
};

export type ComposerAttachmentDraft = {
  id: string;
  file: File;
  previewUrl: string;
};

export type ChatUserSearchResponse = {
  users: ChatUserSummary[];
};

export type ChatDirectorySearchResponse = {
  users: ChatUserSummary[];
  groups: ChatConversation[];
};

export type GlobalSearchResponse = {
  conversations: ChatConversation[];
  users: (ChatUserSummary & { conversationId: number | null })[];
  messages: (Pick<ChatMessage, "id" | "conversationId" | "body" | "sentAt" | "sender"> & {
    conversation: { id: number; name: string | null; type: string };
  })[];
};

export type MessageSearchResponse = {
  messages: ChatMessage[];
};

export type ChatMessage = {
  id: number;
  conversationId: number;
  body: string;
  isRecalled?: boolean;
  recalledAt?: string | null;
  clientMessageId: string;
  traceId: string;
  sentAt: string | null;
  attachments: ChatAttachment[];
  replyTo: ChatMessageReplySummary | null;
  forwardedFrom: ChatMessageForwardedSummary | null;
  mentions: ChatUserSummary[];
  sender: ChatUserSummary;
  status?: "pending" | "failed" | "sent";
  reactions_summary?: Record<string, number>;
  user_reaction?: string | null;
  read_by?: number[]; // Added to track who read this message in current session
};

export type MessageReactionDetail = {
  count: number;
  users: ChatUserSummary[];
};

export type MessageReactionsResponse = {
  reactions: Record<string, MessageReactionDetail>;
};

export type MessageReadReceiptsResponse = {
  readers: ChatUserSummary[];
};

export type ChatAttachment = {
  id: number;
  objectKey: string;
  mimeType: string;
  size: number;
  originalName: string;
  width: number | null;
  height: number | null;
  url: string | null;
};

/** Response from `GET /conversations/:id/attachments?type=image&limit=…` (paginated gallery). */
export type ImageGalleryPageResponse = {
  attachments: Array<
    ChatAttachment & {
      messageId: number;
      conversationId: number;
      sentAt: string | null;
    }
  >;
  hasMore: boolean;
  nextCursor: number | null;
};

export type ChatParticipantSummary = ChatUserSummary & {
  role?: string;
};

export type ChatConversation = {
  id: number;
  name: string;
  type: string;
  avatarUrl?: string | null;
  participants: ChatParticipantSummary[];
  hasUnread: boolean;
  latestMessage: Pick<ChatMessage, "id" | "body" | "sentAt"> & {
    sender: Pick<ChatUserSummary, "id" | "username" | "fullName" | "avatarUrl">;
  } | null;
  createdBy?: number;
};

export type MarkConversationReadResponse = {
  hasUnread: boolean;
};

export type ConversationsResponse = {
  conversations: ChatConversation[];
};

export type OpenDirectConversationResponse = {
  conversation: ChatConversation;
};

export type CreateGroupConversationPayload = {
  name: string;
  participantIds: number[];
};

export type CreateGroupConversationResponse = {
  conversation: ChatConversation;
};

export type ConversationMessagesResponse = {
  messages: ChatMessage[];
  hasMore: boolean;
};

export type SendMessagePayload = {
  body?: string;
  clientMessageId: string;
  traceId: string;
  clientSentAt: number;
  replyToMessageId?: number;
  forwardedFromMessageId?: number;
  mentions?: number[];
  attachments?: SendMessageAttachmentPayload[];
};

export type SendMessageResponse = {
  message: ChatMessage;
};

export type SendMessageAttachmentPayload = {
  clientFileId: string;
  objectKey: string;
  mimeType: string;
  size: number;
  originalName: string;
  width?: number;
  height?: number;
};

export type PresignAttachmentFile = {
  clientFileId: string;
  name: string;
  mimeType: string;
  size: number;
};

export type PresignAttachmentsPayload = {
  conversationId: number;
  files: PresignAttachmentFile[];
};

export type PresignAttachmentItem = {
  clientFileId: string;
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
  headers: Record<string, string>;
};

export type PresignAttachmentsResponse = {
  items: PresignAttachmentItem[];
};

export type PinnedMessage = {
  pinnedAt: string;
  pinnedBy: {
    id: number;
    username: string;
    fullName: string;
  };
  message: ChatMessage;
};

export type PinnedMessagesResponse = {
  pins: PinnedMessage[];
};
