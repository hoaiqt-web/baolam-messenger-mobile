import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  collectDepartments,
  countByDepartment,
  parseAttendanceHeadcountMessage,
  parseTimeInterval,
  type AttendanceHeadcountLocation,
} from '@/features/chat/attendanceHeadcountParsers';

type Props = {
  body: string;
  isMine: boolean;
};

function LocationBlock({ location }: { location: AttendanceHeadcountLocation }) {
  const [open, setOpen] = useState(false);
  const departments = collectDepartments([location]);
  const counts = countByDepartment(location.people);
  const rowTotal = location.people.length;

  return (
    <View style={styles.block}>
      <TouchableOpacity onPress={() => setOpen((value) => !value)} activeOpacity={0.75} style={styles.locationHeading}>
        <Text style={styles.locationHeadingText}>
          {open ? '▾  ' : '▸  '}
          {location.name}
        </Text>
        <Text style={styles.locationCount}>{open ? 'thu gọn' : 'xem tên'} {location.count}</Text>
      </TouchableOpacity>

      <View style={styles.location}>
        {departments.map((dept) => (
          <View key={dept} style={styles.stackRow}>
            <Text style={styles.stackDept}>{dept}</Text>
            <Text style={styles.countText}>{counts[dept] ?? 0}</Text>
          </View>
        ))}
        <View style={[styles.stackRow, styles.stackTotal]}>
          <Text style={styles.totalHead}>Tổng</Text>
          <Text style={styles.totalText}>{rowTotal}</Text>
        </View>
      </View>

      {open ? (
        <View style={styles.peopleBox}>
          <Text style={styles.peopleHeading}>
            Danh sách nhân sự · {location.people.length}
          </Text>
          {location.people.length === 0 ? (
            <Text style={styles.empty}>Không có nhân sự.</Text>
          ) : (
            <>
              <View style={styles.personHeaderRow}>
                <Text style={[styles.personHeaderCell, styles.personNameHeader]}>Tên</Text>
                <Text style={styles.personHeaderCell}>Giờ vào</Text>
                <Text style={styles.personHeaderCell}>Giờ ra</Text>
              </View>
              {location.people.map((person, index) => {
                const { start, end } = parseTimeInterval(person.intervals);
                return (
                  <View key={`${person.name}-${index}`} style={styles.personRow}>
                    <Text style={styles.personName}>{person.name}</Text>
                    <Text style={start || person.intervals ? styles.personTimes : styles.personDept}>
                      {start || (person.intervals ? '—' : person.department)}
                    </Text>
                    <Text style={end || person.intervals ? styles.personTimes : styles.personDept}>
                      {end || (person.intervals ? '—' : '')}
                    </Text>
                  </View>
                );
              })}
            </>
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
      <Text style={styles.title}>
        Báo cáo tình hình nhân sự Bảo Lâm
        {data.dateLabel ? <Text style={styles.titleDate}> · {data.dateLabel}</Text> : null}
      </Text>

      {data.locations.length === 0 ? (
        <View style={[styles.location, styles.emptyBox]}>
          <Text style={styles.empty}>Không có chấm công.</Text>
        </View>
      ) : (
        data.locations.map((location) => (
          <LocationBlock key={location.name} location={location} />
        ))
      )}

      {data.note && !(data.locations.length === 0 && /không có chấm công/i.test(data.note)) ? (
        <Text style={styles.note}>{data.note}</Text>
      ) : null}
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
  titleDate: {
    color: '#fb7185',
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
  personHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#064e3b44',
  },
  personHeaderCell: {
    width: 52,
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    textAlign: 'right',
  },
  personNameHeader: {
    flex: 1,
    width: undefined,
    textAlign: 'left',
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
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
    width: 52,
    color: '#64748b',
    fontSize: 11,
    textAlign: 'right',
  },
  personTimes: {
    width: 52,
    color: '#6ee7b7',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
  },
  emptyBox: {
    marginHorizontal: 10,
    marginTop: 10,
  },
  empty: {
    color: '#64748b',
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  note: {
    color: '#94a3b8',
    fontSize: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
    lineHeight: 18,
  },
});
