import Svg, { Path } from 'react-native-svg';

/** The "send" arrow, drawn (not a text arrow: the app's fonts have no ↑ glyph, and it showed up as letters). */
export function SendIcon({ size = 18, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M10 16V4M10 4l-5 5M10 4l5 5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
