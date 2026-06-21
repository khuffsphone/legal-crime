// Collector units (S2) — THE signature mechanic. Income does not auto-credit families; it
// piles up at each earning business as `uncollected` takings (accrued each tick), and a
// Collector run must physically gather it, at a risk. Pure & deterministic; the only
// randomness (the skim) draws from the shared RNG in the collect command (commands.ts).

import {
  COLLECT_BASE_YIELD,
  COLLECT_HEAT_PENALTY,
  COLLECT_MIN_YIELD,
  COLLECT_MUSCLE_BONUS,
  COLLECT_PRESENCE_PENALTY,
  COLLECT_SKIM_MAX,
} from './constants';
import { businessAccrual, businessEarner } from './economy';
import { incomeShockMultiplier } from './shocks';
import type { Business, GameState } from './types';

/** Current uncollected takings on a business (absent => 0). */
export function uncollectedOf(business: Business): number {
  return business.uncollected ?? 0;
}

/** Step 1a of the tick: each business accrues its per-tick takings into `uncollected`,
 * scaled by any active boom/bust shock (Phase 16). */
export function accrueUncollected(state: GameState): void {
  const mult = incomeShockMultiplier(state);
  for (const district of state.districts) {
    for (const business of district.businesses) {
      const amt = Math.floor(businessAccrual(business) * mult);
      if (amt > 0) business.uncollected = uncollectedOf(business) + amt;
      // RTS-22: a shut-down business (ATTACK) recovers one tick at a time; it produced nothing above.
      if ((business.shutdownTicks ?? 0) > 0) business.shutdownTicks = (business.shutdownTicks ?? 0) - 1;
    }
  }
}

/** Businesses in a district whose takings belong to `familyId` and have something pending. */
export function collectibleBusinesses(
  state: GameState,
  familyId: string,
  districtId: string,
): Business[] {
  const district = state.districts.find((d) => d.id === districtId);
  if (!district) return [];
  return district.businesses.filter(
    (b) => businessEarner(b) === familyId && uncollectedOf(b) > 0,
  );
}

/** Total takings waiting for `familyId` in a district. */
export function pendingCollection(state: GameState, familyId: string, districtId: string): number {
  return collectibleBusinesses(state, familyId, districtId).reduce(
    (sum, b) => sum + uncollectedOf(b),
    0,
  );
}

/** Total takings waiting for `familyId` across the whole city. */
export function totalUncollected(state: GameState, familyId: string): number {
  let total = 0;
  for (const district of state.districts) {
    total += pendingCollection(state, familyId, district.id);
  }
  return total;
}

/**
 * Deterministic "safe" fraction of a collection run that survives police presence and heat,
 * boosted by guarding muscle. Clamped to [COLLECT_MIN_YIELD, 1]. Pure and exactly testable.
 */
export function collectionSafety(policePresence: number, heat: number, muscle: number): number {
  const raw =
    COLLECT_BASE_YIELD -
    policePresence * COLLECT_PRESENCE_PENALTY -
    heat * COLLECT_HEAT_PENALTY +
    muscle * COLLECT_MUSCLE_BONUS;
  return Math.max(COLLECT_MIN_YIELD, Math.min(1, raw));
}

/**
 * Actual collected fraction given the safe fraction and a random roll in [0, 1): a skim of
 * up to COLLECT_SKIM_MAX is taken off the top. fraction = safety * (1 - roll * skimMax).
 */
export function collectionFraction(safety: number, roll: number): number {
  const clampedRoll = roll < 0 ? 0 : roll > 1 ? 1 : roll;
  return safety * (1 - clampedRoll * COLLECT_SKIM_MAX);
}
