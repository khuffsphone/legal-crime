// COMBAT DEPTH · PART 2 — the rival offensive planner (state/math). It emits contestFront/interceptUnit ONLY
// when odds + cooldown + commitment all permit; nothing on cooldown / below-odds / over-cap / under-garrison;
// seeded-deterministic; and never beyond the commitment cap. ⚠ Conservative seeds — needs a human playtest.
import { describe, it, expect } from 'vitest';
import { planRivalOffense, RIVAL_OFFENSE_TUNING, type RivalOffenseInput, type RivalOffenseTuning } from '../src/sim/rivalOffense';

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
