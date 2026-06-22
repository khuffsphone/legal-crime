// RTS-28 — pure playability helpers (clock speed, skip-week, flags, collector cap).
import { describe, it, expect } from 'vitest';
import {
  TIME_SCALES, nextTimeScale, scaledDt, skipWeekDt, flagEnabled, canAddRouteCollector, MAX_ROUTE_COLLECTORS,
} from '../src/scenes/playability';

describe('fast-forward clock control', () => {
  it('cycles 1 → 2 → 4 → 1', () => {
    expect(TIME_SCALES).toEqual([1, 2, 4]);
    expect(nextTimeScale(1)).toBe(2);
    expect(nextTimeScale(2)).toBe(4);
    expect(nextTimeScale(4)).toBe(1);
    expect(nextTimeScale(99)).toBe(1); // unknown → restart
  });

  it('scaledDt multiplies dt by the (≥1) multiplier and floors negatives', () => {
    expect(scaledDt(0.016, 1)).toBeCloseTo(0.016);
    expect(scaledDt(0.016, 4)).toBeCloseTo(0.064);
    expect(scaledDt(-1, 2)).toBe(0);
    expect(scaledDt(0.02, 0.5)).toBeCloseTo(0.02); // never slows below 1×
  });
});

describe('skip-week math — advances exactly one boundary', () => {
  it('returns the remaining seconds to the next week (+epsilon to cross it)', () => {
    expect(skipWeekDt(0, 60)).toBeGreaterThan(60);
    expect(skipWeekDt(0, 60)).toBeLessThan(60.01);
    expect(skipWeekDt(45, 60)).toBeGreaterThan(15);
    expect(skipWeekDt(45, 60)).toBeLessThan(15.01);
  });
  it('a full/over-full elapsed still fires just one week', () => {
    expect(skipWeekDt(60, 60)).toBeGreaterThan(60);
    expect(skipWeekDt(60, 60)).toBeLessThan(60.01);
    expect(skipWeekDt(0, 0)).toBe(0);
  });
});

describe('feature flags — default ON, explicit OFF', () => {
  it('absent flag is on', () => {
    expect(flagEnabled('', 'market')).toBe(true);
    expect(flagEnabled('?debug=turf', 'market')).toBe(true);
  });
  it('off/0/false/no turn it off (case-insensitive)', () => {
    for (const v of ['off', '0', 'false', 'no', 'OFF']) expect(flagEnabled(`?market=${v}`, 'market')).toBe(false);
  });
  it('any other value stays on', () => {
    expect(flagEnabled('?market=on', 'market')).toBe(true);
    expect(flagEnabled('?market=1', 'market')).toBe(true);
  });
});

describe('collector cap — at most one route collector', () => {
  it('allows the first, blocks stacking', () => {
    expect(MAX_ROUTE_COLLECTORS).toBe(1);
    expect(canAddRouteCollector(0)).toBe(true);
    expect(canAddRouteCollector(1)).toBe(false);
    expect(canAddRouteCollector(3)).toBe(false);
  });
});
