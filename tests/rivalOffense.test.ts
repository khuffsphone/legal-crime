// COMBAT DEPTH · PART 2 — the rival offensive planner (state/math). It emits contestFront/interceptUnit ONLY
// when odds + cooldown + commitment all permit; nothing on cooldown / below-odds / over-cap / under-garrison;
// seeded-deterministic; and never beyond the commitment cap. ⚠ Conservative seeds — needs a human playtest.
import { describe, it, expect } from 'vitest';
import {
  planRivalOffense, RIVAL_OFFENSE_TUNING,
  committedForce, planTelegraph, strikeLeadMs, shouldRetreat,
  RIVAL_TELEGRAPH_LEAD_MIN_MS, RIVAL_TELEGRAPH_LEAD_MAX_MS, RIVAL_RETREAT_TUNING,
  type RivalOffenseInput, type RivalOffenseTuning, type CommittableUnit,
} from '../src/sim/rivalOffense';
import { unitCombatStrength } from '../src/sim/combatTuning';

const ALWAYS: RivalOffenseTuning = { ...RIVAL_OFFENSE_TUNING, commitChance: 1 }; // force the commit roll for the gate tests

function eligible(over: Partial<RivalOffenseInput> = {}): RivalOffenseInput {
  return {
    rivalId: 'rival-a',
    nowSec: 1000,
    lastOffenseSec: 0,        // far past cooldown
    activeOrders: 0,
    freeMuscle: 4,
    attackerStrength: 5,
    fronts: [{ frontId: 'f1', gx: 10, gy: 10, defenderStrength: 2 }],   // 5 / 2 = 2.5 ≥ 1.6 → advantage
    units: [{ id: 'p1', gx: 20, gy: 20, defenderStrength: 1 }],
    rngState: 12345,
    ...over,
  };
}

describe('the planner commits ONLY when odds + cooldown + commitment all permit', () => {
  it('all gates pass + a forced commit → emits ONE best-odds order (contestFront or interceptUnit)', () => {
    const plan = planRivalOffense(eligible(), ALWAYS);
    expect(plan.orders).toHaveLength(1); // maxConcurrent = 1
    expect(['contestFront', 'interceptUnit']).toContain(plan.orders[0].kind);
  });
  it('NOT on cooldown → nothing', () => {
    expect(planRivalOffense(eligible({ lastOffenseSec: 990 }), ALWAYS).orders).toHaveLength(0); // 1000-990 < 60
  });
  it('BELOW the odds → nothing (no clear advantage on any target)', () => {
    const weak = eligible({ attackerStrength: 2, fronts: [{ frontId: 'f1', gx: 1, gy: 1, defenderStrength: 2 }], units: [{ id: 'p1', gx: 2, gy: 2, defenderStrength: 2 }] });
    expect(planRivalOffense(weak, ALWAYS).orders).toHaveLength(0); // 2 / 2 = 1.0 < 1.6
  });
  it('AT the commitment cap → nothing', () => {
    expect(planRivalOffense(eligible({ activeOrders: 1 }), ALWAYS).orders).toHaveLength(0);
  });
  it('UNDER the garrison guard → nothing', () => {
    expect(planRivalOffense(eligible({ freeMuscle: 1 }), ALWAYS).orders).toHaveLength(0);
  });
});

describe('commitment cap + best-odds selection', () => {
  it('never emits beyond (maxConcurrent − activeOrders), even with many favourable targets', () => {
    const many = eligible({
      fronts: [
        { frontId: 'f1', gx: 1, gy: 1, defenderStrength: 1 },
        { frontId: 'f2', gx: 2, gy: 2, defenderStrength: 1 },
      ],
      units: [
        { id: 'p1', gx: 3, gy: 3, defenderStrength: 1 },
        { id: 'p2', gx: 4, gy: 4, defenderStrength: 1 },
      ],
    });
    const plan = planRivalOffense(many, ALWAYS);
    expect(plan.orders.length).toBeLessThanOrEqual(RIVAL_OFFENSE_TUNING.maxConcurrent);
  });
});

describe('seeded-deterministic + timid', () => {
  it('same input + rngState ⇒ identical plan AND identical advanced rngState', () => {
    const a = planRivalOffense(eligible({ rngState: 777 }));
    const b = planRivalOffense(eligible({ rngState: 777 }));
    expect(a.orders).toEqual(b.orders);
    expect(a.rngState).toBe(b.rngState);
  });
  it('the commit roll advances the RNG when eligible (so the world stays deterministic)', () => {
    const p = planRivalOffense(eligible({ rngState: 4242 }));
    expect(p.rngState).not.toBe(4242); // the seeded roll was drawn
  });
  it('⚠ BIASED TIMID — across many seeds an eligible rival mostly HOLDS BACK (commit rate ≈ commitChance)', () => {
    let commits = 0;
    const N = 400;
    for (let s = 1; s <= N; s++) if (planRivalOffense(eligible({ rngState: s * 2654435761 >>> 0 })).orders.length > 0) commits++;
    const rate = commits / N;
    expect(rate).toBeLessThan(0.5);                 // usually waits
    expect(rate).toBeGreaterThan(0.15);             // but not frozen — roughly the 0.35 commitChance
  });
});

// ── COMBAT DEPTH FINALIZE (Part B) — ACCURATE commit force ─────────────────────────────────────────
describe('committedForce — honest odds (committed force, not the whole idle pool) + weapon weighting', () => {
  const fist: CommittableUnit = {};
  const tommy: CommittableUnit = { weapon: 'rifle' };
  it('weapon tier weights strength — a tommy unit scores stronger than a fist unit', () => {
    expect(unitCombatStrength(tommy)).toBeGreaterThan(unitCombatStrength(fist));
    expect(unitCombatStrength({ weapon: 'pistol', skill: 8 })).toBeGreaterThan(unitCombatStrength({ weapon: 'pistol', skill: 0 }));
  });
  it('the committed strength is the SUM of the sent units, NOT the whole pool count', () => {
    const free = [tommy, fist, fist, fist]; // 4 free
    const cf = committedForce(free, 2);      // reserve 2 ⇒ send the 2 strongest
    expect(cf.units.length).toBe(2);
    expect(cf.strength).toBeCloseTo(cf.units.reduce((s, u) => s + unitCombatStrength(u), 0));
    expect(cf.strength).toBeLessThan(unitCombatStrength(tommy) + unitCombatStrength(fist) + unitCombatStrength(fist) + unitCombatStrength(fist)); // less than crediting all 4
  });
  it('sends strongest-first (the tommy is always in the committed force)', () => {
    const cf = committedForce([fist, fist, tommy], RIVAL_OFFENSE_TUNING.minMuscle); // reserve 2 ⇒ send 1
    expect(cf.units).toHaveLength(1);
    expect(cf.units[0]).toBe(tommy);
  });
  it('RESERVE FLOOR never violated — at least `reserve` free units are withheld', () => {
    for (const n of [2, 3, 5, 8]) {
      const free = Array.from({ length: n }, () => fist);
      const cf = committedForce(free, RIVAL_OFFENSE_TUNING.minMuscle);
      expect(free.length - cf.units.length).toBeGreaterThanOrEqual(RIVAL_OFFENSE_TUNING.minMuscle);
    }
  });
  it('reserve ≥ pool ⇒ commits nothing (cannot dip under the garrison)', () => {
    expect(committedForce([fist, fist], 2).units).toHaveLength(0);
  });
});

// ── COMBAT DEPTH FINALIZE (Part C-1) — the TELEGRAPH ───────────────────────────────────────────────
describe('planTelegraph — one telegraph per intent, reason populated, higher consequence = longer lead', () => {
  it('lead scales with consequence and is clamped to [MIN, MAX]', () => {
    expect(strikeLeadMs(0)).toBe(RIVAL_TELEGRAPH_LEAD_MIN_MS);
    expect(strikeLeadMs(1)).toBe(RIVAL_TELEGRAPH_LEAD_MAX_MS);
    expect(strikeLeadMs(-5)).toBe(RIVAL_TELEGRAPH_LEAD_MIN_MS); // clamped
    expect(strikeLeadMs(9)).toBe(RIVAL_TELEGRAPH_LEAD_MAX_MS);  // clamped
    expect(strikeLeadMs(1)).toBeGreaterThan(strikeLeadMs(0.2)); // higher consequence ⇒ longer lead
  });
  it('every committed intent yields a populated reason', () => {
    const t1 = planTelegraph('interceptUnit', { consequence01: 0.8, carrying: true });
    expect(t1.reason).toBe('route exposure');
    expect(t1.leadMs).toBeGreaterThanOrEqual(RIVAL_TELEGRAPH_LEAD_MIN_MS);
    expect(planTelegraph('interceptUnit', { consequence01: 0.9, carrying: true, escorted: true }).reason).toBe('escort gap');
    expect(planTelegraph('interceptUnit', { consequence01: 0.1 }).reason).toBe('proximity');
    expect(planTelegraph('contestFront', { consequence01: 0.7 }).reason).toBe('payout');
    expect(planTelegraph('contestFront', { consequence01: 0 }).reason).toBe('cooldown window');
  });
});

// ── COMBAT DEPTH FINALIZE (Part C-2) — RETREAT ─────────────────────────────────────────────────────
describe('shouldRetreat — backs off when the edge collapses or losses pile up', () => {
  it('holds while it keeps the edge and losses are light', () => {
    expect(shouldRetreat(2.0, 0)).toBe(false);
    expect(shouldRetreat(1.5, 0.25)).toBe(false);
  });
  it('retreats when local advantage drops below abortAdvantage (odds-collapse)', () => {
    expect(shouldRetreat(RIVAL_RETREAT_TUNING.abortAdvantage - 0.01, 0)).toBe(true);
    expect(shouldRetreat(0.8, 0)).toBe(true);
  });
  it('retreats when losses reach the cap, even if odds still look fine', () => {
    expect(shouldRetreat(3.0, RIVAL_RETREAT_TUNING.maxLossFraction)).toBe(true);
  });
});
