import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { chatApi, type PersonalFileItem } from '@/services/api/chatApi';
import { useAppTheme } from '@/contexts/ThemeContext';
import { openAttachmentWithFallback } from '@/features/chat/attachmentOpenUtils';

const MAX_MB = 100;
const WIN_W = Dimensions.get('window').width;

type TabKey = 'all' | 'image' | 'video' | 'document' | 'other';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'image', label: 'Ảnh' },
  { key: 'video', label: 'Video' },
  { key: 'document', label: 'Tài liệu' },
  { key: 'other', label: 'Khác' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function uploadPreparedFiles(
  items: Array<{ uri: string; name: string; mimeType: string; sizeBytes: number }>,
  onProgress: (msg: string) => void,
): Promise<PersonalFileItem[]> {
  if (!items.length) return [];
  onProgress('Đang lấy URL upload...');
  const presignRes = await chatApi.presignMyFiles(
    items.map((f) => ({ name: f.name, mimeType: f.mimeType, sizeBytes: f.sizeBytes })),
  );

  onProgress('Đang upload lên Cloud...');
  await Promise.all(
    presignRes.items.map(async (item, i) => {
      const blob = await fetch(items[i].uri).then((r) => r.blob());
      const uploadHeaders: Record<string, string> = { ...(item.headers || {}) };
      const put = await fetch(item.uploadUrl, {
        method: 'PUT',
        headers: uploadHeaders,
        body: blob,
      });
      if (!put.ok) {
        throw new Error(`Upload failed: ${put.status}`);
      }
    }),
  );

  onProgress('Đang lưu thông tin...');
  const confirmRes = await chatApi.confirmMyFiles(
    presignRes.items.map((item, i) => ({
      objectKey: item.objectKey,
      originalName: items[i].name,
      mimeType: items[i].mimeType,
      sizeBytes: items[i].sizeBytes,
    })),
  );
  return confirmRes.files;
}

type MyCloudScreenProps = {
  showHeaderChrome?: boolean;
  /** Đang trong stack tab Cloud (sau chat): nút chat = quay lại chat. */
  cloudDocumentsStack?: boolean;
};

export function MyCloudScreen({
  showHeaderChrome = true,
  cloudDocumentsStack = false,
}: MyCloudScreenProps) {
  const { isDark } = useAppTheme();
  const router = useRouter();
  const palette = useMemo(
    () => ({
      bg: isDark ? '#0B131F' : '#F1F5F9',
      card: isDark ? '#0d1929' : '#FFFFFF',
      border: isDark ? '#1e2e45' : '#E2E8F0',
      text: isDark ? '#F8FAFC' : '#0F172A',
      sub: isDark ? '#94A3B8' : '#64748B',
      accent: isDark ? '#00D9FF' : '#1E3A8A',
    }),
    [isDark],
  );

  const [tab, setTab] = useState<TabKey>('all');
  const [viewGrid, setViewGrid] = useState(true);
  const [files, setFiles] = useState<PersonalFileItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [uploadMode, setUploadMode] = useState<'file' | 'note'>('file');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const params: { category?: string } = {};
      if (tab !== 'all') params.category = tab;
      const res = await chatApi.getMyFiles(params);
      setFiles(res.files);
      setHasMore(res.hasMore);
      setCursor(res.nextCursor);
    } catch {
      setFiles([]);
      setHasMore(false);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    setSelectedId(null);
    void loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (!hasMore || cursor == null || loading) return;
    setLoading(true);
    try {
      const params: { category?: string; cursor: number } = { cursor };
      if (tab !== 'all') params.category = tab;
      const res = await chatApi.getMyFiles(params);
      setFiles((prev) => [...prev, ...res.files]);
      setHasMore(res.hasMore);
      setCursor(res.nextCursor);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [tab, cursor, hasMore, loading]);

  const openCloudChat = useCallback(async () => {
    try {
      const { conversation } = await chatApi.openCloudConversation();
      router.push({
        pathname: '/chat/[id]',
        params: {
          id: String(conversation.id),
          name: conversation.name || 'Cloud',
          type: conversation.type || 'cloud',
        },
      });
    } catch {
      Alert.alert('Lỗi', 'Không mở được Cloud của tôi.');
    }
  }, [router]);

  const handleHeaderChatPress = useCallback(() => {
    if (cloudDocumentsStack) {
      if (router.canGoBack()) {
        router.back();
      }
      return;
    }
    void openCloudChat();
  }, [cloudDocumentsStack, router, openCloudChat]);

  const handlePickFiles = useCallback(async () => {
    if (uploading) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: '*/*',
      });
      if (result.canceled || !result.assets?.length) return;

      const maxBytes = MAX_MB * 1024 * 1024;
      const assets = result.assets.map((a) => ({
        uri: a.uri,
        name: a.name || `file-${Date.now()}`,
        mimeType: a.mimeType || 'application/octet-stream',
        sizeBytes: Number(a.size || 0) || 1,
      }));

      const oversized = assets.filter((a) => a.sizeBytes > maxBytes);
      if (oversized.length) {
        Alert.alert(
          'File quá lớn',
          `Tối đa ${MAX_MB}MB/file: ${oversized.map((a) => a.name).join(', ')}`,
        );
        return;
      }

      setUploading(true);
      setUploadMsg('');
      const uploaded = await uploadPreparedFiles(assets, setUploadMsg);
      setFiles((prev) => [...uploaded, ...prev]);
      setUploadMsg('Đã upload thành công!');
      setTimeout(() => setUploadMsg(''), 2500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload thất bại';
      setUploadMsg(msg);
      Alert.alert('Lỗi', msg);
    } finally {
      setUploading(false);
    }
  }, [uploading]);

  const handleSaveNote = useCallback(async () => {
    if (!noteText.trim() || uploading) return;
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) {
      Alert.alert('Lỗi', 'Không có thư mục cache.');
      return;
    }
    const fileName = noteTitle.trim()
      ? `${noteTitle.trim().replace(/[/\\?%*:|"<>]/g, '_')}.txt`
        : `Ghi-chu-${Date.now()}.txt`;
    const path = `${cacheDir}${fileName}`;

    setUploading(true);
    setUploadMsg('');
    try {
      await FileSystem.writeAsStringAsync(path, noteText, {
        encoding: 'utf8',
      });
      const info = await FileSystem.getInfoAsync(path);
      const sizeBytes =
        info.exists && 'size' in info && typeof info.size === 'number'
          ? info.size
          : new TextEncoder().encode(noteText).length;

      const uploaded = await uploadPreparedFiles(
        [{ uri: path, name: fileName, mimeType: 'text/plain', sizeBytes }],
        setUploadMsg,
      );
      setFiles((prev) => [...uploaded, ...prev]);
      setNoteText('');
      setNoteTitle('');
      setUploadMode('file');
      setUploadMsg('Đã lưu ghi chú!');
      setTimeout(() => setUploadMsg(''), 2500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Lỗi lưu ghi chú';
      Alert.alert('Lỗi', msg);
    } finally {
      setUploading(false);
    }
  }, [noteText, noteTitle, uploading]);

  const handleDelete = useCallback(
    (f: PersonalFileItem) => {
      Alert.alert('Xóa file', `Xóa "${f.originalName}"?`, [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(f.id);
            try {
              await chatApi.deleteMyFile(f.id);
              setFiles((prev) => prev.filter((x) => x.id !== f.id));
              setSelectedId((id) => (id === f.id ? null : id));
            } catch {
              Alert.alert('Lỗi', 'Không xóa được file.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]);
    },
    [],
  );

  const handleOpen = useCallback(async (f: PersonalFileItem) => {
    try {
      let url = f.url;
      if (!url || !/^https?:\/\//i.test(url)) {
        const fresh = await chatApi.getMyFileUrl(f.id);
        url = fresh.url;
      }
      await openAttachmentWithFallback(url, f.originalName);
    } catch {
      try {
        await Linking.openURL(f.url);
      } catch {
        Alert.alert('Lỗi', 'Không mở được file.');
      }
    }
  }, []);

  const totalSize = files.reduce((s, f) => s + f.sizeBytes, 0);

  const gridGap = 6;
  const gridPad = 12;
  const cellW = (WIN_W - gridPad * 2 - gridGap * 2) / 3;

  const renderGridItem = ({ item: f }: { item: PersonalFileItem }) => {
    const isSel = selectedId === f.id;
    const isDel = deletingId === f.id;
    return (
      <TouchableOpacity
        style={[styles.gridCell, { width: cellW, borderColor: palette.border }]}
        activeOpacity={0.85}
        onPress={() => setSelectedId(isSel ? null : f.id)}
      >
        {f.category === 'image' ? (
          <Image source={{ uri: f.url }} style={[styles.gridThumb, { width: cellW - 4 }]} contentFit="cover" />
        ) : (
          <View style={[styles.gridIconBox, { width: cellW - 4, backgroundColor: palette.card }]}>
            <Ionicons
              name={
                f.category === 'video'
                  ? 'videocam-outline'
                  : f.category === 'document'
                    ? 'document-text-outline'
                    : 'file-tray-outline'
              }
              size={28}
              color={palette.accent}
            />
            <Text style={[styles.gridName, { color: palette.sub }]} numberOfLines={2}>
              {f.originalName}
            </Text>
          </View>
        )}
        {isSel ? (
          <View style={styles.gridOverlay}>
            <TouchableOpacity
              style={styles.overlayBtn}
              onPress={() => void handleOpen(f)}
              accessibilityLabel="Mở / tải"
            >
              <Ionicons name="download-outline" size={20} color={palette.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.overlayBtn}
              disabled={isDel}
              onPress={() => handleDelete(f)}
              accessibilityLabel="Xóa"
            >
              {isDel ? (
                <ActivityIndicator size="small" color="#F87171" />
              ) : (
                <Ionicons name="trash-outline" size={20} color="#F87171" />
              )}
            </TouchableOpacity>
          </View>
        ) : null}
        <Text style={styles.gridDateBadge}>{formatDate(f.createdAt)}</Text>
      </TouchableOpacity>
    );
  };

  const renderListItem = ({ item: f }: { item: PersonalFileItem }) => {
    const isDel = deletingId === f.id;
    return (
      <View
        style={[
          styles.listRow,
          { borderColor: palette.border, backgroundColor: isDark ? palette.card : palette.bg },
        ]}
      >
        {f.category === 'image' ? (
          <Image source={{ uri: f.url }} style={styles.listThumb} contentFit="cover" />
        ) : (
          <View style={[styles.listThumb, styles.listThumbIcon, { backgroundColor: palette.border }]}>
            <Ionicons name="document-outline" size={22} color={palette.accent} />
          </View>
        )}
        <View style={styles.listInfo}>
          <Text style={[styles.listTitle, { color: palette.text }]} numberOfLines={1}>
            {f.originalName}
          </Text>
          <Text style={[styles.listMeta, { color: palette.sub }]}>
            {formatBytes(f.sizeBytes)} · {formatDate(f.createdAt)}
          </Text>
        </View>
        <TouchableOpacity onPress={() => void handleOpen(f)} style={styles.listAction}>
          <Ionicons name="open-outline" size={22} color={palette.accent} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleDelete(f)}
          disabled={isDel}
          style={styles.listAction}
        >
          {isDel ? (
            <ActivityIndicator size="small" color="#F87171" />
          ) : (
            <Ionicons name="trash-outline" size={22} color="#F87171" />
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg }]} edges={['top']}>
      {showHeaderChrome ? (
        <View style={[styles.topBar, { borderBottomColor: palette.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={palette.accent} />
          </TouchableOpacity>
          <View style={styles.topTitleCol}>
            <Text style={[styles.topTitle, { color: palette.text }]}>Tài liệu của tôi</Text>
            <Text style={[styles.topSub, { color: palette.sub }]}>
              {files.length} file · {formatBytes(totalSize)}
            </Text>
          </View>
          <TouchableOpacity onPress={() => void handleHeaderChatPress()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chatbubbles-outline" size={22} color={palette.accent} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.tabTopBar, { borderBottomColor: palette.border }]}>
          <View style={styles.tabTitleBlock}>
            <Text style={[styles.topTitle, { color: palette.text }]}>Tài liệu của tôi</Text>
            <Text style={[styles.topSub, { color: palette.sub }]}>
              {files.length} file · {formatBytes(totalSize)}
            </Text>
          </View>
          <TouchableOpacity onPress={() => void handleHeaderChatPress()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chatbubbles-outline" size={22} color={palette.accent} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.modeToggle, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <TouchableOpacity
            style={[
              styles.modeBtn,
              uploadMode === 'file' && { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' },
            ]}
            onPress={() => setUploadMode('file')}
          >
            <Text style={[styles.modeBtnText, { color: uploadMode === 'file' ? palette.accent : palette.sub }]}>
              Tải file
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeBtn,
              uploadMode === 'note' && { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' },
            ]}
            onPress={() => setUploadMode('note')}
          >
            <Text style={[styles.modeBtnText, { color: uploadMode === 'note' ? palette.accent : palette.sub }]}>
              Ghi chú
            </Text>
          </TouchableOpacity>
        </View>

        {uploadMode === 'file' ? (
          <TouchableOpacity
            style={[
              styles.dropZone,
              {
                borderColor: palette.border,
                backgroundColor: palette.card,
                opacity: uploading ? 0.7 : 1,
              },
            ]}
            onPress={handlePickFiles}
            disabled={uploading}
            activeOpacity={0.8}
          >
            {uploading ? (
              <>
                <ActivityIndicator color={palette.accent} />
                {uploadMsg ? <Text style={[styles.uploadMsg, { color: palette.sub }]}>{uploadMsg}</Text> : null}
              </>
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={32} color={palette.sub} />
                <Text style={[styles.dropMain, { color: palette.text }]}>Chạm để chọn file</Text>
                <Text style={[styles.dropHint, { color: palette.sub }]}>
                  Tối đa {MAX_MB}MB/file · Nhiều file cùng lúc
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={[styles.noteBox, { borderColor: palette.border, backgroundColor: palette.card }]}>
            <TextInput
              style={[styles.noteTitleInp, { color: palette.text, borderColor: palette.border }]}
              placeholder="Tiêu đề (không bắt buộc)"
              placeholderTextColor={palette.sub}
              value={noteTitle}
              onChangeText={setNoteTitle}
              editable={!uploading}
            />
            <TextInput
              style={[styles.noteBodyInp, { color: palette.text, borderColor: palette.border }]}
              placeholder="Nội dung ghi chú..."
              placeholderTextColor={palette.sub}
              value={noteText}
              onChangeText={setNoteText}
              multiline
              editable={!uploading}
            />
            <View style={styles.noteFooter}>
              {uploadMsg ? <Text style={[styles.uploadMsg, { color: palette.sub, flex: 1 }]}>{uploadMsg}</Text> : (
                <View style={{ flex: 1 }} />
              )}
              <TouchableOpacity
                style={[
                  styles.saveNoteBtn,
                  { backgroundColor: `${palette.accent}28` },
                  (!noteText.trim() || uploading) && styles.disabledOp,
                ]}
                onPress={() => void handleSaveNote()}
                disabled={!noteText.trim() || uploading}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={palette.accent} />
                ) : (
                  <Text style={[styles.saveNoteText, { color: palette.accent }]}>Lưu</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.tabsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            {TABS.map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[
                  styles.tabChip,
                  {
                    borderColor: tab === t.key ? palette.accent : palette.border,
                    backgroundColor: tab === t.key ? `${palette.accent}18` : 'transparent',
                  },
                ]}
              >
                <Text
                  style={[styles.tabChipText, { color: tab === t.key ? palette.accent : palette.sub }]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.viewToggle}>
            <TouchableOpacity onPress={() => setViewGrid(true)} style={styles.viewBtn}>
              <Ionicons
                name="grid-outline"
                size={20}
                color={viewGrid ? palette.accent : palette.sub}
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setViewGrid(false)} style={styles.viewBtn}>
              <Ionicons
                name="list-outline"
                size={20}
                color={!viewGrid ? palette.accent : palette.sub}
              />
            </TouchableOpacity>
          </View>
        </View>

        {loading && files.length === 0 ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={palette.accent} size="large" />
          </View>
        ) : files.length === 0 ? (
          <View style={styles.centerPad}>
            <Ionicons name="folder-open-outline" size={48} color={palette.sub} style={{ opacity: 0.4 }} />
            <Text style={[styles.emptyText, { color: palette.sub }]}>Chưa có file nào</Text>
          </View>
        ) : viewGrid ? (
          <FlatList
            data={files}
            keyExtractor={(item) => String(item.id)}
            numColumns={3}
            scrollEnabled={false}
            columnWrapperStyle={{ gap: gridGap, marginBottom: gridGap, paddingHorizontal: gridPad }}
            renderItem={renderGridItem}
          />
        ) : (
          <FlatList
            data={files}
            keyExtractor={(item) => String(item.id)}
            scrollEnabled={false}
            contentContainerStyle={{ paddingHorizontal: gridPad, gap: 8 }}
            renderItem={renderListItem}
          />
        )}

        {hasMore && files.length > 0 ? (
          <TouchableOpacity
            style={[styles.loadMore, { borderColor: palette.border }]}
            onPress={() => void loadMore()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={palette.accent} />
            ) : (
              <Text style={{ color: palette.sub }}>Xem thêm</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 8 },
  topTitleCol: { flex: 1, alignItems: 'center' },
  tabTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabTitleBlock: { flex: 1, minWidth: 0 },
  topTitle: { fontSize: 16, fontWeight: '700' },
  topSub: { fontSize: 11, marginTop: 2 },
  scrollContent: { paddingBottom: 32 },
  modeToggle: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 10,
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modeBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  modeBtnText: { fontSize: 13, fontWeight: '600' },
  dropZone: {
    marginHorizontal: 12,
    marginTop: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  dropMain: { fontSize: 14, fontWeight: '600' },
  dropHint: { fontSize: 11 },
  uploadMsg: { fontSize: 12, textAlign: 'center', marginTop: 4 },
  noteBox: {
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
  },
  noteTitleInp: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 8,
  },
  noteBodyInp: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  noteFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  saveNoteBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  saveNoteText: { fontWeight: '700', fontSize: 14 },
  disabledOp: { opacity: 0.45 },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingLeft: 12,
  },
  tabsScroll: { flexGrow: 0, paddingRight: 8, gap: 6 },
  tabChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 6,
  },
  tabChipText: { fontSize: 12, fontWeight: '600' },
  viewToggle: { flexDirection: 'row', marginRight: 8 },
  viewBtn: { padding: 6 },
  centerPad: { paddingVertical: 48, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14 },
  gridCell: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  gridThumb: { aspectRatio: 1, borderRadius: 8 },
  gridIconBox: {
    aspectRatio: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  gridName: { fontSize: 9, textAlign: 'center', marginTop: 4 },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  overlayBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridDateBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    fontSize: 8,
    color: 'rgba(248,250,252,0.9)',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 8,
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  listThumb: { width: 44, height: 44, borderRadius: 8 },
  listThumbIcon: { justifyContent: 'center', alignItems: 'center' },
  listInfo: { flex: 1, minWidth: 0 },
  listTitle: { fontSize: 14, fontWeight: '600' },
  listMeta: { fontSize: 11, marginTop: 2 },
  listAction: { padding: 6 },
  loadMore: {
    marginHorizontal: 12,
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
