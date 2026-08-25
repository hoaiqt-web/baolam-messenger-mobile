import { useState } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import {
  parsePendingReceiptDigestMessage,
  type PendingReceiptProjectGroup,
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

function projectSlipCount(project: PendingReceiptProjectGroup): number {
  return project.rows.reduce((sum, row) => sum + row.count, 0);
}

function ProjectAccordion({
  project,
  index,
}: {
  project: PendingReceiptProjectGroup;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const total = projectSlipCount(project);

  return (
    <View style={styles.projectBlock}>
      <Pressable onPress={() => setOpen((value) => !value)} style={styles.projectHeader}>
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.projectCode}>
            {index + 1}. {project.projectCode}
          </Text>
          {project.projectName ? (
            <Text style={styles.projectName}>{project.projectName}</Text>
          ) : null}
        </View>
        <Text style={styles.projectTotal}>{total} phiếu đang chờ</Text>
      </Pressable>

      {open
        ? project.rows.map((row, rowIndex) => {
            const colors = ROLE_COLORS[row.role];
            return (
              <View
                key={`${row.role}-${row.personName}-${rowIndex}`}
                style={styles.personRow}
              >
                <View style={[styles.roleBadge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                  <Text style={[styles.roleText, { color: colors.text }]}>{row.role}</Text>
                </View>
                <Text style={styles.personName}>{row.personName}</Text>
                <Text style={styles.count}>{row.count}</Text>
              </View>
            );
          })
        : null}
    </View>
  );
}

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
        data.projects.map((project, index) => (
          <ProjectAccordion
            key={`${project.projectCode}-${index}`}
            project={project}
            index={index}
          />
        ))
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
    borderColor: '#64748b',
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
    borderBottomWidth: 2,
    borderBottomColor: '#64748b',
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
  projectBlock: {
    borderBottomWidth: 2,
    borderBottomColor: '#64748b',
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chevron: {
    color: '#fcd34d',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 1,
    width: 14,
  },
  projectCode: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  projectName: {
    marginTop: 2,
    color: '#94a3b8',
    fontSize: 12,
  },
  projectTotal: {
    color: '#fde68a',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#475569',
    backgroundColor: '#00000033',
  },
  roleBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  personName: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '500',
  },
  count: {
    color: '#fde68a',
    fontSize: 13,
    fontWeight: '800',
  },
  footer: {
    borderTopWidth: 2,
    borderTopColor: '#64748b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
});
