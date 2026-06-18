import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { applyCommand, type CollectCommand } from '../src/sim/commands';
import { rivalCandidates, chooseRivalAction } from '../src/sim/ai';
import { tick } from '../src/sim/tick';
import { Rng } from '../src/sim/rng';
import { businessAccrual, businessEarner } from '../src/sim/economy';
import {
  accrueUncollected,
  collectibleBusinesses,
  pendingCollection,
  totalUncollected,
  collectionSafety,
  collectionFraction,
  uncollectedOf,
} from '../src/sim/collection';
import {
  COLLECT_SKIM_MAX,
  COLLECT_MIN_YIELD,
  COLLECT_HEAT,
  EXTORT_RATE,
} from '../src/sim/constants';
import type { Business, Gangster } from '../src/sim/types';

function front(id: string, baseIncome: number, extortedBy?: string, uncollected = 0): Business {
  return { id, name: id, kind: 'front', baseIncome, heatPerTick: 0, districtId: 'district-0', extortedBy, uncollected };
}

function operation(id: string, baseIncome: number, owner: string, uncollected = 0): Business {
  return { id, name: id, kind: 'numbers', baseIncome, heatPerTick: 4, districtId: 'district-0', ownerFamily: owner, uncollected };
}

function guard(id: string, skill: number, districtId: string): Gangster {
  return { id, name: id, skill, loyalty: 60, upkeep: 0, assignment: { type: 'guard', districtId } };
}

const collect = (familyId: string, districtId: string): CollectCommand => ({ type: 'collect', familyId, districtId });

describe('businessAccrual / businessEarner', () => {
  it('a front pays its extorter the extortion cut; an operation pays its owner base income', () => {
    expect(businessAccrual(front('f', 100, 'player'))).toBe(Math.floor(100 * EXTORT_RATE));
    expect(businessAccrual(front('f', 100))).toBe(0); // unextorted front earns nobody
    expect(businessAccrual(operation('o', 200, 'player'))).toBe(200);
    expect(businessEarner(front('f', 100, 'player'))).toBe('player');
    expect(businessEarner(operation('o', 200, 'rival-a'))).toBe('rival-a');
    expect(businessEarner(front('f', 100))).toBeUndefined();
  });
});

describe('accrueUncollected', () => {
  it('piles each business\'s takings into uncollected', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [front('f1', 100, 'player'), operation('o1', 200, 'player'), front('f2', 100)];
    accrueUncollected(s);
    expect(uncollectedOf(s.districts[0].businesses[0])).toBe(30);
    expect(uncollectedOf(s.districts[0].businesses[1])).toBe(200);
    expect(uncollectedOf(s.districts[0].businesses[2])).toBe(0); // unextorted front
    accrueUncollected(s);
    expect(uncollectedOf(s.districts[0].businesses[0])).toBe(60);
  });
});

describe('pendingCollection / totalUncollected / collectibleBusinesses', () => {
  it('sums only the family\'s own businesses with pending takings', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [
      front('f1', 100, 'player', 90),
      operation('o1', 200, 'player', 200),
      operation('o2', 200, 'rival-a', 500),
    ];
    expect(pendingCollection(s, 'player', 'district-0')).toBe(290);
    expect(pendingCollection(s, 'rival-a', 'district-0')).toBe(500);
    expect(collectibleBusinesses(s, 'player', 'district-0')).toHaveLength(2);
    s.districts[1].businesses = [front('f3', 100, 'player', 10)];
    expect(totalUncollected(s, 'player')).toBe(300);
  });
});

describe('collectionSafety', () => {
  it('starts at 1 and is reduced by presence and heat, raised by muscle, clamped', () => {
    expect(collectionSafety(0, 0, 0)).toBe(1);
    expect(collectionSafety(100, 0, 0)).toBeCloseTo(0.6, 6); // -0.004*100
    expect(collectionSafety(0, 100, 0)).toBeCloseTo(0.7, 6); // -0.003*100
    expect(collectionSafety(100, 100, 0)).toBeCloseTo(0.3, 6);
    expect(collectionSafety(100, 100, 20)).toBe(1); // +0.05*20 = +1 -> clamp 1
    expect(collectionSafety(100, 1000, 0)).toBe(COLLECT_MIN_YIELD); // floored
  });
});

describe('collectionFraction', () => {
  it('applies up to COLLECT_SKIM_MAX off the safe fraction by the roll', () => {
    expect(collectionFraction(1, 0)).toBe(1);
    expect(collectionFraction(1, 1)).toBeCloseTo(1 - COLLECT_SKIM_MAX, 6);
    expect(collectionFraction(0.5, 0.5)).toBeCloseTo(0.5 * (1 - 0.5 * COLLECT_SKIM_MAX), 6);
  });
});

describe('collect command', () => {
  it('collects (exact) at safety 1, banks dirty cash, clears the pile, and adds heat', () => {
    const s = createInitialState(4);
    s.player.heat = 0;
    s.districts[0].policePresence = 0; // safety = 1 with no muscle
    s.districts[0].businesses = [front('f1', 100, 'player', 100)];
    const cash0 = s.player.cash;

    // Mirror the single RNG draw the command makes to predict the exact take.
    const roll = new Rng(s.rngState).nextFloat();
    const expected = Math.floor(100 * collectionFraction(1, roll));

    applyCommand(s, collect('player', 'district-0'));

    expect(s.player.cash).toBe(cash0 + expected);
    expect(s.player.dirtyCash).toBe(expected); // the take is dirty
    expect(uncollectedOf(s.districts[0].businesses[0])).toBe(0); // pile swept
    expect(s.player.heat).toBe(COLLECT_HEAT);
    expect(s.log.at(-1)?.kind).toBe('collect');
  });

  it('high police presence and heat with no muscle slashes the take', () => {
    const s = createInitialState(4);
    s.player.heat = 100;
    s.districts[0].policePresence = 100; // safety 0.3
    s.districts[0].businesses = [front('f1', 1000, 'player', 1000)];
    const cash0 = s.player.cash;
    applyCommand(s, collect('player', 'district-0'));
    const collected = s.player.cash - cash0;
    expect(collected).toBeGreaterThan(0);
    expect(collected).toBeLessThanOrEqual(Math.floor(1000 * 0.3)); // capped by safety
    expect(collected).toBeLessThan(1000);
  });

  it('escorting muscle recovers more of the take (same seed)', () => {
    const run = (muscleSkill: number) => {
      const s = createInitialState(5);
      s.player.heat = 0;
      s.districts[0].policePresence = 100; // safety 0.6 with no muscle
      s.districts[0].businesses = [front('f1', 1000, 'player', 1000)];
      if (muscleSkill > 0) s.player.gangsters = [guard('g1', muscleSkill, 'district-0')];
      const cash0 = s.player.cash;
      applyCommand(s, collect('player', 'district-0'));
      return s.player.cash - cash0;
    };
    expect(run(10)).toBeGreaterThanOrEqual(run(0));
    expect(run(10)).toBeGreaterThan(0);
  });

  it('only sweeps the collecting family\'s businesses', () => {
    const s = createInitialState(4);
    s.player.heat = 0;
    s.districts[0].policePresence = 0;
    s.districts[0].businesses = [
      front('f1', 100, 'player', 100),
      operation('ro', 200, 'rival-a', 500),
    ];
    applyCommand(s, collect('player', 'district-0'));
    expect(uncollectedOf(s.districts[0].businesses[0])).toBe(0); // player's swept
    expect(uncollectedOf(s.districts[0].businesses[1])).toBe(500); // rival's untouched
  });

  it('is a no-op when there is nothing to collect', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [front('f1', 100, 'player', 0)];
    applyCommand(s, collect('player', 'district-0'));
    expect(s.log.at(-1)?.kind).toBe('collect-empty');
  });

  it('is deterministic: same seed yields the same take', () => {
    const run = (seed: number) => {
      const s = createInitialState(seed);
      s.districts[0].businesses = [front('f1', 500, 'player', 500)];
      applyCommand(s, collect('player', 'district-0'));
      return s.player.cash;
    };
    expect(run(17)).toBe(run(17));
  });
});

describe('rival AI uses collectors', () => {
  it('a rival with a waiting pile lists and chooses collect', () => {
    const s = createInitialState(1);
    const r = s.rivals[0];
    r.cash = 100; // too poor for any funded action
    s.districts[2].businesses = [front('rf', 200, 'rival-a', 500)];
    const cands = rivalCandidates(s, r);
    expect(cands.some((c) => c.command.type === 'collect')).toBe(true);
    const cmd = chooseRivalAction(s, r, new Rng(s.rngState));
    expect(cmd?.type).toBe('collect');
  });

  it('collect is NOT a candidate when nothing is pending (keeps fresh-state behavior)', () => {
    const s = createInitialState(1);
    expect(rivalCandidates(s, s.rivals[0]).some((c) => c.command.type === 'collect')).toBe(false);
  });

  it('over several ticks a rival collects and banks cash from its operations', () => {
    const s = createInitialState(3);
    const r = s.rivals[0];
    r.cash = 100;
    s.districts[2].businesses = [operation('rop', 200, 'rival-a', 0)];
    // accrual happens in tick; the rival AI should collect on subsequent ticks
    for (let i = 0; i < 6; i++) tick(s);
    expect(r.cash).toBeGreaterThan(100);
  });
});
