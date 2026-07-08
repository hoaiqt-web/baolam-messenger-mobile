import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { parsePoApprovalResultData } from '@/features/chat/poApprovalResultParsers';
import { MarkdownInlineText } from '@/components/chat/MarkdownInlineText';
import { getErpMessengerCardPalette } from '@/features/chat/erpCardTheme';

type Props = {
  body: string;
  isMine: boolean;
};

function resultTheme(approved: boolean, isMine: boolean) {
  if (approved) {
    const palette = getErpMessengerCardPalette(isMine, 'emerald');
    return {
      cardBg: '#0b1611',
      cardBorder: palette.cardBorder,
      title: '#5ee9b5',
      icon: '#34d399',
      badgeBg: '#0f2e22',
      badgeBorder: '#2d6b52',
      badgeText: '#6ee7b7',
      divider: '#2a4a3a',
      body: '#e8eef4',
      bold: '#f0c14a',
      footer: '#9db0c4',
    };
  }
  return {
    cardBg: '#18100f',
    cardBorder: '#b4545488',
    title: '#fca5a5',
    icon: '#f87171',
    badgeBg: '#2a1212',
    badgeBorder: '#8b3a3a',
    badgeText: '#fecaca',
    divider: '#4a2828',
    body: '#ece8e8',
    bold: '#fcd34d',
    footer: '#b8a0a0',
  };
}

export function PoApprovalResultMessageCard({ body, isMine }: Props) {
  const data = parsePoApprovalResultData(body);
  if (!data) return null;

  const approved = data.isApproved;
  const theme = resultTheme(approved, isMine);

  return (
    <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
      <View style={styles.header}>
        <Ionicons
          name={data.isVehicle ? 'bus-outline' : approved ? 'checkmark-circle' : 'close-circle'}
          size={20}
          color={theme.icon}
        />
        <Text style={[styles.title, { color: theme.title, flex: 1 }]}>{data.title}</Text>
        <View
          style={[
            styles.badge,
            { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder },
          ]}
        >
          <Text style={[styles.badgeText, { color: theme.badgeText }]}>
            {approved ? 'ĐÃ DUYỆT' : 'TỪ CHỐI'}
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.divider }]} />

      {data.detailLine ? (
        <MarkdownInlineText
          text={data.detailLine}
          baseStyle={[styles.body, { color: theme.body }]}
          boldStyle={[styles.bold, { color: theme.bold }]}
        />
      ) : null}

      {data.footerLine ? (
        <View style={[styles.footerRow, { borderTopColor: theme.divider }]}>
          <Ionicons
            name={approved ? 'sync-outline' : 'alert-circle-outline'}
            size={14}
            color={theme.footer}
            style={styles.footerIcon}
          />
          <Text style={[styles.footer, { color: theme.footer }]}>{data.footerLine}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
    width: '100%',
    alignSelf: 'stretch',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 14, fontWeight: '800', lineHeight: 20 },
  badge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  divider: { height: 1, width: '100%' },
  body: { fontSize: 14, lineHeight: 21 },
  bold: { fontWeight: '800' },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingTop: 8,
    marginTop: 2,
    borderTopWidth: 1,
  },
  footerIcon: { marginTop: 2 },
  footer: { flex: 1, fontSize: 12, lineHeight: 18 },
});
