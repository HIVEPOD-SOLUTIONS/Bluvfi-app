import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useReviewListing, type QueueListing } from '@/hooks/use-shar';

const SNAP_POINTS = ['88%'];

/** Everything an admin needs to judge a submitted provider, with Approve and Decline. Declining needs a reason the owner can read. */
export function ListingReviewSheet({ listing, onClose }: { listing: QueueListing | null; onClose: () => void }) {
  const toast = useToast();
  const review = useReviewListing();
  const [note, setNote] = useState('');
  const [declining, setDeclining] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNote('');
    setDeclining(false);
    setAsking(false);
    setError(null);
  }, [listing?.id]);

  const run = async (action: 'verify' | 'reject' | 'request_info') => {
    if (!listing) return;
    setError(null);
    try {
      await review.mutateAsync({ id: listing.id, action, note: note.trim() || undefined });
      toast({ variant: 'success', title: action === 'verify' ? 'Approved' : action === 'reject' ? 'Declined' : 'Question sent', subtitle: listing.name });
      onClose();
    } catch (e) {
      setError((e as Error)?.message ?? 'Couldn’t save that.');
    }
  };

  const l = listing;
  return (
    <BottomSheet open={!!l} onClose={onClose} title="Review provider" snapPoints={SNAP_POINTS} scrollable>
      {l ? (
        <>
          <Text style={styles.name}>{l.name}</Text>
          <Text style={styles.summary}>{l.summary}</Text>
          <View style={styles.card}>
            <Row label="CATEGORY" value={l.category} />
            <Row label="PRICE PER CALL" value={Number(l.priceUsdc) > 0 ? `$${l.priceUsdc}` : 'Free'} />
            <Row label="ENDPOINT (calls go here)" value={l.endpointUrl} mono onPress={() => Linking.openURL(l.endpointUrl).catch(() => {})} />
            {l.docsUrl ? <Row label="DOCS" value={l.docsUrl} mono onPress={() => Linking.openURL(l.docsUrl!).catch(() => {})} /> : null}
            <Row label="OWNER PAID TO" value={l.payoutWallet} mono />
            <Row label="OWNER" value={l.ownerUserId} mono />
            {l.publisher ? (
              <>
                <Row label="LISTED AS" value={l.publisher.operatorType === 'company' ? `Company or team: ${l.publisher.companyName ?? '—'}` : 'An individual'} />
                {l.publisher.companyWebsite ? <Row label="COMPANY WEBSITE" value={l.publisher.companyWebsite} mono onPress={() => Linking.openURL(l.publisher!.companyWebsite!).catch(() => {})} /> : null}
                <Row label="CONTACT EMAIL" value={l.publisher.contactEmail} mono onPress={() => Linking.openURL(`mailto:${l.publisher!.contactEmail}`).catch(() => {})} />
                <Row
                  label="TERMS"
                  value={`Agreed to version ${l.publisher.termsVersion}${l.publisher.termsAcceptedAt ? ` on ${new Date(l.publisher.termsAcceptedAt).toLocaleDateString()}` : ''}. ${l.publisher.rightsConfirmed ? 'Confirmed they own it or may offer it.' : 'Did not confirm ownership.'}`}
                />
              </>
            ) : (
              <Row label="PUBLISHER" value="Not provided (listed before these questions were asked)" />
            )}
            {l.remixOfId ? <Row label="REMIX OF" value={l.remixOfId} mono /> : null}
          </View>

          <Text style={styles.section}>SETUP</Text>
          <View style={styles.card}>
            <Row
              label="REQUEST INPUTS"
              value={
                l.config.inputFields && l.config.inputFields.length > 0
                  ? l.config.inputFields.map((f) => `${f.label} (${f.key}: ${f.type}${f.required ? ', required' : ''}${f.choices ? `: ${f.choices.join('/')}` : ''})`).join('\n')
                  : 'None listed (free-form JSON)'
              }
            />
            <Row label="BEFORE IT CAN BE USED" value={l.config.requirements && l.config.requirements.length > 0 ? l.config.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n') : 'Nothing'} />
            {l.config.setupUrl ? <Row label="SETUP LINK" value={l.config.setupUrl} mono onPress={() => Linking.openURL(l.config.setupUrl!).catch(() => {})} /> : null}
            <Row
              label="HOW WE CONNECT"
              value={l.config.auth.type === 'none' ? 'No key' : `${l.config.auth.type === 'bearer' ? 'Bearer token' : `API-key header ${l.config.auth.header ?? ''}`} (${l.config.auth.hasSecret ? 'key saved, encrypted' : 'NO KEY SAVED'})`}
            />
            <Row label="NOTES FROM THE OWNER" value={l.config.teamNotes ?? 'None'} />
            <Row label="OWNER'S OWN TERMS FOR USERS (check them against our rules)" value={l.ownerTerms ? [l.ownerTerms.text, l.ownerTerms.url].filter(Boolean).join('\n') : 'None'} />
            {l.reviewNote ? <Row label="YOU ASKED" value={l.reviewNote} /> : null}
          </View>
          <Text style={styles.hint}>Check that the endpoint answers, the docs match, and the price is fair before approving. Approved providers can be called by anyone.</Text>

          {asking ? (
            <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
              <Text style={styles.label}>What do you need? (the owner sees this)</Text>
              <BottomSheetTextInput style={styles.input} value={note} onChangeText={setNote} placeholder="e.g. Which regions do you serve? Please send a test key." placeholderTextColor={Colors.tx2} maxLength={300} multiline />
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Button fullWidth disabled={note.trim().length < 3} loading={review.isPending} onPress={() => run('request_info')}>
                    Send question
                  </Button>
                </View>
                <Button variant="ghost" onPress={() => setAsking(false)}>
                  Back
                </Button>
              </View>
              <Text style={styles.hint}>It stays in the queue, with your question on it, until the owner answers and you approve or decline it.</Text>
            </View>
          ) : declining ? (
            <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
              <Text style={styles.label}>Reason (the owner sees this)</Text>
              <BottomSheetTextInput style={styles.input} value={note} onChangeText={setNote} placeholder="e.g. The endpoint returned an error when we tested it." placeholderTextColor={Colors.tx2} maxLength={300} multiline />
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Button variant="destructive" fullWidth disabled={note.trim().length < 3} loading={review.isPending} onPress={() => run('reject')}>
                    Decline it
                  </Button>
                </View>
                <Button variant="ghost" onPress={() => setDeclining(false)}>
                  Back
                </Button>
              </View>
            </View>
          ) : (
            <View style={{ gap: Spacing.sm, marginTop: Spacing.lg }}>
              <Button fullWidth loading={review.isPending} onPress={() => run('verify')}>
                Approve
              </Button>
              <Button variant="outline" fullWidth onPress={() => setAsking(true)}>
                Ask for more info…
              </Button>
              <Button variant="outline" fullWidth onPress={() => setDeclining(true)}>
                Decline…
              </Button>
            </View>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </>
      ) : null}
    </BottomSheet>
  );
}

function Row({ label, value, mono, onPress }: { label: string; value: string; mono?: boolean; onPress?: () => void }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={[styles.dataValue, mono && styles.mono, onPress && styles.link]} selectable={!onPress} onPress={onPress}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  name: { ...Type.h1, color: Colors.tx0 },
  summary: { ...Type.body, color: Colors.tx1, marginTop: Spacing.xs, marginBottom: Spacing.lg },
  card: { backgroundColor: Colors.bg2, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md },
  dataLabel: { ...Type.label, color: Colors.tx2 },
  dataValue: { ...Type.body, color: Colors.tx0 },
  mono: { fontFamily: Fonts.mono, fontSize: 12 },
  link: { color: Colors.sage, textDecorationLine: 'underline' },
  hint: { ...Type.small, color: Colors.tx2, marginTop: Spacing.md },
  section: { ...Type.label, color: Colors.tx2, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  label: { ...Type.label, color: Colors.tx2 },
  input: { backgroundColor: Colors.bg2, borderRadius: Radii.md, paddingVertical: 12, paddingHorizontal: Spacing.lg, color: Colors.tx0, fontFamily: Type.body.fontFamily, fontSize: 15, minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  error: { ...Type.small, color: Colors.redAlert, marginTop: Spacing.md },
});
