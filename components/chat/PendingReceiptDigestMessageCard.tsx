import { View, Text, StyleSheet, ScrollView } from 'react-native';
import {
  parsePendingReceiptDigestMessage,
  type PendingReceiptRole,
} from '@/features/chat/pendingReceiptDigestParsers';

type Props = {
  body: string;
  isMine: boolean;
};

const ROLE_COLORS: Record<PendingReceiptRole, { bg: string; text: string; border: string }> = {
  CHT: { bg: '#f59e0b22', text: '#fcd34d', border: '#f59e0b55' },
  CBKT: { bg: '#38bdf822', text: '#7dd3fc', border: '#38bdf855' },
  QLPX: { bg: '#34d39922', text: '#6ee7b7', border: '#34d39955' },
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
        <ScrollView horizontal bounces={false} showsHorizontalScrollIndicator={false}>
          <View style={styles.table}>
            <View style={styles.thead}>
              <Text style={[styles.th, styles.colProject]}>Dự án</Text>
              <Text style={[styles.th, styles.colPerson]}>Người nhận</Text>
              <Text style={[styles.th, styles.colCount]}>Phiếu</Text>
            </View>
            {data.projects.flatMap((project, projectIndex) =>
              project.rows.map((row, rowIndex) => {
                const colors = ROLE_COLORS[row.role];
                return (
                  <View
                    key={`${project.projectCode}-${row.role}-${row.personName}-${rowIndex}`}
                    style={styles.tr}
                  >
                    <View style={styles.colProject}>
                      {rowIndex === 0 ? (
                        <>
                          <Text style={styles.projectCode}>
                            {projectIndex + 1}. {project.projectCode}
                          </Text>
                          {project.projectName ? (
                            <Text style={styles.projectName} numberOfLines={2}>
                              {project.projectName}
                            </Text>
                          ) : null}
                        </>
                      ) : null}
                    </View>
                    <View style={styles.colPerson}>
                      <View
                        style={[
                          styles.roleBadge,
                          { backgroundColor: colors.bg, borderColor: colors.border },
                        ]}
                      >
                        <Text style={[styles.roleText, { color: colors.text }]}>{row.role}</Text>
                      </View>
                      <Text style={styles.personName}>{row.personName}</Text>
                    </View>
                    <Text style={[styles.count, styles.colCount]}>{row.count}</Text>
                  </View>
                );
              }),
            )}
            <View style={styles.tfoot}>
              <Text style={[styles.footLabel, styles.colProject]}>Tổng</Text>
              <Text style={[styles.footLabel, styles.colPerson]}>
                {data.people} người · {data.projects.length} dự án
              </Text>
              <Text style={[styles.footCount, styles.colCount]}>{data.total}</Text>
            </View>
          </View>
        </ScrollView>
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
  table: {
    minWidth: 340,
    paddingBottom: 4,
  },
  thead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#0f172a',
  },
  th: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1e293b',
  },
  colProject: { width: 132, paddingRight: 8 },
  colPerson: { flex: 1, paddingRight: 8 },
  colCount: { width: 44, textAlign: 'right' },
  projectCode: {
    color: '#f1f5f9',
    fontSize: 12,
    fontWeight: '700',
  },
  projectName: {
    marginTop: 2,
    color: '#94a3b8',
    fontSize: 11,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginBottom: 4,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  personName: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '500',
  },
  count: {
    color: '#fde68a',
    fontSize: 13,
    fontWeight: '800',
  },
  tfoot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#475569',
    backgroundColor: '#451a0328',
  },
  footLabel: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
  },
  footCount: {
    color: '#fde68a',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
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
