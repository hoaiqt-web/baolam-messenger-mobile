export type AttendanceHeadcountPerson = {
  name: string;
  department: string;
};

export type AttendanceHeadcountLocation = {
  name: string;
  count: number;
  people: AttendanceHeadcountPerson[];
};

export type AttendanceHeadcountData = {
  dateLabel: string;
  total: number;
  note: string;
  locations: AttendanceHeadcountLocation[];
};

function stripMarkdown(value: string): string {
  return value.replace(/\*+/g, '').trim();
}

export function isAttendanceHeadcountMessage(body: string | null | undefined): boolean {
  const text = stripMarkdown(String(body ?? ''));
  return /BÁO CÁO TÌNH HÌNH NHÂN SỰ/u.test(text);
}

export function parseAttendanceHeadcountMessage(
  body: string | null | undefined,
): AttendanceHeadcountData | null {
  const displayBody = String(body ?? '').replace(/\r\n/g, '\n').trim();
  if (!isAttendanceHeadcountMessage(displayBody)) return null;

  const lines = displayBody.split('\n').map((line) => line.trimEnd());
  let dateLabel = '';
  let total = 0;
  let note = '';
  const locations: AttendanceHeadcountLocation[] = [];
  let current: AttendanceHeadcountLocation | null = null;

  const pushCurrent = () => {
    if (!current) return;
    if (current.count <= 0) current.count = current.people.length;
    locations.push(current);
    current = null;
  };

  for (const line of lines) {
    const trimmed = stripMarkdown(line.trim());
    if (!trimmed) continue;
    if (/BÁO CÁO TÌNH HÌNH NHÂN SỰ/u.test(trimmed)) continue;

    const dateMatch = trimmed.match(/^(?:📅|🗓️)\s*(.+)$/u);
    if (dateMatch) {
      dateLabel = dateMatch[1].trim();
      continue;
    }

    const totalMatch = trimmed.match(/^(?:📌|📊)\s*Tổng:\s*(\d+)/u);
    if (totalMatch) {
      total = Number(totalMatch[1]);
      continue;
    }

    const locMatch = trimmed.match(/^##\s*LOC\s*\|\s*(\d+)\s*\|\s*(.+)$/u);
    if (locMatch) {
      pushCurrent();
      current = {
        count: Number(locMatch[1]),
        name: locMatch[2].trim(),
        people: [],
      };
      continue;
    }

    if (trimmed.startsWith('👉')) {
      note = trimmed.replace(/^👉\s*/u, '');
      continue;
    }

    if (trimmed.startsWith('-') && current) {
      const raw = trimmed.replace(/^-+\s*/, '');
      const sep = raw.indexOf('|');
      const name = (sep >= 0 ? raw.slice(0, sep) : raw).trim();
      const department = (sep >= 0 ? raw.slice(sep + 1) : '').trim() || '—';
      if (name) current.people.push({ name, department });
    }
  }

  pushCurrent();

  if (total <= 0) {
    total = locations.reduce((sum, loc) => sum + loc.count, 0);
  }

  return { dateLabel, total, note, locations };
}
