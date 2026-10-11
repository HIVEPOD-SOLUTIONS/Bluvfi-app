import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button } from '@/components/ui/Button';
import { Check } from '@/components/ui/Check';
import { useToast } from '@/components/ui/Toast';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import { PROVIDER_TERMS, PROVIDER_TERMS_URL } from '@/constants/provider-terms';
import { useBecomeCreator, useCreator, useUpdateCreator } from '@/hooks/use-shar';
import { EMPTY_CREATOR, contactProblem, creatorChanges, creatorPayload, creatorProblem, emailProblem, websiteProblem, type CreatorFields } from '@/lib/provider-publisher';

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M12 4l-6 6 6 6" stroke={Colors.tx0} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * Becoming a provider creator: an OPT-IN sign-up (free, a minute). Not every account lists providers; people who want to say who is
 * behind their providers, how the team can reach them, and agree to Bluvfi's provider terms. The same page is the creator's profile
 * afterwards (change who they are or the contact email, any time, without sending a provider back for review) and where they agree
 * again when the provider terms change. Coming from "Add a provider" (`?next=provider`) it carries on to the form once signed up.
 */
export default function CreatorScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { next, remix } = useLocalSearchParams<{ next?: string; remix?: string }>();
  const query = useCreator();
  const become = useBecomeCreator();
  const update = useUpdateCreator();

  const creator = query.data?.creator ?? null;
  const termsCurrent = query.data?.termsCurrent ?? false;
  const notReady = query.data?.ready === false;
  const [f, setF] = useState<CreatorFields>(EMPTY_CREATOR);
  const [termsOpen, setTermsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);

  // Fill the form once from the saved profile (after a fresh fetch, so it never shows stale values), or leave it blank for a new sign-up.
  useEffect(() => {
    if (initialised || query.isLoading || query.isFetching) return;
    if (creator) {
      setF({
        operator: creator.operatorType === 'company' ? 'company' : 'individual',
        companyName: creator.companyName ?? '',
        companyWebsite: creator.companyWebsite ?? '',
        email: creator.contactEmail,
        termsAccepted: false,
      });
    }
    setInitialised(true);
  }, [initialised, query.isLoading, query.isFetching, creator]);

  const setField = <K extends keyof CreatorFields>(k: K, v: CreatorFields[K]) => setF((p) => ({ ...p, [k]: v }));
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/network' as never));
  const finish = () => (next === 'provider' ? router.replace((remix ? { pathname: '/provider/new', params: { remix: Array.isArray(remix) ? remix[0] : remix } } : '/provider/new') as never) : goBack());

  // Three states: signing up, agreeing again after the terms changed, or just editing the profile.
  const mode: 'signup' | 'agree' | 'edit' = !creator ? 'signup' : !termsCurrent ? 'agree' : 'edit';
  const changes = creator ? creatorChanges(f, creator) : {};
  const changed = Object.keys(changes).length > 0;
  const problem = mode === 'edit' ? contactProblem(f) ?? (changed ? null : 'Change something to save.') : creatorProblem(f);
  const busy = become.isPending || update.isPending;

  const send = async () => {
    setError(null);
    try {
      if (mode === 'edit') {
        await update.mutateAsync(changes);
        toast({ variant: 'success', title: 'Saved', subtitle: 'Your providers are not sent back for review.' });
        goBack();
        return;
      }
      await become.mutateAsync(creatorPayload(f));
      toast({ variant: 'success', title: mode === 'agree' ? 'Thanks, you’re all set' : 'You’re a creator', subtitle: next === 'provider' ? 'Now add your provider.' : undefined });
      finish();
    } catch (e) {
      setError((e as Error)?.message ?? 'Couldn’t save that. Try again.');
    }
  };

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + Spacing.md, paddingBottom: Spacing.xxl, paddingHorizontal: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.iconButton}>
              <BackIcon />
            </Pressable>
            <Text style={styles.title}>{mode === 'signup' ? 'Become a creator' : 'Creator profile'}</Text>
            <View style={{ width: 36 }} />
          </View>

          {query.isLoading || !initialised ? (
            <ActivityIndicator color={Colors.tx1} style={{ marginVertical: Spacing.xxl }} />
          ) : notReady ? (
            <Card title="Coming soon">
              <Text style={styles.hint}>Provider sign-up is being set up. Try again a little later.</Text>
            </Card>
          ) : (
            <>
              {mode === 'signup' ? (
                <Card title="List your own providers">
                  <Text style={styles.intro}>
                    It’s optional. You can use every provider on the network without this. Sign up if you offer a service, tool or protocol people (or their AI agents) should be able to call:
                  </Text>
                  <Text style={styles.bullet}>• You keep 80% of what people pay per call, withdrawn as SKR once you have $5.</Text>
                  <Text style={styles.bullet}>• You earn Shar every time someone uses your provider.</Text>
                  <Text style={styles.bullet}>• The Bluvfi team checks each provider before it goes live.</Text>
                  <Text style={styles.bullet}>• If you’re a Seeker creator, an approved provider can be promoted into Bluvfi’s official Bills, Invest or Banking provider list for its use case.</Text>
                  <Text style={styles.hint}>It’s free and takes a minute. You tell us who’s behind it, how to reach you and which use case it belongs to, then agree to the provider terms once.</Text>
                </Card>
              ) : null}
              {mode === 'agree' ? <Notice tone="amber">The provider terms have changed. Read them and agree again to add another provider. Your current providers keep working.</Notice> : null}

              <Card title="About you" step="1">
                <Label first>Who’s behind your providers?</Label>
                <View style={styles.chips}>
                  {([
                    ['individual', 'Just me'],
                    ['company', 'A company or team'],
                  ] as const).map(([key, label]) => (
                    <Chip key={key} on={f.operator === key} onPress={() => setField('operator', key)}>
                      {label}
                    </Chip>
                  ))}
                </View>
                {f.operator === 'company' ? (
                  <>
                    <Label>Company or team name</Label>
                    <Input value={f.companyName} onChangeText={(t) => setField('companyName', t)} maxLength={80} placeholder="e.g. Acme Labs" />
                    <Label>Company website (optional)</Label>
                    <Input mono value={f.companyWebsite} onChangeText={(t) => setField('companyWebsite', t)} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://" />
                    {websiteProblem(f.companyWebsite) ? <Text style={styles.error}>{websiteProblem(f.companyWebsite)}</Text> : null}
                  </>
                ) : null}
                <Label>Contact email</Label>
                <Input value={f.email} onChangeText={(t) => setField('email', t)} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" maxLength={120} placeholder="you@example.com" />
                {f.email.trim() && emailProblem(f.email) ? (
                  <Text style={styles.error}>{emailProblem(f.email)}</Text>
                ) : (
                  <Text style={styles.hint}>Only the Bluvfi team sees this. We’ll use it if we need to ask about a provider or a payout.</Text>
                )}
              </Card>

              {mode !== 'edit' ? (
                <Card title="Provider terms" step="2">
                  <Pressable onPress={() => setTermsOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: termsOpen }} style={styles.termsHead}>
                    <Text style={styles.termsTitle}>How the network works for creators</Text>
                    <Text style={styles.termsToggle}>{termsOpen ? 'Hide' : 'Read'}</Text>
                  </Pressable>
                  {termsOpen ? (
                    <View style={styles.termsCard}>
                      {PROVIDER_TERMS.map((t) => (
                        <View key={t.title} style={{ gap: 2 }}>
                          <Text style={styles.termItemTitle}>{t.title}</Text>
                          <Text style={styles.termItemBody}>{t.body}</Text>
                        </View>
                      ))}
                      <Text style={styles.hint}>A plain-language summary of how the network works. It doesn’t replace Bluvfi’s Terms of Service, which apply in full.</Text>
                      <Text style={styles.link} onPress={() => Linking.openURL(PROVIDER_TERMS_URL).catch(() => {})}>
                        Read Bluvfi’s Terms of Service
                      </Text>
                    </View>
                  ) : null}
                  <Check checked={f.termsAccepted} onToggle={() => setField('termsAccepted', !f.termsAccepted)} label="I agree to the provider terms." />
                </Card>
              ) : (
                <Text style={styles.hint}>
                  You agreed to the provider terms (version {creator?.termsVersion}
                  {creator?.termsAcceptedAt ? ` on ${new Date(creator.termsAcceptedAt).toLocaleDateString()}` : ''}). Changing these details doesn’t send any of your providers back for review.
                </Text>
              )}
            </>
          )}
        </ScrollView>

        {!query.isLoading && initialised && !notReady ? (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
            {error ? <Text style={styles.error}>{error}</Text> : problem ? <Text style={styles.footerHint}>{mode === 'edit' ? problem : `To continue: ${problem}`}</Text> : null}
            <Button fullWidth disabled={!!problem} loading={busy} onPress={send}>
              {mode === 'signup' ? 'Become a creator' : mode === 'agree' ? 'Agree and continue' : 'Save changes'}
            </Button>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

function Card({ title, step, children }: { title: string; step?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        {step ? (
          <View style={styles.step}>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ) : null}
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Notice({ children, tone }: { children: ReactNode; tone?: 'amber' }) {
  return (
    <View style={[styles.notice, tone === 'amber' && styles.noticeAmber]}>
      <Text style={[styles.noticeText, tone === 'amber' && { color: Colors.amber }]}>{children}</Text>
    </View>
  );
}

function Label({ children, first }: { children: ReactNode; first?: boolean }) {
  return <Text style={[styles.label, first && { marginTop: 0 }]}>{children}</Text>;
}

function Input({ mono, style, ...props }: React.ComponentProps<typeof TextInput> & { mono?: boolean }) {
  return <TextInput {...props} placeholderTextColor={Colors.tx2} style={[styles.input, mono && styles.mono, style]} />;
}

function Chip({ on, onPress, children }: { on: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && { color: Colors.tx0 }]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...Type.h1, color: Colors.tx0 },
  iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: Colors.bg1, borderRadius: Radii.xxl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl, gap: Spacing.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardTitle: { ...Type.h2, color: Colors.tx0, flexShrink: 1 },
  step: { width: 24, height: 24, borderRadius: 12, backgroundColor: SharColors.tint, borderWidth: 1, borderColor: SharColors.tintBorder, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: Fonts.monoBold, fontSize: 12, color: SharColors.glow },
  intro: { ...Type.small, color: Colors.tx1, marginBottom: Spacing.xs },
  bullet: { ...Type.small, color: Colors.tx1 },
  label: { ...Type.label, color: Colors.tx2, marginTop: Spacing.md },
  hint: { ...Type.small, color: Colors.tx2 },
  error: { ...Type.small, color: Colors.redAlert },
  link: { ...Type.small, color: Colors.sage, textDecorationLine: 'underline' },
  input: { backgroundColor: Colors.bg2, borderRadius: Radii.md, paddingVertical: 12, paddingHorizontal: Spacing.lg, color: Colors.tx0, fontFamily: Type.body.fontFamily, fontSize: 15 },
  mono: { fontFamily: Fonts.mono, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: Colors.bg2, borderWidth: 1, borderColor: Colors.border },
  chipOn: { backgroundColor: SharColors.tint, borderColor: SharColors.tintBorder },
  chipText: { ...Type.small, fontFamily: Fonts.sansMedium, color: Colors.tx1 },
  notice: { backgroundColor: SharColors.tint, borderRadius: Radii.lg, borderWidth: 1, borderColor: SharColors.tintBorder, padding: Spacing.md },
  noticeAmber: { backgroundColor: 'rgba(232,168,56,0.10)', borderColor: 'rgba(232,168,56,0.30)' },
  noticeText: { ...Type.small, color: Colors.tx1 },
  termsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm },
  termsTitle: { ...Type.h3, color: Colors.tx0, flexShrink: 1 },
  termsToggle: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: SharColors.glow },
  termsCard: { backgroundColor: Colors.bg2, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md },
  termItemTitle: { ...Type.body, fontFamily: Fonts.sansSemiBold, color: Colors.tx0 },
  termItemBody: { ...Type.small, color: Colors.tx1 },
  footer: { backgroundColor: Colors.bg1, borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.sm },
  footerHint: { ...Type.small, color: Colors.tx2 },
});
