import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import { chatApi, type AiSummarizeData } from '@/services/api/chatApi';
import { ChatSituationReportModal } from '@/components/chat/ChatSituationReportModal';

const RANGES = [
  { v: 'last_20', label: '20 tin gần nhất' },
  { v: 'today', label: 'Hôm nay' },
  { v: 'last_24h', label: '24 giờ qua' },
] as const;

const OBJECTIVES = [
  { v: 'summary_tasks', label: 'Tóm tắt & việc cần làm' },
  { v: 'erp_risk', label: 'Quét rủi ro ERP' },
  { v: 'task_extraction', label: 'Trích xuất task' },
] as const;

type Props = {
  visible: boolean;
  conversationId: number;
  groupName?: string;
  isDark: boolean;
  onClose: () => void;
  onRunQuickSummarize: () => void;
};

function parseAiReport(raw: unknown): AiSummarizeData | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const data = (obj.data && typeof obj.data === 'object' ? obj.data : obj) as Record<string, unknown>;
  if (typeof data.summary !== 'string') return null;
  return {
    traceId: String(data.traceId ?? ''),
    provider: String(data.provider ?? ''),
    model: String(data.model ?? ''),
    summary: data.summary,
    highlights: Array.isArray(data.highlights) ? data.highlights.map(String) : [],
    actionItems: Array.isArray(data.actionItems) ? data.actionItems.map(String) : [],
    risks: Array.isArray(data.risks) ? data.risks.map(String) : [],
  };
}

export function ChatAiAdvancedModal({
  visible,
  conversationId,
  groupName = '',
  isDark,
  onClose,
  onRunQuickSummarize,
}: Props) {
  const { height } = useWindowDimensions();
  const [range, setRange] = useState<string>('last_20');
  const [includeAttachments, setIncludeAttachments] = useState(false);
  const [objective, setObjective] = useState<string>('summary_tasks');
  const [loading, setLoading] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [situationReport, setSituationReport] = useState<AiSummarizeData | null>(null);
  const [showSituation, setShowSituation] = useState(false);

  const bg = isDark ? '#121B2A' : '#FFFFFF';
  const text = isDark ? '#F8FAFC' : '#111827';
  const muted = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? '#334155' : '#E5E7EB';

  const runDemo = async () => {
    if (!Number.isFinite(conversationId) || conversationId <= 0) return;
    setLoading(true);
    setResultText(null);
    setSituationReport(null);
    try {
      const raw = await chatApi.demoSummarizeConversation({
        conversationId,
        range,
        includeAttachments,
        objective,
        groupName,
      });
      const parsed = parseAiReport(raw);
      if (parsed && (objective === 'erp_risk' || objective === 'summary_tasks')) {
        setSituationReport(parsed);
        setShowSituation(true);
        onClose();
        return;
      }
      const t =
        typeof raw === 'string'
          ? raw
          : JSON.stringify((raw as { data?: unknown })?.data ?? raw, null, 2);
      setResultText(t);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? '')
          : '';
      setResultText(msg || 'Không thể chạy phân tích nâng cao.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { backgroundColor: bg, maxHeight: height * 0.92 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.title, { color: text }]}>Trợ lý báo cáo</Text>
            <Text style={[styles.hint, { color: muted }]}>
              Phân tích nâng cao — kết quả rủi ro / tóm tắt hiển thị dạng báo cáo (giống web).
            </Text>

            <Text style={[styles.label, { color: muted }]}>Phạm vi</Text>
            <View style={styles.rowWrap}>
              {RANGES.map((r) => (
                <TouchableOpacity
                  key={r.v}
                  style={[styles.chip, { borderColor: border }, range === r.v && styles.chipOn]}
                  onPress={() => setRange(r.v)}
                >
                  <Text style={[styles.chipTxt, { color: range === r.v ? '#FFF' : text }]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.switchRow, { borderColor: border }]}>
              <Text style={{ color: text, flex: 1 }}>Đọc cả ảnh / file</Text>
              <Switch value={includeAttachments} onValueChange={setIncludeAttachments} />
            </View>

            <Text style={[styles.label, { color: muted }]}>Mục tiêu</Text>
            <View style={styles.rowWrap}>
              {OBJECTIVES.map((o) => (
                <TouchableOpacity
                  key={o.v}
                  style={[styles.chip, { borderColor: border }, objective === o.v && styles.chipOn]}
                  onPress={() => setObjective(o.v)}
                >
                  <Text style={[styles.chipTxt, { color: objective === o.v ? '#FFF' : text }]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.btnPrimary} onPress={runDemo} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.btnPrimaryText}>Chạy phân tích nâng cao</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnSecondary, { borderColor: border }]}
              onPress={() => {
                onRunQuickSummarize();
                onClose();
              }}
            >
              <Text style={{ color: '#1E3A8A', fontWeight: '700' }}>Tóm tắt nhanh (7 ngày)</Text>
            </TouchableOpacity>

            {resultText ? (
              <ScrollView style={[styles.resultBox, { borderColor: border }]} nestedScrollEnabled>
                <Text style={{ color: text, fontSize: 12, fontFamily: 'monospace' }}>{resultText}</Text>
              </ScrollView>
            ) : null}

            <TouchableOpacity style={[styles.closeLine, { borderTopColor: border }]} onPress={onClose}>
              <Text style={{ color: muted, fontWeight: '600' }}>Đóng</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <ChatSituationReportModal
        visible={showSituation}
        isLoading={false}
        report={situationReport}
        conversationName={groupName}
        isDark={isDark}
        onClose={() => {
          setShowSituation(false);
          setSituationReport(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 },
  title: { fontSize: 18, fontWeight: '800' },
  hint: { fontSize: 12, marginTop: 6, marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '700', marginTop: 10, marginBottom: 6, textTransform: 'uppercase' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  chipOn: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  chipTxt: { fontSize: 12, fontWeight: '700' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  btnPrimary: {
    marginTop: 14,
    backgroundColor: '#1E3A8A',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#FFF', fontWeight: '800' },
  btnSecondary: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  resultBox: {
    maxHeight: 200,
    marginTop: 12,
    padding: 10,
    borderWidth: 1,
    borderRadius: 10,
  },
  closeLine: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
});
