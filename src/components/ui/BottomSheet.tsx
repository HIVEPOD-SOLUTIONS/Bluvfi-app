import { ReactNode, useEffect, useMemo, useRef } from 'react';
import { BackHandler, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import GorhomBottomSheet, { BottomSheetBackdrop, BottomSheetScrollView, BottomSheetView } from '@gorhom/bottom-sheet';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  snapPoints?: (string | number)[];
  /** Scroll the content (for long lists) instead of sizing the sheet to it. */
  scrollable?: boolean;
}

function CloseIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
      <Path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke={Colors.tx1} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

export function BottomSheet({ open, onClose, title, children, snapPoints: snapPointsProp, scrollable }: BottomSheetProps) {
  const ref = useRef<GorhomBottomSheet>(null);
  const insets = useSafeAreaInsets();
  const snapPoints = useMemo(() => snapPointsProp ?? ['60%'], [snapPointsProp]);

  useEffect(() => {
    if (open) ref.current?.expand();
    else ref.current?.close();
  }, [open]);

  // Android back button closes the sheet instead of leaving the screen behind it.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      ref.current?.close();
      return true;
    });
    return () => sub.remove();
  }, [open]);

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md }}>
      <Text style={{ ...Type.h1, color: Colors.tx0, flex: 1 }} numberOfLines={1}>
        {title ?? ''}
      </Text>
      <Pressable
        onPress={() => ref.current?.close()}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: Colors.bg2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CloseIcon />
      </Pressable>
    </View>
  );

  return (
    <GorhomBottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      // Keep the sheet (and its close button) clear of the status bar.
      topInset={insets.top}
      enablePanDownToClose
      onClose={onClose}
      keyboardBlurBehavior="restore"
      backgroundStyle={{ backgroundColor: Colors.bg1 }}
      handleIndicatorStyle={{ backgroundColor: 'rgba(167,167,154,0.2)', width: 40 }}
      style={{ borderTopLeftRadius: Radii.xxxl, borderTopRightRadius: Radii.xxxl, overflow: 'hidden' }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
      )}
    >
      {scrollable ? (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: Spacing.xxl, paddingBottom: Spacing.md }}>{header}</View>
          <BottomSheetScrollView
            contentContainerStyle={{ paddingHorizontal: Spacing.xxl, paddingBottom: Spacing.xxl }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </BottomSheetScrollView>
        </View>
      ) : (
        <BottomSheetView style={{ paddingHorizontal: Spacing.xxl, paddingBottom: Spacing.xxl }}>
          <View style={{ marginBottom: Spacing.xs }}>{header}</View>
          {children}
        </BottomSheetView>
      )}
    </GorhomBottomSheet>
  );
}
