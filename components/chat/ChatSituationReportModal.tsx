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

import type { AiSummarizeData } from '@/services/api/chatApi';
import { httpClient } from '@/services/api/httpClient';

type Recommendation = {
  id: number;
  title: string;
  project_code: string;
  severity: string;
  confidence_score: number;
  recommendation_type: string;
  created_at: string;
};

const SEVERITY: Record<string, { label: string; color: string; bg: string; border: string }> = {
  critical: { label: 'Cần xử lý ngay', color: '#f87171', bg: '#7f1d1d33', border: '#ef444455' },
  high: { label: 'Quan trọng', color: '#fb923c', bg: '#7c2d1233', border: '#f9731655' },
  medium: { label: 'Lưu ý', color: '#facc15', bg: '#713f1233', border: '#eab30855' },
  low: { label: 'Tham khảo', color: '#60a5fa', bg: '#1e3a8a33', border: '#3b82f655' },
};

function buildReportSections(report: AiSummarizeData | null) {
  if (!report) return [];
  return [
    { title: '1. Tổng quan', items: [report.summary?.trim() || 'Chưa có nội dung tổng quan.'] },
    {
      title: '2. Công việc đã thực hiện',
      items: report.highlights?.length ? report.highlights : ['Chưa có nội dung.'],
    },
    {
      title: '3. Vấn đề / khó khăn',
      items: report.risks?.length ? report.risks : ['Không ghi nhận rủi ro nổi bật.'],
    },
    {
      title: '4. Hướng xử lý / kế hoạch',
      items: report.actionItems?.length ? report.actionItems : ['Chưa có đề xuất cụ thể.'],
    },
  ];
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMins < 60) return `${diffMins} phút trước`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return `${Math.floor(diffHours / 24)} ngày trước`;
}

type Props = {
  visible: boolean;
  isLoading: boolean;
  report: AiSummarizeData | null;
  conversationName?: string;
  isDark: boolean;
  onClose: () => void;
};

export function ChatSituationReportModal({
  visible,
  isLoading,
  report,
  conversationName,
  isDark,
  onClose,
}: Props) {
  const { height } = useWindowDimensions();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  const bg = isDark ? '#121B2A' : '#FFFFFF';
  const text = isDark ? '#F8FAFC' : '#111827';
  const muted = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? '#334155' : '#E5E7EB';

  useEffect(() => {
    if (!visible || isLoading) return;
    let cancelled = false;
    setLoadingRecs(true);
    void (async () => {
      try {
        const { data } = await httpClient.get<{ data?: Recommendation[] }>('/ai/recommendations', {
          params: { status: 'pending', limit: 10 },
        });
        if (!cancelled) setRecommendations(data?.data ?? []);
      } catch {
        if (!cancelled) setRecommendations([]);
      } finally {
        if (!cancelled) setLoadingRecs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, isLoading]);

  const sections = buildReportSections(report);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: bg, maxHeight: height * 0.92 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: text }]}>
            📋 Trợ lý báo cáo — {conversationName?.trim() || 'Nhóm chat'}
          </Text>

          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#6366F1" />
              <Text style={{ color: muted, marginLeft: 8 }}>Trợ lý đang phân tích...</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: height * 0.72 }} nestedScrollEnabled>
              {sections.map((sec) => (
                <View key={sec.title} style={[styles.section, { borderColor: border }]}>
                  <Text style={[styles.sectionTitle, { color: isDark ? '#67e8f9' : '#1e3a8a' }]}>
                    {sec.title}
                  </Text>
                  {sec.items.map((item, i) => (
                    <Text key={i} style={[styles.bullet, { color: text }]}>
                      • {item}
                    </Text>
                  ))}
                </View>
              ))}

              <View style={[styles.recBox, { borderColor: isDark ? '#00D9FF44' : '#6366f155' }]}>
                <Text style={[styles.recTitle, { color: isDark ? '#67e8f9' : '#4338ca' }]}>
                  💡 Gợi ý từ trợ lý
                </Text>
                {loadingRecs ? (
                  <ActivityIndicator size="small" color="#6366F1" style={{ marginTop: 8 }} />
                ) : recommendations.length === 0 ? (
                  <Text style={{ color: muted, fontSize: 12, marginTop: 6 }}>
                    Trợ lý chưa có gợi ý nào cần xem.
                  </Text>
                ) : (
                  recommendations.map((rec) => {
                    const sev = SEVERITY[rec.severity] ?? SEVERITY.low;
                    return (
                      <View
                        key={rec.id}
                        style={[styles.recCard, { backgroundColor: sev.bg, borderColor: sev.border }]}
                      >
                        <Text style={[styles.recCardTitle, { color: text }]}>{rec.title}</Text>
                        <View style={styles.recMeta}>
                          <Text style={[styles.recBadge, { color: sev.color }]}>{sev.label}</Text>
                          <Text style={{ color: muted, fontSize: 10 }}>{rec.project_code}</Text>
                          <Text style={{ color: muted, fontSize: 10 }}>
                            {Math.round(rec.confidence_score * 100)}%
                          </Text>
                          <Text style={{ color: muted, fontSize: 10 }}>{formatTimeAgo(rec.created_at)}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </ScrollView>
          )}

          <TouchableOpacity style={[styles.closeBtn, { borderTopColor: border }]} onPress={onClose}>
            <Text style={{ color: muted, fontWeight: '700' }}>Đóng</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  title: { fontSize: 17, fontWeight: '800', marginBottom: 12 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 24 },
  section: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
  bullet: { fontSize: 14, lineHeight: 21, marginBottom: 4 },
  recBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 4, marginBottom: 8 },
  recTitle: { fontSize: 13, fontWeight: '800' },
  recCard: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 8 },
  recCardTitle: { fontSize: 14, fontWeight: '600' },
  recMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, alignItems: 'center' },
  recBadge: { fontSize: 10, fontWeight: '800' },
  closeBtn: { paddingTop: 14, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8 },
});
