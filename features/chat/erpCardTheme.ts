/** Shared palette tokens for ERP structured message cards (parity with web dark cards). */

export type ErpCardPalette = {
  cardBg: string;
  cardBorder: string;
  text: string;
  textMuted: string;
  label: string;
  accent: string;
  tableHeadBg: string;
  tableHeadText: string;
  /** Outer table frame + horizontal row lines */
  tableBorder: string;
  /** Soft vertical column dividers inside tables */
  tableCellDivider: string;
  /** Inner panels: status box, notes, collapse bar */
  innerBorder: string;
  tableRowText: string;
};

type ErpVariant = 'amber' | 'emerald' | 'cyan' | 'sky' | 'indigo' | 'blue' | 'orange' | 'violet';

type ErpLineSet = { frame: string; grid: string; gridSoft: string; inner: string };

/** Muted line colors — visible on dark card bg without harsh contrast */
const ERP_LINES: Record<ErpVariant, ErpLineSet> = {
  amber: { frame: '#a68b52', grid: '#8a7550', gridSoft: '#7a684888', inner: '#9a8458' },
  emerald: { frame: '#4f9a78', grid: '#3f7f65', gridSoft: '#3f7f6588', inner: '#5a9f7c' },
  cyan: { frame: '#4f8fa8', grid: '#3f758a', gridSoft: '#3f758a88', inner: '#5a94ab' },
  sky: { frame: '#4a8fad', grid: '#3d7894', gridSoft: '#3d789488', inner: '#5699b5' },
  indigo: { frame: '#6a72a8', grid: '#565e8f', gridSoft: '#565e8f88', inner: '#7880b0' },
  blue: { frame: '#5a82b5', grid: '#4a6d98', gridSoft: '#4a6d9888', inner: '#6890be' },
  orange: { frame: '#a87850', grid: '#8f6648', gridSoft: '#8f664888', inner: '#b88860' },
  violet: { frame: '#8a6aa8', grid: '#725a8f', gridSoft: '#725a8f88', inner: '#9a7ab8' },
};

const CARD_FRAME: Record<ErpVariant, { mine: string; other: string }> = {
  amber: { mine: '#3d9a7a88', other: '#c4a03588' },
  emerald: { mine: '#3d9a7a88', other: '#3ecf9f88' },
  cyan: { mine: '#38b8d888', other: '#8a9fd888' },
  sky: { mine: '#4ab0d888', other: '#5ab0d088' },
  indigo: { mine: '#38b8d888', other: '#9098d888' },
  blue: { mine: '#5a98e088', other: '#6898d088' },
  orange: { mine: '#e0905088', other: '#d0905888' },
  violet: { mine: '#a855f788', other: '#c084fc88' },
};

export function erpDarkCardPalette(mine: boolean, variant: ErpVariant = 'amber'): ErpCardPalette {
  const lines = ERP_LINES[variant] ?? ERP_LINES.amber;
  const frame = CARD_FRAME[variant] ?? CARD_FRAME.amber;
  const bgs: Record<string, string> = {
    amber: mine ? '#064e3b55' : '#1a1408cc',
    emerald: mine ? '#064e3b55' : '#0a1a12cc',
    cyan: mine ? '#0c4a6e66' : '#130f2ccc',
    sky: mine ? '#0c4a6e66' : '#0c203bcc',
    indigo: mine ? '#0c4a6e66' : '#130f2ccc',
    blue: mine ? '#1e3a8a55' : '#0c1a2ecc',
    orange: mine ? '#7c2d1255' : '#431407cc',
    violet: mine ? '#3b076455' : '#1a1030cc',
  };
  return {
    cardBg: bgs[variant] ?? bgs.amber,
    cardBorder: mine ? frame.mine : frame.other,
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    label: '#7d8fa8',
    accent: '#fbbf24',
    tableHeadBg: '#1a2838',
    tableHeadText: '#9ec4e0',
    tableBorder: lines.grid,
    tableCellDivider: lines.gridSoft,
    innerBorder: lines.inner,
    tableRowText: '#cbd5e1',
  };
}

export function erpLightCardPalette(mine: boolean, variant: ErpVariant = 'amber'): ErpCardPalette {
  const lightBgs: Record<string, { mine: string; other: string }> = {
    amber: { mine: '#ecfdf5', other: '#fffbeb' },
    emerald: { mine: '#ecfdf5', other: '#f0fdf4' },
    cyan: { mine: '#e0f2fe', other: '#f8fafc' },
    sky: { mine: '#e0f2fe', other: '#f0f9ff' },
    indigo: { mine: '#e0e7ff', other: '#f8fafc' },
    blue: { mine: '#dbeafe', other: '#eff6ff' },
    orange: { mine: '#ffedd5', other: '#fff7ed' },
    violet: { mine: '#f3e8ff', other: '#faf5ff' },
  };
  const lightBorders: Record<string, { mine: string; other: string }> = {
    amber: { mine: '#10b98155', other: '#f59e0b55' },
    emerald: { mine: '#10b98155', other: '#22c55e55' },
    cyan: { mine: '#0284c755', other: '#6366f155' },
    sky: { mine: '#0284c755', other: '#0ea5e955' },
    indigo: { mine: '#2563eb55', other: '#6366f155' },
    blue: { mine: '#2563eb55', other: '#3b82f655' },
    orange: { mine: '#ea580c55', other: '#f9731655' },
    violet: { mine: '#a855f755', other: '#c084fc55' },
  };
  const bg = lightBgs[variant] ?? lightBgs.amber;
  const border = lightBorders[variant] ?? lightBorders.amber;
  return {
    cardBg: mine ? bg.mine : bg.other,
    cardBorder: mine ? border.mine : border.other,
    text: '#0f172a',
    textMuted: '#64748b',
    label: '#94a3b8',
    accent: '#b45309',
    tableHeadBg: '#e2e8f0',
    tableHeadText: '#1e3a8a',
    tableBorder: '#a8b4c4',
    tableCellDivider: '#b8c4d488',
    innerBorder: '#9aa8b8',
    tableRowText: '#334155',
  };
}

export function getErpCardPalette(isDark: boolean, isMine: boolean, variant?: ErpVariant): ErpCardPalette {
  return isDark ? erpDarkCardPalette(isMine, variant) : erpLightCardPalette(isMine, variant);
}

/** ERP cards in chat always use the dark palette (parity with web messenger). */
export function getErpMessengerCardPalette(isMine: boolean, variant?: ErpVariant): ErpCardPalette {
  return erpDarkCardPalette(isMine, variant);
}

export function departmentStatusColors(department: string, isDark: boolean): { bg: string; border: string; text: string } {
  const value = department.toLowerCase();
  if (value.includes('đã duyệt') || value.includes('đã nhận') || value.includes('hoàn tất')) {
    return isDark
      ? { bg: '#10b98126', border: '#4f9a7888', text: '#6ee7b7' }
      : { bg: '#d1fae5', border: '#6ee7b7', text: '#047857' };
  }
  if (value.includes('qlnm')) {
    return isDark
      ? { bg: '#f59e0b26', border: '#a88b4088', text: '#fcd34d' }
      : { bg: '#fef3c7', border: '#fbbf24', text: '#b45309' };
  }
  if (value.includes('pkh')) {
    return isDark
      ? { bg: '#8b5cf626', border: '#7a6aaa88', text: '#c4b5fd' }
      : { bg: '#ede9fe', border: '#a78bfa', text: '#6d28d9' };
  }
  if (value.includes('ktk')) {
    return isDark
      ? { bg: '#06b6d426', border: '#4a8fa888', text: '#67e8f9' }
      : { bg: '#cffafe', border: '#22d3ee', text: '#0e7490' };
  }
  if (value.includes('thủ kho') || value.includes('qlvt')) {
    return isDark
      ? { bg: '#f9731626', border: '#b8785088', text: '#fdba74' }
      : { bg: '#ffedd5', border: '#fb923c', text: '#c2410c' };
  }
  return isDark
    ? { bg: '#f59e0b26', border: '#a88b4088', text: '#fcd34d' }
    : { bg: '#fef3c7', border: '#fbbf24', text: '#b45309' };
}

export function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

export function formatNumberVi(amount: number): string {
  return amount.toLocaleString('vi-VN');
}

/** Vertical divider between table columns — skip on last column */
export function erpTableColDivider(palette: ErpCardPalette, isLast = false) {
  return isLast
    ? {}
    : { borderRightWidth: 1 as const, borderRightColor: palette.tableCellDivider };
}
