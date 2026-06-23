// RTS-30c-2b — pure tests for the contextual action card (which verbs a selected unit offers + their
// enabled state) and the patrol presence bonus.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { unitRepertoire, unitActionChips, type UnitActionContext } from '../src/sim/actionCard';
import { unitMusclePresence, PATROL_PRESENCE_BONUS, enforcerPresenceWeight } from '../src/sim/enforcers';
import type { GameState } from '../src/sim/types';

function big(seed = 1): GameState { return createInitialState(seed, { startingCrew: true, bigCity: true }); }
const base: UnitActionContext = { extortTarget: false, attackTarget: false };

describe('action card — per-unit repertoire', () => {
  it('a collector is near-passive (move + collect only)', () => {
    expect(unitRepertoire({ ...base, role: 'collector' })).toEqual(['move', 'collect']);
  });
  it('a HITMAN leads with assassinate; a DEMOLITIONS man leads with demolish; neither shows extort/raid', () => {
    expect(unitRepertoire({ ...base, weapon: 'hitman' })).toContain('assassinate');
    expect(unitRepertoire({ ...base, weapon: 'hitman' })).not.toContain('extort');
    const demo = unitRepertoire({ ...base, weapon: 'demolitions' });
    expect(demo).toContain('demolish');
    expect(demo).toContain('sabotage');
  });
  it('plain/combat muscle gets the street kit (attack, extort, patrol, raid, expand)', () => {
    const rep = unitRepertoire({ ...base, weapon: 'shotgun' });
    for (const v of ['attack', 'extort', 'patrol', 'raid', 'expand'] as const) expect(rep).toContain(v);
    expect(rep).not.toContain('assassinate'); // not a hitman
  });
});

describe('action card — per-verb enabled/locked state', () => {
  it('move/patrol/recruit are always enabled for muscle; collect locks with no takings', () => {
    const s = big();
    const chips = unitActionChips(s, { ...base, weapon: 'pistol' });
    const by = (v: string) => chips.find((c) => c.verb === v)!;
    expect(by('move').enabled).toBe(true);
    expect(by('patrol').enabled).toBe(true);
    expect(by('recruit').enabled).toBe(true);
    expect(by('collect').enabled).toBe(false); // nothing to collect at the start
    expect(by('collect').reason).toMatch(/takings/);
  });
  it('extort/attack reflect the scene target context (locked → enabled)', () => {
    const s = big();
    const off = unitActionChips(s, { ...base, weapon: 'thug' as never });
    expect(off.find((c) => c.verb === 'extort')!.enabled).toBe(false);
    const on = unitActionChips(s, { ...base, extortTarget: true, attackTarget: true });
    expect(on.find((c) => c.verb === 'extort')!.enabled).toBe(true);
    expect(on.find((c) => c.verb === 'attack')!.enabled).toBe(true);
  });
  it('a hitman chip shows the actual hotkey for assassinate ([3])', () => {
    const s = big();
    const chips = unitActionChips(s, { ...base, weapon: 'hitman' });
    expect(chips.find((c) => c.verb === 'assassinate')!.hotkey).toBe('3');
  });
});

describe('patrol — the presence bonus', () => {
  it('a patrolling unit contributes MORE muscle presence than the same unit free-moving', () => {
    const idle = { weapon: 'shotgun' as const, patrol: false };
    const onBeat = { weapon: 'shotgun' as const, patrol: true };
    expect(unitMusclePresence(onBeat)).toBeCloseTo(unitMusclePresence(idle) + PATROL_PRESENCE_BONUS);
    expect(unitMusclePresence(onBeat)).toBeGreaterThan(unitMusclePresence(idle));
  });
  it('a patrolling THUG still beats an idle thug; a collector contributes nothing', () => {
    expect(unitMusclePresence({ patrol: true })).toBeCloseTo(enforcerPresenceWeight(undefined) + PATROL_PRESENCE_BONUS);
    expect(unitMusclePresence({ role: 'collector', patrol: true })).toBe(0);
  });
});
