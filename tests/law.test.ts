import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { applyCommand, type BribeCommand } from '../src/sim/commands';
import { tick } from '../src/sim/tick';
import {
  raidBaseChance,
  bribeMitigation,
  raidChance,
  bribeDecayBonus,
  effectiveDecay,
  resolveLaw,
} from '../src/sim/law';
import {
  RAID_THRESHOLD,
  RAID_MAX_CHANCE,
  HEAT_MAX,
  HEAT_DECAY,
  BRIBE_MAX_MITIGATION,
  RAID_CASH_SEIZE_FRACTION,
} from '../src/sim/constants';
import type { Business } from '../src/sim/types';

const bribe = (familyId: string, amount: number): BribeCommand => ({ type: 'bribe', familyId, amount });

function operation(id: string, owner: string): Business {
  return { id, name: id, kind: 'numbers', baseIncome: 200, heatPerTick: 4, districtId: 'district-0', ownerFamily: owner };
}

describe('raidBaseChance', () => {
  it('is zero below the threshold and rises linearly to RAID_MAX_CHANCE at HEAT_MAX', () => {
    expect(raidBaseChance(RAID_THRESHOLD - 1)).toBe(0);
    expect(raidBaseChance(RAID_THRESHOLD)).toBe(0);
    expect(raidBaseChance(HEAT_MAX)).toBeCloseTo(RAID_MAX_CHANCE, 6);
    const mid = (RAID_THRESHOLD + HEAT_MAX) / 2;
    expect(raidBaseChance(mid)).toBeCloseTo(RAID_MAX_CHANCE / 2, 6);
  });
});

describe('bribeMitigation', () => {
  it('is 1% per bribe point, capped at BRIBE_MAX_MITIGATION', () => {
    expect(bribeMitigation(0)).toBe(0);
    expect(bribeMitigation(30)).toBeCloseTo(0.3, 6);
    expect(bribeMitigation(1000)).toBe(BRIBE_MAX_MITIGATION);
  });
});

describe('raidChance', () => {
  it('combines heat-based chance with bribe mitigation', () => {
    const base = raidBaseChance(HEAT_MAX); // 0.8
    expect(raidChance(HEAT_MAX, 0)).toBeCloseTo(base, 6);
    expect(raidChance(HEAT_MAX, 50)).toBeCloseTo(base * (1 - 0.5), 6);
  });
});

describe('decay helpers', () => {
  it('bribeDecayBonus is floor(0.05 * bribeLevel)', () => {
    expect(bribeDecayBonus(0)).toBe(0);
    expect(bribeDecayBonus(40)).toBe(2);
    expect(bribeDecayBonus(39)).toBe(1);
  });

  it('effectiveDecay is base plus bribe bonus', () => {
    expect(effectiveDecay(0)).toBe(HEAT_DECAY);
    expect(effectiveDecay(40)).toBe(HEAT_DECAY + 2);
  });
});

describe('resolveLaw — decay', () => {
  it('decays heat by HEAT_DECAY with no bribe and no raid', () => {
    const s = createInitialState(1);
    s.player.heat = 50; // below threshold -> no raid
    resolveLaw(s);
    expect(s.player.heat).toBe(50 - HEAT_DECAY);
  });

  it('does not roll a raid (no RNG draw) when heat is below the threshold', () => {
    const s = createInitialState(1);
    s.player.heat = 40;
    const cursor = s.rngState;
    resolveLaw(s);
    expect(s.rngState).toBe(cursor);
  });

  it('decays faster with a standing politicians bribe', () => {
    const s = createInitialState(1);
    s.player.heat = 50;
    s.player.bribes.politicians = 40; // +2 decay (Phase 13: politicians channel)
    resolveLaw(s);
    expect(s.player.heat).toBe(50 - (HEAT_DECAY + 2));
  });

  it('never drives heat below zero', () => {
    const s = createInitialState(1);
    s.player.heat = 1;
    resolveLaw(s);
    expect(s.player.heat).toBe(0);
  });
});

describe('resolveLaw — raids', () => {
  it('busts the boss when a raid fires at or above BUST_HEAT (player loses)', () => {
    let busts = 0;
    for (let seed = 0; seed < 80; seed++) {
      const s = createInitialState(seed);
      s.player.heat = HEAT_MAX; // >= BUST_HEAT, chance 0.8
      s.player.bustArmed = true; // Phase 18: a bust requires the telegraph to have armed
      resolveLaw(s);
      if (!s.player.alive) {
        busts++;
        expect(s.status).toBe('lost');
        expect(s.lossReason).toBe('busted');
        expect(s.log.some((e) => e.kind === 'raid-bust')).toBe(true);
      }
    }
    // With chance 0.8 over 80 seeds, many busts must occur.
    expect(busts).toBeGreaterThan(40);
  });

  it('a non-bust raid seizes cash or shuts an operation, and relieves heat', () => {
    let cashSeized = 0;
    let opSeized = 0;
    for (let seed = 0; seed < 120; seed++) {
      const s = createInitialState(seed);
      s.player.heat = 75; // between threshold and bust; chance 0.3
      s.player.cash = 1000;
      s.districts[0].businesses = [operation('op1', 'player')];
      resolveLaw(s);
      const raided = s.log.some((e) => e.kind === 'raid-cash' || e.kind === 'raid-operation');
      if (s.log.some((e) => e.kind === 'raid-cash')) {
        cashSeized++;
        // either nothing to seize floor, or cash dropped by 30%
        expect(s.player.cash).toBeLessThanOrEqual(1000);
      }
      if (s.log.some((e) => e.kind === 'raid-operation')) {
        opSeized++;
        expect(s.districts[0].businesses.find((b) => b.id === 'op1')).toBeUndefined();
      }
      if (raided) {
        expect(s.player.alive).toBe(true); // never a bust at heat 75
      }
    }
    // Both raid outcomes should occur across the seed range.
    expect(cashSeized).toBeGreaterThan(0);
    expect(opSeized).toBeGreaterThan(0);
  });

  it('exact cash seizure is 30% floored', () => {
    // Find a seed at heat 75 that seizes cash, then assert the exact amount.
    for (let seed = 0; seed < 200; seed++) {
      const s = createInitialState(seed);
      s.player.heat = 75;
      s.player.cash = 1000;
      // no operations -> any raid must seize cash
      s.districts.forEach((d) => (d.businesses = []));
      resolveLaw(s);
      if (s.log.some((e) => e.kind === 'raid-cash')) {
        expect(s.player.cash).toBe(1000 - Math.floor(1000 * RAID_CASH_SEIZE_FRACTION));
        return;
      }
    }
    throw new Error('expected at least one cash-seizing raid across seeds');
  });

  it('a heavy police bribe sharply reduces raids at high heat over many seeds', () => {
    // Police channel drives raid mitigation. With 0.9 mitigation, raid chance ~0.08, so
    // most seeds see no raid (player survives the resolve).
    let survived = 0;
    for (let seed = 0; seed < 80; seed++) {
      const s = createInitialState(seed);
      s.player.heat = HEAT_MAX;
      s.player.bustArmed = true; // arm so a fired raid actually busts (Phase 18 gate)
      s.player.bribes.police = 100; // mitigation capped at 0.9
      resolveLaw(s);
      if (s.player.alive && s.status === 'playing') survived++;
    }
    expect(survived).toBeGreaterThan(60); // vs ~16 expected with no bribe (0.8 raid chance)
  });
});

describe('bribe command', () => {
  it('raises bribeLevel without an upfront cash deduction', () => {
    const s = createInitialState(1);
    s.player.cash = 1000;
    applyCommand(s, bribe('player', 50));
    expect(s.player.bribeLevel).toBe(50);
    expect(s.player.cash).toBe(1000); // retainer is paid per-tick, not now
    expect(s.log.at(-1)?.kind).toBe('bribe');
  });

  it('accumulates across multiple bribes', () => {
    const s = createInitialState(1);
    s.player.cash = 1000;
    applyCommand(s, bribe('player', 20));
    applyCommand(s, bribe('player', 30));
    expect(s.player.bribeLevel).toBe(50);
  });

  it('is denied when the family cannot sustain the retainer', () => {
    const s = createInitialState(1);
    s.player.cash = 40;
    applyCommand(s, bribe('player', 50));
    expect(s.player.bribeLevel).toBe(0);
    expect(s.log.at(-1)?.kind).toBe('bribe-denied');
  });

  it('rejects non-positive amounts', () => {
    const s = createInitialState(1);
    s.player.cash = 1000;
    applyCommand(s, bribe('player', 0));
    expect(s.player.bribeLevel).toBe(0);
    expect(s.log.at(-1)?.kind).toBe('bribe-invalid');
  });

  it('the bribe retainer is charged each tick via the economy', () => {
    const s = createInitialState(1);
    s.player.cash = 1000;
    applyCommand(s, bribe('player', 30));
    const cash0 = s.player.cash;
    // tick: no income, expense = bribeLevel 30
    tick(s);
    expect(s.player.cash).toBe(cash0 - 30);
  });
});
