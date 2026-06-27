// PROCEDURAL SFX (Lane I) — the synth produces a valid, non-empty, in-range buffer for every required key,
// deterministically, with no browser AudioContext (a tiny stub stands in for createBuffer). This is what
// makes "Unable to decode audio data" structurally impossible: there is no file to fail — the buffer is math.
import { describe, it, expect } from 'vitest';
import {
  synthSamples, buildSynthBuffer, SYNTH_KEYS, HIT_KEYS, STEP_KEYS, type SynthKey, type BufferContextLike,
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
