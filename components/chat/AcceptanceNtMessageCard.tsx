import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import type { ChatAttachment } from '@/Models/chat/types';
import { getErpMessengerCardPalette } from '@/features/chat/erpCardTheme';

const META_START = '[[ACCEPTANCE_NT_META]]';
const META_END = '[[/ACCEPTANCE_NT_META]]';
const MESSAGE_MARKER = 'BIÊN BẢN NGHIỆM THU SX';

type Photo = { object_key?: string; url?: string; name?: string };
type VolumeItem = {
  work_item?: string;
  material?: string;
  unit?: string | null;
  quantity?: number | null;
  result?: 'pass' | 'fail' | null;
};
type Meta = {
  source_module?: string;
  record_id?: number;
  project_code?: string;
  project_name?: string;
  title?: string;
  record_type?: string;
  description?: string;
  inspector?: string;
  approver?: string;
  status?: string;
  status_label?: string;
  volume_items?: VolumeItem[];
  item_count?: number;
  pass_count?: number;
  fail_count?: number;
  photos?: Photo[];
  photo_count?: number;
  erp_review_url?: string;
};

export function parseAcceptanceNtMeta(body: string | null | undefined): Meta | null {
  const text = String(body ?? '');
  const start = text.indexOf(META_START);
  const end = text.indexOf(META_END, start);
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(text.slice(start + META_START.length, end)) as Meta;
  } catch {
    return null;
  }
}

export function isAcceptanceNtMessage(body: string | null | undefined): boolean {
  const raw = String(body ?? '');
  const meta = parseAcceptanceNtMeta(raw);
  if (meta?.source_module === 'QAQC_ACCEPTANCE_NT') return true;
  return raw.includes(META_START) || raw.includes(MESSAGE_MARKER);
}

type Props = {
  body: string;
  isMine: boolean;
  isDark: boolean;
  messageAttachments?: ChatAttachment[];
  onImagePress?: (attachment: any, url: string) => void;
};

export function AcceptanceNtMessageCard({ body, isMine, isDark, messageAttachments = [], onImagePress }: Props) {
  const palette = getErpMessengerCardPalette(isMine, 'sky');
  const meta = useMemo(() => parseAcceptanceNtMeta(body), [body]);
  if (!meta) return null;

  const status = (meta.status ?? 'pending').toLowerCase();
  const border =
    status === 'approved'
      ? { border: 'rgba(16,185,129,0.35)', bg: isMine ? 'rgba(16,185,129,0.12)' : '#0d1d17' }
      : status === 'rejected'
        ? { border: 'rgba(239,68,68,0.35)', bg: isMine ? 'rgba(239,68,68,0.12)' : '#1c1010' }
        : { border: 'rgba(56,189,248,0.3)', bg: isMine ? 'rgba(56,189,248,0.1)' : '#0e1823' };

  const photoUrls = (meta.photos ?? [])
    .map((p) => String(p.url ?? '').trim())
    .filter((u) => /^https?:\/\//i.test(u));
  const fallbackUrls = messageAttachments
    .map((a) => String(a.url ?? '').trim())
    .filter((u) => /^https?:\/\//i.test(u));
  const urls = photoUrls.length > 0 ? photoUrls : fallbackUrls;

  return (
    <View style={[styles.card, { backgroundColor: border.bg, borderColor: border.border }]}>
      <View style={styles.header}>
        <Text style={styles.emoji}>✅</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: palette.accent }]}>Biên bản nghiệm thu SX</Text>
          {meta.project_code ? (
            <Text style={[styles.sub, { color: palette.textMuted }]}>
              {meta.project_code}
              {meta.project_name ? ` — ${meta.project_name}` : ''}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={[styles.badge, { borderColor: palette.accent }]}>
        <Text style={{ color: palette.accent, fontWeight: '700', fontSize: 11 }}>{meta.status_label || 'Chờ QLNM duyệt'}</Text>
      </View>
      {meta.title ? <Text style={[styles.row, { color: palette.text }]}>📂 {meta.title}</Text> : null}
      {meta.inspector ? <Text style={[styles.row, { color: palette.textMuted }]}>👤 {meta.inspector}</Text> : null}
      {meta.approver ? <Text style={[styles.row, { color: palette.textMuted }]}>👔 {meta.approver}</Text> : null}
      <View style={styles.stats}>
        <Text style={[styles.stat, { color: palette.text }]}>{meta.item_count ?? 0} dòng</Text>
        <Text style={[styles.stat, { color: '#34d399' }]}>{meta.pass_count ?? 0} đạt</Text>
        <Text style={[styles.stat, { color: '#f87171' }]}>{meta.fail_count ?? 0} không đạt</Text>
      </View>
      {urls.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photos}>
          {urls.map((url, i) => (
            <TouchableOpacity key={`${url}-${i}`} onPress={() => onImagePress?.({ url }, url)}>
              <Image source={{ uri: url }} style={styles.photo} contentFit="cover" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
      {meta.erp_review_url ? (
        <TouchableOpacity
          style={styles.link}
          onPress={() => Linking.openURL(meta.erp_review_url as string)}
        >
          <Text style={{ color: palette.accent, fontWeight: '700', fontSize: 12 }}>Mở biên bản trên ERP</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8, minWidth: 260 },
  header: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  emoji: { fontSize: 18 },
  title: { fontSize: 14, fontWeight: '800' },
  sub: { fontSize: 11, marginTop: 2 },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  row: { fontSize: 12 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { fontSize: 12, fontWeight: '700' },
  photos: { marginTop: 4 },
  photo: { width: 72, height: 72, borderRadius: 8, marginRight: 6, backgroundColor: '#000' },
  link: { marginTop: 4, alignItems: 'center', paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(56,189,248,0.35)' },
});
