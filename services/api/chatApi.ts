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
    options?: { limit?: number; beforeMessageId?: number | null },
  ): Promise<ConversationMessagesResponse> {
    const { data } = await httpClient.get<ConversationMessagesResponse>(
      `/conversations/${conversationId}/messages`,
      {
        params: {
          limit: options?.limit,
          beforeMessageId: options?.beforeMessageId ?? undefined,
        },
      },
    );

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
};
