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

  it('adds extortion income to the extorting family each tick', () => {
    const s = createInitialState(1);
    const cash0 = s.player.cash;
    s.districts[0].businesses = [front('f1', 100, 'player')]; // +30/tick
    tick(s);
    expect(s.player.cash).toBe(cash0 + 30);
    tick(s);
    expect(s.player.cash).toBe(cash0 + 60);
  });

  it('subtracts gangster upkeep each tick', () => {
    const s = createInitialState(1);
    const cash0 = s.player.cash;
    s.player.gangsters = [gangster('g1', 40), gangster('g2', 10)];
    tick(s);
    expect(s.player.cash).toBe(cash0 - 50);
  });

  it('nets income against expenses over multiple ticks', () => {
    const s = createInitialState(1);
    const cash0 = s.player.cash;
    s.districts[0].businesses = [front('f1', 100, 'player')]; // +30
    s.player.gangsters = [gangster('g1', 10)]; // -10
    tickN(s, 5);
    expect(s.player.cash).toBe(cash0 + 5 * 20);
    expect(s.tick).toBe(5);
  });

  it('records an economy event only when net is non-zero', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [front('f1', 100, 'player')];
    tick(s);
    const econEvents = s.log.filter((e) => e.kind === 'economy' && e.data?.familyId === 'player');
    expect(econEvents).toHaveLength(1);
    expect(econEvents[0].data?.net).toBe(30);
  });

  it('resolves income independently for rivals', () => {
    const s = createInitialState(1);
    // Keep rival cash below the cheapest AI action (expand = 300) so the rival AI takes
    // no action this tick and we can isolate the extortion income credit.
    s.rivals[0].cash = 100;
    s.districts[0].businesses = [front('f1', 200, 'rival-a')]; // +60/tick to rival-a
    tick(s);
    expect(s.rivals[0].cash).toBe(100 + 60);
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
