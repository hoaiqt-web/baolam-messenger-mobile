import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

import { env } from '@/shared/config/env';
import { httpClient } from '@/services/api/httpClient';

type AttachmentLike = {
  id?: number;
  url?: string | null;
  downloadUrl?: string | null;
};

function stripApiSuffix(base: string): string {
  return base.replace(/\/api\/?$/, '');
}

/**
 * Build absolute URL for attachment open/download.
 * Signed GCS URLs are usually absolute; relative paths get API origin.
 */
export function resolveOpenableAttachmentUrl(attachment: AttachmentLike): string | null {
  const raw = attachment?.url || attachment?.downloadUrl || null;
  if (raw == null || String(raw).trim() === '') {
    return null;
  }
  const s = String(raw).trim();
  if (/^https?:\/\//i.test(s)) {
    return s;
  }
  if (s.startsWith('//')) {
    return `https:${s}`;
  }
  const base = stripApiSuffix(env.apiBaseUrl.replace(/\/$/, ''));
  const path = s.startsWith('/') ? s : `/${s}`;
  return `${base}${path}`;
}

/** Optional: refresh signed read URL from backend when message payload omitted url. */
export async function fetchAttachmentReadUrl(attachmentId: number): Promise<string | null> {
  const { data } = await httpClient.get<{ url?: string }>(
    `/chat/attachments/${attachmentId}/read-url`,
  );
  const url = data?.url;
  return url && String(url).trim() !== '' ? String(url).trim() : null;
}

function sanitizeDownloadFileName(name: string): string {
  const t = name.trim() || 'file.bin';
  return t.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 120);
}

function guessMimeFromFileName(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.endsWith('.zip')) return 'application/zip';
  return undefined;
}

/**
 * Open remote file: try system handler, then download + share sheet, then in-app browser.
 */
export async function openAttachmentWithFallback(
  url: string,
  originalName?: string | null,
): Promise<void> {
  try {
    await Linking.openURL(url);
    return;
  } catch {
    /* continue */
  }

  const cacheDir = FileSystem.cacheDirectory;
  if (cacheDir) {
    const safeName = sanitizeDownloadFileName(
      originalName && originalName.includes('.')
        ? originalName
        : `${originalName || 'file'}.bin`,
    );
    const dest = `${cacheDir}chat-att-${Date.now()}-${safeName}`;
    try {
      const { uri } = await FileSystem.downloadAsync(url, dest);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: guessMimeFromFileName(safeName),
          dialogTitle: originalName || 'Tệp đính kèm',
        });
        return;
      }
    } catch {
      /* fall through to browser */
    }
  }

  await WebBrowser.openBrowserAsync(url);
}

/** @deprecated Use openAttachmentWithFallback */
export async function openAttachmentUrl(url: string): Promise<void> {
  await openAttachmentWithFallback(url, null);
}
