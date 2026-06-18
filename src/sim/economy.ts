// Economy calculations. Pure functions over state — no Phaser, no RNG needed here
// (income/expense math is fully deterministic given the state).

import { EXTORT_RATE } from './constants';
import { effectiveOperationIncome, tierMultiplier, tierOf } from './tiers';
import type { Business, District, Family, GameState } from './types';

/** Every business across every district. */
export function allBusinesses(state: GameState): Business[] {
  return state.districts.flatMap((d) => d.businesses);
}

/**
 * Effective per-tick heat an illegal operation generates, amplified by the district's
 * police presence: base * (1 + presence/100), rounded. Fronts generate no operation heat.
 */
export function operationHeat(business: Business, district: District): number {
  if (business.kind === 'front') return 0;
  const scaled = business.heatPerTick * tierMultiplier(tierOf(business));
  return Math.round(scaled * (1 + district.policePresence / 100));
}

/**
 * Per-tick income a single business yields to its earning family: a front pays the
 * extortion cut to its extorter; an operation pays its base income to its owner. Returns
 * 0 for a business with no earning family. (Phase 12: this is the per-business accrual
 * rate that piles up as `uncollected`.)
 */
export function businessAccrual(business: Business): number {
  if (business.kind === 'front') {
    return business.extortedBy ? Math.floor(business.baseIncome * EXTORT_RATE) : 0;
  }
  return business.ownerFamily ? effectiveOperationIncome(business) : 0;
}

/** The family that earns from a business: its extorter (front) or owner (operation). */
export function businessEarner(business: Business): string | undefined {
  return business.kind === 'front' ? business.extortedBy : business.ownerFamily;
}

/** Per-tick income a family earns from fronts it is currently extorting. */
export function extortionIncome(state: GameState, familyId: string): number {
  let total = 0;
  for (const b of allBusinesses(state)) {
    if (b.kind === 'front' && b.extortedBy === familyId) {
      total += Math.floor(b.baseIncome * EXTORT_RATE);
    }
  }
  return total;
}

/** Per-tick income a family earns from illegal operations it owns. */
export function operationIncome(state: GameState, familyId: string): number {
  let total = 0;
  for (const b of allBusinesses(state)) {
    if (b.kind !== 'front' && b.ownerFamily === familyId) {
      total += effectiveOperationIncome(b);
    }
  }
  return total;
}

/** Total per-tick gross income for a family. */
export function familyIncome(state: GameState, familyId: string): number {
  return extortionIncome(state, familyId) + operationIncome(state, familyId);
}

/** Total per-tick expenses for a family: gangster upkeep plus standing bribe retainer. */
export function familyExpenses(family: Family): number {
  const upkeep = family.gangsters.reduce((sum, g) => sum + g.upkeep, 0);
  return upkeep + family.bribeLevel;
}

/** Net per-tick cash flow for a family (income minus expenses). */
export function familyNet(state: GameState, family: Family): number {
  return familyIncome(state, family.id) - familyExpenses(family);
}
