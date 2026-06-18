import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { applyCommand, type EstablishOperationCommand, type UpgradeOperationCommand } from '../src/sim/commands';
import { tick } from '../src/sim/tick';
import { tierOf, tierMultiplier, effectiveOperationIncome, upgradeCost } from '../src/sim/tiers';
import { operationHeat, businessAccrual } from '../src/sim/economy';
import { uncollectedOf } from '../src/sim/collection';
import { OPERATION_COST, OPERATION_INCOME, OPERATION_HEAT, TIER_MAX } from '../src/sim/constants';
import type { Business, OperationKind } from '../src/sim/types';

function operation(id: string, baseIncome: number, owner: string, tier?: number): Business {
  return { id, name: id, kind: 'numbers', baseIncome, heatPerTick: 4, districtId: 'district-0', ownerFamily: owner, uncollected: 0, tier };
}

const establish = (familyId: string, districtId: string, kind: OperationKind): EstablishOperationCommand => ({
  type: 'establishOperation',
  familyId,
  districtId,
  kind,
});
const upgrade = (familyId: string, businessId: string): UpgradeOperationCommand => ({
  type: 'upgradeOperation',
  familyId,
  businessId,
});

describe('tier helpers', () => {
  it('tierOf defaults to 1 and tierMultiplier is linear, floored at 1', () => {
    expect(tierOf(operation('o', 200, 'player'))).toBe(1);
    expect(tierOf(operation('o', 200, 'player', 3))).toBe(3);
    expect(tierMultiplier(1)).toBe(1);
    expect(tierMultiplier(2)).toBe(2);
    expect(tierMultiplier(3)).toBe(3);
    expect(tierMultiplier(0)).toBe(1);
  });

  it('effectiveOperationIncome scales base income by tier', () => {
    expect(effectiveOperationIncome(operation('o', 200, 'player', 1))).toBe(200);
    expect(effectiveOperationIncome(operation('o', 200, 'player', 2))).toBe(400);
    expect(effectiveOperationIncome(operation('o', 200, 'player', 3))).toBe(600);
  });

  it('upgradeCost is the kind base cost times the current tier', () => {
    expect(upgradeCost('numbers', 1)).toBe(OPERATION_COST.numbers);
    expect(upgradeCost('numbers', 2)).toBe(OPERATION_COST.numbers * 2);
    expect(upgradeCost('smuggling', 1)).toBe(OPERATION_COST.smuggling);
  });
});

describe('tier scaling of accrual and heat', () => {
  it('a tier-1 operation is unchanged from the baseline', () => {
    const s = createInitialState(1);
    s.districts[0].policePresence = 0;
    const op = operation('o1', OPERATION_INCOME.numbers, 'player', 1);
    op.heatPerTick = OPERATION_HEAT.numbers;
    expect(businessAccrual(op)).toBe(OPERATION_INCOME.numbers);
    expect(operationHeat(op, s.districts[0])).toBe(OPERATION_HEAT.numbers);
  });

  it('a tier-2 operation accrues and throws double', () => {
    const s = createInitialState(1);
    s.districts[0].policePresence = 0;
    const op = operation('o1', OPERATION_INCOME.numbers, 'player', 2);
    op.heatPerTick = OPERATION_HEAT.numbers;
    expect(businessAccrual(op)).toBe(2 * OPERATION_INCOME.numbers);
    expect(operationHeat(op, s.districts[0])).toBe(2 * OPERATION_HEAT.numbers);
  });

  it('over a tick a tier-3 operation piles 3x takings', () => {
    const s = createInitialState(1);
    const op = operation('o1', OPERATION_INCOME.numbers, 'player', 3);
    s.districts[0].businesses = [op];
    tick(s);
    expect(uncollectedOf(op)).toBe(3 * OPERATION_INCOME.numbers);
  });
});

describe('upgradeOperation command', () => {
  it('deducts the cost and bumps the tier', () => {
    const s = createInitialState(1);
    s.player.cash = 5000;
    applyCommand(s, establish('player', 'district-0', 'numbers'));
    const op = s.districts[0].businesses.at(-1)!;
    expect(tierOf(op)).toBe(1);
    const cashAfterEstablish = s.player.cash;

    applyCommand(s, upgrade('player', op.id));
    expect(tierOf(op)).toBe(2);
    expect(s.player.cash).toBe(cashAfterEstablish - upgradeCost('numbers', 1));
    expect(s.log.at(-1)?.kind).toBe('upgrade');
  });

  it('refuses to upgrade past TIER_MAX', () => {
    const s = createInitialState(1);
    s.player.cash = 100000;
    applyCommand(s, establish('player', 'district-0', 'numbers'));
    const op = s.districts[0].businesses.at(-1)!;
    for (let i = 1; i < TIER_MAX; i++) applyCommand(s, upgrade('player', op.id));
    expect(tierOf(op)).toBe(TIER_MAX);
    applyCommand(s, upgrade('player', op.id));
    expect(tierOf(op)).toBe(TIER_MAX); // unchanged
    expect(s.log.at(-1)?.kind).toBe('upgrade-maxed');
  });

  it('is denied without enough cash', () => {
    const s = createInitialState(1);
    s.player.cash = 5000;
    applyCommand(s, establish('player', 'district-0', 'numbers')); // cash 4500
    const op = s.districts[0].businesses.at(-1)!;
    s.player.cash = upgradeCost('numbers', 1) - 1;
    applyCommand(s, upgrade('player', op.id));
    expect(tierOf(op)).toBe(1);
    expect(s.log.at(-1)?.kind).toBe('upgrade-denied');
  });

  it('rejects upgrading a front or an operation you do not own', () => {
    const s = createInitialState(1);
    s.player.cash = 5000;
    const frontId = s.districts[0].businesses[0].id;
    applyCommand(s, upgrade('player', frontId));
    expect(s.log.at(-1)?.kind).toBe('upgrade-invalid');

    s.districts[1].businesses = [operation('rop', 200, 'rival-a', 1)];
    applyCommand(s, upgrade('player', 'rop'));
    expect(tierOf(s.districts[1].businesses[0])).toBe(1); // untouched
    expect(s.log.at(-1)?.kind).toBe('upgrade-invalid');
  });

  it('is deterministic for the same seed and commands', () => {
    const build = (seed: number) => {
      const s = createInitialState(seed);
      s.player.cash = 10000;
      applyCommand(s, establish('player', 'district-0', 'smuggling'));
      const op = s.districts[0].businesses.at(-1)!;
      applyCommand(s, upgrade('player', op.id));
      tick(s);
      return s;
    };
    expect(build(6)).toEqual(build(6));
  });
});
