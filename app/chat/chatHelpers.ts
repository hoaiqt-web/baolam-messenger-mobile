// Pure helper functions for the chat screen.
// Extracted from [id].tsx to reduce file size.

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

export function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function formatTime(dateStr: string | null | undefined) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${hours}:${mins} ${day}/${month}/${year}`;
}

export function formatDateSeparator(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - msgDate.getTime()) / 86400000);
  if (diffDays === 0) return 'Hôm nay';
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays < 7) {
    const dayNames = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    return dayNames[d.getDay()];
  }
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  if (d.getFullYear() === now.getFullYear()) return `${day}/${month}`;
  return `${day}/${month}/${d.getFullYear()}`;
}

export function getSenderName(item: any): string {
  return (
    item.sender?.fullName ||
    item.sender?.full_name ||
    item.sender?.username ||
    'Ai đó'
  );
}

export function formatFileSize(bytes: number | null | undefined): string {
  const size = Number(bytes || 0);
  if (size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export const REACTION_MAP: { code: string; emoji: string }[] = [
  { code: 'LIKE', emoji: '👍' },
  { code: 'LOVE', emoji: '❤️' },
  { code: 'HAHA', emoji: '😆' },
  { code: 'ANGRY', emoji: '😡' },
  { code: 'CRY', emoji: '😭' },
  { code: 'SAD', emoji: '😢' },
];

export const emojiToCode = (emoji: string) =>
  REACTION_MAP.find((r) => r.emoji === emoji)?.code || emoji;
export const codeToEmoji = (code: string) =>
  REACTION_MAP.find((r) => r.code === code)?.emoji || code;
