import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import { useSquad, useSquadAction, type SquadInfo, type SquadView } from '@/hooks/use-shar';
import { normalizeSquadCode, squadInviteMessage } from '@/lib/squad';

const fmt = (n: number) => n.toLocaleString('en-US');

/**
 * Squads: up to ten friends pooling their week's Shar toward a goal that grows with the squad. Reaching it is recognition (it mints no
 * Shar). Other people only ever see a squad by a generated name, never what its members called it. The server decides everything; this
 * shows it. Open to everyone.
 */
export function SquadCard() {
  const { data, isLoading, isError, refetch } = useSquad();
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Squad</Text>
      {isLoading ? (
        <ActivityIndicator color={Colors.tx1} style={{ marginVertical: Spacing.lg }} />
      ) : isError || !data ? (
        <>
          <Text style={styles.muted}>Couldn’t load your squad. Check your connection.</Text>
          <Button variant="outline" onPress={() => refetch()}>
            Try again
          </Button>
        </>
      ) : !data.ready ? (
        <Text style={styles.muted}>Squads are being switched on. Check back soon.</Text>
      ) : data.squad ? (
        <InSquad squad={data.squad} view={data} />
      ) : (
        <NoSquad view={data} />
      )}
      {data?.ready && data.board.length > 0 ? <Board view={data} /> : null}
    </View>
  );
}

function NoSquad({ view }: { view: SquadView }) {
  const act = useSquadAction();
  const toast = useToast();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { maxMembers, goalPerMember, minGoal, nameMin, nameMax, codeLength } = view.rules;

  const run = async (input: Parameters<typeof act.mutateAsync>[0], done: string) => {
    setError(null);
    try {
      await act.mutateAsync(input);
      toast({ variant: 'success', title: done });
      setName('');
      setCode('');
    } catch (e) {
      setError((e as Error)?.message ?? 'That didn’t work.');
    }
  };

  return (
    <>
      <Text style={styles.muted}>
        Pool your Shar with up to {maxMembers - 1} friends toward a weekly goal: {goalPerMember} Shar each, at least {minGoal}. Everyone’s Shar this week counts: purchases, providers and Daily Sparks.
      </Text>
      <Text style={styles.label}>START A SQUAD</Text>
      <TextInput value={name} onChangeText={(t) => { setName(t); setError(null); }} placeholder={`A name, ${nameMin}–${nameMax} letters`} placeholderTextColor={Colors.tx2} maxLength={nameMax} autoCorrect={false} style={styles.input} accessibilityLabel="Squad name" />
      <Button fullWidth disabled={name.trim().length < nameMin} loading={act.isPending && act.variables?.action === 'create'} onPress={() => run({ action: 'create', name }, 'Squad started')}>
        Start my squad
      </Button>
      <Text style={styles.label}>OR JOIN A FRIEND’S</Text>
      <TextInput value={code} onChangeText={(t) => { setCode(normalizeSquadCode(t, codeLength)); setError(null); }} placeholder={`${codeLength}-character code`} placeholderTextColor={Colors.tx2} autoCapitalize="characters" autoCorrect={false} style={[styles.input, styles.codeInput]} accessibilityLabel="Squad code" />
      <Button fullWidth variant="outline" disabled={code.length !== codeLength} loading={act.isPending && act.variables?.action === 'join'} onPress={() => run({ action: 'join', code }, 'You’re in the squad')}>
        Join squad
      </Button>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </>
  );
}

function InSquad({ squad, view }: { squad: SquadInfo; view: SquadView }) {
  const act = useSquadAction();
  const toast = useToast();
  const copy = async () => {
    await Clipboard.setStringAsync(squad.code);
    toast({ variant: 'success', title: 'Code copied' });
  };
  const leave = () =>
    Alert.alert('Leave this squad?', 'Your Shar stays yours. You can join another squad, or this one again with its code.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => act.mutateAsync({ action: 'leave' }).catch((e) => toast({ variant: 'error', title: 'Couldn’t leave', subtitle: (e as Error)?.message })),
      },
    ]);

  return (
    <>
      <View style={styles.rowBetween}>
        <Text style={styles.squadName} numberOfLines={1}>
          {squad.name}
        </Text>
        <Text style={styles.mono}>
          {squad.memberCount}/{view.rules.maxMembers}
        </Text>
      </View>

      <View style={styles.rowBetween}>
        <Text style={styles.muted}>This week</Text>
        <Text style={styles.mono}>
          {fmt(squad.shar)} / {fmt(squad.goal)} Shar
        </Text>
      </View>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: squad.goal, now: Math.min(squad.shar, squad.goal) }}>
        <View style={[styles.fill, { width: `${Math.max(3, Math.round(squad.progress * 100))}%` }, squad.reached && styles.fillDone]} />
      </View>
      <Text style={[styles.note, squad.reached && { color: Colors.sage }]}>
        {squad.reached ? 'Goal reached this week. Well lit.' : `${fmt(squad.remaining)} Shar to go. Every member’s Shar counts.`}
      </Text>

      <View>
        {squad.members.map((m, i) => (
          <View key={`${m.handle}-${i}`} style={[styles.member, m.you && styles.memberYou]}>
            <Text style={[styles.memberName, m.you && { color: Colors.tx0 }]} numberOfLines={1}>
              {m.you ? 'You' : m.handle}
              {m.owner ? '  ·  owner' : ''}
            </Text>
            <Text style={styles.memberShar}>{fmt(m.shar)}</Text>
          </View>
        ))}
      </View>

      {!squad.full ? (
        <View style={styles.codeBox}>
          <View>
            <Text style={styles.label}>INVITE CODE</Text>
            <Text style={styles.code} selectable>
              {squad.code}
            </Text>
          </View>
          <View style={styles.codeActions}>
            <Pressable onPress={copy} hitSlop={8} accessibilityRole="button" accessibilityLabel="Copy squad code">
              <Text style={styles.link}>Copy</Text>
            </Pressable>
            <Pressable onPress={() => Share.share({ message: squadInviteMessage(squad.name, squad.code) }).catch(() => {})} hitSlop={8} accessibilityRole="button" accessibilityLabel="Share squad invite">
              <Text style={styles.link}>Share</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={styles.note}>Your squad is full.</Text>
      )}
      <Pressable onPress={leave} hitSlop={8} accessibilityRole="button" disabled={act.isPending}>
        <Text style={styles.leave}>Leave squad</Text>
      </Pressable>
    </>
  );
}

function Board({ view }: { view: SquadView }) {
  return (
    <View style={styles.boardWrap}>
      <Text style={styles.label}>SQUADS THIS WEEK</Text>
      {view.board.slice(0, 5).map((s) => (
        <View key={s.rank} style={[styles.member, s.you && styles.memberYou]}>
          <Text style={styles.rank}>{s.rank}</Text>
          <Text style={[styles.memberName, s.you && { color: Colors.tx0 }]} numberOfLines={1}>
            {s.you ? 'Your squad' : s.name}
            {s.reached ? '  ·  goal reached' : ''}
          </Text>
          <Text style={styles.memberShar}>{fmt(s.shar)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.bg1, borderRadius: Radii.xxl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl, gap: Spacing.md },
  title: { ...Type.h2, color: Colors.tx0 },
  muted: { ...Type.body, color: Colors.tx1 },
  note: { ...Type.small, color: Colors.tx1 },
  label: { ...Type.label, color: Colors.tx2, marginTop: Spacing.xs },
  mono: { ...Type.label, color: Colors.tx2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  squadName: { ...Type.h3, color: Colors.tx0, flex: 1 },
  input: { backgroundColor: Colors.bg0, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, color: Colors.tx0, paddingHorizontal: Spacing.lg, paddingVertical: 12, fontFamily: Fonts.sansMedium, fontSize: 15 },
  codeInput: { fontFamily: Fonts.monoBold, letterSpacing: 3 },
  error: { ...Type.small, color: Colors.redAlert },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.bg2, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: SharColors.body },
  fillDone: { backgroundColor: Colors.sage },
  member: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 9, paddingHorizontal: Spacing.sm, borderRadius: Radii.md },
  memberYou: { backgroundColor: SharColors.tint, borderWidth: 1, borderColor: SharColors.tintBorder },
  memberName: { flex: 1, ...Type.body, color: Colors.tx1 },
  memberShar: { fontFamily: Fonts.monoBold, fontSize: 14, color: Colors.tx0 },
  rank: { width: 20, fontFamily: Fonts.monoBold, fontSize: 13, color: Colors.tx2, textAlign: 'center' },
  codeBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bg0, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg },
  code: { fontFamily: Fonts.monoBold, fontSize: 22, letterSpacing: 3, color: Colors.tx0 },
  codeActions: { flexDirection: 'row', gap: Spacing.lg },
  link: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.sage, textDecorationLine: 'underline' },
  leave: { ...Type.small, fontFamily: Fonts.sansSemiBold, color: Colors.tx2, textAlign: 'center', paddingVertical: Spacing.xs },
  boardWrap: { marginTop: Spacing.sm, gap: 2 },
});
