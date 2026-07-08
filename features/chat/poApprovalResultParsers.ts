export type PoApprovalResultData = {
  poId: string;
  isVehicle: boolean;
  isApproved: boolean;
  isRejected: boolean;
  title: string;
  approverName: string;
  detailLine: string;
  footerLine: string;
};

const APPROVED_PO = /PO\s*#(\d+)\s*ĐÃ\s*ĐƯỢC\s*DUYỆT/i;
const REJECTED_PO = /PO\s*#(\d+)\s*ĐÃ\s*BỊ\s*TỪ\s*CHỐI/i;
const APPROVED_VEHICLE = /ĐỀ\s*XUẤT\s*ĐIỀU\s*XE\s*#(\d+)\s*ĐÃ\s*ĐƯỢC\s*DUYỆT/i;
const REJECTED_VEHICLE = /ĐỀ\s*XUẤT\s*ĐIỀU\s*XE\s*#(\d+)\s*ĐÃ\s*BỊ\s*TỪ\s*CHỐI/i;

function stripMd(text: string): string {
  return text.replace(/\*\*/g, '').replace(/🏛️|🚚|❌/g, '').trim();
}

export function isPoApprovalResultMessage(body: string | null | undefined): boolean {
  const text = stripMd(String(body ?? ''));
  return (
    APPROVED_PO.test(text)
    || REJECTED_PO.test(text)
    || APPROVED_VEHICLE.test(text)
    || REJECTED_VEHICLE.test(text)
  );
}

export function parsePoApprovalResultData(body: string): PoApprovalResultData | null {
  const raw = String(body ?? '').trim();
  if (!raw) return null;

  const flat = stripMd(raw);
  const isVehicle = /điều xe|vận chuyển/i.test(flat) || raw.includes('🚚');
  const isApproved = /ĐÃ ĐƯỢC DUYỆT/i.test(flat);
  const isRejected = /ĐÃ BỊ TỪ CHỐI/i.test(flat);
  if (!isApproved && !isRejected) return null;

  const idMatch =
    flat.match(APPROVED_PO)
    || flat.match(REJECTED_PO)
    || flat.match(APPROVED_VEHICLE)
    || flat.match(REJECTED_VEHICLE);
  const poId = idMatch?.[1] ?? '?';

  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^━+$/.test(l));

  const title = stripMd(lines[0] ?? (isVehicle ? `Đề xuất điều xe #${poId}` : `PO #${poId}`));

  const actionLine = lines.find((l) => /CFO\/CEO/i.test(l)) ?? lines[1] ?? '';
  const approverMatch = actionLine.match(/CFO\/CEO\s*\*\*([^*]+)\*\*/i)
    || actionLine.match(/CFO\/CEO\s+([^\s].+?)\s+đã/i);
  const approverName = (approverMatch?.[1] ?? '').replace(/\*\*/g, '').trim();

  const detailLine = stripMd(actionLine);
  const footerLine = stripMd(lines.find((l) => /ERP|đồng bộ|HỦY|CANCELLED/i.test(l)) ?? lines[lines.length - 1] ?? '');

  return {
    poId,
    isVehicle,
    isApproved,
    isRejected,
    title,
    approverName,
    detailLine,
    footerLine,
  };
}
