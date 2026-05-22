/**
 * Rich cards for ERP → Messenger payloads (bridge formats in InternalBridgeController).
 * Parity with web `renderMessageBody.tsx` completion card + styled assignment block.
 */
import {
  View,
  Text,
  TouchableOpacity,
  Linking,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';

function googleDriveThumbUrl(url: string): string | null {
  const match =
    url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match?.[1]) {
    return `https://drive.google.com/thumbnail?sz=w400&id=${match[1]}`;
  }
  return null;
}

function stripStars(s: string): string {
  return s.replace(/\*+/g, '').trim();
}

function findLineValue(lines: string[], includes: string): string {
  const line = lines.find((l) => l.includes(includes));
  if (!line) return '';
  const i = line.indexOf(includes);
  if (i < 0) return '';
  return stripStars(
    line
      .slice(i + includes.length)
      .trim()
      .replace(/\r/g, ''),
  );
}

export function isErpCompletionReport(body: string): boolean {
  return body.includes('BÁO CÁO HOÀN THÀNH NHIỆM VỤ');
}

/** QLNM assignment message from `buildTaskMessage` */
export function isErpAssignmentMessage(body: string): boolean {
  const b = body.trim();
  return b.startsWith('📋') && b.includes('Giao lúc:');
}

function parseEvidenceLinks(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('• [Minh chứng')) continue;
    const m = t.match(/\((https?:\/\/[^\s)]+)\)/);
    if (m?.[1]) out.push(m[1]);
  }
  return out;
}

type ErpStructuredMessageProps = {
  body: string;
  isMine: boolean;
  isDark: boolean;
};

export function ErpStructuredMessage({
  body,
  isMine,
  isDark,
}: ErpStructuredMessageProps) {
  const displayBody = String(body || '').trim();

  if (isErpCompletionReport(displayBody)) {
    const lines = displayBody.split('\n');
    const taskName = findLineValue(lines, '📝 **Việc:**');
    const assignee = findLineValue(lines, '👤 **Người thực hiện:**');
    let project =
      findLineValue(lines, '📦 **Dự án:**') ||
      findLineValue(lines, '📂 **Mảng:**');
    const actuals = findLineValue(lines, '⏱️ **Thực tế:**');
    const materials = findLineValue(lines, '📦 **VT đã dùng:**') || 'Không có';
    const notes = findLineValue(lines, '📝 **Ghi chú:**');
    const evidenceLinks = parseEvidenceLinks(lines);

    const palette = isDark
      ? {
          cardBg: isMine ? '#0c4a6e33' : '#1e1b4b99',
          cardBorder: isMine ? '#22d3ee44' : '#6366f144',
          headerBg: '#1e3a8a',
          headerText: '#f8fafc',
          label: '#94a3b8',
          value: '#e2e8f0',
          metric: '#fbbf24',
        }
      : {
          cardBg: isMine ? '#e0f2fe' : '#f8fafc',
          cardBorder: isMine ? '#0284c755' : '#e2e8f0',
          headerBg: '#1e3a8a',
          headerText: '#ffffff',
          label: '#64748b',
          value: '#0f172a',
          metric: '#c2410c',
        };

    return (
      <View
        style={[
          completionStyles.wrap,
          {
            backgroundColor: palette.cardBg,
            borderColor: palette.cardBorder,
          },
        ]}
      >
        <View
          style={[completionStyles.headerRow, { backgroundColor: palette.headerBg }]}
        >
          <Text style={[completionStyles.headerEmoji]}>✅</Text>
          <Text style={[completionStyles.headerTitle, { color: palette.headerText }]}>
            BÁO CÁO HOÀN THÀNH
          </Text>
        </View>

        <View style={completionStyles.body}>
          <Field
            label="Công việc"
            value={taskName || '—'}
            valueBold
            palette={palette}
          />
          <View style={completionStyles.row2}>
            <View style={completionStyles.half}>
              <Field
                label="Người thực hiện"
                value={assignee || '—'}
                palette={palette}
              />
            </View>
            <View style={completionStyles.half}>
              <Field
                label="Dự án/Mảng"
                value={project || '—'}
                palette={palette}
              />
            </View>
          </View>
          <Field
            label="Chỉ số thực tế"
            value={actuals || '—'}
            valueStyle={{ color: palette.metric, fontWeight: '700' }}
            palette={palette}
          />
          <Field
            label="Vật tư đã dùng"
            value={materials}
            italic
            palette={palette}
          />
          {notes ? (
            <Field
              label="Ghi chú"
              value={notes}
              italic
              palette={palette}
              borderTop
            />
          ) : null}

          {evidenceLinks.length > 0 ? (
            <View style={completionStyles.evidenceBlock}>
              <Text style={[completionStyles.evidenceHeading, { color: palette.label }]}>
                MINH CHỨNG ({evidenceLinks.length})
              </Text>
              <View style={completionStyles.thumbGrid}>
                {evidenceLinks.map((link, i) => {
                  const thumb = googleDriveThumbUrl(link);
                  if (!thumb) return null;
                  return (
                    <TouchableOpacity
                      key={`${i}-${link}`}
                      activeOpacity={0.85}
                      onPress={() => void Linking.openURL(link)}
                      style={completionStyles.thumbCell}
                    >
                      <Image
                        source={{ uri: thumb }}
                        style={completionStyles.thumbImg}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                      <View style={completionStyles.thumbOverlay}>
                        <Text style={completionStyles.thumbCta}>Xem ảnh ›</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={completionStyles.linkRow}>
                {evidenceLinks.map((link, i) => (
                  <TouchableOpacity
                    key={`lnk-${i}`}
                    onPress={() => void Linking.openURL(link)}
                    style={[
                      completionStyles.linkPill,
                      {
                        borderColor: isDark ? '#6366f188' : '#6366f155',
                        backgroundColor: isDark ? '#312e8144' : '#eef2ff',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '600',
                        color: isDark ? '#a5b4fc' : '#4338ca',
                      }}
                    >
                      🔗 Link {i + 1}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  if (isErpAssignmentMessage(displayBody)) {
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
    while (
      metaEnd < lines.length &&
      /^(🕐|📦|📂|📅)/.test(lines[metaEnd]?.trim() ?? '')
    ) {
      metaEnd += 1;
    }
    while (metaEnd < lines.length && !lines[metaEnd]?.trim()) {
      metaEnd += 1;
    }
    const hintIdx = lines.findIndex((l) => l.includes('👉'));
    const descEnd = hintIdx >= 0 ? hintIdx : lines.length;
    const description =
      lines
        .slice(metaEnd, descEnd)
        .join('\n')
        .trim()
        .replace(/\*+/g, '') || '—';
    const footerLine =
      lines.find((l) => l.includes('👉'))?.replace(/\*+/g, '') || '';

    const palette = isDark
      ? {
          cardBg: isMine ? '#0f172a88' : '#1e1b4b99',
          border: isMine ? '#38bdf844' : '#818cf844',
          headerAccent: '#0ea5e9',
          label: '#94a3b8',
          value: '#e2e8f0',
          desc: '#cbd5e1',
          footer: '#94a3b8',
        }
      : {
          cardBg: isMine ? '#dbeafe' : '#ffffff',
          border: isMine ? '#2563eb55' : '#c7d2fe',
          headerAccent: '#1d4ed8',
          label: '#64748b',
          value: '#0f172a',
          desc: '#334155',
          footer: '#64748b',
        };

    return (
      <View
        style={[
          assignStyles.wrap,
          {
            backgroundColor: palette.cardBg,
            borderColor: palette.border,
          },
        ]}
      >
        <View style={assignStyles.headerBar}>
          <Text style={[assignStyles.headerTitle, { color: palette.headerAccent }]}>
            📋 PHÂN CÔNG CÔNG VIỆC
          </Text>
        </View>
        <View style={assignStyles.body}>
          <Field
            label="Người nhận"
            value={assigneeLine || '—'}
            valueBold
            palette={{
              label: palette.label,
              value: palette.value,
            }}
          />
          {giaoLuc ? (
            <Field
              label="Giao lúc"
              value={giaoLuc}
              palette={{ label: palette.label, value: palette.value }}
            />
          ) : null}
          {duAn ? (
            <Field
              label="Dự án / Mảng"
              value={duAn}
              palette={{ label: palette.label, value: palette.value }}
            />
          ) : null}
          {deadline ? (
            <Field
              label="Deadline"
              value={deadline}
              palette={{ label: palette.label, value: palette.value }}
            />
          ) : null}
          <View style={assignStyles.descBox}>
            <Text style={[assignStyles.descText, { color: palette.desc }]}>
              {description}
            </Text>
          </View>
          {footerLine ? (
            <Text style={[assignStyles.footer, { color: palette.footer }]}>
              {footerLine}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  return null;
}

function Field({
  label,
  value,
  valueBold,
  italic,
  borderTop,
  valueStyle,
  palette,
}: {
  label: string;
  value: string;
  valueBold?: boolean;
  italic?: boolean;
  borderTop?: boolean;
  valueStyle?: object;
  palette: { label: string; value: string };
}) {
  return (
    <View style={[fieldStyles.block, borderTop ? fieldStyles.borderTop : null]}>
      <Text style={[fieldStyles.label, { color: palette.label }]}>{label}</Text>
      <Text
        style={[
          fieldStyles.value,
          { color: palette.value },
          valueBold ? { fontWeight: '700' } : null,
          italic ? { fontStyle: 'italic' } : null,
          valueStyle,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  block: { marginBottom: 8 },
  borderTop: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#64748b33',
    paddingTop: 8,
    marginTop: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  value: { fontSize: 14, lineHeight: 20 },
});

const completionStyles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    maxWidth: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerEmoji: { fontSize: 18 },
  headerTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  body: { padding: 12 },
  row2: { flexDirection: 'row', gap: 8, marginTop: 4 },
  half: { flex: 1, minWidth: 0 },
  evidenceBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#64748b44',
  },
  evidenceHeading: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  thumbGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  thumbCell: {
    width: '47%',
    aspectRatio: 16 / 9,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#0f172a33',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000033',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbCta: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#0f172acc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  linkPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
});

const assignStyles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    maxWidth: '100%',
  },
  headerBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#64748b33',
  },
  headerTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  body: { padding: 12 },
  descBox: { marginTop: 8 },
  descText: { fontSize: 14, lineHeight: 21 },
  footer: { fontSize: 12, fontStyle: 'italic', marginTop: 10 },
});
