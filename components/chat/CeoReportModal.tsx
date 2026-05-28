import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import { chatApi } from '@/services/api/chatApi';

const QUICK = ['Hôm nay có gì cần tôi can thiệp?', 'Dự án nào đang nghẽn?', 'Ai đang làm chậm hệ thống?'];

type Props = { visible: boolean; isDark: boolean; onClose: () => void };

export function CeoReportModal({ visible, isDark, onClose }: Props) {
  const { height } = useWindowDimensions();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [q, setQ] = useState('Báo cáo tự động tình hình hệ thống hôm nay');

  const bg = isDark ? '#0B131F' : '#FFFFFF';
  const text = isDark ? '#F8FAFC' : '#111827';
  const muted = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? '#334155' : '#E5E7EB';

  const load = async (question: string) => {
    setQ(question);
    setLoading(true);
    setErr(null);
    setBody(null);
    try {
      const res = await chatApi.ceoAgentReport(question);
      setBody(typeof res === 'string' ? res : JSON.stringify(res, null, 2));
    } catch {
      setErr('Hệ thống đang tổng hợp quá nhiều dữ liệu — thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) void load('Báo cáo tự động tình hình hệ thống hôm nay');
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: bg }]}>
        <View style={[styles.top, { borderBottomColor: border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={{ color: '#00D9FF', fontSize: 16, fontWeight: '700' }}>← Đóng</Text>
          </TouchableOpacity>
          <Text style={[styles.headTitle, { color: '#00D9FF' }]}>AI điều hành CEO</Text>
          <View style={{ width: 48 }} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 52, paddingHorizontal: 12 }}>
          {QUICK.map((x) => (
            <TouchableOpacity
              key={x}
              style={[styles.pill, { borderColor: border }, q === x && styles.pillOn]}
              onPress={() => void load(x)}
              disabled={loading}
            >
              <Text style={{ color: q === x ? '#0B131F' : text, fontSize: 11, fontWeight: '700' }} numberOfLines={2}>
                {x}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView style={{ flex: 1, maxHeight: height * 0.82 }} contentContainerStyle={{ padding: 16 }}>
          {loading ? (
            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#00D9FF" />
            </View>
          ) : err ? (
            <Text style={{ color: '#F87171' }}>{err}</Text>
          ) : (
            <Text style={{ color: text, lineHeight: 22 }}>{body}</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingTop: 48 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headTitle: { fontSize: 16, fontWeight: '800' },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    marginVertical: 8,
    maxWidth: 220,
  },
  pillOn: { backgroundColor: '#00D9FF', borderColor: '#00D9FF' },
});
