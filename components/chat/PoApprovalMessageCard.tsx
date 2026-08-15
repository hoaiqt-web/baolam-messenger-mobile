import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  parsePoApprovalCardData,
  poRoleColor,
  poRoleLabelColor,
  type PoUiItem,
  type PoTimelineRow,
} from '@/features/chat/poApprovalParsers';
import { formatNumberVi, formatVnd, getErpMessengerCardPalette, type ErpCardPalette } from '@/features/chat/erpCardTheme';
import { ErpCardField, ErpTableCell } from '@/components/chat/erp/ErpCardPrimitives';
import type { ChatGeneratedTask } from '@/Models/chat/types';

type Props = {
  body: string;
  isMine: boolean;
  isDark: boolean;
  generatedTasks?: ChatGeneratedTask[];
};

/** Flex weights — tổng luôn = 100% khung card, không cần scroll ngang. */
const TIMELINE_FLEX = { role: 0.72, person: 2, time: 0.62, date: 0.66 } as const;
const ITEMS_FLEX = { stt: 0.4, mat: 1.9, need: 0.7, unit: 0.55, price: 0.9, total: 1.0, wbs: 1.1 } as const;

function poTaskState(tasks?: ChatGeneratedTask[]) {
  const poTask = (tasks ?? []).find((t) => t.source_module === 'erp_po_approval');
  if (!poTask) return { task: null, isDone: false, isRejected: false };
  return {
    task: poTask,
    isDone: poTask.status === 'DONE',
    isRejected: poTask.status === 'REJECTED',
  };
}

function PoTimelineTable({ rows, palette }: { rows: PoTimelineRow[]; palette: ErpCardPalette }) {
  return (
    <View style={[styles.table, { borderColor: palette.tableBorder, width: '100%' }]}>
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
        <ErpTableCell flex={TIMELINE_FLEX.role} palette={palette} head>
          VAI TRÒ
        </ErpTableCell>
        <ErpTableCell flex={TIMELINE_FLEX.person} palette={palette} head>
          NGƯỜI PT
        </ErpTableCell>
        <ErpTableCell flex={TIMELINE_FLEX.time} palette={palette} head align="center" nowrap>
          GIỜ
        </ErpTableCell>
        <ErpTableCell flex={TIMELINE_FLEX.date} palette={palette} head align="center" last nowrap>
          NGÀY
        </ErpTableCell>
      </View>
      {rows.map((row, index) => (
        <View
          key={`${row.role}-${row.person}-${index}`}
          style={[styles.tableRow, { borderTopWidth: 1, borderTopColor: palette.tableBorder }]}
        >
          <ErpTableCell
            flex={TIMELINE_FLEX.role}
            palette={palette}
            textStyle={{ color: poRoleLabelColor(row.role) }}
          >
            {row.role}
          </ErpTableCell>
          <ErpTableCell flex={TIMELINE_FLEX.person} palette={palette} textStyle={{ color: poRoleColor(row.role) }}>
            {row.person}
          </ErpTableCell>
          <ErpTableCell
            flex={TIMELINE_FLEX.time}
            palette={palette}
            align="center"
            nowrap
            textStyle={{ color: palette.textMuted }}
          >
            {row.time}
          </ErpTableCell>
          <ErpTableCell
            flex={TIMELINE_FLEX.date}
            palette={palette}
            align="center"
            last
            nowrap
            textStyle={{ color: palette.textMuted }}
          >
            {row.date}
          </ErpTableCell>
        </View>
      ))}
    </View>
  );
}

function PoStatusBadge({ item }: { item: PoUiItem }) {
  const status = item.status_text || 'Trong KH';
  if (status === 'Phát sinh') {
    return (
      <View style={styles.badgeRose}>
        <Text style={styles.badgeRoseText}>⚠️ Phát sinh</Text>
        {item.wbs_requester ? <Text style={styles.badgeSub}>Yêu cầu: {item.wbs_requester}</Text> : null}
        {item.wbs_reason ? <Text style={styles.badgeReason}>{item.wbs_reason}</Text> : null}
      </View>
    );
  }
  if (status === 'Vượt KH') {
    return (
      <View style={styles.badgeAmber}>
        <Text style={styles.badgeAmberText}>⚠️ Vượt KH</Text>
        {item.wbs_requester ? <Text style={styles.badgeSubAmber}>Yêu cầu: {item.wbs_requester}</Text> : null}
        {item.wbs_reason ? <Text style={styles.badgeReason}>{item.wbs_reason}</Text> : null}
      </View>
    );
  }
  return (
    <View style={styles.badgeOk}>
      <Text style={styles.badgeOkText}>✓ Trong KH</Text>
    </View>
  );
}

function PoItemsTable({
  items,
  showWbsColumn,
  palette,
}: {
  items: PoUiItem[];
  showWbsColumn: boolean;
  palette: ErpCardPalette;
}) {
  const grandTotal = items.reduce((acc, item) => acc + (item.total_price || 0), 0);

  return (
    <View style={[styles.table, { borderColor: palette.tableBorder, width: '100%' }]}>
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
        <ErpTableCell flex={ITEMS_FLEX.stt} palette={palette} head align="center">
          STT
        </ErpTableCell>
        <ErpTableCell flex={ITEMS_FLEX.mat} palette={palette} head>
          VẬT TƯ
        </ErpTableCell>
        <ErpTableCell flex={ITEMS_FLEX.need} palette={palette} head align="right" nowrap>
          CẦN
        </ErpTableCell>
        <ErpTableCell flex={ITEMS_FLEX.unit} palette={palette} head align="center" nowrap>
          ĐVT
        </ErpTableCell>
        <ErpTableCell flex={ITEMS_FLEX.price} palette={palette} head align="right" nowrap>
          Đ.GIÁ
        </ErpTableCell>
        <ErpTableCell
          flex={ITEMS_FLEX.total}
          palette={palette}
          head
          align="right"
          nowrap
          last={!showWbsColumn}
        >
          T.TIỀN
        </ErpTableCell>
        {showWbsColumn ? (
          <ErpTableCell flex={ITEMS_FLEX.wbs} palette={palette} head last>
            WBS
          </ErpTableCell>
        ) : null}
      </View>
      {items.map((item) => (
        <View
          key={item.stt}
          style={[styles.tableRow, { borderTopWidth: 1, borderTopColor: palette.tableBorder }]}
        >
          <ErpTableCell flex={ITEMS_FLEX.stt} palette={palette} align="center">
            {item.stt}
          </ErpTableCell>
          <ErpTableCell flex={ITEMS_FLEX.mat} palette={palette}>
            {item.material_name}
          </ErpTableCell>
          <ErpTableCell
            flex={ITEMS_FLEX.need}
            palette={palette}
            align="right"
            nowrap
            textStyle={{ fontVariant: ['tabular-nums'], color: palette.text }}
          >
            {formatNumberVi(item.quantity)}
          </ErpTableCell>
          <ErpTableCell
            flex={ITEMS_FLEX.unit}
            palette={palette}
            align="center"
            nowrap
            textStyle={{ color: palette.text }}
          >
            {(item.unit || '').trim() || '—'}
          </ErpTableCell>
          <ErpTableCell
            flex={ITEMS_FLEX.price}
            palette={palette}
            align="right"
            nowrap
            textStyle={{ fontVariant: ['tabular-nums'] }}
          >
            {formatNumberVi(item.unit_price)}
          </ErpTableCell>
          <ErpTableCell
            flex={ITEMS_FLEX.total}
            palette={palette}
            align="right"
            nowrap
            last={!showWbsColumn}
            textStyle={{ fontVariant: ['tabular-nums'], fontWeight: '700', color: palette.text }}
          >
            {formatNumberVi(item.total_price)}
          </ErpTableCell>
          {showWbsColumn ? (
            <View style={[styles.wbsCell, { flex: ITEMS_FLEX.wbs, borderRightWidth: 0 }]}>
              <PoStatusBadge item={item} />
            </View>
          ) : null}
        </View>
      ))}
      <View style={[styles.tableFoot, { backgroundColor: '#0d2040', borderTopColor: palette.tableBorder }]}>
        <View style={{ flex: ITEMS_FLEX.stt }} />
        <View style={{ flex: ITEMS_FLEX.mat }} />
        <View style={{ flex: ITEMS_FLEX.need }} />
        <View style={{ flex: ITEMS_FLEX.unit }} />
        <View style={[styles.tableFootLabelCol, { flex: ITEMS_FLEX.price }]}>
          <Text style={[styles.footLabel, { color: '#fbbf24' }]}>Tổng cộng</Text>
        </View>
        <View style={{ flex: ITEMS_FLEX.total, paddingRight: 3 }}>
          <Text
            style={[styles.footValue, { color: '#fbbf24', textAlign: 'right' }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {formatNumberVi(grandTotal)} đ
          </Text>
        </View>
        {showWbsColumn ? <View style={{ flex: ITEMS_FLEX.wbs }} /> : null}
      </View>
    </View>
  );
}

export function PoApprovalMessageCard({ body, isMine, isDark, generatedTasks }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const data = parsePoApprovalCardData(body);
  const variant = data.isVehicle ? 'blue' : 'emerald';
  const palette = getErpMessengerCardPalette(isMine, variant);
  const { isDone, isRejected } = poTaskState(generatedTasks);

  if (data.mode === 'rich' && data.meta) {
    const { meta } = data;
    const itemsDesc = ('itemsDesc' in data ? data.itemsDesc : (meta.items_desc || '')).trim();
    const supplierNote = ('supplierNote' in data ? data.supplierNote : (meta.notes || '')).trim();
    return (
      <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
        <View style={[styles.cardHeader, { borderBottomWidth: 1, borderBottomColor: palette.tableBorder }]}>
          <Text style={styles.headerEmoji}>{data.isVehicle ? '🚚' : '🏛️'}</Text>
          <View style={styles.headerTextWrap}>
            <View style={styles.headerTitleRow}>
              <Text style={[styles.headerTitle, { color: palette.text, flex: 1 }]}>{data.headerTitle}</Text>
              {isDone ? (
                <View style={styles.approvedBadge}>
                  <Text style={styles.approvedBadgeText}>ĐÃ DUYỆT</Text>
                </View>
              ) : null}
              {isRejected ? (
                <View style={styles.rejectedBadge}>
                  <Text style={styles.rejectedBadgeText}>TỪ CHỐI</Text>
                </View>
              ) : null}
            </View>
            {data.projectLabel ? (
              <Text style={[styles.headerSub, { color: palette.textMuted }]}>{data.projectLabel}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.cardBody}>
          {meta.timeline && meta.timeline.length > 0 ? (
            <PoTimelineTable rows={meta.timeline} palette={palette} />
          ) : null}

          {meta.tpkh_note ? (
            <View style={[styles.noteEmerald, { borderColor: palette.innerBorder }]}>
              <Text style={styles.noteEmeraldTitle}>📝 Ghi chú PKH:</Text>
              <Text style={styles.noteEmeraldBody}>{meta.tpkh_note}</Text>
            </View>
          ) : null}

          {data.isVehicle && itemsDesc ? (
            <View style={[styles.noteBlue, { borderColor: palette.innerBorder }]}>
              <Text style={styles.noteBlueTitle}>📦 Hành lý / Đồ gửi chi tiết:</Text>
              <Text style={styles.noteBlueBody}>{itemsDesc}</Text>
            </View>
          ) : null}

          {data.isVehicle && supplierNote ? (
            <View style={[styles.noteBlue, { borderColor: palette.innerBorder }]}>
              <Text style={styles.noteBlueTitle}>📝 Ghi chú thêm (NCC):</Text>
              <Text style={styles.noteBlueBody}>{supplierNote}</Text>
            </View>
          ) : null}

          {meta.items && meta.items.length > 0 ? (
            <View>
              <TouchableOpacity
                style={[styles.collapseBtn, { borderColor: palette.innerBorder, backgroundColor: palette.tableHeadBg }]}
                onPress={() => setDetailsOpen((o) => !o)}
              >
                <Text style={[styles.collapseTitle, { color: palette.text }]}>📦 Chi tiết vật tư</Text>
                <View style={styles.collapseRight}>
                  <Text style={styles.collapseCount}>{formatVnd(meta.total_vnd || 0)}</Text>
                  <Ionicons name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={palette.textMuted} />
                </View>
              </TouchableOpacity>
              {detailsOpen ? (
                <View style={{ marginTop: 8 }}>
                  <PoItemsTable items={meta.items} showWbsColumn={data.showWbsColumn} palette={palette} />
                </View>
              ) : null}
            </View>
          ) : null}

          {isDone ? (
            <View style={styles.approvedNoteRow}>
              <View style={styles.approvedDot} />
              <Text style={styles.approvedNoteText}>
                {data.isVehicle ? 'Chi phí đã được phê duyệt.' : 'Đơn hàng đã được phê duyệt.'}
              </Text>
            </View>
          ) : isRejected ? (
            <View style={styles.approvedNoteRow}>
              <View style={[styles.approvedDot, { backgroundColor: '#ef4444' }]} />
              <Text style={styles.approvedNoteText}>Yêu cầu đã bị từ chối.</Text>
            </View>
          ) : (
            <Text
              style={[
                styles.footerHint,
                { color: palette.textMuted, borderTopWidth: 1, borderTopColor: palette.tableBorder },
              ]}
            >
              👉 CEO/CFO vui lòng Duyệt hoặc Từ chối trong tab Nhiệm vụ.
            </Text>
          )}
        </View>
      </View>
    );
  }

  if (data.mode === 'legacy') {
    return (
      <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder, padding: 12 }]}>
        <Text style={[styles.legacyTitle, { color: '#6ee7b7' }]}>{data.cardTitle}</Text>
        {data.proposer ? <ErpCardField label="Người đề xuất" value={data.proposer} palette={palette} /> : null}
        <ErpCardField label="Người gửi" value={data.sender || '—'} palette={palette} />
        {data.project ? <ErpCardField label="Dự án" value={data.project} palette={palette} /> : null}
        {data.supplier ? <ErpCardField label="NCC" value={data.supplier} palette={palette} /> : null}
        {data.value ? (
          <ErpCardField label="Giá trị" value={data.value} palette={palette} valueBold valueColor="#6ee7b7" />
        ) : null}
        {data.noteLines.map((note, i) => (
          <Text key={i} style={[styles.legacyNote, { color: palette.textMuted }]}>
            {note}
          </Text>
        ))}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, maxWidth: '100%', width: '100%', minWidth: 260, alignSelf: 'stretch' },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  headerEmoji: { fontSize: 18 },
  headerTextWrap: { flex: 1, minWidth: 0 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  headerTitle: { fontSize: 14, fontWeight: '800', lineHeight: 20 },
  headerSub: { fontSize: 12, marginTop: 4 },
  approvedBadge: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2d6b52',
    backgroundColor: '#0f2e22',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  approvedBadgeText: { fontSize: 10, fontWeight: '800', color: '#6ee7b7' },
  rejectedBadge: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ef444466',
    backgroundColor: '#ef444422',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rejectedBadgeText: { fontSize: 10, fontWeight: '800', color: '#f87171' },
  cardBody: { padding: 12, gap: 10, width: '100%' },
  noteEmerald: {
    backgroundColor: '#064e3b33',
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
  },
  noteEmeraldTitle: { color: '#34d399', fontSize: 12, fontWeight: '700' },
  noteEmeraldBody: { color: '#d1fae5', fontSize: 12, marginTop: 4, lineHeight: 18 },
  noteBlue: {
    backgroundColor: '#17255455',
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
  },
  noteBlueTitle: { color: '#60a5fa', fontSize: 12, fontWeight: '700' },
  noteBlueBody: { color: '#dbeafe', fontSize: 12, marginTop: 4, lineHeight: 18 },
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
  collapseCount: { color: '#fbbf24', fontSize: 12, fontWeight: '700' },
  approvedNoteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingTop: 4 },
  approvedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981', marginTop: 5 },
  approvedNoteText: { flex: 1, fontSize: 12, lineHeight: 17, color: '#c5d0dc' },
  footerHint: { fontSize: 11, fontStyle: 'italic', paddingTop: 8 },
  legacyTitle: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
  legacyNote: { fontSize: 12, fontStyle: 'italic', marginTop: 4 },
  table: { borderWidth: 1, borderRadius: 8, overflow: 'hidden', alignSelf: 'stretch' },
  tableHead: { flexDirection: 'row', width: '100%' },
  tableRow: { flexDirection: 'row', alignItems: 'stretch', width: '100%' },
  tableFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 3,
    borderTopWidth: 1,
    width: '100%',
  },
  wbsCell: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    justifyContent: 'center',
    borderRightWidth: 1,
  },
  tableFootLabelCol: { justifyContent: 'center', alignItems: 'flex-end', paddingRight: 2 },
  footLabel: { fontSize: 10, fontWeight: '700', flexShrink: 0 },
  footValue: { fontSize: 10, fontWeight: '700' },
  badgeRose: { backgroundColor: '#88133755', borderRadius: 4, borderWidth: 1, borderColor: '#9f123955', padding: 4 },
  badgeRoseText: { color: '#fb7185', fontSize: 10, fontWeight: '600' },
  badgeAmber: { backgroundColor: '#78350f55', borderRadius: 4, borderWidth: 1, borderColor: '#92400e55', padding: 4 },
  badgeAmberText: { color: '#fbbf24', fontSize: 10, fontWeight: '600' },
  badgeOk: { backgroundColor: '#064e3b55', borderRadius: 4, borderWidth: 1, borderColor: '#065f4655', padding: 4, alignSelf: 'flex-start' },
  badgeOkText: { color: '#34d399', fontSize: 10, fontWeight: '600' },
  badgeSub: { color: '#fda4af', fontSize: 9, fontWeight: '700', marginTop: 2 },
  badgeSubAmber: { color: '#fcd34d', fontSize: 9, fontWeight: '700', marginTop: 2 },
  badgeReason: { color: '#cbd5e1', fontSize: 9, fontStyle: 'italic', marginTop: 2 },
});
