import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  collectDepartments,
  countByDepartment,
  parseAttendanceHeadcountMessage,
  type AttendanceHeadcountLocation,
} from '@/features/chat/attendanceHeadcountParsers';

type Props = {
  body: string;
  isMine: boolean;
};

function LocationBlock({
  location,
  dateLabel,
}: {
  location: AttendanceHeadcountLocation;
  dateLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const departments = collectDepartments([location]);
  const counts = countByDepartment(location.people);
  const visibleDepts = selectedDept ? departments.filter((dept) => dept === selectedDept) : departments;
  const visiblePeople = selectedDept
    ? location.people.filter((person) => person.department === selectedDept)
    : location.people;
  const showTotal = selectedDept === null;
  const rowTotal = visiblePeople.length;

  return (
    <View style={styles.block}>
      <TouchableOpacity onPress={() => setOpen((value) => !value)} activeOpacity={0.75} style={styles.locationHeading}>
        <Text style={styles.locationHeadingText}>
          {open ? '▾  ' : '▸  '}
          {location.name}
        </Text>
        <Text style={styles.locationCount}>{open ? 'thu gọn' : 'xem tên'} {location.count}</Text>
      </TouchableOpacity>

      {departments.length > 0 ? (
        <View style={styles.chipWrap}>
          <TouchableOpacity
            onPress={() => setSelectedDept(null)}
            style={[styles.chip, selectedDept === null ? styles.chipOn : null]}
          >
            <Text style={[styles.chipText, selectedDept === null ? styles.chipTextOn : null]}>Tất cả</Text>
          </TouchableOpacity>
          {departments.map((dept) => (
            <TouchableOpacity
              key={dept}
              onPress={() => setSelectedDept((current) => (current === dept ? null : dept))}
              style={[styles.chip, selectedDept === dept ? styles.chipOn : null]}
            >
              <Text style={[styles.chipText, selectedDept === dept ? styles.chipTextOn : null]}>{dept}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.location}>
        <View style={styles.stackRow}>
          <Text style={styles.cellMuted}>Ngày</Text>
          <Text style={styles.dateText}>{dateLabel || '—'}</Text>
        </View>
        {visibleDepts.map((dept) => (
          <View key={dept} style={styles.stackRow}>
            <Text style={styles.stackDept}>{dept}</Text>
            <Text style={styles.countText}>{counts[dept] ?? 0}</Text>
          </View>
        ))}
        {showTotal ? (
          <View style={[styles.stackRow, styles.stackTotal]}>
            <Text style={styles.totalHead}>Tổng</Text>
            <Text style={styles.totalText}>{rowTotal}</Text>
          </View>
        ) : null}
      </View>

      {open ? (
        <View style={styles.peopleBox}>
          <Text style={styles.peopleHeading}>
            Danh sách nhân sự · {visiblePeople.length}
          </Text>
          {visiblePeople.length === 0 ? (
            <Text style={styles.empty}>Không có nhân sự.</Text>
          ) : (
            visiblePeople.map((person, index) => (
              <View key={`${person.name}-${index}`} style={styles.personRow}>
                <Text style={styles.personName}>{person.name}</Text>
                <Text style={styles.personDept}>{person.department}</Text>
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

export function AttendanceHeadcountMessageCard({ body, isMine }: Props) {
  const data = parseAttendanceHeadcountMessage(body);
  if (!data) return null;

  return (
    <View style={[styles.wrap, isMine ? styles.wrapMine : null]}>
      <Text style={styles.title}>Báo cáo tình hình nhân sự Bảo Lâm</Text>

      {data.locations.length === 0 ? (
        <Text style={styles.empty}>Không có chấm công.</Text>
      ) : (
        data.locations.map((location) => (
          <LocationBlock key={location.name} location={location} dateLabel={data.dateLabel} />
        ))
      )}

      {data.note ? <Text style={styles.note}>{data.note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: '#475569b3',
    backgroundColor: '#0b1220',
    borderRadius: 12,
    overflow: 'hidden',
    paddingBottom: 10,
  },
  wrapMine: {
    borderColor: '#34d39955',
  },
  title: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    textAlign: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    lineHeight: 16,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    backgroundColor: '#1e293b',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  chipOn: {
    backgroundColor: '#059669',
  },
  chipText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
  },
  chipTextOn: {
    color: '#fff',
  },
  location: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 8,
    overflow: 'hidden',
  },
  peopleBox: {
    borderWidth: 1,
    borderColor: '#065f4655',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#0a1a14',
  },
  peopleHeading: {
    color: '#6ee7b7',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#064e3b66',
  },
  block: {
    marginHorizontal: 10,
    marginTop: 10,
    gap: 8,
  },
  locationHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 2,
  },
  locationHeadingText: {
    flex: 1,
    color: '#fde68a',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  locationCount: {
    color: '#fb7185',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  stackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  stackTotal: {
    backgroundColor: '#4c051955',
  },
  stackDept: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
  },
  cellMuted: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  dateText: {
    color: '#fb7185',
    fontSize: 12,
    fontWeight: '800',
  },
  totalHead: {
    color: '#fecdd3',
    fontSize: 12,
    fontWeight: '800',
  },
  countText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  totalText: {
    color: '#fb7185',
    fontSize: 13,
    fontWeight: '800',
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  personName: {
    flex: 1,
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '600',
  },
  personDept: {
    color: '#64748b',
    fontSize: 11,
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
    lineHeight: 18,
  },
});
