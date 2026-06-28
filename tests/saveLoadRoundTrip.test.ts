// SAVE / LOAD — round-trip + DETERMINISM. The test that proves saves are real: serialize the COMPLETE state
// (rngState included), reload into a fresh state, and assert it is byte-identical AND the NEXT tick produces
// the identical result on both — so a load continues deterministically. Also covers the additive-state
// round-trips (federal fields, embodied-extortion acts, downed-body arrays) + the version stamp / corruption.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import { update } from '../src/sim/realtime';
import { spawnUnit, spawnEnforcer, type MovableUnit } from '../src/sim/movement';
import {
  serializeGame, serializeToString, deserializeGame, cloneState, migrateSave, isResumableStatus,
  SAVE_SCHEMA_VERSION, type SaveFile,
} from '../src/sim/saveLoad';
import type { GameState } from '../src/sim/types';

const json = (s: GameState): string => JSON.stringify(s);

/** Advance a real game a bit so the save has units, combat, downed bodies, extortion acts, federal heat, etc. */
function playedGame(): GameState {
  const s = createInitialState(7, { bigCity: true, startingCrew: true });
  // some embodied state to round-trip: a player thug fighting a rival (→ damage, a down → a body).
  const thug: MovableUnit = { ...spawnUnit('p', 5, 5), factionId: s.player.id, health: 100 };
  const rival = spawnEnforcer('r', 6, 5, s.rivals[0].id);
  s.units = [thug, rival];
  for (let i = 0; i < 80; i++) update(s, 0.1, 1e9); // fights, downs, ages bodies, advances the clock + rng
  return s;
}

describe('cloneState — a faithful deep clone of the pure state tree', () => {
  it('is byte-identical and structurally independent (no shared references)', () => {
    const s = playedGame();
    const c = cloneState(s);
    expect(json(c)).toBe(json(s));
    c.player.cash += 1; // mutating the clone must not touch the original
    expect(c.player.cash).not.toBe(s.player.cash);
  });
  it('round-trips the ADDITIVE state (federal/heat, extortion acts, downed bodies, rngState)', () => {
    const s = createInitialState(3, { bigCity: true });
    s.player.heat = 73;
    s.player.dirtyCash = 4200;
    s.extortionActs = [{ id: 'x', thugId: 'p', frontId: 'f', familyId: s.player.id, interaction: { gx: 5, gy: 5 }, state: 'shakedown', progress: 0.5, durationSec: 3, engageT: 0, absenceT: 0, interruptT: 0, approachT: 0 }];
    s.downedBodies = [{ id: 'r', factionId: 'rival-a', gx: 6, gy: 5, ageSec: 1.2 }];
    s.rngState = 123456;
    const back = deserializeGame(serializeToString(s));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(json(back.state)).toBe(json(s));
      expect(back.state.extortionActs).toEqual(s.extortionActs);
      expect(back.state.downedBodies).toEqual(s.downedBodies);
      expect(back.state.rngState).toBe(123456);
    }
  });
});

describe('B1 — the save header carries status; resumability classifies terminal end-states', () => {
  it('stamps the run status into the lightweight header', () => {
    expect(serializeGame(createInitialState(1)).status).toBe('playing');
    const won = createInitialState(1); won.status = 'won';
    expect(serializeGame(won).status).toBe('won');
  });
  it('isResumableStatus — only an in-progress run resumes (legacy/undefined treated as resumable)', () => {
    expect(isResumableStatus('playing')).toBe(true);
    expect(isResumableStatus('won')).toBe(false);
    expect(isResumableStatus('lost')).toBe(false);
    expect(isResumableStatus(undefined)).toBe(true); // older saves keep loading
  });
});

describe('the version stamp — refuse what we cannot read, never silently corrupt', () => {
  it('stamps the current schema version', () => {
    expect(serializeGame(createInitialState(1)).version).toBe(SAVE_SCHEMA_VERSION);
  });
  it('refuses a future/older version (no migration path yet)', () => {
    const file: SaveFile = serializeGame(createInitialState(1));
    const bumped = JSON.stringify({ ...file, version: SAVE_SCHEMA_VERSION + 99 });
    const r = deserializeGame(bumped);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/incompatible|version/i);
    expect(migrateSave({ ...file, version: 999 })).toBeNull();
  });
  it('refuses corrupt / non-game JSON', () => {
    expect(deserializeGame('not json{').ok).toBe(false);
    expect(deserializeGame('{"version":1}').ok).toBe(false);            // no state
    expect(deserializeGame('{"version":1,"state":{}}').ok).toBe(false); // not a game state
  });
});

describe('⭐ SAVE → LOAD → continue: byte-identical AND deterministic across the boundary', () => {
  it('a loaded game is identical to the saved game, and the next ECONOMIC tick matches exactly', () => {
    const s = createInitialState(11, { bigCity: true, startingCrew: true });
    for (let i = 0; i < 5; i++) Object.assign(s, tick(s)); // run a few economic ticks (rng advances)
    const saved = serializeToString(s, { label: 'mid-game', savedAt: 0 });

    const loaded = deserializeGame(saved);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(json(loaded.state)).toBe(json(s));                 // byte-identical reload

    // ⭐ determinism preserved: the SAME next tick on the original and the loaded copy → identical result.
    const nextOriginal = tick(s);
    const nextLoaded = tick(loaded.state);
    expect(json(nextLoaded)).toBe(json(nextOriginal));
  });

  it('determinism holds across the REAL-TIME wrapper too (units + combat + rng + bodies)', () => {
    const s = playedGame();
    const loaded = deserializeGame(serializeToString(s));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(json(loaded.state)).toBe(json(s));
    // run the identical real-time step on both → identical worlds (proves the load continues the same game).
    const a = loaded.state, b = cloneState(s);
    for (let i = 0; i < 20; i++) { update(a, 0.1, 1e9); update(b, 0.1, 1e9); }
    expect(json(a)).toBe(json(b));
  });
});
