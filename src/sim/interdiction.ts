// RTS-22 — the right-click business interaction (EXTORT / ATTACK). Pure & deterministic; imports
// NO Phaser. On a business you do NOT already extort, the only two moves are EXTORT (begin taking
// protection — the existing extort command) and ATTACK (temporarily SHUT IT DOWN so it stops
// producing). ATTACK is dumb on your own turf; the point is to interdict a neighbouring RIVAL's
// economy. The economic settlement (tick) is untouched — a shut business simply accrues nothing
// (businessAccrual returns 0 while shutdownTicks > 0); this module only sets that flag + heat.

import { ATTACK_HEAT, ATTACK_MIN_CREW, ATTACK_SHUTDOWN_WEEKS, EXTORT_MIN_CONTROL, HEAT_MAX } from './constants';
import { findBusiness } from './commands';
import { businessEarner, isShutDown } from './economy';
import { controlOf } from './territory';
import { clampDirty } from './laundering';
import { findFamily, type Business, type Family, type GameState } from './types';

export interface ActionGate { ok: boolean; reason: string; }
function gate(ok: boolean, reason: string): ActionGate { return { ok, reason }; }

export interface BusinessActions {
  business: Business;
  /** EXTORT — begin protection (only a front you don't already extort, with the control foothold). */
  extort: ActionGate;
  /** ATTACK — temporarily shut it down (only a producing business that isn't yours). */
  attack: ActionGate;
  /** Who currently earns from it (for the right-click readout): 'player' | rival id | undefined. */
  earner: string | undefined;
}

/**
 * What `familyId` can do to the business at `businessId` right now (drives the right-click menu).
 * On a business you don't extort, the two options are EXTORT and ATTACK. Pure read.
 */
export function businessActions(state: GameState, businessId: string, familyId: string): BusinessActions | null {
  const found = findBusiness(state, businessId);
  if (!found) return null;
  const { business: b, district: d } = found;
  const earner = businessEarner(b);
  const mine = earner === familyId;

  // EXTORT: a front you don't already run, where you clear the control foothold.
  let extort: ActionGate;
  if (b.kind !== 'front') extort = gate(false, 'not a front');
  else if (mine) extort = gate(false, 'already yours');
  else if (controlOf(d, familyId) < EXTORT_MIN_CONTROL) extort = gate(false, `need ${EXTORT_MIN_CONTROL} control here`);
  else extort = gate(true, earner ? 'muscle it off the rival' : 'shake it down');

  // ATTACK: shut down a producing business that isn't yours (the point is a rival's racket).
  let attack: ActionGate;
  if (mine) attack = gate(false, "don't hit your own");
  else if (state.player.id === familyId && state.player.gangsters.length < ATTACK_MIN_CREW) attack = gate(false, 'need a thug');
  else if (isShutDown(b)) attack = gate(false, 'already shut');
  else attack = gate(true, earner ? `shut the rival's racket for ${ATTACK_SHUTDOWN_WEEKS}wk` : `shut it down for ${ATTACK_SHUTDOWN_WEEKS}wk`);

  return { business: b, extort, attack, earner };
}

export interface AttackResult { ok: boolean; reason: string; weeks?: number; }

/**
 * ATTACK a business: shut it down for ATTACK_SHUTDOWN_WEEKS (it accrues nothing while shut),
 * scatter its pending takings, and draw heat on the attacker. Pure (mutates state). No cash cost.
 */
export function resolveAttack(state: GameState, businessId: string, actorFamilyId: string): AttackResult {
  const g = businessActions(state, businessId, actorFamilyId)?.attack;
  if (!g) return { ok: false, reason: 'no such business' };
  if (!g.ok) return { ok: false, reason: g.reason };
  const found = findBusiness(state, businessId)!;
  const { business: b } = found;
  const actor = findFamily(state, actorFamilyId);
  const victimId = businessEarner(b);
  const victim = victimId ? findFamily(state, victimId) : undefined;

  b.shutdownTicks = ATTACK_SHUTDOWN_WEEKS;
  b.uncollected = 0; // its pending takings scatter in the raid on the storefront
  if (actor) { actor.heat = Math.min(HEAT_MAX, actor.heat + ATTACK_HEAT); clampDirty(actor); }

  state.log.push({
    tick: state.tick,
    kind: 'attack',
    message: `${actor?.name ?? actorFamilyId} shut down ${victim ? `${victim.name}'s ` : ''}${b.name} for ${ATTACK_SHUTDOWN_WEEKS} weeks`,
    data: { businessId, actor: actorFamilyId, victim: victimId, weeks: ATTACK_SHUTDOWN_WEEKS },
  });
  return { ok: true, reason: 'ok', weeks: ATTACK_SHUTDOWN_WEEKS };
}

/** Every business a family currently earns from, in district order — the candidate route stops /
 * "your protection network" read (RTS-22). Pure. */
export function earningBusinesses(state: GameState, familyId: string): Business[] {
  const out: Business[] = [];
  for (const d of state.districts) for (const b of d.businesses) if (businessEarner(b) === familyId) out.push(b);
  return out;
}

/** Convenience: a family considered for an attack action (used by the scene/AI). */
export function canAttack(state: GameState, businessId: string, familyId: string): ActionGate {
  return businessActions(state, businessId, familyId)?.attack ?? gate(false, 'no such business');
}

export type { Family };
