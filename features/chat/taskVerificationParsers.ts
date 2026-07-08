export type TaskVerificationKind = 'request' | 'verified' | 'rejected';

export interface TaskVerificationData {
  kind: TaskVerificationKind;
  taskId?: number;
  taskTitle?: string;
  mentionUsername?: string;
  isBugReport?: boolean;
  pageUrl?: string;
  actorName?: string;
  isReminder?: boolean;
  rejectionReason?: string;
  displayBody: string;
}

function stripMarkdown(value: string): string {
  return value.replace(/\*+/g, '').trim();
}

export function parseTaskVerificationMessage(
  body: string | null | undefined,
): TaskVerificationData | null {
  const displayBody = String(body ?? '').trim().replace(/\s+/g, ' ');
  if (!displayBody) return null;

  const requestMatch = displayBody.match(
    /^Tôi đã hoàn thành task\.\s*Đề nghị\s*@(\S+)\s*kiểm tra và nghiệm thu\.?$/u,
  );
  if (requestMatch) {
    return {
      kind: 'request',
      mentionUsername: requestMatch[1],
      displayBody,
    };
  }

  const bugRequestMatch = displayBody.match(
    /^(🔁\s*NHẮC LẠI ĐỀ NGHỊ NGHIỆM THU|🔔\s*ĐỀ NGHỊ NGHIỆM THU BUG)\s+🐛\s*Bug\s*#(\d+):\s*(.+?)\s+📍\s*Trang:\s*(.+?)\s+.+?\s*IT xử lý:\s*(.+?)\s+🧪\s*Đề nghị\s*@(.+?)\s+vào test và nghiệm thu giúp\.?$/u,
  );
  if (bugRequestMatch) {
    return {
      kind: 'request',
      taskId: Number(bugRequestMatch[2]),
      taskTitle: stripMarkdown(bugRequestMatch[3]),
      pageUrl: stripMarkdown(bugRequestMatch[4]),
      actorName: stripMarkdown(bugRequestMatch[5]),
      mentionUsername: bugRequestMatch[6].trim(),
      isBugReport: true,
      isReminder: bugRequestMatch[1].includes('NHẮC LẠI'),
      displayBody,
    };
  }

  const verifyTaskMatch = displayBody.match(
    /^Tôi đã nghiệm thu task \*\*#(\d+)\*\* \((.+?)\) của @(\S+)\.\s*Cảm ơn bạn!$/u,
  );
  if (verifyTaskMatch) {
    return {
      kind: 'verified',
      taskId: Number(verifyTaskMatch[1]),
      taskTitle: stripMarkdown(verifyTaskMatch[2]),
      mentionUsername: verifyTaskMatch[3],
      displayBody,
    };
  }

  const verifyBugMatch = displayBody.match(
    /^Tôi đã nghiệm thu lỗi này\.\s*Cảm ơn @(\S+)!$/u,
  );
  if (verifyBugMatch) {
    return {
      kind: 'verified',
      isBugReport: true,
      mentionUsername: verifyBugMatch[1],
      displayBody,
    };
  }

  const rejectTaskMatch = displayBody.match(
    /^Tôi \*\*KHÔNG NGHIỆM THU\*\* task \*\*#(\d+)\*\* \((.+?)\)\.\s*Đề nghị @(\S+) xem xét và làm lại\.?(?:\s+\*\*Lý do:\*\*\s*(.+))?$/u,
  );
  if (rejectTaskMatch) {
    return {
      kind: 'rejected',
      taskId: Number(rejectTaskMatch[1]),
      taskTitle: stripMarkdown(rejectTaskMatch[2]),
      mentionUsername: rejectTaskMatch[3],
      rejectionReason: rejectTaskMatch[4]?.trim() || undefined,
      displayBody,
    };
  }

  const rejectBugMatch = displayBody.match(
    /^Tôi \*\*KHÔNG NGHIỆM THU\*\* lỗi \*\*#(\d+)\*\*\.\s*Đề nghị @(\S+) xem xét và fix lại\.?(?:\s+\*\*Lý do:\*\*\s*(.+))?$/u,
  );
  if (rejectBugMatch) {
    return {
      kind: 'rejected',
      taskId: Number(rejectBugMatch[1]),
      isBugReport: true,
      mentionUsername: rejectBugMatch[2],
      rejectionReason: rejectBugMatch[3]?.trim() || undefined,
      displayBody,
    };
  }

  return null;
}

export function isTaskVerificationMessage(body: string | null | undefined): boolean {
  return parseTaskVerificationMessage(body) !== null;
}

export function getTaskVerificationPreview(body: string): string | null {
  const data = parseTaskVerificationMessage(body);
  if (!data) return null;

  if (data.kind === 'request') {
    if (data.isReminder) return '🔁 Nhắc lại đề nghị nghiệm thu';
    return data.isBugReport ? '🔔 Đề nghị nghiệm thu bug' : '🔔 Đề nghị nghiệm thu';
  }
  if (data.kind === 'verified') return data.isBugReport ? '✅ Đã nghiệm thu lỗi' : '✅ Đã nghiệm thu task';
  return data.isBugReport ? '❌ Không nghiệm thu lỗi' : '❌ Không nghiệm thu task';
}
