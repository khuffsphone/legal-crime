// RTS-29 — EXTORT AS REPEATED VISITS. Pure & deterministic; imports NO Phaser. The reshape turns the
// one-roll shakedown into a paced one: a front RESISTS for N muscle visits (rich blocks resist more);
// each thug who walks there and leans on it drops the resistance a notch; empty it and the front
// CONVERTS to extorted ([%]→[$]) and its fixed collector route spawns. Cost = TIME + a thug occupied,
// NOT cash. This WRAPS the economy: it sets extortedBy + seeds uncollected; tick's settlement math is
// untouched (the converted front then accrues through the normal accrual).

import { EXTORT_VISITS_BASE, EXTORT_VISITS_PER_WEALTH } from './constants';
import { findBusiness } from './commands';
import type { Business, District, GameState } from './types';

/** Muscle visits needed to convert a front — base + extra for a wealthier block. Pure read. */
export function extortResistance(business: Business, district?: District): number {
  if (business.kind !== 'front') return 0;
  const wealth = district?.wealth ?? 1;
  return EXTORT_VISITS_BASE + Math.max(0, wealth - 1) * EXTORT_VISITS_PER_WEALTH;
}

export interface ExtortProgress {
  /** Whether this business can be extorted at all (an un-taken front). */
  extortable: boolean;
  visits: number;
  needed: number;
  remaining: number;
  converted: boolean;
}

/** A read of how far a front is toward converting (for the "needs 3 visits" RESISTANCE readout). */
export function extortProgress(state: GameState, businessId: string): ExtortProgress | null {
  const found = findBusiness(state, businessId);
  if (!found) return null;
  const b = found.business;
  const needed = extortResistance(b, found.district);
  const visits = b.extortVisits ?? 0;
  const converted = b.kind === 'front' && b.extortedBy !== undefined;
  return {
    extortable: b.kind === 'front' && b.extortedBy === undefined,
    visits, needed, remaining: Math.max(0, needed - visits), converted,
  };
}

export interface ExtortVisitResult {
  ok: boolean;
  converted: boolean;
  remaining: number;
  reason: string;
}

/**
 * Record one muscle VISIT to a front for `familyId`: drop its resistance a notch; when the visits
 * reach the resistance the front CONVERTS — extortedBy set, uncollected initialised, a Wire slip
 * logged. Pure (mutates state). The caller pays the cost in TIME (the walk) + a thug occupied.
 */
export function recordExtortVisit(state: GameState, familyId: string, businessId: string): ExtortVisitResult {
  const found = findBusiness(state, businessId);
  if (!found) return { ok: false, converted: false, remaining: 0, reason: 'no such business' };
  const b = found.business;
  if (b.kind !== 'front') return { ok: false, converted: false, remaining: 0, reason: 'not a front' };
  if (b.extortedBy !== undefined) return { ok: false, converted: false, remaining: 0, reason: 'already paying' };

  const needed = extortResistance(b, found.district);
  const visits = (b.extortVisits ?? 0) + 1;
  b.extortVisits = Math.min(needed, visits);

  if (visits >= needed) {
    b.extortedBy = familyId;
    b.uncollected = b.uncollected ?? 0;
    state.log.push({
      tick: state.tick,
      kind: 'extortion',
      message: `${b.name} folded — it pays protection now.`,
      data: { businessId, familyId },
    });
    return { ok: true, converted: true, remaining: 0, reason: 'converted' };
  }
  return { ok: true, converted: false, remaining: needed - visits, reason: 'leaned on them' };
}
