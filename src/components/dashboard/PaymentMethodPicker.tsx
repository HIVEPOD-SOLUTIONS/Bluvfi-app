import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { methodLogos, type LogoSpec } from '@/lib/payment-logos';
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
                    <Text style={styles.sub}>{x.rail === 'wallet' ? x.token : x.rail === 'link' ? `${x.token} ↗` : `${x.token} · deposit`}</Text>
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
