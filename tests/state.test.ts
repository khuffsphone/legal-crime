import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { allFamilies, findFamily } from '../src/sim/types';

describe('createInitialState', () => {
  it('builds a playable world with a player and two rivals', () => {
    const s = createInitialState(1);
    expect(s.status).toBe('playing');
    expect(s.tick).toBe(0);
    expect(s.player.isPlayer).toBe(true);
    expect(s.rivals).toHaveLength(2);
    expect(s.rivals.every((r) => !r.isPlayer)).toBe(true);
    expect(allFamilies(s)).toHaveLength(3);
  });

  it('creates five districts each with at least two front businesses', () => {
    const s = createInitialState(1);
    expect(s.districts).toHaveLength(5);
    for (const d of s.districts) {
      expect(d.businesses.length).toBeGreaterThanOrEqual(2);
      expect(d.businesses.every((b) => b.kind === 'front')).toBe(true);
      expect(d.businesses.every((b) => b.baseIncome >= 80 && b.baseIncome <= 160)).toBe(true);
    }
  });

  it('gives the player a foothold in district-0 and rivals their home turf', () => {
    const s = createInitialState(1);
    expect(s.districts[0].control.player).toBe(30);
    expect(s.districts[2].control['rival-a']).toBe(40);
    expect(s.districts[4].control['rival-b']).toBe(40);
  });

  it('is fully deterministic: same seed yields a deeply equal world', () => {
    const a = createInitialState(7);
    const b = createInitialState(7);
    expect(a).toEqual(b);
  });

  it('different seeds produce different worlds', () => {
    const a = createInitialState(1);
    const b = createInitialState(2);
    // District business counts / names / police presence diverge under different seeds.
    expect(JSON.stringify(a.districts)).not.toEqual(JSON.stringify(b.districts));
  });

  it('findFamily locates player and rivals and returns undefined for unknowns', () => {
    const s = createInitialState(1);
    expect(findFamily(s, 'player')?.isPlayer).toBe(true);
    expect(findFamily(s, 'rival-a')?.name).toBe('The Moretti Family');
    expect(findFamily(s, 'nobody')).toBeUndefined();
  });
});
