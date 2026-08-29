// PROCEDURAL SFX (Lane I) — synthesize the wired-but-missing sound effects at RUNTIME via the Web Audio API,
// so the game needs NO canned WAV assets (procedural audio to match the procedural art). The DSP is split in
// two so it's unit-testable WITHOUT a browser AudioContext:
//   • synthSamples(key, sampleRate) — PURE: builds the mono Float32 waveform for a key (oscillators + seeded
//     noise + fast-decay envelopes + one-pole filters). Deterministic (seeded per key), so every boot — and
//     every test — produces the identical buffer.
//   • buildSynthBuffer(ctx, key) / registerSynthSfx(scene) — the thin Phaser/Web-Audio wrapper that wraps
//     those samples in an AudioBuffer and registers it in Phaser's audio cache under the EXACT existing key.
// Registration goes through Phaser's own sound manager + cache, so playback still flows through the existing
// governed SFX path (AudioManager.play applies the SFX bus gain — Lane G's volume settings keep working).
// No parallel/ungoverned audio graph is created; the AudioContext is only borrowed to allocate the buffer.

import type Phaser from 'phaser';

// ── the keys we synthesize ──────────────────────────────────────────────────────────────────────
/** Per-weapon HIT cracks — the exact keys weaponFeedback fires (sfx_hit_<weapon>). */
export const HIT_KEYS = [
  'sfx_hit_fists', 'sfx_hit_pistol', 'sfx_hit_shotgun', 'sfx_hit_rifle', 'sfx_hit_hitman', 'sfx_hit_demolitions',
] as const;
/** Per-surface FOOTSTEP taps (filtered-noise). */
export const STEP_KEYS = [
  'sfx_step_pavement', 'sfx_step_wood', 'sfx_step_gravel', 'sfx_step_interior',
] as const;
/** Original procedural, nonverbal casualty reactions. These are breaths/grunts, not cloned speech. */
export const DEATH_REACTION_KEYS = ['sfx_death_reaction_1', 'sfx_death_reaction_2'] as const;

export type SynthKey = (typeof HIT_KEYS)[number] | (typeof STEP_KEYS)[number] | (typeof DEATH_REACTION_KEYS)[number];

/** Every key the synth fills (hits + footsteps + restrained nonverbal casualty reactions). */
export const SYNTH_KEYS: readonly SynthKey[] = [...HIT_KEYS, ...STEP_KEYS, ...DEATH_REACTION_KEYS];

// ── tiny deterministic DSP toolkit (pure) ─────────────────────────────────────────────────────────
/** A seeded PRNG (mulberry32) so each key's noise is deterministic + distinct. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable non-negative seed from a key string (FNV-1a). */
function seedFor(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 1;
}

/** White noise in [-1, 1] of length `n`, seeded. */
function noise(n: number, seed: number): Float32Array {
  const r = mulberry32(seed);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
}

/** One-pole low-pass in place (alpha smaller ⇒ darker). */
function lowpass(buf: Float32Array, alpha: number): void {
  let y = 0;
  for (let i = 0; i < buf.length; i++) { y += alpha * (buf[i] - y); buf[i] = y; }
}

/** One-pole high-pass in place (alpha nearer 1 ⇒ brighter / thinner). */
function highpass(buf: Float32Array, alpha: number): void {
  let y = 0, px = 0;
  for (let i = 0; i < buf.length; i++) { const x = buf[i]; y = alpha * (y + x - px); buf[i] = y; px = x; }
}

/** e^(-i / decaySamples) — an exponential amplitude envelope sample. */
function decayAt(i: number, decaySamples: number): number {
  return Math.exp(-i / Math.max(1, decaySamples));
}

/** Peak-normalize to `peak`, then de-click with tiny linear fades so the one-shot never pops. */
function finish(buf: Float32Array, sr: number, peak = 0.9): Float32Array {
  let m = 0;
  for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
  if (m > 0) { const g = peak / m; for (let i = 0; i < buf.length; i++) buf[i] *= g; }
  const fi = Math.min(buf.length, Math.floor(sr * 0.001));
  for (let i = 0; i < fi; i++) buf[i] *= i / fi;
  const fo = Math.min(buf.length, Math.floor(sr * 0.006));
  for (let i = 0; i < fo; i++) buf[buf.length - 1 - i] *= i / fo;
  return buf;
}

const secs = (sr: number, s: number) => Math.max(1, Math.floor(sr * s));

// ── the voices ─────────────────────────────────────────────────────────────────────────────────
/**
 * Build the mono waveform for one synth key at `sampleRate`. PURE + deterministic: same key + rate ⇒ the
 * exact same Float32 samples (peak-normalized, de-clicked, in [-1, 1]). Each weapon hit is tuned to its read
 * (soft thud → broadband boom → rapid taps → low boom-and-tail); each footstep is a filtered-noise tap.
 */
export function synthSamples(key: SynthKey, sampleRate: number): Float32Array {
  const sr = sampleRate;
  const seed = seedFor(key);

  switch (key) {
    case 'sfx_hit_fists': { // a soft knuckle THUD — low body + a dull filtered-noise slap
      const n = secs(sr, 0.13); const out = new Float32Array(n);
      const body = noise(n, seed); lowpass(body, 0.06);
      for (let i = 0; i < n; i++) {
        out[i] = Math.sin((2 * Math.PI * 95 * i) / sr) * decayAt(i, sr * 0.04)
          + body[i] * decayAt(i, sr * 0.03) * 0.4;
      }
      return finish(out, sr, 0.7); // soft cue → a touch quieter
    }
    case 'sfx_hit_pistol': { // a short, bright CRACK
      const n = secs(sr, 0.09); const out = noise(n, seed); highpass(out, 0.7);
      for (let i = 0; i < n; i++) out[i] *= decayAt(i, sr * 0.012);
      const click = secs(sr, 0.002);
      for (let i = 0; i < click; i++) out[i] += (1 - i / click);
      return finish(out, sr);
    }
    case 'sfx_hit_shotgun': { // a broadband BOOM with a low thump
      const n = secs(sr, 0.24); const out = noise(n, seed); lowpass(out, 0.25);
      for (let i = 0; i < n; i++) {
        out[i] = out[i] * decayAt(i, sr * 0.07)
          + Math.sin((2 * Math.PI * 70 * i) / sr) * decayAt(i, sr * 0.05) * 0.7;
      }
      return finish(out, sr);
    }
    case 'sfx_hit_rifle': { // the TOMMY — rapid layered taps (a burst)
      const n = secs(sr, 0.27); const out = new Float32Array(n);
      const taps = 6, gap = secs(sr, 0.04), tapLen = secs(sr, 0.03);
      for (let k = 0; k < taps; k++) {
        const off = k * gap;
        const tap = noise(tapLen, seed + k * 97); highpass(tap, 0.6);
        for (let i = 0; i < tapLen && off + i < n; i++) out[off + i] += tap[i] * decayAt(i, sr * 0.01) * 0.9;
      }
      for (let i = 0; i < n; i++) out[i] *= decayAt(i, sr * 0.18);
      return finish(out, sr);
    }
    case 'sfx_hit_hitman': { // a SUPPRESSED snap — muffled + a soft low knock
      const n = secs(sr, 0.08); const out = noise(n, seed); lowpass(out, 0.18);
      for (let i = 0; i < n; i++) {
        out[i] = out[i] * decayAt(i, sr * 0.015)
          + Math.sin((2 * Math.PI * 140 * i) / sr) * decayAt(i, sr * 0.02) * 0.5;
      }
      return finish(out, sr, 0.8);
    }
    case 'sfx_hit_demolitions': { // a deep BOOM + a long rumble TAIL
      const n = secs(sr, 0.6); const out = new Float32Array(n);
      const rumble = noise(n, seed); lowpass(rumble, 0.04);
      for (let i = 0; i < n; i++) {
        out[i] = Math.sin((2 * Math.PI * 48 * i) / sr) * decayAt(i, sr * 0.18)
          + rumble[i] * decayAt(i, sr * 0.25) * 0.5;
      }
      const crack = noise(secs(sr, 0.03), seed + 7);
      for (let i = 0; i < crack.length; i++) out[i] += crack[i] * decayAt(i, sr * 0.01) * 0.8;
      return finish(out, sr);
    }
    case 'sfx_step_pavement': { // dark leather heel + softer toe/sole contact, not a bright click
      const n = secs(sr, 0.22); const out = new Float32Array(n);
      const heel = noise(n, seed); lowpass(heel, 0.055);
      const toe = noise(n, seed + 41); lowpass(toe, 0.09);
      const toeAt = secs(sr, 0.065);
      for (let i = 0; i < n; i++) {
        const body = Math.sin((2 * Math.PI * 105 * i) / sr) * decayAt(i, sr * 0.045) * 0.55;
        const heelSlap = heel[i] * decayAt(i, sr * 0.034) * 0.8;
        const ti = i - toeAt;
        const toeContact = ti >= 0
          ? (toe[ti] * decayAt(ti, sr * 0.04) * 0.36
            + Math.sin((2 * Math.PI * 82 * ti) / sr) * decayAt(ti, sr * 0.035) * 0.2)
          : 0;
        out[i] = body + heelSlap + toeContact;
      }
      lowpass(out, 0.18); // roll off the high-frequency noise that made the old asset click
      return finish(out, sr, 0.58);
    }
    case 'sfx_step_wood': { // a hollow tap with a short resonant ring
      const n = secs(sr, 0.09); const out = noise(n, seed); lowpass(out, 0.3);
      for (let i = 0; i < n; i++) {
        out[i] = out[i] * decayAt(i, sr * 0.01)
          + Math.sin((2 * Math.PI * 210 * i) / sr) * decayAt(i, sr * 0.03) * 0.5;
      }
      return finish(out, sr, 0.6);
    }
    case 'sfx_step_gravel': { // boot weight under a restrained, mid-band gravel crunch
      const n = secs(sr, 0.26); const out = new Float32Array(n);
      const body = noise(n, seed); lowpass(body, 0.045);
      for (let i = 0; i < n; i++) {
        out[i] = body[i] * decayAt(i, sr * 0.075) * 0.55
          + Math.sin((2 * Math.PI * 92 * i) / sr) * decayAt(i, sr * 0.05) * 0.45;
      }
      const grains = 11, glen = secs(sr, 0.026);
      for (let k = 0; k < grains; k++) {
        const off = Math.floor(mulberry32(seed + k * 13)() * n * 0.68);
        const g = noise(glen, seed + k * 31); lowpass(g, 0.16);
        for (let i = 0; i < glen && off + i < n; i++) {
          out[off + i] += g[i] * decayAt(i, sr * 0.011) * 0.42;
        }
      }
      for (let i = 0; i < n; i++) out[i] *= decayAt(i, sr * 0.11);
      lowpass(out, 0.22);
      return finish(out, sr, 0.58);
    }
    case 'sfx_step_interior': { // a muffled, heavily low-passed soft tap
      const n = secs(sr, 0.07); const out = noise(n, seed); lowpass(out, 0.08);
      for (let i = 0; i < n; i++) out[i] *= decayAt(i, sr * 0.012) * 0.7;
      return finish(out, sr, 0.55);
    }
    case 'sfx_death_reaction_1':
    case 'sfx_death_reaction_2': { // a low, falling breath/grunt — deliberately nonverbal and restrained
      const n = secs(sr, key.endsWith('_1') ? 0.38 : 0.46);
      const out = new Float32Array(n);
      const breath = noise(n, seed); lowpass(breath, 0.045);
      const startHz = key.endsWith('_1') ? 142 : 116;
      const endHz = key.endsWith('_1') ? 84 : 72;
      let phase = 0;
      for (let i = 0; i < n; i++) {
        const t = i / Math.max(1, n - 1);
        const hz = startHz + (endHz - startHz) * t;
        phase += (2 * Math.PI * hz) / sr;
        const attack = Math.min(1, i / Math.max(1, secs(sr, 0.018)));
        const env = attack * Math.pow(1 - t, 1.35);
        const voiced = Math.sin(phase) * 0.72 + Math.sin(phase * 2.02) * 0.16;
        out[i] = (voiced + breath[i] * 0.42) * env;
      }
      lowpass(out, 0.16); // keep it chesty; never a sharp yelp competing with combat reports
      return finish(out, sr, 0.44);
    }
  }
}

// ── Phaser / Web-Audio wiring ────────────────────────────────────────────────────────────────────
/** The minimal AudioContext slice this module needs — `sampleRate` + `createBuffer` (so a test can stub it). */
export interface BufferContextLike {
  sampleRate: number;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
}

/** Wrap a key's synthesized samples in an AudioBuffer allocated by `ctx`. Pure aside from the allocation. */
export function buildSynthBuffer(ctx: BufferContextLike, key: SynthKey): AudioBuffer {
  const samples = synthSamples(key, ctx.sampleRate);
  const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buf.getChannelData(0).set(samples); // supported by AudioBuffer + the test stub; no buffer-type generics
  return buf;
}

/**
 * Synthesize each SYNTH_KEY that has NO loaded physical WAV and register the buffer in Phaser's audio cache
 * under its exact key. FILE-WINS (spec §9): a key whose real WAV already loaded is left UNTOUCHED — the WAV is
 * the primary voice and synth is only the FALLBACK for a missing/failed-to-decode WAV (so the key isn't in the
 * cache). This reverses the old unconditional clobber (build → strip any cached WAV → install synth), which
 * silently overrode a real WAV with the procedural voice. Borrows the WebAudioSoundManager's AudioContext only
 * to allocate the fallback buffers — playback still flows through the manager (so the existing SFX volume path
 * governs it). A no-op (returns []) when WebAudio isn't the active backend (HTML5/no-audio), so a key simply
 * stays silent rather than erroring. Never throws; a single bad key can't break boot. Returns the keys the
 * synth fallback was installed for (i.e. the keys with no physical WAV loaded).
 */
export function registerSynthSfx(scene: Phaser.Scene): string[] {
  const mgr = scene.sound as unknown as { context?: BufferContextLike };
  const ctx = mgr?.context;
  if (!ctx || typeof ctx.createBuffer !== 'function') return []; // not a WebAudio backend → nothing to synth
  const cache = scene.cache.audio;
  const added: string[] = [];
  for (const key of SYNTH_KEYS) {
    try {
      // FILE-WINS: a successfully loaded physical WAV under this exact key is the primary voice — keep it and
      // skip synth entirely. Synth installs ONLY when the WAV is absent (missing/404/decode-fail → not cached),
      // so a real WAV dropped at the key's path always beats the procedural fallback.
      if (cache.exists(key)) continue;
      const buf = buildSynthBuffer(ctx, key);
      cache.add(key, buf);
      added.push(key);
    } catch {
      /* one key failing to synthesize must never abort boot */
    }
  }
  return added;
}
