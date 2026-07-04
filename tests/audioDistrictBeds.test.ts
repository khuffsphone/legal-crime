// AUDIO E-H — Tickets E1 (bed catalog) + E2 (resolver/crossfade planner). Every row of the spec's
// mutation tables is a live assertion: the test names state the MUTATION that must fail.
import { describe, it, expect } from 'vitest';
import {
  ALL_BED_KEYS, BED_FADE_IN_MS, BED_FADE_OUT_MS, BED_HYSTERESIS_MS, BED_LAYERS, BED_XFADE_MS,
  DISTRICT_BEDS, DISTRICT_BED_ARCHETYPES, MAX_BED_LOOPS, bedFor, bedZoomTrimDb, emitterStyleDistrict,
} from '../src/scenes/audio/districtBedCatalog';
import {
  createBedResolverState, planBedIntents, sampleBedDistrict, stepBedResolver, bedVoiceId,
  type BedVoice,
} from '../src/scenes/audio/districtBedResolver';
import { dbToGain } from '../src/scenes/audio/atmosphereIntents';
import { districtIdentityFor } from '../src/scenes/art/districtIdentity';
import { STREETSCAPE_DISTRICTS } from '../src/scenes/env/streetscapeTypes';

const ARCHETYPES_9 = Array.from({ length: 9 }, (_, i) => districtIdentityFor(i).archetype);

describe('E1 — district bed catalog (mutation table)', () => {
  it('MUTATION remove-an-archetype: exactly the 9 canonical ART archetypes, each with a bed', () => {
    expect(DISTRICT_BED_ARCHETYPES.sort()).toEqual([...new Set(ARCHETYPES_9)].sort());
    expect(DISTRICT_BED_ARCHETYPES).toHaveLength(9);
    for (const a of DISTRICT_BED_ARCHETYPES) expect(bedFor(a)).toBeTruthy();
  });

  it('MUTATION quarter-fallback-undefined: QUARTER styles as TENEMENT for streetscape-bound systems only', () => {
    expect(emitterStyleDistrict('QUARTER')).toBe('TENEMENT');
    // every other archetype styles as itself, and every result is a real StreetscapeDistrict
    for (const a of DISTRICT_BED_ARCHETYPES) {
      const styled = emitterStyleDistrict(a);
      expect(STREETSCAPE_DISTRICTS).toContain(styled);
      if (a !== 'QUARTER') expect(styled).toBe(a);
    }
  });

  it('MUTATION quarter-reuses-tenement-beds: QUARTER has its OWN bed pair; all 18 keys unique', () => {
    expect(DISTRICT_BEDS.QUARTER.base).toBe('bed_quarter_base');
    expect(DISTRICT_BEDS.QUARTER.color).toBe('bed_quarter_color');
    expect(DISTRICT_BEDS.QUARTER.base).not.toBe(DISTRICT_BEDS.TENEMENT.base);
    expect(new Set(ALL_BED_KEYS).size).toBe(18);
  });

  it('MUTATION third-mvp-layer: exactly TWO layers (base + color), nothing more', () => {
    expect(BED_LAYERS).toEqual(['base', 'color']);
    for (const a of DISTRICT_BED_ARCHETYPES) {
      const clipKeys = Object.entries(DISTRICT_BEDS[a]).filter(([, v]) => typeof v === 'string' && (v as string).startsWith('bed_'));
      expect(clipKeys, `${a} carries exactly its base+color keys`).toHaveLength(2);
    }
  });

  it('MUTATION bed-key-renamed: every key is exactly bed_<archetype>_{base,color}', () => {
    for (const a of DISTRICT_BED_ARCHETYPES) {
      expect(DISTRICT_BEDS[a].base).toBe(`bed_${a.toLowerCase()}_base`);
      expect(DISTRICT_BEDS[a].color).toBe(`bed_${a.toLowerCase()}_color`);
    }
  });
});

describe('E2 — bed resolver + crossfade planner (mutation table)', () => {
  const only = (d: string | null) => (_gx: number, _gy: number) => d;

  it('MUTATION unrevealed-center-selects: unexplored tiles carry ZERO weight; fully-fogged sample holds', () => {
    // center tile fogged (null); one explored FINANCIAL tile in the outer ring still wins
    const districtAt = (gx: number, gy: number) => (gx === 2 && gy === 2 ? 'FINANCIAL' : null);
    const s = sampleBedDistrict({ gx: 0, gy: 0 }, districtAt);
    expect(s.winner).toBe('FINANCIAL'); // the fogged 24 tiles could not out-vote one explored tile
    expect(s.exploredCount).toBe(1);
    // fully fogged: NO winner — and the resolver HOLDS the previous district with the penalty
    const empty = sampleBedDistrict({ gx: 0, gy: 0 }, only(null));
    expect(empty.winner).toBeNull();
    let st: ReturnType<typeof createBedResolverState> = { ...createBedResolverState(), current: 'DOCKS' };
    st = stepBedResolver(st, empty, 1000);
    expect(st.current).toBe('DOCKS');
    expect(st.holdPenalty).toBe(true);
  });

  it('weights the 5x5 window 4/2/1 (center/ring/outer)', () => {
    // A on the center (weight 4); B on 3 outer-ring tiles (weight 3) → A wins
    const districtAt = (gx: number, gy: number) => {
      if (gx === 0 && gy === 0) return 'A';
      if (gy === -2 && gx >= -2 && gx <= 0) return 'B';
      return null;
    };
    expect(sampleBedDistrict({ gx: 0, gy: 0 }, districtAt).winner).toBe('A');
    // ...but 5 outer B tiles (weight 5) out-vote the center
    const districtAt5 = (gx: number, gy: number) => {
      if (gx === 0 && gy === 0) return 'A';
      if (gy === -2) return 'B'; // the whole outer top row: 5 tiles
      return null;
    };
    expect(sampleBedDistrict({ gx: 0, gy: 0 }, districtAt5).winner).toBe('B');
  });

  it('MUTATION hysteresis-removed: a new winner must stay stable 750 ms before it becomes current', () => {
    let st = createBedResolverState();
    st = stepBedResolver(st, { winner: 'MARKET', exploredCount: 25 }, 1000); // candidate starts
    expect(st.current).toBeNull();
    st = stepBedResolver(st, { winner: 'MARKET', exploredCount: 25 }, 1000 + 500); // 500ms — too soon
    expect(st.current).toBeNull();
    st = stepBedResolver(st, { winner: 'MARKET', exploredCount: 25 }, 1000 + BED_HYSTERESIS_MS); // ripe
    expect(st.current).toBe('MARKET');
    // a flicker to another district for <750ms never switches
    st = stepBedResolver(st, { winner: 'DOCKS', exploredCount: 25 }, 2000);
    st = stepBedResolver(st, { winner: 'MARKET', exploredCount: 25 }, 2250); // back before ripening
    st = stepBedResolver(st, { winner: 'DOCKS', exploredCount: 25 }, 2500); // candidate clock RESTARTS
    st = stepBedResolver(st, { winner: 'DOCKS', exploredCount: 25 }, 2500 + 500);
    expect(st.current).toBe('MARKET'); // still held
  });

  it('MUTATION same-district-restarts-loops: a same-district re-plan emits setLoop ONLY (no restart)', () => {
    const first = planBedIntents([], 'CIVIC', 1.0, false);
    expect(first.intents.filter((i) => i.op === 'playLoop')).toHaveLength(2); // base + color start once
    const again = planBedIntents(first.voices, 'CIVIC', 1.0, false);
    expect(again.intents.every((i) => i.op === 'setLoop')).toBe(true); // re-trim only
    expect(again.voices).toEqual(first.voices); // identical voice identities — nothing restarted
  });

  it('MUTATION budget-exceeded: a district crossfade keeps ≤4 audible loops (2 out + 2 in)', () => {
    const live = planBedIntents([], 'CIVIC', 1.0, false).voices;
    const cross = planBedIntents(live, 'DOCKS', 1.0, false);
    const stops = cross.intents.filter((i) => i.op === 'stopLoop');
    const plays = cross.intents.filter((i) => i.op === 'playLoop');
    expect(stops).toHaveLength(2);
    expect(plays).toHaveLength(2);
    expect(stops.length + plays.length).toBeLessThanOrEqual(MAX_BED_LOOPS);
    // equal-power 2.8s crossfade on BOTH sides
    for (const s of stops) expect((s as { fadeOutMs: number }).fadeOutMs).toBe(BED_XFADE_MS);
    for (const p of plays) expect((p as { fadeInMs: number; equalPower?: boolean }).fadeInMs).toBe(BED_XFADE_MS);
    for (const p of plays) expect((p as { equalPower?: boolean }).equalPower).toBe(true);
  });

  it('MUTATION zoom-ignored: gains follow the E.6 law (layer trim + zoom trim + hold penalty)', () => {
    const gainOf = (plan: ReturnType<typeof planBedIntents>, layer: string): number => {
      const key = `bed_civic_${layer}`;
      const p = plan.intents.find((i) => i.op === 'playLoop' && (i as { key: string }).key === key) as { gain: number };
      return p.gain;
    };
    const far = planBedIntents([], 'CIVIC', 0.5, false);   // FAR: +0
    const mid = planBedIntents([], 'CIVIC', 1.0, false);   // MID: -1.5
    const near = planBedIntents([], 'CIVIC', 1.3, false);  // NEAR: -3
    expect(gainOf(far, 'base')).toBeCloseTo(dbToGain(-18), 6);
    expect(gainOf(mid, 'base')).toBeCloseTo(dbToGain(-19.5), 6);
    expect(gainOf(near, 'base')).toBeCloseTo(dbToGain(-21), 6);
    expect(gainOf(far, 'color')).toBeCloseTo(dbToGain(-24), 6);
    // hold-previous penalty −6 dB stacks on top
    const held = planBedIntents([], 'CIVIC', 1.0, true);
    expect(gainOf(held, 'base')).toBeCloseTo(dbToGain(-25.5), 6);
    expect(bedZoomTrimDb(0.64)).toBe(0);
    expect(bedZoomTrimDb(0.65)).toBe(-1.5);
    expect(bedZoomTrimDb(1.16)).toBe(-3);
  });

  it('first bed fades in at 1.5 s; losing everything fades out at 1.5 s; unknown district starts nothing', () => {
    const first = planBedIntents([], 'CIVIC', 1.0, false);
    for (const p of first.intents) expect((p as { fadeInMs: number }).fadeInMs).toBe(BED_FADE_IN_MS);
    const live: BedVoice[] = first.voices;
    const gone = planBedIntents(live, null, 1.0, false);
    expect(gone.voices).toHaveLength(0);
    for (const s of gone.intents) expect((s as { fadeOutMs: number }).fadeOutMs).toBe(BED_FADE_OUT_MS);
    const unknown = planBedIntents(live, 'NOT_A_DISTRICT', 1.0, false);
    expect(unknown.intents.filter((i) => i.op === 'playLoop')).toHaveLength(0); // never start unknown keys
    expect(bedVoiceId('CIVIC', 'base')).toBe('bed:CIVIC:base'); // stable pooling identity
  });
});
