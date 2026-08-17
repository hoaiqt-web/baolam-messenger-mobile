import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import {
  parseAttendanceHeadcountMessage,
  type AttendanceHeadcountLocation,
} from '@/features/chat/attendanceHeadcountParsers';

type Props = {
  body: string;
  isMine: boolean;
};

function LocationBlock({ location }: { location: AttendanceHeadcountLocation }) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.location}>
      <TouchableOpacity
        onPress={() => setOpen((value) => !value)}
        style={styles.locationHeader}
        activeOpacity={0.75}
      >
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
        <Text style={styles.locationName} numberOfLines={1}>
          {location.name}
        </Text>
        <Text style={styles.hint}>{open ? 'Thu gọn' : 'Xem danh sách'}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{location.count}</Text>
        </View>
      </TouchableOpacity>

      {open ? (
        location.people.length === 0 ? (
          <Text style={styles.empty}>Không có nhân sự.</Text>
        ) : (
          <View>
            <View style={styles.tableHead}>
              <Text style={[styles.tableHeadText, { flex: 1 }]}>Họ tên</Text>
              <Text style={[styles.tableHeadText, { flex: 1 }]}>Bộ phận</Text>
            </View>
            <ScrollView style={styles.peopleScroll} nestedScrollEnabled>
              {location.people.map((person, index) => (
                <View key={`${person.name}-${index}`} style={styles.personRow}>
                  <Text style={styles.personName} numberOfLines={1}>
                    {person.name}
                  </Text>
                  <Text style={styles.personDept} numberOfLines={1}>
                    {person.department}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )
      ) : null}
    </View>
  );
}

export function AttendanceHeadcountMessageCard({ body, isMine }: Props) {
  const data = parseAttendanceHeadcountMessage(body);
  if (!data) return null;

  return (
    <View style={[styles.wrap, isMine ? styles.wrapMine : null]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Báo cáo tình hình nhân sự</Text>
          <Text style={styles.subtitle}>
            Ngày {data.dateLabel || '—'} · bấm địa điểm để xem tên
          </Text>
        </View>
        <View style={styles.totalBadge}>
          <Text style={styles.totalLabel}>Tổng</Text>
          <Text style={styles.totalBadgeText}>{data.total}</Text>
        </View>
      </View>

      {data.locations.length === 0 ? (
        <Text style={styles.empty}>Không có chấm công.</Text>
      ) : (
        data.locations.map((location) => (
          <LocationBlock key={location.name} location={location} />
        ))
      )}

      {data.note ? <Text style={styles.note}>{data.note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: '#34d39940',
    backgroundColor: '#0a1a12',
    borderRadius: 12,
    overflow: 'hidden',
    minWidth: 240,
  },
  wrapMine: {
    borderColor: '#34d39955',
    backgroundColor: '#052e16',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#33415580',
  },
  title: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  subtitle: {
    marginTop: 4,
    color: '#94a3b8',
    fontSize: 11,
  },
  totalBadge: {
    borderWidth: 1,
    borderColor: '#fda4af55',
    backgroundColor: '#4c051955',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  totalLabel: {
    color: '#fecdd3',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  totalBadgeText: {
    color: '#fda4af',
    fontSize: 14,
    fontWeight: '800',
  },
  location: {
    marginHorizontal: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#334155cc',
    borderRadius: 8,
    backgroundColor: '#07140fcc',
    overflow: 'hidden',
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#022c22cc',
  },
  chevron: {
    color: '#6ee7b7',
    fontSize: 14,
    width: 14,
  },
  locationName: {
    flex: 1,
    color: '#d1fae5',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  hint: {
    color: '#6ee7b7aa',
    fontSize: 10,
  },
  countBadge: {
    backgroundColor: '#00000055',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: {
    color: '#fda4af',
    fontSize: 13,
    fontWeight: '800',
  },
  tableHead: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#10261c',
  },
  tableHeadText: {
    color: '#6ee7b7',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  peopleScroll: {
    maxHeight: 240,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  personName: {
    flex: 1,
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '500',
  },
  personDept: {
    flex: 1,
    color: '#94a3b8',
    fontSize: 12,
  },
  empty: {
    color: '#64748b',
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  note: {
    color: '#94a3b8',
    fontSize: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
});
