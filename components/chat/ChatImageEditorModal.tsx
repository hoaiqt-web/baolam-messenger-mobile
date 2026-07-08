import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';

import { httpClient } from '@/services/api/httpClient';
import {
  ChatImageSkiaEditor,
  type ChatImageSkiaEditorHandle,
} from '@/components/chat/ChatImageSkiaEditor';

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
  const skiaRef = useRef<ChatImageSkiaEditorHandle>(null);
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

  const handleSend = useCallback(async () => {
    if (!workingUri || !Number.isFinite(conversationId) || conversationId <= 0) return;
    setSending(true);
    try {
      const flatUri = await skiaRef.current?.exportComposite();
      let uploadUri = flatUri ?? workingUri;

      const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
      const compressed = await manipulateAsync(
        uploadUri,
        [{ resize: { width: 2048 } }],
        { compress: 0.85, format: SaveFormat.JPEG },
      );
      uploadUri = compressed.uri;

      const formData = new FormData();
      formData.append('file', {
        uri: uploadUri,
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
      const axiosStatus =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { status?: number } }).response?.status
          : undefined;
      const msg =
        axiosStatus === 413
          ? 'Ảnh sau chỉnh sửa quá lớn để tải lên. Vui lòng thử cắt nhỏ ảnh.'
          : e instanceof Error
            ? e.message
            : 'Không thể gửi ảnh.';
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
      <View style={[styles.shell, { paddingTop: insets.top + 4 }]}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn} hitSlop={12}>
            <Ionicons name="close" size={22} color="#FFF" />
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

        <View style={styles.stage}>
          {loading && !workingUri ? (
            <ActivityIndicator color="#00D9FF" size="large" />
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : workingUri ? (
            <ChatImageSkiaEditor ref={skiaRef} imageUri={workingUri} onWorkingUriChange={setWorkingUri} />
          ) : null}
          {loading && workingUri ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color="#FFF" />
            </View>
          ) : null}
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
    paddingHorizontal: 10,
    marginBottom: 2,
    flexShrink: 0,
  },
  title: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#00D9FF',
    minWidth: 64,
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#0B131F', fontWeight: '700', fontSize: 14 },
  stage: { flex: 1, minHeight: 0, position: 'relative' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: { color: '#FCA5A5', paddingHorizontal: 24, textAlign: 'center' },
});
