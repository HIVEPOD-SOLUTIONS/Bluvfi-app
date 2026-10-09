/**
 * Makes the Shar sounds in assets/sounds: the light's voice, played when a creator opens a screen it lives on.
 *
 * Six short phrases, so it never gets stale: four for everyone (shar-1 .. shar-4) and two richer ones for Seekers (shar-seeker-1, -2). Each is
 * built from bell-like notes in D major pentatonic (it can't clash with itself or with whatever else is playing), with a soft sparkle on top
 * and a small room reverb so it blooms and then fades, about two seconds long. Mono, 32 kHz, 16-bit.
 *
 *     node scripts/make-shar-chime.cjs
 */
const fs = require("fs");
const path = require("path");

const RATE = 32000;
const OUT = path.join(__dirname, "..", "assets", "sounds");

// D major pentatonic (D E F# A B), in Hz.
const N = {
  D4: 293.66, A4: 440.0, D5: 587.33, E5: 659.25, Fs5: 739.99, A5: 880.0, B5: 987.77,
  D6: 1174.66, E6: 1318.51, Fs6: 1479.98, A6: 1760.0, B6: 1975.53, D7: 2349.32,
};

// A small seeded random, so every build of the files is identical.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** One bell-like note: a pure tone plus a few quieter overtones that die away faster, with a soft attack. */
function bell(buf, start, freq, gain, length = 1.6) {
  const partials = [
    [1.0, 1.0, 3.0],
    [2.0, 0.38, 4.6],
    [3.01, 0.2, 6.5],
    [4.16, 0.09, 9.0],
  ];
  const from = Math.floor(start * RATE);
  const count = Math.min(buf.length - from, Math.floor(length * RATE));
  for (let i = 0; i < count; i++) {
    const t = i / RATE;
    const attack = Math.min(1, t / 0.006);
    let v = 0;
    for (const [ratio, amp, decay] of partials) v += amp * Math.exp(-t * decay) * Math.sin(2 * Math.PI * freq * ratio * t);
    buf[from + i] += gain * attack * v;
  }
}

/** A soft, slow pad under the notes: two sines a fifth apart that swell and fade. */
function pad(buf, start, freq, gain, length) {
  const from = Math.floor(start * RATE);
  const count = Math.min(buf.length - from, Math.floor(length * RATE));
  for (let i = 0; i < count; i++) {
    const t = i / RATE;
    const env = Math.sin((Math.PI * i) / count) ** 2;
    buf[from + i] += gain * env * (Math.sin(2 * Math.PI * freq * t) + 0.6 * Math.sin(2 * Math.PI * freq * 1.5 * t));
  }
}

/** A handful of tiny high notes scattered over a stretch of time: the light shimmering. */
function sparkle(buf, start, span, count, seed, gain) {
  const r = rng(seed);
  const high = [N.A6, N.B6, N.D7, N.Fs6, N.E6];
  for (let k = 0; k < count; k++) bell(buf, start + r() * span, high[Math.floor(r() * high.length)], gain * (0.5 + r() * 0.5), 0.7);
}

/** A small room: four parallel feedback combs into two all-passes (the classic Schroeder reverb), mixed under the dry sound. */
function room(dry, wet = 0.3) {
  const scale = RATE / 44100;
  const combs = [[1116, 0.805], [1188, 0.795], [1277, 0.785], [1356, 0.775]].map(([d, g]) => ({ d: Math.round(d * scale), g, b: new Float32Array(Math.round(d * scale)), i: 0 }));
  const aps = [[556, 0.5], [441, 0.5]].map(([d, g]) => ({ d: Math.round(d * scale), g, b: new Float32Array(Math.round(d * scale)), i: 0 }));
  const out = new Float32Array(dry.length);
  for (let n = 0; n < dry.length; n++) {
    const x = dry[n];
    let y = 0;
    for (const c of combs) {
      const d = c.b[c.i];
      y += d;
      c.b[c.i] = x + d * c.g;
      c.i = (c.i + 1) % c.d;
    }
    y /= combs.length;
    for (const a of aps) {
      const d = a.b[a.i];
      const v = y + d * -a.g;
      a.b[a.i] = y + d * a.g;
      y = d + v * a.g;
      a.i = (a.i + 1) % a.d;
    }
    out[n] = x * (1 - wet * 0.5) + y * wet * 1.6;
  }
  return out;
}

function wav(samples) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const scale = 0.85 / peak;
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + samples.length * 2, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(1, 22); // mono
  out.writeUInt32LE(RATE, 24);
  out.writeUInt32LE(RATE * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(samples.length * 2, 40);
  const tail = Math.floor(RATE * 0.25);
  for (let i = 0; i < samples.length; i++) {
    const fade = i > samples.length - tail ? (samples.length - i) / tail : 1;
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * scale * fade)) * 32767), 44 + i * 2);
  }
  return out;
}

// Each phrase: [note start in seconds, note, gain], plus optional extras. The last note ends the "dry" part; the room adds the tail.
const PHRASES = {
  // a bright climb, like a light rising
  "shar-1": { notes: [[0, N.D5, 0.5], [0.1, N.A5, 0.46], [0.2, N.D6, 0.44], [0.33, N.Fs6, 0.42]], sparkle: [0.3, 0.8, 5, 11, 0.1] },
  // a question and its answer
  "shar-2": { notes: [[0, N.A5, 0.46], [0.16, N.Fs5, 0.42], [0.34, N.A5, 0.46], [0.5, N.D6, 0.5], [0.64, N.B5, 0.4]], sparkle: [0.5, 0.8, 4, 23, 0.09] },
  // a chord blooming open, then a single high spark
  "shar-3": { notes: [[0, N.D5, 0.42], [0.02, N.A5, 0.4], [0.04, N.Fs6, 0.34], [0.5, N.A6, 0.34]], pad: [0, N.D4, 0.12, 1.4], sparkle: [0.45, 0.9, 5, 37, 0.08] },
  // a gentle fall, like light settling
  "shar-4": { notes: [[0, N.Fs6, 0.4], [0.12, N.D6, 0.42], [0.26, N.A5, 0.44], [0.42, N.Fs5, 0.44], [0.6, N.D5, 0.48]], pad: [0.3, N.D4, 0.1, 1.3], sparkle: [0.1, 0.7, 4, 41, 0.08] },
  // Seeker: the climb, longer, with a warm pad and a burst of shimmer
  "shar-seeker-1": { notes: [[0, N.D5, 0.5], [0.1, N.A5, 0.46], [0.2, N.D6, 0.46], [0.3, N.Fs6, 0.44], [0.42, N.A6, 0.42], [0.58, N.D7, 0.32]], pad: [0, N.D4, 0.14, 1.6], sparkle: [0.4, 1.2, 10, 53, 0.11] },
  // Seeker: a wide chord, an answering melody, and a long shimmer
  "shar-seeker-2": { notes: [[0, N.D5, 0.44], [0.02, N.A5, 0.4], [0.04, N.D6, 0.36], [0.06, N.Fs6, 0.3], [0.36, N.E6, 0.4], [0.5, N.Fs6, 0.42], [0.66, N.A6, 0.46], [0.86, N.D7, 0.34]], pad: [0, N.D4, 0.14, 1.8], sparkle: [0.6, 1.3, 12, 67, 0.11] },
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, p] of Object.entries(PHRASES)) {
  const last = Math.max(...p.notes.map((n) => n[0]), p.pad ? p.pad[0] + p.pad[3] : 0, p.sparkle ? p.sparkle[0] + p.sparkle[1] : 0);
  const buf = new Float32Array(Math.floor(RATE * (last + 0.9)));
  for (const [start, freq, gain] of p.notes) bell(buf, start, freq, gain);
  if (p.pad) pad(buf, p.pad[0], p.pad[1], p.pad[2], p.pad[3]);
  if (p.sparkle) sparkle(buf, p.sparkle[0], p.sparkle[1], p.sparkle[2], p.sparkle[3], p.sparkle[4]);
  const file = path.join(OUT, `${name}.wav`);
  const bytes = wav(room(buf));
  fs.writeFileSync(file, bytes);
  console.log(`wrote ${path.relative(process.cwd(), file)} (${bytes.length} bytes, ${((bytes.length - 44) / 2 / RATE).toFixed(1)}s)`);
}
