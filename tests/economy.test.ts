import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  extortionIncome,
  operationIncome,
  familyIncome,
  familyExpenses,
  familyNet,
} from '../src/sim/economy';
import { EXTORT_RATE } from '../src/sim/constants';
import type { Business, Gangster } from '../src/sim/types';

function front(id: string, baseIncome: number, extortedBy?: string): Business {
  return { id, name: id, kind: 'front', baseIncome, heatPerTick: 0, districtId: 'd', extortedBy };
}

function operation(id: string, baseIncome: number, owner: string): Business {
  return {
    id,
    name: id,
    kind: 'numbers',
    baseIncome,
    heatPerTick: 4,
    districtId: 'd',
    ownerFamily: owner,
  };
}

function gangster(id: string, upkeep: number): Gangster {
  return { id, name: id, skill: 5, loyalty: 50, upkeep, assignment: { type: 'idle' } };
}

describe('extortionIncome', () => {
  it('sums EXTORT_RATE of base income over fronts the family extorts', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [
      front('f1', 100, 'player'), // 30
      front('f2', 200, 'player'), // 60
      front('f3', 150, 'rival-a'), // not player
      front('f4', 100), // unextorted
    ];
    expect(EXTORT_RATE).toBe(0.3);
    expect(extortionIncome(s, 'player')).toBe(30 + 60);
    expect(extortionIncome(s, 'rival-a')).toBe(Math.floor(150 * 0.3));
  });

  it('floors fractional extortion income', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [front('f1', 95, 'player')]; // 95*0.3 = 28.5 -> 28
    expect(extortionIncome(s, 'player')).toBe(28);
  });
});

describe('operationIncome', () => {
  it('sums base income of operations the family owns', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [
      operation('o1', 200, 'player'),
      operation('o2', 600, 'player'),
      operation('o3', 400, 'rival-a'),
    ];
    expect(operationIncome(s, 'player')).toBe(800);
    expect(operationIncome(s, 'rival-a')).toBe(400);
  });

  it('does not count fronts as operation income', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [front('f1', 100, 'player')];
    expect(operationIncome(s, 'player')).toBe(0);
  });
});

describe('familyExpenses', () => {
  it('sums gangster upkeep plus the standing bribe retainer', () => {
    const s = createInitialState(1);
    s.player.gangsters = [gangster('g1', 50), gangster('g2', 70)];
    s.player.bribeLevel = 30;
    expect(familyExpenses(s.player)).toBe(50 + 70 + 30);
  });

  it('is zero for a fresh family with no gangsters or bribes', () => {
    const s = createInitialState(1);
    expect(familyExpenses(s.player)).toBe(0);
  });
});

describe('familyIncome / familyNet', () => {
  it('combines extortion and operation income', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [front('f1', 100, 'player'), operation('o1', 200, 'player')];
    expect(familyIncome(s, 'player')).toBe(30 + 200);
  });

  it('net = income - expenses', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [front('f1', 100, 'player')]; // +30
    s.player.gangsters = [gangster('g1', 12)];
    s.player.bribeLevel = 5;
    expect(familyNet(s, s.player)).toBe(30 - 17);
  });
});
