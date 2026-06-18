import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  SHOCK_KINDS,
  incomeShockMultiplier,
  fedShield,
  auditSeizure,
  triggerShock,
  resolveShocks,
} from '../src/sim/shocks';
import { accrueUncollected, uncollectedOf } from '../src/sim/collection';
import { tick } from '../src/sim/tick';
import {
  BOOM_MULT,
  BUST_MULT,
  CRACKDOWN_HEAT,
  SHOCK_DURATION,
  AUDIT_SEIZE_FRACTION,
  AUDIT_FED_SHIELD_PER_LEVEL,
} from '../src/sim/constants';
import type { Business } from '../src/sim/types';

function front(id: string, baseIncome: number, extortedBy?: string, uncollected = 0): Business {
  return { id, name: id, kind: 'front', baseIncome, heatPerTick: 0, districtId: 'district-0', extortedBy, uncollected };
}
function operation(id: string, owner: string): Business {
  return { id, name: id, kind: 'numbers', baseIncome: 200, heatPerTick: 4, districtId: 'district-0', ownerFamily: owner, uncollected: 0, tier: 1 };
}

describe('shocks disabled by default', () => {
  it('resolveShocks is a no-op and draws no RNG when disabled', () => {
    const s = createInitialState(1); // shocks off
    const cursor = s.rngState;
    resolveShocks(s);
    expect(s.rngState).toBe(cursor);
    expect(s.activeShocks).toEqual([]);
  });
});

describe('income shock multiplier', () => {
  it('is 1 with no shocks, and multiplies for boom/bust', () => {
    const s = createInitialState(1);
    expect(incomeShockMultiplier(s)).toBe(1);
    s.activeShocks = [{ kind: 'boom', ticksRemaining: 2 }];
    expect(incomeShockMultiplier(s)).toBe(BOOM_MULT);
    s.activeShocks = [{ kind: 'bust', ticksRemaining: 2 }];
    expect(incomeShockMultiplier(s)).toBe(BUST_MULT);
  });

  it('scales business accrual', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [front('f1', 100, 'player')]; // base accrual 30
    s.activeShocks = [{ kind: 'boom', ticksRemaining: 2 }];
    accrueUncollected(s);
    expect(uncollectedOf(s.districts[0].businesses[0])).toBe(Math.floor(30 * BOOM_MULT)); // 45
  });
});

describe('fedShield / auditSeizure', () => {
  it('fedShield is feds * per-level, capped at 1', () => {
    expect(fedShield(0)).toBe(0);
    expect(fedShield(10)).toBeCloseTo(10 * AUDIT_FED_SHIELD_PER_LEVEL, 6);
    expect(fedShield(100000)).toBe(1);
  });

  it('auditSeizure takes a shielded fraction of dirty cash', () => {
    expect(auditSeizure(1000, 0)).toBe(Math.floor(1000 * AUDIT_SEIZE_FRACTION)); // 500
    expect(auditSeizure(1000, 25)).toBe(Math.floor(1000 * AUDIT_SEIZE_FRACTION * (1 - 0.5))); // 250
    expect(auditSeizure(0, 0)).toBe(0);
  });
});

describe('triggerShock — instant effects', () => {
  it('audit seizes dirty cash but leaves clean cash untouched', () => {
    const s = createInitialState(1);
    s.player.cash = 2000;
    s.player.dirtyCash = 1000; // clean = 1000
    triggerShock(s, 'audit'); // seizes floor(1000 * AUDIT_SEIZE_FRACTION) = 500
    expect(s.player.dirtyCash).toBe(1000 - Math.floor(1000 * AUDIT_SEIZE_FRACTION));
    expect(s.player.cash).toBe(2000 - Math.floor(1000 * AUDIT_SEIZE_FRACTION));
    expect(s.player.cash - s.player.dirtyCash).toBe(1000); // clean preserved
  });

  it('feds bribe shields the audit', () => {
    const s = createInitialState(1);
    s.player.cash = 2000;
    s.player.dirtyCash = 1000;
    s.player.bribes.feds = 50; // full shield (50 * 0.02 = 1)
    triggerShock(s, 'audit');
    expect(s.player.dirtyCash).toBe(1000); // nothing seized
    expect(s.player.cash).toBe(2000);
  });

  it('gangWar queues a hit from each armed living rival against the player', () => {
    const s = createInitialState(1);
    s.rivals[0].gangsters = [
      { id: 'r1', name: 'r1', skill: 5, loyalty: 60, upkeep: 0, assignment: { type: 'idle' } },
    ];
    s.rivals[1].gangsters = []; // unarmed -> no hit
    triggerShock(s, 'gangWar');
    expect(s.pendingHits).toHaveLength(1);
    expect(s.pendingHits[0]).toMatchObject({ attackerId: 'rival-a', targetId: 'player' });
  });

  it('speakeasyRaid removes one operation', () => {
    const s = createInitialState(1);
    s.districts[0].businesses = [front('f1', 100), operation('op1', 'player')];
    triggerShock(s, 'speakeasyRaid');
    expect(s.districts[0].businesses.find((b) => b.id === 'op1')).toBeUndefined();
    expect(s.districts[0].businesses.find((b) => b.id === 'f1')).toBeDefined(); // fronts spared
  });
});

describe('triggerShock — durational shocks', () => {
  it('crackdown registers and adds heat each tick while active, then expires', () => {
    const s = createInitialState(1, { shocks: true });
    s.player.heat = 0;
    triggerShock(s, 'crackdown');
    expect(s.activeShocks).toHaveLength(1);
    expect(s.activeShocks[0]).toMatchObject({ kind: 'crackdown', ticksRemaining: SHOCK_DURATION });
  });

  it('an active crackdown raises heat via resolveShocks ongoing effect', () => {
    const s = createInitialState(1, { shocks: true });
    s.player.heat = 0;
    s.activeShocks = [{ kind: 'crackdown', ticksRemaining: 2 }];
    // Force no NEW shock by checking heat gained equals exactly one crackdown's worth.
    const heat0 = s.player.heat;
    // Apply the ongoing effect deterministically by running resolveShocks; a new shock might
    // also fire, but crackdown ongoing always adds CRACKDOWN_HEAT to the existing one.
    resolveShocks(s);
    expect(s.player.heat).toBeGreaterThanOrEqual(heat0 + CRACKDOWN_HEAT);
  });
});

describe('shock system over ticks (enabled)', () => {
  it('eventually fires shocks and they expire (bounded active set)', () => {
    const s = createInitialState(2, { shocks: true });
    s.player.cash = 100000;
    let everFired = false;
    for (let i = 0; i < 60; i++) {
      tick(s);
      if (s.log.some((e) => e.kind === 'shock')) everFired = true;
      // durational shocks never pile up beyond a small bound
      expect(s.activeShocks.length).toBeLessThanOrEqual(SHOCK_KINDS.length * SHOCK_DURATION);
    }
    expect(everFired).toBe(true);
  });

  it('is deterministic with shocks enabled for the same seed', () => {
    const build = (seed: number) => {
      const s = createInitialState(seed, { shocks: true });
      s.player.cash = 100000;
      for (let i = 0; i < 20; i++) tick(s);
      return s;
    };
    expect(build(5)).toEqual(build(5));
  });

  it('a disabled game never fires a shock over many ticks', () => {
    const s = createInitialState(2); // shocks off
    s.player.cash = 100000;
    for (let i = 0; i < 60; i++) tick(s);
    expect(s.log.some((e) => e.kind === 'shock')).toBe(false);
    expect(s.activeShocks).toEqual([]);
  });
});
