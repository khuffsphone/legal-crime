// RTS-35b — EMBODIED EXTORTION (CANON REV c). Pure & deterministic; imports NO Phaser. ⚠ CANON CHANGE:
// extort DELIVERY becomes positional — you can no longer convert a front from across the map. A selected
// thug is ordered to MOVE-AND-SHAKEDOWN: it paths to the front, squares up at the door, performs a TIMED
// shakedown while physically present, and the front converts to PAYING on completion. The CONVERSION
// outcome, ELIGIBILITY, and ECONOMY are UNCHANGED — on resolve the wrapper invokes the EXISTING
// recordExtortVisit conversion path (it is NOT duplicated here). This module is only the interaction
// STATE MACHINE; it raises `convert` once and lets the wrapper do the (existing) deed.
//
// Settles AROUND the tick: the real-time wrapper drives advanceEmbodiedExtortion each step. tick() and
// applyCommand() are untouched (the move-and-shakedown order goes through applyCommandWithEmbodiedExtortion).

import {
  EXTORT_ABSENCE_GRACE_SECONDS, EXTORT_APPROACH_TIMEOUT_SECONDS, EXTORT_AT_FRONT_RADIUS,
  EXTORT_ENGAGE_SECONDS, EXTORT_INTERRUPT_GRACE_SECONDS, EXTORT_SHAKEDOWN_SECONDS, EXTORT_VISITS_BASE,
  HARD_INTERRUPT_PROGRESS_RETAINED_RATIO, RETAKE_GUARD_RADIUS,
} from './constants';
import { findBusiness } from './commands';
import { extortProgress, extortResistance, recordExtortVisit } from './extortion';
import { enemyInRange, isCombatant } from './combat';
import type { GameState } from './types';
import type { MovableUnit } from './movement';
import type { GridPos } from './iso';

// ── states ───────────────────────────────────────────────────────────────────────────────────────
// approach  : thug paths to the front's interaction point (NOT at the building yet)
// engage    : thug has arrived at the door — a brief squaring-up beat
// shakedown : the timed lean-on-them; progress accrues ONLY while present; pauses on brief absence
// resolve   : progress complete → raise `convert` ONCE → terminal success (the wrapper converts the front)
// interrupted: knocked off the shakedown by an attack — recoverable within grace (progress reset, ratio 0)
// failed    : terminal failure (no conversion): downed / target gone / cancelled / long absence / lost the grace
export type EmbodiedExtortionState = 'approach' | 'engage' | 'shakedown' | 'resolve' | 'interrupted' | 'failed';

export interface EmbodiedExtortionAct {
  id: string;
  thugId: string;
  frontId: string;
  familyId: string;
  /** The front's interaction point (RTS-35b resolution 2: the building-center seed). */
  interaction: GridPos;
  state: EmbodiedExtortionState;
  progress: number;      // 0..1 shakedown progress
  durationSec: number;   // full shakedown time (scaled by the front's resistance — richer blocks resist longer)
  engageT: number;       // seconds squaring up
  absenceT: number;      // seconds the thug has been briefly away mid-shakedown (pause budget)
  interruptT: number;    // seconds since an attack interrupt (recovery budget)
  approachT: number;     // seconds spent approaching (safety timeout)
  cancelRequested?: boolean;
}

/** The per-act snapshot the state machine reads each tick — built by the wrapper from live state. */
export interface ExtortionTickInput {
  present: boolean;      // the thug is AT the front (within EXTORT_AT_FRONT_RADIUS) and alive
  attacked: boolean;     // a hostile fighter is engaging the thug (reuses RTS-35a proximity combat) — a HARD interrupt
  targetValid: boolean;  // the front is still an eligible un-paying front
  thugAlive: boolean;    // the thug is still in play (not downed / removed)
  cancelled: boolean;    // the player cancelled the order
}

export interface ExtortionTickResult {
  act: EmbodiedExtortionAct;
  /** ⭐ Raised EXACTLY ONCE — on entering `resolve`. The wrapper invokes the EXISTING conversion path. */
  convert: boolean;
  transitioned: boolean;
  prevState: EmbodiedExtortionState;
}

// ── pure helpers ───────────────────────────────────────────────────────────────────────────────
/** The interaction point for a front — derived from its building/tile world position; the building
 * CENTER is the seed (resolution 2). A data point, not a mechanic. Pure. */
export function frontInteractionPoint(tile: GridPos): GridPos {
  return { gx: tile.gx, gy: tile.gy };
}

/** Whether `thug` is AT the front (within radius of the interaction point) — the positional gate. Pure. */
export function isAtFront(thug: GridPos, interaction: GridPos, radius: number = EXTORT_AT_FRONT_RADIUS): boolean {
  return Math.hypot(thug.gx - interaction.gx, thug.gy - interaction.gy) <= radius;
}

/** Whether the thug is PRESENT for the shakedown: at the front, alive, and the target still valid. The
 * shakedown only advances while this holds (the "no extorting from a distance" rule). Pure. */
export function isPresentForShakedown(input: ExtortionTickInput): boolean {
  return input.present && input.thugAlive && input.targetValid;
}

// ── RTS-35d — RETAKING RIVAL-HELD FRONTS ────────────────────────────────────────────────────────
/** A front HELD by a RIVAL (extortedBy set to a non-player family) — the retake candidate. A front you
 * already run, or an un-taken one, is NOT rival-held. Pure read. */
export function isRivalHeldFront(state: GameState, frontId: string): boolean {
  const b = findBusiness(state, frontId)?.business;
  return !!b && b.kind === 'front' && b.extortedBy !== undefined && b.extortedBy !== state.player.id;
}

/** The rival GUARD watching a front: the nearest LIVE rival combatant (non-collector, not downed, not the
 * player's) within `radius` of the front's tile. undefined ⇒ the guard is CLEARED (the front is open to a
 * retake). Reuses the 35a combatant definition (isCombatant) — no new combat. Pure read. */
export function frontGuard(
  state: GameState, frontTile: GridPos, radius: number = RETAKE_GUARD_RADIUS,
): MovableUnit | undefined {
  let best: MovableUnit | undefined;
  let bestD = radius + 1e-9;
  for (const u of state.units) {
    if (!isCombatant(u) || u.factionId === state.player.id) continue; // a live hostile (rival) fighter
    const d = Math.hypot(u.pos.gx - frontTile.gx, u.pos.gy - frontTile.gy);
    if (d <= radius && d < bestD) { bestD = d; best = u; }
  }
  return best;
}

/** RETAKE eligibility: a RIVAL-HELD front whose GUARD has been CLEARED is re-extortable — you muscle it
 * back through the existing embodied shakedown. Needs the front's tile (the guard check is spatial); the
 * scene/act supplies it (the act carries `interaction`). Pure read. */
export function isRetakeableFront(state: GameState, frontId: string, frontTile: GridPos): boolean {
  return isRivalHeldFront(state, frontId) && !frontGuard(state, frontTile);
}

function toInterrupted(act: EmbodiedExtortionAct): void {
  act.state = 'interrupted';
  act.progress *= HARD_INTERRUPT_PROGRESS_RETAINED_RATIO; // 0 ⇒ full reset on a hard interrupt
  act.interruptT = 0;
}

/**
 * Advance one extortion act by `dt` seconds against its tick input. The CORE state machine: approach →
 * engage → shakedown → resolve, with the interrupt/fail branches. Raises `convert` once on entering
 * resolve. Pure (mutates the act); never touches the economy — the wrapper does the (existing) deed.
 */
export function tickEmbodiedExtortionAct(act: EmbodiedExtortionAct, input: ExtortionTickInput, dt: number): ExtortionTickResult {
  const prev = act.state;
  let convert = false;
  if (act.state === 'resolve' || act.state === 'failed') return { act, convert, transitioned: false, prevState: prev };

  // global HARD fails (from any active state) — downed/gone, target lost, or cancelled. No conversion.
  if (!input.thugAlive || !input.targetValid || input.cancelled) {
    act.state = 'failed';
    return { act, convert, transitioned: true, prevState: prev };
  }

  switch (act.state) {
    case 'approach': {
      act.approachT += dt;
      if (input.attacked) toInterrupted(act);
      else if (input.present) { act.state = 'engage'; act.engageT = 0; }
      else if (act.approachT >= EXTORT_APPROACH_TIMEOUT_SECONDS) act.state = 'failed';
      break;
    }
    case 'engage': {
      if (input.attacked) { toInterrupted(act); break; }
      if (!input.present) { act.state = 'approach'; break; } // stepped off the spot → re-path
      act.engageT += dt;
      if (act.engageT >= EXTORT_ENGAGE_SECONDS) { act.state = 'shakedown'; act.progress = 0; act.absenceT = 0; }
      break;
    }
    case 'shakedown': {
      if (input.attacked) { toInterrupted(act); break; }              // HARD interrupt → reset (ratio 0)
      if (isPresentForShakedown(input)) {
        act.absenceT = 0;
        act.progress = Math.min(1, act.progress + dt / Math.max(1e-4, act.durationSec)); // advances ONLY while present
        if (act.progress >= 1) { act.state = 'resolve'; convert = true; }                // ⭐ convert ONCE
      } else {
        act.absenceT += dt;                                           // brief absence PAUSES (progress frozen)
        if (act.absenceT >= EXTORT_ABSENCE_GRACE_SECONDS) act.state = 'failed'; // long absence FAILS
      }
      break;
    }
    case 'interrupted': {
      act.interruptT += dt;
      if (input.attacked) {
        if (act.interruptT >= EXTORT_INTERRUPT_GRACE_SECONDS) act.state = 'failed';
      } else if (act.interruptT >= EXTORT_INTERRUPT_GRACE_SECONDS) {
        act.state = 'failed';                                         // grace ran out before the fight cleared
      } else {
        act.state = input.present ? 'engage' : 'approach';           // recovered — re-engage (progress reset)
        act.engageT = 0;
      }
      break;
    }
  }
  return { act, convert, transitioned: act.state !== prev, prevState: prev };
}

// ── the command model ─────────────────────────────────────────────────────────────────────────
export interface MoveAndShakedownCommand {
  type: 'moveAndShakedown';
  familyId: string;
  thugId: string;
  frontId: string;
}

/** Whether a MOVE-AND-SHAKEDOWN order is legal: the thug is a live, non-collector unit of the family, and
 * the front is ELIGIBLE. Eligible = an un-taken front (the 35b case) OR — when `frontTile` is supplied
 * (RTS-35d) — a RIVAL-HELD front whose guard has been CLEARED (retake). A rival-held front that is still
 * GUARDED is rejected with a "clear the guard first" reason. Pure read. */
export function canIssueMoveAndShakedown(
  state: GameState, thugId: string, frontId: string, frontTile?: GridPos,
): { ok: boolean; reason: string } {
  const thug = state.units.find((u) => u.id === thugId);
  if (!thug || thug.role === 'collector' || thug.downed) return { ok: false, reason: 'no free muscle — pick a thug, or recruit [6]' };
  const prog = extortProgress(state, frontId);
  if (prog?.extortable) return { ok: true, reason: 'ready' };                       // un-taken front (35b)
  // RTS-35d — retake: a rival-held front is re-extortable once its guard is cleared.
  if (frontTile && isRivalHeldFront(state, frontId)) {
    return frontGuard(state, frontTile)
      ? { ok: false, reason: 'a rival is guarding this block — clear them out, then shake it back' }
      : { ok: true, reason: 'muscle it back off the rival' };
  }
  if (!prog) return { ok: false, reason: 'no such block' };
  return { ok: false, reason: 'that block already pays — pick an un-shaken [%] front' };
}

/** Create the act for a move-and-shakedown (state `approach`). The shakedown duration scales with the
 * front's RESISTANCE (a richer block takes a longer shakedown — the old "more visits" pacing, embodied as
 * TIME). The caller (scene) issues the actual MOVE toward `interaction`. Pure. */
export function createMoveAndShakedownAct(
  state: GameState, thugId: string, frontId: string, familyId: string, interaction: GridPos,
): EmbodiedExtortionAct {
  const found = findBusiness(state, frontId);
  const resistance = found ? extortResistance(found.business, found.district) : EXTORT_VISITS_BASE;
  const durationSec = EXTORT_SHAKEDOWN_SECONDS * Math.max(1, resistance / EXTORT_VISITS_BASE);
  return {
    id: `xact-${thugId}-${frontId}`, thugId, frontId, familyId, interaction,
    state: 'approach', progress: 0, durationSec,
    engageT: 0, absenceT: 0, interruptT: 0, approachT: 0,
  };
}

// ── the WRAPPER integration (tick/applyCommand untouched) ────────────────────────────────────────
export interface EmbodiedExtortionEvent {
  actId: string; thugId: string; frontId: string;
  state: EmbodiedExtortionState; prevState: EmbodiedExtortionState;
  progress: number;
  converted: boolean;   // the front just converted (the EXISTING path fired this tick)
  retook: boolean;      // RTS-35d — the conversion MUSCLED a rival-held front back (ownership flipped rival→player)
  failed: boolean;
}

/** Build an act's tick input from live state: present (positional gate), attacked (RTS-35a combat),
 * target validity (eligibility unchanged), thug alive, cancel. Pure. */
function buildInput(state: GameState, act: EmbodiedExtortionAct): ExtortionTickInput {
  const thug = state.units.find((u) => u.id === act.thugId);
  const thugAlive = !!thug && !thug.downed;
  const present = thugAlive ? isAtFront(thug.pos, act.interaction) : false;
  const attacked = thugAlive && thug ? !!enemyInRange(thug, state.units) : false;
  const prog = extortProgress(state, act.frontId);
  // RTS-35d — the target stays valid for an un-taken front OR a guard-cleared rival-held one (retake). If a
  // rival GUARD walks back onto a retake mid-shakedown, this falls false and the act hard-fails (the block
  // is contested again) — reusing the existing target-lost fail branch, no new logic.
  const targetValid = !!prog?.extortable || isRetakeableFront(state, act.frontId, act.interaction);
  return { present, attacked, targetValid, thugAlive, cancelled: !!act.cancelRequested };
}

/**
 * RTS-35b — drive every active extortion act by `dt`. On a `convert` (a shakedown completed), invoke the
 * EXISTING front-conversion path (recordExtortVisit until it folds — NOT duplicated). Drops terminal acts
 * (resolve/failed). Returns the transitions for the render layer. The real-time wrapper calls this; the
 * economic tick is untouched. Pure (mutates state).
 */
export function advanceEmbodiedExtortion(state: GameState, dt: number): EmbodiedExtortionEvent[] {
  const acts = state.extortionActs;
  if (!acts || acts.length === 0 || !(dt > 0)) return [];
  const events: EmbodiedExtortionEvent[] = [];
  for (const act of acts) {
    const r = tickEmbodiedExtortionAct(act, buildInput(state, act), dt);
    let converted = false;
    let retook = false;
    if (r.convert) {
      // RTS-35d — a RETAKE: the front is rival-held. BREAK the rival's claim first (back to neutral) so the
      // EXISTING conversion path applies — ownership flips rival→player through recordExtortVisit, NOT a new
      // mechanic. (An un-taken front skips this and converts exactly as in 35b.)
      const found = findBusiness(state, act.frontId);
      if (found && isRivalHeldFront(state, act.frontId)) {
        found.business.extortedBy = undefined;   // rival claim broken — the block is up for grabs
        found.business.extortVisits = 0;          // reset the resistance counter for the fresh shakedown
        retook = true;
      }
      // INVOKE the existing conversion path — drive recordExtortVisit until the front folds (one shakedown
      // delivers the whole resistance; the visit math + the economy are the existing ones, not duplicated).
      let guard = 0;
      while (guard++ < 64) { const res = recordExtortVisit(state, act.familyId, act.frontId); if (res.converted || !res.ok) break; }
      converted = true;
    }
    if (r.transitioned || converted) {
      events.push({ actId: act.id, thugId: act.thugId, frontId: act.frontId, state: act.state, prevState: r.prevState, progress: act.progress, converted, retook, failed: act.state === 'failed' });
    }
  }
  state.extortionActs = acts.filter((a) => a.state !== 'resolve' && a.state !== 'failed');
  return events;
}

/**
 * The applyCommand WRAPPER (proves applyCommand is untouched): a MOVE-AND-SHAKEDOWN order creates the act
 * (the caller issues the move toward `interaction`); EVERY OTHER command delegates to the unchanged
 * applyCommand. Returns the created act for a shakedown order, else null.
 */
export function applyCommandWithEmbodiedExtortion(
  state: GameState,
  command: MoveAndShakedownCommand | { type: string },
  apply: (s: GameState, c: { type: string }) => void,
  interaction?: GridPos,
): EmbodiedExtortionAct | null {
  if (command.type === 'moveAndShakedown') {
    const c = command as MoveAndShakedownCommand;
    const gate = canIssueMoveAndShakedown(state, c.thugId, c.frontId);
    if (!gate.ok) return null;
    const act = createMoveAndShakedownAct(state, c.thugId, c.frontId, c.familyId, interaction ?? { gx: 0, gy: 0 });
    state.extortionActs = [...(state.extortionActs ?? []).filter((a) => a.thugId !== c.thugId), act];
    return act;
  }
  apply(state, command); // unchanged applyCommand for everything else
  return null;
}
