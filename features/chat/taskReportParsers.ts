function findLineValue(lines: string[], includes: string, splitLabel?: string): string {
  const line = lines.find((l) => l.includes(includes));
  if (!line) return '';
  const label = splitLabel ?? includes;
  const idx = line.indexOf(label);
  if (idx < 0) return '';
  return line.slice(idx + label.length).replace(/\*\*/g, '').trim();
}

function parseReportDateFromLines(lines: string[]): string {
  const direct =
    findLineValue(lines, '**Ngày BĐ thực tế:**')
    || findLineValue(lines, '**Ngày báo cáo:**')
    || findLineValue(lines, '**Ngày làm việc:**')
    || findLineValue(lines, '**Ngày bắt đầu:**').split('|')[0]?.trim()
    || findLineValue(lines, '**Ngày bắt đầu**:');
  if (direct) {
    const dm = direct.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    return dm?.[1] ?? direct;
  }

  const workHours =
    findLineValue(lines, '**Giờ công:**')
    || findLineValue(lines, '**Giờ công ca này:**');
  const fromHours = workHours.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (fromHours) return fromHours[1];

  return '';
}

export function parseQlpxPairedFields(
  line: string,
  leftLabel: string,
  rightLabel: string,
): { left: string; right: string } {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const leftRe = new RegExp(`\\*\\*${escape(leftLabel)}\\*\\*:?\\s*([^|]+)`, 'i');
  const rightRe = new RegExp(`\\*\\*${escape(rightLabel)}\\*\\*:?\\s*([^|\\n]+)`, 'i');
  const leftM = line.match(leftRe);
  const rightM = line.match(rightRe);
  return { left: leftM?.[1]?.trim() ?? '', right: rightM?.[1]?.trim() ?? '' };
}

export function parseEvidenceLinks(lines: string[]): string[] {
  return lines
    .filter((l) => l.includes('[Minh chứng') || l.includes('](http'))
    .map((l) => {
      const m = l.match(/\((https?:\/\/[^\s)]+)\)/);
      return m ? rewritePtkEvidenceUrl(m[1]) : null;
    })
    .filter(Boolean) as string[];
}

export function rewritePtkEvidenceUrl(url: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    const marker = '/storage/ptk-reports/';
    const idx = parsed.pathname.indexOf(marker);
    if (idx >= 0) {
      const relative = decodeURIComponent(parsed.pathname.slice(idx + marker.length));
      const encoded = btoa(relative).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      return `${parsed.origin}/api/ptk-report-storage/${encoded}`;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

export function googleDriveThumbUrl(url: string): string | null {
  const match =
    url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match?.[1]) return `https://drive.google.com/thumbnail?sz=w400&id=${match[1]}`;
  if (url.startsWith('http')) return url;
  return null;
}

export function isErpTaskReportBody(body: string): boolean {
  const b = String(body || '');
  return (
    b.includes('BÁO CÁO HOÀN THÀNH NHIỆM VỤ')
    || b.includes('BÁO CÁO HOÀN THÀNH CÔNG VIỆC')
    || b.includes('BÁO CÁO HOÀN THÀNH NHÀ MÁY')
    || b.includes('BÁO CÁO TẠM DỪNG')
    || b.includes('BÁO CÁO TẠM DỪNG NHÀ MÁY')
    || b.includes('BÁO CÁO QAQC')
    || b.includes('BÁO CÁO QLPX')
    || b.includes('BÁO CÁO BCH')
    || b.includes('BÁO CÁO KẾ HOẠCH NGÀY')
    || isPtkReportBody(b)
  );
}

export function isPtkReportBody(body: string): boolean {
  const b = String(body || '');
  return (
    b.includes('PHÒNG THIẾT KẾ')
    && (
      b.includes('BÁO CÁO CÔNG VIỆC')
      || b.includes('HOÀN THÀNH CÔNG VIỆC')
      || b.includes('BẮT ĐẦU CÔNG VIỆC')
      || b.includes('TIẾP TỤC CÔNG VIỆC')
      || b.includes('TẠM DỪNG CÔNG VIỆC')
      || b.includes('BÁO CÁO PHÒNG THIẾT KẾ')
      || b.includes('BÁO CÁO HOÀN THÀNH — PHÒNG THIẾT KẾ')
      || b.includes('CÔNG VIỆC PTK')
    )
  );
}

export type TaskReportKind =
  | 'qlpx_new'
  | 'qaqc_batch'
  | 'factory_completion'
  | 'factory_pause'
  | 'ptk'
  | 'generic';

export function detectTaskReportKind(body: string): TaskReportKind | null {
  if (!isErpTaskReportBody(body)) return null;
  if (body.includes('BÁO CÁO KẾ HOẠCH NGÀY')) return 'qaqc_batch';
  if (body.includes('BÁO CÁO QLPX MỚI') || body.includes('BÁO CÁO QLPX TẠM DỪNG')) return 'qlpx_new';
  if (body.includes('BÁO CÁO HOÀN THÀNH NHÀ MÁY')) return 'factory_completion';
  if (body.includes('BÁO CÁO TẠM DỪNG NHÀ MÁY')) return 'factory_pause';
  if (isPtkReportBody(body)) return 'ptk';
  return 'generic';
}

export interface QlpxNewReportData {
  project: string;
  treeLines: { text: string; indent: number }[];
  plannedHours: string;
  actualHours: string;
  startDate: string;
  startTime: string;
  endTime: string;
  actualQty: string;
  materialsUsed: string;
  materialsPlanned: string;
  reportedBy: string;
  workers: string;
  notes: string;
  evidenceLinks: string[];
}

export function parseQlpxNewReport(body: string): QlpxNewReportData {
  const lines = body.split('\n');
  const project = findLineValue(lines, '1 - **Dự án**:', '**Dự án**:');
  const treeStartIndex = lines.findIndex((l) => l.includes('2 - **Đầu mục công việc**:'));
  const treeEndIndex = lines.findIndex((l) => l.includes('3 - **Giờ công kế hoạch**:'));
  const treeLines: { text: string; indent: number }[] = [];
  if (treeStartIndex !== -1 && treeEndIndex !== -1) {
    for (let i = treeStartIndex + 1; i < treeEndIndex; i += 1) {
      const l = lines[i].replace('\r', '');
      const spaces = l.match(/^ */)?.[0].length || 0;
      const indentLevel = Math.max(0, spaces / 4 - 1);
      treeLines.push({ text: l.trim(), indent: indentLevel });
    }
  }
  const startDateLine = lines.find((l) => l.includes('4 - **Ngày bắt đầu**:')) || '';
  return {
    project,
    treeLines,
    plannedHours: findLineValue(lines, '**Giờ công kế hoạch**:'),
    actualHours: findLineValue(lines, '**Giờ công thực tế**:'),
    startDate: startDateLine.split('**Ngày bắt đầu**:')[1]?.split('|')[0]?.trim() || '',
    startTime: startDateLine.split('**Giờ bắt đầu**:')[1]?.split('|')[0]?.trim() || '',
    endTime: startDateLine.split('**Giờ kết thúc**:')[1]?.trim() || '',
    actualQty: findLineValue(lines, '5 - **Khối lượng thực hiện**:', '**Khối lượng thực hiện**:'),
    materialsUsed:
      (lines.find((l) => l.includes('6 - **Vật tư đã dùng**:')) || '')
        .split('**Vật tư đã dùng**:')[1]?.split('|')[0]?.trim() || '',
    materialsPlanned:
      (lines.find((l) => l.includes('6 - **Vật tư đã dùng**:')) || '')
        .split('**Vật tư theo kế hoạch**:')[1]?.trim() || '',
    reportedBy:
      (lines.find((l) => l.includes('7 - **Người thực hiện**:')) || '')
        .split('**Người thực hiện**:')[1]?.split('(')[0]?.trim() || '',
    workers: formatWorkersFieldDisplay(
      (lines.find((l) => l.includes('7 - **Người thực hiện**:')) || '')
        .split('(Thợ:')[1]?.replace(')', '')?.trim() || '',
    ),
    notes: findLineValue(lines, '8 - **Ghi chú**:', '**Ghi chú**:'),
    evidenceLinks: parseEvidenceLinks(lines),
  };
}

export interface GenericTaskReportData {
  isQlpx: boolean;
  isBch: boolean;
  isQaqc: boolean;
  isPaused: boolean;
  category: string;
  taskName: string;
  assignee: string;
  project: string;
  dateReport: string;
  workHours: string;
  qty: string;
  plannedQty: string;
  startTime: string;
  endTime: string;
  totalTime: string;
  workersCount: string;
  workers: string;
  crewCode: string;
  status: string;
  spanDays: string;
  materials: string;
  materialTotal: string;
  notes: string;
  evidenceLinks: string[];
}

export function parseGenericTaskReport(body: string): GenericTaskReportData {
  const lines = body.split('\n');
  const isQlpx = body.includes('BÁO CÁO QLPX');
  const isBch = body.includes('BÁO CÁO BCH');
  const isQaqc =
    body.includes('BÁO CÁO QAQC') || body.includes('BÁO CÁO QLPX') || body.includes('BÁO CÁO BCH');
  const isPaused = body.includes('BÁO CÁO TẠM DỪNG');

  let qty =
    findLineValue(lines, '**Số lượng thực hiện:**')
    || findLineValue(lines, '**Sản lượng:**')
    || findLineValue(lines, '**Khối lượng thực hiện:**')
    || findLineValue(lines, '**Khối lượng thực hiện**:').split('|')[0]?.trim()
    || '';
  let plannedQty =
    findLineValue(lines, '**Khối lượng kế hoạch:**')
    || findLineValue(lines, '**Khối lượng kế hoạch**:').split('|')[0]?.trim()
    || '';

  if (isQlpx) {
    const qlpxQtyLine = lines.find(
      (l) => l.includes('Khối lượng kế hoạch') && l.includes('Khối lượng thực hiện'),
    );
    if (qlpxQtyLine) {
      const kl = parseQlpxPairedFields(qlpxQtyLine, 'Khối lượng kế hoạch', 'Khối lượng thực hiện');
      if (kl.left) plannedQty = kl.left;
      if (kl.right) qty = kl.right;
    }
  }

  return {
    isQlpx,
    isBch,
    isQaqc,
    isPaused,
    category:
      findLineValue(lines, '**Đầu mục:**') || findLineValue(lines, '**Đầu mục (L2):**'),
    taskName:
      findLineValue(lines, '**Việc (L3):**')
      || findLineValue(lines, '**Việc:**')
      || findLineValue(lines, '**Công việc:**')
      || 'Nhiệm vụ',
    assignee:
      findLineValue(lines, '**Người thực hiện:**') || findLineValue(lines, '**Người báo cáo:**') || 'N/A',
    project: findLineValue(lines, '**Dự án:**') || findLineValue(lines, '**Mảng:**') || 'N/A',
    dateReport: parseReportDateFromLines(lines),
    workHours:
      findLineValue(lines, '**Giờ công:**')
      || findLineValue(lines, '**Thời gian:**')
      || findLineValue(lines, '**Thực tế:**')
      || 'N/A',
    qty,
    plannedQty,
    startTime: findLineValue(lines, '**Thời gian bắt đầu:**'),
    endTime: findLineValue(lines, '**Thời gian kết thúc:**'),
    totalTime: findLineValue(lines, '**Tổng thời gian:**'),
    workersCount: findLineValue(lines, '**Số lượng công nhân:**'),
    workers: formatWorkersFieldDisplay(
      findLineValue(lines, '**Số thợ:**')
      || findLineValue(lines, '**Thợ:**')
      || findLineValue(lines, '**Tên công nhân:**'),
    ),
    crewCode: findLineValue(lines, '**Mã tổ:**'),
    status: findLineValue(lines, '**Trạng thái:**'),
    spanDays: findLineValue(lines, '**Làm lấn ngày:**'),
    materials:
      findLineValue(lines, '**VT ca này:**')
      || findLineValue(lines, '**VT đã dùng:**')
      || 'Không có',
    materialTotal: findLineValue(lines, '**Tổng VT lũy kế:**'),
    notes:
      findLineValue(lines, '**Ghi chú báo cáo QAQC:**')
      || findLineValue(lines, '**Ghi chú:**')
      || findLineValue(lines, '**Lý do:**'),
    evidenceLinks: parseEvidenceLinks(lines),
  };
}

export interface QaqcBatchTaskItem {
  taskName: string;
  status: string;
  qty: string;
  notes: string;
}

export interface QaqcBatchWorkerGroup {
  workerCount: number;
  workerNames: string;
  items: QaqcBatchTaskItem[];
}

export interface QaqcBatchCrewBlock {
  crew: string;
  workerGroups: QaqcBatchWorkerGroup[];
}

export interface QaqcBatchReportData {
  reporter: string;
  project: string;
  dateStr: string;
  crewBlocks: QaqcBatchCrewBlock[];
  evidenceLinks: string[];
}

function formatProperCaseName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(' ');
}

export function formatWorkerNamesList(names: string): string {
  return names.split(',').map((n) => formatProperCaseName(n)).join(', ');
}

export function formatWorkersFieldDisplay(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const thợMatch = trimmed.match(/^Thợ:\s*(\d+)(.*)$/i);
  if (thợMatch) {
    const count = thợMatch[1];
    const namesPart = thợMatch[2]?.replace(/^\s*-\s*/, '').trim();
    if (namesPart) return `${count} thợ: ${formatWorkerNamesList(namesPart)}`;
    return count;
  }

  const dashIndex = trimmed.indexOf(' - ');
  if (dashIndex !== -1) {
    const countPart = trimmed.slice(0, dashIndex).trim();
    const namesPart = trimmed.slice(dashIndex + 3).trim();
    if (/^\d+$/.test(countPart) && namesPart) {
      return `${countPart} thợ: ${formatWorkerNamesList(namesPart)}`;
    }
  }

  if (/^\d+$/.test(trimmed)) return trimmed;
  return formatWorkerNamesList(trimmed);
}

export function shouldHideBatchStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === 'đang triển khai' || normalized === 'dang trien khai';
}

function parseQaqcBatchItemLine(line: string): {
  taskName: string;
  status: string;
  workerCount: number;
  workerNames: string;
  workerKey: string;
  qty: string;
  notes: string;
} {
  const trimmed = line.trim();
  const match = trimmed.match(/^(.+?)\s*(?:\[([^\]]+)\])?\s*:\s*(\d+)\s*thợ\s*\(([^)]+)\)(.*)$/i);
  if (!match) {
    return {
      taskName: trimmed,
      status: '',
      workerCount: 0,
      workerNames: '',
      workerKey: '',
      qty: '',
      notes: '',
    };
  }

  const [, taskName, status = '', workerCountStr, workerNames, rest = ''] = match;
  const qty = rest.match(/\|\s*SL:\s*([^|]+)/i)?.[1]?.trim() ?? '';
  const notes = rest.match(/\|\s*GC:\s*(.+)/i)?.[1]?.trim() ?? '';
  const normalizedKey = workerNames
    .split(',')
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');

  return {
    taskName: taskName.trim(),
    status: status.trim(),
    workerCount: parseInt(workerCountStr, 10) || 0,
    workerNames: workerNames.trim(),
    workerKey: normalizedKey,
    qty,
    notes,
  };
}

function groupQaqcBatchItemsByWorkers(items: string[]): QaqcBatchWorkerGroup[] {
  const groups = new Map<string, QaqcBatchWorkerGroup>();
  for (const line of items) {
    const parsed = parseQaqcBatchItemLine(line);
    const key = parsed.workerKey || '__no_workers__';
    if (!groups.has(key)) {
      groups.set(key, {
        workerCount: parsed.workerCount,
        workerNames: parsed.workerNames,
        items: [],
      });
    }
    groups.get(key)!.items.push({
      taskName: parsed.taskName,
      status: parsed.status,
      qty: parsed.qty,
      notes: parsed.notes,
    });
  }
  return Array.from(groups.values());
}

export function formatQaqcBatchTaskLine(
  item: QaqcBatchTaskItem,
  options?: { includeNotes?: boolean },
): string {
  const includeNotes = options?.includeNotes ?? true;
  let line = item.taskName;
  if (item.status && !shouldHideBatchStatus(item.status)) {
    line += ` [${item.status}]`;
  }
  if (item.qty) line += ` | SL: ${item.qty}`;
  if (includeNotes && item.notes) line += ` | GC: ${item.notes}`;
  return line;
}

export function getSharedGroupNotes(items: { notes: string }[]): string | null {
  if (items.length === 0) return null;
  const first = items[0].notes.trim();
  if (!first) return null;
  return items.every((item) => item.notes.trim() === first) ? first : null;
}

export function parseQaqcBatchReport(body: string): QaqcBatchReportData {
  const lines = body.split('\n');
  const rawBlocks: { crew: string; items: string[] }[] = [];
  let currentCrew: { crew: string; items: string[] } | null = null;
  for (const line of lines) {
    const crewMatch = line.match(/^\d+\)\s+\*\*Tổ:\s*(.+?)\*\*/);
    if (crewMatch) {
      if (currentCrew) rawBlocks.push(currentCrew);
      currentCrew = { crew: crewMatch[1].trim(), items: [] };
    } else if (currentCrew && line.trim().startsWith('-')) {
      currentCrew.items.push(line.replace(/^\s*-\s*/, '').trim());
    }
  }
  if (currentCrew) rawBlocks.push(currentCrew);
  const crewBlocks: QaqcBatchCrewBlock[] = rawBlocks.map((block) => ({
    crew: block.crew,
    workerGroups: groupQaqcBatchItemsByWorkers(block.items),
  }));
  const dateMatch = body.match(/BÁO CÁO KẾ HOẠCH NGÀY\s+(\d{2}\/\d{2}\/\d{4})/);
  return {
    reporter: findLineValue(lines, '👤 **Người báo cáo:**', '**Người báo cáo:**') || 'N/A',
    project: findLineValue(lines, '📦 **Dự án:**', '**Dự án:**') || 'N/A',
    dateStr: dateMatch ? dateMatch[1] : '',
    crewBlocks,
    evidenceLinks: parseEvidenceLinks(lines),
  };
}

export interface FactoryReportData {
  isPaused: boolean;
  taskName: string;
  assignee: string;
  project: string;
  actuals: string;
  materials: string;
  notes: string;
  evidenceLinks: string[];
}

export function parseFactoryReport(body: string): FactoryReportData {
  const lines = body.split('\n');
  const isPaused = body.includes('BÁO CÁO TẠM DỪNG NHÀ MÁY');
  return {
    isPaused,
    taskName: findLineValue(lines, '📝 **Việc:**', '**Việc:**'),
    assignee: findLineValue(lines, '👤 **Người thực hiện:**', '**Người thực hiện:**'),
    project:
      findLineValue(lines, '📦 **Dự án:**', '**Dự án:**')
      || findLineValue(lines, '📂 **Mảng:**', '**Mảng:**'),
    actuals:
      findLineValue(lines, '⏱️ **Thực tế:**', '**Thực tế:**')
      || findLineValue(lines, '⏱️ **Thời gian:**', '**Thời gian:**')
      || findLineValue(lines, '⏱️ **Giờ công:**', '**Giờ công:**'),
    materials:
      findLineValue(lines, '📦 **VT đã dùng:**', '**VT đã dùng:**')
      || findLineValue(lines, '📦 **VT ca này:**', '**VT ca này:**')
      || 'Không có',
    notes:
      findLineValue(lines, '📝 **Ghi chú:**', '**Ghi chú:**')
      || findLineValue(lines, '💬 **Ghi chú:**', '**Ghi chú:**')
      || findLineValue(lines, '💬 **Lý do:**', '**Lý do:**'),
    evidenceLinks: parseEvidenceLinks(lines),
  };
}

export function getTaskReportHeader(kind: TaskReportKind, data?: GenericTaskReportData): {
  title: string;
  icon: string;
  variant: 'cyan' | 'sky' | 'emerald' | 'orange' | 'amber' | 'indigo' | 'violet';
} {
  if (kind === 'qlpx_new') return { title: 'Báo cáo QLPX', icon: '🏭', variant: 'cyan' };
  if (kind === 'qaqc_batch') return { title: 'Báo cáo kế hoạch ngày', icon: '🗓️', variant: 'indigo' };
  if (kind === 'factory_pause') return { title: 'BÁO CÁO TẠM DỪNG NHÀ MÁY', icon: '⚠️', variant: 'amber' };
  if (kind === 'factory_completion') return { title: 'BÁO CÁO HOÀN THÀNH NHÀ MÁY', icon: '✅', variant: 'cyan' };
  if (kind === 'ptk') return { title: 'Báo cáo Phòng Thiết kế', icon: '🎨', variant: 'violet' };
  if (!data) return { title: 'Báo cáo hoàn thành', icon: '✅', variant: 'indigo' };
  if (data.isQlpx) return { title: 'Báo cáo QLPX', icon: '🏭', variant: 'emerald' };
  if (data.isBch) return { title: 'Báo cáo BCH', icon: '🏗️', variant: 'orange' };
  if (data.isQaqc) return { title: 'Báo cáo Nghiệm thu', icon: '🛡️', variant: 'sky' };
  if (data.isPaused) return { title: 'Báo cáo tạm dừng', icon: '⏸️', variant: 'amber' };
  return { title: 'Báo cáo hoàn thành', icon: '✅', variant: 'indigo' };
}

export interface PtkReportData {
  title: string;
  icon: string;
  taskName: string;
  category: string;
  project: string;
  assignee: string;
  dateReport: string;
  startTime: string;
  endTime: string;
  progress: string;
  workStatus: string;
  notes: string;
  evidenceLinks: string[];
  isPause: boolean;
}

function parseLegacyTimes(workHours: string): { start: string; end: string } {
  const m = workHours.match(/^(\d{1,2}:\d{2})\s*➔\s*(\d{1,2}:\d{2})/);
  if (!m) return { start: '', end: '' };
  return { start: m[1], end: m[2] };
}

function detectPtkTitle(body: string): { title: string; icon: string; isPause: boolean } {
  if (body.includes('BẮT ĐẦU CÔNG VIỆC')) return { title: 'Bắt đầu công việc', icon: '▶️', isPause: false };
  if (body.includes('TIẾP TỤC CÔNG VIỆC')) return { title: 'Tiếp tục công việc', icon: '▶️', isPause: false };
  if (body.includes('TẠM DỪNG CÔNG VIỆC')) return { title: 'Tạm dừng công việc', icon: '⚠️', isPause: true };
  if (body.includes('HOÀN THÀNH CÔNG VIỆC') || body.includes('BÁO CÁO HOÀN THÀNH')) {
    return { title: 'Hoàn thành công việc', icon: '🟢', isPause: false };
  }
  return { title: 'Báo cáo công việc', icon: '✅', isPause: false };
}

export function parsePtkReport(body: string): PtkReportData {
  const lines = body.split('\n');
  const header = detectPtkTitle(body);
  const legacy = parseLegacyTimes(findLineValue(lines, '**Giờ công hôm nay:**'));

  return {
    ...header,
    taskName: findLineValue(lines, '**Công việc:**'),
    category: findLineValue(lines, '**Hạng mục:**'),
    project: findLineValue(lines, '**Dự án:**'),
    assignee: findLineValue(lines, '**Người thực hiện:**'),
    dateReport: parseReportDateFromLines(lines),
    startTime: findLineValue(lines, '**Giờ bắt đầu:**') || legacy.start,
    endTime: findLineValue(lines, '**Giờ kết thúc:**') || legacy.end,
    progress:
      findLineValue(lines, '**Tiến độ công việc:**')
      || findLineValue(lines, '**Tiến độ báo cáo:**'),
    workStatus:
      findLineValue(lines, '**Trạng thái công việc:**')
      || findLineValue(lines, '**Trạng thái báo cáo:**'),
    notes:
      findLineValue(lines, '**Ghi chú:**')
      || findLineValue(lines, '💬 **Ghi chú:**'),
    evidenceLinks: parseEvidenceLinks(lines),
  };
}
