import type { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import {
  detectTaskReportKind,
  formatQaqcBatchTaskLine,
  formatWorkerNamesList,
  getSharedGroupNotes,
  parseFactoryReport,
  parseGenericTaskReport,
  parsePtkReport,
  parseQaqcBatchReport,
  parseQlpxNewReport,
  getTaskReportHeader,
} from '@/features/chat/taskReportParsers';
import { getErpMessengerCardPalette } from '@/features/chat/erpCardTheme';
import { ErpCardField, ErpGrid2 } from '@/components/chat/erp/ErpCardPrimitives';
import { ErpEvidenceGrid } from '@/components/chat/erp/ErpEvidenceGrid';

type Props = {
  body: string;
  isMine: boolean;
  isDark: boolean;
  onImagePress?: (attachment: any, url: string) => void;
};

function CardShell({
  icon,
  title,
  subtitle,
  isMine,
  isDark,
  variant,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  isMine: boolean;
  isDark: boolean;
  variant: 'cyan' | 'sky' | 'emerald' | 'orange' | 'amber' | 'indigo' | 'violet';
  children: ReactNode;
}) {
  const palette = getErpMessengerCardPalette(isMine, variant);
  return (
    <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
      <View style={[styles.header, { borderBottomWidth: 1, borderBottomColor: palette.tableBorder }]}>
        <Text style={styles.headerIcon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: palette.accent }]}>{title}</Text>
          {subtitle ? <Text style={[styles.headerSub, { color: palette.textMuted }]}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

function QlpxNewCard({ body, isMine, isDark, onImagePress }: Props) {
  const data = parseQlpxNewReport(body);
  const isPaused =
    body.includes('BÁO CÁO QLPX TẠM DỪNG') ||
    body.includes('BÁO CÁO TẠM DỪNG') ||
    /^8\s*-\s*\*\*Ghi chú\*\*:\s*Tạm dừng/im.test(body);
  const palette = getErpMessengerCardPalette(isMine, isPaused ? 'amber' : 'cyan');
  return (
    <CardShell
      icon={isPaused ? '⏸️' : '🏭'}
      title={isPaused ? 'Báo cáo QLPX — Tạm dừng' : 'Báo cáo QLPX'}
      isMine={isMine}
      isDark={isDark}
      variant={isPaused ? 'amber' : 'cyan'}
    >
      <ErpCardField label="1 - Dự án" value={data.project} palette={palette} valueBold />
      {data.treeLines.length > 0 ? (
        <View style={[styles.treeBox, { borderColor: palette.tableBorder }]}>
          <Text style={[styles.sectionLabel, { color: palette.label }]}>2 - Đầu mục công việc</Text>
          {data.treeLines.map((line, idx) => (
            <View key={idx} style={{ flexDirection: 'row', marginLeft: line.indent * 14, marginTop: 4 }}>
              <Text style={{ color: '#22d3eeaa', marginRight: 4 }}>├─</Text>
              <Text style={{ color: '#67e8f9', fontSize: 12, flex: 1 }}>{line.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <ErpGrid2
        palette={palette}
        left={{ label: '3 - Giờ KH', value: data.plannedHours, accent: '#fbbf24' }}
        right={{ label: 'Giờ TT', value: data.actualHours, accent: '#fbbf24' }}
      />
      <View style={[styles.grid3, { borderColor: palette.tableBorder }]}>
        <ErpCardField label="Ngày bắt đầu" value={data.startDate} palette={palette} />
        <ErpCardField label="Giờ bắt đầu" value={data.startTime} palette={palette} />
        <ErpCardField label="Giờ kết thúc" value={data.endTime} palette={palette} />
      </View>
      <ErpCardField label="5 - Khối lượng TH" value={data.actualQty} palette={palette} valueBold valueColor="#34d399" />
      <ErpGrid2
        palette={palette}
        left={{ label: '6 - VT đã dùng', value: data.materialsUsed }}
        right={{ label: 'VT kế hoạch', value: data.materialsPlanned }}
      />
      <ErpCardField
        label="7 - Người thực hiện"
        value={data.workers ? `${data.reportedBy} (Thợ: ${data.workers})` : data.reportedBy}
        palette={palette}
      />
      <ErpCardField label="8 - Ghi chú" value={data.notes} palette={palette} italic />
      <ErpEvidenceGrid links={data.evidenceLinks} palette={palette} columns={1} onImagePress={onImagePress} />
    </CardShell>
  );
}

function QaqcBatchCard({ body, isMine, isDark, onImagePress }: Props) {
  const data = parseQaqcBatchReport(body);
  const palette = getErpMessengerCardPalette(isMine, 'indigo');
  return (
    <CardShell
      icon="🗓️"
      title="Báo cáo kế hoạch ngày"
      subtitle={data.dateStr}
      isMine={isMine}
      isDark={isDark}
      variant="indigo"
    >
      <ErpGrid2
        palette={palette}
        left={{ label: 'Người báo cáo', value: data.reporter }}
        right={{ label: 'Dự án/Mảng', value: data.project }}
      />
      {data.crewBlocks.length > 0 ? (
        <View>
          <Text style={[styles.sectionLabel, { color: palette.label }]}>DANH SÁCH TỔ</Text>
          {data.crewBlocks.map((block, bi) => (
            <View
              key={bi}
              style={[styles.crewBlock, { backgroundColor: isMine ? '#0c4a6e44' : '#312e8144' }]}
            >
              {block.workerGroups.map((group, gi) => {
                const sharedNotes = getSharedGroupNotes(group.items);
                return (
                <View key={gi} style={gi > 0 ? styles.crewGroupDivider : undefined}>
                  <Text style={[styles.crewTitle, { color: isMine ? '#67e8f9' : '#a5b4fc' }]}>
                    {group.workerNames
                      ? `Tổ ${block.crew} - ${group.workerCount} thợ: ${formatWorkerNamesList(group.workerNames)}`
                      : `Tổ ${block.crew}`}
                  </Text>
                  {group.items.map((item, ii) => (
                    <Text key={ii} style={[styles.crewItem, { color: palette.tableRowText }]}>
                      {formatQaqcBatchTaskLine(item, { includeNotes: !sharedNotes })}
                    </Text>
                  ))}
                  {sharedNotes ? (
                    <Text style={[styles.crewSharedNotes, { color: palette.textMuted }]}>
                      GC: {sharedNotes}
                    </Text>
                  ) : null}
                </View>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}
      <ErpEvidenceGrid links={data.evidenceLinks} palette={palette} columns={2} onImagePress={onImagePress} />
    </CardShell>
  );
}

function FactoryCard({ body, isMine, isDark, onImagePress }: Props) {
  const data = parseFactoryReport(body);
  const palette = getErpMessengerCardPalette(isMine, data.isPaused ? 'amber' : 'cyan');
  const title = data.isPaused ? 'BÁO CÁO TẠM DỪNG NHÀ MÁY' : 'BÁO CÁO HOÀN THÀNH NHÀ MÁY';
  const icon = data.isPaused ? '⚠️' : '✅';
  return (
    <CardShell icon={icon} title={title} isMine={isMine} isDark={isDark} variant={data.isPaused ? 'amber' : 'cyan'}>
      <ErpCardField label="Công việc" value={data.taskName || '—'} palette={palette} valueBold />
      <ErpGrid2
        palette={palette}
        left={{ label: 'Người thực hiện', value: data.assignee || '—' }}
        right={{ label: 'Dự án/Mảng', value: data.project || '—' }}
      />
      <ErpCardField
        label={data.isPaused ? 'Thời gian dừng' : 'Chỉ số thực tế'}
        value={data.actuals || '—'}
        palette={palette}
        valueBold
        valueColor="#fbbf24"
      />
      <ErpCardField label="Vật tư đã dùng" value={data.materials} palette={palette} italic />
      {data.notes ? (
        <ErpCardField
          label={data.isPaused ? 'Lý do tạm dừng' : 'Ghi chú'}
          value={data.notes}
          palette={palette}
          italic
          borderTop
        />
      ) : null}
      <ErpEvidenceGrid links={data.evidenceLinks} palette={palette} onImagePress={onImagePress} />
    </CardShell>
  );
}

function GenericTaskCard({ body, isMine, isDark, onImagePress }: Props) {
  const data = parseGenericTaskReport(body);
  const header = getTaskReportHeader('generic', data);
  const palette = getErpMessengerCardPalette(isMine, header.variant);
  return (
    <CardShell
      icon={header.icon}
      title={header.title}
      subtitle={data.dateReport}
      isMine={isMine}
      isDark={isDark}
      variant={header.variant}
    >
      {data.category ? <ErpCardField label="Đầu mục công việc" value={data.category} palette={palette} valueColor="#67e8f9" /> : null}
      <ErpCardField label="Công việc" value={data.taskName} palette={palette} valueBold />
      <ErpGrid2
        palette={palette}
        left={{ label: 'Người thực hiện', value: data.assignee }}
        right={{ label: 'Dự án/Mảng', value: data.project }}
      />
      {data.dateReport ? (
        <ErpCardField label="Ngày BĐ thực tế" value={data.dateReport} palette={palette} valueColor="#38bdf8" valueBold />
      ) : null}
      {data.workHours && data.workHours !== 'N/A' ? (
        <ErpGrid2
          palette={palette}
          left={{ label: 'Giờ công', value: data.workHours, accent: '#fbbf24' }}
          right={{ label: 'Số lượng CN', value: data.workersCount, accent: '#fbbf24' }}
        />
      ) : null}
      {data.workers ? <ErpCardField label="Thợ / Nhân sự" value={data.workers} palette={palette} valueColor="#fbbf24" valueBold /> : null}
      {(data.startTime || data.endTime || data.totalTime) ? (
        <View style={[styles.grid3, { borderColor: palette.tableBorder }]}>
          <ErpCardField label="Bắt đầu" value={data.startTime} palette={palette} />
          <ErpCardField label="Kết thúc" value={data.endTime} palette={palette} />
          <ErpCardField label="Tổng giờ" value={data.totalTime} palette={palette} valueColor="#fbbf24" />
        </View>
      ) : null}
      {(data.crewCode || data.status || data.spanDays) ? (
        <ErpGrid2
          palette={palette}
          left={{ label: 'Mã tổ', value: data.crewCode, accent: '#818cf8' }}
          right={{ label: 'Trạng thái', value: data.status, accent: '#38bdf8' }}
        />
      ) : null}
      {data.spanDays ? <ErpCardField label="Làm lấn ngày" value={data.spanDays} palette={palette} valueColor="#fbbf24" /> : null}
      {(data.plannedQty || data.qty) ? (
        <ErpGrid2
          palette={palette}
          left={{ label: 'KL Kế hoạch', value: data.plannedQty }}
          right={{ label: 'KL Thực hiện', value: data.qty, accent: '#34d399' }}
        />
      ) : null}
      {!data.isQaqc ? (
        <>
          <ErpCardField label="Vật tư đã dùng" value={data.materials} palette={palette} italic />
          {data.materialTotal ? (
            <ErpCardField label="Tổng VT lũy kế" value={data.materialTotal} palette={palette} italic />
          ) : null}
        </>
      ) : null}
      {data.notes ? (
        <ErpCardField
          label={data.isPaused ? 'Lý do' : 'Ghi chú'}
          value={data.notes}
          palette={palette}
          italic
          borderTop
        />
      ) : null}
      <ErpEvidenceGrid links={data.evidenceLinks} palette={palette} columns={data.isQaqc ? 1 : 2} onImagePress={onImagePress} />
    </CardShell>
  );
}

function PtkReportCard({ body, isMine, isDark, onImagePress }: Props) {
  const data = parsePtkReport(body);
  const palette = getErpMessengerCardPalette(isMine, 'violet');

  return (
    <CardShell
      icon={data.icon}
      title={data.title}
      subtitle={data.dateReport}
      isMine={isMine}
      isDark={isDark}
      variant='violet'
    >
      <ErpCardField label='Công việc' value={data.taskName} palette={palette} valueBold />
      <ErpCardField label='Hạng mục' value={data.category} palette={palette} valueColor='#fbbf24' />
      <ErpCardField label='Dự án' value={data.project} palette={palette} />
      <ErpCardField label='Người thực hiện' value={data.assignee} palette={palette} />
      {(data.startTime || data.endTime) ? (
        <ErpGrid2
          palette={palette}
          left={{ label: 'Bắt đầu', value: data.startTime, accent: '#fbbf24' }}
          right={{ label: 'Kết thúc', value: data.endTime, accent: '#fbbf24' }}
        />
      ) : null}
      <ErpGrid2
        palette={palette}
        left={{ label: 'Tiến độ', value: data.progress, accent: '#34d399' }}
        right={{ label: 'Trạng thái', value: data.workStatus, accent: '#e879f9' }}
      />
      {data.notes && data.notes !== 'Không có' ? (
        <ErpCardField
          label={data.isPause ? 'Ghi chú' : 'Ghi chú'}
          value={data.notes}
          palette={palette}
          italic
          borderTop
        />
      ) : null}
      <ErpEvidenceGrid links={data.evidenceLinks} palette={palette} columns={1} onImagePress={onImagePress} />
    </CardShell>
  );
}

export function ErpTaskReportCard({ body, isMine, isDark, onImagePress }: Props) {
  const kind = detectTaskReportKind(body);
  if (!kind) return null;
  if (kind === 'qlpx_new') return <QlpxNewCard body={body} isMine={isMine} isDark={isDark} onImagePress={onImagePress} />;
  if (kind === 'qaqc_batch') return <QaqcBatchCard body={body} isMine={isMine} isDark={isDark} onImagePress={onImagePress} />;
  if (kind === 'factory_completion' || kind === 'factory_pause') {
    return <FactoryCard body={body} isMine={isMine} isDark={isDark} onImagePress={onImagePress} />;
  }
  if (kind === 'ptk') return <PtkReportCard body={body} isMine={isMine} isDark={isDark} onImagePress={onImagePress} />;
  return <GenericTaskCard body={body} isMine={isMine} isDark={isDark} onImagePress={onImagePress} />;
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, overflow: 'hidden', maxWidth: '100%', minWidth: 260, alignSelf: 'stretch' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerIcon: { fontSize: 18 },
  headerTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  headerSub: { fontSize: 10, marginTop: 2 },
  body: { padding: 12 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, marginBottom: 6, textTransform: 'uppercase' },
  treeBox: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8, backgroundColor: '#00000022' },
  grid3: {
    flexDirection: 'row',
    gap: 6,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  crewBlock: { borderRadius: 8, padding: 10, marginBottom: 8 },
  crewGroupDivider: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#33415566' },
  crewTitle: { fontSize: 12, fontWeight: '800', marginBottom: 6 },
  crewItem: { fontSize: 12, lineHeight: 18, marginBottom: 2 },
  crewSharedNotes: { fontSize: 12, lineHeight: 18, fontStyle: 'italic', marginTop: 4 },
});
