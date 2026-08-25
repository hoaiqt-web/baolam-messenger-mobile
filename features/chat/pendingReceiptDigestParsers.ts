export type PendingReceiptRole = 'CHT' | 'CBKT' | 'QLPX';

export type PendingReceiptRow = {
  projectCode: string;
  projectName: string;
  role: PendingReceiptRole;
  personName: string;
  count: number;
};

export type PendingReceiptProjectGroup = {
  projectCode: string;
  projectName: string;
  rows: PendingReceiptRow[];
};

export type PendingReceiptDigestData = {
  dateLabel: string;
  total: number;
  people: number;
  rows: PendingReceiptRow[];
  projects: PendingReceiptProjectGroup[];
  footer: string;
};

const MARKER = '📦 **TỔNG HỢP PHIẾU VẬT TƯ CHỜ NHẬN**';
const MARKER_PLAIN = '📦 TỔNG HỢP PHIẾU VẬT TƯ CHỜ NHẬN';

function stripMarkdown(value: string): string {
  return value.replace(/\*+/g, '').trim();
}

function parseRole(raw: string): PendingReceiptRole {
  const roleRaw = raw.toUpperCase();
  return roleRaw === 'CHT' || roleRaw === 'CBKT' || roleRaw === 'QLPX' ? roleRaw : 'QLPX';
}

function parseProjectLabel(label: string): { projectCode: string; projectName: string } {
  const split = label.split(/\s+[—\-–]\s+/u);
  const projectCode = (split[0] || '—').trim() || '—';
  const projectName = (split.slice(1).join(' — ') || '').trim();
  return { projectCode, projectName };
}

function groupRows(rows: PendingReceiptRow[]): PendingReceiptProjectGroup[] {
  const map = new Map<string, PendingReceiptProjectGroup>();
  for (const row of rows) {
    const existing = map.get(row.projectCode);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    map.set(row.projectCode, {
      projectCode: row.projectCode,
      projectName: row.projectName,
      rows: [row],
    });
  }
  return [...map.values()];
}

export function isPendingReceiptDigestMessage(body: string | null | undefined): boolean {
  const text = String(body ?? '').trim();
  return text.startsWith(MARKER) || text.startsWith(MARKER_PLAIN);
}

export function parsePendingReceiptDigestMessage(
  body: string | null | undefined,
): PendingReceiptDigestData | null {
  const displayBody = String(body ?? '').trim();
  if (!isPendingReceiptDigestMessage(displayBody)) return null;

  const lines = displayBody.split('\n').map((line) => line.trimEnd());
  let dateLabel = '';
  let total = 0;
  let people = 0;
  let footer = '';
  const rows: PendingReceiptRow[] = [];
  let currentProject: { projectCode: string; projectName: string } | null = null;

  for (const line of lines) {
    const trimmed = stripMarkdown(line.trim());
    if (!trimmed) continue;
    if (
      /TỔNG HỢP PHIẾU VẬT TƯ CHỜ NHẬN/u.test(trimmed)
      && !trimmed.startsWith('📅')
      && !trimmed.startsWith('📌')
    ) {
      continue;
    }

    const dateMatch = trimmed.match(/^(?:📅|🗓️)\s*(.+)$/u);
    if (dateMatch) {
      dateLabel = dateMatch[1].trim();
      continue;
    }

    const totalMatch = trimmed.match(/^(?:📌|📊)\s*Tổng:\s*(\d+)\s*phiếu(?:\s*·\s*(\d+)\s*người)?/u);
    if (totalMatch) {
      total = Number(totalMatch[1]);
      people = Number(totalMatch[2] || 0);
      continue;
    }

    const projectMatch = trimmed.match(/^\d+\.\s*Dự án\s*:\s*(.+)$/u);
    if (projectMatch) {
      currentProject = parseProjectLabel(projectMatch[1].trim());
      continue;
    }

    const personMatch = trimmed.match(/^(CHT|CBKT|QLPX)\s+(.+?)\s+[—\-–]\s+(\d+)\s*phiếu/u);
    if (personMatch) {
      const count = Number(personMatch[3] || 0);
      rows.push({
        projectCode: currentProject?.projectCode || '—',
        projectName: currentProject?.projectName || '',
        role: parseRole(personMatch[1] || ''),
        personName: (personMatch[2] || '—').trim() || '—',
        count: Number.isFinite(count) ? count : 0,
      });
      continue;
    }

    const rowMatch = trimmed.match(/^##\s*ROW\s*\|\s*(.*)$/u);
    if (rowMatch) {
      const parts = rowMatch[1].split('|').map((part) => part.trim());
      const count = Number(parts[4] || 0);
      rows.push({
        projectCode: parts[0] || '—',
        projectName: parts[1] || '',
        role: parseRole(parts[2] || ''),
        personName: parts[3] || '—',
        count: Number.isFinite(count) ? count : 0,
      });
      continue;
    }

    if (trimmed.startsWith('👉')) {
      footer = trimmed.replace(/^👉\s*/u, '');
    }
  }

  if (total <= 0) {
    total = rows.reduce((sum, row) => sum + row.count, 0);
  }
  if (people <= 0) {
    people = rows.length;
  }

  return { dateLabel, total, people, rows, projects: groupRows(rows), footer };
}

export function getPendingReceiptDigestPreview(body: string): string | null {
  const data = parsePendingReceiptDigestMessage(body);
  if (!data) return null;
  if (data.total <= 0) return '📦 Phiếu VT chờ nhận · 0';
  return `📦 Phiếu VT chờ nhận · ${data.total} phiếu · ${data.projects.length} dự án`;
}
