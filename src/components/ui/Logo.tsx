import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { Colors, Fonts } from '@/constants/theme';

interface LogoProps {
  size?: number;
}

/**
 * Bluvfi brand mark — no source SVG exists (old assets were the previous
 * serif-based brand), so this mirrors the hand-built approximation used in
 * the web re-skin: a stylised "b" in white on a blue rounded square, with a
 * small gold diamond accent near the top-right of the letterform.
 */
export function Logo({ size = 32 }: LogoProps) {
  const r = (size * 0.22 * 100) / size;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect width={100} height={100} rx={r} fill={Colors.blueDeep} />
      <SvgText
        x={46}
        y={64}
        textAnchor="middle"
        fontFamily={Fonts.sansBold}
        fontSize={58}
        fill="#FFFFFF"
      >
        b
      </SvgText>
      <Rect x={64} y={24} width={12} height={12} rx={2} fill={Colors.gold} transform="rotate(45 70 30)" />
    </Svg>
  );
}
