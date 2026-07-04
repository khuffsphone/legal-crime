// BEAT-COP P1 — DETECT → RESPOND (the law-patrol escalation surface). Pure & Phaser-free.
// ⚠ SIM-ADJACENT, ADDITIVE: this activates the P0 stubs on state.beatCops (suspicion + focusUnitId)
// and drives a cop from PATROL into a RESPOND/ENGAGE pursuit. It never touches state.units, never draws
// from the shared state.rngState, and is DETERMINISTIC (no RNG at all — geometry + fixed accrual rates),
// so a copped game stays byte-identical to its cop-less twin OUTSIDE the cop slice even while a cop is
// actively chasing a crime (the beatCops "numbers-frozen" law, now extended through the escalation).
//
// NO-X-RAY (the load-bearing invariant), SYMMETRIC: a cop detects a crime ONLY through copSees — a local
// sight disc (COP_SIGHT_RADIUS) gated by a real LINE OF SIGHT on the world geometry (a 'building' tile
// strictly between the cop and the crime blocks it). The cop has NO omniscient sensing: a brawl behind a
// building is invisible to it exactly as a fogged rival is invisible to the player, and a cop that loses
// its mark to a building chases only to the LAST TILE IT SAW the crime on (cop.lastSeen) — nothing tracks
// a suspect through cover. The rule reads the SAME worldgen layout the scene renders, so what a cop can
// "see" is exactly what is actually on the map between them — no parallel visibility model to drift.
//
// THE ESCALATION (two-threshold hysteresis, so a cop commits and doesn't flicker):
//   • ACQUIRE — a player-family FIGHTER caught mid-brawl (an enemy in combat reach) within sight becomes
//     the cop's focus. Suspicion then climbs while the cop keeps SEEING that perpetrator.
//   • RESPOND — at COP_RESPOND_THRESHOLD the cop leaves the sidewalk random-walk and converges (straight
//     line, urgent speed) on cop.lastSeen. It holds the pursuit while suspicion > 0.
//   • ENGAGE — once within COP_ENGAGE_RANGE of a still-VISIBLE focus, the cop is in contact (mode 'engage').
//     The damage RESOLUTION is combatResolve's job — see copBehaviorEngage.resolveCopEngagement (pure,
//     unwired; a later PR flags it into the realtime path, mirroring combat PR B). This module only decides
//     WHERE the cop walks and WHETHER it is in contact; it computes no combat number itself.
//   • STAND DOWN — lose sight of the mark and suspicion decays; at 0 the cop de-escalates back to PATROL
//     and heals onto the sidewalk graph (beatCops.advanceBeatCops), resuming the P0 beat.

import { COMBAT_ENGAGE_RANGE } from './constants';
import { isCombatant, enemyInRange } from './combat';
import { tileKindAt, type WorldLayout } from './worldgen';
import type { MovableUnit } from './movement';
import type { GridPos } from './iso';
import type { GameState } from './types';
import type { BeatCop } from './beatCops';

/** Sight radius (tiles) — the disc a cop can witness a crime within (before the line-of-sight gate). Value
 * parity with COMBAT_SEEK_RANGE (6): the range a rival breaks off to engage is the range the law watches. */
export const COP_SIGHT_RADIUS = 6;
/** Suspicion ceiling. cop.suspicion lives in [0, COP_SUSPICION_MAX]; the P0 stub pinned it at 0. */
export const COP_SUSPICION_MAX = 100;
/** Suspicion gained per second while a crime is IN SIGHT (~0.83s of witnessing to commit to a response). */
export const COP_SUSPICION_GAIN = 60;
/** Suspicion shed per second once the crime is OUT of sight (~1.7s from a full commit back to standing down). */
export const COP_SUSPICION_DECAY = 30;
/** Suspicion at/above which a patrolling cop COMMITS — leaves the beat and responds. */
export const COP_RESPOND_THRESHOLD = 50;
/** A still-visible focus this close (tiles) puts the cop IN CONTACT (mode 'engage'). Parity with the 35a
 * auto-engage reach, so the cop is "in the fight" exactly when two combatants there would trade blows. */
export const COP_ENGAGE_RANGE = COMBAT_ENGAGE_RANGE;
/** Converge speed (tiles/sec) while responding — urgent, well above the COP_PATROL_SPEED stroll (1.2). */
export const COP_RESPOND_SPEED = 2.2;

/** Tunable knobs for a behaviour step (all defaulted — advanceBeatCops passes none, so the wired path uses
 * these values; tests inject to pin boundaries). `lawTargetFamilyId` is WHOSE crime the law hunts. */
export interface CopBehaviorOptions {
  lawTargetFamilyId?: string;
  sightRadius?: number;
  respondSpeed?: number;
}

function dist(a: GridPos, b: GridPos): number {
  return Math.hypot(a.gx - b.gx, a.gy - b.gy);
}

/** Clear line of sight between two continuous grid points: no 'building' tile lies STRICTLY BETWEEN them.
 * A grid ray-march (Amanatides–Woo) over the tiles the segment crosses — the cop's own tile and the target
 * tile are endpoints and never block. Tiles are centred on integer coords (tileKindAt rounds), so we march
 * in +0.5-shifted space where tile n spans [n, n+1). Pure + deterministic. */
export function lineOfSightClear(layout: WorldLayout, from: GridPos, to: GridPos): boolean {
  const ax = from.gx + 0.5, ay = from.gy + 0.5;
  const bx = to.gx + 0.5, by = to.gy + 0.5;
  let x = Math.floor(ax), y = Math.floor(ay);
  const endX = Math.floor(bx), endY = Math.floor(by);
  if (x === endX && y === endY) return true; // same tile — nothing between
  const dx = bx - ax, dy = by - ay;
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = dx !== 0 ? (stepX > 0 ? x + 1 - ax : ax - x) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (stepY > 0 ? y + 1 - ay : ay - y) * tDeltaY : Infinity;
  // A hard step budget (Manhattan span + slack) — a straight segment crosses at most that many tiles, so
  // this can never spin even on a degenerate input.
  const budget = Math.abs(endX - x) + Math.abs(endY - y) + 2;
  for (let i = 0; i < budget; i++) {
    // Advance to the next tile the segment ENTERS. On an EXACT grid-corner crossing (tMaxX === tMaxY — e.g.
    // a perfect 45° diagonal) step BOTH axes at once, passing THROUGH the shared corner. This visits only the
    // tiles the segment's interior actually crosses (never the two corner-grazed neighbours), so the result is
    // a symmetric property of the tile pair — lineOfSightClear(a,b) === lineOfSightClear(b,a) — and a building
    // that merely touches the sightline's corner does not over-block it. (A one-axis tie-break would staircase
    // through a corner tile in one direction only, hiding a diagonally-visible crime asymmetrically.)
    if (tMaxX < tMaxY) { x += stepX; tMaxX += tDeltaX; }
    else if (tMaxY < tMaxX) { y += stepY; tMaxY += tDeltaY; }
    else { x += stepX; y += stepY; tMaxX += tDeltaX; tMaxY += tDeltaY; }
    if (x === endX && y === endY) return true;      // reached the target tile — endpoint, never blocks
    if (tileKindAt(layout, x, y) === 'building') return false; // an opaque tile strictly between — no LOS
  }
  return true;
}

/** Whether the cop can SEE the point `at`: inside the sight disc AND with a clear line of sight. This is the
 * whole NO-X-RAY predicate — nothing else in the escalation senses a unit's position. Pure. */
export function copSees(cop: BeatCop, at: GridPos, layout: WorldLayout, radius: number = COP_SIGHT_RADIUS): boolean {
  if (dist(cop.pos, at) > radius) return false;
  return lineOfSightClear(layout, cop.pos, at);
}

/** Is `u` committing a WITNESSABLE crime right now — a factioned fighter (of the hunted family) caught in a
 * brawl (an enemy within combat reach)? Reuses the production combat predicates so "violence in progress"
 * means exactly what the 35a resolver would trade blows over. Pure read. */
export function isCrimeInProgress(u: MovableUnit, state: GameState, targetFamily: string): boolean {
  return u.factionId === targetFamily && isCombatant(u) && enemyInRange(u, state.units) !== undefined;
}

/** The nearest crime-in-progress the cop can SEE (acquisition scan). Deterministic: nearest first, then a
 * stable id tie-break so two equidistant brawls always resolve to the same focus. Pure. */
export function nearestVisibleCrime(
  cop: BeatCop, state: GameState, layout: WorldLayout, targetFamily: string, radius: number = COP_SIGHT_RADIUS,
): MovableUnit | undefined {
  let best: MovableUnit | undefined;
  let bestD = radius + 1e-9;
  for (const u of state.units) {
    if (!isCrimeInProgress(u, state, targetFamily) || !copSees(cop, u.pos, layout, radius)) continue;
    const d = dist(cop.pos, u.pos);
    if (d < bestD || (d === bestD && best && u.id < best.id)) { bestD = d; best = u; }
  }
  return best;
}

/** Snap a fractional grid point to its integer tile (matches tileKindAt's rounding). */
function tileOf(p: GridPos): GridPos {
  return { gx: Math.round(p.gx), gy: Math.round(p.gy) };
}

/** Reset a cop to the patrol beat — the stand-down. beatCops.advanceBeatCops then heals it back onto the
 * sidewalk graph (its converge may have carried it off-graph). Clears the P1 pursuit state entirely. */
export function deescalateCop(cop: BeatCop): void {
  cop.mode = 'patrol';
  cop.suspicion = 0;
  cop.focusUnitId = undefined;
  cop.lastSeen = undefined;
  cop.headingDir = -1;
  cop.loiterSec = 0;
  cop.path = [];
}

/**
 * One DETECT → RESPOND decision step for a cop (mutates ONLY the cop's own slice — suspicion / mode /
 * focusUnitId / lastSeen). Returns true when the cop is now ACTIVELY pursuing (mode 'respond' | 'engage')
 * and the caller should drive its converge movement instead of the P0 random walk; false when the cop is
 * (still) on the patrol beat. Deterministic — draws NO RNG. Never reads or writes any game number.
 */
export function updateCopDetection(
  cop: BeatCop, state: GameState, layout: WorldLayout, dt: number, opts: CopBehaviorOptions = {},
): boolean {
  if (!(dt > 0)) return cop.mode === 'respond' || cop.mode === 'engage';
  const targetFamily = opts.lawTargetFamilyId ?? state.player.id;
  const radius = opts.sightRadius ?? COP_SIGHT_RADIUS;

  // RETENTION: is the cop's current focus still a VISIBLE perpetrator (a live hunted-family fighter in
  // sight)? Once locked on, the cop pursues that suspect even between its swings — it needn't still be
  // mid-punch — but it must remain SEEN (NO-X-RAY). Refresh the last-seen tile while it is.
  let focus = cop.focusUnitId ? state.units.find((u) => u.id === cop.focusUnitId) : undefined;
  let witnessing = false;
  if (focus && isCombatant(focus) && focus.factionId === targetFamily && copSees(cop, focus.pos, layout, radius)) {
    witnessing = true;
    cop.lastSeen = tileOf(focus.pos);
  } else {
    // ACQUISITION: only a crime CAUGHT IN THE ACT (a brawl) draws a fresh response.
    const crime = nearestVisibleCrime(cop, state, layout, targetFamily, radius);
    if (crime) {
      cop.focusUnitId = crime.id;
      cop.lastSeen = tileOf(crime.pos);
      witnessing = true;
      focus = crime;
    }
  }

  // SUSPICION: climbs while witnessing, decays otherwise. Clamped to [0, MAX].
  cop.suspicion = witnessing
    ? Math.min(COP_SUSPICION_MAX, cop.suspicion + COP_SUSPICION_GAIN * dt)
    : Math.max(0, cop.suspicion - COP_SUSPICION_DECAY * dt);

  const committed = cop.mode === 'respond' || cop.mode === 'engage';
  // STAND DOWN: the trail is stone cold — drop the mark and resume the beat. A COMMITTED cop needs the full
  // patrol reset (mode → patrol + a healable path so it snaps back onto the graph). A cop that was only
  // WATCHING from the beat (acquired a focus but never committed) keeps its patrol walk intact — but it MUST
  // still shed the stale focus/lastSeen. Retention (line above) deliberately does NOT require an active brawl
  // (a committed cop pursues its suspect between swings), so a lingering focus would let retention re-fire on
  // that former suspect the moment it reappears — the cop would then commit against someone committing NO
  // crime now, bypassing the "caught in the act" acquisition gate. Clearing the mark at 0 closes that leak.
  if (cop.suspicion <= 0) {
    if (committed) {
      deescalateCop(cop);
    } else {
      cop.suspicion = 0;
      cop.focusUnitId = undefined;
      cop.lastSeen = undefined;
    }
    return false;
  }
  // WATCHING FROM THE BEAT: suspicion is rising but hasn't crossed the commit threshold yet — keep
  // patrolling (hold the focus so it keeps building next step). Hysteresis: only a patrol cop must clear
  // the threshold; an already-committed cop stays committed until suspicion fully drains above.
  if (!committed && cop.suspicion < COP_RESPOND_THRESHOLD) return false;
  // COMMITTED: respond, and drop into contact when a still-visible focus is within engage reach.
  const inContact = witnessing && focus !== undefined && dist(cop.pos, focus.pos) <= COP_ENGAGE_RANGE;
  cop.mode = inContact ? 'engage' : 'respond';
  return true;
}

/**
 * Move a responding/engaging cop one step toward cop.lastSeen — a straight-line converge at COP_RESPOND_SPEED
 * (the off-screen abstraction of "run to the trouble"; no pathfinding — the beat graph is for the stroll,
 * the response cuts across). Clamped in-bounds, never overshoots the mark. Mutates cop.pos only. NO-X-RAY:
 * it heads for the LAST SEEN tile, never a live position it cannot see. Robust to a large dt (caps at the
 * mark). Pure aside from the cop it moves.
 */
export function advanceCopResponse(cop: BeatCop, layout: WorldLayout, dt: number, speed: number = COP_RESPOND_SPEED): void {
  const goal = cop.lastSeen;
  if (!goal || !(dt > 0)) return;
  const dx = goal.gx - cop.pos.gx;
  const dy = goal.gy - cop.pos.gy;
  const d = Math.hypot(dx, dy);
  if (d <= 1e-6) return; // already on the mark
  const budget = speed * dt;
  const t = budget >= d ? 1 : budget / d;
  const nx = cop.pos.gx + dx * t;
  const ny = cop.pos.gy + dy * t;
  const max = layout.size - 1;
  cop.pos = { gx: Math.min(max, Math.max(0, nx)), gy: Math.min(max, Math.max(0, ny)) };
}
