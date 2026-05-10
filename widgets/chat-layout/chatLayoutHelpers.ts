/**
 * chatLayoutHelpers.ts
 * Shared helpers for normalizing raw API chat data in the mobile chat layout.
 * Re-created to fix missing module error (TS2307) in useChatRoomController.ts.
 */
import type { ChatAttachment } from "@/Models/chat/types";

/**
 * Normalize raw attachment array from API response (replyTo / forwardedFrom).
 * The API may return null, undefined, or a partially-typed array — this ensures
 * a safe, strongly-typed ChatAttachment[] is always returned.
 */
export function normalizeReplyAttachmentsFromApi(
  raw: unknown
): ChatAttachment[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === "object"
    )
    .map((item) => ({
      id:           Number(item["id"] ?? 0),
      objectKey:    String(item["objectKey"] ?? item["object_key"] ?? ""),
      mimeType:     String(item["mimeType"] ?? item["mime_type"] ?? ""),
      size:         Number(item["size"] ?? item["file_size"] ?? 0),
      originalName: String(item["originalName"] ?? item["original_name"] ?? ""),
      width:        item["width"] != null ? Number(item["width"]) : null,
      height:       item["height"] != null ? Number(item["height"]) : null,
      url:          item["url"] != null ? String(item["url"]) : null,
    }));
}
