import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import {
  FlipType,
  SaveFormat,
  manipulateAsync,
  type Action,
} from 'expo-image-manipulator';

import { httpClient } from '@/services/api/httpClient';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

type ChatImageEditorModalProps = {
  visible: boolean;
  attachmentId: number;
  conversationId: number;
  onClose: () => void;
  onSendSuccess: (payload: unknown) => void;
};

export function ChatImageEditorModal({
  visible,
  attachmentId,
  conversationId,
  onClose,
  onSendSuccess,
}: ChatImageEditorModalProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workingUri, setWorkingUri] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !Number.isFinite(attachmentId) || attachmentId <= 0) {
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setWorkingUri(null);
      try {
        const res = await httpClient.get<ArrayBuffer>(
          `/chat/attachments/${attachmentId}/edit-source`,
          { responseType: 'arraybuffer' },
        );
        if (cancelled) return;
        const data = res.data;
        if (!(data instanceof ArrayBuffer)) {
          throw new Error('Phản hồi tải ảnh không hợp lệ.');
        }
        const base64 = arrayBufferToBase64(data);
        const file = new File(Paths.cache, `edit-src-${attachmentId}-${Date.now()}.bin`);
        file.create({ overwrite: true });
        file.write(base64, { encoding: 'base64' });
        if (cancelled) return;
        setWorkingUri(file.uri);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Không thể tải ảnh để chỉnh sửa.';
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, attachmentId]);

  const applyActions = useCallback(async (actions: Action[]) => {
    if (!workingUri) return;
    try {
      setLoading(true);
      const result = await manipulateAsync(workingUri, actions, {
        compress: 0.9,
        format: SaveFormat.JPEG,
      });
      setWorkingUri(result.uri);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Không thể áp dụng thao tác.';
      Alert.alert('Lỗi', msg);
    } finally {
      setLoading(false);
    }
  }, [workingUri]);

  const handleSend = useCallback(async () => {
    if (!workingUri || !Number.isFinite(conversationId) || conversationId <= 0) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: workingUri,
        name: `edited-${Date.now()}.jpg`,
        type: 'image/jpeg',
      } as any);
      const { data } = await httpClient.post(
        `/conversations/${conversationId}/attachments/direct`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      onSendSuccess(data);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Không thể gửi ảnh.';
      Alert.alert('Lỗi', msg);
    } finally {
      setSending(false);
    }
  }, [workingUri, conversationId, onSendSuccess, onClose]);

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.shell, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn} hitSlop={12}>
            <Ionicons name="close" size={26} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Chỉnh sửa ảnh</Text>
          <TouchableOpacity
            onPress={() => void handleSend()}
            style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
            disabled={sending || !workingUri || !!error}
            hitSlop={12}
          >
            {sending ? (
              <ActivityIndicator color="#0B131F" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>Gửi</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.preview}>
          {loading && !workingUri ? (
            <ActivityIndicator color="#00D9FF" size="large" />
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : workingUri ? (
            <Image source={{ uri: workingUri }} style={styles.previewImg} resizeMode="contain" />
          ) : null}
          {loading && workingUri ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color="#FFF" />
            </View>
          ) : null}
        </View>

        <View style={[styles.tools, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.toolsHint}>
            Xoay, lật — tương thích với chỉnh sửa trên web (ảnh gốc từ máy chủ).
          </Text>
          <View style={styles.toolRow}>
            <TouchableOpacity
              style={styles.toolBtn}
              onPress={() => void applyActions([{ rotate: -90 }])}
              disabled={loading || !workingUri}
            >
              <Ionicons name="arrow-undo-outline" size={22} color="#FFF" />
              <Text style={styles.toolLabel}>Xoay trái</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.toolBtn}
              onPress={() => void applyActions([{ rotate: 90 }])}
              disabled={loading || !workingUri}
            >
              <Ionicons name="arrow-redo-outline" size={22} color="#FFF" />
              <Text style={styles.toolLabel}>Xoay phải</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.toolBtn}
              onPress={() => void applyActions([{ flip: FlipType.Horizontal }])}
              disabled={loading || !workingUri}
            >
              <Ionicons name="swap-horizontal-outline" size={22} color="#FFF" />
              <Text style={styles.toolLabel}>Lật ngang</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.toolBtn}
              onPress={() => void applyActions([{ flip: FlipType.Vertical }])}
              disabled={loading || !workingUri}
            >
              <Ionicons name="swap-vertical-outline" size={22} color="#FFF" />
              <Text style={styles.toolLabel}>Lật dọc</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: '#0B131F',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  title: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#00D9FF',
    minWidth: 72,
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#0B131F', fontWeight: '700', fontSize: 15 },
  preview: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImg: { width: '100%', height: '100%' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: { color: '#FCA5A5', paddingHorizontal: 24, textAlign: 'center' },
  tools: { paddingHorizontal: 16, paddingTop: 12 },
  toolsHint: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginBottom: 10 },
  toolRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    columnGap: 8,
  },
  toolBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  toolLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10, marginTop: 4 },
});
