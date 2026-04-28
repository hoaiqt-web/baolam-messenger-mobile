import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type {
  ChatAttachment,
  ChatMessage,
  ImageGalleryPageResponse,
  PinnedMessage,
} from '@/Models/chat/types';
import { chatApi } from '@/services/api/chatApi';

const FOREGROUND_CONVERSATIONS_REFETCH_INTERVAL_MS = 7000;
const BACKGROUND_CONVERSATIONS_REFETCH_INTERVAL_MS = 15000;
const FOREGROUND_MESSAGES_REFETCH_INTERVAL_MS = 7000;
const BACKGROUND_MESSAGES_REFETCH_INTERVAL_MS = 15000;
const MESSAGE_PAGE_SIZE = 20;

const CONVERSATIONS_STALE_TIME = 30_000;
const MESSAGES_STALE_TIME = 60_000;
const PINS_STALE_TIME = 120_000;
const ATTACHMENTS_STALE_TIME = 120_000;
const IMAGE_GALLERY_PAGE_SIZE = 30;
const IMAGE_GALLERY_STALE_TIME_MS = 5 * 60_000;
const IMAGE_GALLERY_GC_TIME_MS = 15 * 60_000;

type ConversationsQueryParams = {
  enabled: boolean;
  isDocumentVisible: boolean;
  shouldPoll: boolean;
};

export function useConversationsQuery({
  enabled,
  isDocumentVisible,
  shouldPoll,
}: ConversationsQueryParams) {
  return useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: chatApi.getConversations,
    enabled,
    retry: false,
    staleTime: CONVERSATIONS_STALE_TIME,
    refetchOnReconnect: true,
    refetchInterval: enabled && shouldPoll
      ? isDocumentVisible
        ? FOREGROUND_CONVERSATIONS_REFETCH_INTERVAL_MS
        : BACKGROUND_CONVERSATIONS_REFETCH_INTERVAL_MS
      : false,
    refetchIntervalInBackground: true,
  });
}

type MessagesQueryParams = {
  activeConversationId: number | null;
  enabled: boolean;
  isDocumentVisible: boolean;
  shouldPoll: boolean;
};

export function useMessagesQuery({
  activeConversationId,
  enabled,
  isDocumentVisible,
  shouldPoll,
}: MessagesQueryParams) {
  return useInfiniteQuery({
    queryKey: ['chat', 'messages', activeConversationId],
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      if (!activeConversationId || activeConversationId < 0) {
        return { messages: [] as ChatMessage[], hasMore: false };
      }

      return chatApi.getMessages(activeConversationId, {
        limit: MESSAGE_PAGE_SIZE,
        beforeMessageId: pageParam,
      });
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore) {
        return undefined;
      }
      const oldestMessage = (lastPage.messages ?? []).find(
        (message) => Number(message.id) > 0,
      );
      return oldestMessage?.id;
    },
    enabled,
    retry: false,
    staleTime: MESSAGES_STALE_TIME,
    refetchOnReconnect: true,
    refetchInterval: enabled && shouldPoll
      ? isDocumentVisible
        ? FOREGROUND_MESSAGES_REFETCH_INTERVAL_MS
        : BACKGROUND_MESSAGES_REFETCH_INTERVAL_MS
      : false,
    refetchIntervalInBackground: true,
  });
}

type ConversationScopedQueryParams = {
  activeConversationId: number | null;
  enabled: boolean;
};

export function usePinnedMessagesQuery({
  activeConversationId,
  enabled,
}: ConversationScopedQueryParams) {
  return useQuery({
    queryKey: ['chat', 'pins', activeConversationId],
    queryFn: async () => {
      if (!activeConversationId || activeConversationId < 0) {
        return {
          pins: [] as PinnedMessage[],
        };
      }
      return chatApi.getPinnedMessages(activeConversationId);
    },
    enabled,
    retry: false,
    staleTime: PINS_STALE_TIME,
  });
}

export function useAttachmentsQuery({
  activeConversationId,
  enabled,
}: ConversationScopedQueryParams) {
  return useQuery({
    queryKey: ['chat', 'attachments', activeConversationId],
    queryFn: async () => {
      if (!activeConversationId || activeConversationId < 0) {
        return {
          attachments: [] as ChatAttachment[],
        };
      }
      return chatApi.getAttachments(activeConversationId);
    },
    enabled,
    retry: false,
    staleTime: ATTACHMENTS_STALE_TIME,
  });
}

/** Fullscreen viewer only: paginated image attachments (newest first). Not used when only opening a chat. */
export function useImageAttachmentGalleryInfiniteQuery({
  conversationId,
  enabled,
}: {
  conversationId: number | null;
  enabled: boolean;
}) {
  return useInfiniteQuery({
    queryKey: ['chat', 'imageAttachmentGallery', conversationId],
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }): Promise<ImageGalleryPageResponse> => {
      if (!conversationId || conversationId < 0) {
        return { attachments: [], hasMore: false, nextCursor: null };
      }
      return chatApi.getImageAttachmentGallery(conversationId, {
        limit: IMAGE_GALLERY_PAGE_SIZE,
        beforeId: pageParam ?? null,
      });
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.hasMore && lastPage.nextCursor != null) {
        return lastPage.nextCursor;
      }
      return undefined;
    },
    enabled: Boolean(enabled && conversationId && conversationId > 0),
    retry: false,
    staleTime: IMAGE_GALLERY_STALE_TIME_MS,
    gcTime: IMAGE_GALLERY_GC_TIME_MS,
  });
}
