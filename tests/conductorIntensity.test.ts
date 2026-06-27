// POLISH-PASS v2 · PACKAGE 5 (audio half) — conductor-intensity math (no Phaser, no audio). Locks the
// weighted intensity blend, the bed buckets (all EXISTING MusicPhase values), and the hysteresis (dead-band
// + dwell) that keeps the score from thrashing. The chosen phase is always one musicBedForPhase accepts.
import { describe, it, expect } from 'vitest';
import {
  conductorIntensity, bedForIntensity, conductWithHysteresis, initConductor, isIntensityBed,
  DEFAULT_WEIGHTS, T_LOW, T_HIGH, HYSTERESIS_BAND, MIN_DWELL_MS, type ConductorInputs,
  governPhaseSting, initPhaseSting,
  STING_PHASE_DWELL_MS, STING_DEESCALATION_MARGIN_MS, MIN_STING_INTERVAL_MS,
} from '../src/scenes/audio/conductorIntensity';
import { musicBedForPhase } from '../src/scenes/audioMap';
import type { HudPhase } from '../src/sim/pacing';

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

describe('governPhaseSting — source-phase hysteresis + sting debounce (the CONDUCTOR anti-thrash half)', () => {
  // Drive a sequence of (observed phase, time) samples through the governor; collect every sting it emits.
  function run(seq: Array<[HudPhase, number]>, seed: HudPhase = 'ESTABLISH') {
    let s = initPhaseSting(seed, 0);
    const stings: Array<{ phase: HudPhase; at: number }> = [];
    for (const [phase, t] of seq) {
      const r = governPhaseSting(s, phase, t);
      s = r.state;
      if (r.sting) stings.push({ phase: r.sting, at: t });
    }
    return { state: s, stings };
  }

  it('seeding does not sting, and a held same-phase never stings', () => {
    const { stings } = run([['ESTABLISH', 100], ['ESTABLISH', 5000], ['ESTABLISH', 9000]]);
    expect(stings).toEqual([]);
  });

  it('a phase change that HOLDS the dwell commits and stings exactly once', () => {
    const t = STING_PHASE_DWELL_MS + 50;
    const { state, stings } = run([['CONTEST', 0], ['CONTEST', t], ['CONTEST', t + 5000]]);
    // first sample sets the candidate clock (at t=0 == seed time), so it must hold dwell from there
    expect(stings.map((x) => x.phase)).toEqual(['CONTEST']);
    expect(state.committed).toBe('CONTEST');
  });

  it('OSCILLATING input collapses to one stable output — no sting while it flickers faster than the dwell', () => {
    // FIRST BLOOD ↔ CONTEST every 100ms (districtsHeld flicking 1↔2), far quicker than the dwell.
    const seq: Array<[HudPhase, number]> = [];
    let t = 0;
    for (let i = 0; i < 40; i++) { seq.push([i % 2 ? 'CONTEST' : 'FIRST BLOOD', t]); t += 100; }
    const { stings } = run(seq);
    expect(stings).toEqual([]); // nothing ever holds long enough to commit → no thrash
  });

  it('after the oscillation SETTLES, the held phase commits and stings once', () => {
    const seq: Array<[HudPhase, number]> = [];
    let t = 0;
    for (let i = 0; i < 10; i++) { seq.push([i % 2 ? 'CONTEST' : 'FIRST BLOOD', t]); t += 100; }
    // now it settles on CONTEST and holds well past the dwell
    seq.push(['CONTEST', t]);
    seq.push(['CONTEST', t + STING_PHASE_DWELL_MS + 1]);
    const { stings } = run(seq);
    expect(stings.map((x) => x.phase)).toEqual(['CONTEST']);
  });

  it('DEBOUNCE: two genuine, dwell-satisfied changes inside the min interval fire only ONE sting', () => {
    // ESTABLISH→CONTEST commits & stings; then CONTEST→DECAPITATE also satisfies its dwell but lands
    // inside MIN_STING_INTERVAL_MS of the first sting → suppressed.
    const t1 = STING_PHASE_DWELL_MS + 10;            // CONTEST holds & stings at ~t1
    const t2 = t1 + STING_PHASE_DWELL_MS + 10;        // DECAPITATE holds; gap from t1 < MIN_STING_INTERVAL_MS
    expect(t2 - t1).toBeLessThan(MIN_STING_INTERVAL_MS); // guard the premise
    const seq: Array<[HudPhase, number]> = [
      ['CONTEST', 0], ['CONTEST', t1],
      ['DECAPITATE', t1], ['DECAPITATE', t2],
    ];
    const { state, stings } = run(seq);
    expect(stings.map((x) => x.phase)).toEqual(['CONTEST']); // second sting debounced
    expect(state.committed).toBe('DECAPITATE');             // …but the phase still advances
  });

  it('a second sting IS allowed once the min interval has elapsed', () => {
    const t1 = STING_PHASE_DWELL_MS + 10;
    const t2 = t1 + MIN_STING_INTERVAL_MS + STING_PHASE_DWELL_MS + 10; // comfortably past the debounce
    const seq: Array<[HudPhase, number]> = [
      ['CONTEST', 0], ['CONTEST', t1],
      ['DECAPITATE', t1], ['DECAPITATE', t2],
    ];
    const { stings } = run(seq);
    expect(stings.map((x) => x.phase)).toEqual(['CONTEST', 'DECAPITATE']);
  });

  it('Schmitt MARGIN: a de-escalation needs to hold LONGER than an escalation', () => {
    // Sit on CONTEST, then drop to ESTABLISH. The candidate clock starts when ESTABLISH is FIRST observed.
    let s = initPhaseSting('CONTEST', 0);
    s = governPhaseSting(s, 'ESTABLISH', 10).state;     // introduce the de-escalation candidate (clock @10)
    // Held only the base dwell → NOT enough for a downgrade (needs dwell + margin).
    const justDwell = governPhaseSting(s, 'ESTABLISH', 10 + STING_PHASE_DWELL_MS + 10);
    expect(justDwell.sting).toBeNull();
    expect(justDwell.state.committed).toBe('CONTEST');
    // Held the full dwell + margin → it finally de-escalates and stings.
    const full = governPhaseSting(justDwell.state, 'ESTABLISH', 10 + STING_PHASE_DWELL_MS + STING_DEESCALATION_MARGIN_MS + 10);
    expect(full.sting).toBe('ESTABLISH');
    expect(full.state.committed).toBe('ESTABLISH');
  });

  it('an ESCALATION commits on the base dwell (no margin penalty)', () => {
    let s = initPhaseSting('ESTABLISH', 0);
    s = governPhaseSting(s, 'DECAPITATE', 10).state;    // introduce the escalation candidate (clock @10)
    const r = governPhaseSting(s, 'DECAPITATE', 10 + STING_PHASE_DWELL_MS + 1); // base dwell only
    expect(r.sting).toBe('DECAPITATE');
  });

  it('a flicker that retreats before the dwell elapses resets the clock (never commits)', () => {
    let s = initPhaseSting('ESTABLISH', 0);
    // CONTEST appears but retreats to ESTABLISH just before the dwell, repeatedly.
    let t = 0;
    for (let i = 0; i < 6; i++) {
      s = governPhaseSting(s, 'CONTEST', t).state; t += STING_PHASE_DWELL_MS - 100;
      const back = governPhaseSting(s, 'ESTABLISH', t); s = back.state; t += 50;
      expect(back.sting).toBeNull();
    }
    expect(s.committed).toBe('ESTABLISH'); // never settled long enough to commit
  });
});
