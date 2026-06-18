// Illegal business tiers (S4). Pure helpers for the operation upgrade ladder. A tier-N
// operation multiplies both its income and its heat by N (tier 1 = baseline). Upgrading
// costs the kind's base cost scaled by the current tier.

import { OPERATION_COST, TIER_UPGRADE_FACTOR } from './constants';
import type { Business, OperationKind } from './types';

/** Current tier of a business (absent ⇒ 1). Fronts are conceptually tier 1. */
export function tierOf(business: Business): number {
  return business.tier ?? 1;
}

/** Income/heat multiplier for a tier: linear in the tier, floored at 1. */
export function tierMultiplier(tier: number): number {
  return Math.max(1, tier);
}

/** Effective per-tick income of an operation, scaled by its tier. */
export function effectiveOperationIncome(business: Business): number {
  return business.baseIncome * tierMultiplier(tierOf(business));
}

/** Cash cost to upgrade an operation of `kind` from `currentTier` to the next tier. */
export function upgradeCost(kind: OperationKind, currentTier: number): number {
  return Math.floor(OPERATION_COST[kind] * TIER_UPGRADE_FACTOR * Math.max(1, currentTier));
}
