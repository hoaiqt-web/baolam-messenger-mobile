export type AttendanceHeadcountPerson = {
  name: string;
  department: string;
  intervals: string;
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
      const parts = raw.split('|').map((part) => part.trim());
      const name = parts[0] ?? '';
      const department = parts[1] || '—';
      const intervals = parts.slice(2).join(' | ');
      if (name) current.people.push({ name, department, intervals });
    }
  }

  pushCurrent();

  if (total <= 0) {
    total = locations.reduce((sum, loc) => sum + loc.count, 0);
  }

  return { dateLabel, total, note, locations };
}

export function collectDepartments(locations: AttendanceHeadcountLocation[]): string[] {
  const set = new Set<string>();
  for (const location of locations) {
    for (const person of location.people) {
      if (person.department) set.add(person.department);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
}

export function countByDepartment(people: AttendanceHeadcountPerson[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const person of people) {
    map[person.department] = (map[person.department] ?? 0) + 1;
  }
  return map;
}

export function parseTimeInterval(intervals: string): { start: string; end: string } {
  const text = intervals.trim();
  if (!text) return { start: '', end: '' };

  const starts: string[] = [];
  const ends: string[] = [];

  for (const part of text.split(',').map((segment) => segment.trim()).filter(Boolean)) {
    const dashIndex = part.indexOf('-');
    if (dashIndex > 0) {
      starts.push(part.slice(0, dashIndex).trim());
      ends.push(part.slice(dashIndex + 1).trim());
      continue;
    }
    starts.push(part);
  }

  return {
    start: starts.join(', '),
    end: ends.join(', '),
  };
}
