import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaywallSheet } from '@/components/paywall/PaywallSheet';
import { ProfileContent, usePremium } from '@/components/profile/ProfileContent';
import { Colors, Spacing } from '@/constants/theme';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { isPremium, setIsPremium } = usePremium();
  const [paywallOpen, setPaywallOpen] = useState(false);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg }]}>
      <ProfileContent isPremium={isPremium} onUpgrade={() => setPaywallOpen(true)} />

      <PaywallSheet
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onPurchased={() => setIsPremium(true)}
        featureName="Bluvfi Premium"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg0,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
});
