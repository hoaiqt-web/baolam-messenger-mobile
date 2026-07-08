/** Nhóm chat kho — thông báo PYCVT luôn hiện (không cần @mention). */
export function isWarehouseConversationName(name: string | null | undefined): boolean {
  const normalized = String(name ?? '').trim().toUpperCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes('KHO XƯỞNG BA VÌ')
    || normalized.includes('KHO XUONG BA VI')
    || normalized.includes('KHO HIỆN TRƯỜNG')
    || normalized.includes('KHO HIEN TRUONG')
    || normalized.includes('KHO BAVI')
    || normalized.includes('KHOBAVI')
  );
}

export { isPycvtWarehouseMessage, parsePycvtCardTitle, stripPycvtMeta } from '@/features/chat/pycvtParsers';
