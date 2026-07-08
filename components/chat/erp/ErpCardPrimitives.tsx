import type { ReactNode } from 'react';
import { View, Text, StyleSheet, type TextStyle } from 'react-native';
import type { ErpCardPalette } from '@/features/chat/erpCardTheme';

export function ErpTableCell({
  width,
  flex,
  palette,
  children,
  head = false,
  last = false,
  align = 'left',
  textStyle,
  nowrap = false,
}: {
  width?: number;
  flex?: number;
  palette: ErpCardPalette;
  children: ReactNode;
  head?: boolean;
  last?: boolean;
  align?: 'left' | 'center' | 'right';
  textStyle?: TextStyle;
  nowrap?: boolean;
}) {
  const sizing =
    flex != null
      ? { flex, minWidth: width ?? 0 }
      : width != null
        ? { width, minWidth: width, maxWidth: width, flexShrink: 0 }
        : { flex: 1, minWidth: 0 };

  return (
    <View
      style={{
        ...sizing,
        paddingHorizontal: nowrap ? 3 : 5,
        paddingVertical: 5,
        justifyContent: 'center',
        borderRightWidth: last ? 0 : 1,
        borderRightColor: palette.tableCellDivider,
      }}
    >
      <Text
        style={[
          {
            fontSize: head ? 9 : 10,
            fontWeight: head ? '700' : '400',
            textAlign: align,
            color: head ? palette.tableHeadText : palette.tableRowText,
          },
          textStyle,
        ]}
        numberOfLines={nowrap ? 1 : head ? 2 : 4}
        adjustsFontSizeToFit={nowrap}
        minimumFontScale={nowrap ? 0.7 : undefined}
      >
        {children}
      </Text>
    </View>
  );
}

export function ErpCardField({
  label,
  value,
  palette,
  valueBold,
  italic,
  valueColor,
  borderTop,
}: {
  label: string;
  value: string;
  palette: ErpCardPalette;
  valueBold?: boolean;
  italic?: boolean;
  valueColor?: string;
  borderTop?: boolean;
}) {
  if (!value || value === '—') return null;
  return (
    <View style={[styles.field, borderTop ? [styles.fieldBorderTop, { borderTopColor: palette.innerBorder }] : null]}>
      <Text style={[styles.fieldLabel, { color: palette.label }]}>{label}</Text>
      <Text
        style={[
          styles.fieldValue,
          { color: valueColor ?? palette.text },
          valueBold ? styles.bold : null,
          italic ? styles.italic : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export function ErpCardSectionLabel({ children, palette }: { children: string; palette: ErpCardPalette }) {
  return (
    <Text style={[styles.sectionLabel, { color: palette.label }]}>{children}</Text>
  );
}

export function ErpGrid2({
  left,
  right,
  palette,
}: {
  left: { label: string; value: string; accent?: string };
  right: { label: string; value: string; accent?: string };
  palette: ErpCardPalette;
}) {
  return (
    <View style={[styles.grid2, { borderColor: palette.tableBorder, backgroundColor: palette.tableHeadBg + '44' }]}>
      <View style={styles.gridHalf}>
        <ErpCardField label={left.label} value={left.value} palette={palette} valueColor={left.accent} valueBold />
      </View>
      <View style={styles.gridHalf}>
        <ErpCardField label={right.label} value={right.value} palette={palette} valueColor={right.accent} valueBold />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 8 },
  fieldBorderTop: {
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  fieldValue: { fontSize: 14, lineHeight: 20 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  grid2: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  gridHalf: { flex: 1, minWidth: 0 },
});
