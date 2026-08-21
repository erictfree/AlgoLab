// Generates tests/fixtures/test-tone.wav — a short, deliberately rhythmic tone used
// by the live-replacement browser test while music is playing.
//
// Written by hand rather than committed as an opaque binary so the local build stays
// dependency-free and the fixture is reproducible: run `node scripts/make-test-tone.mjs`.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44100;
const SECONDS = 8;
const BPM = 120;

const total = SAMPLE_RATE * SECONDS;
const samples = new Int16Array(total);
const beatSamples = (60 / BPM) * SAMPLE_RATE;

for (let i = 0; i < total; i++) {
  const t = i / SAMPLE_RATE;
  const intoBeat = (i % beatSamples) / SAMPLE_RATE;

  // A decaying 55 Hz kick on every beat gives the onset detector a real rising edge.
  const kick = Math.sin(2 * Math.PI * 55 * t) * Math.exp(-intoBeat * 14);
  // A quiet sustained pad so bass/mid/treble are all non-zero.
  const pad = 0.18 * Math.sin(2 * Math.PI * 220 * t) + 0.08 * Math.sin(2 * Math.PI * 1760 * t);

  samples[i] = Math.max(-1, Math.min(1, kick * 0.7 + pad)) * 0x7fff;
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + samples.byteLength, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16); // PCM chunk size
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
header.writeUInt16LE(2, 32); // block align
header.writeUInt16LE(16, 34); // bits per sample
header.write('data', 36);
header.writeUInt32LE(samples.byteLength, 40);

const dir = fileURLToPath(new URL('../tests/fixtures/', import.meta.url));
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}test-tone.wav`, Buffer.concat([header, Buffer.from(samples.buffer)]));
console.log(`Wrote ${dir}test-tone.wav (${SECONDS}s, ${BPM} BPM)`);
