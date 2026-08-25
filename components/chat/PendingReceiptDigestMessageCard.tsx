import { View, Text, StyleSheet } from 'react-native';
import {
  parsePendingReceiptDigestMessage,
  type PendingReceiptRole,
} from '@/features/chat/pendingReceiptDigestParsers';

type Props = {
  body: string;
  isMine: boolean;
};

const ROLE_COLORS: Record<PendingReceiptRole, string> = {
  CHT: '#fcd34d',
  CBKT: '#7dd3fc',
  QLPX: '#6ee7b7',
};

export function PendingReceiptDigestMessageCard({ body, isMine }: Props) {
  const data = parsePendingReceiptDigestMessage(body);
  if (!data) return null;

  return (
    <View style={[styles.wrap, isMine ? styles.wrapMine : null]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Phiếu vật tư chờ nhận</Text>
          <Text style={styles.subtitle}>{data.dateLabel || '08:00 hàng ngày'}</Text>
        </View>
        <View style={styles.totalWrap}>
          <Text style={styles.totalNum}>{data.total} phiếu</Text>
          <Text style={styles.totalLabel}>{data.projects.length} dự án</Text>
        </View>
      </View>

      {data.projects.length === 0 ? (
        <Text style={styles.empty}>Không có phiếu vật tư chờ nhận.</Text>
      ) : (
        <View style={styles.list}>
          {data.projects.map((project, index) => (
            <View key={`${project.projectCode}-${index}`} style={styles.projectBlock}>
              <Text style={styles.projectTitle}>
                {index + 1}. Dự án: {project.projectCode}
                {project.projectName ? ` — ${project.projectName}` : ''}
              </Text>
              {project.rows.map((row, rowIndex) => (
                <Text
                  key={`${row.role}-${row.personName}-${rowIndex}`}
                  style={styles.personLine}
                >
                  <Text style={[styles.role, { color: ROLE_COLORS[row.role] }]}>{row.role}</Text>
                  {` ${row.personName} — `}
                  <Text style={styles.count}>{row.count} phiếu</Text>
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}

      {data.footer ? <Text style={styles.footer}>{data.footer}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginVertical: 4,
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0b1220',
  },
  wrapMine: {
    borderColor: '#065f46',
    backgroundColor: '#071410',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  title: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  subtitle: {
    marginTop: 2,
    color: '#94a3b8',
    fontSize: 11,
  },
  totalWrap: {
    alignItems: 'flex-end',
  },
  totalNum: {
    color: '#fde68a',
    fontSize: 13,
    fontWeight: '800',
  },
  totalLabel: {
    color: '#94a3b8',
    fontSize: 10,
  },
  empty: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#94a3b8',
    fontSize: 13,
  },
  list: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  projectBlock: {
    gap: 2,
  },
  projectTitle: {
    color: '#f1f5f9',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  personLine: {
    color: '#e2e8f0',
    fontSize: 12,
    lineHeight: 18,
  },
  role: {
    fontWeight: '800',
  },
  count: {
    color: '#fde68a',
    fontWeight: '700',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
});
