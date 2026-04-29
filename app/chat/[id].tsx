import { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  AppState,
  Image,
  Modal,
  Dimensions,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { httpClient } from '@/services/api/httpClient';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import {
  getLastRealtimeInboundActivityAt,
  getRealtimeConnectionState,
  subscribeConversationMessages,
} from '@/services/realtime/reverbClient';

// Color palette for avatars
const AVATAR_COLORS = [
  '#6366F1',
  '#EC4899',
  '#F59E0B',
  '#10B981',
  '#8B5CF6',
  '#EF4444',
  '#14B8A6',
  '#F97316',
];
function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatTime(dateStr: string | null | undefined) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${hours}:${mins} ${day}/${month}/${year}`;
}

function getSenderName(item: any): string {
  return (
    item.sender?.fullName ||
    item.sender?.full_name ||
    item.sender?.username ||
    'Ai đó'
  );
}

function formatFileSize(bytes: number | null | undefined): string {
  const size = Number(bytes || 0);
  if (size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function appendUploadedMessage(setMessages: any, payload: any) {
  const actualMessage = payload?.message || payload?.data || payload;
  setMessages((prev: any[]) => {
    const exists = prev.some(
      (msg) => Number(msg?.id) === Number(actualMessage?.id),
    );
    return exists ? prev : [actualMessage, ...prev];
  });
}

export default function ChatScreen() {
  const REALTIME_IDLE_THRESHOLD_MS = 15_000;
  const POLL_INTERVAL_HEALTHY_MS = 25_000;
  const POLL_INTERVAL_DEGRADED_MS = 5_000;
  const { id, name } = useLocalSearchParams();
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const sendScale = useRef(new Animated.Value(1)).current;
  const conversationId = Number(id);
  const fetchMessagesRef = useRef<() => void>(() => undefined);
  const lastPollAtRef = useRef(0);

  const chatTitle = (name as string) || 'Tin nhắn';
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;

  // Deduplicate messages by ID to prevent "two children with same key" error
  const deduplicateMessages = (msgs: any[]): any[] => {
    const seen = new Map<string, any>();
    for (const msg of msgs) {
      const key = String(msg.id || msg.client_message_id || msg.clientMessageId);
      // Prefer real messages over optimistic ones
      if (!seen.has(key) || !msg.is_optimistic) {
        seen.set(key, msg);
      }
    }
    return Array.from(seen.values());
  };

  // Deduplicate at render time to guarantee unique keys for FlatList
  const uniqueMessages = useMemo(() => deduplicateMessages(messages), [messages]);

  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const { data } = await httpClient.get('/auth/me');
        setCurrentUserId(data.user?.id || data.id);
      } catch (e) {
        console.error('Failed to fetch user', e);
      }
    };
    fetchUserId();
    fetchMessages();
  }, [id]);

  useEffect(() => {
    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      return;
    }

    return subscribeConversationMessages(
      conversationId,
      (payload) => {
        const incoming = payload.message;
        setMessages((prev) => {
          const incomingId = Number(incoming.id);
          const incomingClientId = String(incoming.clientMessageId || '');
          const withoutOptimistic = prev.filter((msg) => {
            const msgClientId = String(
              msg.client_message_id || msg.clientMessageId || '',
            );
            if (
              incomingClientId.length > 0 &&
              msgClientId.length > 0 &&
              msgClientId === incomingClientId
            ) {
              return false;
            }
            return true;
          });

          const existingIndex = withoutOptimistic.findIndex(
            (msg) => Number(msg.id) === incomingId,
          );
          if (existingIndex >= 0) {
            const next = [...withoutOptimistic];
            next[existingIndex] = incoming;
            return next;
          }

          return deduplicateMessages([incoming, ...withoutOptimistic]);
        });
      },
      undefined,
      undefined,
      (payload) => {
        const recalled = payload.message;
        setMessages((prev) =>
          prev.map((msg) =>
            Number(msg.id) === Number(recalled.id)
              ? {
                  ...msg,
                  ...recalled,
                }
              : msg,
          ),
        );
      },
    );
  }, [conversationId]);


  const fetchMessages = async () => {
    try {
      const { data } = await httpClient.get(`/conversations/${id}/messages`);
      const msgs = data.messages || data.data || [];
      setMessages(deduplicateMessages(msgs.reverse()));
    } catch (error: any) {
      console.error('Error fetching messages', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchMessages();
  };

  useEffect(() => {
    fetchMessagesRef.current = fetchMessages;
  }, [id]);

  useEffect(() => {
    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      return;
    }

    const maybePoll = () => {
      const now = Date.now();
      const state = getRealtimeConnectionState();
      const idleMs = now - getLastRealtimeInboundActivityAt();
      const degraded =
        state !== 'connected' || idleMs > REALTIME_IDLE_THRESHOLD_MS;
      const intervalMs = degraded
        ? POLL_INTERVAL_DEGRADED_MS
        : POLL_INTERVAL_HEALTHY_MS;

      if (now - lastPollAtRef.current < intervalMs) {
        return;
      }

      lastPollAtRef.current = now;
      fetchMessagesRef.current();
    };

    const interval = setInterval(maybePoll, 2000);
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        fetchMessagesRef.current();
      }
    });

    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [conversationId]);

  const animateSendButton = () => {
    Animated.sequence([
      Animated.timing(sendScale, {
        toValue: 0.85,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(sendScale, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;
    animateSendButton();

    const textToSend = inputText.trim();
    setInputText('');
    setIsSending(true);

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      body: textToSend,
      sender_id: currentUserId,
      sentAt: new Date().toISOString(),
      sent_at: new Date().toISOString(),
      is_optimistic: true,
      sender: { id: currentUserId, fullName: 'Bạn' },
    };
    setMessages((prev) => [optimisticMessage, ...prev]);

    try {
      const { data } = await httpClient.post(`/conversations/${id}/messages`, {
        body: textToSend,
        client_message_id: tempId,
      });
      const actualMessage = data.message || data.data || data;
      setMessages((prev) =>
        prev.map((msg) => (msg.id === tempId ? actualMessage : msg)),
      );
    } catch (error: any) {
      console.error('Error sending message', error);
      Alert.alert('Lỗi', 'Không thể gửi tin nhắn.');
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      setInputText(textToSend);
    } finally {
      setIsSending(false);
    }
  };

  const uploadFileByPresign = async ({
    uri,
    fileName,
    mimeType,
    size,
  }: {
    uri: string;
    fileName: string;
    mimeType: string;
    size: number;
  }) => {
    const clientFileId = `mobile-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const presignResponse = await httpClient.post('/chat/attachments/presign', {
      conversationId,
      files: [
        {
          clientFileId,
          name: fileName,
          mimeType,
          size: size > 0 ? size : 1,
        },
      ],
    });
    const presigned = presignResponse.data?.items?.[0];
    if (!presigned?.uploadUrl || !presigned?.objectKey) {
      throw new Error('Missing presign payload');
    }

    const fileResponse = await fetch(uri);
    const fileBlob = await fileResponse.blob();
    const uploadHeaders: Record<string, string> = {
      ...(presigned.headers || {}),
      'Content-Type': mimeType,
    };

    const uploadResult = await fetch(presigned.uploadUrl, {
      method: 'PUT',
      headers: uploadHeaders,
      body: fileBlob,
    });
    if (!uploadResult.ok) {
      throw new Error(`Upload failed with status ${uploadResult.status}`);
    }

    const sendResponse = await httpClient.post(
      `/conversations/${conversationId}/messages`,
      {
        body: '',
        clientMessageId: `file-msg-${Date.now()}`,
        traceId: `file-trace-${Date.now()}`,
        clientSentAt: Date.now(),
        attachments: [
          {
            clientFileId,
            objectKey: presigned.objectKey,
            mimeType,
            size: size > 0 ? size : fileBlob.size,
            originalName: fileName,
          },
        ],
      },
    );

    await appendUploadedMessage(setMessages, sendResponse.data);
  };

  const handlePickAndSendImage = async () => {
    if (
      isUploadingImage ||
      !Number.isFinite(conversationId) ||
      conversationId <= 0
    )
      return;

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Quyền bị từ chối',
          'Vui lòng cấp quyền thư viện ảnh để gửi ảnh.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: false,
        quality: 0.85,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const fileName = asset.fileName || `image-${Date.now()}.jpg`;
      const mimeType = asset.mimeType || 'image/jpeg';
      const isImage = mimeType.startsWith('image/');
      const size = Number(asset.fileSize || asset.file?.size || 0);

      if (!isImage) {
        setIsUploadingImage(true);
        await uploadFileByPresign({
          uri: asset.uri,
          fileName,
          mimeType,
          size,
        });
        return;
      }

      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: fileName,
        type: mimeType,
      } as any);

      setIsUploadingImage(true);
      const { data } = await httpClient.post(
        `/conversations/${conversationId}/attachments/direct`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );

      await appendUploadedMessage(setMessages, data);
    } catch (error) {
      console.error('Error uploading image', error);
      Alert.alert('Lỗi', 'Không thể gửi ảnh.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handlePickAndSendFile = async () => {
    if (
      isUploadingFile ||
      !Number.isFinite(conversationId) ||
      conversationId <= 0
    )
      return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const fileName = asset.name || `file-${Date.now()}`;
      const mimeType = asset.mimeType || 'application/octet-stream';
      const size = Number(asset.size || 0);

      setIsUploadingFile(true);
      await uploadFileByPresign({
        uri: asset.uri,
        fileName,
        mimeType,
        size,
      });
    } catch (error) {
      console.error('Error uploading file', error);
      Alert.alert('Lỗi', 'Không thể gửi file.');
    } finally {
      setIsUploadingFile(false);
    }
  };

  const renderMessage = ({ item, index }: { item: any; index: number }) => {
    const senderId = item.sender_id || item.senderId || item.sender?.id;
    const isMine = senderId === currentUserId;
    const senderName = getSenderName(item);
    const timeStr = formatTime(item.sentAt || item.sent_at || item.created_at);
    const avatarColor = getAvatarColor(senderName);
    const attachments = Array.isArray(item.attachments) ? item.attachments : [];
    const hasText = Boolean(String(item.body || '').trim());

    // Check if next message (visually above since inverted) is from same sender
    const nextMsg = messages[index + 1];
    const nextSenderId =
      nextMsg?.sender_id || nextMsg?.senderId || nextMsg?.sender?.id;
    const isFirstInGroup = nextSenderId !== senderId;

    return (
      <View
        style={[
          styles.messageRow,
          isMine ? styles.messageRowMine : styles.messageRowOther,
        ]}
      >
        {!isMine && (
          <View style={styles.avatarCol}>
            {isFirstInGroup ? (
              <View
                style={[styles.avatarSmall, { backgroundColor: avatarColor }]}
              >
                <Text style={styles.avatarSmallText}>
                  {senderName[0].toUpperCase()}
                </Text>
              </View>
            ) : (
              <View style={styles.avatarSpacer} />
            )}
          </View>
        )}
        <View style={[styles.bubbleCol, isMine && styles.bubbleColMine]}>
          {!isMine && isFirstInGroup && (
            <Text style={[styles.senderLabel, { color: avatarColor }]}>
              {senderName}
            </Text>
          )}
          <View
            style={[
              styles.bubble,
              isMine ? styles.bubbleMine : styles.bubbleOther,
              item.is_optimistic && styles.bubbleOptimistic,
            ]}
          >
            {attachments.length > 0 ? (
              <View style={styles.attachmentList}>
                {attachments.map((attachment: any, attachmentIndex: number) => {
                  const key = attachment?.id || `att-${attachmentIndex}`;
                  const mimeType = String(
                    attachment?.mimeType || '',
                  ).toLowerCase();
                  const isImageAttachment = mimeType.startsWith('image/');
                  const imageUrl = attachment?.url;
                  if (isImageAttachment && imageUrl) {
                    return (
                      <TouchableOpacity
                        key={key}
                        activeOpacity={0.8}
                        onPress={() => setPreviewImageUrl(imageUrl)}
                      >
                        <Image
                          source={{ uri: imageUrl }}
                          style={styles.attachmentImage}
                        />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <View key={key} style={styles.fileAttachmentCard}>
                      <Text style={styles.fileAttachmentName} numberOfLines={1}>
                        {attachment?.originalName || 'Tệp đính kèm'}
                      </Text>
                      <Text style={styles.fileAttachmentMeta}>
                        {formatFileSize(attachment?.size)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
            {hasText ? (
              <Text
                style={[styles.bubbleText, isMine && styles.bubbleTextMine]}
              >
                {item.body}
              </Text>
            ) : null}
          </View>
          {timeStr ? (
            <Text style={[styles.timeText, isMine && styles.timeTextMine]}>
              {timeStr}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: chatTitle,
          headerBackTitle: 'Trở lại',
          headerStyle: { backgroundColor: '#1E3A8A' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: 'bold', fontSize: 18 },
        }}
      />

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size='large' color='#1E3A8A' />
          <Text style={styles.loadingText}>Đang tải tin nhắn...</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 100}
        >
          <FlatList
            data={uniqueMessages}
            keyExtractor={(item, index) => {
              const base = item?.id?.toString() || item?.client_message_id || '';
              return base ? `${base}` : `msg-fallback-${index}`;
            }}
            renderItem={renderMessage}
            inverted
            contentContainerStyle={styles.messageList}
            onRefresh={handleRefresh}
            refreshing={isRefreshing}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatIcon}>💬</Text>
                <Text style={styles.emptyChatText}>
                  Hãy gửi tin nhắn đầu tiên!
                </Text>
              </View>
            }
          />

          <View style={styles.inputBar}>
            <TouchableOpacity
              style={[
                styles.attachBtn,
                isUploadingImage && styles.attachBtnDisabled,
              ]}
              onPress={handlePickAndSendImage}
              disabled={isUploadingImage}
              activeOpacity={0.7}
            >
              {isUploadingImage ? (
                <ActivityIndicator size='small' color='#1E3A8A' />
              ) : (
                <Ionicons name='images-outline' size={20} color='#334155' />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.attachBtn,
                isUploadingFile && styles.attachBtnDisabled,
              ]}
              onPress={handlePickAndSendFile}
              disabled={isUploadingFile}
              activeOpacity={0.7}
            >
              {isUploadingFile ? (
                <ActivityIndicator size='small' color='#1E3A8A' />
              ) : (
                <Ionicons name='attach-outline' size={20} color='#334155' />
              )}
            </TouchableOpacity>
            <TextInput
              style={styles.inputField}
              placeholder='Nhập tin nhắn...'
              placeholderTextColor='#9CA3AF'
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
            <Animated.View style={{ transform: [{ scale: sendScale }] }}>
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  (!inputText.trim() || isSending) && styles.sendBtnDisabled,
                ]}
                onPress={handleSend}
                disabled={!inputText.trim() || isSending}
                activeOpacity={0.7}
              >
                {isSending ? (
                  <ActivityIndicator size='small' color='#FFF' />
                ) : (
                  <Text style={styles.sendBtnIcon}>➤</Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Full-screen image preview */}
      <Modal
        visible={!!previewImageUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUrl(null)}
      >
        <Pressable
          style={styles.imagePreviewOverlay}
          onPress={() => setPreviewImageUrl(null)}
        >
          <View style={styles.imagePreviewHeader}>
            <TouchableOpacity
              onPress={() => setPreviewImageUrl(null)}
              style={styles.imagePreviewCloseBtn}
            >
              <Text style={styles.imagePreviewCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          {previewImageUrl && (
            <Image
              source={{ uri: previewImageUrl }}
              style={{
                width: screenWidth,
                height: screenHeight * 0.75,
              }}
              resizeMode="contain"
            />
          )}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 14 },
  messageList: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },

  messageRow: { flexDirection: 'row', marginBottom: 4 },
  messageRowMine: { justifyContent: 'flex-end' },
  messageRowOther: { justifyContent: 'flex-start' },

  avatarCol: { width: 36, marginRight: 6, justifyContent: 'flex-end' },
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarSmallText: { fontSize: 14, fontWeight: 'bold', color: '#FFF' },
  avatarSpacer: { width: 32, height: 32 },

  bubbleCol: { maxWidth: '75%' },
  bubbleColMine: { alignItems: 'flex-end' },

  senderLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
    marginLeft: 4,
  },

  bubble: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18 },
  bubbleMine: { backgroundColor: '#1E3A8A', borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleOptimistic: { opacity: 0.55 },
  attachmentList: { gap: 8, marginBottom: 6 },
  attachmentImage: {
    width: 220,
    height: 220,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  fileAttachmentCard: {
    minWidth: 170,
    maxWidth: 220,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  fileAttachmentName: { color: '#111827', fontSize: 13, fontWeight: '600' },
  fileAttachmentMeta: { color: '#6B7280', fontSize: 11, marginTop: 2 },

  bubbleText: { fontSize: 16, lineHeight: 22, color: '#1F2937' },
  bubbleTextMine: { color: '#FFFFFF' },

  timeText: { fontSize: 11, color: '#9CA3AF', marginTop: 2, marginLeft: 4 },
  timeTextMine: { marginRight: 4, marginLeft: 0, textAlign: 'right' },

  emptyChat: {
    alignItems: 'center',
    paddingTop: 60,
    transform: [{ scaleY: -1 }],
  },
  emptyChatIcon: { fontSize: 48, marginBottom: 12 },
  emptyChatText: { fontSize: 16, color: '#9CA3AF' },

  inputBar: {
    flexDirection: 'row',
    padding: 8,
    paddingHorizontal: 12,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'flex-end',
  },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  attachBtnDisabled: { opacity: 0.7 },
  inputField: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
    maxHeight: 100,
    minHeight: 42,
    color: '#111827',
  },
  sendBtn: {
    marginLeft: 10,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1E3A8A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#CBD5E1' },
  sendBtnIcon: { color: '#FFFFFF', fontSize: 20, marginLeft: 2 },

  // Full-screen image preview
  imagePreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreviewHeader: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  imagePreviewCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreviewCloseText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
