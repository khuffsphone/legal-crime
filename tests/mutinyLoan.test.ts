import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { applyCommand, type RepayLoanCommand } from '../src/sim/commands';
import { atRiskCount, mutinyConditionMet, resolveLoyalty } from '../src/sim/gangsters';
import { tick } from '../src/sim/tick';
import {
  MUTINY_SKIM,
  LOAN_INTEREST_RATE,
  DEBT_CEILING,
  DESERT_LOYALTY,
} from '../src/sim/constants';
import type { Family, Gangster } from '../src/sim/types';

function gangster(id: string, loyalty: number, upkeep = 0): Gangster {
  return { id, name: id, skill: 5, loyalty, upkeep, assignment: { type: 'idle' } };
}

function crewOf(loyalties: number[]): Family {
  const s = createInitialState(1);
  s.player.gangsters = loyalties.map((l, i) => gangster(`g${i}`, l));
  return s.player;
}

const repay = (familyId: string, amount: number): RepayLoanCommand => ({ type: 'repayLoan', familyId, amount });

describe('mutiny helpers', () => {
  it('atRiskCount counts gangsters below desertion loyalty', () => {
    expect(atRiskCount(crewOf([0, 10, 50, 90]))).toBe(2); // 0 and 10 are below 20
  });

  it('mutinyConditionMet needs a big enough, disloyal-enough crew', () => {
    expect(mutinyConditionMet(crewOf([0, 0, 0, 90]))).toBe(true); // 3/4 at risk, crew 4
    expect(mutinyConditionMet(crewOf([0, 90, 90, 90]))).toBe(false); // only 1/4 at risk
    expect(mutinyConditionMet(crewOf([0, 0]))).toBe(false); // crew below minimum
    expect(mutinyConditionMet(crewOf([0, 0, 90]))).toBe(true); // 2/3 at risk, crew at minimum
  });
});

describe('resolveLoyalty — mutiny', () => {
  it('a soured crew mutinies: the disloyal cohort walks out together and skims cash', () => {
    let mutinies = 0;
    for (let seed = 0; seed < 40; seed++) {
      const s = createInitialState(seed);
      s.player.cash = 1000;
      s.player.dirtyCash = 0;
      s.player.heat = 0;
      // 3 disloyal + 1 loyal; after +2 drift the three are still well below threshold
      s.player.gangsters = [
        gangster('a', 0),
        gangster('b', 0),
        gangster('c', 0),
        gangster('loyal', 90),
      ];
      resolveLoyalty(s);
      if (s.log.some((e) => e.kind === 'mutiny')) {
        mutinies++;
        expect(s.player.gangsters).toHaveLength(1); // only the loyal one stayed
        expect(s.player.gangsters[0].loyalty).toBeGreaterThanOrEqual(DESERT_LOYALTY);
        expect(s.player.cash).toBe(1000 - Math.floor(1000 * MUTINY_SKIM)); // 750
      }
    }
    expect(mutinies).toBeGreaterThan(0);
  });

  it('never mutinies with a crew below the minimum size', () => {
    for (let seed = 0; seed < 30; seed++) {
      const s = createInitialState(seed);
      s.player.cash = 1000;
      s.player.gangsters = [gangster('a', 0), gangster('b', 0)]; // crew 2 < min
      resolveLoyalty(s);
      expect(s.log.some((e) => e.kind === 'mutiny')).toBe(false);
    }
  });
});

describe('auto-loan & debt', () => {
  it('a cash shortfall is auto-loaned into debt; cash never goes negative', () => {
    const s = createInitialState(1);
    s.player.cash = 100;
    s.player.gangsters = [gangster('g', 80, 500)]; // upkeep 500 > cash
    tick(s);
    expect(s.player.cash).toBe(0);
    expect(s.player.debt).toBe(400); // 500 - 100 shortfall
    expect(s.log.some((e) => e.kind === 'auto-loan')).toBe(true);
  });

  it('debt compounds interest each tick', () => {
    const s = createInitialState(1);
    s.player.cash = 5000; // plenty, no new borrowing
    s.player.debt = 1000;
    tick(s);
    expect(s.player.debt).toBe(Math.floor(1000 * (1 + LOAN_INTEREST_RATE))); // 1100
  });

  it('repayLoan pays down debt with cash, capped by both', () => {
    const s = createInitialState(1);
    s.player.cash = 600;
    s.player.debt = 1000;
    applyCommand(s, repay('player', 400));
    expect(s.player.debt).toBe(600);
    expect(s.player.cash).toBe(200);
  });

  it('repayLoan is capped by available cash', () => {
    const s = createInitialState(1);
    s.player.cash = 150;
    s.player.debt = 1000;
    applyCommand(s, repay('player', 999));
    expect(s.player.cash).toBe(0);
    expect(s.player.debt).toBe(850); // only 150 could be paid
  });

  it('repayLoan is denied with no debt', () => {
    const s = createInitialState(1);
    s.player.cash = 500;
    s.player.debt = 0;
    applyCommand(s, repay('player', 100));
    expect(s.log.at(-1)?.kind).toBe('repay-denied');
  });

  it('a debt spiral past the ceiling is bankruptcy', () => {
    const s = createInitialState(1);
    s.player.cash = 0;
    s.player.gangsters = [gangster('g', 80, DEBT_CEILING + 1000)];
    tick(s);
    expect(s.player.debt).toBeGreaterThan(DEBT_CEILING);
    expect(s.status).toBe('lost');
    expect(s.lossReason).toBe('bankrupt');
  });

  it('is deterministic for the same seed and finances', () => {
    const build = (seed: number) => {
      const s = createInitialState(seed);
      s.player.cash = 200;
      s.player.gangsters = [gangster('g', 80, 350)];
      tick(s); // borrows
      tick(s); // interest + more borrow
      applyCommand(s, repay('player', 50));
      return s;
    };
    expect(build(12)).toEqual(build(12));
  });
});
