import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useCreator } from '@/hooks/use-shar';

/** A screen for provider creators only. Anyone else (or anyone the server can't confirm) is sent Home; while it checks, the screen stays blank. */
export function CreatorOnly({ children }: { children: ReactNode }) {
  const { data, isLoading } = useCreator();
  if (isLoading) return <View style={{ flex: 1, backgroundColor: Colors.bg0 }} />;
  if (data?.creator == null) return <Redirect href="/" />;
  return <>{children}</>;
}
