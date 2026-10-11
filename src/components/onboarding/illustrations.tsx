import Svg, { ClipPath, Defs, G, Image as SvgImage, LinearGradient, RadialGradient, Stop, Rect, Circle, Ellipse, Path, Text as SvgText } from 'react-native-svg';
import { Colors, Fonts } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import { CRYPTO_LOGOS, MERCHANT_LOGOS } from './logos';

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

const VIEWBOX = '0 0 360 300';

type FlagId = 'sg' | 'ng' | 'us' | 'es' | 'vn';

/** Placed along the front arc of the ring (positions are in the ring's rotated frame); USA is the centerpiece. */
const FLAG_BADGES: { id: FlagId; x: number; y: number; r: number }[] = [
  { id: 'sg', x: 65.3, y: 169.5, r: 14 },
  { id: 'ng', x: 114.3, y: 180, r: 17 },
  { id: 'us', x: 180, y: 184, r: 22 },
  { id: 'es', x: 245.7, y: 180, r: 17 },
  { id: 'vn', x: 294.7, y: 169.5, r: 14 },
];

function starPath(cx: number, cy: number, outer: number): string {
  const inner = outer * 0.382;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (-90 + i * 36) * (Math.PI / 180);
    const rad = i % 2 === 0 ? outer : inner;
    pts.push(`${(cx + rad * Math.cos(angle)).toFixed(2)} ${(cy + rad * Math.sin(angle)).toFixed(2)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

/** Simplified flag art (no emblems/fine detail) drawn edge-to-edge; the caller clips it to a circle. */
function FlagArt({ id, x, y, r }: { id: FlagId; x: number; y: number; r: number }) {
  const s = r * 2;
  const l = x - r;
  const t = y - r;

  switch (id) {
    case 'us': {
      const h = s / 7;
      return (
        <>
          <Rect x={l} y={t} width={s} height={s} fill="#FFFFFF" />
          {[0, 2, 4, 6].map((i) => (
            <Rect key={i} x={l} y={t + i * h} width={s} height={h} fill="#B22234" />
          ))}
          <Rect x={l} y={t} width={s * 0.48} height={h * 4} fill="#3C3B6E" />
          {[0, 1, 2].flatMap((row) =>
            [0, 1].map((col) => (
              <Circle
                key={`${row}-${col}`}
                cx={l + s * (0.12 + col * 0.24)}
                cy={t + h * (0.8 + row * 1.2)}
                r={s * 0.04}
                fill="#FFFFFF"
              />
            )),
          )}
        </>
      );
    }
    case 'ng':
      return (
        <>
          <Rect x={l} y={t} width={s / 3} height={s} fill="#008751" />
          <Rect x={l + s / 3} y={t} width={s / 3} height={s} fill="#FFFFFF" />
          <Rect x={l + (2 * s) / 3} y={t} width={s / 3} height={s} fill="#008751" />
        </>
      );
    case 'es':
      return (
        <>
          <Rect x={l} y={t} width={s} height={s * 0.25} fill="#AA151B" />
          <Rect x={l} y={t + s * 0.25} width={s} height={s * 0.5} fill="#F1BF00" />
          <Rect x={l} y={t + s * 0.75} width={s} height={s * 0.25} fill="#AA151B" />
        </>
      );
    case 'vn':
      return (
        <>
          <Rect x={l} y={t} width={s} height={s} fill="#DA251D" />
          <Path d={starPath(x, y + r * 0.05, r * 0.52)} fill="#FFEB00" />
        </>
      );
    case 'sg': {
      const cx = l + s * 0.3;
      const cy = t + s * 0.25;
      return (
        <>
          <Rect x={l} y={t} width={s} height={s / 2} fill="#EF3340" />
          <Rect x={l} y={t + s / 2} width={s} height={s / 2} fill="#FFFFFF" />
          <Circle cx={cx} cy={cy} r={s * 0.15} fill="#FFFFFF" />
          <Circle cx={cx + s * 0.055} cy={cy} r={s * 0.13} fill="#EF3340" />
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (-90 + i * 72) * (Math.PI / 180);
            return (
              <Circle
                key={i}
                cx={cx + s * 0.3 + s * 0.09 * Math.cos(a)}
                cy={cy + s * 0.09 * Math.sin(a)}
                r={s * 0.032}
                fill="#FFFFFF"
              />
            );
          })}
        </>
      );
    }
  }
}

/** Slide 1 — orb with a ring of country-flag badges. */
export function OrbIllustration() {
  return (
    <Svg width="100%" height="100%" viewBox={VIEWBOX} preserveAspectRatio="xMidYMid meet">
      <Defs>
        <RadialGradient id="orb" cx="0.35" cy="0.3" r="0.85">
          <Stop offset="0" stopColor={Colors.tx2} />
          <Stop offset="0.55" stopColor={Colors.bg3} />
          <Stop offset="1" stopColor={Colors.bg0} />
        </RadialGradient>
        <LinearGradient id="ring" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={Colors.tx2} />
          <Stop offset="0.5" stopColor={Colors.tx1} />
          <Stop offset="1" stopColor={Colors.blue} />
        </LinearGradient>
        <LinearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={Colors.blue} stopOpacity="0" />
          <Stop offset="1" stopColor={Colors.blue} stopOpacity="1" />
        </LinearGradient>
        {FLAG_BADGES.map((b) => (
          <ClipPath key={b.id} id={`clip-${b.id}`}>
            <Circle cx={b.x} cy={b.y} r={b.r} />
          </ClipPath>
        ))}
      </Defs>

      <G transform="rotate(-14 180 150)">
        <Path d="M 40 150 A 140 34 0 0 1 320 150" stroke="url(#ring)" strokeWidth={14} fill="none" opacity={0.5} />
      </G>
      <Circle cx={180} cy={150} r={78} fill="url(#orb)" />
      <Circle cx={180} cy={150} r={78} fill="none" stroke="url(#rim)" strokeWidth={2} />
      <G transform="rotate(-14 180 150)">
        <Path d="M 40 150 A 140 34 0 0 0 320 150" stroke="url(#ring)" strokeWidth={14} fill="none" />
        {FLAG_BADGES.map((b) => (
          <G key={b.id}>
            <G clipPath={`url(#clip-${b.id})`}>
              <FlagArt id={b.id} x={b.x} y={b.y} r={b.r} />
            </G>
            <Circle cx={b.x} cy={b.y} r={b.r} fill="none" stroke={Colors.tx0} strokeWidth={1.5} />
          </G>
        ))}
      </G>

      <Arrow x={98} y={68} rot={-18} color={Colors.tx1} scale={1.4} />
      <Arrow x={262} y={62} rot={22} color={Colors.blue} scale={1.3} />
      <Arrow x={96} y={230} rot={-8} color={Colors.tx2} scale={0.9} />
      <Arrow x={288} y={236} rot={14} color={Colors.tx1} scale={1} />
    </Svg>
  );
}

type BadgeSpec = {
  id: string;
  cx: number;
  cy: number;
  r: number;
  source: number;
  bg: string;
  /** Fraction of the circle's diameter the logo box occupies (1 = full-bleed, <1 = padded mark on a plain disc). */
  inset: number;
  preserve: string;
};

const SLICE = 'xMidYMid slice';
const MEET = 'xMidYMid meet';

const TOKEN_BADGES: BadgeSpec[] = (['sol', 'usdc', 'usdt', 'eth', 'btc'] as const).map((k, i) => ({
  id: `tok-${k}`,
  cx: 66 + i * 18,
  cy: 34,
  r: 13,
  source: CRYPTO_LOGOS[k],
  bg: Colors.bg1,
  inset: 1,
  preserve: SLICE,
}));

type Merchant = keyof typeof MERCHANT_LOGOS;

/** Transparent marks sit padded on a plain disc; icons that ship their own background go full-bleed. */
const MERCHANT_STYLE: Record<Merchant, { bg: string; inset: number; preserve: string }> = {
  netflix: { bg: '#000000', inset: 0.72, preserve: MEET },
  spacex: { bg: '#000000', inset: 1, preserve: SLICE },
  tesla: { bg: '#FFFFFF', inset: 0.66, preserve: MEET },
  // The NVIDIA file is the full wordmark; slicing from the left edge shows just the eye mark.
  nvidia: { bg: '#76B900', inset: 1, preserve: 'xMinYMid slice' },
  amazon: { bg: '#FFFFFF', inset: 0.64, preserve: MEET },
  googleplay: { bg: '#FFFFFF', inset: 0.6, preserve: MEET },
  hotels: { bg: '#E5190F', inset: 1, preserve: SLICE },
  doordash: { bg: '#FF3008', inset: 1, preserve: SLICE },
  airbnb: { bg: '#FF385C', inset: 1, preserve: SLICE },
};

function merchantBadge(k: Merchant, cx: number, cy: number, r = 13): BadgeSpec {
  return { id: `mer-${k}`, cx, cy, r, source: MERCHANT_LOGOS[k], ...MERCHANT_STYLE[k] };
}

/** Two labelled groups under the tiles: what you can pay for, and what you can invest in. */
const PAY_GROUP: Merchant[] = ['amazon', 'hotels', 'doordash'];
const INVEST_GROUP: Merchant[] = ['spacex', 'tesla', 'nvidia'];
const GROUP_Y = 236;
const PAY_X = 105;
const INVEST_X = 255;
const groupBadges = (list: Merchant[], centerX: number) =>
  list.map((k, i) => merchantBadge(k, centerX + (i - (list.length - 1) / 2) * 24, GROUP_Y));
const GROUP_BADGES = [...groupBadges(PAY_GROUP, PAY_X), ...groupBadges(INVEST_GROUP, INVEST_X)];

/** Disc + real logo clipped to the circle + a ring that separates overlapping badges. */
function LogoBadge({ spec, clipId }: { spec: BadgeSpec; clipId?: string }) {
  const box = spec.r * 2 * spec.inset;
  return (
    <G>
      <Circle cx={spec.cx} cy={spec.cy} r={spec.r} fill={spec.bg} />
      <G clipPath={`url(#clip-${clipId ?? spec.id})`}>
        <SvgImage
          x={spec.cx - box / 2}
          y={spec.cy - box / 2}
          width={box}
          height={box}
          href={spec.source}
          preserveAspectRatio={spec.preserve}
        />
      </G>
      <Circle cx={spec.cx} cy={spec.cy} r={spec.r} fill="none" stroke={Colors.bg0} strokeWidth={2} />
    </G>
  );
}

/** A USDC gift-card tile. Drawn in local coordinates so the same clip paths serve every tile. */
function GiftTile({ x, y, rot, brand, amount }: { x: number; y: number; rot: number; brand: Merchant; amount: string }) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${rot})`}>
      <Rect x={-62} y={-39} width={124} height={78} rx={14} fill="url(#tile)" />
      <Rect x={-62} y={-39} width={124} height={78} rx={14} fill="none" stroke={Colors.border} strokeWidth={1} />
      <LogoBadge spec={merchantBadge(brand, -36, -13, 16)} clipId="tile-logo" />
      <SvgText x={-50} y={28} fontFamily={Fonts.monoBold} fontSize={19} fill={Colors.tx0}>
        {amount}
      </SvgText>
      <G clipPath="url(#clip-tile-usdc)">
        <SvgImage x={35} y={15} width={18} height={18} href={CRYPTO_LOGOS.usdc} preserveAspectRatio={SLICE} />
      </G>
    </G>
  );
}

/** Slide 2 — USDC gift-card tiles for what you pay for, and the stocks you can invest in. */
export function VouchersIllustration() {
  const clipTargets = [
    ...TOKEN_BADGES,
    ...GROUP_BADGES,
    { id: 'tile-logo', cx: -36, cy: -13, r: 16 },
    { id: 'tile-usdc', cx: 44, cy: 24, r: 9 },
    { id: 'pill-usdc-logo', cx: 266, cy: 34, r: 11 },
  ];
  return (
    <Svg width="100%" height="100%" viewBox={VIEWBOX} preserveAspectRatio="xMidYMid meet">
      <Defs>
        <LinearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={Colors.bg3} />
          <Stop offset="1" stopColor={Colors.bg1} />
        </LinearGradient>
        {clipTargets.map((c) => (
          <ClipPath key={c.id} id={`clip-${c.id}`}>
            <Circle cx={c.cx} cy={c.cy} r={c.r} />
          </ClipPath>
        ))}
      </Defs>

      {TOKEN_BADGES.map((b) => (
        <LogoBadge key={b.id} spec={b} />
      ))}
      <Rect x={248} y={17} width={96} height={34} rx={17} fill={Colors.bg2} stroke={Colors.border} />
      <G clipPath="url(#clip-pill-usdc-logo)">
        <SvgImage x={255} y={23} width={22} height={22} href={CRYPTO_LOGOS.usdc} preserveAspectRatio={SLICE} />
      </G>
      <SvgText x={284} y={39} fontFamily={Fonts.mono} fontSize={13} fill={Colors.tx0}>
        USDC
      </SvgText>

      <GiftTile x={104} y={128} rot={-12} brand="airbnb" amount="$50" />
      <GiftTile x={256} y={128} rot={12} brand="googleplay" amount="$25" />
      <GiftTile x={180} y={146} rot={0} brand="netflix" amount="$15" />

      <Path d="M180 222 V270" stroke={Colors.border} strokeWidth={1} />
      {GROUP_BADGES.map((b) => (
        <LogoBadge key={b.id} spec={b} />
      ))}
      <SvgText x={PAY_X} y={268} textAnchor="middle" fontFamily={Fonts.mono} fontSize={8} letterSpacing={0.96} fill={Colors.tx1}>
        PAY
      </SvgText>
      <SvgText x={INVEST_X} y={268} textAnchor="middle" fontFamily={Fonts.mono} fontSize={8} letterSpacing={0.96} fill={Colors.tx1}>
        INVEST
      </SvgText>
    </Svg>
  );
}

/** Slide 3 — creator providers orbiting an SKR payout. */
export function CreatorIllustration() {
  const nodes = [
    { x: 88, y: 98, r: 22, label: 'API' },
    { x: 272, y: 92, r: 20, label: '{}' },
    { x: 82, y: 218, r: 18, label: '$' },
    { x: 278, y: 214, r: 22, label: 'AI' },
  ];
  return (
    <Svg width="100%" height="100%" viewBox={VIEWBOX} preserveAspectRatio="xMidYMid meet">
      <Defs>
        <RadialGradient id="creator-core" cx="0.35" cy="0.28" r="0.85">
          <Stop offset="0" stopColor={SharColors.core} />
          <Stop offset="0.58" stopColor={SharColors.glow} />
          <Stop offset="1" stopColor={SharColors.deep} />
        </RadialGradient>
        <LinearGradient id="creator-link" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={SharColors.glow} stopOpacity="0.95" />
          <Stop offset="1" stopColor={Colors.blue} stopOpacity="0.55" />
        </LinearGradient>
      </Defs>

      <Ellipse cx={180} cy={156} rx={126} ry={82} fill="none" stroke={SharColors.tintBorder} strokeWidth={2} strokeDasharray="5 8" />
      <Ellipse cx={180} cy={156} rx={92} ry={118} fill="none" stroke={Colors.border} strokeWidth={1.5} transform="rotate(32 180 156)" />
      {nodes.map((n) => (
        <Path key={`line-${n.label}`} d={`M180 156 L${n.x} ${n.y}`} stroke="url(#creator-link)" strokeWidth={2.5} strokeLinecap="round" opacity={0.75} />
      ))}

      <Circle cx={180} cy={156} r={64} fill="url(#creator-core)" />
      <Circle cx={180} cy={156} r={64} fill="none" stroke={SharColors.haloInner} strokeOpacity={0.7} strokeWidth={2} />
      <SvgText x={180} y={151} textAnchor="middle" fontFamily={Fonts.monoBold} fontSize={28} fill={Colors.tx0}>
        SKR
      </SvgText>
      <SvgText x={180} y={176} textAnchor="middle" fontFamily={Fonts.sansRegular} fontSize={12} fill={Colors.tx0} opacity={0.85}>
        creator payouts
      </SvgText>

      {nodes.map((n) => (
        <G key={n.label}>
          <Circle cx={n.x} cy={n.y} r={n.r + 8} fill={SharColors.tint} opacity={0.8} />
          <Circle cx={n.x} cy={n.y} r={n.r} fill={Colors.bg1} stroke={SharColors.tintBorder} strokeWidth={2} />
          <SvgText x={n.x} y={n.y + 5} textAnchor="middle" fontFamily={Fonts.monoBold} fontSize={n.label.length > 2 ? 12 : 15} fill={Colors.tx0}>
            {n.label}
          </SvgText>
        </G>
      ))}

      <Path d="M122 48 C146 28 214 28 238 48" stroke={SharColors.glow} strokeWidth={4} strokeLinecap="round" opacity={0.65} />
      <Path d="M122 264 C146 284 214 284 238 264" stroke={Colors.blue} strokeWidth={4} strokeLinecap="round" opacity={0.55} />
      <Arrow x={63} y={154} rot={-90} color={SharColors.glow} scale={0.95} />
      <Arrow x={297} y={154} rot={90} color={Colors.blue} scale={0.95} />
    </Svg>
  );
}

/** Slide 4 — concentric arcs around a shield. */
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
          <Stop offset="0" stopColor={Colors.bg3} />
          <Stop offset="0.7" stopColor={Colors.bg1} />
          <Stop offset="1" stopColor={Colors.blue} stopOpacity="0.8" />
        </LinearGradient>
        <RadialGradient id="core" cx="0.35" cy="0.3" r="0.9">
          <Stop offset="0" stopColor={Colors.blue} />
          <Stop offset="1" stopColor={Colors.blueDeep} />
        </RadialGradient>
      </Defs>

      <Rect x={96} y={22} width={168} height={34} rx={17} fill={Colors.bg2} stroke={Colors.border} />
      <SvgText x={180} y={44} textAnchor="middle" fontFamily={Fonts.sansRegular} fontSize={12} fill={Colors.tx0}>
        Your keys · Your funds
      </SvgText>

      <Ellipse
        cx={180}
        cy={252}
        rx={128}
        ry={42}
        fill="none"
        stroke={Colors.tx1}
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

      <Circle cx={180} cy={252} r={34} fill="url(#core)" stroke={Colors.border} strokeWidth={1} />
      <Path
        d="M180 235 L196 241 V253 C196 262 189 268 180 272 C171 268 164 262 164 253 V241 Z"
        stroke={Colors.tx0}
        strokeWidth={2.5}
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M172 253 L178 259 L190 246" stroke={Colors.tx0} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />

      <Arrow x={58} y={168} rot={-28} color={Colors.blue} scale={1.3} />
      <Arrow x={300} y={124} rot={36} color={Colors.tx1} scale={1.2} />
    </Svg>
  );
}
