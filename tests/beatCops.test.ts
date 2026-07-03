// BEAT-COP P0 — marker patrol prototype. Canon guard: the sim stays Phaser-free, tick/applyCommand
// core math is untouched, cops are OBSERVATION-ONLY (a cop changes NO game number in P0), and every
// cop draw comes from the SEPARATE lawRngState cursor — the shared state.rngState outcome order is
// bit-identical with and without cops. Cops are never MovableUnits and never faction-coloured.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInitialState } from '../src/sim/state';
import { generateWorld, tileKindAt } from '../src/sim/worldgen';
import {
  spawnBeatCops, advanceBeatCops, desiredCopCount, copDistrictWeights, buildPatrolWorld,
  primePatrolWorld, copsRequested, debugCopsRequested, copMarkerVisible,
  COP_PATROL_SPEED, COP_CAP_CLEAR, type BeatCop, type PatrolWorld,
} from '../src/sim/beatCops';
import { WORLD_SIZE } from '../src/sim/constants';
import { update } from '../src/sim/realtime';
import { serializeGame, deserializeGame } from '../src/sim/saveLoad';
import { createFog, revealAround } from '../src/sim/fog';
import type { GameState } from '../src/sim/types';

function big(seed = 7): GameState {
  return createInitialState(seed, { startingCrew: true, bigCity: true });
}
// A small explicit patrol world keeps graph churn cheap; spawn and advance share the SAME one.
function world(s: GameState): PatrolWorld {
  return buildPatrolWorld(generateWorld(s, { size: 64 }));
}
const json = (x: unknown): string => JSON.stringify(x);
// The state minus the cop slice — for byte-comparing a copped game against a cop-less twin.
const stripCops = (s: GameState): GameState => {
  const c = JSON.parse(JSON.stringify(s)) as GameState;
  delete c.beatCops;
  delete c.lawRngState;
  return c;
};

describe('beat-cop P0 — spawn (Tickets 1+3)', () => {
  it('spawns the CLEAR-tier force deterministically — same seed ⇒ identical cops + law cursor', () => {
    const a = big(7), b = big(7);
    spawnBeatCops(a, world(a));
    spawnBeatCops(b, world(b));
    expect(a.beatCops).toEqual(b.beatCops);
    expect(a.lawRngState).toBe(b.lawRngState);
    expect(typeof a.lawRngState).toBe('number');
    expect(a.beatCops!.length).toBe(desiredCopCount(a));
    expect(a.beatCops!.length).toBeGreaterThanOrEqual(2);
    expect(a.beatCops!.length).toBeLessThanOrEqual(COP_CAP_CLEAR);
  });

  it('every cop spawns ON a sidewalk node with a real home district and the P0 stub fields', () => {
    const s = big(7);
    const w = world(s);
    const districtIds = new Set(s.districts.map((d) => d.id));
    for (const cop of spawnBeatCops(s, w)) {
      expect(tileKindAt(w.layout, cop.pos.gx, cop.pos.gy)).toBe('sidewalk');
      expect(districtIds.has(cop.homeDistrictId)).toBe(true);
      expect(cop.speed).toBe(COP_PATROL_SPEED); // 1.2 tiles/sec
      expect(cop.mode).toBe('patrol');
      expect(cop.headingDir).toBe(-1);
      expect(cop.suspicion).toBe(0);            // P1 stub — no detection in P0
      expect(cop.focusUnitId).toBeUndefined();  // P1 stub — no focus target in P0
    }
  });

  it('district selection weights are policePresence-driven (never zero) and the count is presence-capped', () => {
    const s = big(7);
    const weights = copDistrictWeights(s);
    expect(weights.length).toBe(s.districts.length);
    for (let i = 0; i < weights.length; i++) {
      expect(weights[i].districtId).toBe(s.districts[i].id);
      expect(weights[i].weight).toBe(Math.max(1, s.districts[i].policePresence));
    }
    expect(desiredCopCount(s)).toBeGreaterThanOrEqual(2);
    expect(desiredCopCount(s)).toBeLessThanOrEqual(COP_CAP_CLEAR);
  });

  it('cops are NOT units and carry no faction — never selectable, never combatants', () => {
    const s = big(7);
    const unitsBefore = json(s.units);
    const cops = spawnBeatCops(s, world(s));
    expect(json(s.units)).toBe(unitsBefore); // state.units structurally untouched
    for (const cop of cops) expect('factionId' in cop).toBe(false);
  });
});

describe('beat-cop P0 — patrol (Ticket 3)', () => {
  it('cops random-walk the sidewalk graph and STAY on it (positions + targets always sidewalk)', () => {
    const s = big(7);
    const w = world(s);
    spawnBeatCops(s, w);
    let moved = false;
    const start = json(s.beatCops!.map((c) => c.pos));
    for (let i = 0; i < 200; i++) {
      advanceBeatCops(s, 0.25, w);
      for (const cop of s.beatCops!) {
        // between two adjacent nodes the rounded tile is one of the two endpoints — both sidewalk.
        expect(tileKindAt(w.layout, Math.round(cop.pos.gx), Math.round(cop.pos.gy))).toBe('sidewalk');
        for (const wp of cop.path) expect(tileKindAt(w.layout, wp.gx, wp.gy)).toBe('sidewalk');
        expect(cop.mode === 'patrol' || cop.mode === 'loiter').toBe(true);
        expect(cop.suspicion).toBe(0); // still observation-only after 50 sim-seconds
      }
    }
    if (json(s.beatCops!.map((c) => c.pos)) !== start) moved = true;
    expect(moved).toBe(true); // markers visibly walk, not stand
  });

  it('advance is deterministic across identical dt sequences (incl. a skip-week-sized 55s step)', () => {
    const a = big(9), b = big(9);
    spawnBeatCops(a, world(a));
    spawnBeatCops(b, world(b));
    const seq = [0.3, 1.7, 0.05, 0.05, 0.05, 55, 0.25];
    for (const dt of seq) advanceBeatCops(a, dt, world(a));
    for (const dt of seq) advanceBeatCops(b, dt, world(b));
    expect(a.beatCops).toEqual(b.beatCops);
    expect(a.lawRngState).toBe(b.lawRngState);
  });

  it('survives one huge dt (120s fast-forward) without leaving the graph or hanging', () => {
    const s = big(11);
    const w = world(s);
    spawnBeatCops(s, w);
    advanceBeatCops(s, 120, w);
    for (const cop of s.beatCops!) {
      expect(tileKindAt(w.layout, Math.round(cop.pos.gx), Math.round(cop.pos.gy))).toBe('sidewalk');
    }
  });
});

describe('beat-cop P0 — RNG isolation (the load-bearing invariant)', () => {
  it('a copped game and its cop-less twin stay BYTE-identical outside the cop slice — ACROSS settlements', () => {
    const a = big(7), b = big(7);
    spawnBeatCops(a); // memoized default world — the same substrate realtime advances on
    const spawnPositions = json(a.beatCops!.map((c) => c.pos));
    const lawAfterSpawn = a.lawRngState;
    const sharedCursor0 = a.rngState;
    for (let i = 0; i < 30; i++) {
      update(a, 0.5, 2); // short weeks — settlements FIRE, so the shared cursor actually draws
      update(b, 0.5, 2);
    }
    expect(a.rngState).not.toBe(sharedCursor0);   // the invariant is exercised, not vacuous
    expect(a.rngState).toBe(b.rngState);          // shared cursor: not one extra draw, same order
    expect(json(stripCops(a))).toBe(json(b));     // every game number: bit-identical
    // and the REALTIME WIRING did the patrolling — cops moved through update(), not direct calls
    expect(json(a.beatCops!.map((c) => c.pos))).not.toBe(spawnPositions);
    expect(a.lawRngState).not.toBe(lawAfterSpawn);
  });

  it('spawn + patrol never touch the shared rngState cursor', () => {
    const s = big(7);
    const cursor = s.rngState;
    const w = world(s);
    spawnBeatCops(s, w);
    for (let i = 0; i < 50; i++) advanceBeatCops(s, 0.2, w);
    expect(s.rngState).toBe(cursor); // cursor untouched
  });

  it('cop-less states pass through update() with the slice ABSENT (old saves stay byte-stable)', () => {
    const s = big(3);
    for (let i = 0; i < 5; i++) update(s, 0.5, 1e9);
    expect(s.beatCops).toBeUndefined();
    expect(s.lawRngState).toBeUndefined(); // advance must not even seed the cursor when there are no cops
  });
});

describe('beat-cop P0 — save safety (Ticket 1)', () => {
  it('an old save WITHOUT beatCops loads clean and keeps playing without growing the slice', () => {
    const saved = serializeGame(big(5));
    const back = deserializeGame(saved);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.state.beatCops).toBeUndefined();
    update(back.state, 0.5, 1e9);
    expect(back.state.beatCops).toBeUndefined();
  });

  it('a populated cop patrol round-trips byte-exact and resumes deterministically', () => {
    const s = big(13);
    spawnBeatCops(s);
    for (let i = 0; i < 10; i++) update(s, 0.2, 1e9); // save MID-patrol (fractional positions)
    const back1 = deserializeGame(serializeGame(s));
    const back2 = deserializeGame(serializeGame(s));
    expect(back1.ok && back2.ok).toBe(true);
    if (!back1.ok || !back2.ok) return;
    expect(json(back1.state)).toBe(json(s)); // byte-exact round trip
    for (let i = 0; i < 10; i++) {
      update(back1.state, 0.2, 1e9);
      update(back2.state, 0.2, 1e9);
    }
    expect(back1.state.beatCops).toEqual(back2.state.beatCops); // the law cursor resumes exactly
    expect(back1.state.lawRngState).toBe(back2.state.lawRngState);
  });

  it('business churn between save and load re-rolls the parcels — loaded cops HEAL onto the new graph', () => {
    const s = big(21);
    spawnBeatCops(s);
    for (let i = 0; i < 20; i++) update(s, 0.2, 1e9);
    // open-operation analogue: one more business shifts every later parcel draw, re-shaping sidewalks
    const proto = s.districts[0].businesses[0];
    s.districts[0].businesses.push({ ...proto, id: 'biz-churn-test' });
    const back = deserializeGame(serializeGame(s));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    for (let i = 0; i < 10; i++) update(back.state, 0.25, 1e9); // advance rebuilds from the MUTATED state
    const w = buildPatrolWorld(generateWorld(back.state, { size: WORLD_SIZE })); // the post-churn substrate
    for (const cop of back.state.beatCops!) {
      // never stranded frozen inside a re-rolled building — always back on (or still on) the graph
      expect(tileKindAt(w.layout, Math.round(cop.pos.gx), Math.round(cop.pos.gy))).toBe('sidewalk');
      for (const wp of cop.path) expect(tileKindAt(w.layout, wp.gx, wp.gy)).toBe('sidewalk');
    }
    // and the churned resume is itself deterministic (two loads of the same save agree)
    const twin = deserializeGame(serializeGame(s));
    if (!twin.ok) return;
    for (let i = 0; i < 10; i++) update(twin.state, 0.25, 1e9);
    expect(twin.state.beatCops).toEqual(back.state.beatCops);
  });

  it('primePatrolWorld pins the scene layout for the epoch and re-snaps stale saved coords onto it', () => {
    const s = big(23);
    const w = world(s);
    spawnBeatCops(s, w);
    // a saved coord from a layout that no longer exists: shove cop 0 onto a non-sidewalk tile
    const badTi = w.layout.tiles.findIndex((k) => k === 'building');
    const stale = { gx: badTi % w.layout.size, gy: Math.floor(badTi / w.layout.size) };
    s.beatCops![0].pos = { ...stale };
    s.beatCops![0].path = [{ ...stale }];
    primePatrolWorld(s, w.layout);
    const healed = s.beatCops![0];
    expect(tileKindAt(w.layout, healed.pos.gx, healed.pos.gy)).toBe('sidewalk'); // re-snapped
    expect(healed.path).toEqual([]);       // dropped the stale waypoint — next arrival re-picks
    expect(healed.headingDir).toBe(-1);
    expect(healed.mode).toBe('patrol');
    // the primed substrate then drives advance (no explicit world passed) without re-stranding
    for (let i = 0; i < 40; i++) advanceBeatCops(s, 0.25);
    for (const cop of s.beatCops!) {
      expect(tileKindAt(w.layout, Math.round(cop.pos.gx), Math.round(cop.pos.gy))).toBe('sidewalk');
    }
  });
});

describe('beat-cop P0 — layer flag + fog gate (Ticket 6)', () => {
  it('?cops=1 is a strict opt-in — default OFF, off-values OFF (reversible layer)', () => {
    expect(copsRequested('')).toBe(false);
    expect(copsRequested('?cops=1')).toBe(true);
    expect(copsRequested('?life=high&cops=1')).toBe(true);
    expect(copsRequested('?cops=0')).toBe(false);
    expect(copsRequested('?cops')).toBe(false);
    expect(copsRequested('?other=1')).toBe(false);
  });

  it('?debugCops=1 is a separate strict opt-in for the patrol-path overlay', () => {
    expect(debugCopsRequested('')).toBe(false);
    expect(debugCopsRequested('?debugCops=1')).toBe(true);
    expect(debugCopsRequested('?cops=1')).toBe(false);
    expect(debugCopsRequested('?debugCops=0')).toBe(false);
  });

  it('fog gate (NO-X-RAY): a hidden cop draws NOTHING; revealing its tile shows it; ?reveal=1 overrides', () => {
    const cop = { pos: { gx: 10.4, gy: 9.6 } } as BeatCop; // fractional — must round to (10,10)
    const fog = createFog();
    expect(copMarkerVisible(fog, cop, false)).toBe(false); // hidden ⇒ not drawn
    revealAround(fog, 10, 10, 2, 64, 64);
    expect(copMarkerVisible(fog, cop, false)).toBe(true);  // revealed ⇒ drawn
    expect(copMarkerVisible(createFog(), cop, true)).toBe(true); // debug reveal-all board
  });

  it('the scene wires the gate: syncBeatCops gates through copMarkerVisible and registers via worldFx', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'scenes', 'IsoScene.ts'), 'utf8');
    const method = src.slice(src.indexOf('private syncBeatCops()'));
    const body = method.slice(0, method.indexOf('\n  }'));
    expect(body).toContain('copMarkerVisible(');   // the pure fog predicate, not an ad-hoc check
    expect(body).toContain('this.worldFx(');       // fixed HUD camera partition (no double-render)
    expect(body).not.toContain('setInteractive');  // cops are never selectable
    // NO-X-RAY on the QA overlay too: the patrol edge draws only once the WAYPOINT tile is revealed
    expect(body).toMatch(/debugRevealAll \|\| isRevealed\(this\.fog, wp\.gx, wp\.gy\)/);
  });

  it('the scene create() gate: stale views cleared, substrate primed, spawn strictly behind ?cops=1', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'scenes', 'IsoScene.ts'), 'utf8');
    expect(src).toContain('this.copViews.clear()');                    // scene.restart() corpse purge
    expect(src).toContain('primePatrolWorld(this.state, this.world)'); // patrol graph = RENDERED layout
    // spawn is guarded by BOTH the opt-in flag and slice absence — un-flagged games never grow cops
    expect(src).toMatch(/if \(this\.copsEnabled && !this\.state\.beatCops\?\.length\) spawnBeatCops\(this\.state\)/);
  });
});
