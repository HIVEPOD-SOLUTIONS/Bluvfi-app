/**
 * Makes assets/sounds/shar-chime.wav: the soft "light" chime Shar plays when a creator opens a screen it lives on.
 * Three bell-like notes (E5, B5, E6) rising a fifth then an octave, each a pure tone with a quiet octave overtone and a long, smooth fade,
 * so it reads as a shimmer rather than a beep. Mono, 22.05 kHz, 16-bit, about 1.6 seconds.
 *
 *     node scripts/make-shar-chime.cjs
 */
const fs = require("fs");
const path = require("path");

const RATE = 22050;
const SECONDS = 1.6;
const samples = new Float32Array(Math.floor(RATE * SECONDS));

// [start (s), frequency (Hz), gain]
const NOTES = [
  [0.0, 659.25, 0.5],
  [0.16, 987.77, 0.42],
  [0.34, 1318.51, 0.36],
];

for (const [start, freq, gain] of NOTES) {
  const from = Math.floor(start * RATE);
  for (let i = from; i < samples.length; i++) {
    const t = (i - from) / RATE;
    const attack = Math.min(1, t / 0.012); // no click at the start
    const decay = Math.exp(-t * 3.2); // long, smooth fade
    const tone = Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(2 * Math.PI * freq * 2 * t) * Math.exp(-t * 6);
    samples[i] += gain * attack * decay * tone;
  }
}

// Normalise to a gentle peak so it never startles, and fade the very end to silence.
let peak = 0;
for (const s of samples) peak = Math.max(peak, Math.abs(s));
const scale = 0.55 / peak;
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
const tail = Math.floor(RATE * 0.15);
samples.forEach((s, i) => {
  const fade = i > samples.length - tail ? (samples.length - i) / tail : 1;
  out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * scale * fade)) * 32767), 44 + i * 2);
});

const target = path.join(__dirname, "..", "assets", "sounds", "shar-chime.wav");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, out);
console.log(`wrote ${path.relative(process.cwd(), target)} (${out.length} bytes)`);
