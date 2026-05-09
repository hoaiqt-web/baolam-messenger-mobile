import { resolveOpenableAttachmentUrl } from '@/features/chat/attachmentOpenUtils';

export type ImageGalleryEntry = {
  url: string;
  messageId: string;
  attachmentId: string;
};

/**
 * Flattens image attachments across messages (same array order as `messages`, typically newest-first).
 * Skips optimistic temp rows and attachments without a resolvable URL.
 */
export function buildImageGalleryEntries(messages: any[]): ImageGalleryEntry[] {
  const out: ImageGalleryEntry[] = [];
  for (const msg of messages) {
    const midRaw = msg?.id;
    const mid = String(midRaw ?? '');
    if (!mid || mid.startsWith('temp-')) {
      continue;
    }
    const atts = Array.isArray(msg.attachments) ? msg.attachments : [];
    for (let i = 0; i < atts.length; i++) {
      const a = atts[i];
      const mime = String(a?.mimeType || '').toLowerCase();
      if (!mime.startsWith('image/')) {
        continue;
      }
      const url = resolveOpenableAttachmentUrl(a);
      if (!url) {
        continue;
      }
      const aid = String(a?.id ?? i);
      out.push({
        url,
        messageId: mid,
        attachmentId: aid,
      });
    }
  }
  return out;
}

export function findGalleryStartIndex(
  entries: ImageGalleryEntry[],
  messageId: string | number | undefined,
  attachment: { id?: number },
  fallbackUrl: string,
): number {
  const mid = String(messageId ?? '');
  const aid = String(attachment?.id ?? '');
  if (mid && aid) {
    const idx = entries.findIndex(
      (e) => e.messageId === mid && e.attachmentId === aid,
    );
    if (idx >= 0) {
      return idx;
    }
  }
  const byUrl = entries.findIndex((e) => e.url === fallbackUrl);
  if (byUrl >= 0) {
    return byUrl;
  }
  return 0;
}
