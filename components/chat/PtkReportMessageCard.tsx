import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';

import { getErpMessengerCardPalette } from '@/features/chat/erpCardTheme';

function findLineValue(lines: string[], includes: string, splitLabel?: string): string {
  const line = lines.find((l) => l.includes(includes));
  if (!line) return '';
  const label = splitLabel ?? includes;
  const idx = line.indexOf(label);
  if (idx < 0) return '';
  return line.slice(idx + label.length).replace(/\*\*/g, '').trim();
}

export function parseEvidenceLinks(lines: string[]): string[] {
  const links: string[] = [];
  for (const line of lines) {
    const markdown = line.match(/\((https?:\/\/[^\s)]+)\)/g);
    if (markdown) {
      for (const m of markdown) {
        const url = rewritePtkEvidenceUrl(m.slice(1, -1));
        if (url) links.push(url);
      }
    }
  }
  return [...new Set(links)];
}

export function rewritePtkEvidenceUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    const marker = '/storage/ptk-reports/';
    const idx = parsed.pathname.indexOf(marker);
    if (idx >= 0) {
      const relative = decodeURIComponent(parsed.pathname.slice(idx + marker.length));
      // Base64 encode using btoa if possible, or simple replace
      // In JS environments, window.btoa / global.btoa might be available.
      // But standard JS btoa is safest.
      const b64 = global.btoa ? global.btoa(relative) : relative;
      const encoded = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      return `${parsed.origin}/api/ptk-report-storage/${encoded}`;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

export function isPtkReportMessage(body: string | null | undefined): boolean {
  const b = String(body || '');
  return (
    b.includes('PHÒNG THIẾT KẾ') &&
    (b.includes('BÁO CÁO CÔNG VIỆC') ||
      b.includes('HOÀN THÀNH CÔNG VIỆC') ||
      b.includes('BẮT ĐẦU CÔNG VIỆC') ||
      b.includes('TIẾP TỤC CÔNG VIỆC') ||
      b.includes('TẠM DỪNG CÔNG VIỆC') ||
      b.includes('BÁO CÁO PHÒNG THIẾT KẾ') ||
      b.includes('BÁO CÁO HOÀN THÀNH — PHÒNG THIẾT KẾ') ||
      b.includes('CÔNG VIỆC PTK'))
  );
}

export type PtkReportAction = 'start' | 'continue' | 'pause' | 'save' | 'complete';

export interface PtkReportData {
  action: PtkReportAction;
  title: string;
  icon: string;
  taskName: string;
  category: string;
  project: string;
  assignee: string;
  dateReport: string;
  startTime: string;
  endTime: string;
  progress: string;
  workStatus: string;
  notes: string;
  evidenceLinks: string[];
}

function detectPtkAction(body: string): PtkReportAction {
  if (body.includes('BẮT ĐẦU CÔNG VIỆC')) return 'start';
  if (body.includes('TIẾP TỤC CÔNG VIỆC')) return 'continue';
  if (body.includes('TẠM DỪNG CÔNG VIỆC')) return 'pause';
  if (body.includes('HOÀN THÀNH CÔNG VIỆC') || body.includes('BÁO CÁO HOÀN THÀNH')) return 'complete';
  return 'save';
}

function getPtkHeader(action: PtkReportAction): { title: string; icon: string } {
  switch (action) {
    case 'start':
      return { title: 'Bắt đầu công việc', icon: '▶️' };
    case 'continue':
      return { title: 'Tiếp tục công việc', icon: '▶️' };
    case 'pause':
      return { title: 'Tạm dừng công việc', icon: '⚠️' };
    case 'complete':
      return { title: 'Hoàn thành công việc', icon: '🟢' };
    default:
      return { title: 'Báo cáo công việc', icon: '✅' };
  }
}

function parseLegacyTimes(workHours: string): { start: string; end: string } {
  const m = workHours.match(/^(\d{1,2}:\d{2})\s*➔\s*(\d{1,2}:\d{2})/);
  if (!m) return { start: '', end: '' };
  return { start: m[1], end: m[2] };
}

export function parsePtkReport(body: string): PtkReportData {
  const lines = body.split('\n');
  const action = detectPtkAction(body);
  const header = getPtkHeader(action);

  const startTime =
    findLineValue(lines, '**Giờ bắt đầu:**') ||
    parseLegacyTimes(findLineValue(lines, '**Giờ công hôm nay:**')).start;
  const endTime =
    findLineValue(lines, '**Giờ kết thúc:**') ||
    parseLegacyTimes(findLineValue(lines, '**Giờ công hôm nay:**')).end;

  const progress =
    findLineValue(lines, '**Tiến độ công việc:**') || findLineValue(lines, '**Tiến độ báo cáo:**');

  const workStatus =
    findLineValue(lines, '**Trạng thái công việc:**') || findLineValue(lines, '**Trạng thái báo cáo:**');

  const notes =
    findLineValue(lines, '**Ghi chú:**') || findLineValue(lines, '💬 **Ghi chú:**');

  return {
    action,
    title: header.title,
    icon: header.icon,
    taskName: findLineValue(lines, '**Công việc:**'),
    category: findLineValue(lines, '**Hạng mục:**'),
    project: findLineValue(lines, '**Dự án:**'),
    assignee: findLineValue(lines, '**Người thực hiện:**'),
    dateReport: findLineValue(lines, '**Ngày báo cáo:**'),
    startTime,
    endTime,
    progress,
    workStatus,
    notes,
    evidenceLinks: parseEvidenceLinks(lines),
  };
}

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('hoàn thành') || s.includes('hoan thanh')) return '#34d399';
  if (s.includes('tạm dừng') || s.includes('tam dung')) return '#fbbf24';
  return '#7dd3fc';
}

function Field({
  label,
  value,
  palette,
  valueColor,
  valueFontWeight = '500',
}: {
  label: string;
  value: string;
  palette: any;
  valueColor?: string;
  valueFontWeight?: '500' | '600' | '700' | '800';
}) {
  if (value === '' || value === null || value === undefined || value === '—' || value === 'N/A') return null;

  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: palette.textMuted }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: valueColor || palette.text, fontWeight: valueFontWeight }]}>
        {value}
      </Text>
    </View>
  );
}

import type { ChatMessage } from '@/Models/chat/types';

type Props = {
  body: string;
  isMine: boolean;
  isDark: boolean;
  message?: ChatMessage;
  onImagePress?: (attachment: any, url: string) => void;
};

export function PtkReportMessageCard({ body, isMine, isDark, message, onImagePress }: Props) {
  const data = parsePtkReport(body);
  const palette = getErpMessengerCardPalette(isMine, 'violet');

  const borderColors = isMine
    ? { border: 'rgba(139,92,246,0.3)', bg: '#241838' }
    : { border: 'rgba(217,70,239,0.25)', bg: '#1b0d23' };

  const accentColor = isMine ? '#c084fc' : '#e879f9';

  return (
    <View style={[styles.card, { backgroundColor: borderColors.bg, borderColor: borderColors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>{data.icon}</Text>
        <Text style={[styles.headerTitle, { color: accentColor }]}>{data.title}</Text>
        {data.dateReport ? (
          <Text style={[styles.headerDate, { color: palette.textMuted }]}>{data.dateReport}</Text>
        ) : null}
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Field label="Công việc" value={data.taskName} palette={palette} valueFontWeight="700" />
        <Field label="Hạng mục" value={data.category} palette={palette} valueColor="#fcd34d" />
        <Field label="Dự án" value={data.project} palette={palette} />
        <Field label="Người thực hiện" value={data.assignee} palette={palette} />

        {data.startTime || data.endTime ? (
          <View style={[styles.box, { borderColor: palette.tableBorder, backgroundColor: 'rgba(0,0,0,0.15)' }]}>
            <View style={styles.grid2}>
              <View style={styles.col}>
                <Field label="Bắt đầu" value={data.startTime} palette={palette} valueColor="#f59e0b" />
              </View>
              <View style={styles.col}>
                <Field label="Kết thúc" value={data.endTime} palette={palette} valueColor="#f59e0b" />
              </View>
            </View>
          </View>
        ) : null}

        <View style={[styles.box, { borderColor: palette.tableBorder, backgroundColor: 'rgba(10,21,38,0.3)' }]}>
          <View style={styles.grid2}>
            <View style={styles.col}>
              <Field label="Tiến độ" value={data.progress} palette={palette} valueColor="#10b981" valueFontWeight="700" />
            </View>
            <View style={styles.col}>
              <Field label="Trạng thái" value={data.workStatus} palette={palette} valueColor={statusColor(data.workStatus)} valueFontWeight="700" />
            </View>
          </View>
        </View>

        {data.notes && data.notes !== 'Không có' ? (
          <View style={[styles.noteBox, { borderTopColor: palette.tableBorder }]}>
            <Text style={[styles.noteTitle, { color: palette.textMuted }]}>Ghi chú</Text>
            <Text style={[styles.noteText, { color: palette.text }]}>{data.notes}</Text>
          </View>
        ) : null}
      </View>

      {/* Evidence links */}
      {data.evidenceLinks.length > 0 ? (
        <View style={[styles.photoSection, { borderTopColor: palette.tableBorder }]}>
          <Text style={[styles.photoSectionTitle, { color: palette.textMuted }]}>
            Minh chứng ({data.evidenceLinks.length})
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
            {data.evidenceLinks.map((link, i) => {
              const matchingAttachment = (message?.attachments ?? []).find(
                (a) => a.url === link || (a.originalName && link.includes(a.originalName))
              );
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.photoCell, { borderColor: palette.tableBorder }]}
                  onPress={() => onImagePress?.(matchingAttachment || null, link)}
                >
                  <Image source={{ uri: link }} style={styles.photoImg} contentFit="cover" cachePolicy="memory-disk" />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, maxWidth: '100%', width: '100%', minWidth: 260, alignSelf: 'stretch', padding: 12, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.15)', paddingBottom: 6 },
  headerIcon: { fontSize: 16 },
  headerTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 },
  headerDate: { fontSize: 10 },
  body: { gap: 8 },
  grid2: { flexDirection: 'row', gap: 8 },
  col: { flex: 1, minWidth: 0 },
  field: { gap: 1 },
  fieldLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldValue: { fontSize: 12 },
  box: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, padding: 8 },
  noteBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  noteTitle: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  noteText: { fontSize: 12, marginTop: 2, fontStyle: 'italic', lineHeight: 16 },
  photoSection: { gap: 4, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  photoSectionTitle: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  photoScroll: { marginTop: 4, flexDirection: 'row' },
  photoCell: { width: 140, height: 100, borderRadius: 8, borderWidth: 1, overflow: 'hidden', marginRight: 8, backgroundColor: '#00000022' },
  photoImg: { width: '100%', height: '100%' },
});
