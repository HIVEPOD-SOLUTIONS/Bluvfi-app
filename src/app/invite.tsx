import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { SharOrb } from '@/components/shar/SharOrb';
import { SparkCard } from '@/components/shar/SparkCard';
import { WeeklyBoard } from '@/components/shar/WeeklyBoard';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import { useShar, useUseReferralCode } from '@/hooks/use-shar';
import { normalizeReferralCode, referralLink, referralMessage } from '@/lib/referral';

const fmt = (n: number) => n.toLocaleString('en-US');

/** Invite friends: for everyone (not just creators). Their code and link to share, how many have joined, and a place to enter a friend's code. */
export default function InviteScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const summary = useShar();
  const useCode = useUseReferralCode();
  const [entering, setEntering] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const data = summary.data;
  const mine = data?.referral.code ?? null;
  const pct = data?.rules.referralBonusPct ?? 10;

  const copy = async (value: string, what: string) => {
    await Clipboard.setStringAsync(value);
    toast({ variant: 'success', title: `${what} copied` });
  };

  const apply = async () => {
    setError(null);
    const code = normalizeReferralCode(text);
    if (!code) {
      setError('That doesn’t look like a referral code. It has 8 letters and numbers.');
      return;
    }
    try {
      await useCode.mutateAsync(code);
      toast({ variant: 'success', title: 'Code applied', subtitle: 'Your companion earns a boost from your spending.' });
      setEntering(false);
      setText('');
    } catch (e) {
      setError((e as Error)?.message ?? 'That code didn’t work.');
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xxxl * 2, paddingHorizontal: Spacing.xl, gap: Spacing.lg }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.iconButton}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M15 5l-7 7 7 7" stroke={Colors.tx0} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
          <Text style={styles.title}>Invite friends</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.intro}>
          <SharOrb size={72} />
          <Text style={styles.introText}>
            Invite a friend with your code. You earn {pct}% of the Shar they earn from spending, on top of your own.
          </Text>
        </View>

        {summary.isLoading ? (
          <ActivityIndicator color={Colors.tx1} style={{ marginVertical: Spacing.xxl }} />
        ) : !mine ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your code isn’t ready yet</Text>
            <Text style={styles.muted}>{summary.isError ? 'Couldn’t load it. Check your connection and try again.' : 'Try again in a moment.'}</Text>
            <Button variant="outline" onPress={() => summary.refetch()}>
              Try again
            </Button>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>YOUR CODE</Text>
            <Text style={styles.code} selectable>
              {mine}
            </Text>
            <Text style={styles.muted}>
              {data!.referral.referred} {data!.referral.referred === 1 ? 'friend has' : 'friends have'} joined · +{fmt(data!.referral.bonus)} Shar from them
            </Text>
            <Button fullWidth onPress={() => Share.share({ message: referralMessage(mine) }).catch(() => {})}>
              Share my invite
            </Button>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button fullWidth variant="outline" onPress={() => copy(mine, 'Code')}>
                  Copy code
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button fullWidth variant="outline" onPress={() => copy(referralLink(mine), 'Link')}>
                  Copy link
                </Button>
              </View>
            </View>
          </View>
        )}

        <SparkCard />
        <WeeklyBoard limit={5} />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Have a friend’s code?</Text>
          {entering ? (
            <>
              <TextInput
                value={text}
                onChangeText={(t) => {
                  setText(t);
                  setError(null);
                }}
                placeholder="Code or invite link"
                placeholderTextColor={Colors.tx2}
                autoCapitalize="characters"
                autoCorrect={false}
                style={styles.input}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Button fullWidth variant="outline" onPress={() => { setEntering(false); setError(null); }}>
                    Cancel
                  </Button>
                </View>
                <View style={{ flex: 1 }}>
                  <Button fullWidth onPress={apply} loading={useCode.isPending}>
                    Apply
                  </Button>
                </View>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.muted}>Enter it once and they earn a boost from what you spend. You can only have one.</Text>
              <Pressable onPress={() => setEntering(true)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.link}>Enter a code</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  title: { ...Type.h1, color: Colors.tx0 },
  intro: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  introText: { ...Type.body, color: Colors.tx1, flex: 1 },
  card: { backgroundColor: Colors.bg1, borderRadius: Radii.xxl, borderWidth: 1, borderColor: SharColors.tintBorder, padding: Spacing.xl, gap: Spacing.md },
  cardTitle: { ...Type.h2, color: Colors.tx0 },
  label: { ...Type.label, color: Colors.tx2 },
  code: { fontFamily: Fonts.monoBold, fontSize: 28, letterSpacing: 3, color: Colors.tx0 },
  muted: { ...Type.body, color: Colors.tx1 },
  row: { flexDirection: 'row', gap: Spacing.sm },
  link: { ...Type.body, fontFamily: Fonts.sansSemiBold, color: SharColors.glow, textDecorationLine: 'underline' },
  input: { backgroundColor: Colors.bg0, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, color: Colors.tx0, paddingHorizontal: Spacing.lg, paddingVertical: 12, fontFamily: Fonts.mono, fontSize: 16 },
  error: { ...Type.small, color: Colors.redAlert },
});
