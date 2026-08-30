// NO-X-RAY — strategic readouts must be able to score only targets the scene has proved knowable.
// The legacy readout remains auto-targeted for compatibility; the explicit seam treats `{}` as no target.
import { describe, expect, it } from 'vitest';
import { unitActionChips, multiSelectChips, type UnitActionContext } from '../src/sim/actionCard';
import { buildActionInspector, multiSelectInspectors } from '../src/sim/actionInspector';
import { LOCKOUT_BUREAU_REQ } from '../src/sim/constants';
import { weakestRival } from '../src/sim/endgame';
import { offenseReadout, offenseReadoutForTargets, type OffenseTargetIds } from '../src/sim/pacing';
import { createInitialState } from '../src/sim/state';
import type { Business, GameState } from '../src/sim/types';

const base: UnitActionContext = { extortTarget: false, attackTarget: false };

function readyState(seed = 71): { state: GameState; targets: OffenseTargetIds } {
  const state = createInitialState(seed, { startingCrew: true, bigCity: true });
  state.player.cash = 20_000;
  state.player.bribes.feds = LOCKOUT_BUREAU_REQ;
  for (const gangster of state.player.gangsters) gangster.skill = 10;
  state.districts[0].control.player = 60;

  const racket: Business = {
    id: 'known-racket',
    name: 'Needle Club',
    kind: 'smuggling',
    baseIncome: 500,
    heatPerTick: 8,
    ownerFamily: 'rival-b',
    districtId: 'district-2',
    uncollected: 100,
    tier: 1,
  };
  state.districts[2].businesses.push(racket);
  return {
    state,
    targets: {
      sabotageBusinessId: racket.id,
      raidDistrictId: state.districts[2].id,
      lockoutRivalId: 'rival-b',
      assassinateRivalId: 'rival-b',
    },
  };
}

describe('target-explicit offense readout', () => {
  it('scores and names only the ids supplied by the caller', () => {
    const { state, targets } = readyState();
    const rows = offenseReadoutForTargets(state, targets);
    expect(rows.map((row) => row.target)).toEqual([
      'Needle Club',
      state.districts[2].name,
      state.rivals.find((rival) => rival.id === 'rival-b')!.name,
      state.rivals.find((rival) => rival.id === 'rival-b')!.name,
    ]);
    expect(rows.every((row) => row.available)).toBe(true);
  });

  it('makes hidden-state variants observationally identical when no targets are supplied', () => {
    const { state: left } = readyState(72);
    const { state: right } = readyState(72);
    right.districts[2].name = 'SECRET DISTRICT';
    right.districts[2].control['rival-a'] = 99;
    right.districts[2].businesses.find((business) => business.id === 'known-racket')!.name = 'SECRET RACKET';
    right.rivals[0].name = 'SECRET FAMILY';
    right.rivals[0].hqIntegrity = 1;

    const leftRows = offenseReadoutForTargets(left, {});
    const rightRows = offenseReadoutForTargets(right, {});
    expect(leftRows).toEqual(rightRows);
    expect(leftRows.every((row) => row.target === null && !row.available)).toBe(true);
    expect(JSON.stringify(leftRows)).not.toContain('SECRET');
  });

  it('preserves the legacy citywide auto-target result', () => {
    const { state } = readyState(73);
    const weak = weakestRival(state)!;
    expect(offenseReadout(state)).toEqual(offenseReadoutForTargets(state, {
      sabotageBusinessId: 'known-racket',
      raidDistrictId: 'district-2',
      lockoutRivalId: weak.familyId,
      assassinateRivalId: weak.familyId,
    }));
  });
});

describe('visibility-aware action cards and inspectors', () => {
  it('lets an explicit empty target set lock chips that legacy auto-targeting enables', () => {
    const { state } = readyState(74);
    const legacyHit = unitActionChips(state, { ...base, weapon: 'hitman' }).find((chip) => chip.verb === 'assassinate')!;
    const safeHit = unitActionChips(state, { ...base, weapon: 'hitman', offenseTargets: {} }).find((chip) => chip.verb === 'assassinate')!;
    expect(legacyHit.enabled).toBe(true);
    expect(safeHit).toMatchObject({ enabled: false, reason: 'no rival Don left' });

    const units = [{ ...base, weapon: 'shotgun' as const }, { ...base }];
    const legacyRaid = multiSelectChips(state, units, base).find((chip) => chip.verb === 'raid')!;
    const safeRaid = multiSelectChips(state, units, { ...base, offenseTargets: {} }).find((chip) => chip.verb === 'raid')!;
    expect(legacyRaid.enabled).toBe(true);
    expect(safeRaid).toMatchObject({ enabled: false, reason: 'no rival turf to raid' });
  });

  it('threads explicit targets through single- and multi-action inspectors without naming hidden rivals', () => {
    const { state, targets } = readyState(75);
    const rivalName = state.rivals.find((rival) => rival.id === 'rival-b')!.name;
    const safe = buildActionInspector(state, 'assassinate', { offenseTargets: {} });
    const targetRow = safe.rows.find((row) => row.category === 'target')!;
    expect(targetRow).toMatchObject({ state: 'missing', label: 'No rival Don left' });
    expect(JSON.stringify(safe)).not.toContain(rivalName);

    const explicit = buildActionInspector(state, 'assassinate', { offenseTargets: targets });
    expect(explicit.rows.find((row) => row.category === 'target')).toMatchObject({ state: 'met', current: rivalName });

    const multi = multiSelectInspectors(state, ['raid'], { offenseTargets: {} });
    expect(multi[0].rows.find((row) => row.category === 'target')?.state).toBe('missing');
  });
});
