import { useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { router } from 'expo-router';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import type { SharSummary } from '@/hooks/use-shar';
import { SharOrb } from './SharOrb';

// Constant, so the sheet isn't asked to re-measure on every render of this screen.
const SNAP_POINTS = ['82%'];

/** "How Shar works": the rules as the server states them, so this sheet can't drift from what actually happens. */
export function HowSharWorks({ open, onClose, rules }: { open: boolean; onClose: () => void; rules: SharSummary['rules'] | undefined }) {
  const r = rules;
  // One question open at a time, the first by default; tapping the open one closes it.
  const [openTitle, setOpenTitle] = useState<string | null>('Earn Shar');
  const toggle = (title: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(160, 'easeInEaseOut', 'opacity'));
    setOpenTitle((cur) => (cur === title ? null : title));
  };
  const items: { title: string; body: string }[] = [
    {
      title: 'Earn Shar',
      body: r
        ? `Every purchase of $${r.minPurchaseUsd} or more earns ${r.perUsd} Shar per $1. Shar stays pending until the payment completes.`
        : 'Every qualifying purchase earns Shar. It stays pending until the payment completes.',
    },
    {
      title: 'Companion boost',
      body: r
        ? `Invite a friend with your code. You earn ${r.referralBonusPct}% of the Shar they earn from spending, on top of your own.`
        : 'Invite a friend with your code and earn a share of what they earn.',
    },
    {
      title: 'Light a provider',
      body: r
        ? `Add a provider to the open network. Once the team verifies it, you earn ${r.providerUseShar} Shar each time someone else uses it (with daily limits to keep it fair).`
        : 'Add a provider to the open network and earn when people use it once it is verified.',
    },
    {
      title: 'Weekly trial',
      body: 'The Shar you earn this week sets your place on the board. It resets every Monday at 00:00 UTC.',
    },
    {
      title: 'Claim as SKR',
      body: r
        ? `Claim ${r.minClaimShar.toLocaleString('en-US')} Shar or more and we send SKR to your wallet. 1 Shar = ${r.skrPerShar} SKR, fixed when you claim.`
        : 'Claim your Shar as SKR, sent to your wallet.',
    },
  ];

  return (
    <BottomSheet open={open} onClose={onClose} title="How Shar works" snapPoints={SNAP_POINTS} scrollable>
      <View style={styles.intro}>
        <SharOrb size={64} />
        <Text style={styles.introText}>Shar is the light that guided the Seeker across the Boundary. Here it guides you through Bluvfi, and pays you back for it.</Text>
      </View>
      <View style={styles.card}>
        {items.map((it, i) => {
          const open = openTitle === it.title;
          return (
            <View key={it.title} style={[styles.item, i > 0 && styles.itemDivider]}>
              <Pressable onPress={() => toggle(it.title)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.itemHead}>
                <Text style={styles.itemTitle}>{it.title}</Text>
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} stroke={Colors.tx1} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </Pressable>
              {open ? <Text style={styles.itemBody}>{it.body}</Text> : null}
            </View>
          );
        })}
      </View>
      <View style={styles.note}>
        <Text style={styles.noteText}>Rules can change over time to keep Shar fair. What you have already earned stays yours.</Text>
      </View>
      <Pressable
        onPress={() => {
          onClose();
          router.push({ pathname: '/faq', params: { section: 'shar' } } as never);
        }}
        accessibilityRole="link"
        style={styles.more}
      >
        <Text style={styles.moreText}>More questions? Read the FAQ</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.lg },
  introText: { ...Type.body, color: Colors.tx1, flex: 1 },
  card: { backgroundColor: Colors.bg2, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  item: { paddingHorizontal: Spacing.lg },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.lg, paddingVertical: Spacing.lg },
  itemDivider: { borderTopWidth: 1, borderTopColor: Colors.border },
  itemTitle: { ...Type.h3, color: Colors.tx0, flex: 1 },
  itemBody: { ...Type.body, color: Colors.tx1, paddingBottom: Spacing.lg },
  note: { marginTop: Spacing.lg, backgroundColor: SharColors.tint, borderRadius: Radii.lg, borderWidth: 1, borderColor: SharColors.tintBorder, padding: Spacing.md },
  more: { alignSelf: 'center', marginTop: Spacing.lg, paddingVertical: Spacing.xs },
  moreText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: SharColors.glow, textDecorationLine: 'underline' },
  noteText: { ...Type.small, color: Colors.tx1 },
});
