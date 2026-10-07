import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { clearPendingReferral, normalizeReferralCode, setPendingReferral } from '@/lib/referral';

const SNAP_POINTS = ['52%'];

/**
 * "Have a referral code?" before there is an account: the code is kept on the phone and applied when the person signs up.
 * Accepts the code itself or a pasted referral link.
 */
export function ReferralCodeSheet({ open, onClose, saved, onSaved }: { open: boolean; onClose: () => void; saved: string | null; onSaved: (code: string | null) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setText(saved ?? '');
    setError(null);
  }, [open, saved]);

  const save = async () => {
    const code = normalizeReferralCode(text);
    if (!code) {
      setError('That doesn’t look like a referral code. It has 8 letters and numbers.');
      return;
    }
    await setPendingReferral(code);
    onSaved(code);
    onClose();
  };

  const remove = async () => {
    await clearPendingReferral();
    onSaved(null);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Referral code" snapPoints={SNAP_POINTS}>
      <Text style={styles.lead}>A friend’s code gives you both a head start with Shar. Enter it now and we’ll apply it when you create your account.</Text>
      <Text style={styles.label}>Code or link</Text>
      <BottomSheetTextInput
        style={styles.input}
        value={text}
        onChangeText={(t) => {
          setText(t);
          setError(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="ABCD2345"
        placeholderTextColor={Colors.tx2}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={{ marginTop: Spacing.lg, gap: Spacing.sm }}>
        <Button fullWidth disabled={text.trim().length === 0} onPress={save}>
          Save code
        </Button>
        {saved ? (
          <Button variant="ghost" fullWidth onPress={remove}>
            Remove code
          </Button>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  lead: { ...Type.body, color: Colors.tx1, marginBottom: Spacing.sm },
  label: { ...Type.label, color: Colors.tx2, marginTop: Spacing.md, marginBottom: Spacing.xs },
  input: {
    backgroundColor: Colors.bg2,
    borderRadius: Radii.md,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    color: Colors.tx0,
    fontFamily: Fonts.mono,
    fontSize: 16,
    letterSpacing: 2,
  },
  error: { ...Type.small, color: Colors.redAlert, marginTop: Spacing.sm },
});
