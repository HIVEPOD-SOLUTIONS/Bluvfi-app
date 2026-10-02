import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, Fonts, Radii } from '@/constants/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'premium' | 'destructive';
export type ButtonSize = 'sm' | 'default' | 'lg';

interface ButtonProps {
  children: ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  iconRight?: ReactNode;
  iconLeft?: ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, { bg: string; border?: string; text: string }> = {
  primary: { bg: Colors.blue, text: '#FFFFFF' },
  secondary: { bg: Colors.sage, text: Colors.bg0 },
  outline: { bg: 'transparent', border: Colors.border, text: Colors.tx0 },
  ghost: { bg: 'transparent', text: Colors.tx1 },
  premium: { bg: Colors.bg1, border: Colors.borderGold, text: Colors.gold },
  destructive: { bg: 'rgba(224,82,82,0.10)', border: 'rgba(224,82,82,0.30)', text: Colors.redAlert },
};

const SIZE_STYLES: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { paddingVertical: 7, paddingHorizontal: 12, fontSize: 12 },
  default: { paddingVertical: 11, paddingHorizontal: 20, fontSize: 14 },
  lg: { paddingVertical: 15, paddingHorizontal: 20, fontSize: 14 },
};

function SparkleIcon({ color }: { color: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 16 16" fill="none">
      <Path d="M8 1l1.2 4.8L14 7l-4.8 1.2L8 13l-1.2-4.8L2 7l4.8-1.2L8 1z" fill={color} />
    </Svg>
  );
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'default',
  fullWidth = false,
  disabled = false,
  loading = false,
  iconRight,
  iconLeft,
}: ButtonProps) {
  const v = VARIANT_STYLES[variant];
  const s = SIZE_STYLES[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: v.bg,
          borderColor: v.border,
          borderWidth: v.border ? 1 : 0,
          paddingVertical: s.paddingVertical,
          paddingHorizontal: s.paddingHorizontal,
          width: fullWidth ? '100%' : undefined,
          opacity: disabled || loading ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <View style={styles.content}>
        {loading && <ActivityIndicator size="small" color={v.text} />}
        {!loading && variant === 'premium' && <SparkleIcon color={v.text} />}
        {!loading && iconLeft}
        {!loading &&
          (typeof children === 'string' ? (
            <Text style={[styles.text, { color: v.text, fontSize: s.fontSize }]}>{children}</Text>
          ) : (
            children
          ))}
        {!loading && iconRight}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  text: {
    fontFamily: Fonts.sansSemiBold,
  },
});
