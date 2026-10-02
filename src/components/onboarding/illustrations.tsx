import Svg, { Defs, G, LinearGradient, RadialGradient, Stop, Rect, Circle, Ellipse, Path, Text as SvgText } from 'react-native-svg';
import { Colors, Fonts } from '@/constants/theme';

/**
 * Simplified, gradient-shaded SVG stand-ins for the 3D renders in the
 * reference onboarding (planet + ring, card, signal arcs) — same
 * composition and depth cues, drawn in Bluvfi's palette. Each fills its
 * container and scales via viewBox.
 */

function Arrow({ x, y, rot, color, scale = 1 }: { x: number; y: number; rot: number; color: string; scale?: number }) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${rot}) scale(${scale})`}>
      <Path d="M0 -11 L10 10 L0 5 L-10 10 Z" fill={color} stroke={color} strokeWidth={3} strokeLinejoin="round" />
    </G>
  );
}

function Diamond({ x, y, size = 10 }: { x: number; y: number; size?: number }) {
  return (
    <Rect
      x={x - size / 2}
      y={y - size / 2}
      width={size}
      height={size}
      rx={2}
      fill={Colors.gold}
      transform={`rotate(45 ${x} ${y})`}
    />
  );
}

const VIEWBOX = '0 0 360 300';

/** Slide 1 — orb with a ring and floating badges. */
export function OrbIllustration() {
  const badges = [
    { x: 250, y: 179.4, r: 11, fill: Colors.blue, glyph: '$' },
    { x: 180, y: 184, r: 14, fill: Colors.sage, glyph: 'b' },
    { x: 110, y: 179.4, r: 11, fill: Colors.gold, glyph: '◆' },
  ];
  return (
    <Svg width="100%" height="100%" viewBox={VIEWBOX} preserveAspectRatio="xMidYMid meet">
      <Defs>
        <RadialGradient id="orb" cx="0.35" cy="0.3" r="0.85">
          <Stop offset="0" stopColor="#5A5B55" />
          <Stop offset="0.55" stopColor="#2A2B27" />
          <Stop offset="1" stopColor="#0F100D" />
        </RadialGradient>
        <LinearGradient id="ring" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#6B6B62" />
          <Stop offset="0.5" stopColor="#A7A79A" />
          <Stop offset="1" stopColor="#0A0AE8" />
        </LinearGradient>
        <LinearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#0A0AE8" stopOpacity="0" />
          <Stop offset="1" stopColor="#4D4DFF" stopOpacity="0.9" />
        </LinearGradient>
      </Defs>

      <G transform="rotate(-14 180 150)">
        <Path d="M 40 150 A 140 34 0 0 1 320 150" stroke="url(#ring)" strokeWidth={14} fill="none" opacity={0.5} />
      </G>
      <Circle cx={180} cy={150} r={78} fill="url(#orb)" />
      <Circle cx={180} cy={150} r={78} fill="none" stroke="url(#rim)" strokeWidth={2} />
      <G transform="rotate(-14 180 150)">
        <Path d="M 40 150 A 140 34 0 0 0 320 150" stroke="url(#ring)" strokeWidth={14} fill="none" />
        {badges.map((b) => (
          <G key={b.glyph}>
            <Circle cx={b.x} cy={b.y} r={b.r} fill={b.fill} stroke="#F2F0E8" strokeWidth={1.5} />
            <SvgText
              x={b.x}
              y={b.y + b.r * 0.38}
              textAnchor="middle"
              fontFamily={Fonts.sansBold}
              fontSize={b.r * 1.05}
              fill="#FFFFFF"
            >
              {b.glyph}
            </SvgText>
          </G>
        ))}
      </G>

      <Arrow x={98} y={68} rot={-18} color={Colors.sage} scale={1.4} />
      <Arrow x={262} y={62} rot={22} color={Colors.blue} scale={1.3} />
      <Arrow x={96} y={230} rot={-8} color={Colors.gold} scale={0.9} />
      <Arrow x={288} y={236} rot={14} color={Colors.tx1} scale={1} />
      <Diamond x={232} y={92} size={9} />
    </Svg>
  );
}

/** Slide 2 — a payment card with token badges and floating pills. */
export function CardIllustration() {
  const tokens = [
    { fill: Colors.blue, glyph: '$' },
    { fill: Colors.sage, glyph: 'T' },
    { fill: Colors.gold, glyph: 'S' },
    { fill: Colors.tx1, glyph: 'E' },
    { fill: Colors.blueDeep, glyph: 'B' },
  ];
  return (
    <Svg width="100%" height="100%" viewBox={VIEWBOX} preserveAspectRatio="xMidYMid meet">
      <Defs>
        <LinearGradient id="card" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4A4B45" />
          <Stop offset="0.62" stopColor="#1B1C19" />
          <Stop offset="0.62" stopColor="#1C1CCB" />
          <Stop offset="1" stopColor="#0000CC" />
        </LinearGradient>
      </Defs>

      <Rect x={55} y={82} width={250} height={156} rx={18} fill="url(#card)" />
      <Rect x={55} y={82} width={250} height={156} rx={18} fill="none" stroke="rgba(242,240,232,0.14)" strokeWidth={1} />
      <Rect x={75} y={116} width={44} height={34} rx={8} fill="#0F100D" opacity={0.85} />
      <Rect x={75} y={168} width={52} height={6} rx={3} fill="#0F100D" opacity={0.8} />
      <Rect x={75} y={182} width={112} height={9} rx={4} fill="#0F100D" opacity={0.8} />
      <SvgText x={262} y={216} textAnchor="middle" fontFamily={Fonts.sansBold} fontSize={38} fill="#FFFFFF">
        b
      </SvgText>
      <Diamond x={279} y={192} size={9} />

      {tokens.map((t, i) => (
        <G key={t.glyph}>
          <Circle cx={66 + i * 18} cy={58} r={13} fill={t.fill} stroke="#0F100D" strokeWidth={2} />
          <SvgText
            x={66 + i * 18}
            y={62.5}
            textAnchor="middle"
            fontFamily={Fonts.sansBold}
            fontSize={12}
            fill="#FFFFFF"
          >
            {t.glyph}
          </SvgText>
        </G>
      ))}

      <Rect x={248} y={40} width={92} height={34} rx={17} fill="rgba(167,167,154,0.22)" stroke="rgba(242,240,232,0.28)" />
      <SvgText x={294} y={62} textAnchor="middle" fontFamily={Fonts.mono} fontSize={13} fill="#F2F0E8">
        USDC
      </SvgText>
      <Rect x={22} y={208} width={88} height={32} rx={16} fill="rgba(167,167,154,0.22)" stroke="rgba(242,240,232,0.28)" />
      <SvgText x={66} y={229} textAnchor="middle" fontFamily={Fonts.mono} fontSize={13} fill="#F2F0E8">
        SOL
      </SvgText>
    </Svg>
  );
}

/** Slide 3 — concentric arcs around a shield. */
export function ShieldIllustration() {
  const arcs = [
    { r: 150, w: 30, sx: 57.1, sy: 143.9, ex: 302.9 },
    { r: 105, w: 26, sx: 94, sy: 169.7, ex: 266 },
    { r: 62, w: 22, sx: 129.2, sy: 194.4, ex: 230.8 },
  ];
  return (
    <Svg width="100%" height="100%" viewBox={VIEWBOX} preserveAspectRatio="xMidYMid meet">
      <Defs>
        <LinearGradient id="arc" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#4A4B45" />
          <Stop offset="0.7" stopColor="#1B1C19" />
          <Stop offset="1" stopColor="#0A0AE8" stopOpacity="0.8" />
        </LinearGradient>
        <RadialGradient id="core" cx="0.35" cy="0.3" r="0.9">
          <Stop offset="0" stopColor="#4D4DFF" />
          <Stop offset="1" stopColor="#0000CC" />
        </RadialGradient>
      </Defs>

      <Rect x={96} y={22} width={168} height={34} rx={17} fill="rgba(167,167,154,0.2)" stroke="rgba(242,240,232,0.25)" />
      <SvgText x={180} y={44} textAnchor="middle" fontFamily={Fonts.sansRegular} fontSize={12} fill="#F2F0E8">
        Your keys · Your funds
      </SvgText>

      <Ellipse
        cx={180}
        cy={252}
        rx={128}
        ry={42}
        fill="none"
        stroke="#A7A79A"
        strokeOpacity={0.5}
        strokeDasharray="2 5"
        transform="rotate(-18 180 252)"
      />

      {arcs.map((a) => (
        <Path
          key={a.r}
          d={`M ${a.sx} ${a.sy} A ${a.r} ${a.r} 0 0 1 ${a.ex} ${a.sy}`}
          stroke="url(#arc)"
          strokeWidth={a.w}
          fill="none"
        />
      ))}

      <Circle cx={180} cy={252} r={34} fill="url(#core)" stroke="rgba(242,240,232,0.25)" strokeWidth={1} />
      <Path
        d="M180 235 L196 241 V253 C196 262 189 268 180 272 C171 268 164 262 164 253 V241 Z"
        stroke="#FFFFFF"
        strokeWidth={2.5}
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M172 253 L178 259 L190 246" stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />

      <Arrow x={58} y={168} rot={-28} color={Colors.sage} scale={1.3} />
      <Arrow x={300} y={124} rot={36} color={Colors.gold} scale={1.2} />
      <Diamond x={120} y={100} size={9} />
    </Svg>
  );
}
