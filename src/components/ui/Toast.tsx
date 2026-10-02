import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';

export type ToastVariant = 'success' | 'error' | 'premium';

interface ToastItem {
  id: number;
  variant: ToastVariant;
  title: string;
  subtitle?: string;
  opacity: Animated.Value;
}

interface ToastInput {
  variant: ToastVariant;
  title: string;
  subtitle?: string;
  durationMs?: number;
}

const ToastContext = createContext<((input: ToastInput) => void) | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

function CheckIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path d="M3 8.5l3 3 7-7" stroke={Colors.sage} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function CrossIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path d="M4 4l8 8M12 4l-8 8" stroke={Colors.redAlert} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}
function SparkleIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path d="M8 1l1.2 4.8L14 7l-4.8 1.2L8 13l-1.2-4.8L2 7l4.8-1.2L8 1z" fill={Colors.gold} />
    </Svg>
  );
}

const ICONS: Record<ToastVariant, () => React.JSX.Element> = {
  success: CheckIcon,
  error: CrossIcon,
  premium: SparkleIcon,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const insets = useSafeAreaInsets();

  const toast = useCallback((input: ToastInput) => {
    const id = ++idRef.current;
    const opacity = new Animated.Value(0);
    setItems((prev) => [...prev, { id, variant: input.variant, title: input.title, subtitle: input.subtitle, opacity }]);
    Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();

    const duration = input.durationMs ?? 4000;
    setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      });
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <View pointerEvents="none" style={[styles.container, { top: insets.top + 12 }]}>
        {items.map((item) => {
          const Icon = ICONS[item.variant];
          return (
            <Animated.View
              key={item.id}
              style={[
                styles.toast,
                { opacity: item.opacity, transform: [{ translateY: item.opacity.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] },
              ]}
            >
              <Icon />
              <View style={styles.textWrap}>
                <Text style={styles.title}>{item.title}</Text>
                {item.subtitle && <Text style={styles.subtitle}>{item.subtitle}</Text>}
              </View>
            </Animated.View>
          );
        })}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
    zIndex: 90,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    width: '92%',
    maxWidth: 400,
    backgroundColor: Colors.bg1,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    ...Type.h3,
    color: Colors.tx0,
  },
  subtitle: {
    ...Type.body,
    color: Colors.tx1,
    marginTop: 2,
  },
});
