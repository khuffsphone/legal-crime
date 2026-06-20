import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  applyCommand,
  type RecruitGangsterCommand,
  type AssignGangsterCommand,
} from '../src/sim/commands';
import { tick } from '../src/sim/tick';
import { loyaltyDelta, desertionChance, resolveLoyalty } from '../src/sim/gangsters';
import { traitUpkeepModifier } from '../src/sim/traits';
import {
  RECRUIT_COST,
  RECRUIT_SKILL_MIN,
  RECRUIT_SKILL_MAX,
  RECRUIT_LOYALTY_MIN,
  RECRUIT_LOYALTY_MAX,
  GANGSTER_UPKEEP_PER_SKILL,
  DESERT_LOYALTY,
  LOYALTY_GAIN_PAID,
  LOYALTY_DROP_UNPAID,
  MAX_DESERT_CHANCE,
} from '../src/sim/constants';
import type { Gangster } from '../src/sim/types';

const recruit = (familyId: string): RecruitGangsterCommand => ({ type: 'recruitGangster', familyId });

function gangster(id: string, loyalty: number): Gangster {
  return { id, name: id, skill: 5, loyalty, upkeep: 50, assignment: { type: 'idle' } };
}

describe('recruitGangster', () => {
  it('deducts cost and adds a gangster with stats in range and skill-scaled upkeep', () => {
    const s = createInitialState(1);
    s.player.cash = 2000;
    applyCommand(s, recruit('player'));

    expect(s.player.cash).toBe(2000 - RECRUIT_COST);
    expect(s.player.gangsters).toHaveLength(1);
    const g = s.player.gangsters[0];
    expect(g.skill).toBeGreaterThanOrEqual(RECRUIT_SKILL_MIN);
    expect(g.skill).toBeLessThanOrEqual(RECRUIT_SKILL_MAX);
    expect(g.loyalty).toBeGreaterThanOrEqual(RECRUIT_LOYALTY_MIN);
    expect(g.loyalty).toBeLessThanOrEqual(RECRUIT_LOYALTY_MAX);
    // RTS-14: a recruit gets 1–2 seeded traits; upkeep is skill-scaled plus the trait modifier.
    expect(g.traits!.length).toBeGreaterThanOrEqual(1);
    expect(g.traits!.length).toBeLessThanOrEqual(2);
    expect(g.upkeep).toBe(Math.max(0, g.skill * GANGSTER_UPKEEP_PER_SKILL + traitUpkeepModifier(g.traits!)));
    expect(g.assignment).toEqual({ type: 'idle' });
  });

  it('is denied without enough cash and leaves the roster unchanged', () => {
    const s = createInitialState(1);
    s.player.cash = RECRUIT_COST - 1;
    applyCommand(s, recruit('player'));
    expect(s.player.gangsters).toHaveLength(0);
    expect(s.player.cash).toBe(RECRUIT_COST - 1);
    expect(s.log.at(-1)?.kind).toBe('recruit-denied');
  });

  it('is deterministic: same seed recruits identical gangsters', () => {
    const build = (seed: number) => {
      const s = createInitialState(seed);
      s.player.cash = 5000;
      applyCommand(s, recruit('player'));
      applyCommand(s, recruit('player'));
      return s.player.gangsters.map((g) => ({ skill: g.skill, loyalty: g.loyalty, name: g.name }));
    };
    expect(build(11)).toEqual(build(11));
  });

  it('assigns unique ids per recruit', () => {
    const s = createInitialState(1);
    s.player.cash = 5000;
    applyCommand(s, recruit('player'));
    applyCommand(s, recruit('player'));
    expect(new Set(s.player.gangsters.map((g) => g.id)).size).toBe(2);
  });
});

describe('assignGangster', () => {
  it('assigns a gangster to guard a valid district', () => {
    const s = createInitialState(1);
    s.player.gangsters = [gangster('g1', 50)];
    const cmd: AssignGangsterCommand = {
      type: 'assignGangster',
      gangsterId: 'g1',
      assignment: { type: 'guard', districtId: 'district-0' },
    };
    applyCommand(s, cmd);
    expect(s.player.gangsters[0].assignment).toEqual({ type: 'guard', districtId: 'district-0' });
  });

  it('rejects assignment to a non-existent district', () => {
    const s = createInitialState(1);
    s.player.gangsters = [gangster('g1', 50)];
    applyCommand(s, {
      type: 'assignGangster',
      gangsterId: 'g1',
      assignment: { type: 'guard', districtId: 'nope' },
    });
    expect(s.player.gangsters[0].assignment).toEqual({ type: 'idle' });
    expect(s.log.at(-1)?.kind).toBe('assign-invalid');
  });

  it('rejects assigning to a front as if it were an operation', () => {
    const s = createInitialState(1);
    s.player.gangsters = [gangster('g1', 50)];
    const frontId = s.districts[0].businesses[0].id;
    applyCommand(s, {
      type: 'assignGangster',
      gangsterId: 'g1',
      assignment: { type: 'operation', businessId: frontId },
    });
    expect(s.log.at(-1)?.kind).toBe('assign-invalid');
  });
});

describe('loyaltyDelta', () => {
  it('gains when paid, with a heat penalty of floor(heat/20)', () => {
    expect(loyaltyDelta(true, 0)).toBe(LOYALTY_GAIN_PAID);
    expect(loyaltyDelta(true, 40)).toBe(LOYALTY_GAIN_PAID - 2);
    expect(loyaltyDelta(true, 59)).toBe(LOYALTY_GAIN_PAID - 2);
    expect(loyaltyDelta(true, 60)).toBe(LOYALTY_GAIN_PAID - 3);
  });

  it('drops when unpaid', () => {
    expect(loyaltyDelta(false, 0)).toBe(-LOYALTY_DROP_UNPAID);
    expect(loyaltyDelta(false, 40)).toBe(-LOYALTY_DROP_UNPAID - 2);
  });
});

describe('desertionChance', () => {
  it('is zero at or above the threshold', () => {
    expect(desertionChance(DESERT_LOYALTY)).toBe(0);
    expect(desertionChance(DESERT_LOYALTY + 10)).toBe(0);
  });

  it('rises linearly to MAX_DESERT_CHANCE as loyalty falls to 0', () => {
    expect(desertionChance(0)).toBeCloseTo(MAX_DESERT_CHANCE, 6);
    expect(desertionChance(10)).toBeCloseTo(MAX_DESERT_CHANCE / 2, 6);
  });
});

describe('resolveLoyalty (tick step 4)', () => {
  it('raises loyalty of paid, low-heat gangsters and never deserts them', () => {
    const s = createInitialState(1);
    s.player.cash = 1000;
    s.player.heat = 0;
    s.player.gangsters = [gangster('g1', 50)];
    resolveLoyalty(s);
    expect(s.player.gangsters[0].loyalty).toBe(50 + LOYALTY_GAIN_PAID);
  });

  it('clamps loyalty at 100', () => {
    const s = createInitialState(1);
    s.player.cash = 1000;
    s.player.heat = 0;
    s.player.gangsters = [gangster('g1', 100)];
    resolveLoyalty(s);
    expect(s.player.gangsters[0].loyalty).toBe(100);
  });

  it('deserts some low-loyalty gangsters across seeds but never high-loyalty ones', () => {
    let deserted = 0;
    let stayed = 0;
    for (let seed = 0; seed < 60; seed++) {
      const s = createInitialState(seed);
      s.player.cash = 1000;
      s.player.heat = 0;
      // loyalty 0; after +2 drift it's 2 -> desertionChance high
      s.player.gangsters = [gangster('risk', 0)];
      resolveLoyalty(s);
      if (s.player.gangsters.length === 0) deserted++;
      else stayed++;
    }
    expect(deserted).toBeGreaterThan(0);
    expect(stayed).toBeGreaterThan(0);
  });

  it('a high-loyalty gangster never deserts over many ticks', () => {
    const s = createInitialState(2);
    s.player.cash = 100000;
    s.player.gangsters = [gangster('loyal', 90)];
    for (let i = 0; i < 30; i++) tick(s);
    expect(s.player.gangsters).toHaveLength(1);
  });
});
