// COMBAT READABILITY — downed-body PERSISTENCE (pure; Phaser-free). ⚠ SIM-ADJACENT (unit lifecycle): the
// 35a combat resolver removes a downed unit from play the instant it falls (resolveProximityCombat filters
// !downed). That resolver is UNCHANGED — instead this lightweight lifecycle runs in the real-time WRAPPER
// (realtime.update): on a `down` beat it captures a BODY from the combat event, ages it each step, and culls
// it after a few seconds. The scene renders the body DESATURATED (canon: downed = desaturated, never
// rival-red) so a kill reads as a body settling, not a unit vanishing.

import type { CombatEvent } from './combat';

/** How long a downed body lingers before cleanup (seconds). */
export const DOWNED_BODY_PERSIST_SECONDS = 4;

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
  return [...bodies, { id: ev.unitId, factionId: ev.faction, gx: ev.gx, gy: ev.gy, ageSec: 0 }];
}

/** Age every body by `dt` and CULL any past the persist window. Pure — returns the survivors. */
export function advanceDownedBodies(
  bodies: readonly DownedBody[],
  dt: number,
  persistSec: number = DOWNED_BODY_PERSIST_SECONDS,
): DownedBody[] {
  if (bodies.length === 0) return [];
  const out: DownedBody[] = [];
  for (const b of bodies) {
    const ageSec = b.ageSec + Math.max(0, dt);
    if (ageSec < persistSec) out.push({ ...b, ageSec });
  }
  return out;
}

/** A body's 0..1 decay progress (the renderer fades the desaturated body out toward cleanup). Pure. */
export function downedBodyDecay(b: DownedBody, persistSec: number = DOWNED_BODY_PERSIST_SECONDS): number {
  return clamp01(b.ageSec / persistSec);
}
