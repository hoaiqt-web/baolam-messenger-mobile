import { View, Text, StyleSheet } from 'react-native';

const META_START = '[[PO_CANCEL_META]]';
const META_END = '[[/PO_CANCEL_META]]';
const LEGACY_MARKER = '[[PO_CANCEL_REQUEST]]';

type PoCancelMeta = {
  kind?: string;
  po_id?: number;
  po_code?: string;
  project_code?: string;
  project_name?: string;
  supplier_name?: string;
  total_fmt?: string;
  requested_by?: string;
  reason_label?: string;
  reason?: string;
  requested_at?: string;
  resolved_by?: string;
  resolved_at?: string;
};

function parseMeta(body: string): { displayBody: string; meta: PoCancelMeta | null } {
  const start = body.indexOf(META_START);
  if (start >= 0) {
    const end = body.indexOf(META_END, start);
    if (end >= 0) {
      try {
        const meta = JSON.parse(body.slice(start + META_START.length, end)) as PoCancelMeta;
        const displayBody = `${body.slice(0, start)}${body.slice(end + META_END.length)}`
          .replace(LEGACY_MARKER, '')
          .trim();
        return { displayBody, meta };
      } catch {
        // ignore
      }
    }
  }
  return { displayBody: body.replace(LEGACY_MARKER, '').trim(), meta: null };
}

export function isPoCancelRequestMessage(body: string | null | undefined): boolean {
  const text = String(body ?? '');
  return (
    text.includes(META_START)
    || text.includes(LEGACY_MARKER)
    || text.includes('YÊU CẦU HUỶ PO')
    || text.includes('ĐÃ DUYỆT HUỶ PO')
    || text.includes('TỪ CHỐI HUỶ PO')
  );
}

type Props = { body: string; isMine?: boolean };

export function PoCancelRequestMessageCard({ body }: Props) {
  const { meta, displayBody } = parseMeta(body);
  const kind = meta?.kind
    || (displayBody.includes('ĐÃ DUYỆT HUỶ') ? 'approved'
      : displayBody.includes('TỪ CHỐI HUỶ') ? 'rejected'
        : 'request');

  const title = kind === 'approved'
    ? 'Đã duyệt huỷ PO'
    : kind === 'rejected'
      ? 'Từ chối huỷ PO'
      : 'Yêu cầu huỷ PO';

  const badge = kind === 'approved' ? 'ĐÃ HUỶ' : kind === 'rejected' ? 'TỪ CHỐI HUỶ' : 'CHỜ CFO';
  const supplier = meta?.supplier_name || '';
  const totalFmt = meta?.total_fmt || '—';
  const header = supplier
    ? `NCC: ${supplier.toUpperCase()} | ${totalFmt} | ${meta?.po_code || ''}`
    : title;

  return (
    <View style={[styles.card, kind === 'approved' ? styles.approved : kind === 'rejected' ? styles.rejected : styles.request]}>
      <View style={styles.header}>
        <Text style={styles.title}>{header}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      </View>
      {meta ? (
        <>
          <Text style={styles.line}>Dự án: {[meta.project_code, meta.project_name].filter(Boolean).join(' — ')}</Text>
          <Text style={styles.line}>PO: {meta.po_code}{meta.po_id ? ` (#${meta.po_id})` : ''}</Text>
          <Text style={styles.line}>NCC: {meta.supplier_name || '—'}</Text>
          <Text style={styles.line}>Trị giá: {meta.total_fmt || '—'}</Text>
          {meta.requested_by ? <Text style={styles.line}>PKH: {meta.requested_by}{meta.requested_at ? ` · ${meta.requested_at}` : ''}</Text> : null}
          {meta.resolved_by ? <Text style={styles.line}>CFO: {meta.resolved_by}{meta.resolved_at ? ` · ${meta.resolved_at}` : ''}</Text> : null}
          {meta.reason ? <Text style={styles.reason}>{meta.reason_label || 'Lý do'}: {meta.reason}</Text> : null}
        </>
      ) : (
        displayBody.split('\n').slice(1).map((line, idx) => (
          <Text key={idx} style={styles.line}>{line.replace(/\*\*/g, '')}</Text>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
    marginVertical: 4,
  },
  request: { backgroundColor: '#1a1208', borderColor: '#9a5b2a88' },
  approved: { backgroundColor: '#1a0c0c', borderColor: '#f43f5e55' },
  rejected: { backgroundColor: '#1a1408', borderColor: '#f59e0b55' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  title: { color: '#f8fafc', fontWeight: '800', fontSize: 14, flex: 1 },
  badge: { backgroundColor: '#00000055', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#fb923c', fontSize: 10, fontWeight: '800' },
  line: { color: '#e2e8f0', fontSize: 13, lineHeight: 18 },
  reason: { color: '#fdba74', fontSize: 13, marginTop: 4 },
});
