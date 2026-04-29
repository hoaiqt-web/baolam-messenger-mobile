import { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
  RefreshControl,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { authApi } from '@/services/api/authApi';
import { chatApi } from '@/services/api/chatApi';
import { authStorage } from '@/features/auth/authStorage';
import {
  getLastRealtimeInboundActivityAt,
  getRealtimeConnectionState,
  subscribeUserInboxMessages,
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

function formatTimeAgo(dateStr: string | null | undefined) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} ngày`;
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export default function HomeScreen() {
  const REALTIME_IDLE_THRESHOLD_MS = 15_000;
  const POLL_INTERVAL_HEALTHY_MS = 25_000;
  const POLL_INTERVAL_DEGRADED_MS = 5_000;
  const router = useRouter();
  const [isInitializing, setIsInitializing] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingChats, setIsFetchingChats] = useState(false);
  const [chats, setChats] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [directoryChats, setDirectoryChats] = useState<any[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [openingUserId, setOpeningUserId] = useState<number | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const fetchChatsRef = useRef<() => void>(() => undefined);
  const lastPollAtRef = useRef(0);

  useEffect(() => {
    const initApp = async () => {
      await authStorage.init();
      const token = authStorage.getToken();
      if (token) {
        setIsAuthenticated(true);
        try {
          const me = await authApi.me();
          setCurrentUserId(Number(me.user?.id) || null);
        } catch {
          setCurrentUserId(null);
        }
        fetchChats();
      }
      setIsInitializing(false);
    };
    initApp();
  }, []);

  const fetchChats = async () => {
    setIsFetchingChats(true);
    try {
      const response = await chatApi.getConversations();
      setChats(response.conversations || []);
    } catch (error: any) {
      const status = Number(error?.response?.status || 0);
      console.error('Error fetching chats', error);
      if (status === 401) {
        Alert.alert('Phiên đăng nhập hết hạn', 'Vui lòng đăng nhập lại.');
        handleLogout();
      } else {
        Alert.alert('Lỗi', 'Không thể tải danh sách hội thoại.');
      }
    } finally {
      setIsFetchingChats(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchChats();
  }, []);

  useEffect(() => {
    fetchChatsRef.current = fetchChats;
  }, [fetchChats]);

  useEffect(() => {
    const trimmed = searchInput.trim();
    const timer = setTimeout(() => {
      setDebouncedSearch(trimmed);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Lỗi', 'Vui lòng nhập tài khoản và mật khẩu!');
      return;
    }
    setIsLoading(true);
    try {
      const response = await authApi.login({ username, password });
      await authStorage.setTokens(
        response.access_token,
        response.refresh_token,
      );
      setIsAuthenticated(true);
      setCurrentUserId(Number(response.user?.id) || null);
      fetchChats();
    } catch (error: any) {
      console.error('login error', {
        code: error?.code,
        message: error?.message,
        status: error?.response?.status,
        responseData: error?.response?.data,
        requestUrl: error?.config?.url,
        requestMethod: error?.config?.method,
      });
      Alert.alert('Đăng nhập thất bại', 'Sai tài khoản hoặc mật khẩu.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await authStorage.clearToken();
    setIsAuthenticated(false);
    setChats([]);
    setSearchInput('');
    setDebouncedSearch('');
    setDirectoryChats([]);
    setDirectoryUsers([]);
    setSearchError(null);
    setCurrentUserId(null);
    setUsername('');
    setPassword('');
  };

  const scheduleRealtimeConversationRefresh = useCallback(() => {
    if (realtimeRefreshTimerRef.current) {
      return;
    }

    realtimeRefreshTimerRef.current = setTimeout(() => {
      realtimeRefreshTimerRef.current = null;
      fetchChats();
    }, 250);
  }, []);

  useEffect(() => {
    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !currentUserId) {
      return;
    }

    return subscribeUserInboxMessages(
      currentUserId,
      () => scheduleRealtimeConversationRefresh(),
      () => scheduleRealtimeConversationRefresh(),
      () => scheduleRealtimeConversationRefresh(),
    );
  }, [isAuthenticated, currentUserId, scheduleRealtimeConversationRefresh]);

  useEffect(() => {
    if (!isAuthenticated) {
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
      fetchChatsRef.current();
    };

    const interval = setInterval(maybePoll, 2000);
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        fetchChatsRef.current();
      }
    });

    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [isAuthenticated]);

  const getDisplayTitle = (item: any) => {
    // For direct chats: always show the other person's name
    // API returns participants as flat objects: { id, username, fullName, ... }
    // NOT nested: { user: { id, username } }
    if (item.type === 'direct' && item.participants) {
      const other = item.participants.find(
        (p: any) => {
          const pid = p.id || p.user?.id;
          const pUsername = p.username || p.user?.username;
          return Number(pid) !== Number(currentUserId) && pUsername !== username;
        },
      );
      if (other) {
        const otherName =
          other.fullName ||
          other.full_name ||
          other.user?.fullName ||
          other.user?.full_name ||
          other.username ||
          other.user?.username;
        if (otherName) return otherName;
      }
    }
    // For groups or when participant lookup fails
    if (item.name && item.name !== 'Trò chuyện riêng') return item.name;
    return item.type === 'direct' ? 'Tin nhắn riêng' : 'Nhóm không tên';
  };

  useEffect(() => {
    if (!isAuthenticated || debouncedSearch.length < 2) {
      setDirectoryChats([]);
      setDirectoryUsers([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    setSearchError(null);

    chatApi
      .searchGlobal(debouncedSearch)
      .then((response) => {
        if (!cancelled) {
          setDirectoryChats(response.conversations || []);
          setDirectoryUsers(response.users || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDirectoryChats([]);
          setDirectoryUsers([]);
          setSearchError('Không tải được kết quả tìm kiếm.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSearching(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, isAuthenticated]);

  const hasSearch = debouncedSearch.length > 0;
  const localFilteredChats = hasSearch
    ? chats.filter((item) => {
        const query = debouncedSearch.toLowerCase();
        const title = getDisplayTitle(item).toLowerCase();
        const latestBody = String(item.latestMessage?.body || '').toLowerCase();
        return title.includes(query) || latestBody.includes(query);
      })
    : chats;

  const mergedSearchMap = new Map<number, any>();
  [...directoryChats, ...localFilteredChats].forEach((item) => {
    mergedSearchMap.set(Number(item.id), item);
  });
  const displayedChats = hasSearch
    ? Array.from(mergedSearchMap.values())
    : localFilteredChats;

  const searchRows = hasSearch
    ? [
        ...directoryUsers.map((user) => ({ rowType: 'user', item: user })),
        ...displayedChats.map((chat) => ({ rowType: 'chat', item: chat })),
      ]
    : displayedChats.map((chat) => ({ rowType: 'chat', item: chat }));

  const handleOpenDirectUser = async (user: any) => {
    const userConversationId = Number(user?.conversationId || 0);
    const userLabel = user.fullName || user.username || 'Người dùng';
    if (Number.isFinite(userConversationId) && userConversationId > 0) {
      router.push({
        pathname: '/chat/[id]',
        params: { id: userConversationId, name: userLabel },
      });
      return;
    }

    setOpeningUserId(Number(user.id));
    try {
      const opened = await chatApi.openDirectConversation(user.username);
      const conversation = opened?.conversation;
      if (conversation?.id) {
        router.push({
          pathname: '/chat/[id]',
          params: { id: conversation.id, name: userLabel },
        });
        fetchChats();
      }
    } catch (error) {
      console.error('open direct user error', error);
      Alert.alert('Lỗi', 'Không thể mở hội thoại với người dùng này.');
    } finally {
      setOpeningUserId(null);
    }
  };

  if (isInitializing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size='large' color='#1E3A8A' />
      </View>
    );
  }

  if (isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>💬 Hội thoại</Text>
            <Text style={styles.headerSubtitle}>BAOLAM Messenger</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutText}>Đăng xuất</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder='Tìm kiếm hội thoại...'
            placeholderTextColor='#9CA3AF'
            value={searchInput}
            onChangeText={setSearchInput}
            autoCapitalize='none'
          />
          {searchInput.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchInput('')}>
              <Text style={styles.clearSearch}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {searchError ? (
          <Text style={styles.searchError}>{searchError}</Text>
        ) : null}

        <FlatList
          data={searchRows}
          keyExtractor={(row) =>
            `${row.rowType}-${row.rowType === 'user' ? row.item.id : row.item.id}`
          }
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={['#1E3A8A']}
            />
          }
          renderItem={({ item: row, index }) => {
            if (row.rowType === 'user') {
              const user = row.item;
              const userName = user.fullName || user.username || 'Người dùng';
              const userAvatarColor = getAvatarColor(userName);
              const hasConversation = Number(user.conversationId || 0) > 0;
              const showUserHeader =
                index === 0 || searchRows[index - 1]?.rowType !== 'user';

              return (
                <>
                  {showUserHeader ? (
                    <Text style={styles.searchSectionHeader}>Người dùng</Text>
                  ) : null}
                  <TouchableOpacity
                    style={styles.chatCard}
                    onPress={() => handleOpenDirectUser(user)}
                    activeOpacity={0.6}
                    disabled={openingUserId === Number(user.id)}
                  >
                    <View
                      style={[
                        styles.chatAvatar,
                        { backgroundColor: userAvatarColor },
                      ]}
                    >
                      <Text style={styles.avatarText}>
                        {userName[0]?.toUpperCase() || '?'}
                      </Text>
                    </View>
                    <View style={styles.chatInfo}>
                      <View style={styles.chatTopRow}>
                        <Text style={styles.chatName} numberOfLines={1}>
                          {userName}
                        </Text>
                      </View>
                      <Text style={styles.chatPreview} numberOfLines={1}>
                        @{user.username}{' '}
                        {hasConversation
                          ? '• Đã có hội thoại'
                          : '• Nhấn để nhắn tin'}
                      </Text>
                    </View>
                    {openingUserId === Number(user.id) ? (
                      <ActivityIndicator size='small' color='#1E3A8A' />
                    ) : null}
                  </TouchableOpacity>
                </>
              );
            }

            const item = row.item;
            const displayTitle = getDisplayTitle(item);
            const avatarColor = getAvatarColor(displayTitle);
            const timeAgo = formatTimeAgo(
              item.latestMessage?.sentAt ||
                item.latestMessage?.sent_at ||
                item.last_message_at,
            );
            const isGroup = item.type === 'group';
            const previewBody = item.latestMessage?.body || 'Chưa có tin nhắn';
            const senderPrefix =
              isGroup && item.latestMessage?.sender
                ? `${item.latestMessage.sender.fullName || item.latestMessage.sender.full_name || item.latestMessage.sender.username}: `
                : '';
            const showChatHeader =
              hasSearch &&
              (index === 0 || searchRows[index - 1]?.rowType !== 'chat');

            return (
              <>
                {showChatHeader ? (
                  <Text style={styles.searchSectionHeader}>Hội thoại</Text>
                ) : null}
                <TouchableOpacity
                  style={styles.chatCard}
                  onPress={() =>
                    router.push({
                      pathname: '/chat/[id]',
                      params: { id: item.id, name: displayTitle },
                    })
                  }
                  activeOpacity={0.6}
                >
                  <View
                    style={[
                      styles.chatAvatar,
                      { backgroundColor: avatarColor },
                    ]}
                  >
                    <Text style={styles.avatarText}>
                      {displayTitle[0].toUpperCase()}
                    </Text>
                    {isGroup && (
                      <View style={styles.groupBadge}>
                        <Text style={styles.groupBadgeText}>👥</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.chatInfo}>
                    <View style={styles.chatTopRow}>
                      <Text style={styles.chatName} numberOfLines={1}>
                        {displayTitle}
                      </Text>
                      {timeAgo ? (
                        <Text style={styles.chatTime}>{timeAgo}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.chatPreview} numberOfLines={1}>
                      {senderPrefix}
                      {previewBody}
                    </Text>
                  </View>
                </TouchableOpacity>
              </>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              {isFetchingChats ? (
                <ActivityIndicator size='large' color='#1E3A8A' />
              ) : isSearching ? (
                <ActivityIndicator size='large' color='#1E3A8A' />
              ) : (
                <>
                  <Text style={styles.emptyIcon}>📭</Text>
                  <Text style={styles.emptyText}>
                    {hasSearch
                      ? 'Không tìm thấy hội thoại phù hợp.'
                      : 'Chưa có cuộc trò chuyện nào.'}
                  </Text>
                  <Text style={styles.emptyHint}>
                    {hasSearch ? 'Thử từ khóa khác' : 'Kéo xuống để tải lại'}
                  </Text>
                </>
              )}
            </View>
          }
        />
      </SafeAreaView>
    );
  }

  // LOGIN SCREEN
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.loginContainer}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>B</Text>
        </View>
        <Text style={styles.welcomeTitle}>BAOLAM ERP</Text>
        <Text style={styles.welcomeSubtitle}>Hệ thống Messenger nội bộ</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Tài khoản</Text>
          <TextInput
            style={styles.input}
            placeholder='Nhập mã nhân viên hoặc username'
            placeholderTextColor='#9CA3AF'
            value={username}
            onChangeText={setUsername}
            autoCapitalize='none'
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Mật khẩu</Text>
          <TextInput
            style={styles.input}
            placeholder='Nhập mật khẩu'
            placeholderTextColor='#9CA3AF'
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          style={[styles.loginBtn, isLoading && styles.loginBtnDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color='#fff' />
          ) : (
            <Text style={styles.loginBtnText}>Đăng nhập ngay</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.versionText}>v1.0.0 — Phiên bản thử nghiệm</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
  },

  // Header
  header: {
    backgroundColor: '#1E3A8A',
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  headerSubtitle: { color: '#93C5FD', fontSize: 12, marginTop: 2 },
  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  logoutText: { color: '#FFF', fontSize: 14, fontWeight: '500' },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  searchIcon: { fontSize: 16, marginRight: 10 },
  searchInput: {
    flex: 1,
    color: '#111827',
    fontSize: 15,
    paddingVertical: 0,
  },
  clearSearch: { color: '#9CA3AF', fontSize: 16, paddingLeft: 8 },
  searchSectionHeader: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  searchError: {
    color: '#EF4444',
    fontSize: 13,
    marginHorizontal: 20,
    marginTop: -4,
    marginBottom: 8,
  },

  // Chat List
  chatCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 2,
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: '#F3F4F6',
  },
  chatAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: { fontSize: 22, fontWeight: 'bold', color: '#FFF' },
  groupBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupBadgeText: { fontSize: 11 },
  chatInfo: { flex: 1 },
  chatTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  chatTime: { fontSize: 12, color: '#9CA3AF' },
  chatPreview: { fontSize: 14, color: '#6B7280', lineHeight: 20 },

  // Empty
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { textAlign: 'center', color: '#6B7280', fontSize: 16 },
  emptyHint: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 4,
  },

  // Login
  loginContainer: { flex: 1, padding: 30, justifyContent: 'center' },
  logoCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#1E3A8A',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 24,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  logoText: { color: '#FFF', fontSize: 44, fontWeight: 'bold' },
  welcomeTitle: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 6,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 40,
  },
  formGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    color: '#111827',
  },
  loginBtn: {
    backgroundColor: '#1E3A8A',
    borderRadius: 14,
    padding: 17,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  loginBtnDisabled: { backgroundColor: '#9CA3AF' },
  loginBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  versionText: {
    textAlign: 'center',
    color: '#D1D5DB',
    fontSize: 12,
    marginTop: 24,
  },
});
