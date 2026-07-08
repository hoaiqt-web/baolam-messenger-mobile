import { isPycvtWarehouseMessage } from '@/features/chat/pycvtParsers';
import { isWarehouseConversationName } from '@/features/chat/warehouseConversation';

export type ConversationBroadcastSummary = {
  id?: number;
  type?: string;
  name?: string;
};

export type NotificationConversationContext = {
  type: string;
  name: string;
  isGroup: boolean;
  isDirect: boolean;
};

export function resolveNotificationConversationContext(
  socketConversation: ConversationBroadcastSummary | undefined,
  cacheType: string | null | undefined,
  cacheName: string,
): NotificationConversationContext {
  const type = String(
    socketConversation?.type?.trim()
      || cacheType?.trim()
      || 'group',
  ).toLowerCase();
  const name = String(
    socketConversation?.name?.trim()
      || cacheName.trim()
      || '',
  );

  return {
    type,
    name,
    isGroup: type === 'group',
    isDirect: type === 'direct',
  };
}

export function shouldNotifyForGroupMessage(input: {
  isGroup: boolean;
  isMentioned: boolean;
  conversationName: string;
  messageBody: string;
}): boolean {
  if (!input.isGroup) {
    return true;
  }

  if (input.isMentioned) {
    return true;
  }

  if (
    isWarehouseConversationName(input.conversationName)
    && isPycvtWarehouseMessage(input.messageBody)
  ) {
    return true;
  }

  if (
    isWarehouseConversationName(input.conversationName)
    && input.messageBody.includes('GHI CHÉP KIỂM KÊ')
  ) {
    return true;
  }

  return false;
}
