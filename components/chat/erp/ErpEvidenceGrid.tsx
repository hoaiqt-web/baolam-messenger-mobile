import { useState } from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

import { googleDriveThumbUrl } from '@/features/chat/taskReportParsers';
import type { ErpCardPalette } from '@/features/chat/erpCardTheme';

type Props = {
  links: string[];
  palette: ErpCardPalette;
  columns?: 1 | 2;
  onImagePress?: (attachment: any, url: string) => void;
};

function EvidenceThumb({
  link,
  index,
  palette,
  onImagePress,
}: {
  link: string;
  index: number;
  palette: ErpCardPalette;
  onImagePress?: (attachment: any, url: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  const thumb = googleDriveThumbUrl(link);

  if (failed || !thumb) {
    return (
      <TouchableOpacity
        style={[styles.fallback, { borderColor: palette.tableBorder }]}
        onPress={() => void Linking.openURL(link)}
        activeOpacity={0.85}
      >
        <Text style={{ fontSize: 28 }}>📷</Text>
        <Text style={[styles.fallbackText, { color: palette.textMuted }]}>
          Ảnh chưa tải được.{'\n'}Bấm để mở ảnh gốc ↗
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.cell, { borderColor: palette.tableBorder }]}
      onPress={() => onImagePress?.(null, link)}
      activeOpacity={0.85}
    >
      <Image
        source={{ uri: thumb }}
        style={styles.img}
        contentFit="cover"
        cachePolicy="memory-disk"
        onError={() => setFailed(true)}
      />
    </TouchableOpacity>
  );
}

export function ErpEvidenceGrid({ links, palette, columns = 2, onImagePress }: Props) {
  if (!links.length) return null;
  return (
    <View style={[styles.wrap, { borderTopColor: palette.innerBorder }]}>
      <Text style={[styles.heading, { color: palette.label }]}>MINH CHỨNG ({links.length})</Text>
      <View style={styles.grid}>
        {links.map((link, i) => (
          <EvidenceThumb key={`${i}-${link}`} link={link} index={i} palette={palette} onImagePress={onImagePress} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, flexGrow: 0 },
  heading: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: {
    width: 72,
    height: 72,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: '#0f172a33',
  },
  img: { width: '100%', height: '100%' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000022',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 4,
  },
  overlayText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#0f172acc',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  fallback: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    backgroundColor: '#1e293b88',
  },
  fallbackText: { fontSize: 9, textAlign: 'center', marginTop: 2, lineHeight: 12 },
});
