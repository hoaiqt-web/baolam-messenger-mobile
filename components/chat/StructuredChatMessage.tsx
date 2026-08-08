import { isPycvtWarehouseMessage } from '@/features/chat/pycvtParsers';
import { isPoApprovalMessage } from '@/features/chat/poApprovalParsers';
import { isPoApprovalResultMessage } from '@/features/chat/poApprovalResultParsers';
import { isErpTaskReportBody } from '@/features/chat/taskReportParsers';
import { PycvtMessageCard } from '@/components/chat/PycvtMessageCard';
import { PoApprovalMessageCard } from '@/components/chat/PoApprovalMessageCard';
import { PoApprovalResultMessageCard } from '@/components/chat/PoApprovalResultMessageCard';
import { ErpTaskReportCard } from '@/components/chat/ErpTaskReportCard';
import {
  ErpStructuredMessage,
  isErpAssignmentMessage,
} from '@/components/chat/ErpStructuredMessage';
import { isTaskVerificationMessage } from '@/features/chat/taskVerificationParsers';
import { TaskVerificationMessageCard } from '@/components/chat/TaskVerificationMessageCard';
import { isBugOutstandingDigestMessage } from '@/features/chat/bugOutstandingDigestParsers';
import { BugOutstandingDigestMessageCard } from '@/components/chat/BugOutstandingDigestMessageCard';

// 5 New Message Cards
import {
  InventoryDraftMessageCard,
  isInventoryDraftMessage,
} from '@/components/chat/InventoryDraftMessageCard';
import {
  CrossDeptMaterialMessageCard,
  isCrossDeptMaterialMessage,
} from '@/components/chat/CrossDeptMaterialMessageCard';
import {
  BugReportMessageCard,
  isBugReportMessage,
} from '@/components/chat/BugReportMessageCard';
import {
  SecurityGateMessageCard,
  isSecurityGateMessage,
} from '@/components/chat/SecurityGateMessageCard';
import {
  PtkReportMessageCard,
  isPtkReportMessage,
} from '@/components/chat/PtkReportMessageCard';

import type { ChatGeneratedTask, ChatMessage } from '@/Models/chat/types';

type Props = {
  body: string;
  isMine: boolean;
  isDark: boolean;
  generatedTasks?: ChatGeneratedTask[];
  message?: ChatMessage;
  currentUserId?: number | null;
  onImagePress?: (attachment: any, url: string) => void;
};

/** True when body should render as an ERP structured card instead of plain text. */
export function isStructuredChatMessage(body: string | null | undefined): boolean {
  const text = String(body ?? '').trim();
  if (!text) return false;
  return (
    isPycvtWarehouseMessage(text) ||
    isPoApprovalMessage(text) ||
    isPoApprovalResultMessage(text) ||
    isErpAssignmentMessage(text) ||
    isErpTaskReportBody(text) ||
    isTaskVerificationMessage(text) ||
    isBugOutstandingDigestMessage(text) ||
    isInventoryDraftMessage(text) ||
    isCrossDeptMaterialMessage(text) ||
    isBugReportMessage(text) ||
    isSecurityGateMessage(text) ||
    isPtkReportMessage(text)
  );
}

/** True when the structured card renders its own attachments and default attachments should be hidden. */
export function shouldHideDefaultAttachments(body: string | null | undefined): boolean {
  const text = String(body ?? '').trim();
  if (!text) return false;
  return (
    isPycvtWarehouseMessage(text) ||
    isInventoryDraftMessage(text) ||
    isSecurityGateMessage(text) ||
    isPtkReportMessage(text)
  );
}

/** @deprecated Use isStructuredChatMessage — kept for existing imports. */
export const isErpReportMessage = isStructuredChatMessage;

export function StructuredChatMessage({
  body,
  isMine,
  isDark,
  generatedTasks,
  message,
  currentUserId,
  onImagePress,
}: Props) {
  const text = String(body ?? '').trim();
  if (!text) return null;

  if (isInventoryDraftMessage(text)) {
    return (
      <InventoryDraftMessageCard
        body={text}
        isMine={isMine}
        isDark={isDark}
        legacyAttachments={message?.attachments}
        onImagePress={onImagePress}
      />
    );
  }
  if (isCrossDeptMaterialMessage(text)) {
    return <CrossDeptMaterialMessageCard body={text} isMine={isMine} isDark={isDark} />;
  }
  if (isBugReportMessage(text)) {
    return (
      <BugReportMessageCard
        message={message || ({ body: text } as any)}
        currentUserId={currentUserId ?? null}
        isMine={isMine}
        isDark={isDark}
      />
    );
  }
  if (isSecurityGateMessage(text)) {
    return (
      <SecurityGateMessageCard
        message={message || ({ body: text } as any)}
        isMine={isMine}
        isDark={isDark}
        onImagePress={onImagePress}
      />
    );
  }
  if (isPtkReportMessage(text)) {
    return (
      <PtkReportMessageCard
        body={text}
        isMine={isMine}
        isDark={isDark}
        message={message}
        onImagePress={onImagePress}
      />
    );
  }

  if (isPycvtWarehouseMessage(text)) {
    return <PycvtMessageCard body={text} isMine={isMine} isDark={isDark} onImagePress={onImagePress} />;
  }
  if (isPoApprovalMessage(text)) {
    return (
      <PoApprovalMessageCard
        body={text}
        isMine={isMine}
        isDark={isDark}
        generatedTasks={generatedTasks}
      />
    );
  }
  if (isPoApprovalResultMessage(text)) {
    return <PoApprovalResultMessageCard body={text} isMine={isMine} />;
  }
  if (isErpAssignmentMessage(text)) {
    return <ErpStructuredMessage body={text} isMine={isMine} isDark={isDark} />;
  }
  if (isErpTaskReportBody(text)) {
    return (
      <ErpTaskReportCard
        body={text}
        isMine={isMine}
        isDark={isDark}
        message={message}
        onImagePress={onImagePress}
      />
    );
  }
  if (isTaskVerificationMessage(text)) {
    return <TaskVerificationMessageCard body={text} isMine={isMine} />;
  }
  if (isBugOutstandingDigestMessage(text)) {
    return <BugOutstandingDigestMessageCard body={text} isMine={isMine} />;
  }

  return null;
}
