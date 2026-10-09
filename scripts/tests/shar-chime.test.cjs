/**
 * Shar's sound and light: the chime file, when it plays (creators only, never twice in a few seconds, never a crash), and the brighter
 * orb a Seeker gets.
 *
 *     node scripts/tests/shar-chime.test.cjs
 */
const fs = require("fs");
const path = require("path");
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();
const root = path.join(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// ── the sound file
const wav = fs.readFileSync(path.join(root, "assets/sounds/shar-chime.wav"));
const seconds = wav.readUInt32LE(40) / (wav.readUInt32LE(28) || 1);
let peak = 0;
for (let i = 44; i + 1 < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
check("the chime is a real mono 16-bit PCM wav, between one and three seconds", wav.toString("ascii", 0, 4) === "RIFF" && wav.toString("ascii", 8, 12) === "WAVE" && wav.readUInt16LE(20) === 1 && wav.readUInt16LE(22) === 1 && wav.readUInt16LE(34) === 16 && seconds >= 1 && seconds <= 3, `${seconds}s`);
check("the chime is gentle (peak well under full scale) and not silent", peak > 20000 && peak < 30000, String(peak));
check("the file is small enough to ship in the app (under 200 KB)", wav.length < 200 * 1024);
check("the chime is made by a script in the repo, so it can be regenerated", fs.existsSync(path.join(root, "scripts/make-shar-chime.cjs")));

// ── when it plays
function load({ withAudio = true, throws = false } = {}) {
  const log = { created: 0, played: 0, seeks: [], volume: null, focus: null };
  const player = {
    set volume(v) { log.volume = v; },
    seekTo: (s) => log.seeks.push(s),
    play: () => { if (throws) throw new Error("no audio device"); log.played++; },
  };
  const stubs = {
    "expo-router": { useFocusEffect: (cb) => { log.focus = cb; } },
    "react": { useCallback: (fn) => fn },
    "./use-shar": { useIsCreator: () => log.creator },
    "../../assets/sounds/shar-chime.wav": 7,
  };
  if (withAudio) stubs["expo-audio"] = { setAudioModeAsync: async () => {}, createAudioPlayer: (src) => { log.created++; log.source = src; return player; } };
  const mod = makeLoader(stubs)("src/hooks/use-shar-chime.ts");
  return { mod, log };
}

{
  const { mod, log } = load();
  check("playing the chime makes the player once, from the bundled file, at a soft volume, from the start", mod.playSharChime(1_000_000) === true && log.created === 1 && log.source === 7 && log.volume === 0.8 && log.seeks[0] === 0 && log.played === 1);
  check("a second request inside the gap does nothing (Home then Shar rings once)", mod.playSharChime(1_000_000 + mod.CHIME_GAP_MS - 1) === false && log.played === 1);
  check("after the gap it rings again, reusing the same player", mod.playSharChime(1_000_000 + mod.CHIME_GAP_MS) === true && log.played === 2 && log.created === 1);
}
{
  const { mod } = load({ withAudio: false });
  check("without the native audio module (an older dev build) it stays silent and never throws", mod.playSharChime(5_000_000) === false);
}
{
  const { mod, log } = load({ throws: true });
  check("a player that fails to play is swallowed, not a crash", mod.playSharChime(9_000_000) === false && log.played === 0);
}
{
  const { mod, log } = load();
  log.creator = false;
  mod.useSharChime();
  log.focus();
  check("a person who is not a creator hears nothing when a screen comes into focus", log.played === 0);
  const again = load();
  again.log.creator = true;
  again.mod.useSharChime();
  again.log.focus();
  check("a creator hears the chime when a screen comes into focus", again.log.played === 1);
}

// ── where it is wired, and the brighter Seeker light
check("Home, the Shar screen and the open network each ask for the chime", ["src/app/(tabs)/index.tsx", "src/app/(tabs)/shar.tsx", "src/app/(tabs)/network.tsx"].every((f) => read(f).includes("useSharChime()")));
const orb = read("src/components/shar/SharOrb.tsx");
check("the orb is brighter for a Seeker (the top tier), following the signed-in person's tier unless told otherwise", orb.includes("useShar().data?.tier.tier") && orb.includes("bright ?? tier === 'seeker'") && orb.includes("SeekerColors"));
check("a Seeker's orb has a whiter core, a stronger halo with an outer glow, a quicker breath and twinkling sparks", orb.includes("seeker ? SeekerColors.core") && orb.includes("seeker ? SeekerColors.haloInner") && orb.includes("SeekerColors.outerGlow") && orb.includes("seeker ? 1700 : 2400") && orb.includes("sparkStyle"));
const consts = read("src/constants/shar.ts");
check("the Seeker colours are brighter than the normal ones (a whiter core, a stronger halo)", consts.includes("core: '#FFFFFF'") && consts.includes("rgba(214, 228, 255, 0.9)"));

finish();
