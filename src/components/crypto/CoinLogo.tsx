import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Fonts } from '@/constants/theme';

/** CoinMarketCap's public logo CDN, keyed by CMC id (no API key needed). */
export const coinLogoUrl = (id: number | string) => `https://s2.coinmarketcap.com/static/img/coins/64x64/${id}.png`;

/** A coin's logo, falling back to its ticker in a circle when there's no id or the image doesn't load. */
export function CoinLogo({ id, symbol, size = 40 }: { id?: number | string; symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 2 };

  if (id == null || failed) {
    return (
      <View style={[styles.fallback, box]}>
        <Text style={[styles.fallbackText, { fontSize: Math.max(8, size * 0.28) }]} numberOfLines={1}>
          {symbol.slice(0, 4)}
        </Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: coinLogoUrl(id) }}
      style={[styles.image, box]}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={120}
      onError={() => setFailed(true)}
      accessibilityLabel={`${symbol} logo`}
    />
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: Colors.bg2 },
  fallback: { backgroundColor: Colors.bg2, alignItems: 'center', justifyContent: 'center' },
  fallbackText: { fontFamily: Fonts.monoBold, color: Colors.tx0 },
});
