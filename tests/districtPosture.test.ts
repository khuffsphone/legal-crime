// DISTRICT RACKET POSTURE (Variant A) — the pure model (state/math, never pixels). Covers the modifier
// table + application wrappers, the change cooldown / next-period-boundary promotion (slower while
// CONTESTED), the heat/evidence interaction tied to dirty exposure with bounded bribery bends (never
// immunity), that collectors stay AUTONOMOUS (posture only scales carry/risk, adds no routing), and that a
// rival contest NEVER leaks a hidden unit (NO-X-RAY token).
import { describe, it, expect } from 'vitest';
import {
  POSTURE_MODS, POSTURES, postureOf, pendingPostureOf,
  posturedDirtyIncome, posturedLocalHeat, posturedControlDecay, posturedCollectorCarry,
  posturedCollectorSafety, posturedDefense, posturedFederalEvidence, aggressiveBackfireMitigation,
  isPosturable, canRequestPosture, requestPosture, applyPostureBoundary, postureCooldownTicks,
  posturePreviewRow, postureContestRumor,
  POSTURE_SAFETY_CAP, POSTURE_EVIDENCE_FLOOR, POSTURE_CONTESTED_EXTRA_TICKS,
} from '../src/sim';
import { UNKNOWN, VISIBLE_ONLY } from '../src/sim/opPreviewTypes';
import type { GameState, District, Business } from '../src/sim/types';

// ── minimal pure fixtures ────────────────────────────────────────────────────────────────────────
function front(id: string, earner = 'player'): Business {
  return { id, name: id, kind: 'front', baseIncome: 100, uncollected: 0, extortedBy: earner, tile: { gx: 0, gy: 0 } } as unknown as Business;
}
function mkDistrict(id: string, over: Partial<District> = {}): District {
  return { id, name: id, control: {}, policePresence: 0, businesses: [front(`${id}-b`)], ...over } as District;
}
function mkState(districts: District[], over: Partial<GameState> = {}): GameState {
  return {
    tick: 0,
    player: { id: 'player', name: 'You', isPlayer: true } as GameState['player'],
    rivals: [{ id: 'rival-a', name: 'The Moretti' }],
    districts, units: [], contests: [], log: [],
    ...over,
  } as unknown as GameState;
}

describe('the modifier table — starting tuning, BALANCED is neutral', () => {
  it('BALANCED is all 1.0 (the default baseline)', () => {
    for (const v of Object.values(POSTURE_MODS.BALANCED)) expect(v).toBe(1);
    expect(POSTURES).toEqual(['BALANCED', 'AGGRESSIVE', 'FORTIFIED', 'LOW_PROFILE']);
  });
  it('AGGRESSIVE/FORTIFIED/LOW_PROFILE carry the spec trade-offs', () => {
    expect(POSTURE_MODS.AGGRESSIVE.dirtyIncome).toBeCloseTo(1.25);
    expect(POSTURE_MODS.AGGRESSIVE.localHeatGain).toBeCloseTo(1.20);
    expect(POSTURE_MODS.AGGRESSIVE.defense).toBeCloseTo(0.90);
    expect(POSTURE_MODS.FORTIFIED.defense).toBeCloseTo(1.25);
    expect(POSTURE_MODS.FORTIFIED.collectorAmbushRisk).toBeCloseTo(0.80);
    expect(POSTURE_MODS.LOW_PROFILE.dirtyIncome).toBeCloseTo(0.70);
    expect(POSTURE_MODS.LOW_PROFILE.localHeatGain).toBeCloseTo(0.70);
    expect(POSTURE_MODS.LOW_PROFILE.federalEvidenceGain).toBeCloseTo(0.80);
  });
});

describe('modifier APPLICATION wraps a base value (BALANCED ⇒ identity)', () => {
  const bal = mkDistrict('d', { posture: { active: 'BALANCED', setTick: 0 } });
  const agg = mkDistrict('d', { posture: { active: 'AGGRESSIVE', setTick: 0 } });
  const lp = mkDistrict('d', { posture: { active: 'LOW_PROFILE', setTick: 0 } });
  const fort = mkDistrict('d', { posture: { active: 'FORTIFIED', setTick: 0 } });
  it('a district with no posture reads BALANCED and is an identity wrap', () => {
    const plain = mkDistrict('d');
    expect(postureOf(plain)).toBe('BALANCED');
    expect(posturedDirtyIncome(100, plain)).toBe(100);
    expect(posturedLocalHeat(10, plain)).toBe(10);
  });
  it('dirty income scales (floored) and heat scales', () => {
    expect(posturedDirtyIncome(100, agg)).toBe(125);
    expect(posturedDirtyIncome(100, lp)).toBe(70);
    expect(posturedDirtyIncome(101, agg)).toBe(126);   // floor(126.25)
    expect(posturedLocalHeat(10, agg)).toBeCloseTo(12);
    expect(posturedLocalHeat(10, lp)).toBeCloseTo(7);
    expect(posturedLocalHeat(10, bal)).toBe(10);
  });
  it('FORTIFIED resists control decay (decays slower)', () => {
    expect(posturedControlDecay(10, fort)).toBeCloseTo(8);   // 10 / 1.25
    expect(posturedControlDecay(10, bal)).toBe(10);
  });
});

describe('COLLECTORS stay autonomous — posture only scales carry/risk, never routes', () => {
  const fort = mkDistrict('d', { posture: { active: 'FORTIFIED', setTick: 0 } });
  const lp = mkDistrict('d', { posture: { active: 'LOW_PROFILE', setTick: 0 } });
  it('carry scales by posture', () => {
    expect(posturedCollectorCarry(100, lp)).toBeCloseTo(80);   // -20%
    expect(posturedCollectorCarry(100, mkDistrict('d', { posture: { active: 'AGGRESSIVE', setTick: 0 } }))).toBeCloseTo(115);
  });
  it('FORTIFIED + police bribe raise safety but NEVER to immunity (capped < 1)', () => {
    const base = 0.6;
    expect(posturedCollectorSafety(base, fort)).toBeGreaterThan(base);          // safer
    expect(posturedCollectorSafety(0.99, fort, 1000)).toBeLessThanOrEqual(POSTURE_SAFETY_CAP);
    expect(posturedCollectorSafety(1, fort, 1000)).toBeLessThan(1);             // never 1.0
  });
  it('requesting a posture mutates ONLY district.posture — no units/routes touched (autonomy preserved)', () => {
    const s = mkState([mkDistrict('d1')]);
    const unitsRef = s.units;
    requestPosture(s.districts[0], 'AGGRESSIVE', 0);
    expect(s.units).toBe(unitsRef);          // same array — no routing added
    expect(s.units.length).toBe(0);
    expect(s.districts[0].posture?.pending).toBe('AGGRESSIVE');
  });
});

describe('the change state machine — cooldown + next-period-boundary, slower while CONTESTED', () => {
  it('only a district you RUN is posturable', () => {
    const held = mkState([mkDistrict('d1')]); // all businesses player-extorted ⇒ HELD
    expect(isPosturable(held, 'd1')).toBe(true);
    const neutral = mkState([mkDistrict('d1', { businesses: [front('x', 'rival-a')] })]); // rival-earned ⇒ not yours
    expect(isPosturable(neutral, 'd1')).toBe(false);
  });
  it('requestPosture STAGES; applyPostureBoundary PROMOTES at the next boundary', () => {
    const s = mkState([mkDistrict('d1')]);
    expect(requestPosture(s.districts[0], 'AGGRESSIVE', 0)).toBe(true);
    expect(postureOf(s.districts[0])).toBe('BALANCED');           // not yet active
    expect(pendingPostureOf(s.districts[0])).toBe('AGGRESSIVE');
    expect(applyPostureBoundary(s, 'd1', 0)).toBeNull();          // same tick — delay not met
    expect(applyPostureBoundary(s, 'd1', 1)).toBe('AGGRESSIVE');  // next boundary — promoted
    expect(postureOf(s.districts[0])).toBe('AGGRESSIVE');
    expect(pendingPostureOf(s.districts[0])).toBeNull();
  });
  it('cooldown blocks a second change until it has elapsed since the last took effect', () => {
    const s = mkState([mkDistrict('d1', { posture: { active: 'AGGRESSIVE', setTick: 5 } })]);
    expect(canRequestPosture(s, 'd1', 5).ok).toBe(false);                 // just changed
    expect(canRequestPosture(s, 'd1', 5 + postureCooldownTicks(s, 'd1')).ok).toBe(true);
  });
  it('a CONTESTED district takes LONGER — bigger cooldown AND an extra boundary to land', () => {
    const s = mkState([mkDistrict('d1')], { contests: [{ districtId: 'd1' }] as GameState['contests'] });
    expect(postureCooldownTicks(s, 'd1')).toBe(postureCooldownTicks(mkState([mkDistrict('d1')]), 'd1') + POSTURE_CONTESTED_EXTRA_TICKS);
    requestPosture(s.districts[0], 'FORTIFIED', 0);
    expect(applyPostureBoundary(s, 'd1', 1)).toBeNull();           // one boundary isn't enough while contested
    expect(applyPostureBoundary(s, 'd1', 1 + POSTURE_CONTESTED_EXTRA_TICKS)).toBe('FORTIFIED');
  });
});

describe('federal ladder — evidence tied to DIRTY exposure, bribery bends but never immunity', () => {
  const lp = mkDistrict('d', { posture: { active: 'LOW_PROFILE', setTick: 0 } });
  const agg = mkDistrict('d', { posture: { active: 'AGGRESSIVE', setTick: 0 } });
  it('LOW_PROFILE cuts evidence gain; it scales the passed dirty-exposure base (no flat punishment)', () => {
    expect(posturedFederalEvidence(0, lp)).toBe(0);                 // no dirty exposure → no evidence, ever
    expect(posturedFederalEvidence(100, lp)).toBeCloseTo(80);       // ×0.80
    expect(posturedFederalEvidence(100, agg)).toBeCloseTo(100);     // AGGRESSIVE evidence rises via dirty income, not a flat hit
  });
  it('the FEDS bribe bends evidence DOWN but a hard floor keeps it non-zero (never immunity)', () => {
    const bent = posturedFederalEvidence(100, lp, 10000);
    expect(bent).toBeLessThan(posturedFederalEvidence(100, lp));    // bribe helped
    expect(bent).toBeGreaterThanOrEqual(100 * POSTURE_EVIDENCE_FLOOR); // but never below the floor
  });
  it('POLICE bribe bends FORTIFIED defense up, bounded; JUDGES soften a FAILED AGGRESSIVE, never fully', () => {
    const fort = mkDistrict('d', { posture: { active: 'FORTIFIED', setTick: 0 } });
    expect(posturedDefense(100, fort, 10000)).toBeGreaterThan(posturedDefense(100, fort)); // police helps
    expect(aggressiveBackfireMitigation(agg, 10000)).toBeLessThan(1);   // never full immunity
    expect(aggressiveBackfireMitigation(fort, 10000)).toBe(0);          // only AGGRESSIVE backfires
  });
});

describe('NO-X-RAY — a rival contest of a postured district never leaks a hidden unit', () => {
  it('a contest surfaces ONLY as a token (Unknown / visible only) — never a count or position', () => {
    const s = mkState([mkDistrict('d1')], { contests: [{ districtId: 'd1' }] as GameState['contests'] });
    const seen = postureContestRumor(s, 'd1', true);
    const fogged = postureContestRumor(s, 'd1', false);
    expect(seen.value).toBe(UNKNOWN);
    expect(fogged.value).toBe(VISIBLE_ONLY);
    for (const r of [seen, fogged]) expect(r.value).not.toMatch(/\d/); // never a number
  });
  it('no contest → a rumor, hotter under AGGRESSIVE, still never a number', () => {
    const calm = mkState([mkDistrict('d1')]);
    expect(postureContestRumor(calm, 'd1').value).toBe('none reported');
    const hot = mkState([mkDistrict('d1', { posture: { active: 'AGGRESSIVE', setTick: 0 } })]);
    expect(postureContestRumor(hot, 'd1').value).not.toMatch(/\d/);
  });
  it('the op-preview modifier line is plain numbers, no colour fields', () => {
    const row = posturePreviewRow(mkDistrict('d', { posture: { active: 'AGGRESSIVE', setTick: 0 } }));
    expect(row.label).toBe('Posture');
    expect(row.value).toMatch(/AGGRESSIVE/);
    expect(row.value).toMatch(/dirty income \+25%/);
    expect(posturePreviewRow(mkDistrict('d')).value).toMatch(/BALANCED/);
  });
});
