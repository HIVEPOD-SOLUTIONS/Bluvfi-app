import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';

/**
 * Shown before someone signs in with only a wallet: says plainly what that means for getting their account back,
 * and needs an explicit "I understand" before the wallet app opens. They can always back out to email or Google.
 */
export function WalletRiskModal({ open, onContinue, onCancel }: { open: boolean; onContinue: () => void; onCancel: () => void }) {
  const [understood, setUnderstood] = useState(false);

  const close = () => {
    setUnderstood(false);
    onCancel();
  };

  return (
    <Modal transparent visible={open} animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Sign in with only a wallet?</Text>

          <View style={styles.points}>
            <Text style={styles.point}>
              <Text style={styles.strong}>Your account will be tied to this wallet.</Text> There's no email or password to fall back on.
            </Text>
            <Text style={styles.point}>
              <Text style={styles.strong}>If you lose access to the wallet</Text> (a lost phone, a deleted app, a forgotten recovery phrase) you can't sign in, and the money in
              your Bluvfi wallet stays locked.
            </Text>
            <Text style={styles.point}>
              <Text style={styles.strong}>Bluvfi can't reset or recover it for you.</Text>
            </Text>
          </View>

          <View style={styles.tip}>
            <Text style={styles.tipText}>You can add an email or Google any time in Profile. We recommend doing it right after you sign in.</Text>
          </View>

          <Pressable onPress={() => setUnderstood((u) => !u)} style={styles.checkRow} accessibilityRole="checkbox" accessibilityState={{ checked: understood }}>
            <View style={[styles.box, understood && styles.boxOn]}>{understood ? <Text style={styles.tick}>✓</Text> : null}</View>
            <Text style={styles.checkText}>I understand the risk of using only a wallet</Text>
          </Pressable>

          <Button
            fullWidth
            disabled={!understood}
            onPress={() => {
              setUnderstood(false);
              onContinue();
            }}
          >
            Continue with my wallet
          </Button>
          <Button variant="ghost" fullWidth onPress={close}>
            Use email or Google instead
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xxxl,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  icon: { fontSize: 28, textAlign: 'center' },
  title: { ...Type.h1, color: Colors.tx0, textAlign: 'center' },
  points: { gap: Spacing.sm },
  point: { ...Type.body, color: Colors.tx1 },
  strong: { fontFamily: Fonts.sansSemiBold, color: Colors.tx0 },
  tip: { backgroundColor: 'rgba(143,174,130,0.08)', borderWidth: 1, borderColor: Colors.borderSage, borderRadius: Radii.lg, padding: Spacing.md },
  tipText: { ...Type.small, color: Colors.sage },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xs },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: Colors.tx2, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Colors.blue, borderColor: Colors.blue },
  tick: { color: '#FFFFFF', fontFamily: Fonts.sansBold, fontSize: 14 },
  checkText: { ...Type.body, color: Colors.tx0, flex: 1 },
});
