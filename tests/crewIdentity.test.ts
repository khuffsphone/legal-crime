import { describe, expect, it } from 'vitest';
import {
  bindLegacyPlayerCrewUnits,
  crewMemberForUnit,
  createInitialState,
  deserializeGame,
  serializeGame,
  spawnCollector,
  spawnUnit,
  orphanedPlayerCrewUnitIds,
  removeCrewMemberForUnit,
} from '../src/sim';

describe('map crew identity — Sal and Vito are embodied, save-compatible actors', () => {
  it('backfills legacy player bodies in stable roster order and copies combat skill', () => {
    const state = createInitialState(1, { startingCrew: true });
    const sal = spawnUnit('muscle-1', 1, 1);
    const vito = spawnUnit('muscle-2', 2, 1);
    sal.factionId = vito.factionId = state.player.id;
    state.units.push(sal, vito);

    expect(bindLegacyPlayerCrewUnits(state)).toBe(2);
    expect(sal).toMatchObject({ gangsterId: 'player-g-0', skill: 3 });
    expect(vito).toMatchObject({ gangsterId: 'player-g-1', skill: 3 });
    expect(crewMemberForUnit(state.player, sal)?.name).toBe('Sal');
    expect(crewMemberForUnit(state.player, vito)?.name).toBe('Vito');
  });

  it('preserves valid links, repairs duplicates, and never binds a collector', () => {
    const state = createInitialState(1, { startingCrew: true });
    const first = spawnUnit('body-a', 1, 1);
    const duplicate = spawnUnit('body-b', 2, 1);
    const collector = spawnCollector('collector', 3, 1, state.player.id, 100);
    first.factionId = duplicate.factionId = state.player.id;
    first.gangsterId = duplicate.gangsterId = 'player-g-0';
    state.units.push(first, duplicate, collector);

    bindLegacyPlayerCrewUnits(state);
    expect(first.gangsterId).toBe('player-g-0');
    expect(duplicate.gangsterId).toBe('player-g-1');
    expect(collector.gangsterId).toBeUndefined();
  });

  it('uses the legacy starter body hint after a casualty, so surviving Vito is not relabeled Sal', () => {
    const state = createInitialState(1, { startingCrew: true });
    const vito = spawnUnit('muscle-2', 2, 1);
    vito.factionId = state.player.id;
    state.units.push(vito);

    bindLegacyPlayerCrewUnits(state);
    expect(vito.gangsterId).toBe('player-g-1');
    expect(crewMemberForUnit(state.player, vito)?.name).toBe('Vito');
  });

  it('round-trips the optional identity link through the existing v1 save format', () => {
    const state = createInitialState(1, { startingCrew: true });
    const unit = spawnUnit('muscle-1', 1, 1);
    unit.factionId = state.player.id;
    unit.gangsterId = 'player-g-0';
    state.units.push(unit);

    const restored = deserializeGame(serializeGame(state));
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.state.units[0].gangsterId).toBe('player-g-0');
  });

  it('makes a linked field down a real roster casualty and clears their ties', () => {
    const state = createInitialState(1, { startingCrew: true });
    const sal = spawnUnit('muscle-1', 1, 1);
    sal.factionId = state.player.id;
    sal.gangsterId = 'player-g-0';

    expect(removeCrewMemberForUnit(state.player, sal)?.name).toBe('Sal');
    expect(state.player.gangsters.map((member) => member.name)).toEqual(['Vito']);
    expect(state.player.ties).toEqual([]);
  });

  it('finds linked bodies orphaned by a strategic roster removal', () => {
    const state = createInitialState(1, { startingCrew: true });
    const sal = spawnUnit('muscle-1', 1, 1);
    const vito = spawnUnit('muscle-2', 2, 1);
    sal.factionId = vito.factionId = state.player.id;
    sal.gangsterId = 'player-g-0';
    vito.gangsterId = 'player-g-1';
    state.units.push(sal, vito);
    state.player.gangsters = state.player.gangsters.filter((member) => member.id !== 'player-g-0');

    expect(orphanedPlayerCrewUnitIds(state)).toEqual(['muscle-1']);
  });

  it('drops surplus anonymous fighters from a malformed legacy save', () => {
    const state = createInitialState(1, { startingCrew: true });
    const bodies = ['muscle-1', 'muscle-2', 'ghost'].map((id, index) => {
      const unit = spawnUnit(id, index + 1, 1);
      unit.factionId = state.player.id;
      return unit;
    });
    state.units.push(...bodies);

    bindLegacyPlayerCrewUnits(state);
    expect(state.units.map((unit) => unit.id)).toEqual(['muscle-1', 'muscle-2']);
  });
});
