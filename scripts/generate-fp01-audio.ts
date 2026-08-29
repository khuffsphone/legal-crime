#!/usr/bin/env -S npx vite-node --script
/**
 * Deterministic FP-01 audio repair pack.
 *
 * These original procedural one-shots keep the first-ten-minute build audible without a vendor
 * credential. They are intentionally written to the final runtime filenames, so a later selected
 * ElevenLabs master can replace one file without changing a trigger or catalog key.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { synthSamples, type SynthKey } from '../src/scenes/audioSynth';

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;

interface Track {
  left: Float32Array;
  right: Float32Array;
}

interface OutputSpec {
  file: string;
  build: () => Track;
}

function seconds(value: number): number {
  return Math.max(1, Math.round(value * SAMPLE_RATE));
}

function empty(durationSeconds: number): Track {
  const length = seconds(durationSeconds);
  return { left: new Float32Array(length), right: new Float32Array(length) };
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function mixSample(track: Track, index: number, sample: number, pan = 0): void {
  if (index < 0 || index >= track.left.length) return;
  const clampedPan = Math.max(-1, Math.min(1, pan));
  track.left[index] += sample * (1 - Math.max(0, clampedPan) * 0.55);
  track.right[index] += sample * (1 + Math.min(0, clampedPan) * 0.55);
}

function addTone(
  track: Track,
  startSeconds: number,
  durationSeconds: number,
  startHz: number,
  endHz: number,
  gain: number,
  decaySeconds: number,
  pan = 0,
  attackSeconds = 0.003,
): void {
  const start = seconds(startSeconds);
  const length = seconds(durationSeconds);
  const attack = Math.max(1, seconds(attackSeconds));
  let phase = 0;
  for (let offset = 0; offset < length; offset += 1) {
    const progress = offset / Math.max(1, length - 1);
    const hz = startHz + (endHz - startHz) * progress;
    phase += (Math.PI * 2 * hz) / SAMPLE_RATE;
    const onset = Math.min(1, offset / attack);
    const envelope = onset * Math.exp(-offset / Math.max(1, seconds(decaySeconds)));
    mixSample(track, start + offset, Math.sin(phase) * gain * envelope, pan);
  }
}

function addNoise(
  track: Track,
  startSeconds: number,
  durationSeconds: number,
  gain: number,
  decaySeconds: number,
  seed: number,
  pan = 0,
  lowPassAlpha = 1,
): void {
  const start = seconds(startSeconds);
  const length = seconds(durationSeconds);
  const random = mulberry32(seed);
  let filtered = 0;
  for (let offset = 0; offset < length; offset += 1) {
    const white = random() * 2 - 1;
    filtered += lowPassAlpha * (white - filtered);
    const envelope = Math.exp(-offset / Math.max(1, seconds(decaySeconds)));
    mixSample(track, start + offset, filtered * gain * envelope, pan);
  }
}

function addBell(track: Track, start: number, baseHz: number, gain: number, pan = 0): void {
  addTone(track, start, 0.75, baseHz, baseHz * 0.997, gain, 0.34, pan, 0.001);
  addTone(track, start, 0.55, baseHz * 2.01, baseHz * 2, gain * 0.42, 0.22, pan, 0.001);
  addTone(track, start, 0.35, baseHz * 3.91, baseHz * 3.88, gain * 0.18, 0.13, pan, 0.001);
}

function addGunCrack(track: Track, start: number, strength: number, seed: number, pan = 0): void {
  addNoise(track, start, 0.085, 1.1 * strength, 0.012, seed, pan, 0.9);
  addTone(track, start, 0.22, 118, 72, 0.72 * strength, 0.055, pan, 0.001);
  addNoise(track, start + 0.018, 0.25, 0.32 * strength, 0.075, seed + 1, -pan * 0.5, 0.12);
}

function addCoin(track: Track, start: number, hz: number, pan: number, seed: number): void {
  addTone(track, start, 0.28, hz, hz * 0.91, 0.26, 0.085, pan, 0.001);
  addNoise(track, start, 0.035, 0.12, 0.008, seed, pan, 0.75);
}

function addShortRoom(track: Track, amount = 0.13): void {
  const sourceLeft = track.left.slice();
  const sourceRight = track.right.slice();
  const delays = [0.031, 0.047, 0.071];
  delays.forEach((delay, index) => {
    const offset = seconds(delay);
    const gain = amount / (index + 1);
    for (let frame = offset; frame < track.left.length; frame += 1) {
      track.left[frame] += sourceRight[frame - offset] * gain;
      track.right[frame] += sourceLeft[frame - offset] * gain;
    }
  });
}

function finish(track: Track, peak = 0.92): Track {
  addShortRoom(track);
  let maximum = 0;
  for (let index = 0; index < track.left.length; index += 1) {
    track.left[index] = Math.tanh(track.left[index] * 1.25);
    track.right[index] = Math.tanh(track.right[index] * 1.25);
    maximum = Math.max(maximum, Math.abs(track.left[index]), Math.abs(track.right[index]));
  }
  const gain = maximum > 0 ? peak / maximum : 1;
  const fadeIn = seconds(0.0015);
  const fadeOut = Math.min(track.left.length, seconds(0.02));
  for (let index = 0; index < track.left.length; index += 1) {
    const startFade = Math.min(1, index / fadeIn);
    const endFade = Math.min(1, (track.left.length - 1 - index) / fadeOut);
    const envelope = Math.max(0, Math.min(startFade, endFade));
    track.left[index] *= gain * envelope;
    track.right[index] *= gain * envelope;
  }
  return track;
}

function fromRuntimeSynth(key: SynthKey, peak = 0.82, tailSeconds = 0.03): Track {
  const mono = synthSamples(key, SAMPLE_RATE);
  const duration = Math.max(mono.length / SAMPLE_RATE + tailSeconds, 0.1);
  const track = empty(duration);
  for (let index = 0; index < mono.length; index += 1) {
    track.left[index] += mono[index] * 0.95;
    track.right[index] += mono[index] * 0.95;
  }
  return finish(track, peak);
}

function extort(): Track {
  const track = empty(1.35);
  addNoise(track, 0.03, 0.22, 0.9, 0.045, 101, -0.15, 0.09);
  addTone(track, 0.03, 0.3, 86, 58, 0.72, 0.07, -0.15);
  addNoise(track, 0.34, 0.12, 0.52, 0.024, 102, 0.25, 0.16);
  addTone(track, 0.34, 0.18, 132, 96, 0.32, 0.04, 0.25);
  addNoise(track, 0.55, 0.1, 0.48, 0.021, 103, -0.25, 0.13);
  addBell(track, 0.73, 740, 0.34, 0.12);
  addCoin(track, 0.86, 2_250, -0.35, 104);
  addCoin(track, 0.93, 1_840, 0.3, 105);
  return finish(track);
}

function cashDrop(): Track {
  const track = empty(1.05);
  addNoise(track, 0.02, 0.09, 0.7, 0.015, 201, -0.2, 0.18);
  addTone(track, 0.02, 0.18, 155, 105, 0.35, 0.04, -0.2);
  addBell(track, 0.16, 880, 0.48, 0.08);
  [0.36, 0.43, 0.5, 0.58, 0.67].forEach((start, index) => {
    addCoin(track, start, 1_650 + index * 170, -0.7 + index * 0.35, 210 + index);
  });
  return finish(track);
}

function cashPickup(): Track {
  const track = empty(0.68);
  addNoise(track, 0.015, 0.1, 0.48, 0.018, 251, -0.25, 0.15);
  addTone(track, 0.015, 0.16, 132, 94, 0.3, 0.035, -0.25);
  addCoin(track, 0.16, 1_920, 0.35, 252);
  addCoin(track, 0.24, 2_180, -0.3, 253);
  addNoise(track, 0.36, 0.16, 0.24, 0.05, 254, 0.1, 0.045);
  return finish(track, 0.82);
}

function pistol(): Track {
  const track = empty(0.72);
  addGunCrack(track, 0.025, 1, 301, -0.08);
  addTone(track, 0.12, 0.34, 94, 52, 0.24, 0.12, 0.18);
  return finish(track, 0.94);
}

function tommyGun(): Track {
  const track = empty(1.08);
  const starts = [0.035, 0.14, 0.245, 0.35, 0.455, 0.575];
  starts.forEach((start, index) => addGunCrack(track, start, 0.72 + index * 0.025, 400 + index, index % 2 ? 0.12 : -0.12));
  addTone(track, 0.58, 0.42, 82, 45, 0.28, 0.16);
  return finish(track, 0.94);
}

function periodSiren(): Track {
  const track = empty(3.8);
  const length = track.left.length;
  let phase = 0;
  for (let index = 0; index < length; index += 1) {
    const time = index / SAMPLE_RATE;
    const sweep = 0.5 + 0.5 * Math.sin((Math.PI * 2 * time) / 1.45 - Math.PI / 2);
    const frequency = 410 + sweep * 285;
    phase += (Math.PI * 2 * frequency) / SAMPLE_RATE;
    const attack = Math.min(1, time / 0.08);
    const release = Math.min(1, (3.8 - time) / 0.18);
    const wobble = 0.86 + Math.sin(time * Math.PI * 2 * 8.5) * 0.06;
    const sample = (Math.sin(phase) * 0.58 + Math.sin(phase * 2.01) * 0.18 + Math.sin(phase * 3.02) * 0.07)
      * attack * release * wobble;
    mixSample(track, index, sample, Math.sin(time * 1.7) * 0.18);
  }
  addNoise(track, 0, 3.8, 0.045, 9, 501, 0, 0.04);
  return finish(track, 0.84);
}

function mutiny(): Track {
  const track = empty(2.25);
  addTone(track, 0, 2.1, 92, 62, 0.42, 0.95, -0.2, 0.015);
  addTone(track, 0.08, 1.9, 138, 104, 0.31, 0.8, 0.2, 0.015);
  addNoise(track, 0.52, 0.32, 0.82, 0.07, 601, 0.05, 0.08);
  addTone(track, 0.52, 0.45, 72, 46, 0.68, 0.12, 0.05);
  addNoise(track, 1.25, 0.22, 0.55, 0.055, 602, -0.25, 0.12);
  addBell(track, 1.42, 310, 0.22, 0.25);
  return finish(track, 0.9);
}

function downBody(): Track {
  const track = empty(0.52);
  addNoise(track, 0.02, 0.34, 0.72, 0.075, 701, -0.08, 0.055);
  addTone(track, 0.02, 0.4, 78, 42, 0.68, 0.11, -0.08);
  addNoise(track, 0.15, 0.28, 0.32, 0.09, 702, 0.22, 0.025);
  return finish(track, 0.78);
}

function encodeWave(track: Track): Buffer {
  const frameCount = track.left.length;
  const bytesPerSample = 2;
  const dataBytes = frameCount * CHANNELS * bytesPerSample;
  const output = Buffer.alloc(44 + dataBytes);
  output.write('RIFF', 0, 'ascii');
  output.writeUInt32LE(36 + dataBytes, 4);
  output.write('WAVE', 8, 'ascii');
  output.write('fmt ', 12, 'ascii');
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(CHANNELS, 22);
  output.writeUInt32LE(SAMPLE_RATE, 24);
  output.writeUInt32LE(SAMPLE_RATE * CHANNELS * bytesPerSample, 28);
  output.writeUInt16LE(CHANNELS * bytesPerSample, 32);
  output.writeUInt16LE(bytesPerSample * 8, 34);
  output.write('data', 36, 'ascii');
  output.writeUInt32LE(dataBytes, 40);
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const left = Math.max(-1, Math.min(1, track.left[frame]));
    const right = Math.max(-1, Math.min(1, track.right[frame]));
    output.writeInt16LE(Math.round(left * 32_767), offset); offset += 2;
    output.writeInt16LE(Math.round(right * 32_767), offset); offset += 2;
  }
  return output;
}

const OUTPUTS: readonly OutputSpec[] = [
  { file: 'sfx_extort.wav', build: extort },
  { file: 'sfx_cashpickup.wav', build: cashPickup },
  { file: 'sfx_cashdrop.wav', build: cashDrop },
  { file: 'sfx_tommygun.wav', build: tommyGun },
  { file: 'sfx_pistol.wav', build: pistol },
  { file: 'sfx_siren.wav', build: periodSiren },
  { file: 'sfx_mutiny.wav', build: mutiny },
  { file: 'sfx_hit_fists.wav', build: () => fromRuntimeSynth('sfx_hit_fists', 0.76) },
  { file: 'sfx_hit_pistol.wav', build: () => fromRuntimeSynth('sfx_hit_pistol', 0.9) },
  { file: 'sfx_hit_shotgun.wav', build: () => fromRuntimeSynth('sfx_hit_shotgun', 0.93, 0.04) },
  { file: 'sfx_hit_rifle.wav', build: () => fromRuntimeSynth('sfx_hit_rifle', 0.9) },
  { file: 'sfx_hit_hitman.wav', build: () => fromRuntimeSynth('sfx_hit_hitman', 0.82) },
  { file: 'sfx_hit_demolitions.wav', build: () => fromRuntimeSynth('sfx_hit_demolitions', 0.94, 0.06) },
  { file: 'sfx_step_pavement.wav', build: () => fromRuntimeSynth('sfx_step_pavement', 0.62) },
  { file: 'sfx_step_gravel.wav', build: () => fromRuntimeSynth('sfx_step_gravel', 0.62, 0.02) },
  { file: 'sfx_down_body.wav', build: downBody },
];

export function generateFp01Audio(outputDirectory: string): string[] {
  mkdirSync(outputDirectory, { recursive: true });
  return OUTPUTS.map((spec) => {
    const path = resolve(outputDirectory, spec.file);
    writeFileSync(path, encodeWave(spec.build()));
    return path;
  });
}

const scriptPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === scriptPath) {
  const projectRoot = resolve(dirname(scriptPath), '..');
  const paths = generateFp01Audio(resolve(projectRoot, 'public/audio'));
  console.log(`Generated ${paths.length} deterministic FP-01 audio one-shots.`);
}
