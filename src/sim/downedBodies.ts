// COMBAT READABILITY — downed-body PERSISTENCE (pure; Phaser-free). ⚠ SIM-ADJACENT (unit lifecycle): the
// 35a combat resolver removes a downed unit from play the instant it falls (resolveProximityCombat filters
// !downed). That resolver is UNCHANGED — instead this lightweight lifecycle runs in the real-time WRAPPER
// (realtime.update): on a `down` beat it captures a BODY from the combat event, ages it each step, and culls
// it after a few seconds. The scene renders the body DESATURATED (canon: downed = desaturated, never
// rival-red) so a kill reads as a body settling, not a unit vanishing.

import type { CombatEvent } from './combat';

/**
 * One casualty lifecycle at normal speed: ~0.5s fall/contact, a readable body, then a short fade.
 * The hard cull at six seconds leaves a little margin under the 6.5s presentation budget.
 */
export const DOWNED_BODY_CONTACT_SECONDS = 0.5;
export const DOWNED_BODY_FADE_START_SECONDS = 4.5;
export const DOWNED_BODY_PERSIST_SECONDS = 6;
/** Hard population cap so a large street fight cannot pin an unbounded corpse layer or save payload. */
export const MAX_DOWNED_BODIES = 12;

export interface DownedBody {
  /** The downed unit's id. */
  id: string;
  /** The downed unit's family — for the DESATURATED faction read (the renderer mutes it; never rival-red). */
  factionId: string;
  gx: number;
  gy: number;
  /** Seconds since the unit went down. */
  ageSec: number;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Capture a downed unit as a persistent BODY from its `down` combat event. Ignores non-down events and
 * dedupes by id (a unit downs once). Pure — returns a new list. */
export function recordDownedBody(bodies: readonly DownedBody[], ev: CombatEvent): DownedBody[] {
  if (ev.kind !== 'down' || bodies.some((b) => b.id === ev.unitId)) return [...bodies];
  const next = [...bodies, { id: ev.unitId, factionId: ev.faction, gx: ev.gx, gy: ev.gy, ageSec: 0 }];
  return next.slice(-MAX_DOWNED_BODIES);
}

/** Age every body by `dt` and CULL any past the persist window. Pure — returns the survivors. */
export function advanceDownedBodies(
  bodies: readonly DownedBody[],
  dt: number,
  persistSec: number = DOWNED_BODY_PERSIST_SECONDS,
): DownedBody[] {
  if (bodies.length === 0) return [];
  const out: DownedBody[] = [];
  // Old saves may predate the cap. Keep the newest bodies and normalize them on the first active step.
  for (const b of bodies.slice(-MAX_DOWNED_BODIES)) {
    const ageSec = b.ageSec + Math.max(0, dt);
    if (ageSec < persistSec) out.push({ ...b, ageSec });
  }
  return out;
}

/** A body's 0..1 fall progress. The render uses this to rotate/squash the hurt pose onto the street. */
export function downedBodyFallProgress(
  b: DownedBody,
  contactSec: number = DOWNED_BODY_CONTACT_SECONDS,
): number {
  return clamp01(b.ageSec / Math.max(0.001, contactSec));
}

/** The hurt atlas stops at contact (or while globally paused) so the corpse never loops/writhes. */
export function downedBodyMotionPaused(b: DownedBody, globallyPaused: boolean): boolean {
  return globallyPaused || downedBodyFallProgress(b) >= 1;
}

/**
 * A body's 0..1 decay progress. It stays fully readable through the linger, then fades only near cleanup;
 * this replaces the old six-second-long ghost fade that made casualties look like standing figures.
 */
export function downedBodyDecay(
  b: DownedBody,
  persistSec: number = DOWNED_BODY_PERSIST_SECONDS,
  fadeStartSec: number = Math.min(DOWNED_BODY_FADE_START_SECONDS, persistSec),
): number {
  if (b.ageSec <= fadeStartSec) return 0;
  return clamp01((b.ageSec - fadeStartSec) / Math.max(0.001, persistSec - fadeStartSec));
}

/** Stable screen-space fall direction: the long body axis ends on one of the two isometric diagonals. */
export function downedBodyAngleDeg(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 2 === 0 ? -64 : 64;
}
