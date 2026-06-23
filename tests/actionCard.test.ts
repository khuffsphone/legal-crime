// RTS-30c-2b — pure tests for the contextual action card (which verbs a selected unit offers + their
// enabled state) and the patrol presence bonus.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { unitRepertoire, unitActionChips, commonVerbs, multiSelectChips, type UnitActionContext } from '../src/sim/actionCard';
import { isCommandableUnit } from '../src/sim/selection';
import { unitMusclePresence, PATROL_PRESENCE_BONUS, enforcerPresenceWeight } from '../src/sim/enforcers';
import type { GameState } from '../src/sim/types';

function big(seed = 1): GameState { return createInitialState(seed, { startingCrew: true, bigCity: true }); }
const base: UnitActionContext = { extortTarget: false, attackTarget: false };

describe('action card — per-unit repertoire', () => {
  it('RTS-30d-2: a collector is AUTONOMOUS — it exposes NO action verbs (not commandable)', () => {
    expect(unitRepertoire({ ...base, role: 'collector' })).toEqual([]);
    expect(unitActionChips(big(), { ...base, role: 'collector' })).toEqual([]);
    expect(isCommandableUnit({ role: 'collector' })).toBe(false);
    expect(isCommandableUnit({ role: undefined })).toBe(true); // a thug is commandable
    expect(isCommandableUnit({ role: 'enforcer' })).toBe(true);
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

describe('RTS-30d-3 — multi-select common verbs (intersection)', () => {
  const s = big();
  it('Move/Patrol/Collect/Recruit are common to a mixed muscle selection', () => {
    const mix = [{ ...base, weapon: 'shotgun' as const }, { ...base, weapon: 'hitman' as const }, { ...base }];
    const common = commonVerbs(mix);
    for (const v of ['move', 'patrol', 'collect', 'recruit'] as const) expect(common).toContain(v);
  });
  it('a unit-specific verb (assassinate) is NOT common unless every unit has it', () => {
    expect(commonVerbs([{ ...base, weapon: 'hitman' as const }, { ...base, weapon: 'shotgun' as const }])).not.toContain('assassinate');
    expect(commonVerbs([{ ...base, weapon: 'hitman' as const }])).toContain('assassinate'); // a hitman alone
    // a thug+shotgun share the street kit (attack/extort/raid/expand) but a hitman in the mix drops them
    expect(commonVerbs([{ ...base, weapon: 'shotgun' as const }, { ...base }])).toContain('attack');
    expect(commonVerbs([{ ...base, weapon: 'shotgun' as const }, { ...base, weapon: 'hitman' as const }])).not.toContain('attack');
  });
  it('multiSelectChips resolves the common verbs as enabled/locked chips', () => {
    const chips = multiSelectChips(s, [{ ...base, weapon: 'shotgun' as const }, { ...base }], base);
    expect(chips.find((c) => c.verb === 'move')!.enabled).toBe(true);
    expect(chips.every((c) => commonVerbs([{ ...base, weapon: 'shotgun' as const }, { ...base }]).includes(c.verb))).toBe(true);
  });
  it('an empty selection has no common verbs', () => { expect(commonVerbs([])).toEqual([]); });
});
