export const PO_MESSAGE_MARKER = 'Phê duyệt PO';
export const VEHICLE_MESSAGE_MARKER = 'Phê duyệt Chi Phí Vận Chuyển';
export const META_START = '[[PO_UI_META]]';
export const META_END = '[[/PO_UI_META]]';

export interface PoTimelineRow {
  role: string;
  person: string;
  time: string;
  date: string;
}

export interface PoUiItem {
  stt: number;
  material_name: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  total_price: number;
  status_text?: string | null;
  wbs_requester?: string | null;
  wbs_reason?: string | null;
}

export interface PoUiMeta {
  po_id?: number;
  po_version?: number;
  is_vehicle?: boolean;
  header_title?: string;
  supplier_name?: string;
  total_vnd?: number;
  project_code?: string;
  project_name?: string;
  tpkh_note?: string;
  notes?: string;
  items_desc?: string;
  timeline?: PoTimelineRow[];
  items?: PoUiItem[];
}

function findField(lines: string[], label: string): string {
  const line = lines.find((row) => row.includes(label));
  if (!line) return '';
  const index = line.indexOf(label);
  if (index < 0) return '';
  return line.slice(index + label.length).replace(/\*\*/g, '').trim();
}

function parseNoteLines(lines: string[], prefix: string): string[] {
  return lines
    .filter((line) => line.includes(prefix))
    .map((line) => findField([line], prefix));
}

export function parsePoUiMeta(body: string): { displayBody: string; meta: PoUiMeta | null } {
  const start = body.indexOf(META_START);
  if (start < 0) return { displayBody: body, meta: null };
  const end = body.indexOf(META_END, start);
  if (end < 0) return { displayBody: body, meta: null };
  try {
    const json = body.slice(start + META_START.length, end);
    const meta = JSON.parse(json) as PoUiMeta;
    const displayBody = `${body.slice(0, start)}${body.slice(end + META_END.length)}`.trim();
    return { displayBody, meta };
  } catch {
    return { displayBody: body, meta: null };
  }
}

export function isPoApprovalMessage(body: string | null | undefined): boolean {
  const text = String(body ?? '');
  if (text.includes(META_START)) return true;
  if (!text.includes('**Người gửi:**')) return false;
  return (
    text.includes(PO_MESSAGE_MARKER)
    || text.includes(VEHICLE_MESSAGE_MARKER)
    || text.includes('**Link duyệt ERP:**')
  );
}

export function poRoleColor(role: string): string {
  if (role === 'KTMH') return '#fbbf24';
  if (role === 'PKH') return '#34d399';
  return '#e2e8f0';
}

export function poRoleLabelColor(role: string): string {
  if (role === 'KTMH') return '#f59e0bcc';
  if (role === 'PKH') return '#34d399cc';
  return '#94a3b8';
}

export function parsePoApprovalCardData(body: string) {
  const { displayBody, meta } = parsePoUiMeta(body);
  const lines = displayBody.split('\n');
  const isVehicle = meta?.is_vehicle ?? displayBody.includes(VEHICLE_MESSAGE_MARKER);
  const showWbsColumn = (() => {
    if (!meta?.items?.length) return false;
    const hasSpecial = meta.items.some((item) => (item.status_text || 'Trong KH') !== 'Trong KH');
    if (!hasSpecial) return false;
    const totalNameLen = meta.items.reduce((acc, item) => acc + item.material_name.length, 0);
    return meta.items.length <= 6 && totalNameLen <= 180;
  })();

  if (meta?.timeline?.length || meta?.items?.length) {
    const headerTitle =
      meta.header_title
      || (meta.supplier_name
        ? `🛒 NCC: ${meta.supplier_name.toUpperCase()} | ${(meta.total_vnd || 0).toLocaleString('vi-VN')} ₫ | PO#${meta.po_version ?? meta.po_id}`
        : '🏛️ Phê duyệt PO');
    const projectLabel = [meta.project_code, meta.project_name].filter(Boolean).join(' — ');
    const itemsDesc = (meta.items_desc || findField(lines, '**Nội dung:**')).trim();
    const supplierNote = (meta.notes || findField(lines, '**Ghi chú:**')).trim();
    return {
      mode: 'rich' as const,
      isVehicle,
      showWbsColumn,
      meta,
      headerTitle,
      projectLabel,
      itemsDesc,
      supplierNote,
    };
  }

  const cardTitle = (
    lines.find((line) => line.includes(PO_MESSAGE_MARKER) || line.includes(VEHICLE_MESSAGE_MARKER)) ?? ''
  )
    .replace(/\*\*/g, '')
    .replace(/🏛️|🚚/g, '')
    .trim();

  return {
    mode: 'legacy' as const,
    isVehicle,
    cardTitle: cardTitle || 'Phê duyệt PO',
    proposer: findField(lines, '**Người đề xuất:**'),
    sender: findField(lines, '**Người gửi:**'),
    project: findField(lines, '**Dự án:**'),
    supplier: findField(lines, '**NCC:**'),
    value: findField(lines, '**Giá trị:**') || findField(lines, '**Chi phí dự kiến:**'),
    noteLines: [
      ...parseNoteLines(lines, '**Ghi chú trình PO:**'),
      ...parseNoteLines(lines, '**Ghi chú QLNM:**'),
      ...parseNoteLines(lines, '**Ghi chú PKH:**'),
    ].filter(Boolean),
  };
}
