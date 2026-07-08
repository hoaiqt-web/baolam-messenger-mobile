import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Linking,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import {
  isPycvtBatchMessage,
  parsePycvtCardData,
  pycvtRoleLabelColor,
  pycvtRolePersonColor,
  titleAccentColor,
  type PycvtMaterialMeta,
  type PycvtTimelineEntry,
} from '@/features/chat/pycvtParsers';
import {
  departmentStatusColors,
  erpTableColDivider,
  getErpMessengerCardPalette,
  type ErpCardPalette,
} from '@/features/chat/erpCardTheme';
import { ErpCardField } from '@/components/chat/erp/ErpCardPrimitives';

type Props = {
  body: string;
  isMine: boolean;
  isDark: boolean;
  onImagePress?: (attachment: any, url: string) => void;
};

function TimelineTable({ rows, palette }: { rows: PycvtTimelineEntry[]; palette: ErpCardPalette }) {
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      style={styles.tableScroll}
      contentContainerStyle={styles.tableScrollContent}
    >
      <View style={[styles.table, { borderColor: palette.tableBorder }]}>
        <View
          style={[
            styles.tableHead,
            {
              backgroundColor: palette.tableHeadBg,
              borderBottomWidth: 1,
              borderBottomColor: palette.tableBorder,
            },
          ]}
        >
          <Text style={[styles.th, styles.colRole, { color: palette.tableHeadText }, erpTableColDivider(palette)]}>
            VAI TRÒ
          </Text>
          <Text style={[styles.th, styles.colPerson, { color: palette.tableHeadText }, erpTableColDivider(palette)]}>
            NGƯỜI PT
          </Text>
          <Text style={[styles.th, styles.colTime, { color: palette.tableHeadText }, erpTableColDivider(palette)]}>
            GIỜ
          </Text>
          <Text style={[styles.th, styles.colDate, { color: palette.tableHeadText }]}>NGÀY</Text>
        </View>
        {rows.map((row, index) => (
          <View
            key={`${row.role}-${index}`}
            style={[styles.tableRow, { borderTopWidth: 1, borderTopColor: palette.tableBorder }]}
          >
            <Text
              style={[
                styles.td,
                styles.colRole,
                { color: pycvtRoleLabelColor(row.role || '') },
                erpTableColDivider(palette),
              ]}
            >
              {row.role || '—'}
            </Text>
            <Text
              style={[
                styles.td,
                styles.colPerson,
                { color: pycvtRolePersonColor(row.role || '') },
                erpTableColDivider(palette),
              ]}
            >
              {row.person || '—'}
            </Text>
            <Text
              style={[
                styles.td,
                styles.colTime,
                { color: palette.textMuted },
                erpTableColDivider(palette),
              ]}
            >
              {row.time || '—'}
            </Text>
            <Text style={[styles.td, styles.colDate, { color: palette.textMuted }]}>{row.date || '—'}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function MaterialsTable({ items, palette }: { items: PycvtMaterialMeta[]; palette: ErpCardPalette }) {
  let rootStt = 0;

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      style={styles.tableScroll}
      contentContainerStyle={styles.tableScrollContent}
    >
      <View style={[styles.table, { borderColor: palette.tableBorder }]}>
        <View
          style={[
            styles.tableHead,
            {
              backgroundColor: palette.tableHeadBg,
              borderBottomWidth: 1,
              borderBottomColor: palette.tableBorder,
            },
          ]}
        >
          <Text style={[styles.th, styles.colStt, { color: palette.tableHeadText }, erpTableColDivider(palette)]}>
            STT
          </Text>
          <Text style={[styles.th, styles.colMat, { color: palette.tableHeadText }, erpTableColDivider(palette)]}>
            VẬT TƯ
          </Text>
          <Text style={[styles.th, styles.colQty, { color: palette.tableHeadText }, erpTableColDivider(palette)]}>
            SL
          </Text>
          <Text style={[styles.th, styles.colStatus, { color: palette.tableHeadText }]}>TT</Text>
        </View>
        {items.map((item, index) => {
          const isRoot = item.kind !== 'branch';
          const stt = isRoot ? (item.stt ?? ++rootStt) : null;

          return (
            <View
              key={`${item.kind ?? 'root'}-${item.material_name}-${index}`}
              style={[styles.tableRow, { borderTopWidth: 1, borderTopColor: palette.tableBorder }]}
            >
              <Text
                style={[styles.td, styles.colStt, { color: palette.tableRowText }, erpTableColDivider(palette)]}
              >
                {stt ?? ''}
              </Text>
              <Text
                style={[
                  styles.td,
                  styles.colMat,
                  { color: palette.tableRowText },
                  item.kind === 'branch' ? { paddingLeft: 12 } : null,
                  erpTableColDivider(palette),
                ]}
              >
                {item.branch_prefix ? `${item.branch_prefix} ` : ''}
                {item.branch_label ? `${item.branch_label}: ` : ''}
                {item.material_name}
              </Text>
              <Text
                style={[styles.td, styles.colQty, { color: palette.tableRowText }, erpTableColDivider(palette)]}
              >
                {item.quantity_label}
              </Text>
              <Text style={[styles.td, styles.colStatus, { color: '#fcd34d' }]}>{item.status}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function DeliveryPhotoGrid({
  photos,
  palette,
  onImagePress,
}: {
  photos: Array<{ url?: string; material_name?: string; slip_code?: string; original_name?: string; at?: string; uploaded_by?: string }>;
  palette: ErpCardPalette;
  onImagePress?: (attachment: any, url: string) => void;
}) {
  return (
    <View style={styles.photoGrid}>
      {photos.map((photo, index) => {
        const label =
          photo.material_name || photo.slip_code || photo.original_name || `Ảnh ${index + 1}`;
        const metaLine = [photo.at, photo.uploaded_by].filter(Boolean).join(' - ');
        return (
          <TouchableOpacity
            key={`${photo.url}-${index}`}
            style={[styles.photoCell, { borderColor: palette.tableBorder }]}
            activeOpacity={0.85}
            onPress={() => photo.url && onImagePress?.(null, photo.url)}
          >
            {photo.url ? (
              <Image source={{ uri: photo.url }} style={styles.photoImg} contentFit="cover" cachePolicy="memory-disk" />
            ) : (
              <View style={styles.photoFallback}>
                <Text style={{ fontSize: 24 }}>📷</Text>
              </View>
            )}
            <View style={[styles.photoCaption, { borderTopColor: palette.tableBorder }]}>
              <Text style={[styles.photoLabel, { color: palette.text }]} numberOfLines={1}>
                {label}
              </Text>
              {metaLine ? (
                <Text style={[styles.photoMeta, { color: palette.textMuted }]} numberOfLines={1}>
                  {metaLine}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function PycvtBatchCard({ body, isMine, isDark, onImagePress }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const palette = getErpMessengerCardPalette(isMine, 'amber');
  const data = parsePycvtCardData(body);
  const statusColors = departmentStatusColors(data.department, true);

  return (
    <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
      <View style={[styles.cardHeader, { borderBottomWidth: 1, borderBottomColor: palette.tableBorder }]}>
        <Text style={styles.headerEmoji}>📋</Text>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.headerTitle, { color: '#fcd34d' }]}>{data.headerTitle}</Text>
          {data.projectLabel ? (
            <Text style={[styles.headerSub, { color: palette.textMuted }]}>{data.projectLabel}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.cardBody}>
        {data.department ? (
          <View style={[styles.statusBox, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
            <Text style={[styles.statusLabel, { color: statusColors.text }]}>TRẠNG THÁI PHIẾU</Text>
            <Text style={[styles.statusValue, { color: statusColors.text }]}>{data.department}</Text>
            {data.statusNote ? (
              <Text style={[styles.statusNote, { color: statusColors.text }]}>{data.statusNote}</Text>
            ) : null}
          </View>
        ) : null}

        {data.timelineRows.length > 0 ? <TimelineTable rows={data.timelineRows} palette={palette} /> : null}

        {data.note ? (
          <View style={[styles.noteBox, { borderColor: palette.innerBorder }]}>
            <Text style={styles.noteTitle}>💬 Ghi chú:</Text>
            <Text style={[styles.noteBody, { color: palette.text }]}>{data.note}</Text>
          </View>
        ) : null}

        {data.materials.length > 0 ? (
          <View>
            <TouchableOpacity
              style={[styles.collapseBtn, { borderColor: palette.tableBorder, backgroundColor: palette.tableHeadBg }]}
              onPress={() => setDetailsOpen((o) => !o)}
              activeOpacity={0.8}
            >
              <Text style={[styles.collapseTitle, { color: palette.text }]}>📦 Chi tiết vật tư</Text>
              <View style={styles.collapseRight}>
                <Text style={styles.collapseCount}>{data.materialCountLabel} vật tư</Text>
                <Ionicons name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={palette.textMuted} />
              </View>
            </TouchableOpacity>
            {detailsOpen ? (
              <View style={{ marginTop: 8 }}>
                <MaterialsTable items={data.materials} palette={palette} />
              </View>
            ) : null}
          </View>
        ) : null}

        {data.deliveryPhotos.length > 0 ? (
          <View>
            <Text style={[styles.sectionTitle, { color: palette.textMuted }]}>
              ẢNH GIAO HÀNG ({data.deliveryPhotos.length})
            </Text>
            <DeliveryPhotoGrid photos={data.deliveryPhotos} palette={palette} onImagePress={onImagePress} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function PycvtLegacyCard({ body, isMine, isDark }: Props) {
  const palette = getErpMessengerCardPalette(isMine, 'amber');
  const data = parsePycvtCardData(body);
  const statusColors = departmentStatusColors(data.department, true);
  const titleColor = titleAccentColor(data.cardTitle);

  return (
    <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder, padding: 12 }]}>
      <View style={[styles.legacyHeader, { borderBottomWidth: 1, borderBottomColor: palette.tableBorder }]}>
        <Text style={styles.headerEmoji}>{data.headerIcon}</Text>
        <Text style={[styles.legacyTitle, { color: titleColor }]}>{data.cardTitle}</Text>
      </View>

      {(data.department || data.statusNote) ? (
        <View style={[styles.statusBox, { backgroundColor: statusColors.bg, borderColor: statusColors.border, marginTop: 10 }]}>
          <Text style={[styles.statusLabel, { color: statusColors.text }]}>TRẠNG THÁI PHIẾU</Text>
          {data.department ? (
            <Text style={[styles.statusValue, { color: statusColors.text }]}>{data.department}</Text>
          ) : null}
          {data.statusNote ? (
            <Text style={[styles.statusNote, { color: statusColors.text }]}>{data.statusNote}</Text>
          ) : null}
        </View>
      ) : null}

      {data.requestCode ? (
        <ErpCardField label="Mã phiếu" value={data.requestCode} palette={palette} valueColor="#fcd34d" />
      ) : null}
      <ErpCardField label="Người gửi" value={data.sender || '—'} palette={palette} />
      {data.workDate ? <ErpCardField label="Ngày làm việc" value={data.workDate} palette={palette} /> : null}
      {data.projectLabel ? <ErpCardField label="Dự án" value={data.projectLabel} palette={palette} /> : null}
      {data.supplier ? <ErpCardField label="NCC" value={data.supplier} palette={palette} /> : null}

      {data.materialLines.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          <Text style={[styles.sectionTitle, { color: palette.label }]}>CHI TIẾT VẬT TƯ</Text>
          {data.materialLines.map((item, index) => (
            <Text key={index} style={[styles.materialLine, { color: palette.tableRowText }]}>
              {item.kind === 'branch' ? `${item.prefix} ${item.label}` : `• ${item.label}`}
              {item.quantity ? ` — ${item.quantity}` : ''}
              {item.status ? `  ${item.status}` : ''}
            </Text>
          ))}
        </View>
      ) : null}

      {data.note ? <ErpCardField label="Ghi chú" value={data.note} palette={palette} italic borderTop /> : null}
    </View>
  );
}

export function PycvtMessageCard({ body, isMine, isDark, onImagePress }: Props) {
  if (isPycvtBatchMessage(body)) {
    return <PycvtBatchCard body={body} isMine={isMine} isDark={isDark} onImagePress={onImagePress} />;
  }
  return <PycvtLegacyCard body={body} isMine={isMine} isDark={isDark} onImagePress={onImagePress} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    maxWidth: '100%',
    minWidth: 260,
    alignSelf: 'stretch',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerEmoji: { fontSize: 18 },
  headerTextWrap: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 14, fontWeight: '800', lineHeight: 20 },
  headerSub: { fontSize: 12, marginTop: 4 },
  cardBody: { padding: 12, gap: 10 },
  statusBox: { borderRadius: 8, borderWidth: 1, padding: 10 },
  statusLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  statusValue: { fontSize: 14, fontWeight: '800', marginTop: 4, textTransform: 'uppercase' },
  statusNote: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  noteBox: {
    backgroundColor: '#78350f33',
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
  },
  noteTitle: { color: '#fbbf24', fontSize: 12, fontWeight: '700' },
  noteBody: { fontSize: 12, marginTop: 4, lineHeight: 18 },
  collapseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  collapseTitle: { fontSize: 13, fontWeight: '700', flex: 1 },
  collapseRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  collapseCount: { color: '#fbbf24', fontSize: 13, fontWeight: '700' },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, marginBottom: 6 },
  tableScroll: { flexGrow: 0, flexShrink: 1, maxWidth: '100%' },
  tableScrollContent: { flexGrow: 0 },
  table: { borderWidth: 1, borderRadius: 8, overflow: 'hidden', minWidth: 280 },
  tableHead: { flexDirection: 'row', paddingVertical: 6 },
  tableRow: { flexDirection: 'row', paddingVertical: 6 },
  th: { fontSize: 10, fontWeight: '700', paddingHorizontal: 6 },
  td: { fontSize: 11, paddingHorizontal: 6 },
  colRole: { width: 72 },
  colPerson: { width: 100 },
  colTime: { width: 44, textAlign: 'center' },
  colDate: { width: 52, textAlign: 'center' },
  colStt: { width: 36, textAlign: 'center' },
  colMat: { width: 120 },
  colQty: { width: 56, textAlign: 'right' },
  colStatus: { width: 80 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoCell: {
    width: '47%',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#00000022',
  },
  photoImg: { width: '100%', aspectRatio: 4 / 3 },
  photoFallback: { aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e293b' },
  photoCaption: { padding: 6, borderTopWidth: 1 },
  photoLabel: { fontSize: 10, fontWeight: '600' },
  photoMeta: { fontSize: 9, marginTop: 2 },
  legacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  legacyTitle: { fontSize: 14, fontWeight: '800', flex: 1 },
  materialLine: { fontSize: 13, lineHeight: 20, marginBottom: 4 },
});
