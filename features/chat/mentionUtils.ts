import type { ChatUserSummary } from '@/Models/chat/types';

export const EVERYONE_MENTION_USERNAME = 'everyone';

/** Max length aligned with backend StoreMessageRequest mentions array. */
const MAX_MENTION_IDS = 500;

/** Lowercase + strip combining marks for Vietnamese mention search. */
export function foldMentionSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Active @token at caret: token is @ plus word chars, no space inside (matches web).
 */
export function findActiveMention(value: string, caretPosition: number) {
  if (caretPosition <= 0) {
    return null;
  }

  const beforeCaret = value.slice(0, caretPosition);
  const match = beforeCaret.match(/(^|\s)@([\p{L}\p{N}._-]*)$/u);
  if (!match || match.index === undefined) {
    return null;
  }

  const triggerIndex = match.index + match[1].length;
  return {
    query: match[2],
    start: triggerIndex,
    end: caretPosition,
  };
}

export function extractMentionKeys(
  value: string,
  knownKeys: Iterable<string> = [],
): Set<string> {
  const mentionKeys = new Set<string>();
  /** Unicode letters — same token class as findActiveMention after @ */
  const matches = value.matchAll(/@([\p{L}\p{N}._-]+)/gu);
  for (const match of matches) {
    const mentionKey = (match[1] ?? '').trim().toLowerCase();
    if (mentionKey.length > 0) {
      mentionKeys.add(mentionKey);
    }
  }

  for (const rawKey of knownKeys) {
    const mentionKey = rawKey.trim().toLowerCase();
    if (mentionKey.length === 0 || !mentionKey.includes(' ')) {
      continue;
    }
    const pattern = new RegExp(
      `(^|\\s)@${escapeRegExp(mentionKey)}(?=$|\\s|[.,!?;:])`,
      'i',
    );
    if (pattern.test(value)) {
      mentionKeys.add(mentionKey);
    }
  }
  return mentionKeys;
}

export type MentionParticipant = Pick<
  ChatUserSummary,
  'id' | 'username' | 'fullName'
> & { full_name?: string };

function participantMentionKnownKeys(participants: MentionParticipant[]): string[] {
  const out: string[] = [];
  for (const p of participants) {
    const fn = (p.fullName || p.full_name || '').trim();
    if (fn.includes(' ')) {
      out.push(fn);
    }
  }
  return out;
}

export function buildMentionIds(
  body: string,
  participants: MentionParticipant[],
  currentUserId: number | null,
): number[] {
  const keys = extractMentionKeys(body, participantMentionKnownKeys(participants));
  const ids = new Set<number>();

  if (keys.has(EVERYONE_MENTION_USERNAME)) {
    for (const p of participants) {
      const uid = Number(p.id);
      if (Number.isFinite(uid) && uid > 0 && uid !== currentUserId) {
        ids.add(uid);
      }
    }
    keys.delete(EVERYONE_MENTION_USERNAME);
  }

  const lookup = new Map<string, MentionParticipant>();
  for (const p of participants) {
    const u = String(p.username || '').trim().toLowerCase();
    if (u) {
      lookup.set(u, p);
    }
    const raw = (p.fullName || p.full_name || '').trim();
    if (raw) {
      lookup.set(raw.toLowerCase(), p);
      lookup.set(foldMentionSearchText(raw), p);
    }
  }

  for (const key of keys) {
    let user = lookup.get(key);
    if (!user && !key.includes(' ')) {
      user = lookup.get(foldMentionSearchText(key));
    }
    if (user) {
      const uid = Number(user.id);
      if (Number.isFinite(uid) && uid > 0) {
        ids.add(uid);
      }
    }
  }

  return Array.from(ids).slice(0, MAX_MENTION_IDS);
}
