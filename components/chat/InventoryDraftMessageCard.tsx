import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import type { ChatAttachment } from '@/Models/chat/types';
import { getErpMessengerCardPalette } from '@/features/chat/erpCardTheme';

const META_START = '[[INVENTORY_DRAFT_META]]';
const META_END = '[[/INVENTORY_DRAFT_META]]';
const MESSAGE_MARKER = 'GHI CHÉP KIỂM KÊ';

export interface InventoryDraftMaterialLine {
  stt?: number;
  id?: number;
  material_name?: string;
  quantity_label?: string;
  location?: string;
  status?: string;
  status_label?: string;
  review_notes?: string;
  ral_code?: number | null;
}

export interface InventoryDraftSessionPhoto {
  object_key?: string;
  url?: string;
  original_name?: string;
  at?: string;
  caption?: string;
}

export interface InventoryDraftMeta {
  source_module?: string;
  session_id?: string;
  session_name?: string;
  short_session?: string;
  portal?: string;
  portal_label?: string;
  recorded_by?: string;
  header_title?: string;
  aggregate_status?: string;
  status_code?: string;
  item_count?: number;
  materials?: InventoryDraftMaterialLine[];
  timeline?: Array<{
    at?: string;
    event?: string;
    detail?: string;
    role?: string;
    person?: string;
  }>;
  session_photos?: InventoryDraftSessionPhoto[];
}

export function parseInventoryDraftMeta(body: string | null | undefined): InventoryDraftMeta | null {
  const text = String(body ?? '');
  const start = text.indexOf(META_START);
  const end = text.indexOf(META_END, start);
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(text.slice(start + META_START.length, end)) as InventoryDraftMeta;
  } catch {
    return null;
  }
}

export function stripInventoryDraftMeta(body: string): string {
  const start = body.indexOf(META_START);
  if (start < 0) return body;
  const end = body.indexOf(META_END, start);
  if (end < 0) return body.slice(0, start).trimEnd();
  return (body.slice(0, start) + body.slice(end + META_END.length)).trimEnd();
}

const MATERIAL_LINE_RE =
  /^\s*(\d+)\.\s*([✅↩️❌📝⏳])\s*\*\*(.+?)\*\*\s*—\s*SL:\s*(.+?)(?:\s*—\s*VT:\s*(.+?))?(?:\s*—\s*\*Lý do:\s*(.+?)\*)?\s*$/;

function mapLegacyStatusCode(statusEmoji: string): string {
  if (statusEmoji === '✅') return 'APPROVED';
  if (statusEmoji === '↩️') return 'RETURNED';
  if (statusEmoji === '❌') return 'REJECTED';
  if (statusEmoji === '📝') return 'DRAFT';
  return 'SUBMITTED';
}

export function parseLegacyInventoryDraftDetails(body: string): Partial<InventoryDraftMeta> {
  const text = stripInventoryDraftMeta(body);
  if (!text.includes(MESSAGE_MARKER)) {
    return {};
  }

  const meta: Partial<InventoryDraftMeta> = {};
  const statusMatch = text.match(/📍\s*\*\*Trạng thái:\*\*\s*(.+)/);
  if (statusMatch) {
    meta.aggregate_status = statusMatch[1].trim();
    const agg = meta.aggregate_status.toLowerCase();
    if (agg.includes('đã duyệt')) meta.status_code = 'APPROVED';
    else if (agg.includes('trả lại toàn phiên')) meta.status_code = 'REJECTED';
    else if (agg.includes('một phần bị trả lại')) meta.status_code = 'PARTIAL_RETURNED';
    else if (agg.includes('trả lại')) meta.status_code = 'RETURNED';
    else if (agg.includes('chờ ktk')) meta.status_code = 'SUBMITTED';
  }

  const actorMatch = text.match(/👤\s*\*\*Người ghi:\*\*\s*(.+?)(?:\s*\(([^)]+)\))?\s*$/m);
  if (actorMatch) {
    meta.recorded_by = actorMatch[1].trim();
    if (actorMatch[2]) {
      meta.portal_label = actorMatch[2].trim();
    }
  }

  const sessionMatch = text.match(/📋\s*\*\*Phiên:\*\*\s*(.+?)(?:\s*\(`([^`]+)`\))?/);
  if (sessionMatch) {
    meta.session_name = sessionMatch[1].replace(/\s*`[^`]+`$/, '').trim();
    if (sessionMatch[2]) {
      meta.short_session = sessionMatch[2].trim();
    }
  }

  const materials: InventoryDraftMaterialLine[] = [];
  for (const line of text.split('\n')) {
    const match = line.match(MATERIAL_LINE_RE);
    if (!match) continue;
    const reviewNotes = (match[6] ?? '').trim();
    const statusEmoji = match[2];
    materials.push({
      stt: Number(match[1]),
      material_name: match[3].trim(),
      quantity_label: match[4].trim(),
      location: (match[5] ?? '').trim(),
      status: mapLegacyStatusCode(statusEmoji),
      status_label: statusEmoji,
      review_notes: reviewNotes,
    });
  }
  if (materials.length > 0) {
    meta.materials = materials;
    meta.item_count = materials.length;
  }

  const timeline: any[] = [];
  const timelineStart = text.indexOf('📜 **Tiến trình:**');
  if (timelineStart >= 0) {
    const timelineBlock = text.slice(timelineStart).split('\n').slice(1);
    for (const line of timelineBlock) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('[[')) break;
      const parts = trimmed.match(/^\s*(\S+\s+\S+)\s{2,}(.+?)(?:\s+—\s+(.+))?$/);
      if (parts) {
        timeline.push({
          at: parts[1].trim(),
          event: parts[2].trim(),
          detail: (parts[3] ?? '').trim(),
        });
      }
    }
  }
  if (timeline.length > 0) {
    meta.timeline = timeline;
  }

  return meta;
}

function mergeInventoryDraftMeta(body: string): InventoryDraftMeta | null {
  const fromJson = parseInventoryDraftMeta(body);
  const legacy = parseLegacyInventoryDraftDetails(body);
  if (!fromJson && !legacy.materials?.length && !legacy.aggregate_status) {
    return fromJson;
  }

  return {
    ...legacy,
    ...fromJson,
    materials: (fromJson?.materials?.length ? fromJson.materials : legacy.materials) ?? [],
    timeline: (fromJson?.timeline?.length ? fromJson.timeline : legacy.timeline) ?? [],
    session_photos: fromJson?.session_photos ?? [],
  };
}

export function isInventoryDraftMessage(body: string | null | undefined): boolean {
  const raw = String(body ?? '');
  const meta = parseInventoryDraftMeta(raw);
  if (meta?.source_module === 'INVENTORY_DRAFT') return true;
  if (meta?.session_id && raw.includes(META_START)) return true;
  return stripInventoryDraftMeta(raw).includes(MESSAGE_MARKER);
}

function statusAccent(statusCode: string | undefined, aggregateStatus: string) {
  const code = (statusCode ?? '').toUpperCase();
  const agg = aggregateStatus.toLowerCase();

  if (code === 'APPROVED' || agg.includes('đã duyệt')) {
    return { text: '#34d399', border: 'rgba(16,185,129,0.3)', bg: 'rgba(16,185,129,0.15)' };
  }
  if (code === 'REJECTED' || agg.includes('trả lại toàn phiên')) {
    return { text: '#f87171', border: 'rgba(239,68,68,0.3)', bg: 'rgba(239,68,68,0.15)' };
  }
  if (code === 'RETURNED' || code === 'PARTIAL_RETURNED' || code === 'PARTIAL_MIXED' || agg.includes('trả lại')) {
    return { text: '#fbbf24', border: 'rgba(245,158,11,0.3)', bg: 'rgba(245,158,11,0.15)' };
  }
  if (code === 'SUBMITTED' || agg.includes('chờ ktk')) {
    return { text: '#22d3ee', border: 'rgba(6,182,212,0.3)', bg: 'rgba(6,182,212,0.15)' };
  }
  return { text: '#cbd5e1', border: 'rgba(100,116,139,0.3)', bg: 'rgba(100,116,139,0.15)' };
}

function cardBorderColors(statusCode: string | undefined, mine: boolean) {
  const code = (statusCode ?? '').toUpperCase();
  if (code === 'APPROVED') {
    return { border: 'rgba(16,185,129,0.3)', bg: mine ? 'rgba(16,185,129,0.1)' : '#0d1d17' };
  }
  if (code === 'REJECTED' || code === 'RETURNED' || code === 'PARTIAL_RETURNED' || code === 'PARTIAL_MIXED') {
    return { border: 'rgba(245,158,11,0.3)', bg: mine ? 'rgba(245,158,11,0.1)' : '#1c160e' };
  }
  return { border: 'rgba(6,182,212,0.25)', bg: mine ? 'rgba(6,182,212,0.08)' : '#0e1823' };
}

function lineStatusColor(status: string | undefined): string {
  const s = (status ?? '').toUpperCase();
  if (s === 'APPROVED') return '#34d399';
  if (s === 'RETURNED' || s === 'REJECTED') return '#fbbf24';
  if (s === 'DRAFT') return '#c084fc';
  return '#22d3ee';
}

type Props = {
  body: string;
  isMine: boolean;
  isDark: boolean;
  legacyAttachments?: ChatAttachment[];
  onImagePress?: (attachment: any, url: string) => void;
};

export function InventoryDraftMessageCard({ body, isMine, isDark, legacyAttachments = [], onImagePress }: Props) {
  const palette = getErpMessengerCardPalette(isMine, 'blue');
  const meta = useMemo(() => mergeInventoryDraftMeta(body), [body]);
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!meta) return null;

  const status = meta.aggregate_status ?? '⏳ Chờ KTK duyệt';
  const materials = meta.materials ?? [];
  const timelineRows = meta.timeline ?? [];
  const statusCode = meta.status_code ?? 'SUBMITTED';
  const sessionPhotos = (meta.session_photos ?? []).filter((photo) => Boolean(photo?.url));
  const legacyPhotos = legacyAttachments.filter(
    (attachment) =>
      (attachment.mimeType ?? '').startsWith('image/') ||
      /\.(jpe?g|png|gif|webp)$/i.test(attachment.originalName ?? ''),
  );
  const displayTitle = meta.header_title || 'Ghi chép kiểm kê';

  const statusStyle = statusAccent(statusCode, status);
  const cardColors = cardBorderColors(statusCode, isMine);

  return (
    <View style={[styles.card, { backgroundColor: cardColors.bg, borderColor: cardColors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>📝</Text>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.headerTitle, { color: palette.text }]}>{displayTitle}</Text>
          {meta.recorded_by ? (
            <Text style={[styles.headerSub, { color: palette.textMuted }]}>
              👤 {meta.recorded_by}
              {meta.portal_label ? ` (${meta.portal_label})` : ''}
            </Text>
          ) : null}
          {meta.session_name ? (
            <Text style={[styles.headerSub, { color: palette.textMuted }]}>
              📋 {meta.session_name}
              {meta.short_session ? ` [${meta.short_session}]` : ''}
            </Text>
          ) : null}
          <View style={[styles.statusBadge, { borderColor: statusStyle.border, backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>{status}</Text>
          </View>
        </View>
      </View>

      {/* Materials List */}
      {materials.length > 0 ? (
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.collapseBtn, { borderColor: palette.innerBorder, backgroundColor: palette.tableHeadBg }]}
            onPress={() => setDetailsOpen((o) => !o)}
          >
            <Text style={[styles.collapseTitle, { color: palette.text }]}>📦 Chi tiết vật tư ({materials.length})</Text>
            <Ionicons name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={palette.textMuted} />
          </TouchableOpacity>
          {detailsOpen && (
            <View style={styles.materialsList}>
              {materials.map((item, idx) => {
                const statusLabel = item.status_label || '⏳';
                const reviewNotes = (item.review_notes ?? '').trim();
                return (
                  <View
                    key={`${item.id ?? idx}-${idx}`}
                    style={[styles.materialItem, { borderColor: palette.tableBorder, backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)' }]}
                  >
                    <View style={styles.materialRow}>
                      <Text style={[styles.materialStatusEmoji, { color: lineStatusColor(item.status) }]}>
                        {statusLabel}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.materialName, { color: palette.text }]}>{item.material_name || '—'}</Text>
                        <Text style={[styles.materialSub, { color: palette.textMuted }]}>
                          SL: <Text style={{ color: palette.text }}>{item.quantity_label || '—'}</Text>
                          {item.location ? `  ·  Vị trí: ${item.location}` : ''}
                        </Text>
                        {reviewNotes ? (
                          <Text style={styles.reviewNotes}>↩ Lý do KTK: {reviewNotes}</Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      ) : null}

      {/* Timeline */}
      {timelineRows.length > 0 ? (
        <View style={[styles.section, { borderTopWidth: 1, borderTopColor: palette.tableBorder, paddingTop: 10 }]}>
          <Text style={[styles.sectionTitle, { color: palette.textMuted }]}>📜 TIẾN TRÌNH</Text>
          <View style={styles.timelineList}>
            {timelineRows.slice(-6).map((entry, idx) => (
              <View key={idx} style={styles.timelineRow}>
                <Text style={[styles.timelineTime, { color: palette.textMuted }]}>{entry.at}</Text>
                <Text style={[styles.timelineContent, { color: palette.text }]} numberOfLines={2}>
                  {entry.role ? <Text style={{ fontWeight: '700' }}>{entry.role} </Text> : null}
                  {entry.person ? <Text style={{ color: palette.textMuted }}>({entry.person}) </Text> : null}
                  {entry.event}
                  {entry.detail ? ` (${entry.detail})` : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Photos */}
      {sessionPhotos.length > 0 ? (
        <View style={[styles.section, { borderTopWidth: 1, borderTopColor: palette.tableBorder, paddingTop: 10 }]}>
          <Text style={[styles.sectionTitle, { color: palette.textMuted }]}>📷 ẢNH KIỂM KÊ ({sessionPhotos.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
            {sessionPhotos.map((photo, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.photoCell, { borderColor: palette.tableBorder }]}
                onPress={() => photo.url && onImagePress?.(null, photo.url)}
              >
                {photo.url ? (
                  <Image source={{ uri: photo.url }} style={styles.photoImg} contentFit="cover" cachePolicy="memory-disk" />
                ) : null}
                <View style={[styles.photoCaption, { borderTopColor: palette.tableBorder }]}>
                  <Text style={[styles.photoLabel, { color: palette.text }]} numberOfLines={1}>
                    {photo.caption || photo.original_name || `Ảnh ${index + 1}`}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : legacyPhotos.length > 0 ? (
        <View style={[styles.section, { borderTopWidth: 1, borderTopColor: palette.tableBorder, paddingTop: 10 }]}>
          <Text style={[styles.sectionTitle, { color: palette.textMuted }]}>📷 ẢNH KIỂM KÊ ({legacyPhotos.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
            {legacyPhotos.map((photo, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.photoCell, { borderColor: palette.tableBorder }]}
                onPress={() => photo.url && onImagePress?.(photo, photo.url)}
              >
                {photo.url ? (
                  <Image source={{ uri: photo.url }} style={styles.photoImg} contentFit="cover" cachePolicy="memory-disk" />
                ) : null}
                <View style={[styles.photoCaption, { borderTopColor: palette.tableBorder }]}>
                  <Text style={[styles.photoLabel, { color: palette.text }]} numberOfLines={1}>
                    {photo.originalName || `Ảnh ${index + 1}`}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, maxWidth: '100%', width: '100%', minWidth: 260, alignSelf: 'stretch', padding: 12, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  headerEmoji: { fontSize: 18 },
  headerTextWrap: { flex: 1, minWidth: 0, gap: 2 },
  headerTitle: { fontSize: 14, fontWeight: '800', lineHeight: 20 },
  headerSub: { fontSize: 12 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, marginTop: 4 },
  statusBadgeText: { fontSize: 9, fontWeight: '700' },
  section: { width: '100%', gap: 6 },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  collapseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: 8, borderWidth: 1 },
  collapseTitle: { fontSize: 12, fontWeight: '700', flex: 1 },
  materialsList: { gap: 6, marginTop: 6 },
  materialItem: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, padding: 8 },
  materialRow: { flexDirection: 'row', gap: 6 },
  materialStatusEmoji: { fontSize: 12, fontWeight: '700' },
  materialName: { fontSize: 12, fontWeight: '600' },
  materialSub: { fontSize: 11, marginTop: 2 },
  reviewNotes: { color: '#fbbf24', fontSize: 11, marginTop: 2 },
  timelineList: { gap: 4 },
  timelineRow: { flexDirection: 'row', gap: 6 },
  timelineTime: { fontFamily: 'monospace', fontSize: 9, width: 45 },
  timelineContent: { flex: 1, fontSize: 10 },
  photoScroll: { marginTop: 4, flexDirection: 'row' },
  photoCell: { width: 140, height: 135, borderRadius: 8, borderWidth: 1, overflow: 'hidden', marginRight: 8, backgroundColor: '#00000022' },
  photoImg: { width: '100%', height: 100 },
  photoCaption: { padding: 4, borderTopWidth: 1, height: 35, justifyContent: 'center' },
  photoLabel: { fontSize: 9, fontWeight: '600' },
});
