import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { chainLogo, chainLogoByName, methodLogos, methodNetworkName, type LogoSpec } from '@/lib/payment-logos';
import type { MethodGroup, PaymentMethod } from '@/lib/payment-methods';

/** One round logo: the first address that loads, else the symbol on the coin's colour. */
export function RoundLogo({ spec, size }: { spec: LogoSpec; size: number }) {
  const [tried, setTried] = useState(0);
  const uri = spec.uris[tried];
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (!uri) {
    return (
      <View style={[styles.fallback, box, { backgroundColor: spec.color }]}>
        <Text style={[styles.glyph, { fontSize: Math.max(7, size * 0.42) }]}>{spec.glyph}</Text>
      </View>
    );
  }
  return <Image key={uri} source={{ uri }} style={[box, { backgroundColor: Colors.bg2 }]} contentFit="cover" cachePolicy="memory-disk" transition={100} onError={() => setTried((n) => n + 1)} />;
}

const MORE_CHAINS = ['arc', 'tempo', 'robinhood', 'zcash', 'hyperliquid'] as const;

/** The chains a payment can come from besides Base and Solana (Arc, Tempo, Robinhood Chain, Zcash, Hyperliquid), as overlapping logos. */
export function ChainLogoStack({ count = 5, size = 18 }: { count?: number; size?: number }) {
  const ring = size + 3;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {MORE_CHAINS.slice(0, count).map((c, i) => (
        <View key={c} style={[styles.stackItem, { width: ring, height: ring, borderRadius: ring / 2, marginLeft: i === 0 ? 0 : -Math.round(size * 0.35) }]}>
          <RoundLogo spec={chainLogo(c)} size={size} />
        </View>
      ))}
    </View>
  );
}

/** A tappable "Pay from another chain" line: the five chains' logos and the words. */
export function MoreChainsLink({ onPress, textStyle }: { onPress: () => void; textStyle?: StyleProp<TextStyle> }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={styles.moreChains}>
      <ChainLogoStack size={16} />
      <Text style={[textStyle, { flexShrink: 1 }]}>Pay from Arc, Tempo, Robinhood Chain, Zcash or Hyperliquid instead</Text>
    </Pressable>
  );
}

/** A network's name with its real logo beside it (the wallet sheet's chips). A network with no logo of its own keeps its emoji. */
export function ChainLabel({ name, icon, textStyle, size = 18 }: { name: string; icon?: string; textStyle?: StyleProp<TextStyle>; size?: number }) {
  const spec = chainLogoByName(name);
  return (
    <View style={styles.chainLabel}>
      {spec ? <RoundLogo spec={spec} size={size} /> : icon ? <Text style={textStyle}>{icon}</Text> : null}
      <Text style={textStyle}>{name}</Text>
    </View>
  );
}

/** A payment method's logo: its token, with its chain in the corner (USDC on Base) and a bolt for Lightning. */
export function MethodLogo({ method, size = 26 }: { method: PaymentMethod; size?: number }) {
  const { main, badge, bolt } = methodLogos(method);
  const small = Math.round(size * 0.52);
  return (
    <View style={{ width: size, height: size }}>
      <RoundLogo spec={main} size={size} />
      {badge ? (
        <View style={[styles.badge, { width: small + 3, height: small + 3, borderRadius: (small + 3) / 2 }]}>
          <RoundLogo spec={badge} size={small} />
        </View>
      ) : null}
      {bolt ? (
        <View style={[styles.bolt, { width: small + 2, height: small + 2, borderRadius: (small + 2) / 2 }]}>
          <Text style={{ fontSize: small * 0.8 }}>⚡</Text>
        </View>
      ) : null}
    </View>
  );
}

/** A coin's logo with its network's logo in the corner (USDC on Base). With no network, just the coin. */
export function TokenChainLogo({ token, chain, size = 26 }: { token: LogoSpec; chain?: LogoSpec | null; size?: number }) {
  const small = Math.round(size * 0.52);
  return (
    <View style={{ width: size, height: size }}>
      <RoundLogo spec={token} size={size} />
      {chain ? (
        <View style={[styles.badge, { width: small + 3, height: small + 3, borderRadius: (small + 3) / 2 }]}>
          <RoundLogo spec={chain} size={small} />
        </View>
      ) : null}
    </View>
  );
}

/** A choice chip with a logo: a coin, a network, a way to pay. */
export function LogoChip({ logo, label, sub, selected, onPress }: { logo: ReactNode; label: string; sub?: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }} accessibilityLabel={sub ? `${label}, ${sub}` : label} style={[styles.chip, selected && styles.chipActive]}>
      {logo}
      <View>
        <Text style={[styles.label, selected && { color: Colors.sage }]}>{label}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

/** A chip's second line: the coin, and the network when the label doesn't name it (ETH · Base, USDC · Arc); wallet and link methods keep theirs. */
function methodSub(x: PaymentMethod): string {
  if (x.rail === 'wallet') return x.token;
  if (x.rail === 'link') return `${x.token} ↗`;
  const net = methodNetworkName(x);
  return net ? `${x.token} · ${net}` : `${x.token} · deposit`;
}

interface Props {
  groups: readonly { group: MethodGroup; methods: readonly PaymentMethod[] }[];
  selected: string;
  onSelect: (id: string) => void;
}

/** "Pay with": every accepted token and chain, grouped as on the website, each with its logo. */
export function PaymentMethodPicker({ groups, selected, onSelect }: Props) {
  return (
    <View style={{ gap: Spacing.md }}>
      {groups.map(({ group, methods }) => (
        <View key={group} style={{ gap: 8 }}>
          <Text style={styles.group}>{group}</Text>
          <View style={styles.wrap}>
            {methods.map((x) => {
              const active = x.id === selected;
              return (
                <Pressable
                  key={x.id}
                  onPress={() => onSelect(x.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${x.token} on ${x.label}`}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <MethodLogo method={x} />
                  <View>
                    <Text style={[styles.label, active && { color: Colors.sage }]}>{x.label}</Text>
                    <Text style={styles.sub}>{methodSub(x)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chainLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  stackItem: { backgroundColor: Colors.bg0, alignItems: 'center', justifyContent: 'center' },
  moreChains: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'center', paddingHorizontal: Spacing.md },
  group: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.tx2, textTransform: 'uppercase', letterSpacing: 0.6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bg0, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, paddingVertical: 8, paddingLeft: 8, paddingRight: 12 },
  chipActive: { borderColor: Colors.sage, backgroundColor: 'rgba(143,174,130,0.10)' },
  label: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.tx0 },
  sub: { ...Type.small, fontSize: 10, color: Colors.tx2 },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  glyph: { fontFamily: Fonts.sansBold, color: '#FFFFFF' },
  badge: { position: 'absolute', right: -4, bottom: -4, backgroundColor: Colors.bg0, alignItems: 'center', justifyContent: 'center' },
  bolt: { position: 'absolute', right: -4, bottom: -4, backgroundColor: Colors.bg0, alignItems: 'center', justifyContent: 'center' },
});
