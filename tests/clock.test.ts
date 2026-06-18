import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { applyCommand } from '../src/sim/commands';
import { tick } from '../src/sim/tick';
import { advanceClock, weekProgress, secondsUntilNextWeek } from '../src/sim/clock';
import { WEEK_DURATION_SECONDS, OPERATION_INCOME } from '../src/sim/constants';
import { uncollectedOf } from '../src/sim/collection';
import type { GameState } from '../src/sim/types';

const WD = WEEK_DURATION_SECONDS;

/** Give the player an operation that accrues income on each week settlement. */
function withOperation(seed: number): GameState {
  const s = createInitialState(seed);
  s.player.cash = 20000;
  applyCommand(s, { type: 'establishOperation', familyId: 'player', districtId: 'district-0', kind: 'numbers' });
  return s;
}
function playerOp(s: GameState) {
  return s.districts[0].businesses.find((b) => b.ownerFamily === 'player')!;
}

describe('WEEK_DURATION_SECONDS', () => {
  it('defaults to 120 (≈ 2 minutes) and is a positive number', () => {
    expect(WEEK_DURATION_SECONDS).toBe(120);
    expect(WEEK_DURATION_SECONDS).toBeGreaterThan(0);
  });
});

describe('advanceClock — accumulation without firing early', () => {
  it('accumulates dt and does not settle before WEEK_DURATION elapses', () => {
    const s = createInitialState(1);
    expect(advanceClock(s, WD - 1)).toBe(0); // 119s of 120
    expect(s.weekElapsed).toBe(WD - 1);
    expect(s.tick).toBe(0); // no settlement fired (tick counter untouched)
  });

  it('ignores non-positive or garbage dt', () => {
    const s = createInitialState(1);
    expect(advanceClock(s, 0)).toBe(0);
    expect(advanceClock(s, -5)).toBe(0);
    expect(advanceClock(s, Number.NaN)).toBe(0);
    expect(s.weekElapsed).toBe(0);
    expect(s.tick).toBe(0);
  });
});

describe('advanceClock — fires exactly at WEEK_DURATION', () => {
  it('settles exactly one week when accumulated time reaches the interval', () => {
    const s = createInitialState(1);
    expect(advanceClock(s, WD - 1)).toBe(0); // 119
    expect(s.tick).toBe(0);
    expect(advanceClock(s, 1)).toBe(1); // crosses 120 exactly -> fires
    expect(s.tick).toBe(1);
    expect(s.weekElapsed).toBe(0); // remainder carried (none here)
  });

  it('a single dt of exactly WEEK_DURATION fires one week', () => {
    const s = createInitialState(1);
    expect(advanceClock(s, WD)).toBe(1);
    expect(s.tick).toBe(1);
    expect(s.weekElapsed).toBe(0);
  });
});

describe('advanceClock — fires the EXISTING settlement, unchanged', () => {
  it('a settlement is byte-for-byte the existing economic tick (deep equal)', () => {
    // Manual tick vs. one week of clock from identical states must be indistinguishable.
    const manual = withOperation(7);
    tick(manual);

    const clocked = withOperation(7);
    expect(advanceClock(clocked, WD)).toBe(1);

    expect(clocked).toEqual(manual); // same economy, same RNG cursor, weekElapsed back to 0
  });

  it('the fired settlement produces the real economic effect (income accrues)', () => {
    const s = withOperation(3);
    expect(uncollectedOf(playerOp(s))).toBe(0);
    advanceClock(s, WD);
    expect(uncollectedOf(playerOp(s))).toBe(OPERATION_INCOME.numbers); // one week's takings
    expect(s.tick).toBe(1);
  });
});

describe('advanceClock — multiple weeks', () => {
  it('a long single dt settles every whole week it spans and carries the remainder', () => {
    const s = createInitialState(1);
    expect(advanceClock(s, WD * 2 + 60)).toBe(2); // 300s of 120 -> 2 weeks, 60 left
    expect(s.tick).toBe(2);
    expect(s.weekElapsed).toBe(60);
  });

  it('a long sequence of sub-week steps settles the correct number of weeks', () => {
    const s = createInitialState(1);
    let total = 0;
    for (let i = 0; i < 20; i++) total += advanceClock(s, WD / 2); // 60s steps
    expect(total).toBe(10); // 20 * 60 = 1200s = 10 weeks
    expect(s.tick).toBe(10);
    expect(s.weekElapsed).toBe(0);
  });
});

describe('advanceClock — configurable week duration', () => {
  it('honors a custom weekDuration', () => {
    const s = createInitialState(1);
    expect(advanceClock(s, 10, 30)).toBe(0); // 10 of 30
    expect(advanceClock(s, 20, 30)).toBe(1); // reaches 30 -> fires
    expect(s.tick).toBe(1);
  });

  it('treats an invalid (≤ 0) weekDuration as a no-op (no infinite loop)', () => {
    const s = createInitialState(1);
    expect(advanceClock(s, 100, 0)).toBe(0);
    expect(advanceClock(s, 100, -30)).toBe(0);
    expect(s.tick).toBe(0);
  });
});

describe('advanceClock — determinism under fixed dt', () => {
  it('same seed + same dt sequence yields a deeply equal state', () => {
    const run = (seed: number) => {
      const s = withOperation(seed);
      for (const dt of [40, 50, 35, 60, 25, 70, 120, 15]) advanceClock(s, dt);
      return s;
    };
    expect(run(9)).toEqual(run(9));
  });

  it('different dt granularities that sum the same settle identically', () => {
    const coarse = withOperation(5);
    for (let i = 0; i < 120; i++) advanceClock(coarse, 1); // 120 × 1s

    const fine = withOperation(5);
    for (let i = 0; i < 240; i++) advanceClock(fine, 0.5); // 240 × 0.5s

    expect(coarse.tick).toBe(1);
    expect(fine.tick).toBe(1);
    expect(fine).toEqual(coarse);
  });
});

describe('weekProgress / secondsUntilNextWeek (for the real-time HUD countdown)', () => {
  it('report fractional progress and remaining seconds toward the next settlement', () => {
    const s = createInitialState(1);
    advanceClock(s, 30); // a quarter of a 120s week
    expect(weekProgress(s)).toBeCloseTo(0.25, 6);
    expect(secondsUntilNextWeek(s)).toBe(90);
  });

  it('progress resets after a settlement', () => {
    const s = createInitialState(1);
    advanceClock(s, WD); // fires, remainder 0
    expect(weekProgress(s)).toBe(0);
    expect(secondsUntilNextWeek(s)).toBe(WD);
  });
});
