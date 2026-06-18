// Dual economy (S1): the clean/dirty cash ledger and laundering. Pure & deterministic —
// no Phaser, no RNG. Crime income is classed dirty; clean cash is the safe remainder.
//
// Invariant maintained by clampDirty: 0 ≤ family.dirtyCash ≤ family.cash. Clean cash is
// always the derived remainder, so it never needs its own field.

import {
  DIRTY_CASH_HEAT_DIVISOR,
  DIRTY_HEAT_MAX_PER_TICK,
  LAUNDER_CAP_PER_FRONT,
  LAUNDER_FEE_RATE,
} from './constants';
import { allBusinesses } from './economy';
import type { Family, GameState } from './types';

/** The safe (laundered) portion of a family's wealth: cash minus the dirty portion. */
export function cleanCash(family: Family): number {
  return Math.max(0, family.cash - family.dirtyCash);
}

/** Re-establish the ledger invariant 0 ≤ dirtyCash ≤ cash after any cash mutation. */
export function clampDirty(family: Family): void {
  const cap = Math.max(0, family.cash);
  family.dirtyCash = Math.max(0, Math.min(family.dirtyCash, cap));
}

/**
 * Credit crime income: it lands as cash AND is classed dirty (so clean is unchanged).
 * Used by collection (Phase 12). The tick economy credits dirty inline to avoid double
 * crediting cash, but the behaviour is identical to this helper.
 */
export function creditCrimeIncome(family: Family, amount: number): void {
  if (amount <= 0) return;
  family.cash += amount;
  family.dirtyCash += amount;
  clampDirty(family);
}

/** Per-tick heat radiated by a standing hoard of dirty cash: floor(dirty / divisor), capped. */
export function heatFromDirty(dirtyCash: number): number {
  if (dirtyCash <= 0) return 0;
  return Math.min(DIRTY_HEAT_MAX_PER_TICK, Math.floor(dirtyCash / DIRTY_CASH_HEAT_DIVISOR));
}

/** Fee (in cash) to launder `amount` of dirty money clean. */
export function launderFee(amount: number): number {
  if (amount <= 0) return 0;
  return Math.floor(amount * LAUNDER_FEE_RATE);
}

/**
 * How much dirty cash a family can launder, set by the legitimate fronts it controls
 * (extorts): each extorted front provides LAUNDER_CAP_PER_FRONT of capacity.
 */
export function launderCapacity(state: GameState, familyId: string): number {
  let fronts = 0;
  for (const b of allBusinesses(state)) {
    if (b.kind === 'front' && b.extortedBy === familyId) fronts++;
  }
  return fronts * LAUNDER_CAP_PER_FRONT;
}
