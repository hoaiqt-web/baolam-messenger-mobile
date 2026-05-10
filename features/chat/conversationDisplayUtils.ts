/**
 * Human-readable title for a conversation row (matches home chat list logic).
 * Direct chats often have an empty API `name`; use the other participant.
 */
export function formatConversationListTitle(
  conv: any,
  currentUserId: number | null,
): string {
  if (!conv || typeof conv !== 'object') {
    return 'Hội thoại';
  }
  const rawId = conv.id;
  const id = Number(rawId);
  const idPart = Number.isFinite(id) ? id : String(rawId ?? '');
  const fallback = `Hội thoại #${idPart}`;

  const type = String(conv.type || '');
  const participants = Array.isArray(conv.participants) ? conv.participants : [];

  if (type === 'direct' && participants.length > 0 && currentUserId != null) {
    const other = participants.find((p: any) => {
      const pid = Number(p?.id ?? p?.user?.id ?? 0);
      return pid !== 0 && pid !== Number(currentUserId);
    });
    if (other) {
      const name =
        other.fullName ||
        other.full_name ||
        other.user?.fullName ||
        other.user?.full_name ||
        other.username ||
        other.user?.username;
      if (name && String(name).trim()) {
        return String(name).trim();
      }
    }
  }

  const rawName = conv.name;
  if (
    rawName != null &&
    String(rawName).trim() !== '' &&
    String(rawName) !== 'Trò chuyện riêng'
  ) {
    return String(rawName).trim();
  }

  if (type === 'group') {
    return 'Nhóm không tên';
  }
  if (type === 'direct') {
    return 'Tin nhắn riêng';
  }

  return fallback;
}
