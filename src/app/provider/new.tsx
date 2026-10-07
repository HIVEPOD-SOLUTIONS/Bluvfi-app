import { useLocalSearchParams } from 'expo-router';
import { ProviderFormScreen } from '@/components/shar/ProviderFormScreen';

/** Add a provider, or remix a verified one (`?remix=<id>`). */
export default function NewProviderScreen() {
  const { remix } = useLocalSearchParams<{ remix?: string }>();
  return <ProviderFormScreen remixId={Array.isArray(remix) ? remix[0] : remix} />;
}
