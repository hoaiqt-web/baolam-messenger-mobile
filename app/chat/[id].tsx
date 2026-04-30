import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  StatusBar,
} from 'react-native';
import { Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { httpClient } from '@/services/api/httpClient';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';
import { Audio } from 'expo-av';
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

// Date separator helper (ported from web messenger)
function formatDateSeparator(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - msgDate.getTime()) / 86400000);
  if (diffDays === 0) return 'Hôm nay';
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays < 7) {
    const dayNames = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    return dayNames[d.getDay()];
  }
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  if (d.getFullYear() === now.getFullYear()) return `${day}/${month}`;
  return `${day}/${month}/${d.getFullYear()}`;
}

// Notification sound player
let _notifSound: Audio.Sound | null = null;
async function playNotificationSound() {
  try {
    if (_notifSound) {
      await _notifSound.replayAsync();
    } else {
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/sounds/notification.mp3'),
        { shouldPlay: true, volume: 0.5 },
      );
      _notifSound = sound;
    }
  } catch {
    // silently fail
  }
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
  // Reaction code ↔ emoji mapping (matches web ReactionPicker.tsx)
  const REACTION_MAP: { code: string; emoji: string }[] = [
    { code: 'LIKE', emoji: '👍' },
    { code: 'LOVE', emoji: '❤️' },
    { code: 'HAHA', emoji: '😆' },
    { code: 'ANGRY', emoji: '😡' },
    { code: 'CRY', emoji: '😭' },
    { code: 'SAD', emoji: '😢' },
  ];
  const emojiToCode = (emoji: string) => REACTION_MAP.find((r) => r.emoji === emoji)?.code || emoji;
  const codeToEmoji = (code: string) => REACTION_MAP.find((r) => r.code === code)?.emoji || code;

  const REALTIME_IDLE_THRESHOLD_MS = 15_000;
  const POLL_INTERVAL_HEALTHY_MS = 25_000;
  const POLL_INTERVAL_DEGRADED_MS = 5_000;
  const { id, name, type } = useLocalSearchParams();
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
  const isGroup = type === 'group';
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<any>(null);
  const [menuTarget, setMenuTarget] = useState<any>(null);
  const [forwardSource, setForwardSource] = useState<any>(null);
  const [forwardConversations, setForwardConversations] = useState<any[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<any[]>([]);
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;

  // Group management state
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [groupNameInput, setGroupNameInput] = useState(chatTitle);
  const [isRenamingGroup, setIsRenamingGroup] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [addMemberResults, setAddMemberResults] = useState<any[]>([]);
  const [isAddingMember, setIsAddingMember] = useState(false);

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

    // Mark conversation as read when entering
    if (Number.isFinite(conversationId) && conversationId > 0) {
      httpClient.post(`/conversations/${conversationId}/mark-read`).catch(() => {});
    }
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

        // Play notification sound for messages from others
        const incomingSenderId = incoming.sender_id || incoming.senderId || incoming.sender?.id;
        if (incomingSenderId && Number(incomingSenderId) !== currentUserId) {
          void playNotificationSound();
        }
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

  const handleRecall = async (message: any) => {
    const messageId = Number(message.id);
    if (!messageId) return;
    Alert.alert('Thu hồi tin nhắn', 'Bạn muốn thu hồi tin nhắn này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Thu hồi',
        style: 'destructive',
        onPress: async () => {
          try {
            await httpClient.post(`/conversations/${conversationId}/messages/${messageId}/recall`);
            setMessages((prev) =>
              prev.map((msg) =>
                Number(msg.id) === messageId
                  ? { ...msg, isRecalled: true, body: '' }
                  : msg,
              ),
            );
          } catch {
            Alert.alert('Lỗi', 'Không thể thu hồi tin nhắn.');
          }
        },
      },
    ]);
  };

  const handleToggleReaction = async (item: any, emoji: string) => {
    if (!item) return;
    const messageId = Number(item.id);
    if (!messageId) return;
    const reactionCode = emojiToCode(emoji);

    // Optimistic update using CODE (not emoji)
    const oldSummary = item.reactions_summary || {};
    const newSummary = { ...oldSummary };
    const wasReacted = item.user_reaction === reactionCode;

    if (wasReacted) {
      newSummary[reactionCode] = Math.max(0, (newSummary[reactionCode] || 1) - 1);
      if (newSummary[reactionCode] === 0) delete newSummary[reactionCode];
    } else {
      if (item.user_reaction && newSummary[item.user_reaction]) {
        newSummary[item.user_reaction] = Math.max(0, newSummary[item.user_reaction] - 1);
        if (newSummary[item.user_reaction] === 0) delete newSummary[item.user_reaction];
      }
      newSummary[reactionCode] = (newSummary[reactionCode] || 0) + 1;
    }

    setMessages((prev) =>
      prev.map((msg) =>
        Number(msg.id) === messageId
          ? { ...msg, reactions_summary: newSummary, user_reaction: wasReacted ? null : reactionCode }
          : msg,
      ),
    );

    try {
      await httpClient.post(`/messages/${messageId}/reactions`, { type: reactionCode });
    } catch (err: any) {
      console.error('Reaction failed:', err?.response?.status, err?.response?.data, err?.message);
      setMessages((prev) =>
        prev.map((msg) =>
          Number(msg.id) === messageId
            ? { ...msg, reactions_summary: oldSummary, user_reaction: item.user_reaction }
            : msg,
        ),
      );
    }
  };

  // ===== GROUP MANAGEMENT HANDLERS =====
  const fetchGroupMembers = async () => {
    try {
      const { data } = await httpClient.get(`/conversations/${conversationId}/participants`);
      setGroupMembers(data.participants || data || []);
    } catch {
      setGroupMembers([]);
    }
  };

  const handleOpenGroupSettings = () => {
    setGroupNameInput(chatTitle);
    fetchGroupMembers();
    setShowGroupSettings(true);
  };

  const handleRenameGroup = async () => {
    const newName = groupNameInput.trim();
    if (!newName || newName === chatTitle) return;
    setIsRenamingGroup(true);
    try {
      await httpClient.put(`/conversations/${conversationId}/name`, { name: newName });
      Alert.alert('✅', `Đã đổi tên nhóm thành "${newName}"`);
      router.setParams({ name: newName });
    } catch {
      Alert.alert('Lỗi', 'Không thể đổi tên nhóm');
    } finally {
      setIsRenamingGroup(false);
    }
  };

  const handleRemoveMember = (member: any) => {
    const memberName = member.fullName || member.full_name || member.username;
    Alert.alert(
      'Xóa thành viên',
      `Bạn có chắc muốn xóa "${memberName}" khỏi nhóm?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            try {
              await httpClient.delete(`/conversations/${conversationId}/members/${member.id}`);
              setGroupMembers((prev) => prev.filter((m) => m.id !== member.id));
              Alert.alert('✅', `Đã xóa ${memberName}`);
            } catch {
              Alert.alert('Lỗi', 'Không thể xóa thành viên');
            }
          },
        },
      ],
    );
  };

  const handleSearchAddMember = async (query: string) => {
    setAddMemberSearch(query);
    if (query.length < 1) {
      setAddMemberResults([]);
      return;
    }
    try {
      const { data } = await httpClient.get('/users/search', { params: { query } });
      const users = data.users || data || [];
      // Filter out existing members
      const memberIds = new Set(groupMembers.map((m: any) => m.id));
      setAddMemberResults(users.filter((u: any) => !memberIds.has(u.id)));
    } catch {
      setAddMemberResults([]);
    }
  };

  const handleAddMember = async (user: any) => {
    setIsAddingMember(true);
    try {
      await httpClient.post(`/conversations/${conversationId}/members`, { userIds: [user.id] });
      const memberName = user.fullName || user.full_name || user.username;
      Alert.alert('✅', `Đã thêm ${memberName} vào nhóm`);
      setAddMemberSearch('');
      setAddMemberResults([]);
      setShowAddMember(false);
      fetchGroupMembers();
    } catch {
      Alert.alert('Lỗi', 'Không thể thêm thành viên');
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleChangeGroupAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const formData = new FormData();
      formData.append('avatar', {
        uri: asset.uri,
        name: `avatar-${Date.now()}.jpg`,
        type: 'image/jpeg',
      } as any);
      await httpClient.post(`/conversations/${conversationId}/avatar`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      Alert.alert('✅', 'Đã cập nhật ảnh nhóm');
    } catch {
      Alert.alert('Lỗi', 'Không thể đổi ảnh nhóm');
    }
  };

  // ===== GALLERY & FILES =====
  const [showGallery, setShowGallery] = useState(false);
  const [galleryImages, setGalleryImages] = useState<any[]>([]);
  const [showFileList, setShowFileList] = useState(false);
  const [fileAttachments, setFileAttachments] = useState<any[]>([]);

  const handleOpenGallery = async () => {
    try {
      const { data } = await httpClient.get(`/conversations/${conversationId}/attachments`, {
        params: { type: 'image', limit: 50 },
      });
      setGalleryImages(data.attachments || data || []);
      setShowGallery(true);
    } catch {
      Alert.alert('Lỗi', 'Không thể tải gallery');
    }
  };

  const handleOpenFileList = async () => {
    try {
      const { data } = await httpClient.get(`/conversations/${conversationId}/attachments`);
      const allAttachments = data.attachments || data || [];
      setFileAttachments(allAttachments.filter((a: any) => a.type !== 'image'));
      setShowFileList(true);
    } catch {
      Alert.alert('Lỗi', 'Không thể tải danh sách file');
    }
  };

  // ===== IN-CONVERSATION SEARCH =====
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [msgSearchQuery, setMsgSearchQuery] = useState('');
  const [msgSearchResults, setMsgSearchResults] = useState<any[]>([]);
  const [isSearchingMsgs, setIsSearchingMsgs] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const handleSearchMessages = async (query: string) => {
    setMsgSearchQuery(query);
    if (query.length < 2) {
      setMsgSearchResults([]);
      return;
    }
    setIsSearchingMsgs(true);
    try {
      const { data } = await httpClient.get(
        `/conversations/${conversationId}/messages/search`,
        { params: { q: query } },
      );
      setMsgSearchResults(data.messages || data || []);
    } catch {
      setMsgSearchResults([]);
    } finally {
      setIsSearchingMsgs(false);
    }
  };

  const handleScrollToMessage = async (messageId: number) => {
    setShowMsgSearch(false);
    setMsgSearchQuery('');
    setMsgSearchResults([]);
    try {
      // Load messages around the target
      const { data } = await httpClient.get(
        `/conversations/${conversationId}/messages/around/${messageId}`,
      );
      const aroundMessages = data.messages || data || [];
      if (aroundMessages.length > 0) {
        setMessages(aroundMessages);
        // Scroll to the target message after a short delay
        setTimeout(() => {
          const idx = aroundMessages.findIndex((m: any) => Number(m.id) === messageId);
          if (idx >= 0 && flatListRef.current) {
            flatListRef.current.scrollToIndex({ index: idx, animated: true });
          }
        }, 300);
      }
    } catch {
      Alert.alert('Lỗi', 'Không thể nhảy đến tin nhắn');
    }
  };

  // ===== USER PROFILE =====
  const [showProfile, setShowProfile] = useState(false);
  const [profileUser, setProfileUser] = useState<any>(null);

  const handleViewProfile = async (username: string) => {
    try {
      const { data } = await httpClient.get(`/users/${encodeURIComponent(username)}/profile`);
      setProfileUser(data.user || data);
      setShowProfile(true);
    } catch {
      Alert.alert('Lỗi', 'Không thể tải thông tin người dùng');
    }
  };

  // ===== REACTION DETAILS =====
  const [showReactionDetail, setShowReactionDetail] = useState(false);
  const [reactionDetailData, setReactionDetailData] = useState<any[]>([]);

  const handleViewReactionDetail = async (messageId: number) => {
    try {
      const { data } = await httpClient.get(`/messages/${messageId}/reactions`);
      setReactionDetailData(data.reactions || data || []);
      setShowReactionDetail(true);
    } catch {
      Alert.alert('Lỗi', 'Không thể tải chi tiết reactions');
    }
  };

  const handleLongPressMessage = (item: any) => {
    const isRecalled = item.isRecalled || item.is_recalled;
    if (isRecalled) return;
    setMenuTarget(item);
  };

  // Forward: load conversations when forward source is set
  useEffect(() => {
    if (!forwardSource) return;
    httpClient.get('/conversations')
      .then(({ data }) => setForwardConversations(data.conversations || data || []))
      .catch(() => setForwardConversations([]));
  }, [forwardSource]);

  const handleForwardTo = async (targetConvId: number) => {
    if (!forwardSource) return;
    try {
      const forwardedFrom = {
        id: forwardSource.id,
        body: forwardSource.body || '',
        sender: forwardSource.sender || { id: 0, username: '', fullName: '' },
        attachments: forwardSource.attachments || [],
        isRecalled: false,
      };
      await httpClient.post(`/conversations/${targetConvId}/messages`, {
        body: '',
        forwardedFrom,
      });
      Alert.alert('✅', 'Đã chuyển tiếp tin nhắn');
    } catch {
      Alert.alert('Lỗi', 'Không thể chuyển tiếp');
    }
    setForwardSource(null);
  };

  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;
    animateSendButton();

    const textToSend = inputText.trim();
    const replyToId = replyTarget ? Number(replyTarget.id) : undefined;
    setInputText('');
    setReplyTarget(null);
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
      replyTo: replyTarget
        ? {
            id: replyTarget.id,
            body: replyTarget.body,
            sender: replyTarget.sender,
          }
        : null,
    };
    setMessages((prev) => [optimisticMessage, ...prev]);

    try {
      const payload: any = {
        body: textToSend,
        client_message_id: tempId,
      };
      if (replyToId) {
        payload.replyToMessageId = replyToId;
      }
      const { data } = await httpClient.post(`/conversations/${id}/messages`, payload);
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

    // Date separator (FlatList is inverted, so "next" = older message below)
    const msgDate = formatDateSeparator(item.sentAt || item.sent_at || item.created_at);
    const nextDate = nextMsg
      ? formatDateSeparator(nextMsg.sentAt || nextMsg.sent_at || nextMsg.created_at)
      : null;
    const showDateSeparator = !nextMsg || msgDate !== nextDate;

    // Recalled message
    const isRecalled = item.isRecalled || item.is_recalled;

    // Reply quote
    const replyTo = item.replyTo || item.reply_to;
    const replySnippet = replyTo?.body ? replyTo.body.slice(0, 80) : null;
    const replySenderName = replyTo?.sender?.fullName || replyTo?.sender?.full_name || replyTo?.sender?.username || '';

    return (
      <View>
        {showDateSeparator && msgDate ? (
          <View style={styles.dateSeparator}>
            <View style={styles.dateSeparatorLine} />
            <Text style={styles.dateSeparatorText}>{msgDate}</Text>
            <View style={styles.dateSeparatorLine} />
          </View>
        ) : null}
        <View
          style={[
            styles.messageRow,
            isMine ? styles.messageRowMine : styles.messageRowOther,
          ]}
        >
        {!isMine && (
          <View style={styles.avatarCol}>
            {isFirstInGroup ? (
              <TouchableOpacity
                onPress={() => {
                  const username = item.sender?.username;
                  if (username) handleViewProfile(username);
                }}
              >
                <View
                  style={[styles.avatarSmall, { backgroundColor: avatarColor }]}
                >
                  <Text style={styles.avatarSmallText}>
                    {senderName[0].toUpperCase()}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.avatarSpacer} />
            )}
          </View>
        )}
        <TouchableOpacity
          style={[styles.bubbleCol, isMine && styles.bubbleColMine]}
          activeOpacity={0.7}
          onLongPress={() => handleLongPressMessage(item)}
          delayLongPress={400}
        >
          {!isMine && isFirstInGroup && (
            <Text style={[styles.senderLabel, { color: avatarColor }]}>
              {senderName}
            </Text>
          )}
          {/* Reply quote */}
          {replyTo && replySnippet ? (
            <View style={styles.replyQuote}>
              <View style={styles.replyQuoteBar} />
              <View style={styles.replyQuoteContent}>
                <Text style={styles.replyQuoteSender}>{replySenderName}</Text>
                <Text style={styles.replyQuoteText} numberOfLines={2}>{replySnippet}</Text>
              </View>
            </View>
          ) : null}
          <View
            style={[
              styles.bubble,
              isMine ? styles.bubbleMine : styles.bubbleOther,
              isRecalled && styles.bubbleRecalled,
              item.is_optimistic && styles.bubbleOptimistic,
            ]}
          >
            {isRecalled ? (
              <Text style={styles.recalledText}>Tin nhắn đã thu hồi</Text>
            ) : attachments.length > 0 ? (
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
                    <TouchableOpacity
                      key={key}
                      style={styles.fileAttachmentCard}
                      onPress={() => {
                        const fileUrl = attachment?.url || attachment?.downloadUrl;
                        if (fileUrl) Linking.openURL(fileUrl).catch(() => {});
                      }}
                    >
                      <Text style={styles.fileAttachmentName} numberOfLines={1}>
                        📄 {attachment?.originalName || 'Tệp đính kèm'}
                      </Text>
                      <Text style={styles.fileAttachmentMeta}>
                        {formatFileSize(attachment?.size)} • Nhấn để tải
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
            {!isRecalled && hasText ? (
              <Text
                style={[styles.bubbleText, isMine && styles.bubbleTextMine]}
              >
                {item.body}
              </Text>
            ) : null}
          </View>
          {/* Reactions summary */}
          {!isRecalled && item.reactions_summary && Object.keys(item.reactions_summary).length > 0 && (
            <View style={[styles.reactionsRow, isMine && styles.reactionsRowMine]}>
              {Object.entries(item.reactions_summary).map(([code, count]: [string, any]) => (
                <TouchableOpacity
                  key={code}
                  style={[
                    styles.reactionBadge,
                    item.user_reaction === code && styles.reactionBadgeActive,
                  ]}
                  onPress={() => handleToggleReaction(item, codeToEmoji(code))}
                  onLongPress={() => handleViewReactionDetail(Number(item.id))}
                >
                  <Text style={styles.reactionEmoji}>{codeToEmoji(code)}</Text>
                  {Number(count) > 1 && <Text style={styles.reactionCount}>{count}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}
          {timeStr ? (
            <Text style={[styles.timeText, isMine && styles.timeTextMine]}>
              {timeStr}
              {isMine && !isRecalled && (
                item.is_optimistic
                  ? ' ○'
                  : item.read_by && item.read_by.length > 0
                    ? ' ✓✓'
                    : ' ✓'
              )}
            </Text>
          ) : null}
        </TouchableOpacity>
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
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E', marginRight: 4 }} />
                <Text style={{ color: '#93C5FD', fontSize: 11 }}>Online</Text>
              </View>
              <TouchableOpacity onPress={() => setShowMsgSearch(true)}>
                <Ionicons name="search-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              {isGroup && (
                <TouchableOpacity onPress={handleOpenGroupSettings}>
                  <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              )}
            </View>
          ),
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
            ref={flatListRef}
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

          {/* Reply preview bar */}
          {replyTarget && (
            <View style={styles.replyPreview}>
              <View style={styles.replyPreviewBar} />
              <View style={styles.replyPreviewContent}>
                <Text style={styles.replyPreviewSender}>
                  {getSenderName(replyTarget)}
                </Text>
                <Text style={styles.replyPreviewText} numberOfLines={1}>
                  {(replyTarget.body || '').slice(0, 60) || 'Ảnh / File'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setReplyTarget(null)}
                style={styles.replyPreviewClose}
              >
                <Ionicons name="close" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>
          )}

          {/* @Mention suggestions */}
          {mentionQuery !== null && mentionSuggestions.length > 0 && (
            <View style={styles.mentionSuggestions}>
              {mentionSuggestions.slice(0, 5).map((u: any) => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.mentionItem}
                  onPress={() => {
                    const beforeAt = inputText.slice(0, inputText.lastIndexOf('@'));
                    setInputText(`${beforeAt}@${u.username} `);
                    setMentionQuery(null);
                    setMentionSuggestions([]);
                  }}
                >
                  <Text style={styles.mentionName}>{u.fullName || u.full_name || u.username}</Text>
                  <Text style={styles.mentionUsername}>@{u.username}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

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
              onChangeText={(text) => {
                setInputText(text);
                // Detect @mention
                const atMatch = text.match(/@(\w*)$/);
                if (atMatch) {
                  const query = atMatch[1];
                  setMentionQuery(query);
                  if (query.length >= 1) {
                    httpClient.get(`/conversations/${conversationId}/participants`)
                      .then(({ data }) => {
                        const participants = data.participants || data || [];
                        const filtered = participants.filter((p: any) => {
                          const name = (p.fullName || p.full_name || p.username || '').toLowerCase();
                          return name.includes(query.toLowerCase());
                        });
                        setMentionSuggestions(filtered);
                      })
                      .catch(() => setMentionSuggestions([]));
                  } else {
                    // Show all participants when just typing @
                    httpClient.get(`/conversations/${conversationId}/participants`)
                      .then(({ data }) => setMentionSuggestions(data.participants || data || []))
                      .catch(() => setMentionSuggestions([]));
                  }
                } else {
                  setMentionQuery(null);
                  setMentionSuggestions([]);
                }
              }}
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

      {/* Full-screen image preview with zoom */}
      <Modal
        visible={!!previewImageUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUrl(null)}
        statusBarTranslucent
      >
        <View style={styles.imagePreviewOverlay}>
          <View style={styles.imagePreviewHeader}>
            <TouchableOpacity
              onPress={() => setPreviewImageUrl(null)}
              style={styles.imagePreviewCloseBtn}
            >
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          {previewImageUrl && (
            <ReactNativeZoomableView
              maxZoom={5}
              minZoom={1}
              zoomStep={0.5}
              initialZoom={1}
              bindToBorders
              doubleTapZoomToCenter
              style={{ flex: 1 }}
              contentWidth={screenWidth}
              contentHeight={screenHeight * 0.8}
            >
              <Image
                source={{ uri: previewImageUrl }}
                style={{
                  width: screenWidth,
                  height: screenHeight * 0.8,
                }}
                resizeMode="contain"
              />
            </ReactNativeZoomableView>
          )}
          <View style={styles.imagePreviewFooter}>
            <Text style={styles.imagePreviewHint}>
              Chạm 2 lần để phóng to • Chụm ngón tay để zoom
            </Text>
          </View>
        </View>
      </Modal>

      {/* Message actions bottom sheet */}
      <Modal
        visible={!!menuTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuTarget(null)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setMenuTarget(null)}
        >
          <View style={styles.menuSheet}>
            {/* Quick reactions row */}
            <View style={styles.menuReactionsRow}>
              {REACTION_MAP.map(({ code, emoji }) => (
                <TouchableOpacity
                  key={code}
                  style={[
                    styles.menuReactionBtn,
                    menuTarget?.user_reaction === code && styles.menuReactionBtnActive,
                  ]}
                  onPress={() => {
                    handleToggleReaction(menuTarget, emoji);
                    setMenuTarget(null);
                  }}
                >
                  <Text style={styles.menuReactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.menuDivider} />

            {/* Action buttons */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setReplyTarget(menuTarget);
                setMenuTarget(null);
              }}
            >
              <Text style={styles.menuItemIcon}>↩️</Text>
              <Text style={styles.menuItemText}>Trả lời</Text>
            </TouchableOpacity>

            {Boolean(String(menuTarget?.body || '').trim()) && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  try {
                    const { Clipboard } = require('react-native');
                    Clipboard.setString(menuTarget?.body || '');
                  } catch {}
                  setMenuTarget(null);
                }}
              >
                <Text style={styles.menuItemIcon}>📋</Text>
                <Text style={styles.menuItemText}>Sao chép</Text>
              </TouchableOpacity>
            )}

            {/* Forward */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setForwardSource(menuTarget);
                setMenuTarget(null);
              }}
            >
              <Text style={styles.menuItemIcon}>↪️</Text>
              <Text style={styles.menuItemText}>Chuyển tiếp</Text>
            </TouchableOpacity>

            {/* Pin */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={async () => {
                const msgId = Number(menuTarget?.id);
                if (msgId && conversationId > 0) {
                  try {
                    await httpClient.post(`/conversations/${conversationId}/messages/${msgId}/pin`);
                    Alert.alert('✅', 'Đã ghim tin nhắn');
                  } catch {
                    Alert.alert('Lỗi', 'Không thể ghim tin nhắn');
                  }
                }
                setMenuTarget(null);
              }}
            >
              <Text style={styles.menuItemIcon}>📌</Text>
              <Text style={styles.menuItemText}>Ghim tin nhắn</Text>
            </TouchableOpacity>

            {(() => {
              const senderId = menuTarget?.sender_id || menuTarget?.senderId || menuTarget?.sender?.id;
              return senderId === currentUserId ? (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    handleRecall(menuTarget);
                    setMenuTarget(null);
                  }}
                >
                  <Text style={styles.menuItemIcon}>🗑️</Text>
                  <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Thu hồi</Text>
                </TouchableOpacity>
              ) : null;
            })()}

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setMenuTarget(null)}
            >
              <Text style={styles.menuItemIcon}>✕</Text>
              <Text style={[styles.menuItemText, { color: '#9CA3AF' }]}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Forward conversation picker */}
      <Modal
        visible={!!forwardSource}
        transparent
        animationType="slide"
        onRequestClose={() => setForwardSource(null)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setForwardSource(null)}
        >
          <View style={[styles.menuSheet, { maxHeight: screenHeight * 0.6 }]}>
            <Text style={styles.forwardTitle}>↪️ Chuyển tiếp đến...</Text>
            <View style={styles.menuDivider} />
            <FlatList
              data={forwardConversations}
              keyExtractor={(c) => String(c.id)}
              renderItem={({ item: conv }) => {
                const convTitle = conv.name || conv.label || `Hội thoại #${conv.id}`;
                return (
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => handleForwardTo(Number(conv.id))}
                  >
                    <Text style={styles.menuItemIcon}>💬</Text>
                    <Text style={styles.menuItemText} numberOfLines={1}>{convTitle}</Text>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#1E3A8A" />
                  <Text style={{ color: '#9CA3AF', marginTop: 8 }}>Đang tải...</Text>
                </View>
              }
            />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setForwardSource(null)}
            >
              <Text style={styles.menuItemIcon}>✕</Text>
              <Text style={[styles.menuItemText, { color: '#9CA3AF' }]}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== GROUP SETTINGS MODAL ===== */}
      <Modal
        visible={showGroupSettings}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGroupSettings(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowGroupSettings(false)}
        >
          <View style={[styles.menuSheet, { maxHeight: screenHeight * 0.75 }]}>
            <Text style={styles.forwardTitle}>⚙️ Cài đặt nhóm</Text>
            <View style={styles.menuDivider} />

            {/* Rename Group */}
            <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Tên nhóm</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#D1D5DB',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    fontSize: 14,
                    color: '#111827',
                  }}
                  value={groupNameInput}
                  onChangeText={setGroupNameInput}
                  placeholder="Nhập tên nhóm..."
                />
                <TouchableOpacity
                  style={{
                    backgroundColor: '#1E3A8A',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 6,
                    opacity: isRenamingGroup ? 0.5 : 1,
                  }}
                  onPress={handleRenameGroup}
                  disabled={isRenamingGroup}
                >
                  <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>
                    {isRenamingGroup ? '...' : 'Đổi'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.menuDivider} />

            {/* Change Avatar */}
            <TouchableOpacity style={styles.menuItem} onPress={handleChangeGroupAvatar}>
              <Text style={styles.menuItemIcon}>🖼️</Text>
              <Text style={styles.menuItemText}>Đổi ảnh đại diện nhóm</Text>
            </TouchableOpacity>

            {/* Gallery */}
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowGroupSettings(false); handleOpenGallery(); }}>
              <Text style={styles.menuItemIcon}>📷</Text>
              <Text style={styles.menuItemText}>Gallery ảnh</Text>
            </TouchableOpacity>

            {/* Files */}
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowGroupSettings(false); handleOpenFileList(); }}>
              <Text style={styles.menuItemIcon}>📁</Text>
              <Text style={styles.menuItemText}>File đính kèm</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* Members */}
            <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>
                  Thành viên ({groupMembers.length})
                </Text>
                <TouchableOpacity
                  onPress={() => setShowAddMember(true)}
                  style={{ backgroundColor: '#1E3A8A', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}
                >
                  <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '600' }}>+ Thêm</Text>
                </TouchableOpacity>
              </View>
            </View>

            <FlatList
              data={groupMembers}
              keyExtractor={(m) => String(m.id)}
              style={{ maxHeight: 200 }}
              renderItem={({ item: member }) => {
                const mName = member.fullName || member.full_name || member.username;
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 }}>
                    <View style={{
                      width: 32, height: 32, borderRadius: 16,
                      backgroundColor: getAvatarColor(mName),
                      justifyContent: 'center', alignItems: 'center', marginRight: 10,
                    }}>
                      <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>
                        {mName[0]?.toUpperCase() || '?'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, color: '#1A1A1A' }}>{mName}</Text>
                      <Text style={{ fontSize: 11, color: '#9CA3AF' }}>@{member.username}</Text>
                    </View>
                    {member.id !== currentUserId && (
                      <TouchableOpacity onPress={() => handleRemoveMember(member)}>
                        <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
            />

            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setShowGroupSettings(false)}
            >
              <Text style={styles.menuItemIcon}>✕</Text>
              <Text style={[styles.menuItemText, { color: '#9CA3AF' }]}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== ADD MEMBER MODAL ===== */}
      <Modal
        visible={showAddMember}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddMember(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowAddMember(false)}
        >
          <View style={[styles.menuSheet, { maxHeight: screenHeight * 0.6 }]}>
            <Text style={styles.forwardTitle}>👥 Thêm thành viên</Text>
            <View style={styles.menuDivider} />
            <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: '#D1D5DB',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  fontSize: 14,
                  color: '#111827',
                }}
                placeholder="Tìm người dùng..."
                placeholderTextColor="#9CA3AF"
                value={addMemberSearch}
                onChangeText={handleSearchAddMember}
                autoFocus
              />
            </View>
            <FlatList
              data={addMemberResults}
              keyExtractor={(u) => String(u.id)}
              style={{ maxHeight: 250 }}
              renderItem={({ item: user }) => {
                const uName = user.fullName || user.full_name || user.username;
                return (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}
                    onPress={() => handleAddMember(user)}
                    disabled={isAddingMember}
                  >
                    <View style={{
                      width: 32, height: 32, borderRadius: 16,
                      backgroundColor: getAvatarColor(uName),
                      justifyContent: 'center', alignItems: 'center', marginRight: 10,
                    }}>
                      <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>
                        {uName[0]?.toUpperCase() || '?'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, color: '#1A1A1A' }}>{uName}</Text>
                      <Text style={{ fontSize: 11, color: '#9CA3AF' }}>@{user.username}</Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={22} color="#1E3A8A" />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                addMemberSearch.length > 0 ? (
                  <Text style={{ textAlign: 'center', padding: 20, color: '#9CA3AF', fontSize: 13 }}>
                    Không tìm thấy người dùng
                  </Text>
                ) : null
              }
            />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setShowAddMember(false); setAddMemberSearch(''); setAddMemberResults([]); }}
            >
              <Text style={styles.menuItemIcon}>✕</Text>
              <Text style={[styles.menuItemText, { color: '#9CA3AF' }]}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== GALLERY MODAL ===== */}
      <Modal visible={showGallery} transparent animationType="slide" onRequestClose={() => setShowGallery(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 48 }}>
            <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600' }}>📷 Gallery ({galleryImages.length})</Text>
            <TouchableOpacity onPress={() => setShowGallery(false)}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={galleryImages}
            keyExtractor={(img) => String(img.id)}
            numColumns={3}
            contentContainerStyle={{ padding: 2 }}
            renderItem={({ item: img }) => (
              <TouchableOpacity
                style={{ width: '33.33%', aspectRatio: 1, padding: 1 }}
                onPress={() => { setShowGallery(false); setPreviewImageUrl(img.url || img.path); }}
              >
                <Image
                  source={{ uri: img.url || img.path || img.thumbnailUrl }}
                  style={{ flex: 1, borderRadius: 2 }}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={{ color: '#9CA3AF', textAlign: 'center', padding: 40, fontSize: 14 }}>
                Chưa có ảnh nào
              </Text>
            }
          />
        </View>
      </Modal>

      {/* ===== FILE LIST MODAL ===== */}
      <Modal visible={showFileList} transparent animationType="slide" onRequestClose={() => setShowFileList(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowFileList(false)}>
          <View style={[styles.menuSheet, { maxHeight: screenHeight * 0.7 }]}>
            <Text style={styles.forwardTitle}>📁 File đính kèm ({fileAttachments.length})</Text>
            <View style={styles.menuDivider} />
            <FlatList
              data={fileAttachments}
              keyExtractor={(f) => String(f.id)}
              renderItem={({ item: file }) => (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => Linking.openURL(file.url || file.path)}
                >
                  <Text style={styles.menuItemIcon}>📄</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuItemText} numberOfLines={1}>{file.originalName || file.name || 'File'}</Text>
                    <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{formatFileSize(file.size)}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ textAlign: 'center', padding: 20, color: '#9CA3AF', fontSize: 13 }}>Chưa có file nào</Text>
              }
            />
            <TouchableOpacity style={styles.menuItem} onPress={() => setShowFileList(false)}>
              <Text style={styles.menuItemIcon}>✕</Text>
              <Text style={[styles.menuItemText, { color: '#9CA3AF' }]}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== MESSAGE SEARCH MODAL ===== */}
      <Modal visible={showMsgSearch} transparent animationType="slide" onRequestClose={() => setShowMsgSearch(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowMsgSearch(false)}>
          <View style={[styles.menuSheet, { maxHeight: screenHeight * 0.7 }]}>
            <Text style={styles.forwardTitle}>🔍 Tìm tin nhắn</Text>
            <View style={styles.menuDivider} />
            <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
              <TextInput
                style={{
                  borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8,
                  paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, color: '#111827',
                }}
                placeholder="Nhập từ khóa..."
                placeholderTextColor="#9CA3AF"
                value={msgSearchQuery}
                onChangeText={handleSearchMessages}
                autoFocus
              />
            </View>
            {isSearchingMsgs && <ActivityIndicator size="small" color="#1E3A8A" style={{ marginVertical: 8 }} />}
            <FlatList
              data={msgSearchResults}
              keyExtractor={(m) => String(m.id)}
              style={{ maxHeight: 300 }}
              renderItem={({ item: msg }) => {
                const sName = getSenderName(msg);
                const t = formatTime(msg.sentAt || msg.sent_at);
                return (
                  <TouchableOpacity
                    style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#EEE' }}
                    onPress={() => handleScrollToMessage(Number(msg.id))}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#1A1A1A' }}>{sName}</Text>
                      <Text style={{ fontSize: 11, color: '#999' }}>{t}</Text>
                    </View>
                    <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }} numberOfLines={2}>{msg.body}</Text>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                msgSearchQuery.length >= 2 && !isSearchingMsgs ? (
                  <Text style={{ textAlign: 'center', padding: 20, color: '#9CA3AF', fontSize: 13 }}>Không tìm thấy</Text>
                ) : null
              }
            />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMsgSearch(false); setMsgSearchQuery(''); setMsgSearchResults([]); }}>
              <Text style={styles.menuItemIcon}>✕</Text>
              <Text style={[styles.menuItemText, { color: '#9CA3AF' }]}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== USER PROFILE MODAL ===== */}
      <Modal visible={showProfile} transparent animationType="slide" onRequestClose={() => setShowProfile(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowProfile(false)}>
          <View style={[styles.menuSheet, { alignItems: 'center', paddingVertical: 24 }]}>
            {profileUser && (
              <>
                <View style={{
                  width: 64, height: 64, borderRadius: 32,
                  backgroundColor: getAvatarColor(profileUser.fullName || profileUser.username || '?'),
                  justifyContent: 'center', alignItems: 'center', marginBottom: 12,
                }}>
                  <Text style={{ color: '#FFF', fontSize: 24, fontWeight: '600' }}>
                    {(profileUser.fullName || profileUser.username || '?')[0]?.toUpperCase()}
                  </Text>
                </View>
                <Text style={{ fontSize: 18, fontWeight: '600', color: '#1A1A1A' }}>
                  {profileUser.fullName || profileUser.full_name || profileUser.username}
                </Text>
                <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>
                  @{profileUser.username}
                </Text>
                {profileUser.email && (
                  <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
                    📧 {profileUser.email}
                  </Text>
                )}
                {profileUser.department && (
                  <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>
                    🏢 {profileUser.department}
                  </Text>
                )}
              </>
            )}
            <TouchableOpacity
              style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: '#F3F4F6', borderRadius: 8 }}
              onPress={() => setShowProfile(false)}
            >
              <Text style={{ color: '#374151', fontSize: 14 }}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== REACTION DETAIL MODAL ===== */}
      <Modal visible={showReactionDetail} transparent animationType="slide" onRequestClose={() => setShowReactionDetail(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowReactionDetail(false)}>
          <View style={[styles.menuSheet, { maxHeight: screenHeight * 0.5 }]}>
            <Text style={styles.forwardTitle}>😊 Chi tiết reactions</Text>
            <View style={styles.menuDivider} />
            <FlatList
              data={reactionDetailData}
              keyExtractor={(r, i) => `${r.userId || i}`}
              renderItem={({ item: reaction }) => {
                const rName = reaction.user?.fullName || reaction.user?.full_name || reaction.user?.username || 'Ai đó';
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 }}>
                    <Text style={{ fontSize: 20, marginRight: 10 }}>{codeToEmoji(reaction.type)}</Text>
                    <Text style={{ fontSize: 14, color: '#1A1A1A', flex: 1 }}>{rName}</Text>
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={{ textAlign: 'center', padding: 20, color: '#9CA3AF', fontSize: 13 }}>Chưa có reaction nào</Text>
              }
            />
            <TouchableOpacity style={styles.menuItem} onPress={() => setShowReactionDetail(false)}>
              <Text style={styles.menuItemIcon}>✕</Text>
              <Text style={[styles.menuItemText, { color: '#9CA3AF' }]}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreviewCloseText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  imagePreviewFooter: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  imagePreviewHint: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
  },

  // Date separators
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    paddingHorizontal: 20,
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#D1D5DB',
  },
  dateSeparatorText: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    backgroundColor: '#F0F2F5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },

  // Reply quote in message bubble
  replyQuote: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
    marginBottom: 4,
    overflow: 'hidden',
  },
  replyQuoteBar: {
    width: 3,
    backgroundColor: '#1E3A8A',
    borderRadius: 2,
  },
  replyQuoteContent: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  replyQuoteSender: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E3A8A',
    marginBottom: 1,
  },
  replyQuoteText: {
    fontSize: 12,
    color: '#6B7280',
  },

  // Reply preview bar above input
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F4FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  replyPreviewBar: {
    width: 3,
    height: '100%',
    backgroundColor: '#1E3A8A',
    borderRadius: 2,
    marginRight: 8,
    minHeight: 30,
  },
  replyPreviewContent: {
    flex: 1,
  },
  replyPreviewSender: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  replyPreviewText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  replyPreviewClose: {
    padding: 4,
    marginLeft: 8,
  },

  // Recalled message
  bubbleRecalled: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
  },
  recalledText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },

  // Emoji reactions
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },
  reactionsRowMine: {
    justifyContent: 'flex-end',
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  reactionBadgeActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 11,
    color: '#6B7280',
    marginLeft: 2,
  },

  // Message actions bottom sheet
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 32,
    paddingHorizontal: 16,
  },
  menuReactionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  menuReactionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuReactionBtnActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  menuReactionEmoji: {
    fontSize: 22,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  menuItemIcon: {
    fontSize: 18,
    width: 30,
    textAlign: 'center',
  },
  menuItemText: {
    fontSize: 16,
    color: '#111827',
    marginLeft: 8,
  },
  menuItemTextDanger: {
    color: '#EF4444',
  },
  forwardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    paddingVertical: 12,
  },

  // @Mention suggestions
  mentionSuggestions: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    maxHeight: 180,
    paddingHorizontal: 12,
  },
  mentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F3F4F6',
  },
  mentionName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginRight: 8,
  },
  mentionUsername: {
    fontSize: 12,
    color: '#6B7280',
  },
});
