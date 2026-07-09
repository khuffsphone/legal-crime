// BEAT-COP P1 — HEAT INTEGRATION. A cop that WITNESSES a crime raises the hunted family's heat, feeding the
// EXISTING federal ladder. The laws under test (mutation-verified):
//   1. WITNESS → HEAT — a cop that commits to a seen crime bumps player heat by COP_WITNESS_HEAT (once).
//   2. NO-X-RAY — a crime the cop CANNOT see (LOS blocked) raises NO heat (fails if the sight gate is cut).
//   3. EDGE-TRIGGERED — heat rises ONCE on commit, not per realtime tick (cadence-safe, can't flood).
//   4. RNG ISOLATION — a witnessed-crime step draws no RNG: state.rngState + state.lawRngState unperturbed.
//   5. OLD-SAVE SAFETY — no state.beatCops ⇒ advanceBeatCops no-ops ⇒ heat unchanged (default-safe).
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { type TileKind, type WorldLayout } from '../src/sim/worldgen';
import { spawnEnforcer, type MovableUnit } from '../src/sim/movement';
import { advanceBeatCops, buildPatrolWorld, raiseHeat, COP_PATROL_SPEED, type BeatCop, type PatrolWorld } from '../src/sim/beatCops';
import { COP_WITNESS_HEAT, HEAT_MAX } from '../src/sim/constants';
import type { GameState } from '../src/sim/types';

/** All-'ground' NxN layout with optional building tiles (LOS blockers) — copBehavior reads only size+tiles. */
function grid(size: number, buildings: ReadonlyArray<[number, number]> = []): WorldLayout {
  const tiles: TileKind[] = Array.from({ length: size * size }, () => 'ground' as TileKind);
  for (const [gx, gy] of buildings) tiles[gy * size + gx] = 'building';
  return {
    size, cols: size, rows: size, tiles,
    districtOfTile: Array.from({ length: size * size }, () => 'district-0'),
    districts: [], hqTiles: {}, businessTiles: {},
  } as WorldLayout;
}

const fighter = (id: string, factionId: string, gx: number, gy: number): MovableUnit => spawnEnforcer(id, gx, gy, factionId, 2.5);

function mkCop(gx: number, gy: number): BeatCop {
  return { id: 'cop-0', pos: { gx, gy }, path: [], speed: COP_PATROL_SPEED, homeDistrictId: 'district-0', mode: 'patrol', headingDir: -1, suspicion: 0, loiterSec: 0 };
}

/** A player↔rival brawl at (5,5), a cop at copPos, and a hand-built patrol world (optionally with LOS
 * blockers). player.heat seeded to 0. state.player.id is the hunted family the fighter's factionId matches. */
function scene(copPos: { gx: number; gy: number }, buildings: ReadonlyArray<[number, number]> = []): { s: GameState; cop: BeatCop; world: PatrolWorld } {
  const s = createInitialState(1, { bigCity: true });
  s.units = [fighter('p1', s.player.id, 5, 5), fighter('r1', 'rival-a', 5.5, 5)];
  s.player.heat = 0;
  const cop = mkCop(copPos.gx, copPos.gy);
  s.beatCops = [cop];
  return { s, cop, world: buildPatrolWorld(grid(24, buildings)) };
}

describe('Beat-cop P1 — heat integration', () => {
  it('a cop that WITNESSES a crime commits and raises the hunted family heat by COP_WITNESS_HEAT', () => {
    const { s, cop, world } = scene({ gx: 5, gy: 3 }); // 2 tiles from the brawl — in sight, clear LOS
    advanceBeatCops(s, 1.0, world);                    // dt=1 ⇒ suspicion 60 ≥ threshold ⇒ commit this step
    expect(cop.mode === 'respond' || cop.mode === 'engage').toBe(true);
    expect(s.player.heat).toBe(COP_WITNESS_HEAT);
  });

  it('MUTATION sight-gate-removed: a crime behind a wall (LOS blocked) raises NO heat (NO-X-RAY)', () => {
    // building at (5,4) strictly between the cop (5,3) and the brawl (5,5) blocks the line of sight
    const { s, cop, world } = scene({ gx: 5, gy: 3 }, [[5, 4]]);
    advanceBeatCops(s, 1.0, world);
    expect(cop.mode === 'respond' || cop.mode === 'engage').toBe(false); // never committed — it cannot SEE the crime
    expect(s.player.heat).toBe(0);       // …so no heat. (Cut copSees/LOS and this flips to detected + heat.)
  });

  it('MUTATION out-of-sight: a crime beyond the sight radius raises no heat', () => {
    const { s, world } = scene({ gx: 5, gy: 18 }); // 13 tiles away, > COP_SIGHT_RADIUS (6)
    advanceBeatCops(s, 1.0, world);
    expect(s.player.heat).toBe(0);
  });

  it('MUTATION per-tick-flood: heat rises ONCE on commit, not every tick the cop keeps pursuing', () => {
    const { s, world } = scene({ gx: 5, gy: 3 });
    advanceBeatCops(s, 1.0, world); // commit → +COP_WITNESS_HEAT
    advanceBeatCops(s, 1.0, world); // still committed, still witnessing → NO further bump
    advanceBeatCops(s, 1.0, world);
    expect(s.player.heat).toBe(COP_WITNESS_HEAT); // exactly one bump, not 3×
  });

  it('multi-witness: heat STACKS per committing cop — a crime seen by 2 cops draws 2× (documented, pending §-heat)', () => {
    // two cops flanking the same brawl, both in sight + clear LOS → both commit this step
    const s = createInitialState(1, { bigCity: true });
    s.units = [fighter('p1', s.player.id, 5, 5), fighter('r1', 'rival-a', 5.5, 5)];
    s.player.heat = 0;
    s.beatCops = [mkCop(5, 3), mkCop(5, 7)];
    advanceBeatCops(s, 1.0, buildPatrolWorld(grid(24)));
    expect(s.beatCops.every((c) => c.mode === 'respond' || c.mode === 'engage')).toBe(true);
    expect(s.player.heat).toBe(2 * COP_WITNESS_HEAT); // stacks — the open reconciliation item (cap/dedupe?)
  });

  it('a witnessed-crime step draws NO RNG — state.rngState and state.lawRngState are unperturbed', () => {
    const { s, world } = scene({ gx: 5, gy: 3 });
    s.rngState = 777; s.lawRngState = 12345;
    advanceBeatCops(s, 1.0, world); // commit → witness branch → no advanceCop → no rng draw
    expect(s.rngState).toBe(777);       // the sim cursor is never touched by the cop layer
    expect(s.lawRngState).toBe(12345);  // the law cursor only advances on the PATROL branch
  });

  it('MUTATION old-save-unsafe: no state.beatCops ⇒ advanceBeatCops no-ops ⇒ heat unchanged', () => {
    const s = createInitialState(1, { bigCity: true });
    s.units = [fighter('p1', s.player.id, 5, 5), fighter('r1', 'rival-a', 5.5, 5)];
    s.player.heat = 7;
    s.beatCops = undefined; // an old save / ?cops OFF
    advanceBeatCops(s, 1.0, buildPatrolWorld(grid(24)));
    expect(s.player.heat).toBe(7);
  });

  it('raiseHeat clamps at HEAT_MAX (the layer never overflows the ladder)', () => {
    const fam = { ...createInitialState(1).player, heat: HEAT_MAX - 3 };
    raiseHeat(fam, COP_WITNESS_HEAT);
    expect(fam.heat).toBe(HEAT_MAX);
  });
});
