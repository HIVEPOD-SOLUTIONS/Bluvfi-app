import { useLocalSearchParams } from 'expo-router';
import { ProviderFormScreen } from '@/components/shar/ProviderFormScreen';

/** Edit one of your own providers: its details, setup, key and contact information, plus pause and remove. */
export default function EditProviderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProviderFormScreen editId={Array.isArray(id) ? id[0] : id} />;
}
