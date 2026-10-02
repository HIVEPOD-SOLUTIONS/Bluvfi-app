import { ReactNode, useEffect, useMemo, useRef } from 'react';
import { Text } from 'react-native';
import GorhomBottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  snapPoints?: (string | number)[];
}

export function BottomSheet({ open, onClose, title, children, snapPoints: snapPointsProp }: BottomSheetProps) {
  const ref = useRef<GorhomBottomSheet>(null);
  const snapPoints = useMemo(() => snapPointsProp ?? ['60%'], [snapPointsProp]);

  useEffect(() => {
    if (open) ref.current?.expand();
    else ref.current?.close();
  }, [open]);

  return (
    <GorhomBottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={{ backgroundColor: Colors.bg1 }}
      handleIndicatorStyle={{ backgroundColor: 'rgba(167,167,154,0.2)', width: 40 }}
      style={{ borderTopLeftRadius: Radii.xxxl, borderTopRightRadius: Radii.xxxl, overflow: 'hidden' }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
      )}
    >
      <BottomSheetView style={{ paddingHorizontal: Spacing.xxl, paddingBottom: Spacing.xxl }}>
        {title && <Text style={{ ...Type.h1, color: Colors.tx0, marginBottom: 4 }}>{title}</Text>}
        {children}
      </BottomSheetView>
    </GorhomBottomSheet>
  );
}
