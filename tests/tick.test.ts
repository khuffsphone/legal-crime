import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { tick, tickN } from '../src/sim/tick';
import type { Business, Gangster } from '../src/sim/types';

function front(id: string, baseIncome: number, extortedBy?: string): Business {
  return { id, name: id, kind: 'front', baseIncome, heatPerTick: 0, districtId: 'd', extortedBy };
}

function gangster(id: string, upkeep: number): Gangster {
  return { id, name: id, skill: 5, loyalty: 50, upkeep, assignment: { type: 'idle' } };
}

describe('tick — clock', () => {
  it('advances the tick counter by one', () => {
    const s = createInitialState(1);
    expect(s.tick).toBe(0);
    tick(s);
    expect(s.tick).toBe(1);
    tick(s);
    expect(s.tick).toBe(2);
  });

  it('returns the same state object', () => {
    const s = createInitialState(1);
    expect(tick(s)).toBe(s);
  });
});

describe('tick — economy', () => {
  it('a fresh world has no income or expenses, so cash is unchanged', () => {
    const s = createInitialState(1);
    const cash0 = s.player.cash;
    tick(s);
    expect(s.player.cash).toBe(cash0);
  });

  it('accrues extortion takings at the business each tick (not auto-credited to cash)', () => {
    // Under the Collector mechanic (S2) income piles up uncollected and is realized only
    // when collected — it no longer auto-credits cash.
    const s = createInitialState(1);
    const cash0 = s.player.cash;
    const f = front('f1', 100, 'player'); // accrues floor(100 * 0.3) = 30/tick
    s.districts[0].businesses = [f];
    tick(s);
    expect(f.uncollected).toBe(30);
    expect(s.player.cash).toBe(cash0); // unchanged until collected
    tick(s);
    expect(f.uncollected).toBe(60);
    expect(s.player.cash).toBe(cash0);
  });

  it('subtracts gangster upkeep each tick', () => {
    const s = createInitialState(1);
    const cash0 = s.player.cash;
    s.player.gangsters = [gangster('g1', 40), gangster('g2', 10)];
    tick(s);
    expect(s.player.cash).toBe(cash0 - 50);
  });

  it('over multiple ticks only expenses hit cash while takings pile up uncollected', () => {
    const s = createInitialState(1);
    const cash0 = s.player.cash;
    const f = front('f1', 100, 'player'); // accrues 30/tick
    s.districts[0].businesses = [f];
    s.player.gangsters = [gangster('g1', 10)]; // -10/tick
    tickN(s, 5);
    expect(s.player.cash).toBe(cash0 - 5 * 10); // only upkeep leaves cash
    expect(f.uncollected).toBe(5 * 30); // five weeks of takings waiting
    expect(s.tick).toBe(5);
  });

  it('records an economy event when expenses are paid', () => {
    const s = createInitialState(1);
    s.player.gangsters = [gangster('g1', 25)];
    tick(s);
    const econEvents = s.log.filter((e) => e.kind === 'economy' && e.data?.familyId === 'player');
    expect(econEvents).toHaveLength(1);
    expect(econEvents[0].data?.net).toBe(-25);
    expect(econEvents[0].data?.expenses).toBe(25);
  });

  it('a rival accrues takings and its AI collects them', () => {
    const s = createInitialState(1);
    s.rivals[0].cash = 100; // too poor for any action except collecting
    const f = front('f1', 200, 'rival-a'); // accrues 60/tick to rival-a
    s.districts[0].businesses = [f];
    tick(s);
    // The rival's AI ran a collection: the pile is swept and some cash banked.
    expect(f.uncollected).toBe(0);
    expect(s.rivals[0].cash).toBeGreaterThan(100);
    expect(s.rivals[0].cash).toBeLessThanOrEqual(160); // cannot exceed the full take
  });
});

describe('tick — determinism', () => {
  it('same seed + same ticks yields a deeply equal state', () => {
    const a = createInitialState(7);
    const b = createInitialState(7);
    tickN(a, 10);
    tickN(b, 10);
    expect(a).toEqual(b);
  });

  it('different seeds can diverge but ticking never throws', () => {
    const a = createInitialState(1);
    const b = createInitialState(2);
    expect(() => tickN(a, 10)).not.toThrow();
    expect(() => tickN(b, 10)).not.toThrow();
    expect(a.tick).toBe(10);
    expect(b.tick).toBe(10);
  });
});
