export const PYCVT_MESSAGE_MARKER = 'PHIẾU YÊU CẦU VẬT TƯ';
export const PO_INSPECT_MESSAGE_MARKER = 'PHIẾU KIỂM HÀNG NHẬP KHO';
export const KTK_RECEIPT_MESSAGE_MARKER = 'KTK DUYỆT NHẬP KHO';
export const DEFAULT_CARD_TITLE = 'Phiếu yêu cầu vật tư';
export const META_START = '[[PYCVT_META]]';
export const META_END = '[[/PYCVT_META]]';

export interface PycvtTimelineEntry {
  at?: string;
  event?: string;
  detail?: string;
  role?: string;
  person?: string;
  time?: string;
  date?: string;
}

export interface PycvtDeliveryPhoto {
  object_key?: string;
  url?: string;
  original_name?: string;
  at?: string;
  material_name?: string;
  slip_code?: string;
  uploaded_by?: string;
  caption?: string;
}

export interface PycvtMaterialMeta {
  stt?: number;
  material_name?: string;
  quantity_label?: string;
  status?: string;
  kind?: 'root' | 'branch';
  branch_prefix?: string;
  branch_label?: string;
}

export interface PycvtMeta {
  batch_key?: string;
  header_title?: string;
  request_code?: string;
  project_code?: string;
  project_name?: string;
  aggregate_status?: string;
  proposer_name?: string;
  work_date?: string;
  reason?: string;
  progress?: { done?: number; total?: number; label?: string };
  timeline?: PycvtTimelineEntry[];
  materials?: PycvtMaterialMeta[];
  material_count?: number;
  delivery_photos?: PycvtDeliveryPhoto[];
}

export interface PycvtMaterialLine {
  kind: 'root' | 'branch';
  prefix?: string;
  label: string;
  quantity: string;
  status: string;
}

function findField(lines: string[], label: string): string {
  const line = lines.find((row) => row.includes(label));
  if (!line) return '';
  const index = line.indexOf(label);
  if (index < 0) return '';
  return line.slice(index + label.length).replace(/\*\*/g, '').trim();
}

export function stripPycvtMeta(body: string): string {
  const start = body.indexOf(META_START);
  if (start < 0) return body;
  const end = body.indexOf(META_END, start);
  if (end < 0) return body.slice(0, start).trimEnd();
  return (body.slice(0, start) + body.slice(end + META_END.length)).trimEnd();
}

export function parsePycvtMeta(body: string | null | undefined): PycvtMeta | null {
  const text = String(body ?? '');
  const start = text.indexOf(META_START);
  const end = text.indexOf(META_END, start);
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(text.slice(start + META_START.length, end)) as PycvtMeta;
  } catch {
    return null;
  }
}

function splitAtToTableParts(at?: string): { time: string; date: string } {
  const value = String(at ?? '').trim();
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{2}:\d{2})$/);
  if (match) {
    return { time: match[3], date: `${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` };
  }
  if (/^\d{2}:\d{2}$/.test(value)) return { time: value, date: '—' };
  return { time: '—', date: '—' };
}

function parseTimelineSortKey(row: PycvtTimelineEntry): number | null {
  const date = String(row.date ?? '').trim();
  const time = String(row.time ?? '').trim();
  const year = new Date().getFullYear();

  if (/^\d{1,2}-\d{1,2}$/.test(date) && /^\d{1,2}:\d{2}$/.test(time)) {
    const [month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute).getTime();
  }

  const atMatch = String(row.at ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (atMatch) {
    return new Date(
      year,
      Number(atMatch[2]) - 1,
      Number(atMatch[1]),
      Number(atMatch[3]),
      Number(atMatch[4]),
    ).getTime();
  }

  return null;
}

function sortTimelineRowsByDateTime(rows: PycvtTimelineEntry[]): PycvtTimelineEntry[] {
  return [...rows].sort((a, b) => {
    const aKey = parseTimelineSortKey(a);
    const bKey = parseTimelineSortKey(b);
    if (aKey !== null && bKey !== null) return aKey - bKey;
    if (aKey !== null) return -1;
    if (bKey !== null) return 1;
    return 0;
  });
}

function inferRoleFromEvent(event: string): string {
  const value = event.toLowerCase();
  if (value.includes('gửi phiếu')) return 'Đề xuất';
  if (value.startsWith('hệ thống') || value.includes('hệ thống lập pxk') || value.includes('hệ thống tách')) return 'Hệ thống';
  if (value.startsWith('qaqc') || value.includes('qaqc duyệt')) return 'QAQC';
  if (value.startsWith('ktk')) return 'KTK';
  if (value.startsWith('ktmh')) return 'KTMH';
  if (value.includes('thủ kho') || value.includes('giao hàng')) return 'Giao hàng';
  if (value.includes('nhận hàng')) return 'Nhận hàng';
  return '—';
}

function normalizeTimelineTableRows(entries: PycvtTimelineEntry[]): PycvtTimelineEntry[] {
  return entries.map((entry) => {
    if (entry.role && entry.time && entry.date) return entry;
    const parts = splitAtToTableParts(entry.at);
    const event = String(entry.event ?? '').trim();
    const detail = String(entry.detail ?? '').trim();
    let role = inferRoleFromEvent(event);
    let person = detail || '—';
    if (/^pkh duyệt:/i.test(event)) {
      const material = event.replace(/^pkh duyệt:\s*/i, '').trim();
      if (material) person = detail || material;
    }
    return {
      ...entry,
      role,
      person,
      time: entry.time || parts.time,
      date: entry.date || parts.date,
    };
  });
}

export function remapExecutiveTimelineRole(row: PycvtTimelineEntry): PycvtTimelineEntry {
  const role = String(row.role ?? '').trim();
  const roleUpper = role.toUpperCase();
  if (!['BAN GIÁM ĐỐC', 'BAN GIAM DOC', 'CEO', 'CFO', 'ADMIN'].includes(roleUpper)) {
    return row;
  }
  const event = String(row.event ?? '').toLowerCase();
  const detail = String(row.detail ?? '').toLowerCase();
  const haystack = event || detail;
  const mappedRole = (() => {
    if (haystack.includes('qaqc gửi phiếu')) return 'Đề xuất';
    if (haystack.includes('gửi phiếu') || haystack.includes('gửi hoàn')) return 'Đề xuất';
    if (haystack.includes('qaqc duyệt') || (haystack.includes('qaqc') && haystack.includes('duyệt'))) return 'QAQC';
    if (haystack.includes('tiền kiểm')) return haystack.includes('qlvt') ? 'QLVT' : 'Thủ kho';
    if (haystack.includes('hệ thống') || haystack.includes('ktk') || haystack.includes('pxk') || haystack.includes('tách phiếu') || haystack.includes('lập phiếu')) return 'Hệ thống';
    if (haystack.includes('ktmh') || haystack.includes('mua hàng')) return 'KTMH';
    if (haystack.includes('giao hàng') || haystack.includes('thủ kho') || haystack.includes('qlvt')) return 'Giao hàng';
    if (haystack.includes('nhận hàng') || haystack.includes('xác nhận nhận')) return 'Nhận hàng';
    return 'Đề xuất';
  })();
  return { ...row, role: mappedRole };
}

export function reconcilePycvtTimelineRows(
  entries: PycvtTimelineEntry[],
  aggregateStatus: string,
  proposerName: string,
): PycvtTimelineEntry[] {
  const proposer = proposerName.trim();
  const waitingQaqc = aggregateStatus.toLowerCase().includes('chờ qaqc');
  let rows = normalizeTimelineTableRows(entries).filter((row) => {
    const role = String(row.role ?? '').trim().toUpperCase();
    const event = String(row.event ?? '').toLowerCase();
    if (role === 'QLNM' || role === 'PKH') return false;
    if (event.startsWith('qlnm') || event.startsWith('pkh')) return false;
    return true;
  });

  if (waitingQaqc && proposer) {
    const hasProposerRow = rows.some((row) => String(row.role ?? '') === 'Đề xuất');
    if (!hasProposerRow) {
      rows = rows.map((row) => {
        const role = String(row.role ?? '').trim();
        const event = String(row.event ?? '').toLowerCase();
        if (role === 'QLNM' && (event.startsWith('qlnm duyệt') || event === '')) {
          return {
            ...row,
            role: 'Đề xuất',
            person: proposer,
            event: event.includes('gửi phiếu') ? row.event : 'Gửi phiếu',
          };
        }
        return row;
      });
    }
    if (!rows.some((row) => String(row.role ?? '') === 'Đề xuất')) {
      const anchor = rows[0];
      rows = [
        {
          role: 'Đề xuất',
          person: proposer,
          time: anchor?.time || '—',
          date: anchor?.date || '—',
          event: 'Gửi phiếu',
        },
        ...rows,
      ];
    }
  }

  rows = rows.filter((row) => {
    const role = String(row.role ?? '').trim();
    const event = String(row.event ?? '').toLowerCase();
    const detail = String(row.detail ?? '').toLowerCase();
    const person = String(row.person ?? '').toLowerCase();
    if (role === 'QAQC' && !event.includes('duyệt')) {
      return false;
    }
    if (
      role === 'KTMH'
      && (
        event.includes('hệ thống chuyển')
        || detail.includes('hệ thống chuyển ktmh')
        || detail.includes('chuyển ktmh mua')
        || person === 'hệ thống'
      )
    ) {
      return false;
    }
    if (
      (role === 'Giao hàng' || role === 'QLVT' || role === 'Thủ kho')
      && !event.includes('đã giao')
      && !event.includes('tiền kiểm')
      && !event.includes('hoàn trả')
      && !detail.includes('đã giao')
      && !detail.includes('tiền kiểm')
      && !detail.includes('hoàn trả')
      && !event.includes('thủ kho đã giao')
    ) {
      return false;
    }
    return true;
  });

  return sortTimelineRowsByDateTime(collapseProposerTimelineRows(rows.map((row) => {
    const normalized = remapExecutiveTimelineRole(row);
    const event = String(normalized.event ?? '').toLowerCase();
    const role = String(normalized.role ?? '').trim();
    if (
      (event.includes('xác nhận nhận') || event.includes('cht xác nhận nhận'))
      && role === 'Giao hàng'
    ) {
      return { ...normalized, role: 'Nhận hàng' };
    }
    return normalized;
  })));
}

function isProposerSubmitRow(role: string, event: string): boolean {
  const roleTrim = String(role ?? '').trim();
  const eventLower = event.toLowerCase();
  if (eventLower.includes('duyệt') && !eventLower.includes('gửi phiếu')) return false;
  if (['QLPX', 'CHT', 'CBKT', 'Đề xuất'].includes(roleTrim)) return true;
  if (roleTrim === 'QAQC' && eventLower.includes('gửi')) return true;
  return eventLower.includes('gửi phiếu') || eventLower.includes('gửi hoàn');
}

function collapseProposerTimelineRows(rows: PycvtTimelineEntry[]): PycvtTimelineEntry[] {
  const result: PycvtTimelineEntry[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const event = String(row.event ?? '');
    const role = String(row.role ?? '').trim();

    if (isProposerSubmitRow(role, event)) {
      const normalized: PycvtTimelineEntry = { ...row, role: 'Đề xuất' };
      const key = `${normalized.time}|${normalized.date}|${String(normalized.person ?? '').trim().toLowerCase()}`;
      if (key !== '—|—|' && seen.has(key)) continue;
      if (key !== '—|—|') seen.add(key);
      result.push(normalized);
      continue;
    }

    if (role === 'Tiền kiểm' || event.toLowerCase().includes('tiền kiểm')) {
      const eventLower = event.toLowerCase();
      const person = String(row.person ?? '').trim();
      result.push({
        ...row,
        role: eventLower.includes('qlvt') ? 'QLVT' : 'Thủ kho',
        person: person.toLowerCase() === 'hệ thống' ? '—' : row.person,
      });
      continue;
    }

    result.push(row);
  }

  return result;
}

export function parseMaterialLines(lines: string[]): PycvtMaterialLine[] {
  const items: PycvtMaterialLine[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    const branchMatch = line.match(/^\s*([├└]─)\s+(.+?)\s+—\s+(.+?)\s{2,}(.+)$/);
    if (branchMatch) {
      items.push({
        kind: 'branch',
        prefix: branchMatch[1],
        label: branchMatch[2].trim(),
        quantity: branchMatch[3].trim(),
        status: branchMatch[4].trim(),
      });
      continue;
    }
    const rootMatch = line.match(/^•\s+(.+?)\s+—\s+(.+?)\s{2,}(.+)$/);
    if (rootMatch) {
      items.push({
        kind: 'root',
        label: rootMatch[1].trim(),
        quantity: rootMatch[2].trim(),
        status: rootMatch[3].trim(),
      });
      continue;
    }
    const legacyBranchMatch = line.match(/^\s*([├└]─)\s+(.+?)\s+—\s+(.+?)\s+\[(.+)\]$/);
    if (legacyBranchMatch) {
      items.push({
        kind: 'branch',
        prefix: legacyBranchMatch[1],
        label: legacyBranchMatch[2].trim(),
        quantity: legacyBranchMatch[3].trim(),
        status: legacyBranchMatch[4].trim(),
      });
      continue;
    }
    const legacyRootMatch = line.match(/^•\s+(.+?)\s+—\s+(.+?)\s+\[(.+)\]$/);
    if (legacyRootMatch) {
      items.push({
        kind: 'root',
        label: legacyRootMatch[1].trim(),
        quantity: legacyRootMatch[2].trim(),
        status: legacyRootMatch[3].trim(),
      });
      continue;
    }
    if (line.startsWith('•')) {
      items.push({ kind: 'root', label: line.replace(/^•\s*/, '').trim(), quantity: '', status: '' });
    }
  }
  return items;
}

function parseTimelineLines(lines: string[]): PycvtTimelineEntry[] {
  const timelineStart = lines.findIndex((line) => line.includes('**Tiến trình:**'));
  if (timelineStart < 0) return [];
  const entries: PycvtTimelineEntry[] = [];
  for (let i = timelineStart + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || line.startsWith(META_START) || line === '----') break;
    const match = line.match(
      /^\s*(\d{1,2}\/\d{1,2}\s+\d{2}:\d{2}|\d{2}:\d{2})\s+(.+?)(?:\s+—\s+(.+))?$/,
    );
    if (match) {
      entries.push({ at: match[1], event: match[2]?.trim(), detail: match[3]?.trim() });
    }
  }
  return entries;
}

export function parsePycvtCardTitle(body: string | null | undefined): string {
  const displayBody = stripPycvtMeta(String(body ?? ''));
  if (displayBody.includes(PYCVT_MESSAGE_MARKER)) return DEFAULT_CARD_TITLE;
  const lines = displayBody.split('\n');
  return findField(lines, '**Tiêu đề card:**') || DEFAULT_CARD_TITLE;
}

export function parsePycvtStatus(lines: string[], meta?: PycvtMeta | null): string {
  return (
    meta?.aggregate_status
    || findField(lines, '**Trạng thái phiếu:**')
    || findField(lines, '**Trạng thái:**')
    || findField(lines, '**Đã đến:**')
  );
}

export function parsePycvtStatusNote(lines: string[]): string {
  const structured = findField(lines, '**Ghi chú trạng thái:**');
  if (structured) return structured;
  return lines.find((line) => line.trim().startsWith('ℹ️'))?.replace(/^ℹ️\s*/, '').trim() ?? '';
}

export function buildProjectLabel(meta: PycvtMeta | null, projectField: string): string {
  if (meta?.project_code || meta?.project_name) {
    return [meta.project_code, meta.project_name].filter(Boolean).join(' — ');
  }
  return projectField;
}

export function isPycvtBatchMessage(body: string | null | undefined): boolean {
  const raw = String(body ?? '');
  if (parsePycvtMeta(raw)?.batch_key) {
    return true;
  }
  return stripPycvtMeta(raw).includes(PYCVT_MESSAGE_MARKER);
}

export function isPycvtWarehouseMessage(body: string | null | undefined): boolean {
  const raw = String(body ?? '');
  if (parsePycvtMeta(raw)) {
    return true;
  }
  const text = stripPycvtMeta(raw);
  if (
    text.includes(PYCVT_MESSAGE_MARKER)
    || text.includes(PO_INSPECT_MESSAGE_MARKER)
    || text.includes(KTK_RECEIPT_MESSAGE_MARKER)
  ) {
    return true;
  }
  return (
    text.includes('**Mã phiếu:**')
    && (text.includes('**Trạng thái:**') || text.includes('**Đã đến:**'))
    && text.includes('Chi tiết vật tư')
  );
}

export function pycvtRoleLabelColor(role: string): string {
  const value = role.toLowerCase();
  if (value.includes('qaqc') || value.includes('đề xuất')) return '#c4b5fdcc';
  if (value.includes('ktmh')) return '#f59e0bcc';
  if (value.includes('ktk')) return '#22d3eecc';
  if (value.includes('thủ kho') || value.includes('giao hàng')) return '#fb923ccc';
  if (value.includes('nhận')) return '#34d399cc';
  return '#94a3b8';
}

export function pycvtRolePersonColor(role: string): string {
  const value = role.toLowerCase();
  if (value.includes('qaqc') || value.includes('đề xuất')) return '#c4b5fd';
  if (value.includes('ktmh')) return '#fbbf24';
  if (value.includes('ktk')) return '#22d3ee';
  if (value.includes('thủ kho') || value.includes('giao hàng')) return '#fb923c';
  if (value.includes('nhận')) return '#34d399';
  return '#e2e8f0';
}

export function titleAccentColor(cardTitle: string): string {
  const value = cardTitle.toLowerCase();
  if (value.includes('từ chối')) return '#fda4af';
  if (value.includes('kiểm hàng')) return '#7dd3fc';
  if (value.includes('duyệt')) return '#c4b5fd';
  if (value.includes('ktk')) return '#67e8f9';
  if (value.includes('giao hàng')) return '#fdba74';
  if (value.includes('đã nhận')) return '#6ee7b7';
  return '#fcd34d';
}

export function parsePycvtCardData(body: string) {
  const meta = parsePycvtMeta(body);
  const displayBody = stripPycvtMeta(body);
  const lines = displayBody.split('\n');
  const requestCode = meta?.request_code || findField(lines, '**Mã phiếu:**');
  const projectField = findField(lines, '**Dự án:**');
  const projectLabel = buildProjectLabel(meta, projectField);
  const department = parsePycvtStatus(lines, meta);
  const note = meta?.reason || findField(lines.filter((line) => line.includes('💬')), '**Ghi chú:**');
  const statusNote = parsePycvtStatusNote(lines);
  const proposerName =
    meta?.proposer_name
    || findField(lines, '**Người đề xuất:**')
    || findField(lines, '**Người gửi:**')
    || '';
  const source = meta?.timeline?.length ? meta.timeline : parseTimelineLines(lines);
  const timelineRows = reconcilePycvtTimelineRows(source, department, proposerName).slice(-12);
  const materials: PycvtMaterialMeta[] = meta?.materials?.length
    ? meta.materials
    : (() => {
        let rootStt = 0;
        return parseMaterialLines(lines).map((item) => {
          const row: PycvtMaterialMeta = {
            material_name: item.label,
            quantity_label: item.quantity,
            status: item.status,
            kind: item.kind,
            branch_prefix: item.kind === 'branch' ? item.prefix : '',
            branch_label: '',
          };
          if (item.kind !== 'branch') {
            rootStt += 1;
            row.stt = rootStt;
          }
          return row;
        });
      })();
  const materialCountLabel =
    meta?.material_count
    ?? (materials.filter((item) => item.kind !== 'branch').length || materials.length);
  const deliveryPhotos = (meta?.delivery_photos ?? []).filter((photo) => Boolean(photo?.url));
  const headerTitle =
    meta?.header_title || `📋 Phiếu yêu cầu vật tư${requestCode ? ` | ${requestCode}` : ''}`;
  return {
    meta,
    lines,
    requestCode,
    projectLabel,
    department,
    note,
    statusNote,
    proposerName,
    timelineRows,
    materials,
    materialCountLabel,
    deliveryPhotos,
    headerTitle,
    cardTitle: parsePycvtCardTitle(body),
    supplier: findField(lines, '**NCC:**'),
    sender: findField(lines, '**Người đề xuất:**') || findField(lines, '**Người gửi:**') || '',
    workDate: findField(lines, '**Ngày làm việc:**'),
    materialLines: parseMaterialLines(lines),
    headerIcon: body.includes(KTK_RECEIPT_MESSAGE_MARKER)
      ? '✅'
      : body.includes(PO_INSPECT_MESSAGE_MARKER)
        ? '📥'
        : '📋',
  };
}
