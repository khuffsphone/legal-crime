import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  applyCommand,
  extortSuccessChance,
  muscleInDistrict,
  type ExtortCommand,
} from '../src/sim/commands';
import { controlOf } from '../src/sim/territory';
import { tick } from '../src/sim/tick';
import { EXTORT_HEAT, EXTORT_MIN_CONTROL, EXTORT_RATE } from '../src/sim/constants';
import type { Business, Gangster } from '../src/sim/types';

function front(id: string, baseIncome: number): Business {
  return { id, name: id, kind: 'front', baseIncome, heatPerTick: 0, districtId: 'district-0' };
}

function guard(id: string, skill: number, districtId: string): Gangster {
  return { id, name: id, skill, loyalty: 50, upkeep: 0, assignment: { type: 'guard', districtId } };
}

function extort(familyId: string, businessId: string): ExtortCommand {
  return { type: 'extort', familyId, businessId };
}

describe('extortSuccessChance', () => {
  it('equals control/100 with no muscle', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [front('f1', 100)];
    s.districts[0].control.player = 40;
    expect(extortSuccessChance(s, 'player', 'f1')).toBeCloseTo(0.4, 6);
  });

  it('adds a muscle bonus of 0.04 per skill point and clamps to 1', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [front('f1', 100)];
    s.districts[0].control.player = 50;
    s.player.gangsters = [guard('g1', 5, 'district-0')]; // +0.20
    expect(extortSuccessChance(s, 'player', 'f1')).toBeCloseTo(0.7, 6);

    s.districts[0].control.player = 100;
    s.player.gangsters = [guard('g1', 10, 'district-0')]; // 1.0 + 0.4 -> clamp 1
    expect(extortSuccessChance(s, 'player', 'f1')).toBe(1);
  });

  it('muscleInDistrict only counts guards in the right district', () => {
    const s = createInitialState(1);
    s.player.gangsters = [
      guard('g1', 5, 'district-0'),
      guard('g2', 3, 'district-1'),
      { id: 'g3', name: 'g3', skill: 9, loyalty: 50, upkeep: 0, assignment: { type: 'idle' } },
    ];
    expect(muscleInDistrict(s.player, 'district-0')).toBe(5);
    expect(muscleInDistrict(s.player, 'district-1')).toBe(3);
  });
});

describe('extort command — gating', () => {
  it('is blocked (no RNG draw) when control is below the minimum', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [front('f1', 100)];
    s.districts[0].control.player = EXTORT_MIN_CONTROL - 1;
    const cursorBefore = s.rngState;

    applyCommand(s, extort('player', 'f1'));

    expect(s.districts[0].businesses[0].extortedBy).toBeUndefined();
    expect(s.rngState).toBe(cursorBefore); // cursor untouched on a deterministic block
    expect(s.log.at(-1)?.kind).toBe('extort-blocked');
  });

  it('rejects extorting a non-front business', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [
      { id: 'o1', name: 'o1', kind: 'numbers', baseIncome: 200, heatPerTick: 4, districtId: 'district-0' },
    ];
    s.districts[0].control.player = 100;
    applyCommand(s, extort('player', 'o1'));
    expect(s.log.at(-1)?.kind).toBe('extort-invalid');
  });
});

describe('extort command — resolution', () => {
  it('guaranteed success at full control sets extortedBy and adds heat', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [front('f1', 100)];
    s.districts[0].control.player = 100; // chance = 1.0 -> always succeeds
    const heat0 = s.player.heat;

    applyCommand(s, extort('player', 'f1'));

    expect(s.districts[0].businesses[0].extortedBy).toBe('player');
    expect(s.player.heat).toBe(heat0 + EXTORT_HEAT);
    expect(s.log.at(-1)?.kind).toBe('extort-success');
  });

  it('produces both successes and failures across seeds at partial control', () => {
    let successes = 0;
    let failures = 0;
    for (let seed = 0; seed < 60; seed++) {
      const s = createInitialState(seed);
      s.districts[0].businesses = [front('f1', 100)];
      s.districts[0].control.player = EXTORT_MIN_CONTROL; // chance 0.2
      applyCommand(s, extort('player', 'f1'));
      if (s.districts[0].businesses[0].extortedBy === 'player') successes++;
      else failures++;
    }
    // At 0.2 we expect mostly failures but some successes — both branches exercised.
    expect(successes).toBeGreaterThan(0);
    expect(failures).toBeGreaterThan(successes);
  });

  it('is deterministic: same seed yields the same extortion outcome', () => {
    const run = (seed: number) => {
      const s = createInitialState(seed);
      s.districts[0].businesses = [front('f1', 100)];
      s.districts[0].control.player = EXTORT_MIN_CONTROL;
      applyCommand(s, extort('player', 'f1'));
      return s.districts[0].businesses[0].extortedBy === 'player';
    };
    expect(run(3)).toBe(run(3));
  });
});

describe('extortion income & heat over ticks', () => {
  it('a successfully extorted front pays the extorter EXTORT_RATE each tick', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [front('f1', 100)];
    s.districts[0].control.player = 100;
    applyCommand(s, extort('player', 'f1'));
    const cash0 = s.player.cash;
    const expected = Math.floor(100 * EXTORT_RATE); // 30

    tick(s);
    expect(s.player.cash).toBe(cash0 + expected);
    tick(s);
    expect(s.player.cash).toBe(cash0 + 2 * expected);
  });

  it('an extorted front adds EXTORT_HEAT to the extorter each tick', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [front('f1', 100)];
    s.districts[0].control.player = 100;
    applyCommand(s, extort('player', 'f1'));
    const heatAfterCommand = s.player.heat; // includes the act's one-off heat

    tick(s);
    expect(s.player.heat).toBe(heatAfterCommand + EXTORT_HEAT);
  });

  it('control lookup helper reads the right family', () => {
    const s = createInitialState(1);
    expect(controlOf(s.districts[0], 'player')).toBe(30);
    expect(controlOf(s.districts[0], 'rival-a')).toBe(0);
  });
});
