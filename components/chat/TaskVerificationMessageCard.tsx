import { View, Text, StyleSheet } from 'react-native';
import {
  parseTaskVerificationMessage,
  type TaskVerificationData,
  type TaskVerificationKind,
} from '@/features/chat/taskVerificationParsers';

type Props = {
  body: string;
  isMine: boolean;
};

const THEME: Record<
  TaskVerificationKind,
  {
    emoji: string;
    title: string;
    badge: string;
    cardBg: string;
    border: string;
    header: string;
    badgeBg: string;
    badgeText: string;
    accent: string;
  }
> = {
  request: {
    emoji: '🔔',
    title: 'Đề nghị nghiệm thu',
    badge: 'CHỜ KIỂM TRA',
    cardBg: '#2a1f0aee',
    border: '#f59e0b88',
    header: '#fcd34d',
    badgeBg: '#f59e0b22',
    badgeText: '#fde68a',
    accent: '#fbbf24',
  },
  verified: {
    emoji: '✅',
    title: 'Đã nghiệm thu',
    badge: 'HOÀN THÀNH',
    cardBg: '#062016ee',
    border: '#10b98188',
    header: '#6ee7b7',
    badgeBg: '#10b98122',
    badgeText: '#a7f3d0',
    accent: '#34d399',
  },
  rejected: {
    emoji: '❌',
    title: 'Không nghiệm thu',
    badge: 'CẦN LÀM LẠI',
    cardBg: '#2a0a0aee',
    border: '#ef444488',
    header: '#fca5a5',
    badgeBg: '#ef444422',
    badgeText: '#fecaca',
    accent: '#f87171',
  },
};

function buildSummary(data: TaskVerificationData): string {
  if (data.kind === 'request') {
    if (data.isBugReport) {
      return data.isReminder
        ? `Nhắc lại @${data.mentionUsername ?? 'người báo'} vào test và nghiệm thu bug này giúp.`
        : `Đề nghị @${data.mentionUsername ?? 'người báo'} vào test và nghiệm thu bug này giúp.`;
    }
    return `Đề nghị @${data.mentionUsername ?? 'người giao việc'} kiểm tra và nghiệm thu.`;
  }

  if (data.kind === 'verified') {
    if (data.isBugReport) {
      return `Đã nghiệm thu lỗi. Cảm ơn @${data.mentionUsername ?? 'bạn'}!`;
    }
    return `Cảm ơn @${data.mentionUsername ?? 'bạn'}!`;
  }

  if (data.isBugReport) {
    return `Lỗi chưa đạt. @${data.mentionUsername ?? 'bạn'} vui lòng xem xét và fix lại.`;
  }

  return `@${data.mentionUsername ?? 'bạn'} vui lòng xem xét và làm lại.`;
}

export function TaskVerificationMessageCard({ body, isMine }: Props) {
  const data = parseTaskVerificationMessage(body);
  if (!data) return null;

  const theme = THEME[data.kind];
  const summary = buildSummary(data);
  const title = data.kind === 'request' && data.isReminder
    ? 'Nhắc lại đề nghị nghiệm thu'
    : theme.title;

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: theme.cardBg,
          borderColor: theme.border,
          shadowColor: theme.accent,
        },
        isMine ? styles.wrapMine : null,
      ]}
    >
      <View style={[styles.accentBar, { backgroundColor: theme.accent }]} />
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.emoji}>{theme.emoji}</Text>
            <View>
              <Text style={[styles.title, { color: theme.header }]}>{title}</Text>
              <Text style={styles.subtitle}>
                {data.isBugReport ? 'Bug report' : 'Task nghiệm thu'}
              </Text>
            </View>
          </View>
          <View style={[styles.badge, { backgroundColor: theme.badgeBg, borderColor: theme.border }]}>
            <Text style={[styles.badgeText, { color: theme.badgeText }]}>{theme.badge}</Text>
          </View>
        </View>

        {data.taskId ? (
          <View style={styles.taskBlock}>
            <Text style={styles.label}>{data.isBugReport ? 'Mã lỗi' : 'Task'}</Text>
            <Text style={styles.taskValue}>
              #{data.taskId}
              {data.taskTitle ? ` — ${data.taskTitle}` : ''}
            </Text>
          </View>
        ) : null}

        {data.isBugReport && data.kind === 'request' && (data.pageUrl || data.actorName) ? (
          <View style={[styles.detailsBlock, { borderColor: theme.border }]}>
            {data.pageUrl ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>📍 Trang:</Text>
                <Text style={styles.detailValue} numberOfLines={2}>{data.pageUrl}</Text>
              </View>
            ) : null}
            {data.actorName ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>🧑‍💻 IT xử lý:</Text>
                <Text style={styles.detailValue}>{data.actorName}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.summary}>{summary}</Text>

        {data.kind === 'rejected' && data.rejectionReason ? (
          <View style={styles.reasonBox}>
            <Text style={styles.reasonLabel}>Lý do</Text>
            <Text style={styles.reasonText}>{data.rejectionReason}</Text>
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
    overflow: 'hidden',
    maxWidth: '100%',
    minWidth: 260,
    alignSelf: 'stretch',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
  },
  wrapMine: {
    alignSelf: 'flex-end',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  content: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingLeft: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff18',
    paddingBottom: 10,
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  emoji: {
    fontSize: 22,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  taskBlock: {
    marginBottom: 8,
  },
  detailsBlock: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    backgroundColor: '#00000022',
    marginBottom: 8,
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  detailLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
    width: 75,
  },
  detailValue: {
    fontSize: 12,
    color: '#f8fafc',
    flex: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  taskValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
    lineHeight: 20,
  },
  summary: {
    fontSize: 14,
    lineHeight: 21,
    color: '#e2e8f0',
  },
  reasonBox: {
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef444455',
    backgroundColor: '#450a0a66',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reasonLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fca5a5',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#fecaca',
  },
});
