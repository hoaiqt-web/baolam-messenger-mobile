/**
 * QLNM assignment message card (📋 Giao lúc).
 * Other ERP cards: see StructuredChatMessage.tsx
 */
import { View, Text, StyleSheet } from 'react-native';

function stripStars(s: string): string {
  return s.replace(/\*+/g, '').trim();
}

function findLineValue(lines: string[], includes: string): string {
  const line = lines.find((l) => l.includes(includes));
  if (!line) return '';
  const i = line.indexOf(includes);
  if (i < 0) return '';
  return stripStars(line.slice(i + includes.length).trim().replace(/\r/g, ''));
}

export function isErpAssignmentMessage(body: string): boolean {
  const b = body.trim();
  return b.startsWith('📋') && b.includes('Giao lúc:');
}

type ErpStructuredMessageProps = {
  body: string;
  isMine: boolean;
  isDark: boolean;
};

export function ErpStructuredMessage({ body, isMine, isDark }: ErpStructuredMessageProps) {
  const displayBody = String(body || '').trim();
  if (!isErpAssignmentMessage(displayBody)) return null;

  const lines = displayBody.split('\n');
  const first = (lines[0] || '').trim();
  const assigneeLine = stripStars(first.replace(/^📋\s*/, '').trim());
  const giaoLuc = stripStars(findLineValue(lines, '🕐 *Giao lúc:*'));
  let duAn = findLineValue(lines, '📦 *Dự án:*');
  if (!duAn) duAn = findLineValue(lines, '📂 *Mảng:*');
  const deadlineRaw = lines.find((l) => l.includes('📅 *Deadline:*'));
  let deadline = '';
  if (deadlineRaw) {
    const ix = deadlineRaw.indexOf('📅 *Deadline:*');
    deadline = stripStars(deadlineRaw.slice(ix + '📅 *Deadline:*'.length).trim());
  }
  let metaEnd = 1;
  while (metaEnd < lines.length && /^(🕐|📦|📂|📅)/.test(lines[metaEnd]?.trim() ?? '')) {
    metaEnd += 1;
  }
  while (metaEnd < lines.length && !lines[metaEnd]?.trim()) metaEnd += 1;
  const hintIdx = lines.findIndex((l) => l.includes('👉'));
  const descEnd = hintIdx >= 0 ? hintIdx : lines.length;
  const description =
    lines
      .slice(metaEnd, descEnd)
      .join('\n')
      .trim()
      .replace(/\*+/g, '') || '—';
  const footerLine = lines.find((l) => l.includes('👉'))?.replace(/\*+/g, '') || '';

  const palette = {
    cardBg: isMine ? '#0f172aee' : '#1e1b4bee',
    border: isMine ? '#38bdf866' : '#818cf866',
    headerAccent: '#0ea5e9',
    label: '#94a3b8',
    value: '#e2e8f0',
    desc: '#cbd5e1',
    footer: '#94a3b8',
  };

  return (
    <View style={[assignStyles.wrap, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
      <View style={assignStyles.headerBar}>
        <Text style={[assignStyles.headerTitle, { color: palette.headerAccent }]}>
          📋 PHÂN CÔNG CÔNG VIỆC
        </Text>
      </View>
      <View style={assignStyles.body}>
        <Field label="Người nhận" value={assigneeLine || '—'} valueBold palette={palette} />
        {giaoLuc ? <Field label="Giao lúc" value={giaoLuc} palette={palette} /> : null}
        {duAn ? <Field label="Dự án / Mảng" value={duAn} palette={palette} /> : null}
        {deadline ? <Field label="Deadline" value={deadline} palette={palette} /> : null}
        <View style={assignStyles.descBox}>
          <Text style={[assignStyles.descText, { color: palette.desc }]}>{description}</Text>
        </View>
        {footerLine ? (
          <Text style={[assignStyles.footer, { color: palette.footer }]}>{footerLine}</Text>
        ) : null}
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  valueBold,
  palette,
}: {
  label: string;
  value: string;
  valueBold?: boolean;
  palette: { label: string; value: string };
}) {
  return (
    <View style={fieldStyles.block}>
      <Text style={[fieldStyles.label, { color: palette.label }]}>{label}</Text>
      <Text style={[fieldStyles.value, { color: palette.value }, valueBold ? { fontWeight: '700' } : null]}>
        {value}
      </Text>
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  block: { marginBottom: 8 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  value: { fontSize: 14, lineHeight: 20 },
});

const assignStyles = StyleSheet.create({
  wrap: { borderRadius: 12, borderWidth: 1, overflow: 'hidden', maxWidth: '100%', minWidth: 260, alignSelf: 'stretch' },
  headerBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#6a72a888',
  },
  headerTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  body: { padding: 12 },
  descBox: { marginTop: 8 },
  descText: { fontSize: 14, lineHeight: 21 },
  footer: { fontSize: 12, fontStyle: 'italic', marginTop: 10 },
});
