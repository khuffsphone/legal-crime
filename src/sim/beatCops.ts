// BEAT-COP P0 — the LAW-PATROL layer, marker prototype (Tickets 1-3 + 6). Pure & Phaser-free.
// ⚠ SIM-ADJACENT: cops live in an ADDITIVE optional GameState slice (state.beatCops) driven by the
// real-time WRAPPER (realtime.update), exactly like downedBodies/extortionActs — tick()/applyCommand()
// never see them, and cops are NOT MovableUnits (they never enter state.units, so movement/interception/
// combat/selection are structurally untouched). P0 was OBSERVATION-ONLY: a cop changes no game number.
// P1 (copBehavior.ts) ACTIVATES the reserved suspicion + focusUnitId stubs — a cop now DETECTS a witnessed
// crime (NO-X-RAY sight), escalates patrol→respond→engage, and converges on it. That escalation still
// changes NO game number: it mutates only the cop slice and draws no shared RNG, so a copped game stays
// byte-identical to its cop-less twin. The ENGAGE damage RESOLUTION consumes combatResolve headlessly and
// PURELY (copBehaviorEngage.resolveCopEngagement) — unwired here, so "numbers-frozen with cops idle" holds.
//
// RNG DISCIPLINE (the load-bearing invariant): every cop draw comes from a SEPARATE law cursor
// (state.lawRngState, seeded from state.seed with a fresh XOR salt) — never the shared state.rngState.
// Existing outcome order across the whole game is therefore bit-identical with or without cops.

import { Rng, seedToCursor } from './rng';
import { buildCityGraph, pickStep, STEP_DIRS, type CityGraph } from './cityGraph';
import { generateWorld, tileKindAt, type WorldLayout } from './worldgen';
import { isRevealed, type FogState } from './fog';
import { updateCopDetection, advanceCopResponse } from './copBehavior';
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

// P0 modes are 'patrol' | 'loiter' (the beat). P1 (copBehavior) adds the escalation: 'respond' (left the
// beat, converging on a witnessed crime) and 'engage' (in contact — the confrontation resolveCopEngagement
// runs through combatResolve). Widening only; every P0 consumer of a cop's mode reads a superset now.
export type BeatCopMode = 'patrol' | 'loiter' | 'respond' | 'engage';

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
  /** P1 (copBehavior) — witnessing accumulator in [0, COP_SUSPICION_MAX]. 0 in P0 / while nothing is seen;
   * climbs while a crime is in sight, crosses COP_RESPOND_THRESHOLD to commit, drains to 0 to stand down. */
  suspicion: number;
  /** P1 (copBehavior) — the suspect the cop has locked onto (a state.units id). Undefined in P0 / on patrol. */
  focusUnitId?: string;
  /** P1 (copBehavior) — the last TILE the cop actually SAW its focus on (NO-X-RAY: a responding cop converges
   * here, never on a live position it cannot see). Absent in P0 / on patrol. Additive, default-safe. */
  lastSeen?: GridPos;
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

// One memoized default substrate (the scene's WORLD_SIZE map). ⚠ generateWorld is NOT a function of
// (seed, districts) alone — it also draws parcel placements per district BUSINESS and stamps
// player/rival HQs, and business lists mutate in normal play (open/raid/sabotage/shock). Two modes:
//  • PRIMED (the live scene): primePatrolWorld pins the substrate to the layout the scene actually
//    RENDERS for this create/load epoch, keyed by the game session (seed + district ids). Mid-session
//    business churn does NOT re-shape the rendered map until the next create, so the patrol graph
//    must not re-shape either — cops keep walking the sidewalks the player can see.
//  • FALLBACK (headless: tests, tools): rebuilt on demand, keyed by a fingerprint of EVERY mutable
//    input generateWorld consumes — the memo can never serve a stale substrate, so advance stays a
//    pure function of the state regardless of process history.
// Displaced cops (saved coords from a since-re-rolled layout) are HEALED onto the current graph —
// deterministically and without touching any RNG cursor — by healBeatCops/healCop below.
// NB: pass the SAME explicit `world` to spawn AND advance, or neither — mixing a custom world with
// the memoized default would patrol cops on mismatched graphs.
let worldMemo: { key: string; primed: boolean; world: PatrolWorld } | null = null;

/** The stable identity of a game session (a new create() re-primes, so churn within it is fine). */
function sessionKey(state: GameState): string {
  return `${state.seed}:${state.districts.map((d) => d.id).join(',')}`;
}

/** Every mutable input generateWorld consumes: businesses shift the shared parcel-placement RNG
 * stream (one added/removed business relocates every later building), player/rivals stamp HQs. */
function worldFingerprint(state: GameState): string {
  const biz = state.districts.map((d) => d.businesses.map((b) => b.id).join('+')).join(';');
  return `${sessionKey(state)}|${state.player.id}|${state.rivals.map((r) => r.id).join(',')}|${biz}`;
}

function resolvePatrolWorld(state: GameState, world?: PatrolWorld): PatrolWorld {
  if (world) return world;
  if (worldMemo?.primed && worldMemo.key === sessionKey(state)) return worldMemo.world;
  const fp = worldFingerprint(state);
  if (!worldMemo || worldMemo.primed || worldMemo.key !== fp) {
    worldMemo = { key: fp, primed: false, world: buildPatrolWorld(generateWorld(state, { size: WORLD_SIZE })) };
  }
  return worldMemo.world;
}

/** Pin the patrol substrate to the layout the scene RENDERS for this create/load epoch (call it in
 * create(), before any spawn), and heal any saved cop whose coords fell off the freshly regenerated
 * sidewalk graph (business churn between save and load re-rolls parcels, so a saved node can now be
 * a building). Deterministic; draws nothing from any RNG cursor. */
export function primePatrolWorld(state: GameState, layout: WorldLayout): PatrolWorld {
  const world = buildPatrolWorld(layout);
  worldMemo = { key: sessionKey(state), primed: true, world };
  healBeatCops(state, world);
  return world;
}

function healBeatCops(state: GameState, world: PatrolWorld): void {
  for (const cop of state.beatCops ?? []) healCop(cop, world);
}

/** Re-snap a cop the current graph no longer carries: off-sidewalk pos ⇒ nearest sidewalk node
 * (deterministic; first-wins tie-break in node order); off-sidewalk waypoint ⇒ drop the path so the
 * next arrival re-picks. Keeps a stranded marker from freezing forever inside a re-rolled building. */
function healCop(cop: BeatCop, { layout, graph }: PatrolWorld): void {
  if (tileKindAt(layout, cop.pos.gx, cop.pos.gy) !== 'sidewalk') {
    let best = -1;
    let bestD = Infinity;
    for (const ti of graph.sidewalkNodes) {
      const dx = (ti % graph.size) - cop.pos.gx;
      const dy = Math.floor(ti / graph.size) - cop.pos.gy;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = ti; }
    }
    if (best < 0) return; // a map with no sidewalks at all — nothing to heal onto
    cop.pos = { gx: best % graph.size, gy: Math.floor(best / graph.size) };
    cop.path = [];
    cop.headingDir = -1;
    cop.mode = 'patrol';
    cop.loiterSec = 0;
  } else if (cop.path.length > 0 && tileKindAt(layout, cop.path[0].gx, cop.path[0].gy) !== 'sidewalk') {
    cop.path = [];
    cop.headingDir = -1;
  }
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
  const resolved = resolvePatrolWorld(state, world);
  const rng = new Rng(lawCursor(state));
  for (const cop of cops) {
    // P1 (copBehavior) — DETECT → RESPOND: deterministic, draws NO RNG, mutates ONLY the cop slice
    // (suspicion / mode / focusUnitId / lastSeen). A cop with a crime in sight leaves the beat and
    // converges on it; with nothing to see it runs the unchanged P0 random walk. The law cursor is
    // therefore advanced ONLY on the patrol branch, so a crime-less game keeps its exact P0 cadence.
    if (updateCopDetection(cop, state, resolved.layout, dt)) {
      advanceCopResponse(cop, resolved.layout, dt); // off the sidewalk graph — cut straight to the trouble
    } else {
      healCop(cop, resolved); // cheap no-op while on-graph; re-snaps coords a substrate rebuild displaced
      advanceCop(cop, resolved.graph, rng, dt);
    }
  }
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
