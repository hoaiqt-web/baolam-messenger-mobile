import { View, Text, StyleSheet } from 'react-native';
import {
  parseBugOutstandingDigestMessage,
  type DigestStatusKey,
} from '@/features/chat/bugOutstandingDigestParsers';

type Props = {
  body: string;
  isMine: boolean;
};

const SECTION_COLORS: Record<DigestStatusKey, { title: string; border: string; badgeBg: string }> = {
  VERIFYING: { title: '#fcd34d', border: '#f59e0b55', badgeBg: '#f59e0b22' },
  REJECTED: { title: '#fca5a5', border: '#ef444455', badgeBg: '#ef444422' },
  IN_PROGRESS: { title: '#7dd3fc', border: '#38bdf855', badgeBg: '#38bdf822' },
  PENDING: { title: '#cbd5e1', border: '#94a3b855', badgeBg: '#94a3b822' },
};

const SEV_COLORS: Record<string, string> = {
  CRITICAL: '#f87171',
  HIGH: '#fb923c',
  MEDIUM: '#facc15',
  LOW: '#4ade80',
};

export function BugOutstandingDigestMessageCard({ body, isMine }: Props) {
  const data = parseBugOutstandingDigestMessage(body);
  if (!data) return null;

  return (
    <View style={[styles.wrap, isMine ? styles.wrapMine : null]}>
      <View style={styles.accentBar} />
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Tổng hợp bug tồn đọng</Text>
            <Text style={styles.subtitle}>{data.dateLabel || 'Hàng ngày · 08:00'}</Text>
          </View>
          <View style={styles.totalBadge}>
            <Text style={styles.totalBadgeText}>{data.total} bug</Text>
          </View>
        </View>

        {data.sections.map((section) => {
          const colors = SECTION_COLORS[section.key];
          return (
            <View key={section.key} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.title }]}>{section.title}</Text>
                <View style={[styles.countBadge, { backgroundColor: colors.badgeBg, borderColor: colors.border }]}>
                  <Text style={[styles.countBadgeText, { color: colors.title }]}>{section.count}</Text>
                </View>
              </View>
              {section.items.map((item) => (
                <View key={item.id} style={[styles.item, { borderColor: colors.border }]}>
                  <View style={styles.itemTop}>
                    <Text style={styles.itemId}>#{item.id}</Text>
                    <Text style={[styles.severity, { color: SEV_COLORS[item.severity] || '#facc15' }]}>
                      {item.severity}
                    </Text>
                    {section.key === 'VERIFYING' && item.username ? (
                      <Text style={styles.mention}>@{item.username}</Text>
                    ) : null}
                  </View>
                  {item.issueLabel ? <Text style={styles.issue}>{item.issueLabel}</Text> : null}
                  <Text style={styles.page}>{item.page}</Text>
                  {section.key === 'IN_PROGRESS' && item.assignee ? (
                    <Text style={styles.meta}>IT: {item.assignee}</Text>
                  ) : null}
                  {section.key === 'REJECTED' && item.reason ? (
                    <Text style={styles.reason}>Lý do: {item.reason}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          );
        })}

        {data.footer ? (
          <View style={styles.footer}>
            <Text style={styles.footerText}>{data.footer}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#8b5cf688',
    backgroundColor: '#1e1033ee',
    overflow: 'hidden',
    maxWidth: '100%',
    minWidth: 260,
    alignSelf: 'stretch',
  },
  wrapMine: { alignSelf: 'flex-end' },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: '#a78bfa',
  },
  content: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingLeft: 16,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff18',
    paddingBottom: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ddd6fe',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  subtitle: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  totalBadge: {
    borderWidth: 1,
    borderColor: '#a78bfa66',
    backgroundColor: '#8b5cf622',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  totalBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ddd6fe',
  },
  section: { gap: 6 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  countBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  countBadgeText: { fontSize: 10, fontWeight: '800' },
  item: {
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: '#00000040',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  itemId: { fontSize: 12, fontWeight: '800', color: '#f8fafc', fontVariant: ['tabular-nums'] },
  severity: { fontSize: 10, fontWeight: '800' },
  mention: { fontSize: 11, fontWeight: '700', color: '#67e8f9' },
  issue: { fontSize: 13, fontWeight: '600', color: '#e2e8f0', marginTop: 2 },
  page: { fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' },
  meta: { fontSize: 11, color: '#7dd3fc', marginTop: 2 },
  reason: { fontSize: 11, color: '#fecaca', marginTop: 2 },
  footer: {
    borderWidth: 1,
    borderColor: '#a78bfa44',
    backgroundColor: '#8b5cf618',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  footerText: { fontSize: 13, lineHeight: 19, color: '#ede9fe' },
});
