// POLISH-PASS v2 · PACKAGE 5 (audio half) — conductor-intensity math (no Phaser, no audio). Locks the
// weighted intensity blend, the bed buckets (all EXISTING MusicPhase values), and the hysteresis (dead-band
// + dwell) that keeps the score from thrashing. The chosen phase is always one musicBedForPhase accepts.
import { describe, it, expect } from 'vitest';
import {
  conductorIntensity, bedForIntensity, conductWithHysteresis, initConductor, isIntensityBed,
  DEFAULT_WEIGHTS, T_LOW, T_HIGH, HYSTERESIS_BAND, MIN_DWELL_MS, type ConductorInputs,
} from '../src/scenes/audio/conductorIntensity';
import { musicBedForPhase } from '../src/scenes/audioMap';

const SAFE: ConductorInputs = { threat: 0, federalTier: 0, activeCombat: 0, weekPacing: 0 };
const MAX: ConductorInputs = { threat: 1, federalTier: 3, activeCombat: 1, weekPacing: 1 };

describe('conductorIntensity — a normalized weighted blend of EXISTING signals', () => {
  it('all-quiet → 0, all-hot → 1', () => {
    expect(conductorIntensity(SAFE)).toBe(0);
    expect(conductorIntensity(MAX)).toBeCloseTo(1, 6);
  });
  it('is monotonic non-decreasing in each input', () => {
    const base = conductorIntensity(SAFE);
    expect(conductorIntensity({ ...SAFE, threat: 1 })).toBeGreaterThan(base);
    expect(conductorIntensity({ ...SAFE, federalTier: 3 })).toBeGreaterThan(base);
    expect(conductorIntensity({ ...SAFE, activeCombat: 1 })).toBeGreaterThan(base);
    expect(conductorIntensity({ ...SAFE, weekPacing: 1 })).toBeGreaterThan(base);
  });
  it('a zeroed weight drops that input entirely (the "input not available → weight 0" rule)', () => {
    const w = { ...DEFAULT_WEIGHTS, combat: 0 };
    // with combat weighted out, active combat must not move the intensity
    const a = conductorIntensity({ ...SAFE, activeCombat: 0 }, w);
    const b = conductorIntensity({ ...SAFE, activeCombat: 1 }, w);
    expect(b).toBe(a);
  });
  it('an all-zero weight set is silent (returns 0, never NaN)', () => {
    expect(conductorIntensity(MAX, { threat: 0, federal: 0, combat: 0, week: 0 })).toBe(0);
  });
  it('clamps out-of-range inputs', () => {
    expect(conductorIntensity({ threat: 5, federalTier: 99, activeCombat: 5, weekPacing: 5 })).toBeCloseTo(1, 6);
  });
});

describe('bedForIntensity — escalating EXISTING beds', () => {
  it('buckets low→ESTABLISH, mid→CONTEST, high→DECAPITATE', () => {
    expect(bedForIntensity(T_LOW - 0.01)).toBe('ESTABLISH');
    expect(bedForIntensity((T_LOW + T_HIGH) / 2)).toBe('CONTEST');
    expect(bedForIntensity(T_HIGH + 0.01)).toBe('DECAPITATE');
  });
  it('every bucket is a real bed the RTS-31 conductor accepts', () => {
    for (const i of [0, 0.5, 1]) {
      const bed = musicBedForPhase(bedForIntensity(i));
      expect(typeof bed).toBe('string');
      expect(bed.length).toBeGreaterThan(0);
    }
    expect(isIntensityBed('CONTEST')).toBe(true);
    expect(isIntensityBed('GAMEOVER')).toBe(false); // terminal — scene-driven, not intensity
  });
});

describe('conductWithHysteresis — swells with the action, never thrashes', () => {
  it('holds the bed inside the dead-band (no edge chatter)', () => {
    const s = initConductor('CONTEST');
    // intensity right around the low threshold but within the band → no switch
    const r = conductWithHysteresis({ ...s, sinceMs: 0 }, T_LOW - HYSTERESIS_BAND / 2, 1e9);
    expect(r.phase).toBe('CONTEST');
  });
  it('switches UP once intensity clears the band AND the dwell has elapsed', () => {
    let s = initConductor('ESTABLISH');
    s = { ...s, sinceMs: 0 };
    const now = MIN_DWELL_MS + 1;
    const r = conductWithHysteresis(s, T_HIGH + HYSTERESIS_BAND + 0.01, now);
    expect(r.phase).toBe('DECAPITATE');
    expect(r.sinceMs).toBe(now);
  });
  it('the dwell guard BLOCKS a switch that comes too soon (anti-thrash)', () => {
    const s = { ...initConductor('ESTABLISH'), sinceMs: 1000 };
    const tooSoon = 1000 + MIN_DWELL_MS - 1;
    const r = conductWithHysteresis(s, 1.0, tooSoon); // wants DECAPITATE but can't yet
    expect(r.phase).toBe('ESTABLISH');
  });
  it('a noisy intensity around a threshold does not flip-flop the bed', () => {
    let s = { ...initConductor('CONTEST'), sinceMs: 0 };
    let switches = 0;
    let t = MIN_DWELL_MS + 1;
    for (const i of [0.35, 0.33, 0.36, 0.34, 0.35, 0.33, 0.34]) { // jitter around T_LOW
      const r = conductWithHysteresis(s, i, t);
      if (r.phase !== s.phase) switches++;
      s = r; t += 100;
    }
    expect(switches).toBe(0); // the dead-band absorbs the jitter
  });
});
