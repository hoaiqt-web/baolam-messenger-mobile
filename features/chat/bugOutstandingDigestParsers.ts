export type DigestStatusKey = 'VERIFYING' | 'REJECTED' | 'IN_PROGRESS' | 'PENDING';

export type DigestBugItem = {
  id: number;
  severity: string;
  page: string;
  username: string;
  issueLabel: string;
  assignee: string;
  reason: string;
};

export type DigestSection = {
  key: DigestStatusKey;
  title: string;
  count: number;
  items: DigestBugItem[];
};

export type BugOutstandingDigestData = {
  dateLabel: string;
  total: number;
  sections: DigestSection[];
  footer: string;
};

const MARKER = '📊 **TỔNG HỢP BUG TỒN ĐỌNG**';

export function isBugOutstandingDigestMessage(body: string | null | undefined): boolean {
  const text = String(body ?? '').trim();
  return text.startsWith('📊 **TỔNG HỢP BUG TỒN ĐỌNG**')
    || text.startsWith('📊 TỔNG HỢP BUG TỒN ĐỌNG');
}

export function parseBugOutstandingDigestMessage(
  body: string | null | undefined,
): BugOutstandingDigestData | null {
  const displayBody = String(body ?? '').trim();
  if (!isBugOutstandingDigestMessage(displayBody)) return null;

  const lines = displayBody.split('\n').map((l) => l.trimEnd());
  let dateLabel = '';
  let total = 0;
  let footer = '';
  const sections: DigestSection[] = [];
  let current: DigestSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === MARKER || trimmed.startsWith('📊')) continue;

    const dateMatch = trimmed.match(/^📅\s*(.+)$/u);
    if (dateMatch) {
      dateLabel = dateMatch[1].trim();
      continue;
    }

    const totalMatch = trimmed.match(/^📌\s*Tổng:\s*(\d+)/u);
    if (totalMatch) {
      total = Number(totalMatch[1]);
      continue;
    }

    const sectionMatch = trimmed.match(
      /^##\s*(VERIFYING|REJECTED|IN_PROGRESS|PENDING)\|(\d+)\|(.+)$/u,
    );
    if (sectionMatch) {
      if (current) sections.push(current);
      current = {
        key: sectionMatch[1] as DigestStatusKey,
        title: sectionMatch[3].trim(),
        count: Number(sectionMatch[2]),
        items: [],
      };
      continue;
    }

    if (trimmed.startsWith('👉')) {
      footer = trimmed.replace(/^👉\s*/u, '');
      continue;
    }

    if (current && trimmed.startsWith('#')) {
      const item = parseItemLine(trimmed);
      if (item) current.items.push(item);
    }
  }

  if (current) sections.push(current);

  return { dateLabel, total, sections, footer };
}

function parseItemLine(line: string): DigestBugItem | null {
  const machinePart = line.includes(' ·· ') ? line.split(' ·· ')[0] : line;
  const parts = machinePart.split('|');
  if (parts.length < 4) return null;

  const id = Number(parts[0].replace(/^#/, ''));
  if (!Number.isFinite(id)) return null;

  return {
    id,
    severity: (parts[1] || 'MEDIUM').toUpperCase(),
    page: parts[2] || '—',
    username: parts[3] || '',
    issueLabel: parts[4] || '',
    assignee: parts[5] || '',
    reason: parts[6] || '',
  };
}

export function getBugOutstandingDigestPreview(body: string): string | null {
  const data = parseBugOutstandingDigestMessage(body);
  if (!data) return null;
  return `📊 Bug tồn đọng · ${data.total} bug`;
}
