// BEAT-COP P1 — DETECT → RESPOND. The laws under test:
//   1. NO-X-RAY (symmetric sight) — a cop witnesses a crime ONLY inside its sight disc AND with a clear line
//      of sight; a 'building' strictly between blocks it, and a lost mark is chased to its LAST SEEN tile,
//      never a live position the cop cannot see. (mutation-verified: drop the LOS gate and the blocked cases
//      flip to detected; freeze the sight radius and the boundary tests fail.)
//   2. ESCALATION (two-threshold hysteresis) — patrol → suspicion climbs while witnessing → RESPOND at the
//      threshold → ENGAGE in contact → STAND DOWN when the trail goes cold. Suspicion clamps to [0, MAX].
//   3. NUMBERS-FROZEN — a cop detecting/responding/engaging mutates ONLY its own slice and draws NO shared
//      RNG, so a copped game stays byte-identical to its cop-less twin outside the cop slice, ACROSS
//      settlements, even while a cop actively pursues a crime (the beatCops law, extended through P1).
//   4. DETERMINISM — geometry + fixed accrual rates only; identical inputs ⇒ identical cop state.

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { generateWorld, tileKindAt, type TileKind, type WorldLayout } from '../src/sim/worldgen';
import { spawnEnforcer, spawnCollector, spawnUnit, type MovableUnit } from '../src/sim/movement';
import { update } from '../src/sim/realtime';
import { serializeGame, deserializeGame } from '../src/sim/saveLoad';
import { advanceBeatCops, buildPatrolWorld, spawnBeatCops, COP_PATROL_SPEED, type BeatCop } from '../src/sim/beatCops';
import {
  copSees, lineOfSightClear, isCrimeInProgress, nearestVisibleCrime,
  updateCopDetection, advanceCopResponse, deescalateCop,
  COP_SIGHT_RADIUS, COP_SUSPICION_MAX, COP_RESPOND_THRESHOLD, COP_ENGAGE_RANGE, COP_RESPOND_SPEED,
} from '../src/sim/copBehavior';
import type { GameState } from '../src/sim/types';

const json = (x: unknown): string => JSON.stringify(x);

/** A minimal all-'ground' NxN layout with buildings painted at the given tiles — everything copBehavior
 * reads is layout.size + layout.tiles (via tileKindAt), so this is a faithful stand-in for a real layout. */
function grid(size: number, buildings: ReadonlyArray<[number, number]> = []): WorldLayout {
  const tiles: TileKind[] = Array.from({ length: size * size }, () => 'ground' as TileKind);
  for (const [gx, gy] of buildings) tiles[gy * size + gx] = 'building';
  return {
    size, cols: size, rows: size, tiles,
    districtOfTile: Array.from({ length: size * size }, () => 'district-0'),
    districts: [], hqTiles: {}, businessTiles: {},
  } as WorldLayout;
}

function fighter(id: string, factionId: string, gx: number, gy: number): MovableUnit {
  return spawnEnforcer(id, gx, gy, factionId, 2.5);
}

function withUnits(...units: MovableUnit[]): GameState {
  const s = createInitialState(1, { bigCity: true });
  s.units = units;
  return s;
}

function mkCop(gx: number, gy: number, over: Partial<BeatCop> = {}): BeatCop {
  const base: BeatCop = {
    id: 'cop-0', pos: { gx, gy }, path: [], speed: COP_PATROL_SPEED, homeDistrictId: 'district-0',
    mode: 'patrol', headingDir: -1, suspicion: 0, loiterSec: 0,
  };
  return { ...base, ...over };
}

const stripCops = (s: GameState): GameState => {
  const c = JSON.parse(JSON.stringify(s)) as GameState;
  delete c.beatCops;
  delete c.lawRngState;
  return c;
};

describe('copBehavior — sight rule (NO-X-RAY, symmetric)', () => {
  it('copSees respects the radius boundary: at the radius is seen, beyond is not', () => {
    const L = grid(24);
    const cop = mkCop(10, 10);
    expect(copSees(cop, { gx: 10, gy: 16 }, L)).toBe(true);   // dist exactly 6 = COP_SIGHT_RADIUS
    expect(copSees(cop, { gx: 10, gy: 17 }, L)).toBe(false);  // dist 7 > radius
    expect(copSees(cop, { gx: 16, gy: 10 }, L)).toBe(true);   // and along the other axis
    expect(COP_SIGHT_RADIUS).toBe(6);
  });

  it('a building STRICTLY BETWEEN blocks the line of sight; removing it restores it', () => {
    const cop = mkCop(5, 10);
    const crime = { gx: 11, gy: 10 };
    expect(copSees(cop, crime, grid(24, [[8, 10]]))).toBe(false); // wall on the line — no LOS
    expect(copSees(cop, crime, grid(24))).toBe(true);            // clear — seen
  });

  it('a building OFF the line does not block; a building ON an endpoint tile does not block', () => {
    const cop = mkCop(5, 10);
    expect(lineOfSightClear(grid(24, [[8, 12]]), cop.pos, { gx: 11, gy: 10 })).toBe(true); // off the segment
    expect(lineOfSightClear(grid(24, [[11, 10]]), cop.pos, { gx: 11, gy: 10 })).toBe(true); // target's own tile
    expect(lineOfSightClear(grid(24, [[5, 10]]), cop.pos, { gx: 11, gy: 10 })).toBe(true);  // cop's own tile
  });

  it('the ray march spans a diagonal — a wall on the sightline blocks; one far off the line does not', () => {
    const from = { gx: 5, gy: 5 };
    const to = { gx: 9, gy: 9 };
    expect(lineOfSightClear(grid(24, [[7, 7]]), from, to)).toBe(false); // dead on the diagonal
    expect(lineOfSightClear(grid(24, [[5, 9]]), from, to)).toBe(true);  // far off the sightline — clear
  });
});

describe('copBehavior — what counts as a crime (acquisition)', () => {
  it('a hunted-family fighter caught mid-brawl IS a crime; a lone one (no enemy) is NOT', () => {
    const brawl = withUnits(fighter('p1', 'player', 5, 5), fighter('r1', 'rival-a', 5.5, 5));
    const lone = withUnits(fighter('p1', 'player', 5, 5));
    expect(isCrimeInProgress(brawl.units[0], brawl, 'player')).toBe(true);
    expect(isCrimeInProgress(lone.units[0], lone, 'player')).toBe(false); // just standing there — not a crime
  });

  it('only the HUNTED family is a crime — a brawling rival is not the law\'s business here', () => {
    const s = withUnits(fighter('p1', 'player', 5, 5), fighter('r1', 'rival-a', 5.5, 5));
    expect(isCrimeInProgress(s.units[1], s, 'player')).toBe(false); // r1 is rival-a, not the hunted 'player'
    // a collector (non-combatant) is never a crime, even mid-scene
    const s2 = withUnits(spawnCollector('c1', 5, 5, 'player', 200), fighter('r1', 'rival-a', 5.4, 5));
    expect(isCrimeInProgress(s2.units[0], s2, 'player')).toBe(false);
  });

  it('nearestVisibleCrime picks the nearest brawl in sight; a brawl behind a wall is invisible (NO-X-RAY)', () => {
    const cop = mkCop(5, 5);
    // two brawls in DIFFERENT directions: near to the east (dist 2), far to the south (dist 5) — so a single
    // wall can hide one without hiding the other.
    const s = withUnits(
      fighter('pNear', 'player', 7, 5), fighter('rNear', 'rival-a', 7.4, 5),
      fighter('pFar', 'player', 5, 10), fighter('rFar', 'rival-a', 5, 10.4),
    );
    expect(nearestVisibleCrime(cop, s, grid(24), 'player')!.id).toBe('pNear'); // nearest wins
    // wall off the EAST brawl — the south one is now the only thing the cop can see
    expect(nearestVisibleCrime(cop, s, grid(24, [[6, 5]]), 'player')!.id).toBe('pFar');
    // wall off BOTH sightlines — nothing witnessed
    expect(nearestVisibleCrime(cop, s, grid(24, [[6, 5], [5, 7]]), 'player')).toBeUndefined();
  });
});

describe('copBehavior — escalation state machine', () => {
  it('patrol → RESPOND: suspicion climbs while witnessing, commits at the threshold with a focus + lastSeen', () => {
    const L = grid(24);
    const s = withUnits(fighter('p1', 'player', 8, 5), fighter('r1', 'rival-a', 8.4, 5));
    const cop = mkCop(5, 5);
    // one 0.5s slice: acquires + gains suspicion but has not yet crossed the commit threshold
    expect(updateCopDetection(cop, s, L, 0.5)).toBe(false);
    expect(cop.focusUnitId).toBe('p1');
    expect(cop.lastSeen).toEqual({ gx: 8, gy: 5 });
    expect(cop.suspicion).toBeGreaterThan(0);
    expect(cop.suspicion).toBeLessThan(COP_RESPOND_THRESHOLD);
    expect(cop.mode).toBe('patrol');
    // keep witnessing — it crosses the threshold and COMMITS to respond
    let active = false;
    for (let i = 0; i < 5; i++) active = updateCopDetection(cop, s, L, 0.5);
    expect(active).toBe(true);
    expect(cop.mode).toBe('respond');
    expect(cop.suspicion).toBeGreaterThanOrEqual(COP_RESPOND_THRESHOLD);
  });

  it('RESPOND → ENGAGE: a converging cop drops into contact once within engage range of a visible focus', () => {
    const L = grid(24);
    const s = withUnits(fighter('p1', 'player', 8, 5), fighter('r1', 'rival-a', 8.4, 5));
    const cop = mkCop(5, 5, { mode: 'respond', focusUnitId: 'p1', lastSeen: { gx: 8, gy: 5 }, suspicion: 80 });
    // walk the cop in over a few seconds; it converges on lastSeen and flips to 'engage' in reach
    for (let i = 0; i < 20; i++) {
      updateCopDetection(cop, s, L, 0.25);
      if (cop.mode === 'respond' || cop.mode === 'engage') advanceCopResponse(cop, L, 0.25);
    }
    expect(cop.mode).toBe('engage');
    expect(Math.hypot(cop.pos.gx - 8, cop.pos.gy - 5)).toBeLessThanOrEqual(COP_ENGAGE_RANGE + 1e-9);
  });

  it('STAND DOWN: losing sight drains suspicion; at 0 the cop de-escalates and clears its pursuit state', () => {
    const L = grid(24);
    const s = withUnits(fighter('p1', 'player', 8, 5), fighter('r1', 'rival-a', 8.4, 5));
    const cop = mkCop(5, 5, { mode: 'respond', focusUnitId: 'p1', lastSeen: { gx: 8, gy: 5 }, suspicion: 50 });
    // the brawl ends and the suspect leaves the scene entirely (gone from state.units) — nothing to witness
    s.units = [];
    let active = true;
    for (let i = 0; i < 10 && active; i++) active = updateCopDetection(cop, s, L, 0.5);
    expect(active).toBe(false);
    expect(cop.mode).toBe('patrol');
    expect(cop.suspicion).toBe(0);
    expect(cop.focusUnitId).toBeUndefined();
    expect(cop.lastSeen).toBeUndefined();
  });

  it('hysteresis: once committed the cop keeps responding while suspicion is in (0, threshold)', () => {
    const L = grid(24);
    const s = withUnits(); // nothing to witness ⇒ suspicion only decays
    const cop = mkCop(5, 5, { mode: 'respond', focusUnitId: 'p1', lastSeen: { gx: 8, gy: 5 }, suspicion: 40 });
    // 40 is below the COMMIT threshold (50) but > 0 — a patrol cop would not commit here, but a committed
    // one holds the pursuit. One short slice keeps it responding.
    expect(updateCopDetection(cop, s, L, 0.2)).toBe(true);
    expect(cop.mode).toBe('respond');
    expect(cop.suspicion).toBeLessThan(COP_RESPOND_THRESHOLD);
    expect(cop.suspicion).toBeGreaterThan(0);
  });

  it('suspicion clamps to [0, MAX] and lastSeen FREEZES at the last seen tile when the mark hides', () => {
    const s = withUnits(fighter('p1', 'player', 8, 5), fighter('r1', 'rival-a', 8.4, 5));
    const cop = mkCop(5, 5);
    // saturate: witnessing for a long time never exceeds MAX
    for (let i = 0; i < 40; i++) updateCopDetection(cop, s, grid(24), 0.5);
    expect(cop.suspicion).toBe(COP_SUSPICION_MAX);
    expect(cop.lastSeen).toEqual({ gx: 8, gy: 5 });
    // the suspect slips behind a wall AND drifts — lastSeen must not follow it (NO-X-RAY)
    s.units[0].pos = { gx: 12, gy: 5 };
    updateCopDetection(cop, s, grid(24, [[9, 5]]), 0.5); // wall between cop and the new spot
    expect(cop.lastSeen).toEqual({ gx: 8, gy: 5 }); // frozen — the cop never saw it move
    expect(cop.suspicion).toBeLessThan(COP_SUSPICION_MAX); // and it started forgetting
  });

  it('deterministic + dt≤0 is inert', () => {
    const mk = (): [GameState, BeatCop] => [
      withUnits(fighter('p1', 'player', 8, 5), fighter('r1', 'rival-a', 8.4, 5)),
      mkCop(5, 5),
    ];
    const [sa, ca] = mk(); const [sb, cb] = mk();
    for (let i = 0; i < 12; i++) { updateCopDetection(ca, sa, grid(24), 0.3); updateCopDetection(cb, sb, grid(24), 0.3); }
    expect(json(ca)).toBe(json(cb));
    const before = json(ca);
    updateCopDetection(ca, sa, grid(24), 0); // dt 0 — inert (returns early before any mutation)
    expect(json(ca)).toBe(before);
  });

  it('advanceCopResponse converges toward lastSeen at the respond speed, clamped in-bounds, never overshoots', () => {
    const L = grid(24);
    const cop = mkCop(5, 5, { mode: 'respond', lastSeen: { gx: 5, gy: 10 } });
    advanceCopResponse(cop, L, 1); // 1s at COP_RESPOND_SPEED
    expect(cop.pos.gy).toBeCloseTo(5 + COP_RESPOND_SPEED, 6);
    expect(cop.pos.gx).toBe(5);
    // a huge step lands exactly on the mark, not past it
    advanceCopResponse(cop, L, 1000);
    expect(cop.pos).toEqual({ gx: 5, gy: 10 });
  });
});

describe('copBehavior — NUMBERS-FROZEN through the wired advanceBeatCops', () => {
  it('a cop actively detecting a brawl mutates ONLY its slice — state.units + shared rngState untouched', () => {
    const s = withUnits(fighter('p1', 'player', 20, 20), fighter('r1', 'rival-a', 20.5, 20));
    const w = buildPatrolWorld(generateWorld(s, { size: 64 }));
    // cop pre-committed next to the brawl (adjacent ⇒ trivial LOS) so it responds/engages, not heals away
    s.beatCops = [mkCop(20, 21, { mode: 'respond', focusUnitId: 'p1', lastSeen: { gx: 20, gy: 20 }, suspicion: 70 })];
    const unitsBefore = json(s.units);
    const sharedBefore = s.rngState;
    for (let i = 0; i < 12; i++) advanceBeatCops(s, 0.25, w);
    expect(s.beatCops![0].suspicion).toBeGreaterThan(0); // it really did keep watching (engaged)
    expect(['respond', 'engage']).toContain(s.beatCops![0].mode);
    expect(json(s.units)).toBe(unitsBefore); // detection/response never touches a unit
    expect(s.rngState).toBe(sharedBefore);   // never the shared cursor (law layer only)
  });

  it('a copped game with a pursuing cop stays BYTE-identical to its cop-less twin — across settlements', () => {
    const mk = (): GameState => {
      const g = createInitialState(7, { bigCity: true, startingCrew: true });
      g.units = [fighter('p1', 'player', 30, 30), fighter('r1', 'rival-a', 30.5, 30)];
      return g;
    };
    const copped = mk();
    const twin = mk();
    copped.beatCops = [mkCop(30, 31, { mode: 'respond', focusUnitId: 'p1', lastSeen: { gx: 30, gy: 30 }, suspicion: 90 })];
    const sharedBefore = copped.rngState;
    for (let i = 0; i < 20; i++) { update(copped, 0.5, 2); update(twin, 0.5, 2); } // short weeks ⇒ the shared cursor draws
    expect(copped.rngState).not.toBe(sharedBefore); // the invariant is exercised, not vacuous
    expect(copped.rngState).toBe(twin.rngState);    // shared cursor: same order, not one extra draw
    expect(json(stripCops(copped))).toBe(json(twin)); // every game number: bit-identical
  });

  it('no crime present ⇒ cops never leave the beat (suspicion pinned 0, still on the sidewalk graph)', () => {
    const s = createInitialState(9, { bigCity: true }); // units: [] — nothing to detect
    const w = buildPatrolWorld(generateWorld(s, { size: 64 }));
    spawnBeatCops(s, w);
    for (let i = 0; i < 60; i++) advanceBeatCops(s, 0.25, w);
    for (const cop of s.beatCops!) {
      expect(cop.suspicion).toBe(0);
      expect(cop.mode === 'patrol' || cop.mode === 'loiter').toBe(true);
      expect(cop.focusUnitId).toBeUndefined();
    }
  });

  it('a stood-down cop heals back onto the sidewalk graph (its converge carried it off-beat)', () => {
    const s = createInitialState(15, { bigCity: true });
    const w = buildPatrolWorld(generateWorld(s, { size: 64 }));
    spawnBeatCops(s, w);
    // shove cop 0 off the graph mid-response with a tiny suspicion + no crime to witness — next advance
    // decays it to 0, de-escalates, and the patrol branch heals it back onto a sidewalk node.
    const cop = s.beatCops![0];
    cop.mode = 'respond';
    cop.pos = { gx: cop.pos.gx + 0.5, gy: cop.pos.gy + 0.5 };
    cop.suspicion = 1;
    cop.lastSeen = { gx: cop.pos.gx, gy: cop.pos.gy };
    for (let i = 0; i < 8; i++) advanceBeatCops(s, 0.5, w);
    expect(['patrol', 'loiter']).toContain(cop.mode);
    expect(tileKindAt(w.layout, Math.round(cop.pos.gx), Math.round(cop.pos.gy))).toBe('sidewalk');
  });
});

describe('copBehavior — save safety (mid-pursuit P1 state)', () => {
  it('a cop mid-response round-trips byte-exact (lastSeen / focus / suspicion / mode) and resumes deterministically', () => {
    const s = createInitialState(21, { bigCity: true });
    s.units = [fighter('p1', 'player', 30, 30), fighter('r1', 'rival-a', 30.5, 30)];
    const w = buildPatrolWorld(generateWorld(s, { size: 64 }));
    s.beatCops = [mkCop(30, 31, { mode: 'respond', focusUnitId: 'p1', lastSeen: { gx: 30, gy: 30 }, suspicion: 70 })];
    s.lawRngState = 12345;
    const back1 = deserializeGame(serializeGame(s));
    const back2 = deserializeGame(serializeGame(s));
    expect(back1.ok && back2.ok).toBe(true);
    if (!back1.ok || !back2.ok) return;
    expect(json(back1.state.beatCops)).toBe(json(s.beatCops)); // every P1 field survived the JSON round-trip
    for (let i = 0; i < 10; i++) { advanceBeatCops(back1.state, 0.25, w); advanceBeatCops(back2.state, 0.25, w); }
    expect(back1.state.beatCops).toEqual(back2.state.beatCops); // two loads of the same save agree
  });
});

describe('copBehavior — deescalateCop', () => {
  it('fully clears the pursuit and returns the cop to a clean patrol state', () => {
    const cop = mkCop(5, 5, { mode: 'engage', focusUnitId: 'p1', lastSeen: { gx: 8, gy: 5 }, suspicion: 100, headingDir: 2, loiterSec: 3, path: [{ gx: 6, gy: 5 }] });
    deescalateCop(cop);
    expect(cop).toEqual(mkCop(5, 5)); // back to the exact spawn-shape patrol cop
  });
});

// A neutral (no factionId) unit and a downed suspect are exercised through the engage tests; here we pin
// that a neutral unit is never a crime (defensive — isCrimeInProgress must require a hunted faction).
describe('copBehavior — non-combatants are never crimes', () => {
  it('a neutral mover is inert to detection', () => {
    const s = withUnits(spawnUnit('n1', 5, 5), fighter('r1', 'rival-a', 5.4, 5));
    expect(isCrimeInProgress(s.units[0], s, 'player')).toBe(false);
    expect(nearestVisibleCrime(mkCop(5, 6), s, grid(24), 'player')).toBeUndefined();
  });
});
