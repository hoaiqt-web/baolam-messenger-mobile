import { create } from "zustand";

import type { ChatUserSummary } from "@/Models/chat/types";

type ChatUiState = {
  activeConversationId: number | null;
  highlightedMessageId: number | null;
  userSearchResults: ChatUserSummary[];
  error: string | null;
  isDetailsPanelVisible: boolean;
  setActiveConversationId: (conversationId: number | null) => void;
  setHighlightedMessageId: (messageId: number | null) => void;
  setUserSearchResults: (users: ChatUserSummary[]) => void;
  setError: (error: string | null) => void;
  setDetailsPanelVisible: (visible: boolean) => void;
  reset: () => void;
};

export const useChatUiStore = create<ChatUiState>((set) => ({
  activeConversationId: null,
  highlightedMessageId: null,
  userSearchResults: [],
  error: null,
  isDetailsPanelVisible: false,
  setActiveConversationId: (activeConversationId) => set({ activeConversationId }),
  setHighlightedMessageId: (highlightedMessageId) => set({ highlightedMessageId }),
  setUserSearchResults: (userSearchResults) => set({ userSearchResults }),
  setError: (error) => set({ error }),
  setDetailsPanelVisible: (isDetailsPanelVisible) => set({ isDetailsPanelVisible }),
  reset: () => set({ activeConversationId: null, highlightedMessageId: null, userSearchResults: [], error: null, isDetailsPanelVisible: false }),
}));
