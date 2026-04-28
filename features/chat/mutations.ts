import { useMutation } from '@tanstack/react-query';

import type { SendMessageAttachmentPayload } from '@/Models/chat/types';
import { chatApi } from '@/services/api/chatApi';

export function useCreateGroupConversationMutation() {
  return useMutation({
    mutationFn: chatApi.createGroupConversation,
  });
}

export function useOpenDirectConversationMutation() {
  return useMutation({
    mutationFn: chatApi.openDirectConversation,
  });
}

export type SendMessageMutationPayload = {
  conversationId: number;
  body?: string;
  clientMessageId: string;
  traceId: string;
  clientSentAt: number;
  replyToMessageId?: number;
  forwardedFromMessageId?: number;
  mentions?: number[];
  attachments?: SendMessageAttachmentPayload[];
};

export function useSendMessageMutation() {
  return useMutation({
    mutationFn: ({
      conversationId,
      body,
      clientMessageId,
      traceId,
      clientSentAt,
      replyToMessageId,
      forwardedFromMessageId,
      mentions,
      attachments,
    }: SendMessageMutationPayload) =>
      chatApi.sendMessage(conversationId, {
        body,
        clientMessageId,
        traceId,
        clientSentAt,
        replyToMessageId,
        forwardedFromMessageId,
        mentions,
        attachments,
      }),
  });
}
