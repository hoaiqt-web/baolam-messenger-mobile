export const TVVT_META_START = '[[TVVT_PRICE_META]]';
export const TVVT_META_END = '[[/TVVT_PRICE_META]]';

export type TvvtPriceRow = {
  material_name?: string;
  unit?: string;
  old_price?: number | null;
  new_price?: number | null;
  line?: string;
  reason?: string;
  message?: string;
};

export type TvvtPriceMeta = {
  po_id?: number;
  po_code?: string;
  updated?: TvvtPriceRow[];
  skipped?: TvvtPriceRow[];
};

export function isTvvtPriceUpdateMessage(body: string | null | undefined): boolean {
  const text = String(body ?? '');
  return text.includes(TVVT_META_START) || text.includes('CẬP NHẬT ĐƠN GIÁ TVVT');
}

export function parseTvvtPriceMeta(body: string): TvvtPriceMeta | null {
  const start = body.indexOf(TVVT_META_START);
  if (start < 0) return null;
  const end = body.indexOf(TVVT_META_END, start);
  if (end < 0) return null;
  try {
    return JSON.parse(body.slice(start + TVVT_META_START.length, end)) as TvvtPriceMeta;
  } catch {
    return null;
  }
}
