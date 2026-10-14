// The app's entry point. Expo Router's own entry must be imported last; the home-screen widget's handler is registered first so Android can
// draw the widget even when the app isn't open (see src/widgets). The widget library is Android-only and a native module, so a build made
// without it simply has no widget.
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { widgetTaskHandler } = require('./src/widgets/widget-task-handler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (error) {
    console.warn('[widget] not available in this build:', error);
  }
}

require('expo-router/entry');
