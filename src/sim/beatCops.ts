// BEAT-COP P0 — the LAW-PATROL layer, marker prototype (Tickets 1-3 + 6). Pure & Phaser-free.
// ⚠ SIM-ADJACENT: cops live in an ADDITIVE optional GameState slice (state.beatCops) driven by the
// real-time WRAPPER (realtime.update), exactly like downedBodies/extortionActs — tick()/applyCommand()
// never see them, and cops are NOT MovableUnits (they never enter state.units, so movement/interception/
// combat/selection are structurally untouched). P0 is OBSERVATION-ONLY: a cop changes no game number.
// Detection / suspicion / heat / reports are P1 — the fields exist as stubs only.
//
// RNG DISCIPLINE (the load-bearing invariant): every cop draw comes from a SEPARATE law cursor
// (state.lawRngState, seeded from state.seed with a fresh XOR salt) — never the shared state.rngState.
// Existing outcome order across the whole game is therefore bit-identical with or without cops.

import { Rng, seedToCursor } from './rng';
import { buildCityGraph, pickStep, STEP_DIRS, type CityGraph } from './cityGraph';
import { generateWorld, type WorldLayout } from './worldgen';
import { isRevealed, type FogState } from './fog';
import { WORLD_SIZE } from './constants';
import type { GridPos } from './iso';
import type { GameState } from './types';

/** Patrol walking speed, tiles/second (between STROLL_SPEED 1.15 and MOVE_SPEED 2.5 — an unhurried beat). */
export const COP_PATROL_SPEED = 1.2;
/** CLEAR-tier cop cap (P0 spawns the whole force at once; escalation tiers are P1+). */
export const COP_CAP_CLEAR = 3;
/** Average district policePresence at/above which the CLEAR tier fields its third cop. */
export const COP_THIRD_COP_PRESENCE = 25;
/** Chance (per node arrival) that a cop pauses to loiter — watching the street — before moving on. */
export const COP_LOITER_CHANCE = 0.12;
export const COP_LOITER_MIN_SEC = 1.5;
export const COP_LOITER_MAX_SEC = 4;
/** How long a stranded cop (isolated sidewalk node, no exits) waits before re-checking. */
export const COP_STRANDED_RETRY_SEC = 1.5;
/** XOR salt deriving the law cursor from state.seed (0x30a / 0x30b0 / 0x11fe are taken elsewhere). */
const LAW_RNG_SALT = 0xbc0;

export type BeatCopMode = 'patrol' | 'loiter';

/** One beat cop (spec §2.1). Plain JSON data — saves round-trip it wholesale. */
export interface BeatCop {
  id: string;
  /** Continuous tile coords (fractional between sidewalk nodes). */
  pos: GridPos;
  /** Next patrol waypoint(s); the P0 random walk keeps at most ONE entry (the adjacent node). */
  path: GridPos[];
  /** Tiles per second. */
  speed: number;
  homeDistrictId: string;
  mode: BeatCopMode;
  /** Incoming heading as a STEP_DIRS bit 0..3 (N,E,S,W); −1 before the first step. */
  headingDir: number;
  /** P1 stub — always 0 in P0 (no detection). */
  suspicion: number;
  /** P1 stub — never set in P0 (no focus target). */
  focusUnitId?: string;
  /** Remaining pause when mode === 'loiter'; 0 while patrolling. */
  loiterSec: number;
}

/** The precomputed patrol substrate (world layout + sidewalk graph). NOT stored in GameState —
 * Uint8Arrays don't survive the JSON save round-trip; it is rebuilt deterministically from the seed. */
export interface PatrolWorld {
  layout: WorldLayout;
  graph: CityGraph;
}

export interface CopDistrictWeight {
  districtId: string;
  weight: number;
}

/** Build a PatrolWorld from an existing layout (tests / callers that already generated one). */
export function buildPatrolWorld(layout: WorldLayout): PatrolWorld {
  return { layout, graph: buildCityGraph(layout) };
}

// One memoized default substrate (the scene's WORLD_SIZE map). generateWorld is deterministic from
// (seed, districts), so rebuilding after a save/load or across states with the same key is exact.
// NB: pass the SAME explicit `world` to spawn AND advance, or neither — mixing a custom world with
// the memoized default would patrol cops on mismatched graphs.
let worldMemo: { key: string; world: PatrolWorld } | null = null;

function resolvePatrolWorld(state: GameState, world?: PatrolWorld): PatrolWorld {
  if (world) return world;
  const key = `${state.seed}:${state.districts.map((d) => d.id).join(',')}`;
  if (!worldMemo || worldMemo.key !== key) {
    worldMemo = { key, world: buildPatrolWorld(generateWorld(state, { size: WORLD_SIZE })) };
  }
  return worldMemo.world;
}

/** The law cursor to draw from: the persisted one, else freshly derived from the game seed. */
function lawCursor(state: GameState): number {
  return state.lawRngState ?? seedToCursor((state.seed ^ LAW_RNG_SALT) >>> 0);
}

/** How many beat cops the city fields (P0 = the CLEAR tier only): 2, or 3 where the average
 * district policePresence runs high. Deterministic — no RNG draw. */
export function desiredCopCount(state: GameState): number {
  const ds = state.districts;
  if (ds.length === 0) return 0;
  const avg = ds.reduce((sum, d) => sum + d.policePresence, 0) / ds.length;
  return Math.min(COP_CAP_CLEAR, avg >= COP_THIRD_COP_PRESENCE ? 3 : 2);
}

/** Spawn-district weighting (spec §3.2-3.3): policePresence-driven — heavily policed districts are
 * likelier to get the beat. Every district keeps weight ≥ 1 so none is unreachable. */
export function copDistrictWeights(state: GameState): CopDistrictWeight[] {
  return state.districts.map((d) => ({ districtId: d.id, weight: Math.max(1, d.policePresence) }));
}

function weightedPickDistrict(weights: readonly CopDistrictWeight[], roll: number): string {
  const total = weights.reduce((s, w) => s + w.weight, 0);
  let cut = roll * total;
  for (const w of weights) {
    cut -= w.weight;
    if (cut < 0) return w.districtId;
  }
  return weights[weights.length - 1].districtId;
}

/** Sidewalk spawn candidates inside a district (falls back to the whole graph when a district
 * somehow has none — worldgen always fronts its avenues with sidewalk, so this is a safety net). */
function sidewalkNodesIn(layout: WorldLayout, graph: CityGraph, districtId: string): number[] {
  return graph.sidewalkNodes.filter((ti) => layout.districtOfTile[ti] === districtId);
}

/** Spawn the CLEAR-tier beat-cop force onto sidewalk nodes by weighted district selection. Writes
 * state.beatCops + state.lawRngState (its OWN cursor — the shared state.rngState is never touched).
 * Deterministic: same seed ⇒ same cops. Idempotence is the caller's concern (the scene spawns only
 * when the slice is absent). */
export function spawnBeatCops(state: GameState, world?: PatrolWorld): BeatCop[] {
  const { layout, graph } = resolvePatrolWorld(state, world);
  const rng = new Rng(lawCursor(state));
  const weights = copDistrictWeights(state);
  const count = weights.length === 0 || graph.sidewalkNodes.length === 0 ? 0 : desiredCopCount(state);
  const cops: BeatCop[] = [];
  for (let i = 0; i < count; i++) {
    const districtId = weightedPickDistrict(weights, rng.nextFloat());
    const inDistrict = sidewalkNodesIn(layout, graph, districtId);
    const pool = inDistrict.length > 0 ? inDistrict : graph.sidewalkNodes;
    const ti = pool[rng.nextInt(0, pool.length - 1)];
    cops.push({
      id: `cop-${i}`,
      pos: { gx: ti % graph.size, gy: Math.floor(ti / graph.size) },
      path: [],
      speed: COP_PATROL_SPEED,
      homeDistrictId: districtId,
      mode: 'patrol',
      headingDir: -1,
      suspicion: 0,
      loiterSec: 0,
    });
  }
  state.beatCops = cops;
  state.lawRngState = rng.state;
  return cops;
}

/** Advance every beat cop by `dt` seconds along the sidewalk graph (random walk via pickStep, with
 * occasional loiters). No-op — and leaves lawRngState UNSET — when the slice is absent/empty, so
 * old saves and cop-less games stay byte-identical through the realtime wrapper. Robust to large dt
 * (skip-week feeds ~55s in one call): movement is a time-budget loop, never a per-frame step. */
export function advanceBeatCops(state: GameState, dt: number, world?: PatrolWorld): void {
  const cops = state.beatCops;
  if (!cops || cops.length === 0 || !(dt > 0)) return;
  const { graph } = resolvePatrolWorld(state, world);
  const rng = new Rng(lawCursor(state));
  for (const cop of cops) advanceCop(cop, graph, rng, dt);
  state.lawRngState = rng.state;
}

function advanceCop(cop: BeatCop, graph: CityGraph, rng: Rng, dt: number): void {
  let timeLeft = dt;
  while (timeLeft > 1e-9) {
    if (cop.mode === 'loiter') {
      // Loitering consumes real time, so this loop always progresses (loiterSec is set > 0 below).
      const pause = Math.min(cop.loiterSec, timeLeft);
      cop.loiterSec -= pause;
      timeLeft -= pause;
      if (cop.loiterSec <= 1e-9) {
        cop.loiterSec = 0;
        cop.mode = 'patrol';
      }
      continue;
    }
    if (cop.path.length === 0) {
      arriveAtNode(cop, graph, rng);
      continue;
    }
    const wp = cop.path[0];
    const dx = wp.gx - cop.pos.gx;
    const dy = wp.gy - cop.pos.gy;
    const dist = Math.hypot(dx, dy);
    const budget = cop.speed * timeLeft;
    if (dist <= 1e-6 || dist <= budget) {
      cop.pos = { gx: wp.gx, gy: wp.gy };
      cop.path.shift();
      timeLeft -= dist / cop.speed;
      arriveAtNode(cop, graph, rng);
    } else {
      const t = budget / dist;
      cop.pos = { gx: cop.pos.gx + dx * t, gy: cop.pos.gy + dy * t };
      timeLeft = 0;
    }
  }
}

/** Node-arrival decision. Draws EXACTLY TWO law-cursor rolls per arrival (step choice + loiter
 * chance) so the cursor cadence never varies with the outcome — determinism stays trivial to audit. */
function arriveAtNode(cop: BeatCop, graph: CityGraph, rng: Rng): void {
  const gx = Math.round(cop.pos.gx);
  const gy = Math.round(cop.pos.gy);
  const adj = graph.sidewalkAdj[gy * graph.size + gx] ?? 0;
  const stepRoll = rng.nextFloat();
  const loiterRoll = rng.nextFloat();
  const d = pickStep(adj, cop.headingDir, stepRoll);
  if (d < 0) {
    // Isolated node (no sidewalk exits) — hold position and re-check after a beat.
    cop.headingDir = -1;
    cop.mode = 'loiter';
    cop.loiterSec = COP_STRANDED_RETRY_SEC;
    return;
  }
  cop.headingDir = d;
  cop.path = [{ gx: gx + STEP_DIRS[d][0], gy: gy + STEP_DIRS[d][1] }];
  if (loiterRoll < COP_LOITER_CHANCE) {
    // Pause at THIS node first; the queued step then plays out when the loiter drains.
    cop.mode = 'loiter';
    cop.loiterSec = COP_LOITER_MIN_SEC + (loiterRoll / COP_LOITER_CHANCE) * (COP_LOITER_MAX_SEC - COP_LOITER_MIN_SEC);
  }
}

/** Opt-in layer flag (?cops=1) — default OFF so normal play is untouched (revealAllRequested pattern).
 * Pure: takes the query string, never reads window (the sim stays DOM-free). */
export function copsRequested(search: string): boolean {
  if (!search) return false;
  try {
    return new URLSearchParams(search).get('cops') === '1';
  } catch {
    return false;
  }
}

/** QA overlay flag (?debugCops=1) — draws each cop's current patrol edge. Default OFF. */
export function debugCopsRequested(search: string): boolean {
  if (!search) return false;
  try {
    return new URLSearchParams(search).get('debugCops') === '1';
  } catch {
    return false;
  }
}

/** The render fog gate (NO-X-RAY): a cop on an unrevealed tile draws NOTHING. `revealAll` is the
 * ?reveal=1 debug override the scene already applies to every other entity. Pure + testable — the
 * scene calls exactly this predicate. */
export function copMarkerVisible(fog: FogState, cop: BeatCop, revealAll: boolean): boolean {
  return revealAll || isRevealed(fog, Math.round(cop.pos.gx), Math.round(cop.pos.gy));
}
