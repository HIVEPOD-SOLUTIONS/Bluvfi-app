import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { SparkWidget } from './SparkWidget';
import { loadSnapshot, viewFor } from './spark-widget-data';

/**
 * Android calls this when the widget is added, resized, refreshed on its schedule (about every 30 minutes) or tapped. It draws the
 * widget from the saved snapshot and today's date, so it needs no network and no sign-in. Taps open the app (the widget's own click
 * action), so there is nothing to handle here for them.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetInfo.widgetName !== 'SparkWidget') return;
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(<SparkWidget view={viewFor(await loadSnapshot())} />);
      break;
    default:
      break;
  }
}
