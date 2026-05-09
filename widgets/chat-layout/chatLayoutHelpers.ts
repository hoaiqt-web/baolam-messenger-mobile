import type { ChatAttachment } from '@/Models/chat/types';

export function normalizeReplyAttachmentsFromApi(
  raw: unknown,
): ChatAttachment[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  return raw.map((item) => {
    const a = item as Record<string, unknown>;
    return {
      id: Number(a.id),
      objectKey: String(a.objectKey ?? ''),
      mimeType: String(a.mimeType ?? ''),
      size: Number(a.size ?? 0),
      originalName: String(a.originalName ?? ''),
      width: a.width == null ? null : Number(a.width),
      height: a.height == null ? null : Number(a.height),
      url: typeof a.url === 'string' ? a.url : null,
    };
  });
}
