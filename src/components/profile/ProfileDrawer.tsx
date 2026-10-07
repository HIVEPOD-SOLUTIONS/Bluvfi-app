import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/constants/theme';
import { ProfileContent } from './ProfileContent';

interface ProfileDrawerProps {
  open: boolean;
  onClose: () => void;
  isPremium: boolean;
  onUpgrade: () => void;
}

const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.86, 360);

/** Left-side sidebar (slides in over a dimmed backdrop) with the account details. */
export function ProfileDrawer({ open, onClose, isPremium, onUpgrade }: ProfileDrawerProps) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  // Keep the Modal mounted through the close animation.
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    } else {
      Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [open, progress]);

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      </Animated.View>
      <Animated.View
        style={[
          styles.drawer,
          {
            width: DRAWER_WIDTH,
            paddingTop: insets.top + Spacing.lg,
            paddingBottom: insets.bottom + Spacing.lg,
            transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-DRAWER_WIDTH, 0] }) }],
          },
        ]}
      >
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <ProfileContent isPremium={isPremium} onUpgrade={onUpgrade} onBeforeLogout={onClose} />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: Colors.bg1,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
});
