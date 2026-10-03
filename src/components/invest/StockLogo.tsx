import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Colors, Fonts, Radii } from '@/constants/theme';
import { API_BASE_URL } from '@/lib/api';

/**
 * Company or fund logo. Backpack's API has no logos, so try two public logo CDNs (both keyless; each 404s
 * for tickers it doesn't know), then bluvfi's CoinMarketCap lookup, and fall back to the ticker text. Class-share tickers use a dash on the CDNs
 * (BRK.B → BRK-B).
 */
export function StockLogo({ ticker, size = 44 }: { ticker: string; size?: number }) {
  const sym = ticker.replace(/\./g, '-');
  const sources = [
    `https://financialmodelingprep.com/image-stock/${encodeURIComponent(sym)}.png`,
    `https://assets.parqet.com/logos/symbol/${encodeURIComponent(sym)}?format=png`,
    // Last resort: bluvfi looks the logo up on CoinMarketCap for the few tickers the CDNs miss (niche ETFs).
    `${API_BASE_URL}/api/stocks/logo?ticker=${encodeURIComponent(ticker.toUpperCase())}`,
  ];
  const [i, setI] = useState(0);

  if (i >= sources.length) {
    return (
      <View style={[styles.fallback, { width: size, height: size }]}>
        <Text style={[styles.fallbackText, { fontSize: size * 0.25 }]}>{ticker.slice(0, 4)}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.logoBox, { width: size, height: size }]}>
      <Image source={{ uri: sources[i] }} style={styles.logo} resizeMode="contain" onError={() => setI((n) => n + 1)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    borderRadius: Radii.lg,
    backgroundColor: 'rgba(143,174,130,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: { fontFamily: Fonts.sansBold, color: Colors.sage },
  logoBox: { borderRadius: Radii.lg, backgroundColor: '#FFFFFF', padding: 6, overflow: 'hidden' },
  logo: { width: '100%', height: '100%' },
});
