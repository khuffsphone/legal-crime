import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { applyCommand, type ExpandControlCommand } from '../src/sim/commands';
import {
  controlOf,
  districtHolder,
  holdsDistrict,
  districtsHeldBy,
  districtsHeldCount,
  topRivalControl,
} from '../src/sim/territory';
import {
  EXPAND_COST,
  EXPAND_BASE_GAIN,
  CONTROL_HOLD,
  CONTROL_MAX,
  CONTEST_REDUCTION,
} from '../src/sim/constants';
import type { Gangster } from '../src/sim/types';

function guard(id: string, skill: number, districtId: string): Gangster {
  return { id, name: id, skill, loyalty: 50, upkeep: 0, assignment: { type: 'guard', districtId } };
}

const expand = (familyId: string, districtId: string): ExpandControlCommand => ({
  type: 'expandControl',
  familyId,
  districtId,
});

describe('districtHolder / holdsDistrict', () => {
  it('returns the family at or above CONTROL_HOLD that is the strict max', () => {
    const s = createInitialState(1);
    const d = s.districts[0];
    d.control = { player: 60, 'rival-a': 30 };
    expect(districtHolder(d)).toBe('player');
    expect(holdsDistrict(d, 'player')).toBe(true);
    expect(holdsDistrict(d, 'rival-a')).toBe(false);
  });

  it('returns undefined when the top control is below the hold threshold', () => {
    const s = createInitialState(1);
    const d = s.districts[0];
    d.control = { player: CONTROL_HOLD - 1, 'rival-a': 10 };
    expect(districtHolder(d)).toBeUndefined();
  });

  it('returns undefined when the max is tied (contested)', () => {
    const s = createInitialState(1);
    const d = s.districts[0];
    d.control = { player: 70, 'rival-a': 70 };
    expect(districtHolder(d)).toBeUndefined();
  });

  it('the fresh world has no holder in the player foothold district', () => {
    const s = createInitialState(1);
    expect(districtHolder(s.districts[0])).toBeUndefined(); // player only has 30
  });
});

describe('districtsHeldBy / districtsHeldCount', () => {
  it('counts only districts a family strictly holds', () => {
    const s = createInitialState(1);
    s.districts[0].control = { player: 80 };
    s.districts[1].control = { player: 55, 'rival-a': 20 };
    s.districts[2].control = { player: 40 }; // below hold
    expect(districtsHeldCount(s, 'player')).toBe(2);
    expect(districtsHeldBy(s, 'player').map((d) => d.id)).toEqual(['district-0', 'district-1']);
  });
});

describe('topRivalControl', () => {
  it('finds the strongest other family with positive control', () => {
    const s = createInitialState(1);
    const d = s.districts[0];
    d.control = { player: 50, 'rival-a': 30, 'rival-b': 45 };
    expect(topRivalControl(d, 'player')).toEqual({ id: 'rival-b', control: 45 });
  });

  it('returns undefined when no other family has control', () => {
    const s = createInitialState(1);
    const d = s.districts[0];
    d.control = { player: 50 };
    expect(topRivalControl(d, 'player')).toBeUndefined();
  });
});

describe('expandControl command', () => {
  it('deducts cost and adds the base gain with no muscle', () => {
    const s = createInitialState(1);
    s.player.cash = 1000;
    s.districts[0].control = { player: 30 };
    applyCommand(s, expand('player', 'district-0'));
    expect(s.player.cash).toBe(1000 - EXPAND_COST);
    expect(controlOf(s.districts[0], 'player')).toBe(30 + EXPAND_BASE_GAIN);
  });

  it('adds a muscle bonus equal to guarding skill in the district', () => {
    const s = createInitialState(1);
    s.player.cash = 1000;
    s.districts[0].control = { player: 30 };
    s.player.gangsters = [guard('g1', 5, 'district-0'), guard('g2', 3, 'district-0')];
    applyCommand(s, expand('player', 'district-0'));
    expect(controlOf(s.districts[0], 'player')).toBe(30 + EXPAND_BASE_GAIN + 8);
  });

  it('caps control at CONTROL_MAX', () => {
    const s = createInitialState(1);
    s.player.cash = 1000;
    s.districts[0].control = { player: 95 };
    applyCommand(s, expand('player', 'district-0'));
    expect(controlOf(s.districts[0], 'player')).toBe(CONTROL_MAX);
  });

  it('reduces the strongest rival by floor(gain * CONTEST_REDUCTION)', () => {
    const s = createInitialState(1);
    s.player.cash = 1000;
    s.districts[0].control = { player: 20, 'rival-a': 40, 'rival-b': 25 };
    applyCommand(s, expand('player', 'district-0')); // gain 10, contest floor(5)=5
    expect(controlOf(s.districts[0], 'rival-a')).toBe(40 - Math.floor(EXPAND_BASE_GAIN * CONTEST_REDUCTION));
    expect(controlOf(s.districts[0], 'rival-b')).toBe(25); // untouched
  });

  it('does not drive a rival below zero', () => {
    const s = createInitialState(1);
    s.player.cash = 1000;
    s.districts[0].control = { player: 20, 'rival-a': 2 };
    applyCommand(s, expand('player', 'district-0'));
    expect(controlOf(s.districts[0], 'rival-a')).toBe(0);
  });

  it('is denied without enough cash', () => {
    const s = createInitialState(1);
    s.player.cash = EXPAND_COST - 1;
    s.districts[0].control = { player: 30 };
    applyCommand(s, expand('player', 'district-0'));
    expect(controlOf(s.districts[0], 'player')).toBe(30);
    expect(s.log.at(-1)?.kind).toBe('expand-denied');
  });

  it('repeated expansion eventually lets a family hold the district', () => {
    const s = createInitialState(1);
    s.player.cash = 10000;
    s.districts[0].control = { player: 30 };
    expect(holdsDistrict(s.districts[0], 'player')).toBe(false);
    applyCommand(s, expand('player', 'district-0')); // 40
    applyCommand(s, expand('player', 'district-0')); // 50 -> holds
    expect(holdsDistrict(s.districts[0], 'player')).toBe(true);
  });

  it('is deterministic for the same seed and commands', () => {
    const build = (seed: number) => {
      const s = createInitialState(seed);
      s.player.cash = 10000;
      applyCommand(s, expand('player', 'district-0'));
      applyCommand(s, expand('player', 'district-2'));
      return s.districts.map((d) => ({ ...d.control }));
    };
    expect(build(4)).toEqual(build(4));
  });
});
