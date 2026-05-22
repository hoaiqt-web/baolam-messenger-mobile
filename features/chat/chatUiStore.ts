import { create } from "zustand";

import type { ChatUserSummary } from "@/Models/chat/types";

/** Ảnh/file đang chờ gửi sau khi chia sẻ từ app khác (Android/iOS). */
export type PendingOutgoingShareFile = {
  uri: string;
  mimeType: string;
  name: string;
};

type ChatUiState = {
  activeConversationId: number | null;
  highlightedMessageId: number | null;
  userSearchResults: ChatUserSummary[];
  error: string | null;
  isDetailsPanelVisible: boolean;
  /** Composer text keyed by conversation id (persist while switching chats). */
  composerDrafts: Record<string, string>;
  /** Chọn hội thoại để gửi nội dung share-from-gallery. */
  pendingOutgoingShare: { files: PendingOutgoingShareFile[] } | null;
  setActiveConversationId: (conversationId: number | null) => void;
  setHighlightedMessageId: (messageId: number | null) => void;
  setUserSearchResults: (users: ChatUserSummary[]) => void;
  setError: (error: string | null) => void;
  setDetailsPanelVisible: (visible: boolean) => void;
  setComposerDraft: (conversationId: number, text: string) => void;
  clearComposerDraft: (conversationId: number) => void;
  setPendingOutgoingShare: (payload: { files: PendingOutgoingShareFile[] } | null) => void;
  clearPendingOutgoingShare: () => void;
  reset: () => void;
};

export const useChatUiStore = create<ChatUiState>((set) => ({
  activeConversationId: null,
  highlightedMessageId: null,
  userSearchResults: [],
  error: null,
  isDetailsPanelVisible: false,
  composerDrafts: {},
  pendingOutgoingShare: null,
  setActiveConversationId: (activeConversationId) => set({ activeConversationId }),
  setHighlightedMessageId: (highlightedMessageId) => set({ highlightedMessageId }),
  setUserSearchResults: (userSearchResults) => set({ userSearchResults }),
  setError: (error) => set({ error }),
  setDetailsPanelVisible: (isDetailsPanelVisible) => set({ isDetailsPanelVisible }),
  setComposerDraft: (conversationId, text) =>
    set((s) => ({
      composerDrafts: { ...s.composerDrafts, [String(conversationId)]: text },
    })),
  clearComposerDraft: (conversationId) =>
    set((s) => {
      const next = { ...s.composerDrafts };
      delete next[String(conversationId)];
      return { composerDrafts: next };
    }),
  setPendingOutgoingShare: (pendingOutgoingShare) => set({ pendingOutgoingShare }),
  clearPendingOutgoingShare: () => set({ pendingOutgoingShare: null }),
  reset: () =>
    set({
      activeConversationId: null,
      highlightedMessageId: null,
      userSearchResults: [],
      error: null,
      isDetailsPanelVisible: false,
      composerDrafts: {},
      pendingOutgoingShare: null,
    }),
}));
