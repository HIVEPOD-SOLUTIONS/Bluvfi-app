import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { SparkWidgetView } from './spark-widget-data';

/**
 * The Daily Spark home-screen widget: the Shar light, the streak, and what to do next. Tapping anywhere opens the Spark screen
 * (bluvfi://spark). Built from the widget library's own primitives: the widget is drawn by Android, not by React Native.
 */
const BG = '#0B0D1A';
const CARD = '#14172B';
const TEXT = '#F4F8FF';
const SOFT = '#9DB8FF';
const MUTED = '#8A90B8';
const LIT = '#7B8BFF';

export function SparkWidget({ view }: { view: SparkWidgetView }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'bluvfi://spark' }}
      accessibilityLabel={`Daily Spark. ${view.headline}. ${view.status}`}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: BG, borderRadius: 22, padding: 14, flexDirection: 'row', alignItems: 'center' }}
    >
      <FlexWidget style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: view.collected ? CARD : LIT, alignItems: 'center', justifyContent: 'center' }}>
        <FlexWidget style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: view.collected ? SOFT : TEXT }} />
      </FlexWidget>
      <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 12 }}>
        <TextWidget text="DAILY SPARK" style={{ fontSize: 11, color: MUTED, letterSpacing: 1.5 }} />
        <TextWidget text={view.empty ? 'Light the way' : view.headline} style={{ fontSize: 20, fontWeight: 'bold', color: TEXT }} maxLines={1} truncate="END" />
        <TextWidget text={view.status} style={{ fontSize: 13, color: view.collected ? SOFT : LIT }} maxLines={1} truncate="END" />
      </FlexWidget>
    </FlexWidget>
  );
}
