import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  AppState,
  Modal,
  Dimensions,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { httpClient } from '@/services/api/httpClient';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import {
  getLastRealtimeInboundActivityAt,
  getRealtimeConnectionState,
  subscribeConversationMessages,
} from '@/services/realtime/reverbClient';

import {
  getAvatarColor,
  formatTime,
  formatDateSeparator,
  getSenderName,
  formatFileSize,
  REACTION_MAP,
  emojiToCode,
  codeToEmoji,
} from './chatHelpers';
import { getChatStyles } from './chatStyles';
import { useAppTheme } from '@/contexts/ThemeContext';
import { CreateTaskModal } from '@/components/task/CreateTaskModal';
import {
  EVERYONE_MENTION_USERNAME,
  buildMentionIds,
  findActiveMention,
  foldMentionSearchText,
  type MentionParticipant,
} from '@/features/chat/mentionUtils';
import {
  fetchAttachmentReadUrl,
  openAttachmentWithFallback,
  resolveOpenableAttachmentUrl,
} from '@/features/chat/attachmentOpenUtils';
import {
  buildImageGalleryEntries,
  findGalleryStartIndex,
  type ImageGalleryEntry,
} from '@/features/chat/chatImageGallery';
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';
import { ChatImageEditorModal } from '@/components/chat/ChatImageEditorModal';
import { formatConversationListTitle } from '@/features/chat/conversationDisplayUtils';
import { TaskChecklistModal } from '@/widgets/chat/TaskChecklistModal';
import { ManualCreateTaskModal } from '@/widgets/chat/ManualCreateTaskModal';
import { chatApi } from '@/services/api/chatApi';
import type { PinnedMessage } from '@/Models/chat/types';
import {
  useChatPresentationExtras,
  useChatRouteParamsOverride,
} from '@/features/chat/ChatEmbedContext';
import {
  ErpStructuredMessage,
  isErpAssignmentMessage,
  isErpCompletionReport,
} from '@/components/chat/ErpStructuredMessage';
import { useChatUiStore } from '@/features/chat/chatUiStore';
import {
  attendanceHeaderDotColor,
  formatCheckInClock,
} from '@/features/chat/attendanceDisplay';
import { ChatDeleteGroupModal, type DeleteGroupInfo } from '@/components/chat/ChatDeleteGroupModal';
import { ChatReadReceiptsModal } from '@/components/chat/ChatReadReceiptsModal';
import { ChatMessageFilterModal, type MessageListFilter } from '@/components/chat/ChatMessageFilterModal';
import { ChatAiAdvancedModal } from '@/components/chat/ChatAiAdvancedModal';

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

async function appendUploadedMessage(setMessages: any, payload: any) {
  const actualMessage = payload?.message || payload?.data || payload;
  setMessages((prev: any[]) => {
    const exists = prev.some(
      (msg) => Number(msg?.id) === Number(actualMessage?.id),
    );
    return exists ? prev : [actualMessage, ...prev];
  });
}

/** Backend default limit is 20; max allowed is 100 (see MessageService safeLimit). */
const CHAT_MESSAGE_PAGE_SIZE = 100;

function messageSortKey(m: any): number {
  const t = new Date(String(m.sentAt || m.sent_at || m.created_at || 0)).getTime();
  return Number.isFinite(t) ? t : 0;
}

function sortMessagesNewestFirst(msgs: any[]): any[] {
  return [...msgs].sort((a, b) => {
    const dt = messageSortKey(b) - messageSortKey(a);
    if (dt !== 0) return dt;
    return Number(b.id) - Number(a.id);
  });
}

/** Dedup theo id / client id; ưu tiên bản không optimistic (key FlatList). */
function deduplicateMessages(msgs: any[]): any[] {
  const seen = new Map<string, any>();
  for (const msg of msgs) {
    const key = String(msg.id || msg.client_message_id || msg.clientMessageId);
    if (!seen.has(key) || !msg.is_optimistic) {
      seen.set(key, msg);
    }
  }
  return Array.from(seen.values());
}

/** Merge a poll snapshot (API order: oldest → newest) into state without dropping pages loaded via pagination. */
function mergePollPageIntoMessages(prev: any[], apiOldestFirst: any[]): any[] {
  const list = Array.isArray(apiOldestFirst) ? apiOldestFirst : [];
  const incomingNewestFirst = [...list].reverse();
  const map = new Map<string, any>();
  const keyOf = (m: any): string => {
    const id = Number(m.id);
    if (Number.isFinite(id) && id > 0) return `id:${id}`;
    const c = String(m.client_message_id || m.clientMessageId || '').trim();
    return c ? `c:${c}` : '';
  };
  for (const m of prev) {
    const k = keyOf(m);
    if (k) map.set(k, m);
  }
  for (const m of incomingNewestFirst) {
    const k = keyOf(m);
    if (k) map.set(k, m);
  }
  return sortMessagesNewestFirst(Array.from(map.values()));
}

/** Áp một payload realtime vào danh sách (cùng luật với subscribeConversationMessages). */
function applyIncomingRealtimeMessage(prev: any[], incoming: any): any[] {
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
}

type MentionRow =
  | { type: 'all' }
  | { type: 'user'; user: MentionParticipant };

function buildMentionRows(
  query: string,
  participants: MentionParticipant[],
): MentionRow[] {
  const q = query;
  if (q.length === 0) {
    return [{ type: 'all' }];
  }
  const foldedQ = foldMentionSearchText(q);
  const filtered = participants.filter((p) => {
    const name = foldMentionSearchText(
      String(p.fullName ?? (p as { full_name?: string }).full_name ?? ''),
    );
    const uname = foldMentionSearchText(String(p.username ?? ''));
    return name.includes(foldedQ) || uname.includes(foldedQ);
  });
  return filtered.slice(0, 8).map((u) => ({ type: 'user' as const, user: u }));
}

export default function ChatScreen() {
  const { isDark } = useAppTheme();
  const styles = getChatStyles(isDark);
  const replyAccentColor = isDark ? '#00D9FF' : '#1E3A8A';
  const REALTIME_IDLE_THRESHOLD_MS = 15_000;
  const POLL_INTERVAL_HEALTHY_MS = 25_000;
  const POLL_INTERVAL_DEGRADED_MS = 5_000;
  const searchParams = useLocalSearchParams<{
    id?: string;
    name?: string;
    type?: string;
    jumpMessageId?: string;
  }>();
  const routeOverride = useChatRouteParamsOverride();
  const presentationExtras = useChatPresentationExtras();
  const id = String(routeOverride?.id ?? searchParams.id ?? '');
  const name = String(routeOverride?.name ?? searchParams.name ?? '');
  const type = String(routeOverride?.type ?? searchParams.type ?? '');
  const jumpMessageId = String(
    routeOverride?.jumpMessageId ?? searchParams.jumpMessageId ?? '',
  );
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const sendScale = useRef(new Animated.Value(1)).current;
  const conversationId = Number(id);
  const fetchMessagesRef = useRef<() => void>(() => undefined);
  const lastPollAtRef = useRef(0);
  const loadingOlderRef = useRef(false);
  /** Tránh gửi trùng cùng một batch share (Strict Mode / remount). */
  const outgoingShareSessionRef = useRef<string | null>(null);

  const chatTitle = (name as string) || 'Tin nhắn';
  const isGroup = type === 'group';
  type ImageViewerState = {
    urls: string[];
    entries: ImageGalleryEntry[];
    index: number;
  };

  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const [galleryVisibleIndex, setGalleryVisibleIndex] = useState(0);
  const [viewerRotationDeg, setViewerRotationDeg] = useState(0);
  const [imagePagerScrollEnabled, setImagePagerScrollEnabled] = useState(true);
  const [imageEditorTarget, setImageEditorTarget] = useState<{ attachmentId: number } | null>(
    null,
  );
  const imagePagerRef = useRef<FlatList<string>>(null);
  const zoomableRefs = useRef<Record<number, InstanceType<typeof ReactNativeZoomableView> | null>>(
    {},
  );
  const [replyTarget, setReplyTarget] = useState<any>(null);
  const [menuTarget, setMenuTarget] = useState<any>(null);
  const [createTaskTarget, setCreateTaskTarget] = useState<{ id: number; body: string } | null>(null);
  const [forwardSource, setForwardSource] = useState<any>(null);
  const [forwardConversations, setForwardConversations] = useState<any[]>([]);
  const [forwardSearchQuery, setForwardSearchQuery] = useState('');
  const [mentionRows, setMentionRows] = useState<MentionRow[]>([]);
  const mentionCaretRef = useRef(0);
  const mentionActiveRef = useRef<ReturnType<typeof findActiveMention>>(null);
  const inputTextRef = useRef('');
  const composerInputRef = useRef<TextInput>(null);
  const [chatParticipants, setChatParticipants] = useState<MentionParticipant[]>([]);
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const insets = useSafeAreaInsets();
  const isCloudTabEmbed = !!presentationExtras.cloudTabDocumentsNav;

  // Group management state
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [groupNameInput, setGroupNameInput] = useState(chatTitle);
  const [isRenamingGroup, setIsRenamingGroup] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [addMemberResults, setAddMemberResults] = useState<any[]>([]);
  const [isAddingMember, setIsAddingMember] = useState(false);

  const setComposerDraft = useChatUiStore((s) => s.setComposerDraft);
  const clearComposerDraft = useChatUiStore((s) => s.clearComposerDraft);
  const pendingOutgoingShare = useChatUiStore((s) => s.pendingOutgoingShare);
  const clearPendingOutgoingShare = useChatUiStore((s) => s.clearPendingOutgoingShare);

  const [messageFilter, setMessageFilter] = useState<MessageListFilter>({
    filterUserId: null,
    filterDays: null,
    filterStartDate: null,
    filterEndDate: null,
  });
  const [showMessageFilter, setShowMessageFilter] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [showPinnedList, setShowPinnedList] = useState(false);
  const [deleteGroupInfo, setDeleteGroupInfo] = useState<DeleteGroupInfo | null>(null);
  const [showDeleteGroup, setShowDeleteGroup] = useState(false);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [readReceiptMessageId, setReadReceiptMessageId] = useState(0);
  const [showReadReceipts, setShowReadReceipts] = useState(false);
  const [showAiAdvanced, setShowAiAdvanced] = useState(false);
  const [dmPeerUserId, setDmPeerUserId] = useState<number | null>(null);
  const [peerAttendanceLine, setPeerAttendanceLine] = useState<string | null>(null);
  const [peerAttendanceLoading, setPeerAttendanceLoading] = useState(false);

  const filterModalMembers = useMemo(() => {
    const raw = chatParticipants;
    return (Array.isArray(raw) ? raw : []).map((m: any) => ({
      id: Number(m.id),
      fullName: m.fullName || m.full_name,
      full_name: m.full_name,
      username: m.username,
    }));
  }, [chatParticipants]);

  const messageFilterActive = useMemo(
    () =>
      messageFilter.filterUserId != null ||
      messageFilter.filterDays != null ||
      (messageFilter.filterStartDate != null && messageFilter.filterStartDate !== '') ||
      (messageFilter.filterEndDate != null && messageFilter.filterEndDate !== ''),
    [
      messageFilter.filterUserId,
      messageFilter.filterDays,
      messageFilter.filterStartDate,
      messageFilter.filterEndDate,
    ],
  );

  const refreshPinnedMessages = useCallback(async () => {
    if (!isGroup || !Number.isFinite(conversationId) || conversationId <= 0) {
      setPinnedMessages([]);
      return;
    }
    try {
      const res = await chatApi.getPinnedMessages(conversationId);
      setPinnedMessages(Array.isArray(res.pins) ? res.pins : []);
    } catch {
      setPinnedMessages([]);
    }
  }, [isGroup, conversationId]);

  const pinnedBarPreview = useMemo(() => {
    const p = pinnedMessages[0];
    if (!p?.message) return '';
    const sender =
      p.message.sender?.fullName ||
      (p.message.sender as { full_name?: string } | undefined)?.full_name ||
      p.message.sender?.username ||
      'Thành viên';
    const body = String(p.message.body || '').trim();
    const preview = body.length > 0 ? body : 'Hình ảnh / file đính kèm';
    return `${sender}: ${preview}`;
  }, [pinnedMessages]);

  const firstPinnedMessageId = useMemo(() => {
    const mid = Number(pinnedMessages[0]?.message?.id);
    return Number.isFinite(mid) && mid > 0 ? mid : null;
  }, [pinnedMessages]);

  // Deduplicate at render time to guarantee unique keys for FlatList
  const uniqueMessages = useMemo(() => deduplicateMessages(messages), [messages]);
  const uniqueMessagesRef = useRef<any[]>([]);
  uniqueMessagesRef.current = uniqueMessages;
  /** Used for scroll-to-index edge detection (newest-first array → last = oldest loaded) */
  const messagesCountRef = useRef(0);
  messagesCountRef.current = uniqueMessages.length;

  const fetchMessages = useCallback(
    async (mode: 'reset' | 'poll' = 'reset') => {
      if (!Number.isFinite(conversationId) || conversationId <= 0) {
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }
      try {
        const data = await chatApi.getMessages(conversationId, {
          limit: CHAT_MESSAGE_PAGE_SIZE,
          filterUserId: messageFilter.filterUserId ?? undefined,
          filterDays: messageFilter.filterDays ?? undefined,
          filterStartDate: messageFilter.filterStartDate ?? undefined,
          filterEndDate: messageFilter.filterEndDate ?? undefined,
        });
        const list = Array.isArray(data.messages) ? data.messages : [];
        if (mode === 'poll') {
          setMessages((prev) => mergePollPageIntoMessages(prev, list));
        } else {
          setMessages(
            sortMessagesNewestFirst(deduplicateMessages([...list].reverse())),
          );
          setHasMoreOlder(!!data.hasMore);
        }
      } catch (error: unknown) {
        console.error('Error fetching messages', error);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [conversationId, messageFilter],
  );

  const loadOlderMessages = useCallback(() => {
    if (!hasMoreOlder || loadingOlderRef.current) return;

    const oldest = uniqueMessages[uniqueMessages.length - 1];
    const beforeId = Number(oldest?.id);
    if (!Number.isFinite(beforeId) || beforeId <= 0) return;

    loadingOlderRef.current = true;
    setIsLoadingOlder(true);
    void (async () => {
      try {
        const data = await chatApi.getMessages(conversationId, {
          limit: CHAT_MESSAGE_PAGE_SIZE,
          beforeMessageId: beforeId,
          filterUserId: messageFilter.filterUserId ?? undefined,
          filterDays: messageFilter.filterDays ?? undefined,
          filterStartDate: messageFilter.filterStartDate ?? undefined,
          filterEndDate: messageFilter.filterEndDate ?? undefined,
        });
        const list = Array.isArray(data.messages) ? data.messages : [];
        if (list.length === 0) {
          setHasMoreOlder(false);
          return;
        }
        const olderNewestFirst = deduplicateMessages([...list].reverse());
        setMessages((prev) =>
          sortMessagesNewestFirst(deduplicateMessages([...prev, ...olderNewestFirst])),
        );
        setHasMoreOlder(!!data.hasMore);
      } catch (e) {
        console.error('Error loading older messages', e);
      } finally {
        loadingOlderRef.current = false;
        setIsLoadingOlder(false);
      }
    })();
  }, [conversationId, hasMoreOlder, uniqueMessages, messageFilter]);

  const [flashMessageId, setFlashMessageId] = useState<number | null>(null);
  const flashClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flashClearTimerRef.current) {
        clearTimeout(flashClearTimerRef.current);
      }
    };
  }, []);

  const imageGalleryEntries = useMemo(
    () => buildImageGalleryEntries(uniqueMessages),
    [uniqueMessages],
  );

  const openImageViewerFor = useCallback(
    (messageItem: any, attachment: any, resolvedUrl: string) => {
      const urls = imageGalleryEntries.map((e) => e.url);
      if (urls.length === 0) {
        setGalleryVisibleIndex(0);
        setImageViewer({
          urls: [resolvedUrl],
          entries: [
            {
              url: resolvedUrl,
              messageId: String(messageItem?.id ?? ''),
              attachmentId: String(attachment?.id ?? ''),
            },
          ],
          index: 0,
        });
        return;
      }
      const index = findGalleryStartIndex(
        imageGalleryEntries,
        messageItem.id,
        attachment,
        resolvedUrl,
      );
      const safeIndex = Math.min(index, Math.max(0, urls.length - 1));
      setGalleryVisibleIndex(safeIndex);
      setImageViewer({
        urls,
        entries: imageGalleryEntries,
        index: safeIndex,
      });
    },
    [imageGalleryEntries],
  );

  const galleryViewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
  }).current;

  const onGalleryViewableItemsChanged = useCallback(
    ({
      viewableItems,
    }: {
      viewableItems: { index: number | null }[];
    }) => {
      const idx = viewableItems[0]?.index;
      if (idx != null) {
        setGalleryVisibleIndex(idx);
      }
    },
    [],
  );

  useEffect(() => {
    if (!imageViewer?.urls?.length) {
      return;
    }
    const idx = Math.min(imageViewer.index, imageViewer.urls.length - 1);
    setGalleryVisibleIndex(idx);
    const t = setTimeout(() => {
      try {
        imagePagerRef.current?.scrollToIndex({
          index: idx,
          animated: false,
        });
      } catch {
        /* layout not ready */
      }
    }, 80);
    return () => clearTimeout(t);
  }, [imageViewer]);

  useEffect(() => {
    if (!imageViewer) {
      return;
    }
    setViewerRotationDeg(0);
    setImagePagerScrollEnabled(true);
    const t = setTimeout(() => {
      Object.values(zoomableRefs.current).forEach((z) => {
        z?.zoomTo(1);
      });
    }, 60);
    return () => clearTimeout(t);
  }, [galleryVisibleIndex, imageViewer]);

  const imageViewerZoomIn = useCallback(() => {
    const z = zoomableRefs.current[galleryVisibleIndex];
    z?.zoomBy(0.5);
  }, [galleryVisibleIndex]);

  const imageViewerZoomOut = useCallback(() => {
    const z = zoomableRefs.current[galleryVisibleIndex];
    z?.zoomBy(-0.5);
  }, [galleryVisibleIndex]);

  const imageViewerRotateLeft = useCallback(() => {
    setViewerRotationDeg((prev) => (prev - 90) % 360);
  }, []);

  const openImageEditorFromViewer = useCallback(() => {
    if (!imageViewer) return;
    const ent = imageViewer.entries[galleryVisibleIndex];
    const aid = ent ? Number(ent.attachmentId) : NaN;
    if (!Number.isFinite(aid) || aid <= 0) {
      Alert.alert(
        'Không thể chỉnh sửa',
        'Ảnh này không có mã đính kèm hợp lệ (ví dụ ảnh chưa đồng bộ).',
      );
      return;
    }
    setImageViewer(null);
    setImageEditorTarget({ attachmentId: aid });
  }, [galleryVisibleIndex, imageViewer]);

  const imageViewerCanEdit = useMemo(() => {
    if (!imageViewer) return false;
    const id = Number(imageViewer.entries[galleryVisibleIndex]?.attachmentId);
    return Number.isFinite(id) && id > 0;
  }, [imageViewer, galleryVisibleIndex]);

  const refreshMentionMenu = useCallback(
    (text: string, caret: number) => {
      const safeCaret = Math.min(Math.max(0, caret), text.length);
      const active = findActiveMention(text, safeCaret);
      mentionActiveRef.current = active;
      if (!active) {
        setMentionRows([]);
        return;
      }
      setMentionRows(buildMentionRows(active.query, chatParticipants));
    },
    [chatParticipants],
  );

  useEffect(() => {
    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      return;
    }
    const loadParticipants = async () => {
      try {
        const { data } = await httpClient.get(
          `/conversations/${conversationId}/participants`,
        );
        const list = data.participants || data || [];
        if (Array.isArray(list) && list.length > 0) {
          setChatParticipants(list);
          return;
        }
      } catch {
        // Endpoint missing on older backend — fall back below
      }
      try {
        const { data } = await httpClient.get('/conversations');
        const convs = data.conversations || data || [];
        const found = convs.find(
          (c: { id?: number }) => Number(c.id) === conversationId,
        );
        const list = found?.participants || [];
        setChatParticipants(Array.isArray(list) ? list : []);
      } catch {
        setChatParticipants([]);
      }
    };
    void loadParticipants();
  }, [conversationId]);

  useEffect(() => {
    if (!Number.isFinite(conversationId) || conversationId <= 0) return;
    const draft = useChatUiStore.getState().composerDrafts[String(conversationId)] ?? '';
    setInputText(draft);
    inputTextRef.current = draft;
    mentionCaretRef.current = draft.length;
  }, [conversationId]);

  useEffect(() => {
    void refreshPinnedMessages();
  }, [refreshPinnedMessages]);

  useEffect(() => {
    if (isGroup || currentUserId == null) {
      setDmPeerUserId(null);
      return;
    }
    const other = chatParticipants.find((p) => Number(p.id) !== Number(currentUserId));
    setDmPeerUserId(other && Number.isFinite(Number(other.id)) ? Number(other.id) : null);
  }, [isGroup, chatParticipants, currentUserId]);

  useEffect(() => {
    if (!dmPeerUserId || dmPeerUserId <= 0) {
      setPeerAttendanceLine(null);
      setPeerAttendanceLoading(false);
      return;
    }
    let cancelled = false;
    setPeerAttendanceLoading(true);
    void chatApi
      .getAttendanceTodayForUser(dmPeerUserId)
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          setPeerAttendanceLine('Không có dữ liệu chấm công');
          return;
        }
        const clock = formatCheckInClock(res.checkInTime);
        setPeerAttendanceLine(
          res.checkedIn
            ? clock
              ? `Đã chấm công · ${clock}`
              : 'Đã chấm công'
            : 'Chưa chấm công hôm nay',
        );
      })
      .catch(() => {
        if (!cancelled) setPeerAttendanceLine('Không có dữ liệu chấm công');
      })
      .finally(() => {
        if (!cancelled) setPeerAttendanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dmPeerUserId]);

  useEffect(() => {
    refreshMentionMenu(inputTextRef.current, mentionCaretRef.current);
  }, [chatParticipants, refreshMentionMenu]);

  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const { data } = await httpClient.get('/auth/me');
        setCurrentUserId(data.user?.id || data.id);
      } catch (e) {
        console.error('Failed to fetch user', e);
      }
    };
    void fetchUserId();
    setIsLoading(true);
    setHasMoreOlder(true);
    loadingOlderRef.current = false;
    if (Number.isFinite(conversationId) && conversationId > 0) {
      httpClient.post(`/conversations/${conversationId}/read`).catch(() => {});
    }
  }, [id, conversationId]);

  useEffect(() => {
    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      return;
    }
    void fetchMessages('reset');
  }, [conversationId, messageFilter, fetchMessages]);

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
          if (scrollAnchorLockRef.current != null && existingIndex < 0) {
            pendingRealtimeWhileAnchoredRef.current.push(incoming);
            return prev;
          }

          return applyIncomingRealtimeMessage(prev, incoming);
        });

        // Play notification sound for messages from others
        const incomingSenderId = (incoming as any).sender_id || (incoming as any).senderId || incoming.sender?.id;
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
      undefined,
      undefined,
      () => {
        setTaskRemoteTick((n) => n + 1);
      },
    );
  }, [conversationId]);


  const handleRefresh = () => {
    clearScrollAnchorLock();
    setIsRefreshing(true);
    void fetchMessages('reset');
  };

  useEffect(() => {
    fetchMessagesRef.current = () => {
      void fetchMessages('poll');
    };
  }, [fetchMessages]);

  useEffect(() => {
    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      return;
    }

    const maybePoll = () => {
      if (scrollAnchorLockRef.current != null) {
        return;
      }
      if (Date.now() < suppressChatPollUntilRef.current) {
        return;
      }
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
        if (scrollAnchorLockRef.current == null) {
          fetchMessagesRef.current();
        }
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
            await httpClient.delete(`/conversations/${conversationId}/messages/${messageId}`);
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

  const handleQuickCreateTask = async (msg: any) => {
    const messageId = Number(msg?.id);
    if (!messageId || !Number.isFinite(conversationId) || conversationId <= 0) return;
    try {
      const result = await chatApi.createQuickTask(conversationId, messageId);
      if (result.deduplicated) {
        Alert.alert('Thông báo', String(result.message ?? 'Tin nhắn này đã có task.'));
      } else {
        Alert.alert('✅', String(result.message ?? 'Đã tạo task nhanh.'));
      }
      setTaskRemoteTick((n) => n + 1);
    } catch (e: unknown) {
      const msgText =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Không thể tạo task nhanh.';
      Alert.alert('Lỗi', String(msgText));
    }
  };

  const handleToggleReaction = useCallback(async (item: any, emoji: string) => {
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
  }, []);

  // ===== GROUP MANAGEMENT HANDLERS =====
  const fetchGroupMembers = async () => {
    try {
      const { data } = await httpClient.get(`/conversations/${conversationId}/participants`);
      const list = data.participants || data || [];
      setGroupMembers(list);
      setChatParticipants(list);
    } catch {
      setGroupMembers([]);
    }
  };

  const handleOpenGroupSettings = () => {
    setGroupNameInput(chatTitle);
    fetchGroupMembers();
    void refreshPinnedMessages();
    setShowGroupSettings(true);
  };

  const openDeleteGroupFlow = async () => {
    try {
      const info = await chatApi.getConversationDeleteInfo(conversationId);
      if (!info.isOwner) {
        Alert.alert('Không thể xóa', 'Chỉ chủ nhóm mới có thể xóa nhóm này.');
        return;
      }
      setDeleteGroupInfo(info);
      setShowGroupSettings(false);
      setShowDeleteGroup(true);
    } catch {
      Alert.alert('Lỗi', 'Không thể tải thông tin xóa nhóm.');
    }
  };

  const handleConfirmDeleteGroup = async () => {
    setIsDeletingGroup(true);
    try {
      await chatApi.deleteConversation(conversationId);
      setShowDeleteGroup(false);
      setDeleteGroupInfo(null);
      router.back();
    } catch {
      Alert.alert('Lỗi', 'Không thể xóa nhóm.');
    } finally {
      setIsDeletingGroup(false);
    }
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
  const scrollToIndexFailRetriesRef = useRef(0);
  const jumpToMessageIdRef = useRef<number | null>(null);
  const deepLinkJumpHandledKeyRef = useRef<string | null>(null);
  /** Tránh fetch poll merge ngay sau khi nhảy tin — làm FlatList nhảy vị trí. */
  const suppressChatPollUntilRef = useRef(0);
  /** Giữ vị trí sau khi nhảy tin (tìm kiếm/ghim): đến khi user chạm/cuộn — không hết hạn theo giờ. */
  const scrollAnchorLockRef = useRef<{ messageId: number } | null>(null);
  /** Tin realtime mới (prepend) được gom lại khi đang neo để khỏi kéo list về tin mới nhất. */
  const pendingRealtimeWhileAnchoredRef = useRef<any[]>([]);
  const contentSizeResyncRafRef = useRef<number | null>(null);

  const suppressChatPollingBriefly = useCallback((ms = 6000) => {
    suppressChatPollUntilRef.current = Date.now() + ms;
  }, []);

  const clearScrollAnchorLock = useCallback(() => {
    scrollAnchorLockRef.current = null;
    const pending = pendingRealtimeWhileAnchoredRef.current;
    pendingRealtimeWhileAnchoredRef.current = [];
    if (pending.length === 0) {
      return;
    }
    setMessages((prev) => {
      let next = prev;
      for (const msg of pending) {
        next = applyIncomingRealtimeMessage(next, msg);
      }
      return next;
    });
  }, []);

  const scheduleResyncScrollToAnchor = useCallback(() => {
    if (contentSizeResyncRafRef.current != null) {
      cancelAnimationFrame(contentSizeResyncRafRef.current);
    }
    contentSizeResyncRafRef.current = requestAnimationFrame(() => {
      contentSizeResyncRafRef.current = null;
      const lock = scrollAnchorLockRef.current;
      if (!lock) {
        return;
      }
      const rows = uniqueMessagesRef.current;
      const idx = rows.findIndex((m: any) => Number(m.id) === Number(lock.messageId));
      if (idx < 0) return;
      const list = flatListRef.current;
      if (!list) return;
      const lastIdx = Math.max(0, rows.length - 1);
      const edge = idx === lastIdx;
      const nearEdge = lastIdx >= 0 && idx >= lastIdx - 2;
      try {
        list.scrollToIndex({
          index: idx,
          animated: false,
          viewPosition: edge ? 0.06 : nearEdge ? 0.12 : 0.3,
        });
      } catch {
        /* onScrollToIndexFailed */
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (contentSizeResyncRafRef.current != null) {
        cancelAnimationFrame(contentSizeResyncRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    scrollAnchorLockRef.current = null;
    pendingRealtimeWhileAnchoredRef.current = [];
  }, [conversationId]);

  const handleFlatListScrollToIndexFailed = useCallback(
    (info: {
      index: number;
      highestMeasuredFrameIndex: number;
      averageItemLength: number;
    }) => {
      const list = flatListRef.current;
      if (!list) {
        scrollToIndexFailRetriesRef.current = 0;
        return;
      }
      scrollToIndexFailRetriesRef.current += 1;
      if (scrollToIndexFailRetriesRef.current > 32) {
        scrollToIndexFailRetriesRef.current = 0;
        return;
      }
      const avg = info.averageItemLength || 88;
      const len = messagesCountRef.current;
      const lastIdx = Math.max(0, len - 1);
      const edge = info.index === lastIdx && lastIdx >= 0;
      // Move viewport near unmeasured rows so RN can lay out distant items (inverted list)
      const rough = Math.max(0, avg * info.index - screenHeight * 0.2);
      try {
        list.scrollToOffset({ offset: rough, animated: false });
      } catch {
        scrollToIndexFailRetriesRef.current = 0;
        return;
      }
      if (edge) {
        try {
          list.scrollToEnd({ animated: false });
        } catch {
          /* continue */
        }
      }
      const delay = Math.min(380, 36 * scrollToIndexFailRetriesRef.current);
      setTimeout(() => {
        try {
          list.scrollToIndex({
            index: info.index,
            animated: false,
            viewPosition: edge ? 0.06 : 0.3,
          });
        } catch {
          scrollToIndexFailRetriesRef.current = 0;
        }
      }, delay);
    },
    [screenHeight],
  );

  /**
   * Scroll to a row by index (FlatList inverted, data newest-first).
   * - Oldest loaded message = last index: scrollToEnd then pin with scrollToIndex (RN often fails for tail index alone).
   * - Defer setFlashMessageId so extraData does not re-render the whole list during scroll (reduces jank).
   */
  const scrollFlatListToMessageIndex = useCallback(
    (
      idx: number,
      opts?: { flashId?: number; skipFlash?: boolean; anchorMessageId?: number },
    ) => {
      const anchorRaw = opts?.anchorMessageId;
      if (
        anchorRaw != null &&
        Number.isFinite(anchorRaw) &&
        anchorRaw > 0
      ) {
        scrollAnchorLockRef.current = {
          messageId: Number(anchorRaw),
        };
      } else {
        suppressChatPollingBriefly();
      }
      const list = flatListRef.current;
      if (!list || idx < 0) return;
      scrollToIndexFailRetriesRef.current = 0;

      const scheduleFlash = (id: number) => {
        if (flashClearTimerRef.current) {
          clearTimeout(flashClearTimerRef.current);
          flashClearTimerRef.current = null;
        }
        setFlashMessageId(id);
        flashClearTimerRef.current = setTimeout(() => {
          setFlashMessageId(null);
          flashClearTimerRef.current = null;
        }, 2200);
      };

      const delayedFlash = () => {
        if (opts?.skipFlash) return;
        const id = opts?.flashId;
        if (id == null || !Number.isFinite(id) || id <= 0) return;
        setTimeout(() => scheduleFlash(id), 96);
      };

      const lastIdx = Math.max(0, messagesCountRef.current - 1);
      const edge = lastIdx >= 0 && idx === lastIdx;

      const run = () => {
        if (edge) {
          try {
            list.scrollToEnd({ animated: false });
          } catch {
            /* noop */
          }
          setTimeout(() => {
            try {
              list.scrollToIndex({
                index: idx,
                animated: false,
                viewPosition: 0.06,
              });
            } catch {
              /* onScrollToIndexFailed */
            }
            delayedFlash();
          }, 64);
          return;
        }

        const nearEdge = lastIdx >= 0 && idx >= lastIdx - 2;
        try {
          list.scrollToIndex({
            index: idx,
            animated: false,
            viewPosition: nearEdge ? 0.12 : 0.3,
          });
        } catch {
          /* onScrollToIndexFailed */
        }
        delayedFlash();
      };

      requestAnimationFrame(() => requestAnimationFrame(run));
    },
    [suppressChatPollingBriefly],
  );

  useLayoutEffect(() => {
    const targetId = jumpToMessageIdRef.current;
    if (targetId == null) return;
    const idx = uniqueMessages.findIndex(
      (m: any) => Number(m.id) === Number(targetId),
    );
    if (idx < 0) {
      jumpToMessageIdRef.current = null;
      return;
    }
    jumpToMessageIdRef.current = null;
    scrollFlatListToMessageIndex(idx, { skipFlash: true });
  }, [uniqueMessages, scrollFlatListToMessageIndex]);

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
      const { data } = await httpClient.get(
        `/conversations/${conversationId}/messages/around/${messageId}`,
      );
      const raw = data.messages || data || [];
      const list = Array.isArray(raw) ? raw : [];
      if (list.length > 0) {
        if (flashClearTimerRef.current) {
          clearTimeout(flashClearTimerRef.current);
          flashClearTimerRef.current = null;
        }
        jumpToMessageIdRef.current = messageId;
        scrollAnchorLockRef.current = {
          messageId,
        };
        setFlashMessageId(messageId);
        flashClearTimerRef.current = setTimeout(() => {
          setFlashMessageId(null);
          flashClearTimerRef.current = null;
        }, 2600);
        // Giữ cùng thứ tự với tải trang thường (newest-first cho FlatList inverted)
        const pending = [...pendingRealtimeWhileAnchoredRef.current];
        pendingRealtimeWhileAnchoredRef.current = [];
        let nextMsgs = deduplicateMessages([...list].reverse());
        for (const p of pending) {
          nextMsgs = applyIncomingRealtimeMessage(nextMsgs, p);
        }
        setMessages(nextMsgs);
        setHasMoreOlder(true);
      }
    } catch {
      Alert.alert('Lỗi', 'Không thể nhảy đến tin nhắn');
    }
  };

  /** Tap reply quote → scroll (or load window around) the original message */
  const handleScrollToMessageRef = useRef<(messageId: number) => Promise<void>>(
    async () => undefined,
  );
  handleScrollToMessageRef.current = handleScrollToMessage;

  const scrollToQuotedMessage = useCallback(async (replyToId: number) => {
    if (!Number.isFinite(replyToId) || replyToId <= 0) return;
    const idx = uniqueMessages.findIndex(
      (m: any) => Number(m.id) === Number(replyToId),
    );
    if (idx >= 0) {
      scrollFlatListToMessageIndex(idx, {
        flashId: replyToId,
        anchorMessageId: replyToId,
      });
      return;
    }
    await handleScrollToMessageRef.current(replyToId);
  }, [uniqueMessages, scrollFlatListToMessageIndex]);

  useEffect(() => {
    const raw = jumpMessageId;
    const j = Array.isArray(raw) ? raw[0] : raw;
    if (j == null || String(j).trim() === '') {
      deepLinkJumpHandledKeyRef.current = null;
      return;
    }
    if (!Number.isFinite(conversationId) || conversationId <= 0) return;
    const mid = Number(j);
    if (!Number.isFinite(mid) || mid <= 0) return;
    const key = `${conversationId}:${mid}`;
    if (deepLinkJumpHandledKeyRef.current === key) return;
    deepLinkJumpHandledKeyRef.current = key;
    void handleScrollToMessage(mid);
  }, [id, jumpMessageId, conversationId, handleScrollToMessage]);

  // ===== USER PROFILE =====
  const [showProfile, setShowProfile] = useState(false);
  const [profileUser, setProfileUser] = useState<any>(null);

  const handleViewProfile = useCallback(async (username: string) => {
    try {
      const { data } = await httpClient.get(`/users/${encodeURIComponent(username)}/profile`);
      setProfileUser(data.user || data);
      setShowProfile(true);
    } catch {
      Alert.alert('Lỗi', 'Không thể tải thông tin người dùng');
    }
  }, []);

  // ===== REACTION DETAILS =====
  const [showReactionDetail, setShowReactionDetail] = useState(false);
  const [reactionDetailData, setReactionDetailData] = useState<any[]>([]);

  const handleViewReactionDetail = useCallback(async (messageId: number) => {
    try {
      const { data } = await httpClient.get(`/messages/${messageId}/reactions`);
      setReactionDetailData(data.reactions || data || []);
      setShowReactionDetail(true);
    } catch {
      Alert.alert('Lỗi', 'Không thể tải chi tiết reactions');
    }
  }, []);

  // ===== AI SUMMARIZE =====
  const [showAiSummary, setShowAiSummary] = useState(false);
  const [aiSummaryData, setAiSummaryData] = useState<any>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const [showTaskChecklist, setShowTaskChecklist] = useState(false);
  const [taskRemoteTick, setTaskRemoteTick] = useState(0);
  const [manualCreateTaskOpen, setManualCreateTaskOpen] = useState(false);
  const [manualCreateTaskMessage, setManualCreateTaskMessage] = useState<any | null>(null);

  const handleAiSummarize = async () => {
    setIsAiLoading(true);
    setShowAiSummary(true);
    setAiSummaryData(null);
    try {
      const now = new Date();
      const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 ngày trước
      const { data } = await httpClient.post('/ai/summarize', {
        conversationId,
        question: 'Tóm tắt tình hình cuộc hội thoại này',
        from: from.toISOString().split('T')[0],
        to: now.toISOString().split('T')[0],
      });
      setAiSummaryData(data.data || data);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404 || status === 501) {
        setAiSummaryData({ summary: 'Tính năng AI chưa được kích hoạt trên server.', highlights: [], actionItems: [], risks: [] });
      } else {
        Alert.alert('Lỗi', 'Không thể tạo báo cáo AI');
        setShowAiSummary(false);
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleLongPressMessage = useCallback((item: any) => {
    const isRecalled = item.isRecalled || item.is_recalled;
    if (isRecalled) return;
    setMenuTarget(item);
  }, []);

  // Forward: load conversations when forward source is set
  useEffect(() => {
    if (!forwardSource) return;
    httpClient
      .get('/conversations')
      .then(({ data }) => {
        const raw = data.conversations || data || [];
        const list = Array.isArray(raw) ? raw : [];
        setForwardConversations(
          list.filter(
            (c: { id?: number }) => Number(c.id) !== Number(conversationId),
          ),
        );
      })
      .catch(() => setForwardConversations([]));
  }, [forwardSource, conversationId]);

  useEffect(() => {
    if (forwardSource) {
      setForwardSearchQuery('');
    }
  }, [forwardSource]);

  const filteredForwardConversations = useMemo(() => {
    const q = forwardSearchQuery.trim().toLowerCase();
    if (!q) return forwardConversations;
    return forwardConversations.filter((c) => {
      const title = formatConversationListTitle(c, currentUserId).toLowerCase();
      return title.includes(q);
    });
  }, [forwardConversations, forwardSearchQuery, currentUserId]);

  const handleForwardTo = async (targetConvId: number) => {
    if (!forwardSource) return;
    const traceId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `fwd-${Date.now()}`;
    try {
      await httpClient.post(`/conversations/${targetConvId}/messages`, {
        body: '',
        clientMessageId: traceId,
        traceId,
        clientSentAt: Date.now(),
        forwardedFromMessageId: Number(forwardSource.id),
      });
      Alert.alert('✅', 'Đã chuyển tiếp tin nhắn');
    } catch {
      Alert.alert('Lỗi', 'Không thể chuyển tiếp');
    }
    setForwardSource(null);
  };

  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;
    clearScrollAnchorLock();
    animateSendButton();

    const textToSend = inputText.trim();
    const replySnapshot = replyTarget;
    const replyToId = replySnapshot ? Number(replySnapshot.id) : undefined;
    setInputText('');
    inputTextRef.current = '';
    if (Number.isFinite(conversationId) && conversationId > 0) {
      clearComposerDraft(conversationId);
    }
    setReplyTarget(null);
    setMentionRows([]);
    mentionActiveRef.current = null;
    setIsSending(true);

    const traceId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const clientSentAt = Date.now();

    const mentions = buildMentionIds(
      textToSend,
      chatParticipants,
      currentUserId,
    );

    const optimisticMessage = {
      id: traceId,
      clientMessageId: traceId,
      client_message_id: traceId,
      body: textToSend,
      sender_id: currentUserId,
      sentAt: new Date().toISOString(),
      sent_at: new Date().toISOString(),
      is_optimistic: true,
      sender: { id: currentUserId, fullName: 'Bạn' },
      replyTo: replySnapshot
        ? {
            id: replySnapshot.id,
            body: replySnapshot.body,
            sender: replySnapshot.sender,
          }
        : null,
    };
    setMessages((prev) => [optimisticMessage, ...prev]);

    try {
      const payload: Record<string, unknown> = {
        body: textToSend,
        clientMessageId: traceId,
        traceId,
        clientSentAt,
      };
      if (replyToId) {
        payload.replyToMessageId = replyToId;
      }
      if (mentions.length > 0) {
        payload.mentions = mentions;
      }
      const { data } = await httpClient.post(`/conversations/${id}/messages`, payload);
      const actualMessage = data.message || data.data || data;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.clientMessageId === traceId || msg.client_message_id === traceId
            ? actualMessage
            : msg,
        ),
      );
    } catch (error: unknown) {
      console.error('Error sending message', error);
      Alert.alert('Lỗi', 'Không thể gửi tin nhắn.');
      setMessages((prev) =>
        prev.filter(
          (msg) =>
            msg.clientMessageId !== traceId && msg.client_message_id !== traceId,
        ),
      );
      setInputText(textToSend);
      inputTextRef.current = textToSend;
      if (Number.isFinite(conversationId) && conversationId > 0) {
        setComposerDraft(conversationId, textToSend);
      }
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

    clearScrollAnchorLock();

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
        mediaTypes: ['images', 'videos'],
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

    clearScrollAnchorLock();

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

  /** Gửi ảnh/video/file vừa chia sẻ từ app ngoài (sau khi user chọn hội thoại). */
  useEffect(() => {
    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      return;
    }
    const files = pendingOutgoingShare?.files;
    if (!files?.length) {
      outgoingShareSessionRef.current = null;
      return;
    }

    const sessionKey = `${conversationId}:${files.map((f) => f.uri).join('|')}`;
    if (outgoingShareSessionRef.current === sessionKey) {
      return;
    }
    outgoingShareSessionRef.current = sessionKey;

    let cancelled = false;

    void (async () => {
      clearScrollAnchorLock();
      try {
        for (const f of files) {
          if (cancelled) break;
          const mimeRaw = (f.mimeType || 'application/octet-stream').toLowerCase();
          const isImage = mimeRaw.startsWith('image/');

          let size = 1;
          try {
            const info = await FileSystem.getInfoAsync(f.uri);
            if (info.exists && 'size' in info && typeof info.size === 'number') {
              size = Math.max(1, info.size);
            }
          } catch {
            size = 1;
          }

          if (isImage) {
            setIsUploadingImage(true);
            const formData = new FormData();
            formData.append('file', {
              uri: f.uri,
              name: f.name,
              type: f.mimeType || 'image/jpeg',
            } as any);
            const { data } = await httpClient.post(
              `/conversations/${conversationId}/attachments/direct`,
              formData,
              { headers: { 'Content-Type': 'multipart/form-data' } },
            );
            await appendUploadedMessage(setMessages, data);
            setIsUploadingImage(false);
          } else {
            setIsUploadingFile(true);
            await uploadFileByPresign({
              uri: f.uri,
              fileName: f.name,
              mimeType: f.mimeType || 'application/octet-stream',
              size,
            });
            setIsUploadingFile(false);
          }
        }
        if (!cancelled) {
          clearPendingOutgoingShare();
        }
      } catch (e) {
        console.error('outgoing share upload', e);
        outgoingShareSessionRef.current = null;
        Alert.alert('Lỗi', 'Không thể gửi nội dung đã chia sẻ.');
      } finally {
        setIsUploadingImage(false);
        setIsUploadingFile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    conversationId,
    pendingOutgoingShare,
    clearPendingOutgoingShare,
    clearScrollAnchorLock,
  ]);

  const applyMentionSelection = (row: MentionRow) => {
    const text = inputTextRef.current;
    const active = mentionActiveRef.current;
    if (!active) return;
    const before = text.slice(0, active.start);
    const after = text.slice(active.end);
    const insertion =
      row.type === 'all'
        ? `@${EVERYONE_MENTION_USERNAME} `
        : `@${row.user.username} `;
    const next = before + insertion + after;
    const nextCaret = before.length + insertion.length;
    inputTextRef.current = next;
    mentionCaretRef.current = nextCaret;
    setInputText(next);
    if (Number.isFinite(conversationId) && conversationId > 0) {
      setComposerDraft(conversationId, next);
    }
    setMentionRows([]);
    mentionActiveRef.current = null;
  };

  const openMessageAttachment = useCallback(async (attachment: {
    id?: number;
    url?: string | null;
    downloadUrl?: string | null;
    originalName?: string | null;
    original_name?: string | null;
  }) => {
    let url = resolveOpenableAttachmentUrl(attachment);
    if (!url && attachment?.id) {
      try {
        url = await fetchAttachmentReadUrl(Number(attachment.id));
      } catch {
        Alert.alert('Lỗi', 'Không thể lấy liên kết tải xuống.');
        return;
      }
    }
    if (!url) {
      Alert.alert('Thông báo', 'Không có liên kết cho tệp này.');
      return;
    }
    const displayName =
      attachment.originalName ||
      (attachment as { original_name?: string }).original_name ||
      null;
    try {
      await openAttachmentWithFallback(url, displayName);
    } catch {
      Alert.alert('Lỗi', 'Không thể mở tệp.');
    }
  }, []);

  const handleStartReply = useCallback(
    (item: any) => {
      const isRecalled = item.isRecalled || item.is_recalled;
      if (isRecalled) return;

      setReplyTarget(item);
      setMentionRows([]);
      mentionActiveRef.current = null;

      const senderId = item.sender_id || item.senderId || item.sender?.id;
      const sender = item.sender || {};
      let prefix = '';

      const un = String(sender.username || '').trim();
      if (un) {
        prefix = `@${un} `;
      } else {
        const fromList = chatParticipants.find(
          (p) => Number(p.id) === Number(senderId),
        );
        if (fromList && String(fromList.username || '').trim()) {
          prefix = `@${String(fromList.username).trim()} `;
        } else {
          const display = String(
            sender.fullName ||
              sender.full_name ||
              fromList?.fullName ||
              (fromList as { full_name?: string })?.full_name ||
              '',
          ).trim();
          if (display) {
            prefix = `@${display} `;
          }
        }
      }

      const next = prefix;
      inputTextRef.current = next;
      mentionCaretRef.current = next.length;
      setInputText(next);
      if (Number.isFinite(conversationId) && conversationId > 0) {
        setComposerDraft(conversationId, next);
      }
      requestAnimationFrame(() => {
        composerInputRef.current?.focus?.();
        refreshMentionMenu(next, next.length);
      });
    },
    [chatParticipants, refreshMentionMenu, conversationId, setComposerDraft],
  );

  const renderMessage = useCallback(({ item, index }: { item: any; index: number }) => {
    const senderId = item.sender_id || item.senderId || item.sender?.id;
    const isMine = senderId === currentUserId;
    const senderName = getSenderName(item);
    const timeStr = formatTime(item.sentAt || item.sent_at || item.created_at);
    const avatarColor = getAvatarColor(senderName);
    const attachments = Array.isArray(item.attachments) ? item.attachments : [];
    const hasText = Boolean(String(item.body || '').trim());

    // Check if next message (visually above since inverted) is from same sender
    const nextMsg = uniqueMessages[index + 1];
    const nextSenderId =
      nextMsg?.sender_id || nextMsg?.senderId || nextMsg?.sender?.id;
    const isFirstInGroup = nextSenderId !== senderId;

    // Date separator (FlatList is inverted, so "next" = older message below)
    const msgDate = formatDateSeparator(item.sentAt || item.sent_at || item.created_at);
    const nextDate = nextMsg
      ? formatDateSeparator(nextMsg.sentAt || nextMsg.sent_at || nextMsg.created_at)
      : null;
    const showDateSeparator = !nextMsg || msgDate !== nextDate;

    const isFlashed =
      flashMessageId != null && Number(item.id) === Number(flashMessageId);

    // Recalled message
    const isRecalled = item.isRecalled || item.is_recalled;

    const hasReactions =
      !isRecalled &&
      item.reactions_summary &&
      Object.keys(item.reactions_summary).length > 0;

    // Reply quote
    const replyTo = item.replyTo || item.reply_to;
    const replySnippet = replyTo?.body ? replyTo.body.slice(0, 80) : null;
    const replySenderName = replyTo?.sender?.fullName || replyTo?.sender?.full_name || replyTo?.sender?.username || '';

    const showReply =
      !isRecalled &&
      !isMine &&
      (hasText || attachments.length > 0);

    const useGroupedFrame =
      !isRecalled &&
      ((!!replyTo && !!replySnippet) || showReply);

    const canForward = !isRecalled && !item.is_optimistic;

    const messageCore = (
      <>
          {/* Reply quote — tap to jump to original message */}
          {replyTo && replySnippet ? (
            <TouchableOpacity
              style={styles.replyQuote}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Xem tin nhắn gốc"
              onPress={() => {
                const qid = Number(replyTo?.id);
                if (Number.isFinite(qid) && qid > 0) {
                  void scrollToQuotedMessage(qid);
                }
              }}
            >
              <View style={styles.replyQuoteBar} />
              <View style={styles.replyQuoteContent}>
                <Text style={styles.replyQuoteSender}>{replySenderName}</Text>
                <Text style={styles.replyQuoteText} numberOfLines={2}>{replySnippet}</Text>
              </View>
            </TouchableOpacity>
          ) : null}
          <View style={styles.bubbleWrap}>
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
                    const imageUrl = resolveOpenableAttachmentUrl(attachment);
                    if (isImageAttachment && imageUrl) {
                      return (
                        <TouchableOpacity
                          key={key}
                          activeOpacity={0.8}
                          onPress={() =>
                            openImageViewerFor(item, attachment, imageUrl)
                          }
                        >
                          <Image
                            source={{ uri: imageUrl }}
                            style={styles.attachmentImage}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                          />
                        </TouchableOpacity>
                      );
                    }
                    if (isImageAttachment && !imageUrl) {
                      return (
                        <TouchableOpacity
                          key={key}
                          activeOpacity={0.8}
                          style={[
                            styles.attachmentImage,
                            {
                              backgroundColor: '#E5E7EB',
                              justifyContent: 'center',
                              alignItems: 'center',
                            },
                          ]}
                          onPress={() => void openMessageAttachment(attachment)}
                        >
                          <Text style={styles.fileAttachmentMeta}>
                            Ảnh • Chạm để mở / tải
                          </Text>
                        </TouchableOpacity>
                      );
                    }
                    return (
                      <TouchableOpacity
                        key={key}
                        style={styles.fileAttachmentCard}
                        onPress={() => void openMessageAttachment(attachment)}
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
                isErpCompletionReport(String(item.body)) ||
                isErpAssignmentMessage(String(item.body)) ? (
                  <ErpStructuredMessage
                    body={String(item.body)}
                    isMine={isMine}
                    isDark={isDark}
                  />
                ) : (
                  <Text
                    style={[styles.bubbleText, isMine && styles.bubbleTextMine]}
                  >
                    {item.body}
                  </Text>
                )
              ) : null}
            </View>
            {hasReactions ? (
              <View
                style={[
                  styles.reactionsFloating,
                  isMine ? styles.reactionsFloatingMine : styles.reactionsFloatingOther,
                ]}
              >
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
            ) : null}
          </View>
          {(showReply || timeStr) ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: hasReactions ? 14 : 6,
                paddingHorizontal: 2,
              }}
            >
              {showReply ? (
                <TouchableOpacity
                  style={styles.replyInlineBtn}
                  onPress={() => handleStartReply(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Trả lời tin nhắn"
                >
                  <Ionicons
                    name="arrow-undo-outline"
                    size={15}
                    color={replyAccentColor}
                  />
                  <Text style={styles.replyInlineText}>Trả lời</Text>
                </TouchableOpacity>
              ) : null}
              <View style={{ flex: 1, minWidth: 4 }} />
              {timeStr ? (() => {
                const canTapReceipts =
                  isMine &&
                  !isRecalled &&
                  !item.is_optimistic &&
                  Number(item.id) > 0;
                const footer = (
                  <Text style={[styles.timeText, isMine && styles.timeTextMine, styles.messageFooterTime]}>
                    {timeStr}
                    {isMine && !isRecalled && (
                      item.is_optimistic
                        ? ' ○'
                        : item.read_by && item.read_by.length > 0
                          ? ' ✓✓'
                          : ' ✓'
                    )}
                  </Text>
                );
                return canTapReceipts ? (
                  <Pressable
                    onPress={() => {
                      setReadReceiptMessageId(Number(item.id));
                      setShowReadReceipts(true);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {footer}
                  </Pressable>
                ) : (
                  footer
                );
              })() : null}
            </View>
          ) : null}
      </>
    );

    return (
      <View
        onStartShouldSetResponderCapture={() => {
          clearScrollAnchorLock();
          return false;
        }}
        style={{
          borderRadius: 12,
          marginHorizontal: 2,
          borderWidth: 2,
          borderColor: isFlashed ? 'rgba(234, 179, 8, 0.85)' : 'transparent',
          backgroundColor: isFlashed ? 'rgba(234, 179, 8, 0.14)' : 'transparent',
        }}
      >
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
        {isMine && canForward ? (
          <TouchableOpacity
            style={styles.messageSideAction}
            onPress={() => setForwardSource(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Chuyển tiếp tin nhắn"
          >
            <Ionicons name="arrow-redo-outline" size={20} color={replyAccentColor} />
          </TouchableOpacity>
        ) : null}
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
          {useGroupedFrame ? (
            <View
              style={[
                styles.messageGroupedFrame,
                isMine && styles.messageGroupedFrameMine,
              ]}
            >
              {messageCore}
            </View>
          ) : (
            messageCore
          )}
        </TouchableOpacity>
        {!isMine && canForward ? (
          <TouchableOpacity
            style={styles.messageSideAction}
            onPress={() => setForwardSource(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Chuyển tiếp tin nhắn"
          >
            <Ionicons name="arrow-redo-outline" size={20} color={replyAccentColor} />
          </TouchableOpacity>
        ) : null}
        </View>
      </View>
    );
  }, [
    uniqueMessages,
    currentUserId,
    flashMessageId,
    styles,
    isDark,
    replyAccentColor,
    scrollToQuotedMessage,
    openImageViewerFor,
    openMessageAttachment,
    handleStartReply,
    handleToggleReaction,
    handleViewReactionDetail,
    clearScrollAnchorLock,
    handleViewProfile,
    handleLongPressMessage,
  ]);

  const renderNavHeaderActions = () => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8, gap: 10 }}>
      {presentationExtras.cloudTabDocumentsNav ? (
        <TouchableOpacity
          onPress={presentationExtras.cloudTabDocumentsNav.onOpenDocuments}
          accessibilityRole="button"
          accessibilityLabel="Tài liệu của tôi"
        >
          <Ionicons name="folder-open-outline" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      ) : null}
      {!isGroup && dmPeerUserId ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', maxWidth: 148 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: attendanceHeaderDotColor(
                peerAttendanceLine,
                peerAttendanceLoading,
              ),
              marginRight: 4,
            }}
          />
          <Text style={{ color: '#93C5FD', fontSize: 11 }} numberOfLines={1}>
            {peerAttendanceLoading ? 'Đang tải...' : (peerAttendanceLine ?? '—')}
          </Text>
        </View>
      ) : null}
      <TouchableOpacity onPress={() => setShowMessageFilter(true)} accessibilityLabel="Lọc tin nhắn">
        <Ionicons
          name="funnel-outline"
          size={20}
          color={messageFilterActive ? '#FBBF24' : '#FFFFFF'}
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setShowMsgSearch(true)}>
        <Ionicons name="search-outline" size={20} color="#FFFFFF" />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setShowTaskChecklist(true)}
        accessibilityLabel="Checklist công việc"
      >
        <Ionicons name="checkbox-outline" size={20} color="#FFFFFF" />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setShowAiAdvanced(true)} accessibilityLabel="Trợ lý báo cáo AI">
        <Ionicons name="sparkles-outline" size={20} color="#FFFFFF" />
      </TouchableOpacity>
      {isGroup && (
        <TouchableOpacity onPress={handleOpenGroupSettings}>
          <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {isCloudTabEmbed ? (
        <View style={{ backgroundColor: '#1E3A8A' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 6,
              paddingBottom: 10,
              paddingTop: Math.max(insets.top, 8),
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: 'rgba(255,255,255,0.2)',
            }}
          >
            <View style={{ width: 6 }} />
            <Text
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: 'center',
                color: '#FFFFFF',
                fontWeight: 'bold',
                fontSize: 18,
                marginHorizontal: 4,
              }}
              numberOfLines={1}
            >
              {chatTitle}
            </Text>
            <View style={{ flexShrink: 0 }}>{renderNavHeaderActions()}</View>
          </View>
        </View>
      ) : null}
      <SafeAreaView style={{ flex: 1 }} edges={isCloudTabEmbed ? [] : ['bottom']}>
      <Stack.Screen
        options={
          isCloudTabEmbed
            ? { headerShown: false }
            : {
                title: chatTitle,
                headerBackTitle: 'Trở lại',
                headerBackVisible: !presentationExtras.hideHeaderBack,
                headerStyle: { backgroundColor: '#1E3A8A' },
                headerTintColor: '#FFFFFF',
                headerTitleStyle: { fontWeight: 'bold', fontSize: 18 },
                headerRight: () => renderNavHeaderActions(),
              }
        }
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
          keyboardVerticalOffset={isCloudTabEmbed ? 0 : Platform.OS === 'ios' ? 90 : 100}
        >
          {isGroup && pinnedMessages.length > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'stretch',
                paddingVertical: 10,
                paddingHorizontal: 12,
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: isDark ? '#334155' : '#E5E7EB',
              }}
            >
              <TouchableOpacity
                style={{ flex: 1, minWidth: 0 }}
                activeOpacity={0.75}
                onPress={() => {
                  if (firstPinnedMessageId != null) {
                    void handleScrollToMessage(firstPinnedMessageId);
                  }
                }}
                disabled={firstPinnedMessageId == null}
                accessibilityRole="button"
                accessibilityLabel="Xem tin nhắn đã ghim"
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={18}
                    color={isDark ? '#60A5FA' : '#2563EB'}
                    style={{ marginRight: 8, marginTop: 2 }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '800',
                        color: isDark ? '#F1F5F9' : '#0F172A',
                      }}
                    >
                      Tin nhắn
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: isDark ? '#94A3B8' : '#475569',
                        marginTop: 4,
                        lineHeight: 18,
                      }}
                      numberOfLines={2}
                    >
                      {pinnedBarPreview}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
              {pinnedMessages.length > 1 ? (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    alignSelf: 'flex-start',
                    marginLeft: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: isDark ? '#475569' : '#CBD5E1',
                    backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                  }}
                  onPress={() => setShowPinnedList(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`${pinnedMessages.length - 1} tin ghim khác`}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: isDark ? '#93C5FD' : '#1E40AF',
                    }}
                  >
                    +{pinnedMessages.length - 1} ghim
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color={isDark ? '#93C5FD' : '#1E40AF'}
                    style={{ marginLeft: 2 }}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
          {uniqueMessages.length === 0 ? (
            <View style={styles.emptyChat} pointerEvents="none">
              <Text style={styles.emptyChatIcon}>💬</Text>
              <Text style={styles.emptyChatText}>
                Hãy gửi tin nhắn đầu tiên!
              </Text>
            </View>
          ) : null}
          <FlatList
            ref={flatListRef}
            data={uniqueMessages}
            keyExtractor={(item, index) => {
              const base =
                item?.clientMessageId ||
                item?.client_message_id ||
                item?.id?.toString() ||
                '';
              return base ? `${base}` : `msg-fallback-${index}`;
            }}
            renderItem={renderMessage}
            inverted
            extraData={flashMessageId}
            windowSize={12}
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={50}
            initialNumToRender={14}
            removeClippedSubviews={Platform.OS === 'android'}
            contentContainerStyle={styles.messageList}
            onRefresh={handleRefresh}
            refreshing={isRefreshing}
            onScrollToIndexFailed={handleFlatListScrollToIndexFailed}
            onContentSizeChange={scheduleResyncScrollToAnchor}
            onScrollBeginDrag={clearScrollAnchorLock}
            onEndReached={hasMoreOlder ? loadOlderMessages : undefined}
            onEndReachedThreshold={0.25}
            ListFooterComponent={
              isLoadingOlder ? (
                <View style={{ paddingVertical: 12 }}>
                  <ActivityIndicator size="small" color="#1E3A8A" />
                </View>
              ) : null
            }
          />
          </View>

          {/* Reply preview bar */}
          {replyTarget && (
            <View style={styles.replyPreview}>
              <View style={styles.replyPreviewBar} />
              <View style={styles.replyPreviewContent}>
                <Text style={styles.replyPreviewText} numberOfLines={1}>
                  <Text style={styles.replyPreviewTitle}>Đang trả lời </Text>
                  <Text style={styles.replyPreviewSender}>
                    {getSenderName(replyTarget)}
                  </Text>
                </Text>
                <Text style={styles.replyPreviewText} numberOfLines={1}>
                  {(replyTarget.body || '').slice(0, 80) || 'Ảnh / File'}
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
          {mentionRows.length > 0 && (
            <View style={styles.mentionSuggestions}>
              {mentionRows.map((row, idx) =>
                row.type === 'all' ? (
                  <TouchableOpacity
                    key="mention-all"
                    style={styles.mentionItem}
                    onPress={() => applyMentionSelection(row)}
                  >
                    <Text style={styles.mentionName}>Tất cả</Text>
                    <Text style={styles.mentionUsername}>
                      @{EVERYONE_MENTION_USERNAME}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    key={row.user.id ?? `u-${idx}`}
                    style={styles.mentionItem}
                    onPress={() => applyMentionSelection(row)}
                  >
                    <Text style={styles.mentionName}>
                      {row.user.fullName ||
                        (row.user as { full_name?: string }).full_name ||
                        row.user.username}
                    </Text>
                    <Text style={styles.mentionUsername}>@{row.user.username}</Text>
                  </TouchableOpacity>
                ),
              )}
            </View>
          )}

          <View style={[styles.inputBar, isCloudTabEmbed && { paddingBottom: 8 }]}>
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
              ref={composerInputRef}
              style={styles.inputField}
              placeholder='Nhập tin nhắn...'
              placeholderTextColor='#9CA3AF'
              value={inputText}
              onChangeText={(text) => {
                inputTextRef.current = text;
                setInputText(text);
                if (Number.isFinite(conversationId) && conversationId > 0) {
                  setComposerDraft(conversationId, text);
                }
                /** While typing, selection events often lag behind — use end-of-text so @Nguy… gets a non-empty query */
                mentionCaretRef.current = text.length;
                refreshMentionMenu(text, text.length);
              }}
              onSelectionChange={(e) => {
                const end = e.nativeEvent.selection.end;
                mentionCaretRef.current = end;
                refreshMentionMenu(inputTextRef.current, end);
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

      {/* Full-screen image viewer: swipe through thread images */}
      <Modal
        visible={!!imageViewer}
        transparent
        animationType="fade"
        onRequestClose={() => setImageViewer(null)}
        statusBarTranslucent
      >
        <View style={styles.imagePreviewOverlay}>
          <View style={styles.imagePreviewHeader}>
            {imageViewer && imageViewer.urls.length > 1 ? (
              <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '600' }}>
                {galleryVisibleIndex + 1} / {imageViewer.urls.length}
              </Text>
            ) : (
              <View />
            )}
            <TouchableOpacity
              onPress={() => setImageViewer(null)}
              style={styles.imagePreviewCloseBtn}
            >
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          {imageViewer && imageViewer.urls.length > 0 ? (
            <View style={styles.imagePreviewPagerWrap}>
              <FlatList
                ref={imagePagerRef}
                data={imageViewer.urls}
                horizontal
                pagingEnabled
                scrollEnabled={imagePagerScrollEnabled}
                showsHorizontalScrollIndicator={false}
                style={{ flex: 1 }}
                keyExtractor={(uri, i) => `${i}-${uri}`}
                extraData={viewerRotationDeg}
                renderItem={({ item: uri, index }) => (
                  <View
                    style={{
                      width: screenWidth,
                      flex: 1,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <ReactNativeZoomableView
                      ref={(r) => {
                        zoomableRefs.current[index] = r;
                      }}
                      maxZoom={5}
                      minZoom={1}
                      zoomStep={0.5}
                      initialZoom={1}
                      bindToBorders
                      contentWidth={screenWidth}
                      contentHeight={screenHeight * 0.82}
                      style={{
                        width: screenWidth,
                        height: screenHeight * 0.82,
                      }}
                      onZoomEnd={(_e, _gs, ev) => {
                        if (index === galleryVisibleIndex) {
                          setImagePagerScrollEnabled(ev.zoomLevel <= 1.02);
                        }
                      }}
                    >
                      <View
                        style={{
                          width: screenWidth,
                          height: screenHeight * 0.82,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <View style={{ transform: [{ rotate: `${viewerRotationDeg}deg` }] }}>
                          <Image
                            source={{ uri }}
                            style={{
                              width: screenWidth,
                              height: screenHeight * 0.82,
                            }}
                            contentFit="contain"
                            cachePolicy="memory-disk"
                          />
                        </View>
                      </View>
                    </ReactNativeZoomableView>
                  </View>
                )}
                getItemLayout={(_, idx) => ({
                  length: screenWidth,
                  offset: screenWidth * idx,
                  index: idx,
                })}
                viewabilityConfig={galleryViewabilityConfig}
                onViewableItemsChanged={onGalleryViewableItemsChanged}
                onScrollToIndexFailed={(info) => {
                  setTimeout(() => {
                    imagePagerRef.current?.scrollToIndex({
                      index: info.index,
                      animated: false,
                    });
                  }, 120);
                }}
              />
            </View>
          ) : null}
          <View style={styles.imagePreviewFooter}>
            <View style={styles.imagePreviewToolbar}>
              <TouchableOpacity
                onPress={imageViewerZoomOut}
                style={styles.imagePreviewToolBtn}
                accessibilityLabel="Thu nhỏ"
              >
                <Ionicons name="remove-circle-outline" size={26} color="#FFF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={imageViewerZoomIn}
                style={styles.imagePreviewToolBtn}
                accessibilityLabel="Phóng to"
              >
                <Ionicons name="add-circle-outline" size={26} color="#FFF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={imageViewerRotateLeft}
                style={styles.imagePreviewToolBtn}
                accessibilityLabel="Xoay ảnh"
              >
                <Ionicons name="arrow-undo-outline" size={24} color="#FFF" />
              </TouchableOpacity>
              {imageViewerCanEdit ? (
                <TouchableOpacity
                  onPress={openImageEditorFromViewer}
                  style={styles.imagePreviewToolBtn}
                  accessibilityLabel="Chỉnh sửa ảnh"
                >
                  <Ionicons name="create-outline" size={24} color="#FFF" />
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.imagePreviewHint}>
              Vuốt ngang giữa các ảnh • Chụm để phóng to • Hai ngón để di chuyển khi đã phóng to
            </Text>
          </View>
        </View>
      </Modal>

      <ChatImageEditorModal
        visible={!!imageEditorTarget}
        attachmentId={imageEditorTarget?.attachmentId ?? 0}
        conversationId={conversationId}
        onClose={() => setImageEditorTarget(null)}
        onSendSuccess={(data) => void appendUploadedMessage(setMessages, data)}
      />

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

            {(() => {
              const mt = menuTarget;
              const mtRecalled = mt?.isRecalled || mt?.is_recalled;
              const mtCanTask = !mtRecalled && !mt?.is_optimistic && Number(mt?.id) > 0;
              return mtCanTask ? (
                <>
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      setManualCreateTaskMessage(mt);
                      setManualCreateTaskOpen(true);
                      setMenuTarget(null);
                    }}
                  >
                    <Text style={styles.menuItemIcon}>📝</Text>
                    <Text style={styles.menuItemText}>Tạo Task</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      const m = mt;
                      setMenuTarget(null);
                      void handleQuickCreateTask(m);
                    }}
                  >
                    <Text style={styles.menuItemIcon}>⚡</Text>
                    <Text style={styles.menuItemText}>Task nhanh</Text>
                  </TouchableOpacity>
                </>
              ) : null;
            })()}

            {/* Pin */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={async () => {
                const msgId = Number(menuTarget?.id);
                if (msgId && conversationId > 0) {
                  try {
                    await chatApi.pinMessage(conversationId, msgId);
                    Alert.alert('✅', 'Đã ghim tin nhắn');
                    void refreshPinnedMessages();
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

            {/* Create Task */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                const msgId = Number(menuTarget?.id);
                const msgBody = String(menuTarget?.body || '').trim();
                if (msgId > 0) {
                  setCreateTaskTarget({ id: msgId, body: msgBody });
                }
                setMenuTarget(null);
              }}
            >
              <Text style={styles.menuItemIcon}>📋</Text>
              <Text style={styles.menuItemText}>Tạo công việc</Text>
            </TouchableOpacity>

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

      {/* Create Task Modal */}
      <CreateTaskModal
        visible={!!createTaskTarget}
        sourceMessage={createTaskTarget}
        roomMembers={groupMembers.map((m: any) => ({ id: m.id, full_name: m.full_name || m.username }))}
        onClose={() => setCreateTaskTarget(null)}
      />

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
          <View
            style={[styles.menuSheet, { maxHeight: screenHeight * 0.65 }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.forwardTitle}>↪️ Chuyển tiếp đến...</Text>
            <View style={styles.forwardSearchBar}>
              <Text style={{ marginRight: 8 }}>🔍</Text>
              <TextInput
                style={styles.forwardSearchInput}
                placeholder="Tìm hội thoại..."
                placeholderTextColor={isDark ? '#94a3b8' : '#9CA3AF'}
                value={forwardSearchQuery}
                onChangeText={setForwardSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {forwardSearchQuery.length > 0 ? (
                <TouchableOpacity onPress={() => setForwardSearchQuery('')}>
                  <Text style={{ color: '#6B7280', fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.menuDivider} />
            <FlatList
              data={filteredForwardConversations}
              keyExtractor={(c) => String(c.id)}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: screenHeight * 0.38 }}
              renderItem={({ item: conv }) => {
                const convTitle = formatConversationListTitle(
                  conv,
                  currentUserId,
                );
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
                forwardConversations.length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#1E3A8A" />
                    <Text style={{ color: '#9CA3AF', marginTop: 8 }}>Đang tải...</Text>
                  </View>
                ) : (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ color: '#9CA3AF', fontSize: 14 }}>Không tìm thấy hội thoại</Text>
                  </View>
                )
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
            <TouchableOpacity style={styles.menuItem} onPress={openDeleteGroupFlow}>
              <Text style={styles.menuItemIcon}>🗑️</Text>
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Xóa nhóm...</Text>
            </TouchableOpacity>

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
                onPress={() => {
                  setShowGallery(false);
                  const u = img.url || img.path;
                  if (u) {
                    setGalleryVisibleIndex(0);
                    setImageViewer({
                      urls: [u],
                      entries: [
                        {
                          url: u,
                          messageId: '',
                          attachmentId: String(img.id ?? ''),
                        },
                      ],
                      index: 0,
                    });
                  }
                }}
              >
                <Image
                  source={{ uri: img.url || img.path || img.thumbnailUrl }}
                  style={{ flex: 1, borderRadius: 2 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
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
                  onPress={() => void openMessageAttachment(file)}
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

      {/* ===== AI SUMMARY MODAL ===== */}
      <TaskChecklistModal
        visible={showTaskChecklist}
        onClose={() => setShowTaskChecklist(false)}
        conversationId={conversationId}
        currentUserId={currentUserId}
        remoteRefreshTick={taskRemoteTick}
        onJumpToMessage={(messageId) =>
          handleScrollToMessage(messageId)
        }
        isDark={isDark}
      />

      <ManualCreateTaskModal
        visible={manualCreateTaskOpen}
        onClose={() => {
          setManualCreateTaskOpen(false);
          setManualCreateTaskMessage(null);
        }}
        isDark={isDark}
        variant="fromMessage"
        conversationId={
          Number.isFinite(conversationId) && conversationId > 0 ? conversationId : null
        }
        message={manualCreateTaskMessage}
        conversations={[]}
        initialParticipants={chatParticipants}
        onCreated={() => setTaskRemoteTick((n) => n + 1)}
      />

      <Modal visible={showAiSummary} transparent animationType="slide" onRequestClose={() => setShowAiSummary(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowAiSummary(false)}>
          <View style={[styles.menuSheet, { maxHeight: screenHeight * 0.75 }]}>
            <Text style={styles.forwardTitle}>✨ Báo cáo AI — 7 ngày gần nhất</Text>
            <View style={styles.menuDivider} />

            {isAiLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#1E3A8A" />
                <Text style={{ color: '#6B7280', marginTop: 12, fontSize: 13 }}>AI đang phân tích tin nhắn...</Text>
              </View>
            ) : aiSummaryData ? (
              <ScrollView style={{ maxHeight: screenHeight * 0.55, paddingHorizontal: 16 }}>
                {/* Summary */}
                <View style={{ marginVertical: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E3A8A', marginBottom: 4 }}>📋 Tóm tắt</Text>
                  <Text style={{ fontSize: 13, color: '#374151', lineHeight: 20 }}>
                    {aiSummaryData.summary || aiSummaryData.answer || 'Không có dữ liệu'}
                  </Text>
                </View>

                {/* Highlights */}
                {aiSummaryData.highlights?.length > 0 && (
                  <View style={{ marginVertical: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669', marginBottom: 4 }}>⭐ Điểm nổi bật</Text>
                    {aiSummaryData.highlights.map((h: string, i: number) => (
                      <Text key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 20 }}>• {h}</Text>
                    ))}
                  </View>
                )}

                {/* Action Items */}
                {aiSummaryData.actionItems?.length > 0 && (
                  <View style={{ marginVertical: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#D97706', marginBottom: 4 }}>📌 Cần làm</Text>
                    {aiSummaryData.actionItems.map((a: string, i: number) => (
                      <Text key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 20 }}>• {a}</Text>
                    ))}
                  </View>
                )}

                {/* Risks */}
                {aiSummaryData.risks?.length > 0 && (
                  <View style={{ marginVertical: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626', marginBottom: 4 }}>⚠️ Rủi ro</Text>
                    {aiSummaryData.risks.map((r: string, i: number) => (
                      <Text key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 20 }}>• {r}</Text>
                    ))}
                  </View>
                )}

                <View style={{ height: 16 }} />
              </ScrollView>
            ) : null}

            <TouchableOpacity style={styles.menuItem} onPress={() => setShowAiSummary(false)}>
              <Text style={styles.menuItemIcon}>✕</Text>
              <Text style={[styles.menuItemText, { color: '#9CA3AF' }]}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <ChatMessageFilterModal
        visible={showMessageFilter}
        members={filterModalMembers}
        currentUserId={currentUserId}
        filter={messageFilter}
        isDark={isDark}
        onApply={(f) => {
          setMessageFilter(f);
          setShowMessageFilter(false);
        }}
        onClear={() => {
          setMessageFilter({
            filterUserId: null,
            filterDays: null,
            filterStartDate: null,
            filterEndDate: null,
          });
          setShowMessageFilter(false);
        }}
        onClose={() => setShowMessageFilter(false)}
      />

      <Modal
        visible={showPinnedList}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPinnedList(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
            onPress={() => setShowPinnedList(false)}
          />
          <View
            style={{
              backgroundColor: isDark ? '#121B2A' : '#FFFFFF',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 20,
              maxHeight: screenHeight * 0.55,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
                paddingBottom: 10,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: isDark ? '#334155' : '#E5E7EB',
              }}
            >
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: '800',
                  color: isDark ? '#F8FAFC' : '#111827',
                }}
              >
                Tin đã ghim
              </Text>
              <TouchableOpacity onPress={() => setShowPinnedList(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={{ fontSize: 20, color: isDark ? '#94A3B8' : '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={pinnedMessages}
              keyExtractor={(pin) => String(pin.message.id)}
              style={{ flexGrow: 0 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: pin }) => {
                const sender =
                  pin.message?.sender?.fullName ||
                  pin.message?.sender?.username ||
                  '—';
                const body =
                  String(pin.message?.body || '').trim() || 'Hình ảnh / file đính kèm';
                return (
                  <TouchableOpacity
                    style={{
                      paddingVertical: 12,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: isDark ? '#1E293B' : '#F1F5F9',
                    }}
                    onPress={() => {
                      setShowPinnedList(false);
                      void handleScrollToMessage(Number(pin.message.id));
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: isDark ? '#E2E8F0' : '#1E293B',
                      }}
                    >
                      {sender}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: isDark ? '#94A3B8' : '#64748B',
                        marginTop: 4,
                        lineHeight: 18,
                      }}
                      numberOfLines={4}
                    >
                      {body}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      <ChatReadReceiptsModal
        visible={showReadReceipts}
        conversationId={conversationId}
        messageId={readReceiptMessageId}
        isDark={isDark}
        onClose={() => {
          setShowReadReceipts(false);
          setReadReceiptMessageId(0);
        }}
      />

      {deleteGroupInfo ? (
        <ChatDeleteGroupModal
          visible={showDeleteGroup}
          info={deleteGroupInfo}
          isDeleting={isDeletingGroup}
          isDark={isDark}
          onConfirm={handleConfirmDeleteGroup}
          onClose={() => {
            setShowDeleteGroup(false);
            setDeleteGroupInfo(null);
          }}
        />
      ) : null}

      <ChatAiAdvancedModal
        visible={showAiAdvanced}
        conversationId={conversationId}
        groupName={chatTitle}
        isDark={isDark}
        onClose={() => setShowAiAdvanced(false)}
        onRunQuickSummarize={() => {
          setShowAiAdvanced(false);
          void handleAiSummarize();
        }}
      />
    </SafeAreaView>
    </View>
  );
}
