import { View, Text, StyleSheet } from 'react-native';

import { parseTvvtPriceMeta } from '@/features/chat/tvvtPriceUpdateParsers';
import { getErpMessengerCardPalette } from '@/features/chat/erpCardTheme';

type Props = {
  body: string;
  isMine: boolean;
};

function formatVnd(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value.toLocaleString('vi-VN')}đ`;
}

export function TvvtPriceUpdateMessageCard({ body, isMine }: Props) {
  const meta = parseTvvtPriceMeta(body);
  const palette = getErpMessengerCardPalette(isMine, 'amber');
  const updated = meta?.updated ?? [];
  let skipped = (meta?.skipped ?? []).filter(
    (row) => (row.message || row.line || '').trim() !== '',
  );
  const error = (meta?.error || '').trim();
  if (updated.length === 0 && skipped.length === 0 && error) {
    skipped = [{ material_name: 'PO', message: error }];
  }
  const title = meta?.po_code
    ? `Cập nhật đơn giá TVVT — ${meta.po_code}`
    : 'Cập nhật đơn giá TVVT';

  return (
    <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
      <Text style={[styles.title, { color: '#fbbf24' }]}>💰 {title}</Text>
      <Text style={[styles.hint, { color: palette.textMuted }]}>
        Đơn giá thư viện vật tư theo giá PO vừa duyệt.
      </Text>

      {updated.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.updatedHead}>✅ Đã cập nhật</Text>
          {updated.map((row, idx) => (
            <Text key={`u-${idx}`} style={[styles.line, { color: palette.text }]}>
              {row.material_name || 'Vật tư'}
              {row.unit ? ` (${row.unit})` : ''}: {formatVnd(row.old_price)} → {formatVnd(row.new_price)}
            </Text>
          ))}
        </View>
      ) : null}

      {skipped.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.skippedHead}>⚠️ Không cập nhật</Text>
          {skipped.map((row, idx) => (
            <Text key={`s-${idx}`} style={[styles.line, { color: palette.text }]}>
              {row.material_name || 'Vật tư'}: {row.message || row.line || 'Không đổi giá'}
            </Text>
          ))}
        </View>
      ) : null}

      {updated.length === 0 && skipped.length === 0 ? (
        <Text style={[styles.line, { color: '#fca5a5' }]}>
          ⚠️ {meta?.error || 'Không ghi được dòng nào vào TVVT — không đọc được vật tư trên PO hoặc không khớp TVVT.'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
    width: '100%',
    alignSelf: 'stretch',
  },
  title: { fontSize: 14, fontWeight: '800', lineHeight: 20 },
  hint: { fontSize: 11, lineHeight: 16 },
  block: { gap: 4 },
  updatedHead: { fontSize: 11, fontWeight: '800', color: '#34d399' },
  skippedHead: { fontSize: 11, fontWeight: '800', color: '#f87171' },
  line: { fontSize: 13, lineHeight: 19 },
});
