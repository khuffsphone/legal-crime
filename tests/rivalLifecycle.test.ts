import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInitialState } from '../src/sim/state';
import { spawnCollector, spawnEnforcer, spawnUnit } from '../src/sim/movement';
import {
  cleanupDeadRivalEmbodiment,
  emptyRivalEmbodimentCleanup,
  mergeRivalEmbodimentCleanup,
} from '../src/sim/rivalLifecycle';
import { updateAndObserve } from '../src/sim/realtime';
import type { EmbodiedExtortionAct } from '../src/sim/extortionEmbodied';

function act(id: string, thugId: string, familyId: string): EmbodiedExtortionAct {
  return {
    id, thugId, frontId: 'district-0-front-0', familyId,
    interaction: { gx: 1, gy: 1 }, state: 'approach', progress: 0, durationSec: 3,
    engageT: 0, absenceT: 0, interruptT: 0, approachT: 0,
  };
}

describe('dead-rival embodied cleanup', () => {
  it('is a structural no-op while every rival is alive', () => {
    const state = createInitialState(11, { bigCity: true });
    const units = state.units;
    const pendingHits = state.pendingHits;
    expect(cleanupDeadRivalEmbodiment(state)).toEqual(emptyRivalEmbodimentCleanup());
    expect(state.units).toBe(units);
    expect(state.pendingHits).toBe(pendingHits);
    expect(state.routes).toBeUndefined();
    expect(state.contests).toBeUndefined();
    expect(state.combatOrders).toBeUndefined();
  });

  it('retires a dead rival\'s fighters, collectors, routes, contests, acts, hits, and orders only', () => {
    const state = createInitialState(12, { bigCity: true });
    state.rivals[0].alive = false;
    const deadFighter = spawnEnforcer('dead-fighter', 2, 2, 'rival-a');
    const deadCollector = spawnCollector('dead-collector', 3, 3, 'rival-a', 220);
    deadCollector.routeId = 'dead-route';
    const liveFighter = spawnEnforcer('live-fighter', 4, 4, 'rival-b');
    const playerFighter = spawnEnforcer('player-fighter', 5, 5, 'player');
    const neutral = spawnUnit('neutral', 6, 6);
    state.units = [deadFighter, deadCollector, liveFighter, playerFighter, neutral];
    state.routes = [
      { id: 'dead-route', familyId: 'rival-a', stops: ['district-2-front-0'] },
      { id: 'live-route', familyId: 'rival-b', stops: ['district-6-front-0'] },
      { id: 'player-route', familyId: 'player', stops: ['district-0-front-0'] },
    ];
    state.contests = [
      { districtId: 'district-0', invaderId: 'rival-a', pressure: 20, muscleIds: ['dead-fighter'] },
      // A malformed old-save reference to the dead unit is pruned without cancelling the live contest.
      { districtId: 'district-1', invaderId: 'rival-b', pressure: 10, muscleIds: ['live-fighter', 'dead-collector'] },
    ];
    state.pendingHits = [
      { attackerId: 'rival-a', targetId: 'player', orderedTick: 0 },
      { attackerId: 'player', targetId: 'rival-a', orderedTick: 0 },
      { attackerId: 'rival-b', targetId: 'player', orderedTick: 0 },
    ];
    state.extortionActs = [act('dead-act', 'dead-fighter', 'rival-a'), act('player-act', 'player-fighter', 'player')];
    state.combatOrders = {
      'dead-fighter': { stance: 'ATTACK_MOVE', dest: { gx: 8, gy: 8 } },
      'player-fighter': { stance: 'FOCUS_FIRE', targetId: 'dead-fighter', lastSeen: { gx: 2, gy: 2 } },
      'live-fighter': { stance: 'FOCUS_FIRE', targetId: 'player-fighter', lastSeen: { gx: 5, gy: 5 } },
      neutral: { stance: 'ATTACK_MOVE', dest: { gx: 7, gy: 7 } },
    };
    state.downedBodies = [{ id: 'dead-memory', factionId: 'rival-a', gx: 2, gy: 2, ageSec: 1 }];
    const controlBefore = state.districts.map((district) => ({ ...district.control }));

    expect(cleanupDeadRivalEmbodiment(state)).toEqual({
      familyIds: ['rival-a'],
      unitIds: ['dead-fighter', 'dead-collector'],
      routeIds: ['dead-route'],
      contestDistrictIds: ['district-0'],
    });
    expect(state.units.map((unit) => unit.id)).toEqual(['live-fighter', 'player-fighter', 'neutral']);
    expect(state.routes.map((route) => route.id)).toEqual(['live-route', 'player-route']);
    expect(state.contests).toEqual([
      { districtId: 'district-1', invaderId: 'rival-b', pressure: 10, muscleIds: ['live-fighter'] },
    ]);
    expect(state.pendingHits).toEqual([{ attackerId: 'rival-b', targetId: 'player', orderedTick: 0 }]);
    expect(state.extortionActs.map((entry) => entry.id)).toEqual(['player-act']);
    expect(state.combatOrders).toEqual({
      'live-fighter': { stance: 'FOCUS_FIRE', targetId: 'player-fighter', lastSeen: { gx: 5, gy: 5 } },
      neutral: { stance: 'ATTACK_MOVE', dest: { gx: 7, gy: 7 } },
    });
    expect(state.downedBodies).toEqual([{ id: 'dead-memory', factionId: 'rival-a', gx: 2, gy: 2, ageSec: 1 }]);
    expect(state.districts.map((district) => district.control)).toEqual(controlBefore);
  });

  it('merges sequential settlement/strategy cleanup reports without duplicate ids', () => {
    expect(mergeRivalEmbodimentCleanup(
      { familyIds: ['rival-a'], unitIds: ['a'], routeIds: ['ra'], contestDistrictIds: [] },
      { familyIds: ['rival-a', 'rival-b'], unitIds: ['a', 'b'], routeIds: [], contestDistrictIds: ['d'] },
    )).toEqual({
      familyIds: ['rival-a', 'rival-b'], unitIds: ['a', 'b'], routeIds: ['ra'], contestDistrictIds: ['d'],
    });
  });

  it('runs after a strategic pulse and gives the scene exact view ids to retire', () => {
    const state = createInitialState(13, { bigCity: true });
    const rival = state.rivals[0];
    for (const district of state.districts) {
      delete district.control[rival.id];
      for (const business of district.businesses) {
        if (business.extortedBy === rival.id) business.extortedBy = undefined;
        if (business.ownerFamily === rival.id) business.ownerFamily = undefined;
      }
    }
    rival.gangsters = [];
    rival.cash = 0;
    rival.dirtyCash = 0;
    state.units = [spawnEnforcer('last-rival-body', 2, 2, rival.id)];
    state.routes = [{ id: 'last-rival-route', familyId: rival.id, stops: ['district-2-front-0'] }];

    const observed = updateAndObserve(state, 1, 1_000, 0.5);
    expect(rival.alive).toBe(false);
    expect(observed.state.units).toEqual([]);
    expect(observed.state.routes).toEqual([]);
    expect(observed.result.rivalCleanup).toMatchObject({
      familyIds: ['rival-a'], unitIds: ['last-rival-body'], routeIds: ['last-rival-route'],
    });
  });

  it('wires the returned ids into scene view + rival-strike cleanup', () => {
    const scene = readFileSync(join(process.cwd(), 'src/scenes/IsoScene.ts'), 'utf8');
    expect(scene).toContain('this.reconcileRivalCleanup(obs.result.rivalCleanup)');
    expect(scene).toContain('this.rivalStrikes.delete(familyId)');
    expect(scene).toContain('for (const unitId of cleanup.unitIds) this.removeUnitById(unitId)');
  });
});
