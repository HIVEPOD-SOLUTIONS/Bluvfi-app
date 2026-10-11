import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button } from '@/components/ui/Button';
import { Check } from '@/components/ui/Check';
import { useToast } from '@/components/ui/Toast';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import {
  PROVIDER_CATEGORIES,
  useCreator,
  useDeleteProvider,
  useMyProviders,
  useProvider,
  useProviderAction,
  useSubmitProvider,
  useUpdateProvider,
  type MyProvider,
  type NewProviderInput,
  type ProviderCategory,
  type ProviderEdit,
} from '@/hooks/use-shar';
import {
  AUTH_TYPES,
  EMPTY_AUTH,
  FIELD_TYPES,
  LIMITS,
  authPayload,
  authProblem,
  cleanRequirements,
  copySetupFrom,
  EMPTY_TERMS,
  emptyField,
  fieldDraftsFrom,
  fieldsPayload,
  fieldsProblem,
  hasSetup,
  publicUrlProblem,
  requirementsProblem,
  setupSummary,
  suggestKey,
  teamNotesProblem,
  termsChanged,
  termsPayload,
  termsProblem,
  type AuthDraft,
  type FieldDraft,
  type TermsDraft,
} from '@/lib/provider-config';
import { exampleProblem, prettyExample } from '@/lib/provider-example';
import { rightsProblem } from '@/lib/provider-publisher';
import { useConnectedWallet } from '@/lib/wallet-connection';

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const tidy = (v: string) => v.trim().replace(/\s+/g, ' ');

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M12 4l-6 6 6 6" stroke={Colors.tx0} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * Add a provider to the open network, remix one that is already verified, or edit one of your own. A full page (not a sheet) because
 * it is long: Basics, the inputs callers fill in, what a person must do before using it, how Bluvfi connects to your API, private notes
 * for the team, and a tick that you own the service. Only creators (an opt-in sign-up, see /creator) can add one; who you are and your contact email live on the creator profile. New and remixed providers stay "submitted" until the team verifies them. Editing what people see or
 * what gets called (name, description, category, endpoint, docs link, price, inputs, requirements, setup link) sends a live provider
 * back for a quick check; the example request, payout wallet, key and notes for the team change freely.
 */
export function ProviderFormScreen({ remixId, editId }: { remixId?: string; editId?: string }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { wallet } = useConnectedWallet();
  const mine = useMyProviders();
  const creatorState = useCreator();
  const remixQuery = useProvider(remixId);
  const submit = useSubmitProvider();
  const update = useUpdateProvider();
  const action = useProviderAction();
  const remove = useDeleteProvider();

  const editing: MyProvider | null = editId ? (mine.data?.providers.find((p) => p.id === editId) ?? null) : null;
  const remixOf = remixId ? (remixQuery.data?.provider ?? null) : null;
  const waiting = (editId && mine.isLoading) || (remixId && remixQuery.isLoading);

  // Basics
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState<ProviderCategory>('data');
  const [endpoint, setEndpoint] = useState('');
  const [docs, setDocs] = useState('');
  const [price, setPrice] = useState('');
  const [payout, setPayout] = useState('');
  const [example, setExample] = useState('');
  // Setup
  const [fields, setFields] = useState<FieldDraft[]>([]);
  const [requirements, setRequirements] = useState<string[]>([]);
  const [setupUrl, setSetupUrl] = useState('');
  const [auth, setAuth] = useState<AuthDraft>(EMPTY_AUTH);
  const [teamNotes, setTeamNotes] = useState('');
  const [terms, setTerms] = useState<TermsDraft>(EMPTY_TERMS);
  // Ownership: ticked for each new provider (who the creator is lives on their profile)
  const [rights, setRights] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);

  // Fill the form once, from the provider being edited or remixed (or blank for a new one).
  useEffect(() => {
    if (initialised || waiting) return;
    if (editId) {
      // The list of my providers may be a minute old: wait for the fresh copy so the form never shows (or edits) stale values.
      if (!editing || mine.isFetching) return;
      setName(editing.name);
      setSummary(editing.summary);
      setCategory(editing.category);
      setEndpoint(editing.endpointUrl);
      setDocs(editing.docsUrl ?? '');
      setPrice(Number(editing.priceUsdc) > 0 ? editing.priceUsdc : '');
      setPayout(editing.payoutWallet);
      setExample(prettyExample(editing.exampleRequest));
      setFields(fieldDraftsFrom(editing.inputFields));
      setRequirements(editing.requirements ?? []);
      setSetupUrl(editing.setupUrl ?? '');
      setTerms({ text: editing.terms?.text ?? '', url: editing.terms?.url ?? '' });
      setAuth({ type: editing.auth.type, header: editing.auth.header && editing.auth.type === 'header' ? editing.auth.header : '', secret: '', hasSecret: editing.auth.hasSecret, copyFrom: null });
      setTeamNotes(editing.teamNotes ?? '');
    } else if (remixOf) {
      setName(`${remixOf.name} remix`.slice(0, 40));
      setSummary(remixOf.summary);
      setCategory(remixOf.category);
      setExample(prettyExample(remixOf.exampleRequest));
      setFields(fieldDraftsFrom(remixOf.inputFields));
    } else if (remixId) {
      return; // the original is still loading, or couldn't be found
    }
    setInitialised(true);
  }, [initialised, waiting, editId, editing, remixId, remixOf, mine.isFetching]);

  // A new provider starts with the connected wallet as the place to be paid.
  useEffect(() => {
    if (!editId && wallet?.address) setPayout((p) => p || wallet.address);
  }, [editId, wallet?.address]);

  // Adding a provider is for creators: someone who hasn't signed up (or must agree to new provider terms) is sent to the sign-up, which
  // brings them back here. Editing a provider they already have isn't gated.
  const creator = creatorState.data?.creator ?? null;
  const needsSignup = !editId && !!creatorState.data && (creator === null || !creatorState.data.termsCurrent);
  const { remix: remixParam } = useLocalSearchParams<{ remix?: string }>();
  useEffect(() => {
    if (needsSignup) router.replace({ pathname: '/creator', params: { next: 'provider', ...(remixParam ? { remix: Array.isArray(remixParam) ? remixParam[0] : remixParam } : {}) } } as never);
  }, [needsSignup, remixParam]);
  const isLive = editing?.status === 'verified';
  const teamPaused = editing?.status === 'paused' && !editing.pausedByOwner;
  const canPause = !!editing && (editing.status === 'verified' || (editing.status === 'paused' && editing.pausedByOwner));

  // The first thing wrong, in the order the page asks. The button stays off until this is null.
  const problem = useMemo(() => {
    if (name.trim().length < 3) return 'Give it a name (at least 3 characters).';
    if (summary.trim().length < 10) return 'Describe what it does (at least 10 characters).';
    if (!endpoint.trim().startsWith('https://')) return 'Enter the API endpoint (an https:// address).';
    if (!BASE58.test(payout.trim())) return 'Enter the Solana wallet where you want to be paid.';
    const ex = exampleProblem(example);
    if (ex) return ex;
    const f = fieldsProblem(fields);
    if (f) return f;
    const r = requirementsProblem(requirements);
    if (r) return r;
    const s = publicUrlProblem(setupUrl, 'setup link');
    if (s) return s;
    const tp = termsProblem(terms);
    if (tp) return tp;
    const a = authProblem(auth);
    if (a) return a;
    const t = teamNotesProblem(teamNotes);
    if (t) return t;
    return editing ? null : rightsProblem(rights);
  }, [name, summary, endpoint, payout, example, fields, requirements, setupUrl, terms, auth, teamNotes, rights, editing]);

  const busy = submit.isPending || update.isPending || action.isPending || remove.isPending;
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/network' as never));

  // Reuse the setup of another provider of mine: its inputs, steps, setup link and connection (the key is copied by the server).
  const copyChoices = (mine.data?.providers ?? []).filter((p) => p.id !== editId && hasSetup(p));
  const applyCopy = (src: MyProvider) => {
    const run = () => {
      const c = copySetupFrom(src);
      setFields(c.fields);
      setRequirements(c.requirements);
      setSetupUrl(c.setupUrl);
      setTerms(c.terms);
      setAuth(c.auth);
      toast({ variant: 'success', title: 'Setup copied', subtitle: `From “${src.name}”. Check it below, then change anything you like.` });
    };
    const filled = fields.length > 0 || requirements.length > 0 || setupUrl.trim() !== '' || auth.type !== 'none' || terms.text.trim() !== '' || terms.url.trim() !== '';
    if (!filled) return run();
    Alert.alert('Replace this setup?', `This replaces the inputs, steps, setup link, your terms and connection below with the ones from “${src.name}”.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace', style: 'destructive', onPress: run },
    ]);
  };

  const setupPayload = () => ({
    inputFields: fieldsPayload(fields),
    requirements: cleanRequirements(requirements),
    setupUrl: setupUrl.trim() || null,
    teamNotes: teamNotes.trim() || null,
  });

  const send = async () => {
    setError(null);
    const compactExample = example.trim() ? JSON.stringify(JSON.parse(example)) : undefined;
    try {
      if (!editing) {
        const input: NewProviderInput = {
          name: name.trim(),
          summary: summary.trim(),
          category,
          endpointUrl: endpoint.trim(),
          docsUrl: docs.trim() || undefined,
          priceUsdc: price.trim() || '0',
          payoutWallet: payout.trim(),
          remixOfId: remixOf?.id,
          exampleRequest: compactExample,
          ...setupPayload(),
          customTerms: termsPayload(terms) ?? undefined,
          setupUrl: setupUrl.trim() || undefined,
          teamNotes: teamNotes.trim() || undefined,
          auth: authPayload(auth),
          rightsConfirmed: true,
        };
        await submit.mutateAsync(input);
        toast({ variant: 'success', title: 'Sent for review', subtitle: 'We’ll verify it, then it goes live on the network.' });
        goBack();
        return;
      }

      // Editing: send only what changed, so an untouched section can never send a live provider back for review.
      const changes: ProviderEdit = {};
      if (tidy(name) !== editing.name) changes.name = tidy(name);
      if (tidy(summary) !== editing.summary) changes.summary = tidy(summary);
      if (category !== editing.category) changes.category = category;
      if (endpoint.trim() !== editing.endpointUrl) changes.endpointUrl = endpoint.trim();
      if (docs.trim() !== (editing.docsUrl ?? '')) changes.docsUrl = docs.trim() || null;
      if (price.trim() !== (Number(editing.priceUsdc) > 0 ? editing.priceUsdc : '')) changes.priceUsdc = price.trim() || '0';
      if (payout.trim() !== editing.payoutWallet) changes.payoutWallet = payout.trim();
      if ((compactExample ?? null) !== (editing.exampleRequest ?? null)) changes.exampleRequest = compactExample ?? null;

      const next = setupPayload();
      if (JSON.stringify(next.inputFields) !== JSON.stringify(fieldsPayload(fieldDraftsFrom(editing.inputFields)))) changes.inputFields = next.inputFields;
      if (JSON.stringify(next.requirements) !== JSON.stringify(editing.requirements ?? [])) changes.requirements = next.requirements;
      if ((next.setupUrl ?? '') !== (editing.setupUrl ?? '')) changes.setupUrl = next.setupUrl;
      if ((next.teamNotes ?? '') !== (editing.teamNotes ?? '')) changes.teamNotes = next.teamNotes;
      if (termsChanged(terms, editing.terms)) changes.customTerms = termsPayload(terms);
      const a = editing.auth;
      if (auth.type !== a.type || (auth.type === 'header' && auth.header.trim() !== (a.header ?? '')) || auth.secret.trim() !== '' || auth.copyFrom) changes.auth = authPayload(auth);

      if (Object.keys(changes).length === 0) {
        toast({ variant: 'success', title: 'Nothing to save', subtitle: 'You haven’t changed anything.' });
        return;
      }
      const res = await update.mutateAsync({ id: editing.id, changes });
      toast(
        res.sentForReview
          ? { variant: 'success', title: 'Saved and sent for review', subtitle: res.wasLive ? 'It’s offline until the team approves the change.' : 'The team will take a look.' }
          : { variant: 'success', title: 'Saved' },
      );
      goBack();
    } catch (e) {
      // The server says creators only (or the provider terms changed): the sign-up is the way forward, not an error to read.
      const code = (e as { code?: string })?.code;
      if (code === 'creator_required' || code === 'creator_terms_outdated') {
        router.replace({ pathname: '/creator', params: { next: 'provider', ...(remixId ? { remix: remixId } : {}) } } as never);
        return;
      }
      setError((e as Error)?.message ?? 'Couldn’t send it. Try again.');
    }
  };

  const togglePause = async () => {
    if (!editing) return;
    setError(null);
    const next = editing.status === 'verified' ? 'pause' : 'resume';
    try {
      await action.mutateAsync({ id: editing.id, action: next });
      toast({ variant: 'success', title: next === 'pause' ? 'Paused' : 'Back on the network', subtitle: next === 'pause' ? 'Nobody can use it until you resume it.' : undefined });
      goBack();
    } catch (e) {
      setError((e as Error)?.message ?? 'Couldn’t do that. Try again.');
    }
  };

  const confirmRemove = () => {
    if (!editing) return;
    Alert.alert('Remove this provider?', `“${editing.name}” disappears from the network for everyone. What it has earned stays yours.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove.mutateAsync(editing.id);
            toast({ variant: 'success', title: 'Removed' });
            goBack();
          } catch (e) {
            setError((e as Error)?.message ?? 'Couldn’t remove it. Try again.');
          }
        },
      },
    ]);
  };

  const title = editId ? 'Edit provider' : remixId ? 'Remix provider' : 'Add a provider';
  const patchField = (i: number, patch: Partial<FieldDraft>) => setFields((list) => list.map((f, n) => (n === i ? { ...f, ...patch } : f)));
  const notFound = (editId && !waiting && !editing) || (remixId && !waiting && !remixOf);

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + Spacing.md, paddingBottom: Spacing.xxl, paddingHorizontal: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.iconButton}>
              <BackIcon />
            </Pressable>
            <Text style={styles.title}>{title}</Text>
            <View style={{ width: 36 }} />
          </View>

          {waiting ? (
            <ActivityIndicator color={Colors.tx1} style={{ marginVertical: Spacing.xxl }} />
          ) : notFound ? (
            <Card title="Provider not found">
              <Text style={styles.hint}>It may have been removed. Go back and try again.</Text>
              <View style={{ alignSelf: 'flex-start', marginTop: Spacing.sm }}>
                <Button variant="outline" onPress={goBack}>
                  Back
                </Button>
              </View>
            </Card>
          ) : (
            <>
              {!editing ? <Notice>If you’re a Seeker creator, choose the category carefully: after review, Bluvfi can place an approved provider in the official Bills, Invest or Banking provider list for that use case. Other approved providers stay discoverable in the open network.</Notice> : null}
              {remixOf ? <Notice>Building on <Text style={{ color: Colors.tx0 }}>{remixOf.name}</Text>. Your version is listed on its own and credits the original.</Notice> : null}
              {editing && editing.reviewNote && editing.status === 'submitted' ? (
                <Notice tone="amber">
                  <Text style={{ fontFamily: Fonts.sansSemiBold }}>The team asked: </Text>
                  {editing.reviewNote}
                  {'\n'}Answer in “Notes for the Bluvfi team” below and save.
                </Notice>
              ) : null}
              {editing && editing.status === 'rejected' ? <Notice tone="amber">Not accepted{editing.reviewNote ? `: ${editing.reviewNote}` : '.'} Fix it and save to send it again.</Notice> : null}
              {editing && isLive ? (
                <Notice>
                  Changing the name, description, category, endpoint, docs link, price, request inputs, requirements, setup link or your own terms sends it back to the team for a quick check, and it’s offline until they approve. Your example request, payout wallet, key, notes for the team and contact details can change any time.
                </Notice>
              ) : null}
              {teamPaused ? <Notice tone="amber">The team paused this provider, so it can’t be edited or resumed from here. Contact support if you think that’s a mistake.</Notice> : null}

              {/* Copy from another provider */}
              {copyChoices.length > 0 && !teamPaused ? (
                <Card title="Copy setup from another provider" intro="Reuse the inputs, steps, setup link and connection (even the same key) from one of your providers. You can change anything afterwards.">
                  {copyChoices.map((c) => (
                    <Pressable key={c.id} onPress={() => applyCopy(c)} accessibilityRole="button" accessibilityLabel={`Copy setup from ${c.name}`} style={styles.copyRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.copyName} numberOfLines={1}>
                          {c.name}
                        </Text>
                        <Text style={styles.hint}>{setupSummary(c)}</Text>
                      </View>
                      <Text style={styles.copyAction}>Copy</Text>
                    </Pressable>
                  ))}
                </Card>
              ) : null}

              {/* 1 · Basics */}
              <Card title="Basics" step="1">
                <Label>Name</Label>
                <Input value={name} onChangeText={setName} maxLength={40} placeholder="e.g. Weather Wisp" />
                <Label>What it does</Label>
                <Input value={summary} onChangeText={setSummary} maxLength={280} multiline placeholder="One or two sentences people will read before using it" />
                <Label>Category</Label>
                <View style={styles.chips}>
                  {PROVIDER_CATEGORIES.map((c) => (
                    <Chip key={c.key} on={category === c.key} onPress={() => setCategory(c.key)}>
                      {c.label}
                    </Chip>
                  ))}
                </View>
                <Text style={styles.hint}>This decides where the provider belongs. Seeker creators may be promoted into official Bluvfi surfaces by use case after review.</Text>
                <Label>API endpoint</Label>
                <Input mono value={endpoint} onChangeText={setEndpoint} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://api.yourservice.com/v1" />
                <Text style={styles.hint}>A public https address. Requests reach it through Bluvfi as a POST with a JSON body, and the team checks it before it goes live.</Text>
                <Label>Docs link (optional)</Label>
                <Input mono value={docs} onChangeText={setDocs} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://" />
                <Label>Price per call (USDC)</Label>
                <Input value={price} onChangeText={(t) => setPrice(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0 for free" />
                <Text style={styles.hint}>Paid calls are charged from the caller’s credits. You keep 80% and withdraw it as SKR; failed calls are never charged.</Text>
                <Label>Where to pay you</Label>
                <Input mono value={payout} onChangeText={setPayout} autoCapitalize="none" autoCorrect={false} placeholder="Your Solana wallet address" />
                {wallet && payout !== wallet.address ? (
                  <Text style={styles.link} onPress={() => setPayout(wallet.address)}>
                    Use my connected {wallet.name} wallet
                  </Text>
                ) : null}
              </Card>

              {/* 2 · Request inputs */}
              <Card title="What people send" step="2" intro="List the inputs your API needs. People get a simple form instead of raw JSON, and a request that doesn’t fit is refused before anyone is charged. Skip this to accept any JSON.">
                {fields.map((f, i) => (
                  <View key={i} style={styles.fieldCard}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.fieldTitle}>Input {i + 1}</Text>
                      <Pressable onPress={() => setFields((l) => l.filter((_, n) => n !== i))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove input ${i + 1}`}>
                        <Text style={styles.removeText}>Remove</Text>
                      </Pressable>
                    </View>
                    <Label first>Label people see</Label>
                    <Input
                      value={f.label}
                      onChangeText={(t) => patchField(i, { label: t, ...(f.keyTouched ? null : { key: suggestKey(t) }) })}
                      maxLength={LIMITS.labelMax}
                      placeholder="e.g. City"
                    />
                    <Label>Name sent to your API</Label>
                    <Input
                      mono
                      value={f.key}
                      onChangeText={(t) => patchField(i, { key: t.replace(/[^A-Za-z0-9_]/g, ''), keyTouched: true })}
                      maxLength={LIMITS.keyMax}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="city"
                    />
                    <Label>Type</Label>
                    <View style={styles.chips}>
                      {FIELD_TYPES.map((t) => (
                        <Chip key={t.key} on={f.type === t.key} onPress={() => patchField(i, { type: t.key })}>
                          {t.label}
                        </Chip>
                      ))}
                    </View>
                    {f.type === 'choice' ? (
                      <>
                        <Label>Options (separate with commas)</Label>
                        <Input value={f.choicesText} onChangeText={(t) => patchField(i, { choicesText: t })} placeholder="metric, imperial" autoCapitalize="none" />
                      </>
                    ) : null}
                    <Label>Help text (optional)</Label>
                    <Input value={f.help} onChangeText={(t) => patchField(i, { help: t })} maxLength={LIMITS.helpMax} placeholder="e.g. The city to get the forecast for" />
                    {f.type === 'text' || f.type === 'number' ? (
                      <>
                        <Label>Example (optional)</Label>
                        <Input value={f.placeholder} onChangeText={(t) => patchField(i, { placeholder: t })} maxLength={LIMITS.placeholderMax} placeholder={f.type === 'number' ? 'e.g. 3' : 'e.g. Lagos'} />
                      </>
                    ) : null}
                    <Check checked={f.required} onToggle={() => patchField(i, { required: !f.required })} label="Required" />
                  </View>
                ))}
                {fields.length < LIMITS.maxFields ? (
                  <View style={{ alignSelf: 'flex-start' }}>
                    <Button variant="outline" size="sm" onPress={() => setFields((l) => [...l, emptyField()])}>
                      {fields.length === 0 ? 'Add an input' : 'Add another input'}
                    </Button>
                  </View>
                ) : (
                  <Text style={styles.hint}>That’s the most inputs a provider can have ({LIMITS.maxFields}).</Text>
                )}

                <Label>Example request (advanced, optional)</Label>
                <Input mono value={example} onChangeText={setExample} multiline autoCapitalize="none" autoCorrect={false} placeholder={'{\n  "city": "Lagos"\n}'} />
                {exampleProblem(example) ? (
                  <Text style={styles.error}>{exampleProblem(example)}</Text>
                ) : (
                  <Text style={styles.hint}>A JSON object showing what a good request looks like, for people (and AI agents) who send raw JSON instead of using the form.</Text>
                )}
              </Card>

              {/* 3 · Requirements */}
              <Card title="Before it can be used" step="3" intro="Does someone need to do something first, like create an account with you? List up to five steps. People tick “I’ve done this” before they can try it.">
                {requirements.map((r, i) => (
                  <View key={i} style={styles.reqRow}>
                    <View style={{ flex: 1 }}>
                      <Input value={r} onChangeText={(t) => setRequirements((l) => l.map((x, n) => (n === i ? t : x)))} maxLength={LIMITS.requirementMax} placeholder="e.g. Create a free account at acme.com" />
                    </View>
                    <Pressable onPress={() => setRequirements((l) => l.filter((_, n) => n !== i))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove step ${i + 1}`}>
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
                {requirements.length < LIMITS.maxRequirements ? (
                  <View style={{ alignSelf: 'flex-start' }}>
                    <Button variant="outline" size="sm" onPress={() => setRequirements((l) => [...l, ''])}>
                      {requirements.length === 0 ? 'Add a step' : 'Add another step'}
                    </Button>
                  </View>
                ) : null}
                <Label>Setup link (optional)</Label>
                <Input mono value={setupUrl} onChangeText={setSetupUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://" />
                {publicUrlProblem(setupUrl, 'setup link') ? <Text style={styles.error}>{publicUrlProblem(setupUrl, 'setup link')}</Text> : <Text style={styles.hint}>Where people do those steps. Changing the steps or the link sends a live provider back for review.</Text>}
              </Card>

              {/* 4 · Your own terms for the people who use it */}
              <Card
                title="Your terms for people who use it"
                step="4"
                intro="Optional. Add your own terms (and/or a link to them) and people must agree before they can use your provider. They sit on top of Bluvfi’s Terms of Service, which always apply, and the team can decline a listing whose terms break Bluvfi’s rules."
              >
                <Label first>Your terms</Label>
                <Input
                  value={terms.text}
                  onChangeText={(t) => setTerms((x) => ({ ...x, text: t }))}
                  multiline
                  maxLength={2000}
                  placeholder="e.g. For lawful use only. Don’t resell the data. Don’t store answers for longer than 24 hours."
                />
                <Text style={styles.hint}>{terms.text.trim().length}/2000</Text>
                <Label>Link to the full terms (optional)</Label>
                <Input mono value={terms.url} onChangeText={(t) => setTerms((x) => ({ ...x, url: t }))} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://" />
                {termsProblem(terms) ? (
                  <Text style={styles.error}>{termsProblem(terms)}</Text>
                ) : (
                  <Text style={styles.hint}>People are asked to agree to this exact version. If you change it, everyone is asked again, and a live provider goes back for a quick review.</Text>
                )}
              </Card>

              {/* 5 · Connection */}
              <Card title="Connect your API" step="5" intro="If your API needs a key, Bluvfi sends it with every call. It’s stored encrypted, only ever sent to your endpoint, and never shown again.">
                <View style={styles.chips}>
                  {AUTH_TYPES.map((t) => (
                    <Chip key={t.key} on={auth.type === t.key} onPress={() => setAuth((a) => ({ ...a, type: t.key }))}>
                      {t.label}
                    </Chip>
                  ))}
                </View>
                {auth.type === 'header' ? (
                  <>
                    <Label>Header name</Label>
                    <Input mono value={auth.header} onChangeText={(t) => setAuth((a) => ({ ...a, header: t }))} autoCapitalize="none" autoCorrect={false} maxLength={LIMITS.headerMax} placeholder="X-API-Key" />
                  </>
                ) : null}
                {auth.type !== 'none' ? (
                  <>
                    <Label>{auth.type === 'bearer' ? 'Token' : 'Key'}</Label>
                    <Input
                      mono
                      value={auth.secret}
                      onChangeText={(t) => setAuth((a) => ({ ...a, secret: t }))}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={LIMITS.secretMax}
                      placeholder={auth.copyFrom ? `Same key as “${auth.copyFrom.name}”` : auth.hasSecret ? '•••••••• (saved)' : auth.type === 'bearer' ? 'Paste the token' : 'Paste the key'}
                    />
                    <Text style={styles.hint}>
                      {auth.copyFrom
                        ? `This provider will use the same key as “${auth.copyFrom.name}”. Paste a different one to use another.`
                        : auth.hasSecret
                          ? 'A key is saved. Leave this empty to keep it, or paste a new one to replace it.'
                          : auth.type === 'bearer'
                            ? 'Sent as “Authorization: Bearer …”.'
                            : 'Sent in the header above.'}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.hint}>Choose this when your API is open or doesn’t need Bluvfi to identify itself.</Text>
                )}
              </Card>

              {/* 5 · Team notes */}
              <Card title="Notes for the Bluvfi team" step="6" intro="Anything we should know or do before approving it, like IP addresses to allow or a test key to use. Private: only the team sees this.">
                <Input value={teamNotes} onChangeText={setTeamNotes} maxLength={LIMITS.teamNotesMax} multiline placeholder="Optional" />
                <Text style={styles.hint}>{teamNotes.trim().length}/{LIMITS.teamNotesMax}</Text>
              </Card>

              {/* 7 · Ownership (who you are lives on the creator profile) */}
              <Card title={editing ? 'Creator' : 'Before you send'} step="7">
                {creator ? (
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.copyName}>Listing as {creator.operatorType === 'company' ? creator.companyName : 'an individual'}</Text>
                      <Text style={styles.hint}>{creator.contactEmail} · only the Bluvfi team sees this email</Text>
                    </View>
                    <Text style={styles.copyAction} onPress={() => router.push('/creator' as never)} accessibilityRole="button">
                      {editing ? 'Edit profile' : 'Change'}
                    </Text>
                  </View>
                ) : (
                  <ActivityIndicator color={Colors.tx1} />
                )}
                {!editing ? (
                  <Check checked={rights} onToggle={() => setRights((r) => !r)} label="I own this service, or I’m allowed to offer it through Bluvfi." />
                ) : null}
              </Card>

              {/* Manage */}
              {editing ? (
                <Card title="Manage">
                  {canPause ? (
                    <Button variant="outline" fullWidth disabled={busy} loading={action.isPending} onPress={togglePause}>
                      {editing.status === 'verified' ? 'Pause provider' : 'Resume provider'}
                    </Button>
                  ) : null}
                  <Button variant="destructive" fullWidth disabled={busy} loading={remove.isPending} onPress={confirmRemove}>
                    Remove provider
                  </Button>
                </Card>
              ) : null}
            </>
          )}
        </ScrollView>

        {!waiting && !notFound ? (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
            {error ? <Text style={styles.error}>{error}</Text> : problem ? <Text style={styles.footerHint}>To send: {problem}</Text> : null}
            <Button fullWidth disabled={!!problem || teamPaused || !initialised} loading={submit.isPending || update.isPending} onPress={send}>
              {editing ? 'Save changes' : 'Send for review'}
            </Button>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function Card({ title, step, intro, children }: { title: string; step?: string; intro?: string; children: ReactNode }) {
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
      {intro ? <Text style={styles.intro}>{intro}</Text> : null}
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

function Input({ mono, multiline, style, ...props }: React.ComponentProps<typeof TextInput> & { mono?: boolean }) {
  return (
    <TextInput
      {...props}
      multiline={multiline}
      placeholderTextColor={Colors.tx2}
      textAlignVertical={multiline ? 'top' : 'center'}
      style={[styles.input, mono && styles.mono, multiline && styles.multiline, style]}
    />
  );
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
  label: { ...Type.label, color: Colors.tx2, marginTop: Spacing.md },
  hint: { ...Type.small, color: Colors.tx2 },
  error: { ...Type.small, color: Colors.redAlert },
  link: { ...Type.small, color: Colors.sage, textDecorationLine: 'underline' },
  input: { backgroundColor: Colors.bg2, borderRadius: Radii.md, paddingVertical: 12, paddingHorizontal: Spacing.lg, color: Colors.tx0, fontFamily: Type.body.fontFamily, fontSize: 15 },
  multiline: { minHeight: 84 },
  mono: { fontFamily: Fonts.mono, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: Colors.bg2, borderWidth: 1, borderColor: Colors.border },
  chipOn: { backgroundColor: SharColors.tint, borderColor: SharColors.tintBorder },
  chipText: { ...Type.small, fontFamily: Fonts.sansMedium, color: Colors.tx1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  fieldCard: { backgroundColor: Colors.bg0, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.xs },
  fieldTitle: { ...Type.h3, color: Colors.tx0 },
  removeText: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.redAlert },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bg0, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  copyName: { ...Type.body, fontFamily: Fonts.sansSemiBold, color: Colors.tx0 },
  copyAction: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: SharColors.glow },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  notice: { backgroundColor: SharColors.tint, borderRadius: Radii.lg, borderWidth: 1, borderColor: SharColors.tintBorder, padding: Spacing.md },
  noticeAmber: { backgroundColor: 'rgba(232,168,56,0.10)', borderColor: 'rgba(232,168,56,0.30)' },
  noticeText: { ...Type.small, color: Colors.tx1 },
  footer: { backgroundColor: Colors.bg1, borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.sm },
  footerHint: { ...Type.small, color: Colors.tx2 },
});
