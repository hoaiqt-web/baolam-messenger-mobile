import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
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
  const rowTotal = visiblePeople.length;

  return (
    <View style={styles.block}>
      <TouchableOpacity onPress={() => setOpen((value) => !value)} activeOpacity={0.75} style={styles.locationHeading}>
        <Text style={styles.locationHeadingText} numberOfLines={1}>
          {open ? '▾  ' : '▸  '}
          {location.name}
        </Text>
        <Text style={styles.locationCount}>{location.count}</Text>
      </TouchableOpacity>

      {departments.length > 0 ? (
        <ScrollView horizontal nestedScrollEnabled contentContainerStyle={styles.chipRowInner}>
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
        </ScrollView>
      ) : null}

      <View style={styles.location}>
        <ScrollView horizontal nestedScrollEnabled>
          <View>
            <View style={styles.tableRow}>
              <View style={[styles.cell, styles.stickyCell]}>
                <Text style={styles.cellMuted}>Ngày</Text>
                <Text style={styles.dateText}>{dateLabel || '—'}</Text>
              </View>
              {visibleDepts.map((dept) => (
                <View key={dept} style={styles.cell}>
                  <Text style={styles.deptHead} numberOfLines={2}>
                    {dept}
                  </Text>
                </View>
              ))}
              <View style={styles.cell}>
                <Text style={styles.totalHead}>Tổng</Text>
              </View>
            </View>
            <View style={styles.tableRow}>
              <View style={[styles.cell, styles.stickyCell]}>
                <Text style={styles.rowLabel}>Nhân sự làm việc</Text>
              </View>
              {visibleDepts.map((dept) => (
                <View key={dept} style={styles.cell}>
                  <Text style={styles.countText}>{counts[dept] ?? 0}</Text>
                </View>
              ))}
              <View style={styles.cell}>
                <Text style={styles.totalText}>{rowTotal}</Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {open ? (
          visiblePeople.length === 0 ? (
            <Text style={styles.empty}>Không có nhân sự.</Text>
          ) : (
            visiblePeople.map((person, index) => (
              <View key={`${person.name}-${index}`} style={styles.personRow}>
                <Text style={styles.personName} numberOfLines={1}>
                  {person.name}
                </Text>
                <Text style={styles.personDept} numberOfLines={1}>
                  {person.department}
                </Text>
              </View>
            ))
          )
        ) : null}
      </View>
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
    borderWidth: 1,
    borderColor: '#475569b3',
    backgroundColor: '#0b1220',
    borderRadius: 12,
    overflow: 'hidden',
    minWidth: 260,
    paddingBottom: 10,
  },
  wrapMine: {
    borderColor: '#34d39955',
  },
  title: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    textAlign: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipRow: {
    maxHeight: 40,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  chipRowInner: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    backgroundColor: '#1e293b',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
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
  block: {
    marginHorizontal: 10,
    marginTop: 10,
    gap: 8,
  },
  locationHeading: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontSize: 13,
    fontWeight: '800',
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  cell: {
    minWidth: 72,
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: '#334155',
    justifyContent: 'center',
  },
  stickyCell: {
    minWidth: 92,
    backgroundColor: '#111827',
  },
  cellMuted: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  dateText: {
    color: '#fb7185',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  deptHead: {
    color: '#d1fae5',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  totalHead: {
    color: '#fecdd3',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  rowLabel: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '600',
  },
  countText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  totalText: {
    color: '#fb7185',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  personRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  personName: {
    flex: 1,
    color: '#f1f5f9',
    fontSize: 13,
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
  },
});
