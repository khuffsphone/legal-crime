import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { applyCommand, type EstablishOperationCommand } from '../src/sim/commands';
import { tick } from '../src/sim/tick';
import { operationHeat, operationIncome } from '../src/sim/economy';
import { OPERATION_COST, OPERATION_HEAT, OPERATION_INCOME } from '../src/sim/constants';
import type { OperationKind } from '../src/sim/types';

function establish(
  familyId: string,
  districtId: string,
  kind: OperationKind,
): EstablishOperationCommand {
  return { type: 'establishOperation', familyId, districtId, kind };
}

describe('establishOperation — cost & creation', () => {
  it('deducts the operation cost and adds an owned operation business', () => {
    const s = createInitialState(1);
    s.player.cash = 5000;
    const before = s.districts[0].businesses.length;

    applyCommand(s, establish('player', 'district-0', 'smuggling'));

    expect(s.player.cash).toBe(5000 - OPERATION_COST.smuggling);
    expect(s.districts[0].businesses.length).toBe(before + 1);
    const op = s.districts[0].businesses.at(-1)!;
    expect(op.kind).toBe('smuggling');
    expect(op.ownerFamily).toBe('player');
    expect(op.baseIncome).toBe(OPERATION_INCOME.smuggling);
    expect(op.heatPerTick).toBe(OPERATION_HEAT.smuggling);
    expect(s.log.at(-1)?.kind).toBe('operation-established');
  });

  it('is denied when the family cannot afford it (no cash change)', () => {
    const s = createInitialState(1);
    s.player.cash = OPERATION_COST.numbers - 1;
    const before = s.districts[0].businesses.length;

    applyCommand(s, establish('player', 'district-0', 'numbers'));

    expect(s.player.cash).toBe(OPERATION_COST.numbers - 1);
    expect(s.districts[0].businesses.length).toBe(before);
    expect(s.log.at(-1)?.kind).toBe('operation-denied');
  });

  it('generates unique ids for multiple operations of the same kind', () => {
    const s = createInitialState(1);
    s.player.cash = 10000;
    applyCommand(s, establish('player', 'district-0', 'numbers'));
    applyCommand(s, establish('player', 'district-0', 'numbers'));
    const ops = s.districts[0].businesses.filter((b) => b.ownerFamily === 'player');
    expect(ops).toHaveLength(2);
    expect(new Set(ops.map((o) => o.id)).size).toBe(2);
  });
});

describe('establishOperation — income over ticks', () => {
  it('an established operation yields its income each tick', () => {
    const s = createInitialState(1);
    s.player.cash = 5000;
    applyCommand(s, establish('player', 'district-0', 'speakeasy'));
    const cash0 = s.player.cash;

    tick(s);
    expect(s.player.cash).toBe(cash0 + OPERATION_INCOME.speakeasy);
    tick(s);
    expect(s.player.cash).toBe(cash0 + 2 * OPERATION_INCOME.speakeasy);
    expect(operationIncome(s, 'player')).toBe(OPERATION_INCOME.speakeasy);
  });
});

describe('operationHeat — police-presence amplification', () => {
  it('amplifies base heat by (1 + presence/100), rounded', () => {
    const s = createInitialState(1);
    s.districts[0].policePresence = 50;
    s.player.cash = 5000;
    applyCommand(s, establish('player', 'district-0', 'smuggling')); // base heat 10
    const op = s.districts[0].businesses.at(-1)!;
    // 10 * (1 + 50/100) = 15
    expect(operationHeat(op, s.districts[0])).toBe(15);
  });

  it('with zero police presence the heat equals the base', () => {
    const s = createInitialState(1);
    s.districts[0].policePresence = 0;
    s.player.cash = 5000;
    applyCommand(s, establish('player', 'district-0', 'numbers')); // base 4
    const op = s.districts[0].businesses.at(-1)!;
    expect(operationHeat(op, s.districts[0])).toBe(OPERATION_HEAT.numbers);
  });

  it('adds amplified operation heat to the owner each tick', () => {
    const s = createInitialState(1);
    s.districts[0].policePresence = 100; // doubles heat
    s.player.cash = 5000;
    applyCommand(s, establish('player', 'district-0', 'protection')); // base 5 -> 10
    const heat0 = s.player.heat;

    tick(s);
    expect(s.player.heat).toBe(heat0 + 10);
  });

  it('fronts never generate operation heat', () => {
    const s = createInitialState(1);
    const front = s.districts[0].businesses[0];
    expect(front.kind).toBe('front');
    expect(operationHeat(front, s.districts[0])).toBe(0);
  });
});

describe('establishOperation — determinism', () => {
  it('same seed + same commands yields a deeply equal state', () => {
    const build = (seed: number) => {
      const s = createInitialState(seed);
      s.player.cash = 10000;
      applyCommand(s, establish('player', 'district-0', 'numbers'));
      applyCommand(s, establish('player', 'district-1', 'smuggling'));
      tick(s);
      tick(s);
      return s;
    };
    expect(build(5)).toEqual(build(5));
  });
});
