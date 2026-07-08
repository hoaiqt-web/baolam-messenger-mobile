import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';

import type { ChatAttachment, ChatMessage } from '@/Models/chat/types';
import { getErpMessengerCardPalette } from '@/features/chat/erpCardTheme';

const MARKER = '🚛 XE NCC ĐẾN CỔNG';
const VN_TZ = 'Asia/Ho_Chi_Minh';

function formatSecurityGateVnDisplay(value?: string | null): string {
  if (!value?.trim()) return '';

  const raw = value.trim();

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}(\s+\d{1,2}:\d{2}(:\d{2})?)?$/.test(raw)) {
    return raw;
  }

  const normalized = raw.replace(' ', 'T');
  const hasOffset = /[Zz]$/.test(normalized) || /[+-]\d{2}:?\d{2}$/.test(normalized);
  const parsed = new Date(hasOffset ? normalized : `${normalized}Z`);
  if (Number.isNaN(parsed.getTime())) return raw;

  const hasSeconds = /\d{1,2}:\d{2}:\d{2}/.test(raw);
  return parsed.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(hasSeconds ? { second: '2-digit' } : {}),
    timeZone: VN_TZ,
  });
}

function findField(lines: string[], prefix: string): string {
  const line = lines.find((row) => row.startsWith(prefix));
  if (!line) return '';
  return line.slice(prefix.length).trim();
}

export function isSecurityGateMessage(body: string | null | undefined): boolean {
  return String(body ?? '').trim().startsWith(MARKER);
}

function imageAttachments(attachments: ChatAttachment[] | undefined): ChatAttachment[] {
  return (attachments ?? []).filter((item) => {
    const mime = (item.mimeType ?? '').toLowerCase();
    return mime.startsWith('image/') || Boolean(item.url);
  });
}

function PhotoGrid({
  title,
  photos,
  isDark,
  tableBorder,
  text,
  textMuted,
  onImagePress,
}: {
  title: string;
  photos: any[];
  isDark: boolean;
  tableBorder: string;
  text: string;
  textMuted: string;
  onImagePress?: (attachment: any, url: string) => void;
}) {
  if (photos.length === 0) return null;

  return (
    <View style={styles.photoSection}>
      <Text style={[styles.photoTitle, { color: textMuted }]}>
        {title} ({photos.length})
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
        {photos.map((photo, index) => {
          const url = photo.url ?? '';
          if (!url) return null;
          const label = photo.originalName || `${title} ${index + 1}`;

          return (
            <TouchableOpacity
              key={`${photo.id}-${index}`}
              style={[styles.photoCell, { borderColor: tableBorder }]}
              onPress={() => url && onImagePress?.(photo, url)}
            >
              <Image source={{ uri: url }} style={styles.photoImg} contentFit="cover" cachePolicy="memory-disk" />
              <View style={[styles.photoCaption, { borderTopColor: tableBorder }]}>
                <Text style={[styles.photoLabel, { color: text }]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

type Props = {
  message: ChatMessage;
  isMine: boolean;
  isDark: boolean;
  onImagePress?: (attachment: any, url: string) => void;
};

export function SecurityGateMessageCard({ message, isMine, isDark, onImagePress }: Props) {
  const body = message.body ?? '';
  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);

  const supplier = findField(lines, 'NCC:');
  const po = findField(lines, 'PO:');
  const project = findField(lines, 'Dự án:');
  const visitor = findField(lines, 'Người đến:');
  const vehicleLine = findField(lines, 'Xe:');
  const attachmentHint = findField(lines, 'Ảnh đính kèm:');
  const receiver = findField(lines, 'Người ra nhận:');
  const deliverySchedule = findField(lines, 'Lịch giao KTMH:');
  const operatedAtFromBody = findField(lines, 'Thời gian thao tác:');
  const note = findField(lines, 'Ghi chú:');

  const operatedAtDisplay =
    formatSecurityGateVnDisplay(message.sentAt) ||
    formatSecurityGateVnDisplay(operatedAtFromBody) ||
    operatedAtFromBody;
  const deliveryScheduleDisplay =
    formatSecurityGateVnDisplay(deliverySchedule) || deliverySchedule;

  const vehicleType = vehicleLine.includes('|')
    ? vehicleLine.split('|')[0]?.trim()
    : vehicleLine;
  const plate = vehicleLine.includes('|')
    ? vehicleLine.split('|').slice(1).join('|').replace('Biển số:', '').trim()
    : '';

  const mentionReceiver = (message.mentions ?? [])[0];
  const receiverLabel = mentionReceiver
    ? (mentionReceiver.fullName?.trim() || mentionReceiver.username)
    : receiver;

  const photos = imageAttachments(message.attachments);
  const useCombinedPhotos = Boolean(attachmentHint) || !vehicleLine;
  const platePhoto = useCombinedPhotos ? [] : (photos[0] ? [photos[0]] : []);
  const deliveryPhotos = useCombinedPhotos ? photos : photos.slice(1);

  const palette = getErpMessengerCardPalette(isMine, 'blue');
  const borderColors = isMine
    ? { border: 'rgba(6,182,212,0.3)', bg: '#081628' }
    : { border: 'rgba(245,158,11,0.25)', bg: '#181108' };

  return (
    <View style={[styles.card, { backgroundColor: borderColors.bg, borderColor: borderColors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>🚛</Text>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.headerTitle, { color: '#fbbf24' }]}>Xe NCC đến cổng</Text>
          {operatedAtDisplay ? (
            <Text style={[styles.headerSub, { color: '#22d3ee' }]}>Thao tác lúc {operatedAtDisplay}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.grid2}>
          <View style={styles.col}>
            <Field label="NCC" value={supplier} palette={palette} />
          </View>
          <View style={styles.col}>
            <Field label="PO" value={po} palette={palette} highlight />
          </View>
        </View>

        <Field label="Dự án" value={project} palette={palette} />

        <View style={[styles.box, { borderColor: palette.tableBorder, backgroundColor: 'rgba(0,0,0,0.2)' }]}>
          <View style={styles.grid2}>
            <View style={styles.col}>
              <Field label="Người đến" value={visitor} palette={palette} />
            </View>
            <View style={styles.col}>
              {attachmentHint ? (
                <Field label="Ảnh" value={attachmentHint} palette={palette} />
              ) : (
                <Field label="Loại xe" value={vehicleType} palette={palette} />
              )}
            </View>
          </View>
          {!attachmentHint && plate ? (
            <View style={{ marginTop: 6 }}>
              <Field label="Biển số" value={plate} palette={palette} highlight />
            </View>
          ) : null}
        </View>

        {/* Receiver Box */}
        <View style={[styles.receiverBox, { backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.2)' }]}>
          <Text style={styles.receiverTitle}>Người ra nhận hàng</Text>
          <Text style={[styles.receiverValue, { color: '#a7f3d0' }]}>
            {receiverLabel || receiver || '—'}
          </Text>
          {deliveryScheduleDisplay ? (
            <Text style={styles.receiverSub}>
              Lịch giao KTMH: <Text style={{ color: '#e2e8f0' }}>{deliveryScheduleDisplay}</Text>
            </Text>
          ) : null}
        </View>

        {/* Note */}
        {note ? (
          <View style={[styles.noteBox, { borderColor: palette.tableBorder, backgroundColor: 'rgba(0,0,0,0.1)' }]}>
            <Text style={[styles.noteTitle, { color: palette.textMuted }]}>Ghi chú</Text>
            <Text style={[styles.noteText, { color: palette.text }]}>{note}</Text>
          </View>
        ) : null}

        <PhotoGrid title="Ảnh biển số xe" photos={platePhoto} isDark={isDark} tableBorder={palette.tableBorder} text={palette.text} textMuted={palette.textMuted} onImagePress={onImagePress} />
        <PhotoGrid
          title={useCombinedPhotos ? 'Ảnh xe / phiếu giao hàng' : 'Ảnh phiếu giao hàng NCC'}
          photos={deliveryPhotos}
          isDark={isDark}
          tableBorder={palette.tableBorder}
          text={palette.text}
          textMuted={palette.textMuted}
          onImagePress={onImagePress}
        />
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  palette,
  highlight = false,
}: {
  label: string;
  value: string;
  palette: any;
  highlight?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: palette.textMuted }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: highlight ? '#fbbf24' : palette.text, fontWeight: highlight ? '800' : '600' }]} numberOfLines={2}>
        {value || '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, maxWidth: '100%', width: '100%', minWidth: 260, alignSelf: 'stretch', padding: 12, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.15)', paddingBottom: 6 },
  headerEmoji: { fontSize: 18 },
  headerTextWrap: { flex: 1, minWidth: 0, gap: 2 },
  headerTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  headerSub: { fontSize: 10, fontFamily: 'monospace' },
  body: { gap: 8 },
  grid2: { flexDirection: 'row', gap: 8 },
  col: { flex: 1, minWidth: 0 },
  field: { gap: 1 },
  fieldLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldValue: { fontSize: 12 },
  box: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, padding: 8 },
  receiverBox: { borderRadius: 8, borderWidth: 1, padding: 10, gap: 2 },
  receiverTitle: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', color: '#10b981', letterSpacing: 0.4 },
  receiverValue: { fontSize: 13, fontWeight: '800' },
  receiverSub: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  noteBox: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, padding: 8 },
  noteTitle: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  noteText: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  photoSection: { gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 8 },
  photoTitle: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  photoScroll: { marginTop: 4, flexDirection: 'row' },
  photoCell: { width: 140, height: 135, borderRadius: 8, borderWidth: 1, overflow: 'hidden', marginRight: 8, backgroundColor: '#00000022' },
  photoImg: { width: '100%', height: 100 },
  photoCaption: { padding: 4, borderTopWidth: 1, height: 35, justifyContent: 'center' },
  photoLabel: { fontSize: 9, fontWeight: '600' },
});
