import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button } from '@/components/ui/Button';
import { Check } from '@/components/ui/Check';
import { useToast } from '@/components/ui/Toast';
import { AddCreditsSheet } from '@/components/shar/AddCreditsSheet';
import { exampleProblem } from '@/lib/provider-example';
import { bodyToJson, callBody, callProblem, callValuesFrom, type CallValues } from '@/lib/provider-config';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import { ApiError } from '@/lib/api';
import {
  microToUsd,
  priceUsd,
  useAcceptTerms,
  useAdminMe,
  useCredits,
  useMyProviders,
  useProvider,
  useReviewListing,
  useTryProvider,
  type MyProvider,
} from '@/hooks/use-shar';

const fmt = (n: number) => n.toLocaleString('en-US');
const categoryLabel = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);
const RESULT_MAX = 4000;

const pretty = (text: string | null | undefined) => {
  if (!text) return '{}';
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
};

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M12 4l-6 6 6 6" stroke={Colors.tx0} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** One provider: what it does, an example request you can edit and run, and (for its owner or the team) the controls to manage it. */
export default function ProviderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const detail = useProvider(id);
  const mine = useMyProviders();
  const credits = useCredits();
  const admin = useAdminMe();
  const review = useReviewListing();
  const tryIt = useTryProvider();
  const acceptTerms = useAcceptTerms();
  const p = detail.data?.provider;

  const [body, setBody] = useState('{}');
  // Providers that list their inputs get a form; everyone can still send raw JSON. The steps a person must do first are ticked off
  // here before Try it turns on (the owner testing their own provider doesn't need to).
  const fields = p?.inputFields && p.inputFields.length > 0 ? p.inputFields : null;
  const [values, setValues] = useState<CallValues>({});
  const [rawMode, setRawMode] = useState(false);
  const [ack, setAck] = useState(false);
  useEffect(() => {
    setValues(callValuesFrom(p?.inputFields));
    setRawMode(false);
    setAck(false);
  }, [p?.id, JSON.stringify(p?.inputFields ?? null)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [result, setResult] = useState<{ status: number; text: string; charged: number } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);

  // Start from the provider's own example whenever a different provider (or a changed example) loads.
  useEffect(() => {
    if (p) setBody(pretty(p.exampleRequest));
  }, [p?.id, p?.exampleRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/network' as never));
  const mineRow: MyProvider | null = mine.data?.providers.find((m) => m.id === id) ?? null;
  const isAdmin = admin.data?.admin === true;
  const price = Number(p?.priceUsdc ?? 0);
  const free = !(price > 0);
  const live = p?.status === 'verified';
  const useForm = !!fields && !rawMode;
  const bodyProblem = useForm ? callProblem(fields!, values) : exampleProblem(body);
  const needsAck = !!p?.requirements?.length && !p?.mine && !ack;
  // The owner's own terms: everyone but the owner agrees (recorded on the server, to this exact version) before using the provider.
  const needsTerms = !!p?.terms && !p?.mine && !p?.termsAcceptedAt;

  const run = async () => {
    if (!p) return;
    setRunError(null);
    let parsed: Record<string, unknown> = {};
    if (useForm) {
      parsed = callBody(fields!, values);
    } else if (body.trim()) {
      try {
        const v = JSON.parse(body);
        if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('not an object');
        parsed = v;
      } catch {
        setRunError('The request has to be a JSON object, like {"city": "Lagos"}.');
        return;
      }
    }
    try {
      const res = await tryIt.mutateAsync({ id: p.id, body: parsed });
      const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);
      setResult({ status: res.providerStatus, text: raw.length > RESULT_MAX ? `${raw.slice(0, RESULT_MAX)}\n…` : raw, charged: res.chargedMicro });
      if (res.chargedMicro > 0) toast({ variant: 'success', title: `Charged ${microToUsd(res.chargedMicro)}`, subtitle: res.balanceMicro !== null ? `${microToUsd(res.balanceMicro)} left in credits` : undefined });
    } catch (e) {
      setResult(null);
      // 402 from the gateway means this paid call needs credits: take them straight to adding some.
      if (e instanceof ApiError && e.status === 402) {
        toast({ variant: 'error', title: 'Add credits to use this', subtitle: e.message });
        setCreditsOpen(true);
        return;
      }
      // The terms changed since the page loaded (or were never agreed to): show them again rather than a bare error.
      if (e instanceof ApiError && e.status === 409 && /terms/i.test(e.message)) {
        detail.refetch();
        toast({ variant: 'error', title: 'Agree to the terms first', subtitle: 'Read this provider’s terms below, then agree to them.' });
        return;
      }
      setRunError((e as Error)?.message ?? 'Couldn’t reach it.');
    }
  };

  const runReview = async (action: 'feature' | 'unfeature' | 'pause') => {
    if (!p) return;
    try {
      await review.mutateAsync({ id: p.id, action });
      toast({ variant: 'success', title: action === 'feature' ? 'Featured' : action === 'unfeature' ? 'No longer featured' : 'Paused', subtitle: p.name });
      detail.refetch();
    } catch (e) {
      toast({ variant: 'error', title: 'Couldn’t do that', subtitle: (e as Error)?.message });
    }
  };
  const confirmPause = () =>
    Alert.alert('Pause this provider?', 'It leaves the network until the team verifies it again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Pause', style: 'destructive', onPress: () => runReview('pause') },
    ]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + Spacing.md, paddingBottom: Spacing.xxxl * 2, paddingHorizontal: Spacing.xl, gap: Spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.iconButton}>
            <BackIcon />
          </Pressable>
          <Text style={styles.headerTitle}>Provider</Text>
          <View style={{ width: 36 }} />
        </View>

        {detail.isLoading ? (
          <ActivityIndicator color={Colors.tx1} style={{ marginVertical: Spacing.xxl }} />
        ) : detail.isError || !p ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Provider not found</Text>
            <Text style={styles.muted}>It may have been removed or paused.</Text>
            <View style={{ alignSelf: 'flex-start', marginTop: Spacing.sm }}>
              <Button variant="outline" onPress={goBack}>
                Back to the network
              </Button>
            </View>
          </View>
        ) : (
          <>
            {/* What it is */}
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.title} numberOfLines={2}>
                  {p.name}
                </Text>
                <View style={styles.price}>
                  <Text style={styles.priceText}>{free ? 'Free' : `${priceUsd(p.priceUsdc)} / call`}</Text>
                </View>
              </View>
              <View style={styles.badges}>
                {p.featured ? (
                  <View style={styles.featured}>
                    <Text style={styles.featuredText}>★ Featured</Text>
                  </View>
                ) : null}
                <Text style={styles.mono}>
                  {categoryLabel(p.category)}
                  {p.host ? ` · ${p.host}` : ''}
                </Text>
              </View>
              <Text style={styles.body}>{p.summary}</Text>
              {p.remixOf ? (
                <Pressable onPress={() => router.push({ pathname: '/provider/[id]', params: { id: p.remixOf!.id } } as never)} hitSlop={6}>
                  <Text style={styles.remixTag}>Remix of {p.remixOf.name} ›</Text>
                </Pressable>
              ) : null}
              <Text style={styles.meta}>
                {fmt(p.uses)} {p.uses === 1 ? 'use' : 'uses'} · {fmt(p.remixes)} {p.remixes === 1 ? 'remix' : 'remixes'} · {p.mine ? 'yours' : p.owner}
              </Text>
              {p.docsUrl ? (
                <Pressable onPress={() => Linking.openURL(p.docsUrl!).catch(() => {})} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
                  <Text style={styles.link}>Read the docs</Text>
                </Pressable>
              ) : null}
            </View>

            {/* The owner's view of where it stands */}
            {p.mine && p.status !== 'verified' ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>
                  {p.status === 'submitted'
                    ? 'The team is checking this provider. You’ll see it go live here; only you can see this page until then.'
                    : p.status === 'paused'
                      ? mineRow?.pausedByOwner
                        ? 'You paused this provider. Open Manage to resume it.'
                        : 'The team paused this provider.'
                      : `Not accepted${mineRow?.reviewNote ? `: ${mineRow.reviewNote}` : '.'} Edit it and save to send it again.`}
                </Text>
              </View>
            ) : null}

            {/* The owner's own terms */}
            {p.terms ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{p.mine ? 'Your terms for users' : `Terms from ${p.owner}`}</Text>
                <Text style={styles.muted}>
                  {p.mine
                    ? 'People must agree to these before they can use your provider. Change them from Manage (a live provider goes back for a quick review).'
                    : 'The owner set these terms for people who use this provider. Bluvfi’s Terms of Service apply too, and Bluvfi didn’t write these.'}
                </Text>
                {p.terms.text ? <Text style={styles.termsText}>{p.terms.text}</Text> : null}
                {p.terms.url ? (
                  <Pressable onPress={() => Linking.openURL(p.terms!.url!).catch(() => {})} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
                    <Text style={styles.link}>Read the full terms</Text>
                  </Pressable>
                ) : null}
                {p.mine ? null : p.termsAcceptedAt ? (
                  <Text style={[styles.meta, { color: Colors.sage }]}>You agreed to these terms on {new Date(p.termsAcceptedAt).toLocaleDateString()}.</Text>
                ) : (
                  <>
                    <Check
                      checked={acceptTerms.isPending}
                      disabled={acceptTerms.isPending || !live}
                      onToggle={async () => {
                        try {
                          await acceptTerms.mutateAsync({ id: p.id, hash: p.terms!.hash });
                        } catch (e) {
                          toast({ variant: 'error', title: 'Couldn’t save that', subtitle: (e as Error)?.message });
                          detail.refetch();
                        }
                      }}
                      label={`I agree to ${p.owner}’s terms for this provider.`}
                    />
                    {!live ? <Text style={styles.meta}>You can agree once the team has verified it.</Text> : null}
                  </>
                )}
              </View>
            ) : null}

            {/* What to do first */}
            {p.requirements && p.requirements.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Before you use it</Text>
                <Text style={styles.muted}>This provider needs a little setup from you first.</Text>
                {p.requirements.map((r, i) => (
                  <View key={i} style={styles.stepRow}>
                    <View style={styles.stepDot}>
                      <Text style={styles.stepDotText}>{i + 1}</Text>
                    </View>
                    <Text style={[styles.body, { flex: 1 }]}>{r}</Text>
                  </View>
                ))}
                {p.setupUrl ? (
                  <Pressable onPress={() => Linking.openURL(p.setupUrl!).catch(() => {})} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
                    <Text style={styles.link}>Open the setup page</Text>
                  </Pressable>
                ) : null}
                {p.mine ? <Text style={styles.meta}>You own this provider, so you can try it without ticking this.</Text> : <Check checked={ack} onToggle={() => setAck((a) => !a)} label="I’ve done this." />}
              </View>
            ) : null}

            {/* Try it */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Try it</Text>
              {useForm ? (
                <>
                  <Text style={styles.muted}>Fill in the form. Nothing is sent, or charged, until it looks right.</Text>
                  {fields!.map((f) => (
                    <View key={f.key} style={{ gap: 4 }}>
                      <Text style={styles.label}>
                        {f.label.toUpperCase()}
                        {f.required ? ' *' : ''}
                      </Text>
                      {f.type === 'boolean' ? (
                        <View style={styles.switchRow}>
                          <Text style={[styles.body, { flex: 1 }]}>{values[f.key] === true ? 'Yes' : 'No'}</Text>
                          <Switch
                            value={values[f.key] === true}
                            onValueChange={(v) => {
                              setValues((x) => ({ ...x, [f.key]: v }));
                              setRunError(null);
                            }}
                            disabled={!live}
                            trackColor={{ false: Colors.bg3, true: SharColors.body }}
                            thumbColor="#FFFFFF"
                          />
                        </View>
                      ) : f.type === 'choice' ? (
                        <View style={styles.chips}>
                          {f.choices?.map((c) => (
                            <Pressable
                              key={c}
                              disabled={!live}
                              onPress={() => {
                                setValues((x) => ({ ...x, [f.key]: x[f.key] === c && !f.required ? '' : c }));
                                setRunError(null);
                              }}
                              accessibilityRole="button"
                              accessibilityState={{ selected: values[f.key] === c }}
                              style={[styles.chip, values[f.key] === c && styles.chipOn]}
                            >
                              <Text style={[styles.chipText, values[f.key] === c && { color: Colors.tx0 }]}>{c}</Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : (
                        <TextInput
                          style={styles.field}
                          value={typeof values[f.key] === 'string' ? (values[f.key] as string) : ''}
                          onChangeText={(t) => {
                            setValues((x) => ({ ...x, [f.key]: f.type === 'number' ? t.replace(/[^0-9.\-]/g, '') : t }));
                            setRunError(null);
                          }}
                          keyboardType={f.type === 'number' ? 'decimal-pad' : 'default'}
                          autoCapitalize="none"
                          autoCorrect={false}
                          editable={live}
                          placeholder={f.placeholder ?? ''}
                          placeholderTextColor={Colors.tx2}
                          maxLength={500}
                        />
                      )}
                      {f.help ? <Text style={styles.meta}>{f.help}</Text> : null}
                    </View>
                  ))}
                  <Pressable
                    onPress={() => {
                      setBody(bodyToJson(fields!, values));
                      setRawMode(true);
                      setRunError(null);
                    }}
                    hitSlop={8}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    <Text style={styles.link}>Edit as JSON instead</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.muted}>
                    {rawMode ? 'This is your form as JSON. Change anything you like.' : p.exampleRequest ? 'This is the provider’s example request. Change it to try your own.' : 'This provider didn’t add an example. Send a JSON object the way its docs describe.'}
                  </Text>
                  <Text style={styles.label}>REQUEST (JSON)</Text>
                  <TextInput
                    style={styles.code}
                    value={body}
                    onChangeText={(t) => {
                      setBody(t);
                      setRunError(null);
                    }}
                    multiline
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    editable={live}
                    placeholder="{}"
                    placeholderTextColor={Colors.tx2}
                    textAlignVertical="top"
                  />
                  {rawMode ? (
                    <Pressable onPress={() => setRawMode(false)} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
                      <Text style={styles.link}>Back to the form</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
              {bodyProblem && !useForm ? <Text style={styles.error}>{bodyProblem}</Text> : null}
              {!free ? (
                <Text style={styles.meta}>
                  Charged from your credits{credits.data?.ready ? ` · ${microToUsd(credits.data.balanceMicro)} available` : ''}. A failed call is never charged.
                </Text>
              ) : null}
              <View style={styles.actions}>
                <Button disabled={!live || needsAck || needsTerms || !!bodyProblem} loading={tryIt.isPending} onPress={run}>
                  {free ? 'Run' : `Run · ${priceUsd(p.priceUsdc)}`}
                </Button>
                {!free ? (
                  <Button variant="outline" onPress={() => setCreditsOpen(true)}>
                    Add credits
                  </Button>
                ) : null}
              </View>
              {!live ? <Text style={styles.meta}>It can be run once the team has verified it.</Text> : null}
              {live && needsAck ? <Text style={styles.meta}>Tick “I’ve done this” above once you’ve done the steps.</Text> : null}
              {live && needsTerms ? <Text style={styles.meta}>Agree to the owner’s terms above to use this provider.</Text> : null}
              {useForm && bodyProblem && live && !needsAck ? <Text style={styles.meta}>{bodyProblem}</Text> : null}
              {runError ? <Text style={styles.error}>{runError}</Text> : null}
            </View>

            {result ? (
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Answer</Text>
                  <View style={[styles.price, { backgroundColor: result.status < 300 ? 'rgba(143,176,255,0.14)' : Colors.bg2 }]}>
                    <Text style={styles.priceText}>
                      {result.status}
                      {result.charged > 0 ? ` · ${microToUsd(result.charged)}` : ''}
                    </Text>
                  </View>
                </View>
                <Text style={styles.codeOut} selectable>
                  {result.text}
                </Text>
                <Pressable
                  onPress={async () => {
                    await Clipboard.setStringAsync(result.text);
                    toast({ variant: 'success', title: 'Copied' });
                  }}
                  hitSlop={8}
                  style={{ alignSelf: 'flex-start' }}
                >
                  <Text style={styles.link}>Copy</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Things you can do with it */}
            <View style={styles.actions}>
              {p.mine && mineRow ? (
                <Button variant="outline" onPress={() => router.push({ pathname: '/provider/edit/[id]', params: { id: p.id } } as never)}>
                  Manage
                </Button>
              ) : null}
              {live ? (
                <Button variant="outline" onPress={() => router.push({ pathname: '/provider/new', params: { remix: p.id } } as never)}>
                  Remix
                </Button>
              ) : null}
            </View>

            {isAdmin ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Team controls</Text>
                <Text style={styles.muted}>Only people on the team see this. Every action is logged.</Text>
                <View style={styles.actions}>
                  {live ? (
                    <Button size="sm" variant={p.featured ? 'outline' : 'primary'} loading={review.isPending} onPress={() => runReview(p.featured ? 'unfeature' : 'feature')}>
                      {p.featured ? 'Remove from featured' : 'Feature it'}
                    </Button>
                  ) : null}
                  {live ? (
                    <Button size="sm" variant="destructive" disabled={review.isPending} onPress={confirmPause}>
                      Pause
                    </Button>
                  ) : null}
                </View>
                {!live ? <Text style={styles.meta}>Only a verified provider can be featured. Review it from the Admin screen.</Text> : null}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <AddCreditsSheet open={creditsOpen} onClose={() => setCreditsOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { ...Type.h1, color: Colors.tx0 },
  iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: Colors.bg1, borderRadius: Radii.xxl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl, gap: Spacing.sm },
  cardTitle: { ...Type.h2, color: Colors.tx0, flexShrink: 1 },
  title: { ...Type.h1, color: Colors.tx0, flex: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  badges: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  featured: { backgroundColor: SharColors.tint, borderWidth: 1, borderColor: SharColors.tintBorder, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 10 },
  featuredText: { fontFamily: Fonts.monoBold, fontSize: 11, color: SharColors.glow },
  body: { ...Type.body, color: Colors.tx1 },
  muted: { ...Type.small, color: Colors.tx2 },
  mono: { ...Type.label, color: Colors.tx2 },
  meta: { ...Type.small, color: Colors.tx2 },
  label: { ...Type.label, color: Colors.tx2, marginTop: Spacing.sm },
  price: { backgroundColor: Colors.bg2, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  priceText: { fontFamily: Fonts.monoBold, fontSize: 11, color: Colors.tx1 },
  remixTag: { ...Type.small, color: SharColors.glow },
  link: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.sage, textDecorationLine: 'underline' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap', marginTop: Spacing.xs },
  notice: { backgroundColor: SharColors.tint, borderRadius: Radii.lg, borderWidth: 1, borderColor: SharColors.tintBorder, padding: Spacing.md },
  noticeText: { ...Type.small, color: Colors.tx1 },
  code: {
    backgroundColor: Colors.bg0,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    minHeight: 110,
    color: Colors.tx0,
    fontFamily: Fonts.mono,
    fontSize: 12,
  },
  codeOut: { backgroundColor: Colors.bg0, borderRadius: Radii.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, color: Colors.tx0, fontFamily: Fonts.mono, fontSize: 12 },
  error: { ...Type.small, color: Colors.redAlert },
  termsText: { ...Type.body, color: Colors.tx1, backgroundColor: Colors.bg2, borderRadius: Radii.md, padding: Spacing.md },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginTop: Spacing.xs },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: SharColors.tint, borderWidth: 1, borderColor: SharColors.tintBorder, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepDotText: { fontFamily: Fonts.monoBold, fontSize: 12, color: SharColors.glow },
  field: { backgroundColor: Colors.bg2, borderRadius: Radii.md, paddingVertical: 12, paddingHorizontal: Spacing.lg, color: Colors.tx0, fontFamily: Type.body.fontFamily, fontSize: 15 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bg2, borderRadius: Radii.md, paddingVertical: 6, paddingHorizontal: Spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: Colors.bg2, borderWidth: 1, borderColor: Colors.border },
  chipOn: { backgroundColor: SharColors.tint, borderColor: SharColors.tintBorder },
  chipText: { ...Type.small, fontFamily: Fonts.sansMedium, color: Colors.tx1 },
});
