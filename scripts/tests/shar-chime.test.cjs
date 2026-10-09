/**
 * Shar's sound and light: the sound files, when a phrase plays (creators only, a different one each time, Seekers get their own, never twice
 * in a few seconds, never a crash), and the brighter orb a Seeker gets.
 *
 *     node scripts/tests/shar-chime.test.cjs
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();
const root = path.join(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// ── the sound files
const NAMES = ["shar-1", "shar-2", "shar-3", "shar-4", "shar-seeker-1", "shar-seeker-2"];
const info = NAMES.map((name) => {
  const wav = fs.readFileSync(path.join(root, `assets/sounds/${name}.wav`));
  let peak = 0;
  for (let i = 44; i + 1 < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
  return {
    name,
    size: wav.length,
    valid: wav.toString("ascii", 0, 4) === "RIFF" && wav.toString("ascii", 8, 12) === "WAVE" && wav.readUInt16LE(20) === 1 && wav.readUInt16LE(22) === 1 && wav.readUInt16LE(34) === 16,
    seconds: wav.readUInt32LE(40) / wav.readUInt32LE(28),
    peak,
    hash: crypto.createHash("sha1").update(wav).digest("hex"),
  };
});
check("there are six sounds: four for everyone and two for Seekers", info.length === 6 && info.every((i) => fs.existsSync(path.join(root, `assets/sounds/${i.name}.wav`))));
check("every sound is a real mono 16-bit PCM wav between 1.5 and 3.5 seconds", info.every((i) => i.valid && i.seconds >= 1.5 && i.seconds <= 3.5), info.map((i) => `${i.name} ${i.seconds.toFixed(1)}s`).join(", "));
check("every sound is clearly audible but never harsh (peak between 60% and 90% of full scale)", info.every((i) => i.peak > 0.6 * 32767 && i.peak < 0.9 * 32767), info.map((i) => `${i.name} ${i.peak}`).join(", "));
check("all six are different, so the variety is real", new Set(info.map((i) => i.hash)).size === 6);
check("together they are small enough to ship (under 1.2 MB)", info.reduce((a, i) => a + i.size, 0) < 1.2 * 1024 * 1024);
check("the Seekers' phrases are longer than the shortest everyone phrase (richer, with a pad and a shimmer)", info.filter((i) => i.name.includes("seeker")).every((i) => i.seconds > info[0].seconds));
check("the sounds are made by a script in the repo, so they can be regenerated", fs.existsSync(path.join(root, "scripts/make-shar-chime.cjs")));

// ── when it plays
const SOURCES = { "shar-1": 1, "shar-2": 2, "shar-3": 3, "shar-4": 4, "shar-seeker-1": 5, "shar-seeker-2": 6 };
function load({ withAudio = true, throws = false } = {}) {
  const log = { created: 0, played: 0, sources: [], volume: null, focus: null, creator: false, tier: "spark" };
  const players = new Map();
  const make = (src) => ({
    set volume(v) { log.volume = v; },
    seekTo: () => {},
    play: () => { if (throws) throw new Error("no audio device"); log.played++; log.sources.push(src); },
  });
  const stubs = {
    "expo-router": { useFocusEffect: (cb) => { log.focus = cb; } },
    "react": { useCallback: (fn) => fn },
    "./use-shar": { useIsCreator: () => log.creator, useShar: () => ({ data: { tier: { tier: log.tier } } }) },
  };
  for (const [name, n] of Object.entries(SOURCES)) stubs[`../../assets/sounds/${name}.wav`] = n;
  if (withAudio) stubs["expo-audio"] = { setAudioModeAsync: async () => {}, createAudioPlayer: (src) => { log.created++; const p = make(src); players.set(src, p); return p; } };
  const mod = makeLoader(stubs)("src/hooks/use-shar-chime.ts");
  return { mod, log };
}

{
  const { mod, log } = load();
  check("a person who isn't a Seeker hears one of the four everyone phrases, at a clear volume", mod.playSharChime(1_000_000, false, () => 0) === true && log.sources.length === 1 && log.sources[0] >= 1 && log.sources[0] <= 4 && log.volume === 0.85);
  check("a second request inside the gap does nothing (Home then Shar rings once)", mod.playSharChime(1_000_000 + mod.CHIME_GAP_MS - 1, false, () => 0) === false && log.played === 1);
  const heard = [log.sources[0]];
  for (let k = 1; k <= 30; k++) {
    mod.playSharChime(1_000_000 + k * (mod.CHIME_GAP_MS + 1), false, Math.random);
    heard.push(log.sources[log.sources.length - 1]);
  }
  check("it never plays the same phrase twice in a row, and over a few visits it uses all four", heard.every((s, i) => i === 0 || s !== heard[i - 1]) && new Set(heard).size === 4 && heard.every((s) => s >= 1 && s <= 4), heard.join());
  check("each phrase gets one player, reused afterwards (not a new one every visit)", log.created <= 4 && log.played === heard.length);
}
{
  const { mod, log } = load();
  const heard = [];
  for (let k = 0; k < 12; k++) {
    mod.playSharChime(2_000_000 + k * (mod.CHIME_GAP_MS + 1), true, Math.random);
    heard.push(log.sources[log.sources.length - 1]);
  }
  check("a Seeker hears only their own two phrases, alternating", heard.every((s) => s === 5 || s === 6) && new Set(heard).size === 2 && heard.every((s, i) => i === 0 || s !== heard[i - 1]), heard.join());
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
  check("a creator hears a phrase when a screen comes into focus", again.log.played === 1 && again.log.sources[0] <= 4);
  const seeker = load();
  seeker.log.creator = true;
  seeker.log.tier = "seeker";
  seeker.mod.useSharChime();
  seeker.log.focus();
  check("a creator who is a Seeker hears the Seeker phrases", seeker.log.played === 1 && seeker.log.sources[0] >= 5);
}

// ── where it is wired, and the brighter Seeker light
check("Home, the Shar screen and the open network each ask for the chime", ["src/app/(tabs)/index.tsx", "src/app/(tabs)/shar.tsx", "src/app/(tabs)/network.tsx"].every((f) => read(f).includes("useSharChime()")));
const orb = read("src/components/shar/SharOrb.tsx");
check("the orb is brighter for a Seeker (the top tier), following the signed-in person's tier unless told otherwise", orb.includes("useShar().data?.tier.tier") && orb.includes("bright ?? tier === 'seeker'") && orb.includes("SeekerColors"));
check("a Seeker's orb has a whiter core, a stronger halo with an outer glow, a quicker breath and twinkling sparks", orb.includes("seeker ? SeekerColors.core") && orb.includes("seeker ? SeekerColors.haloInner") && orb.includes("SeekerColors.outerGlow") && orb.includes("seeker ? 1700 : 2400") && orb.includes("sparkStyle"));
const consts = read("src/constants/shar.ts");
check("the Seeker colours are brighter than the normal ones (a whiter core, a stronger halo)", consts.includes("core: '#FFFFFF'") && consts.includes("rgba(214, 228, 255, 0.9)"));

finish();
