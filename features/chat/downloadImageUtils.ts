import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

function sanitizeFileName(name: string): string {
  return (name.trim() || 'image.jpg').replace(/[/\\?%*:|"<>]/g, '_').slice(0, 120);
}

function guessImageExtension(url: string): string {
  const lower = url.split('?')[0].toLowerCase();
  if (lower.endsWith('.png')) return '.png';
  if (lower.endsWith('.webp')) return '.webp';
  if (lower.endsWith('.gif')) return '.gif';
  return '.jpg';
}

/**
 * Download image then open system share sheet (Save to Photos / Files).
 * Works without extra native modules on Expo.
 */
export async function downloadImageFromUrl(
  url: string,
  options?: { fileName?: string; dialogTitle?: string },
): Promise<boolean> {
  const trimmed = String(url ?? '').trim();
  if (!trimmed) {
    Alert.alert('Lỗi', 'Không có URL ảnh để tải.');
    return false;
  }

  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    Alert.alert('Lỗi', 'Không thể truy cập bộ nhớ tạm.');
    return false;
  }

  const baseName = sanitizeFileName(
    options?.fileName || `chat-image-${Date.now()}${guessImageExtension(trimmed)}`,
  );
  const dest = `${cacheDir}${baseName}`;

  try {
    const result = await FileSystem.downloadAsync(trimmed, dest);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`HTTP ${result.status}`);
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri, {
        mimeType: baseName.endsWith('.png') ? 'image/png' : 'image/jpeg',
        dialogTitle: options?.dialogTitle || 'Lưu ảnh',
        UTI: 'public.image',
      });
      return true;
    }

    Alert.alert('Đã tải', `Ảnh đã lưu tạm:\n${result.uri}`);
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Không thể tải ảnh';
    Alert.alert('Lỗi tải ảnh', msg);
    return false;
  }
}
