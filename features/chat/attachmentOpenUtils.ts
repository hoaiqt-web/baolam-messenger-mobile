import * as WebBrowser from 'expo-web-browser';

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

export async function openAttachmentUrl(url: string): Promise<void> {
  await WebBrowser.openBrowserAsync(url);
}
