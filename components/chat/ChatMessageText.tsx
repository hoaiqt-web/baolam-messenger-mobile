import { Text, Linking, StyleSheet } from 'react-native';

import { EVERYONE_MENTION_USERNAME, escapeRegExp } from '@/features/chat/mentionUtils';
import { MarkdownInlineText } from '@/components/chat/MarkdownInlineText';

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

type MentionLike = {
  username?: string;
  fullName?: string;
  full_name?: string;
};

function mentionDisplayName(m: MentionLike): string {
  return String(m.fullName || m.full_name || m.username || '').trim();
}

type Props = {
  body: string;
  isMine: boolean;
  mentions?: MentionLike[];
  style?: object;
};

export function ChatMessageText({ body, isMine, mentions = [], style }: Props) {
  const text = String(body ?? '');
  if (!text) return null;

  const aliases = new Map<string, MentionLike>();
  for (const m of mentions) {
    const u = String(m.username ?? '').trim().toLowerCase();
    const d = mentionDisplayName(m).toLowerCase();
    if (u) aliases.set(u, m);
    if (d) aliases.set(d, m);
  }

  const aliasPatterns = Array.from(aliases.keys())
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);

  const mentionPattern = aliasPatterns.length
    ? new RegExp(`(@(?:${escapeRegExp(EVERYONE_MENTION_USERNAME)}|${aliasPatterns.join('|')}))`, 'gi')
    : /(@everyone)/gi;

  const segments = text.split(mentionPattern);

  return (
    <Text style={[styles.base, isMine && styles.baseMine, style]}>
      {segments.map((segment, index) => {
        if (!segment) return null;
        const isMention = segment.startsWith('@');
        if (isMention) {
          const key = segment.slice(1).trim().toLowerCase();
          const isEveryone = key === EVERYONE_MENTION_USERNAME;
          const known = isEveryone || aliases.has(key);
          if (known) {
            return (
              <Text
                key={`m-${index}`}
                style={[
                  styles.mention,
                  isMine ? styles.mentionMine : styles.mentionOther,
                ]}
              >
                {segment}
              </Text>
            );
          }
        }

        const parts = segment.split(URL_REGEX);
        return parts.map((part, i) => {
          if (/^https?:\/\//i.test(part)) {
            return (
              <Text
                key={`u-${index}-${i}`}
                style={[styles.link, isMine ? styles.linkMine : styles.linkOther]}
                onPress={() => void Linking.openURL(part)}
              >
                {part}
              </Text>
            );
          }
          if (part.includes('**')) {
            return (
              <MarkdownInlineText
                key={`t-${index}-${i}`}
                text={part}
                baseStyle={[styles.base, isMine && styles.baseMine, style]}
                boldStyle={[styles.bold, isMine && styles.boldMine]}
              />
            );
          }
          return <Text key={`t-${index}-${i}`}>{part}</Text>;
        });
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { fontSize: 15, lineHeight: 21, color: '#111827' },
  baseMine: { color: '#FFFFFF' },
  mention: {
    fontWeight: '700',
    borderRadius: 4,
    overflow: 'hidden',
  },
  mentionMine: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    color: '#FFFFFF',
  },
  mentionOther: {
    backgroundColor: 'rgba(99,102,241,0.25)',
    color: '#312e81',
  },
  link: { textDecorationLine: 'underline' },
  linkMine: { color: '#a5f3fc' },
  linkOther: { color: '#4338ca' },
  bold: { fontWeight: '800' },
  boldMine: { color: '#fef08a' },
});
