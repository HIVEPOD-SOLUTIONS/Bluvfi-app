import { Platform } from 'react-native';
import { clearSnapshot, saveSnapshot, viewFor, type SparkWidgetSnapshot } from './spark-widget-data';
import { SparkWidget } from './SparkWidget';

/**
 * Pushes the latest Daily Spark to the home-screen widget. Called by the app whenever the spark changes. The widget library is a native
 * module: a build made before it was added doesn't contain it, so it is loaded defensively and a missing one just means no widget.
 */
type Lib = typeof import('react-native-android-widget');
let lib: Lib | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  lib = Platform.OS === 'android' ? (require('react-native-android-widget') as Lib) : null;
} catch {
  lib = null;
}

async function refresh(snapshot: SparkWidgetSnapshot | null): Promise<void> {
  if (!lib) return;
  try {
    await lib.requestWidgetUpdate({
      widgetName: 'SparkWidget',
      renderWidget: () => <SparkWidget view={viewFor(snapshot)} />,
    });
  } catch (err) {
    console.warn('[widget] could not update the widget:', err);
  }
}

/** Saves the spark's state and redraws the widget. */
export async function syncSparkWidget(snapshot: SparkWidgetSnapshot): Promise<void> {
  await saveSnapshot(snapshot);
  await refresh(snapshot);
}

/** Wipes the widget on sign-out, so it never shows the last person's streak. */
export async function resetSparkWidget(): Promise<void> {
  await clearSnapshot();
  await refresh(null);
}
