// PROCEDURAL SFX (Lane I) — the synth produces a valid, non-empty, in-range buffer for every required key,
// deterministically, with no browser AudioContext (a tiny stub stands in for createBuffer). This is what
// makes "Unable to decode audio data" structurally impossible: there is no file to fail — the buffer is math.
import { describe, it, expect } from 'vitest';
import {
  synthSamples, buildSynthBuffer, registerSynthSfx, SYNTH_KEYS, HIT_KEYS, STEP_KEYS,
  type SynthKey, type BufferContextLike,
} from '../src/scenes/audioSynth';

/** A minimal stand-in for a Web Audio context: allocates a real Float32 channel, no browser needed. */
function stubCtx(sampleRate = 44100): BufferContextLike {
  return {
    sampleRate,
    createBuffer(_channels: number, length: number, sr: number) {
      const data = new Float32Array(length);
      return {
        length, sampleRate: sr, numberOfChannels: 1, duration: length / sr,
        getChannelData: () => data,
        copyFromChannel() {}, copyToChannel() {},
      } as unknown as AudioBuffer;
    },
  };
}

describe('synth coverage — every wired hit key + every surface footstep', () => {
  it('SYNTH_KEYS is exactly the six hit keys plus the four footsteps', () => {
    expect(HIT_KEYS).toEqual(['sfx_hit_fists', 'sfx_hit_pistol', 'sfx_hit_shotgun', 'sfx_hit_rifle', 'sfx_hit_hitman', 'sfx_hit_demolitions']);
    expect(STEP_KEYS).toEqual(['sfx_step_pavement', 'sfx_step_wood', 'sfx_step_gravel', 'sfx_step_interior']);
    expect(SYNTH_KEYS).toEqual([...HIT_KEYS, ...STEP_KEYS]);
    expect(new Set(SYNTH_KEYS).size).toBe(10); // all distinct
  });
});

describe('synthSamples — valid, non-empty, non-silent, in-range, deterministic', () => {
  for (const key of SYNTH_KEYS) {
    it(`${key} produces a usable waveform`, () => {
      const s = synthSamples(key, 44100);
      expect(s).toBeInstanceOf(Float32Array);
      expect(s.length).toBeGreaterThan(0); // non-empty
      let peak = 0; let finite = true;
      for (let i = 0; i < s.length; i++) {
        if (!Number.isFinite(s[i])) finite = false;
        const a = Math.abs(s[i]);
        if (a > peak) peak = a;
      }
      expect(finite).toBe(true); // no NaN/Inf
      expect(peak).toBeGreaterThan(0.1); // actually makes sound (not a silent stub)
      expect(peak).toBeLessThanOrEqual(1.0001); // normalized, never clips past full-scale
    });
  }

  it('is deterministic — same key + rate yields identical samples every call', () => {
    const a = synthSamples('sfx_hit_pistol', 44100);
    const b = synthSamples('sfx_hit_pistol', 44100);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('respects the sample rate (longer buffers at higher rates)', () => {
    const lo = synthSamples('sfx_hit_demolitions', 22050);
    const hi = synthSamples('sfx_hit_demolitions', 44100);
    expect(hi.length).toBeGreaterThan(lo.length);
  });

  it('de-clicks the edges — starts and ends at silence so a one-shot never pops', () => {
    for (const key of SYNTH_KEYS) {
      const s = synthSamples(key, 44100);
      expect(Math.abs(s[0])).toBeLessThan(0.05);
      expect(Math.abs(s[s.length - 1])).toBeLessThan(0.05);
    }
  });
});

describe('buildSynthBuffer — wraps the samples in an AudioBuffer for every key (no real Web Audio)', () => {
  it('produces a non-empty channel buffer for each required key', () => {
    const ctx = stubCtx();
    for (const key of SYNTH_KEYS as SynthKey[]) {
      const buf = buildSynthBuffer(ctx, key);
      expect(buf.length).toBeGreaterThan(0);
      expect(buf.getChannelData(0).length).toBe(buf.length);
      // the channel was actually written (non-silent)
      let peak = 0;
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
      expect(peak).toBeGreaterThan(0.1);
    }
  });
});

// A fake Phaser scene slice: a WebAudio-like context (createBuffer only) + a tracked audio cache. Lets us
// exercise registerSynthSfx's file-vs-synth branch with NO browser and NO real Phaser — the cache Map IS the
// observable: what's under each key after the call is exactly what plays.
type SceneArg = Parameters<typeof registerSynthSfx>[0];
function fakeScene(sampleRate = 44100): { scene: SceneArg; store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  const audio = {
    exists: (k: string) => store.has(k),
    add: (k: string, v: unknown) => { store.set(k, v); },
    remove: (k: string) => { store.delete(k); }, // present so an unconditional-clobber regression still runs
  };
  const context = stubCtx(sampleRate);
  const scene = { sound: { context }, cache: { audio } };
  return { scene: scene as unknown as SceneArg, store };
}

describe('registerSynthSfx — FILE-WINS over synth (claim-9 fix)', () => {
  it('SYNTH-FALLBACK path: with no WAV loaded, installs a synth buffer under EVERY synth key', () => {
    const { scene, store } = fakeScene();
    const added = registerSynthSfx(scene);
    expect([...added].sort()).toEqual([...SYNTH_KEYS].sort()); // every key got the fallback
    for (const key of SYNTH_KEYS) {
      expect(store.has(key)).toBe(true);
      // it's a real allocated buffer, not left empty
      const buf = store.get(key) as AudioBuffer;
      expect(buf.length).toBeGreaterThan(0);
    }
  });

  it('FILE-WINS path: a successfully loaded WAV is NOT overwritten by synth registration', () => {
    const { scene, store } = fakeScene();
    // Sentinel standing in for a decoded physical WAV the loader already cached (e.g. public/audio/sfx_hit_pistol.wav).
    const REAL_WAV = { __physicalWav: true } as unknown as AudioBuffer;
    store.set('sfx_hit_pistol', REAL_WAV);

    const added = registerSynthSfx(scene);

    // MUTATION-VERIFY: the exact same object is still under the key (not stripped + replaced by a synth buffer),
    // and synth did NOT claim to install it. An unconditional-clobber regression fails BOTH assertions.
    expect(store.get('sfx_hit_pistol')).toBe(REAL_WAV);
    expect(added).not.toContain('sfx_hit_pistol');

    // ...while every OTHER synth key (no WAV loaded) still got its synth fallback.
    for (const key of SYNTH_KEYS) {
      if (key === 'sfx_hit_pistol') continue;
      expect(store.has(key)).toBe(true);
      expect(added).toContain(key);
    }
  });

  it('is a no-op (returns []) on a non-WebAudio backend — no context, never throws', () => {
    const store = new Map<string, unknown>();
    const scene = {
      sound: {}, // no .context → not a WebAudio backend
      cache: { audio: { exists: (k: string) => store.has(k), add() {}, remove() {} } },
    } as unknown as SceneArg;
    expect(registerSynthSfx(scene)).toEqual([]);
    expect(store.size).toBe(0);
  });
});
