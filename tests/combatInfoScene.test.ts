import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initLog, latestUnreadPositional } from '../src/scenes/info/logStore';
import { createInitialState, spawnCollector, spawnUnit, type CombatEvent } from '../src/sim';

// Import the real scene without booting Phaser. Object.create avoids scene field initializers; the harness
// supplies only the dependencies playCombatBeat/recordInfoEvent touch for an off-screen combat event.
vi.mock('phaser', () => ({ default: { Scene: class Scene {} } }));

let IsoSceneClass: new (...args: never[]) => object;

beforeAll(async () => {
  ({ IsoScene: IsoSceneClass } = await import('../src/scenes/IsoScene'));
});

function harness(opts?: { revealed?: boolean; debugRevealAll?: boolean; onScreen?: boolean }) {
  const scene = Object.create(IsoSceneClass.prototype) as Record<string, any>;
  const audioPlay = vi.fn();
  Object.assign(scene, {
    state: { player: { id: 'player', gangsters: [] }, units: [] },
    fog: new Set(opts?.revealed ? ['5,6'] : []),
    debugRevealAll: opts?.debugRevealAll ?? false,
    time: { now: 1000 },
    wireLog: initLog(),
    alerts: [],
    pings: [],
    units: [],
    onScreen: () => opts?.onScreen ?? false,
    audio: { play: audioPlay },
    cameraBeat: vi.fn(),
    triggerHitReact: vi.fn(),
    weaponMuzzleFlash: vi.fn(),
    hitPip: vi.fn(),
    playKill: vi.fn(),
    removeUnitById: vi.fn(),
    setStatus: vi.fn(),
  });
  return scene;
}

function event(kind: 'hit' | 'down'): CombatEvent {
  return { kind, attackerId: 'rival-a-1', unitId: 'rival-b-1', faction: 'rival-b', gx: 5, gy: 6 };
}

describe('IsoScene combat information — behavioral NO-X-RAY guard', () => {
  it('destroys the separate 3D atlas sprite when a unit leaves play', () => {
    const scene = Object.create(IsoSceneClass.prototype) as Record<string, any>;
    const spriteSheet = { destroy: vi.fn() };
    const unit = spawnUnit('dead-rival', 5, 6);
    unit.factionId = 'rival-a';
    Object.assign(scene, {
      units: [{ unit, faction: 'rival', spriteSheet }],
      state: { units: [unit] },
      unitOrders: new Map(), extortShoveAt: new Map(), controlGroups: {},
      selection: { ids: [] }, collectorInfoId: undefined,
    });

    scene.removeUnitById(unit.id);

    expect(spriteSheet.destroy).toHaveBeenCalledOnce();
    expect(scene.units).toEqual([]);
    expect(scene.state.units).toEqual([]);
  });

  it('removes a stale collector view by object identity without touching its replacement', () => {
    const scene = Object.create(IsoSceneClass.prototype) as Record<string, any>;
    const stale = spawnCollector('same-id', 1, 1, 'player', 0);
    const replacement = spawnCollector('same-id', 1, 1, 'player', 0);
    const staleSprite = { destroy: vi.fn() };
    const replacementSprite = { destroy: vi.fn() };
    const staleView = { unit: stale, faction: 'player', spriteSheet: staleSprite };
    const liveView = { unit: replacement, faction: 'player', spriteSheet: replacementSprite };
    Object.assign(scene, {
      state: { units: [replacement] }, units: [staleView, liveView], collectorInfoId: undefined,
    });

    scene.reconcileCollectorViews();

    expect(staleSprite.destroy).toHaveBeenCalledOnce();
    expect(replacementSprite.destroy).not.toHaveBeenCalled();
    expect(scene.units).toEqual([liveView]);
    expect(scene.state.units).toEqual([replacement]);
  });

  it.each(['hit', 'down'] as const)('keeps a hidden rival %s byte-identical to empty fog', (kind) => {
    const scene = harness();
    const before = JSON.stringify({ log: scene.wireLog, alerts: scene.alerts, pings: scene.pings });
    scene.playCombatBeat(event(kind));

    expect(JSON.stringify({ log: scene.wireLog, alerts: scene.alerts, pings: scene.pings })).toBe(before);
    expect(latestUnreadPositional(scene.wireLog)).toBeUndefined();
    expect(scene.cameraBeat).not.toHaveBeenCalled();
    expect(scene.playKill).not.toHaveBeenCalled();
    expect(scene.setStatus).not.toHaveBeenCalled();
  });

  it('records a revealed off-screen hit in The Wire without an alert or ping', () => {
    const scene = harness({ revealed: true });
    scene.playCombatBeat(event('hit'));

    expect(scene.wireLog.entries[0]).toMatchObject({ kind: 'combat.hit', gx: 5, gy: 6 });
    expect(scene.alerts).toEqual([]);
    expect(scene.pings).toEqual([]);
    expect(scene.cameraBeat).not.toHaveBeenCalled();
  });

  it('records a revealed off-screen down and raises its alert and ping', () => {
    const scene = harness({ revealed: true });
    scene.playCombatBeat(event('down'));

    expect(scene.wireLog.entries[0]).toMatchObject({ kind: 'unit.down', gx: 5, gy: 6 });
    expect(scene.alerts[0]).toMatchObject({ gx: 5, gy: 6, tier: 'warning' });
    expect(scene.pings[0]).toMatchObject({ gx: 5, gy: 6, tier: 'warning' });
    expect(latestUnreadPositional(scene.wireLog)).toMatchObject({ gx: 5, gy: 6 });
    expect(scene.cameraBeat).not.toHaveBeenCalled();
    expect(scene.playKill).not.toHaveBeenCalled();
  });

  it('starts a visible death reaction at t0 but defers body contact to the body-age lifecycle', () => {
    const scene = harness({ revealed: true, onScreen: true });
    scene.playCombatBeat(event('down'));

    expect(scene.pendingBodyContacts.has('rival-b-1')).toBe(true);
    expect(scene.audio.play).toHaveBeenCalledWith(expect.stringMatching(/^sfx_death_reaction_[12]$/), expect.any(Object));
    expect(scene.audio.play).not.toHaveBeenCalledWith('sfx_down_body');
  });

  it('throttles simultaneous nonverbal death reactions so a multi-down cannot become a chorus', () => {
    const scene = harness({ revealed: true, onScreen: true });
    scene.playCombatBeat(event('down'));
    scene.playCombatBeat({ ...event('down'), unitId: 'rival-b-2' });

    const reactions = scene.audio.play.mock.calls.filter(([key]: [string]) => key.startsWith('sfx_death_reaction_'));
    expect(reactions).toHaveLength(1);
  });

  it('honors debugRevealAll through the canonical scene predicate', () => {
    const scene = harness({ debugRevealAll: true });
    scene.playCombatBeat(event('down'));
    expect(scene.wireLog.entries[0]).toMatchObject({ kind: 'unit.down', gx: 5, gy: 6 });
  });

  it('removes a named player casualty from the strategic roster on a field down', () => {
    const scene = harness({ revealed: true });
    const sal = spawnUnit('muscle-1', 5, 6);
    sal.factionId = 'player';
    sal.gangsterId = 'player-g-0';
    scene.state.player.gangsters = [{
      id: 'player-g-0', name: 'Sal', skill: 3, loyalty: 70, upkeep: 100,
      assignment: { type: 'idle' },
    }];
    scene.state.units = [sal];
    scene.units = [{ unit: sal, faction: 'player' }];

    scene.playCombatBeat({ ...event('down'), unitId: sal.id, faction: 'player' });
    expect(scene.state.player.gangsters).toEqual([]);
    expect(scene.setStatus).toHaveBeenCalledWith('Sal went DOWN — pull back or reinforce');
  });

  it('does not instantiate a persistent body view for a hidden downed rival', () => {
    const scene = Object.create(IsoSceneClass.prototype) as Record<string, any>;
    const addImage = vi.fn();
    Object.assign(scene, {
      state: {
        player: { id: 'player', gangsters: [] },
        downedBodies: [{ id: 'hidden-body', factionId: 'rival-a', gx: 55, gy: 56, ageSec: 0 }],
      },
      fog: new Set(),
      debugRevealAll: false,
      downedBodyViews: new Map(),
      add: { image: addImage },
    });

    scene.syncDownedBodies();
    expect(addImage).not.toHaveBeenCalled();
    expect(scene.downedBodyViews.size).toBe(0);
  });

  it('plays body contact once at ~0.5s and consumes it under the same visibility gate', () => {
    const scene = Object.create(IsoSceneClass.prototype) as Record<string, any>;
    const figure: Record<string, any> = {};
    for (const method of ['setVisible', 'setAlpha', 'setDepth', 'setPosition', 'setAngle', 'setScale']) {
      figure[method] = vi.fn(() => figure);
    }
    const body = { id: 'body', factionId: 'rival-a', gx: 5, gy: 6, ageSec: 0.49 };
    Object.assign(scene, {
      state: { player: { id: 'player' }, downedBodies: [body] },
      fog: new Set(['5,6']), debugRevealAll: false,
      downedBodyViews: new Map([['body', { figure, hurtAtlas: false, angleDeg: 64 }]]),
      pendingBodyContacts: new Set(['body']),
      onScreen: () => true,
      audio: { play: vi.fn() },
    });

    scene.syncDownedBodies();
    expect(scene.audio.play).not.toHaveBeenCalled();
    body.ageSec = 0.5;
    scene.syncDownedBodies();
    expect(scene.audio.play).toHaveBeenCalledOnce();
    expect(scene.audio.play).toHaveBeenCalledWith('sfx_down_body');
    scene.syncDownedBodies();
    expect(scene.audio.play).toHaveBeenCalledOnce();
  });

  it('consumes a hidden contact silently so revealing the tile later cannot replay it', () => {
    const scene = Object.create(IsoSceneClass.prototype) as Record<string, any>;
    Object.assign(scene, {
      state: {
        player: { id: 'player' },
        downedBodies: [{ id: 'hidden', factionId: 'rival-a', gx: 55, gy: 56, ageSec: 0.5 }],
      },
      fog: new Set(), debugRevealAll: false,
      downedBodyViews: new Map(), pendingBodyContacts: new Set(['hidden']),
      add: { image: vi.fn() }, audio: { play: vi.fn() },
    });

    scene.syncDownedBodies();
    expect(scene.pendingBodyContacts.has('hidden')).toBe(false);
    expect(scene.audio.play).not.toHaveBeenCalled();
    expect(scene.downedBodyViews.size).toBe(0);
  });

  it('counts only revealed combat in the atmosphere side-chain', () => {
    const scene = Object.create(IsoSceneClass.prototype) as Record<string, any>;
    Object.assign(scene, {
      state: { player: { id: 'player' }, log: [] },
      fog: new Set(['5,6']),
      debugRevealAll: false,
      time: { now: 1000 },
      cameras: { main: { worldView: { x: 0, y: 0, width: 800, height: 600 }, zoom: 0.6 } },
      atmoLogCursor: 0,
      atmosphereDistrictAt: () => null,
      isAudioFeedbackEligible: () => true,
      layout: {},
      atmoEmitterSources: [],
    });
    const visible = event('hit');
    const hidden = { ...event('hit'), gx: 50, gy: 60 };
    const frame = scene.buildAtmosphereFrame({
      result: { combat: [visible, hidden], extortion: [], interceptions: [] },
    }, []);

    expect(frame.observation.combatEventCount).toBe(1);
  });
});

describe('IsoScene save restoration — serialized bodies are authoritative', () => {
  it('does not resurrect Sal/Vito when a valid restored save has no live map units', () => {
    const scene = Object.create(IsoSceneClass.prototype) as Record<string, any>;
    const state = createInitialState(1, { startingCrew: true });
    Object.assign(scene, { restoredFromSave: true, state, units: [], attachView: vi.fn() });

    scene.spawnUnits();
    expect(state.units).toEqual([]);
    expect(scene.attachView).not.toHaveBeenCalled();
  });

  it('attaches saved units without appending fresh starting bodies', () => {
    const scene = Object.create(IsoSceneClass.prototype) as Record<string, any>;
    const state = createInitialState(1, { startingCrew: true });
    const saved = spawnUnit('muscle-2', 2, 1);
    saved.factionId = state.player.id;
    state.units.push(saved);
    Object.assign(scene, { restoredFromSave: true, state, units: [], attachView: vi.fn() });

    scene.spawnUnits();
    expect(state.units).toEqual([saved]);
    expect(saved.gangsterId).toBe('player-g-1');
    expect(scene.attachView).toHaveBeenCalledOnce();
    expect(scene.attachView).toHaveBeenCalledWith(saved, 'player');
  });
});
