import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  cleanCash,
  clampDirty,
  creditCrimeIncome,
  heatFromDirty,
  launderFee,
  launderCapacity,
} from '../src/sim/laundering';
import { applyCommand, type LaunderCommand } from '../src/sim/commands';
import { tick } from '../src/sim/tick';
import {
  DIRTY_CASH_HEAT_DIVISOR,
  DIRTY_HEAT_MAX_PER_TICK,
  LAUNDER_CAP_PER_FRONT,
  LAUNDER_FEE_RATE,
  HEAT_DECAY,
} from '../src/sim/constants';
import type { Business, Family, Gangster } from '../src/sim/types';

function front(id: string, baseIncome: number, extortedBy?: string): Business {
  return { id, name: id, kind: 'front', baseIncome, heatPerTick: 0, districtId: 'district-0', extortedBy };
}

function gangster(id: string, upkeep: number, loyalty = 80): Gangster {
  return { id, name: id, skill: 5, loyalty, upkeep, assignment: { type: 'idle' } };
}

const launder = (familyId: string, amount: number): LaunderCommand => ({ type: 'launder', familyId, amount });

describe('cleanCash / clampDirty (ledger invariant)', () => {
  it('cleanCash is cash minus the dirty portion, floored at 0', () => {
    const f = { cash: 1000, dirtyCash: 300 } as Family;
    expect(cleanCash(f)).toBe(700);
    const allDirty = { cash: 500, dirtyCash: 500 } as Family;
    expect(cleanCash(allDirty)).toBe(0);
  });

  it('clampDirty enforces 0 ≤ dirtyCash ≤ cash', () => {
    const over = { cash: 400, dirtyCash: 900 } as Family;
    clampDirty(over);
    expect(over.dirtyCash).toBe(400);

    const negative = { cash: 400, dirtyCash: -50 } as Family;
    clampDirty(negative);
    expect(negative.dirtyCash).toBe(0);

    const broke = { cash: -100, dirtyCash: 50 } as Family;
    clampDirty(broke);
    expect(broke.dirtyCash).toBe(0);
  });
});

describe('creditCrimeIncome', () => {
  it('raises cash and dirty equally so clean is unchanged', () => {
    const f = { cash: 1000, dirtyCash: 200 } as Family;
    const cleanBefore = cleanCash(f); // 800
    creditCrimeIncome(f, 500);
    expect(f.cash).toBe(1500);
    expect(f.dirtyCash).toBe(700);
    expect(cleanCash(f)).toBe(cleanBefore); // dirty income leaves clean untouched
  });

  it('ignores non-positive amounts', () => {
    const f = { cash: 100, dirtyCash: 10 } as Family;
    creditCrimeIncome(f, 0);
    creditCrimeIncome(f, -5);
    expect(f).toMatchObject({ cash: 100, dirtyCash: 10 });
  });
});

describe('heatFromDirty', () => {
  it('is zero below the divisor and floors above it, capped', () => {
    expect(heatFromDirty(0)).toBe(0);
    expect(heatFromDirty(DIRTY_CASH_HEAT_DIVISOR - 1)).toBe(0);
    expect(heatFromDirty(DIRTY_CASH_HEAT_DIVISOR)).toBe(1);
    expect(heatFromDirty(DIRTY_CASH_HEAT_DIVISOR * 5 + 500)).toBe(5);
    expect(heatFromDirty(DIRTY_CASH_HEAT_DIVISOR * 1000)).toBe(DIRTY_HEAT_MAX_PER_TICK);
  });
});

describe('launderFee', () => {
  it('is floor(amount * LAUNDER_FEE_RATE)', () => {
    expect(LAUNDER_FEE_RATE).toBe(0.15);
    expect(launderFee(1000)).toBe(150);
    expect(launderFee(99)).toBe(14); // floor(14.85)
    expect(launderFee(0)).toBe(0);
  });
});

describe('launderCapacity', () => {
  it('is LAUNDER_CAP_PER_FRONT per front the family extorts', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [
      front('f1', 100, 'player'),
      front('f2', 100, 'player'),
      front('f3', 100, 'rival-a'),
      front('f4', 100),
    ];
    expect(launderCapacity(s, 'player')).toBe(2 * LAUNDER_CAP_PER_FRONT);
    expect(launderCapacity(s, 'rival-a')).toBe(LAUNDER_CAP_PER_FRONT);
    expect(launderCapacity(s, 'rival-b')).toBe(0);
  });
});

describe('launder command', () => {
  it('converts dirty to clean (capped by capacity), pays the fee, and raises clean', () => {
    const s = createInitialState(1);
    s.player.cash = 2000;
    s.player.dirtyCash = 1000;
    s.districts[0].businesses = [front('f1', 100, 'player')]; // capacity 200
    const cleanBefore = cleanCash(s.player); // 1000

    applyCommand(s, launder('player', 500)); // effective = min(500,1000,200) = 200

    const fee = launderFee(200); // 30
    expect(s.player.cash).toBe(2000 - fee);
    expect(s.player.dirtyCash).toBe(1000 - 200);
    expect(cleanCash(s.player)).toBe(cleanBefore + 200 - fee);
    expect(s.log.at(-1)?.kind).toBe('launder');
  });

  it('caps the laundered amount at the available dirty cash', () => {
    const s = createInitialState(1);
    s.player.cash = 2000;
    s.player.dirtyCash = 120;
    s.districts[0].businesses = [front('f1', 100, 'player')]; // capacity 200
    applyCommand(s, launder('player', 1000)); // effective = min(1000,120,200) = 120
    expect(s.player.dirtyCash).toBe(0);
    expect(s.player.cash).toBe(2000 - launderFee(120));
  });

  it('is denied with no laundering capacity (no extorted fronts)', () => {
    const s = createInitialState(1);
    s.player.cash = 2000;
    s.player.dirtyCash = 1000;
    s.districts.forEach((d) => (d.businesses = []));
    applyCommand(s, launder('player', 500));
    expect(s.player.dirtyCash).toBe(1000); // untouched
    expect(s.log.at(-1)?.kind).toBe('launder-denied');
  });

  it('is denied when there is no dirty cash to launder', () => {
    const s = createInitialState(1);
    s.player.cash = 2000;
    s.player.dirtyCash = 0;
    s.districts[0].businesses = [front('f1', 100, 'player')];
    applyCommand(s, launder('player', 500));
    expect(s.log.at(-1)?.kind).toBe('launder-denied');
  });

  it('rejects non-positive amounts', () => {
    const s = createInitialState(1);
    s.player.dirtyCash = 500;
    applyCommand(s, launder('player', 0));
    expect(s.log.at(-1)?.kind).toBe('launder-invalid');
  });
});

describe('tick integration — dual economy', () => {
  it('classes crime income as dirty as it arrives', () => {
    const s = createInitialState(1);
    s.districts[0].control = { player: 100 };
    s.districts[0].businesses = [front('f1', 100, 'player')]; // extortionIncome 30/tick
    const dirty0 = s.player.dirtyCash;
    tick(s);
    expect(s.player.dirtyCash).toBe(dirty0 + 30);
  });

  it('a standing dirty hoard radiates heat each tick (then decays)', () => {
    const s = createInitialState(1);
    s.player.cash = 6000;
    s.player.dirtyCash = 5000; // heatFromDirty = 5
    s.player.heat = 0;
    tick(s); // +5 dirty heat, then -HEAT_DECAY in the law step
    expect(s.player.heat).toBe(heatFromDirty(5000) - HEAT_DECAY);
  });

  it('spends clean money first: paying expenses with no clean drops the dirty portion', () => {
    const s = createInitialState(1);
    s.player.cash = 1000;
    s.player.dirtyCash = 1000; // fully dirty (clean = 0)
    s.player.gangsters = [gangster('g1', 500)];
    tick(s); // expenses 500, no income -> cash 500, dirty clamps to 500
    expect(s.player.cash).toBe(500);
    expect(s.player.dirtyCash).toBe(500);
    expect(cleanCash(s.player)).toBe(0);
  });

  it('is deterministic: same seed + same launder/tick sequence is deeply equal', () => {
    const build = (seed: number) => {
      const s = createInitialState(seed);
      s.player.cash = 5000;
      s.player.dirtyCash = 2000;
      s.districts[0].businesses = [front('f1', 100, 'player'), front('f2', 100, 'player')];
      applyCommand(s, launder('player', 300));
      tick(s);
      tick(s);
      return s;
    };
    expect(build(31)).toEqual(build(31));
  });
});
