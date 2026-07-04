// COMBAT PR B — HEADLESS AUTO-RESOLVE (pure, Phaser-free). resolveEngagement runs the EXISTING combat +
// movement rules forward in an accelerated headless loop for an OFF-SCREEN engagement, and returns a
// compact { outcome, casualties, survivors, durationTicks, tickLog } report. It is the "clip-style"
// resolution half of the hybrid combat model (PR A = the on-map control surface; this = the off-screen
// auto-resolve). Zero wire-up in this PR — a later PR flags it into the realtime path.
//
// FIDELITY (the load-bearing invariant): the DAMAGE EXCHANGE is the PRODUCTION function itself —
// resolveProximityCombat(combat.ts), called UNMODIFIED on a scratch GameState whose units are our clones.
// So every swing uses the exact weapon/skill table + the HARD CAPS (MAX_HIT_DAMAGE 45 / MIN_ATTACK_INTERVAL
// 0.45, applied inside meleeDamage/attackInterval — we never touch them), and a headless resolution can
// never diverge from what the live fight would compute. We add only a MOVEMENT layer around it (close to
// melee, or flee on a DISENGAGE order) — the off-screen abstraction of "walk in and trade / break off".
//
// PURITY (numbers-frozen): resolveEngagement NEVER mutates the passed-in state or its units — it clones the
// participants and operates on a scratch GameState (a spread copy with a throwaway log). It reads, but never
// writes, state.rngState / any shared cursor (the exchange draws no RNG at all). So invoking it leaves the
// live game bit-identical: existing outcomes are byte-for-byte the same whether or not the resolver ran.
//
// RNG: the exchange is deterministic (no miss roll). The ONLY randomness is an OPT-IN initiative jitter,
// drawn from a resolver-LOCAL cursor seeded off state.seed via a FRESH salt (never state.rngState, never
// persisted). Default off ⇒ draw-free and fully deterministic. Isolation is absolute: the cursor is local.
//
// NO-X-RAY: the resolver computes with full knowledge (headless — it sees both sides). That is fine because
// it surfaces NOTHING itself (zero wire-up). Any future player-facing report MUST go through the existing
// fog-gated event-feed / info-feedback seams (eventFeed.test / infoFeedback.test) — the tickLog carries full
// composition and is the seed for a fog-applied newsreel, NOT a surface to render raw.

import { COMBAT_SEEK_RANGE, MOVE_SPEED } from './constants';
import { hostile, isCombatant, resolveProximityCombat, type CombatEvent } from './combat';
import { engageRange } from './combatTuning';
import type { MovableUnit } from './movement';
import { Rng, seedToCursor } from './rng';
import type { CombatOrders } from './combatControl';
import type { GameState } from './types';
import type { GridPos } from './iso';

/** Headless tick granularity (seconds/step). Fine enough to preserve swing-cadence ordering (attackCd
 * 0.45–0.8s ⇒ a unit does NOT swing every step), coarse enough that a fight resolves in a few dozen steps. */
export const RESOLVE_DT = 0.25;
/** Hard tick cap — the anti-hang backstop. A genuine stalemate (both sides' damage floors to 0, or units
 * boxed and unable to close) ends as a 'timeout' rather than looping forever. Generously above any real
 * fight (a 1v1 downs in ~5 swings ≈ a dozen steps). */
export const RESOLVE_MAX_TICKS = 4000;
/** Default tickLog cap (beats). Keeps the newsreel seed compact; overflow sets result.logTruncated. */
export const RESOLVE_LOG_CAP = 400;
/** XOR salt deriving the resolver's LOCAL initiative cursor from state.seed. Distinct from the taken
 * 0x30a / 0x30b0 / 0x11fe / 0xbc0. Only ever seeds a resolver-local Rng — never state.rngState. */
export const COMBAT_RESOLVE_RNG_SALT = 0xc0b;
/** Max initiative phase (seconds) added to a unit's opening attackCd when opts.initiativeJitter is on. */
const INITIATIVE_JITTER_MAX = 0.4;

/** One compact combat beat — the newsreel-replay seed. Full knowledge (fog is applied later, at the
 * presentation boundary, NEVER here). Mirrors the live CombatEvent shape the render layer already reads. */
export interface ResolveBeat {
  tick: number;            // headless step index the beat fired on
  attackerId: string;
  targetId: string;
  faction: string;         // the STRUCK unit's family
  kind: 'hit' | 'down';
  gx: number; gy: number;  // the struck unit's position at the beat
}

export type EngagementOutcome =
  | { kind: 'decisive'; victorFactionId: string } // exactly one faction still holds the field (has live fighters)
  | { kind: 'draw' }                              // mutual wipe — no fighter left standing on either side
  | { kind: 'disengaged' }                        // nobody held the field, but ≥1 fighter broke off and escaped
  | { kind: 'timeout' };                          // hit the tick cap with ≥2 factions still fighting (stalemate)

export interface ResolveResult {
  outcome: EngagementOutcome;
  /** Unit ids downed, in the order they fell. */
  casualties: string[];
  /** Unit ids alive at the end — those still on the field PLUS any that broke off and escaped. */
  survivors: string[];
  /** Unit ids that broke off (DISENGAGE order) and got clear — a subset of survivors. */
  fled: string[];
  /** How many headless steps the fight took. */
  durationTicks: number;
  /** Compact per-beat log (capped at logCap) — the fog-gated newsreel seed. */
  tickLog: ResolveBeat[];
  /** True when the fight produced more beats than logCap (the tail was dropped — no silent cap). */
  logTruncated: boolean;
}

export interface ResolveOptions {
  /** Headless step size (default RESOLVE_DT). */
  dt?: number;
  /** Hard tick cap (default RESOLVE_MAX_TICKS). */
  maxTicks?: number;
  /** tickLog beat cap (default RESOLVE_LOG_CAP). */
  logCap?: number;
  /** Opt-in: seed a small per-unit opening-swing phase from the LOCAL cursor so repeated auto-resolves of
   * an identical matchup vary (still deterministic per seed). Default OFF ⇒ the fight is a pure re-run of
   * the existing rules and draws no randomness. */
  initiativeJitter?: boolean;
  /** Explicit seed for the local jitter cursor (else derived from state.seed + the participant set). */
  seed?: number;
}

/** A deterministic seed for the resolver's LOCAL cursor: state.seed salted, mixed with the participant set
 * so distinct engagements in one game get distinct (but reproducible) jitter streams. Never touches the
 * shared cursor. Pure. */
export function combatResolveSeed(state: GameState, participantIds: readonly string[]): number {
  let mix = (state.seed ^ COMBAT_RESOLVE_RNG_SALT) >>> 0;
  for (const id of participantIds) {
    for (let i = 0; i < id.length; i++) {
      mix = (Math.imul(mix, 0x01000193) ^ id.charCodeAt(i)) >>> 0; // FNV-style, deterministic
    }
  }
  return seedToCursor(mix);
}

/** Opt-in flag (?autoresolve=1) — the future realtime-wiring PR gates the resolver's ENTRY behind this
 * (this PR ships the resolver pure + unwired). Default OFF, mirrors copsRequested/combatRequested. Pure:
 * takes the query string, never reads window (the sim stays DOM-free). */
export function autoResolveRequested(search: string): boolean {
  if (!search) return false;
  try {
    return new URLSearchParams(search).get('autoresolve') === '1';
  } catch {
    return false;
  }
}

/** A deep-enough clone of a unit for the scratch fight: primitives copy by value, and the two nested
 * objects the exchange/movement touch (pos, path) are copied so the caller's unit is never mutated. */
function cloneUnit(u: MovableUnit): MovableUnit {
  return { ...u, pos: { gx: u.pos.gx, gy: u.pos.gy }, path: u.path.map((p) => ({ gx: p.gx, gy: p.gy })) };
}

function dist(a: GridPos, b: GridPos): number {
  return Math.hypot(a.gx - b.gx, a.gy - b.gy);
}

/** The nearest hostile FIGHTER to `u` among `units` (mirrors combat.hostile: factioned, non-collector,
 * not-downed, different family). Deterministic array-order tie-break. Used only to steer CLOSING — the
 * SWING target is chosen by the production exchange (enemyInRange), so damage stays byte-identical. */
function nearestEnemy(u: MovableUnit, units: readonly MovableUnit[]): MovableUnit | undefined {
  let best: MovableUnit | undefined;
  let bestD = Infinity;
  for (const o of units) {
    if (o === u || !hostile(u, o)) continue;
    const d = dist(u.pos, o.pos);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

/** Whether ANY hostile fighter sits within `u`'s weapon reach right now (⇒ it will swing this step; no
 * need to close). */
function hasEnemyInReach(u: MovableUnit, units: readonly MovableUnit[]): boolean {
  const reach = engageRange(u);
  for (const o of units) {
    if (o === u || !hostile(u, o)) continue;
    if (dist(u.pos, o.pos) <= reach) return true;
  }
  return false;
}

/** Step `u` toward `target` by up to its speed·dt, stopping when it lands inside weapon reach. Pure
 * straight-line closing — the off-screen abstraction of "walk into melee" (no pathfinding: off-screen
 * geometry/obstacles don't shape the abstract outcome). Mutates the clone's pos only. */
function closeToward(u: MovableUnit, target: MovableUnit, dt: number): void {
  const d = dist(u.pos, target.pos);
  const reach = engageRange(u);
  if (d <= reach) return;
  const speed = u.speed > 0 ? u.speed : MOVE_SPEED;
  const stepLen = Math.min(speed * dt, d - reach * 0.5); // land just inside reach, never overshoot the foe
  if (stepLen <= 0) return;
  const ux = (target.pos.gx - u.pos.gx) / d;
  const uy = (target.pos.gy - u.pos.gy) / d;
  u.pos = { gx: u.pos.gx + ux * stepLen, gy: u.pos.gy + uy * stepLen };
}

/** Step `u` directly away from the centroid of `threats` by speed·dt (exact-overlap breaks east — a fixed
 * convention, no roll). Mutates the clone's pos only. */
function fleeFrom(u: MovableUnit, threats: readonly MovableUnit[], dt: number): void {
  let cx = 0;
  let cy = 0;
  for (const t of threats) { cx += t.pos.gx; cy += t.pos.gy; }
  cx /= threats.length;
  cy /= threats.length;
  let dx = u.pos.gx - cx;
  let dy = u.pos.gy - cy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) { dx = 1; dy = 0; } else { dx /= len; dy /= len; }
  const speed = u.speed > 0 ? u.speed : MOVE_SPEED;
  u.pos = { gx: u.pos.gx + dx * speed * dt, gy: u.pos.gy + dy * speed * dt };
}

/** The live enemy fighters of `u` currently in the scratch fight. */
function enemiesOf(u: MovableUnit, units: readonly MovableUnit[]): MovableUnit[] {
  return units.filter((o) => o !== u && hostile(u, o));
}

/** Distinct family ids among the combatant (isCombatant) units. */
function combatantFactions(units: readonly MovableUnit[]): string[] {
  const out: string[] = [];
  for (const u of units) {
    if (isCombatant(u) && u.factionId && !out.includes(u.factionId)) out.push(u.factionId);
  }
  return out;
}

/**
 * Headlessly resolve the engagement among `participantIds` (a subset of state.units, by id). Runs the
 * EXISTING combat rules (via resolveProximityCombat, unmodified) plus a straight-line movement layer that
 * consumes PR A's stances — a FOCUS_FIRE unit closes on its designated mark; a DISENGAGE unit breaks off
 * and, once clear of every enemy, ESCAPES the fight as a fled survivor. Deterministic; PURE (the passed
 * state and its units are never mutated).
 *
 * Outcome: `decisive` (one faction still holds the field), `draw` (mutual wipe), `disengaged` (nobody held
 * the field but someone escaped), or `timeout` (≥2 factions still fighting at the tick cap).
 */
export function resolveEngagement(
  state: GameState,
  participantIds: readonly string[],
  opts: ResolveOptions = {},
): ResolveResult {
  const dt = opts.dt && opts.dt > 0 ? opts.dt : RESOLVE_DT;
  const maxTicks = opts.maxTicks && opts.maxTicks > 0 ? opts.maxTicks : RESOLVE_MAX_TICKS;
  const logCap = opts.logCap && opts.logCap >= 0 ? opts.logCap : RESOLVE_LOG_CAP;
  const orders: CombatOrders | undefined = state.combatOrders;

  // Gather the participants (dedupe ids; skip missing) and CLONE them — the fight never touches the caller's
  // units. Order follows state.units so ties resolve exactly as the live game would.
  const wanted = new Set(participantIds);
  const fightUnits: MovableUnit[] = [];
  const seen = new Set<string>();
  for (const u of state.units) {
    if (wanted.has(u.id) && !seen.has(u.id)) { seen.add(u.id); fightUnits.push(cloneUnit(u)); }
  }

  // Optional initiative jitter — a resolver-LOCAL cursor only (never state.rngState). Default off ⇒ no draw.
  if (opts.initiativeJitter) {
    const rng = new Rng(opts.seed ?? combatResolveSeed(state, participantIds));
    for (const u of fightUnits) {
      if (isCombatant(u)) u.attackCd = (u.attackCd ?? 0) + rng.nextFloat() * INITIATIVE_JITTER_MAX;
    }
  }

  // The scratch GameState: a spread copy (player/tick read-only) with OUR units and a THROWAWAY log, so
  // resolveProximityCombat's mutations (unit health/downed, the units filter, its down-log push) land only
  // here — state.units / state.log / state.rngState are all untouched.
  const scratch: GameState = { ...state, units: fightUnits, log: [] };

  const tickLog: ResolveBeat[] = [];
  let logTruncated = false;
  const casualties: string[] = [];
  const fledUnits: MovableUnit[] = []; // keep the objects — their factionId feeds survivor accounting
  let steps = 0;                       // completed exchange rounds (the reported durationTicks)
  let reachedCap = false;

  const recordBeat = (ev: CombatEvent, tick: number): void => {
    if (tickLog.length < logCap) {
      tickLog.push({ tick, attackerId: ev.attackerId, targetId: ev.unitId, faction: ev.faction, kind: ev.kind, gx: ev.gx, gy: ev.gy });
    } else {
      logTruncated = true;
    }
  };

  for (let t = 0; ; t++) {
    // Fight continues only while ≥2 families still have live fighters ON the field.
    if (combatantFactions(scratch.units).length < 2) break;
    if (t >= maxTicks) { reachedCap = true; break; }

    // ── MOVEMENT layer (consumes PR A stances): close to melee, or break off on DISENGAGE ──
    // Phase 1 — ESCAPES, decided from START-OF-STEP positions and applied together. Deciding on frozen
    // positions (not the mutating roster) makes symmetric breakoffs resolve on the SAME step, so a mutual
    // disengage ends 'disengaged' rather than crowning whichever unit the array happened to list last.
    const escaping: MovableUnit[] = [];
    for (const u of scratch.units) {
      if (!isCombatant(u) || orders?.[u.id]?.stance !== 'DISENGAGE') continue;
      const enemies = enemiesOf(u, scratch.units);
      if (enemies.length === 0) continue; // nothing to break from — it just stands (a victor-side survivor)
      const nearest = enemies.reduce((m, e) => Math.min(m, dist(u.pos, e.pos)), Infinity);
      if (nearest > COMBAT_SEEK_RANGE) escaping.push(u); // already clear of every enemy — it's gone
    }
    if (escaping.length > 0) {
      for (const u of escaping) fledUnits.push(u);
      scratch.units = scratch.units.filter((u) => !escaping.includes(u));
      if (combatantFactions(scratch.units).length < 2) break; // the breakoff can end the fight
    }

    // Phase 2 — MOVES: still-fleeing units back away; engaging units with nothing in reach close on their
    // chosen mark (FOCUS_FIRE designation if that mark is still in the fight, else the nearest enemy).
    for (const u of scratch.units.slice()) {
      if (!isCombatant(u)) continue;
      const enemies = enemiesOf(u, scratch.units);
      if (enemies.length === 0) continue;
      const order = orders?.[u.id];
      if (order?.stance === 'DISENGAGE') { fleeFrom(u, enemies, dt); continue; }
      if (hasEnemyInReach(u, scratch.units)) continue; // in reach ⇒ it swings this step (no need to close)
      let target: MovableUnit | undefined;
      if (order?.stance === 'FOCUS_FIRE' && order.targetId) {
        const mark = scratch.units.find((x) => x.id === order.targetId);
        if (mark && hostile(u, mark)) target = mark;
      }
      if (!target) target = nearestEnemy(u, scratch.units);
      if (target) closeToward(u, target, dt);
    }

    // ── EXCHANGE (the production rule, UNMODIFIED — exact damage/caps/tie-breaks) ──
    const events = resolveProximityCombat(scratch, dt);
    for (const ev of events) {
      recordBeat(ev, t);
      if (ev.kind === 'down') casualties.push(ev.unitId);
    }
    steps += 1;
  }

  // ── OUTCOME ──
  // engaged = families still standing ON the field; survivorFactions also counts those that FLED (a runner
  // is a survivor of its family even though it no longer holds the ground).
  const engaged = combatantFactions(scratch.units);
  const survivorFactions = [...engaged];
  for (const u of fledUnits) if (u.factionId && !survivorFactions.includes(u.factionId)) survivorFactions.push(u.factionId);
  const fledIds = fledUnits.map((u) => u.id);
  const survivors = [...scratch.units.filter((u) => isCombatant(u)).map((u) => u.id), ...fledIds];

  let outcome: EngagementOutcome;
  if (reachedCap && engaged.length >= 2) {
    outcome = { kind: 'timeout' };                          // stalemate — still ≥2 factions fighting at the cap
  } else if (survivorFactions.length === 1) {
    outcome = { kind: 'decisive', victorFactionId: survivorFactions[0] }; // sole surviving family (held OR fled)
  } else if (survivorFactions.length === 0) {
    outcome = { kind: 'draw' };                             // mutual wipe (or an empty/degenerate engagement)
  } else if (engaged.length === 1) {
    outcome = { kind: 'decisive', victorFactionId: engaged[0] }; // one family holds the field; the rest only fled
  } else {
    outcome = { kind: 'disengaged' };                       // ≥2 families survive, none holds the field (all broke off)
  }

  return { outcome, casualties, survivors, fled: fledIds, durationTicks: steps, tickLog, logTruncated };
}
