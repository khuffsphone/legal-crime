// Gangster loyalty, desertion, and the per-tick loyalty step. Pure & deterministic;
// the desertion roll draws from the seeded RNG cursor on state.

import {
  DESERT_LOYALTY,
  LOYALTY_DROP_UNPAID,
  LOYALTY_GAIN_PAID,
  LOYALTY_HEAT_DIVISOR,
  LOYALTY_MAX,
  LOYALTY_MIN,
  MAX_DESERT_CHANCE,
  MUTINY_CHANCE,
  MUTINY_MIN_CREW,
  MUTINY_SKIM,
  MUTINY_THRESHOLD_FRACTION,
} from './constants';
import { clampDirty } from './laundering';
import { memberLoyaltyDelta, desertionChanceFactor } from './traits';
import { Rng } from './rng';
import { allFamilies, type Family, type GameState } from './types';

/** Names drawn from at recruitment. */
export const GANGSTER_NAMES = [
  'Vito',
  'Sal',
  'Frankie',
  'Bugsy',
  'Nico',
  'Carmine',
  'Rocco',
  'Gino',
  'Marco',
  'Lefty',
  'Joey',
  'Dom',
] as const;

/**
 * Per-tick change to a gangster's loyalty for its family's situation: a flat gain when
 * the family can pay (cash >= 0) or a flat loss when broke, minus a heat penalty of
 * floor(heat / divisor). Pure — same inputs always give the same delta.
 */
export function loyaltyDelta(cashPositive: boolean, heat: number): number {
  const base = cashPositive ? LOYALTY_GAIN_PAID : -LOYALTY_DROP_UNPAID;
  const heatPenalty = Math.floor(heat / LOYALTY_HEAT_DIVISOR);
  return base - heatPenalty;
}

/**
 * Probability a gangster deserts this tick given its loyalty. Zero at or above the
 * desertion threshold; otherwise it rises linearly to MAX_DESERT_CHANCE as loyalty -> 0.
 */
export function desertionChance(loyalty: number): number {
  if (loyalty >= DESERT_LOYALTY) return 0;
  const clamped = loyalty < 0 ? 0 : loyalty;
  return ((DESERT_LOYALTY - clamped) / DESERT_LOYALTY) * MAX_DESERT_CHANCE;
}

function clampLoyalty(v: number): number {
  return v < LOYALTY_MIN ? LOYALTY_MIN : v > LOYALTY_MAX ? LOYALTY_MAX : v;
}

/** Number of a family's gangsters below the desertion-loyalty threshold. */
export function atRiskCount(family: Family): number {
  return family.gangsters.filter((g) => g.loyalty < DESERT_LOYALTY).length;
}

/**
 * Whether a coordinated mutiny is possible: the crew is at least MUTINY_MIN_CREW strong and
 * at least MUTINY_THRESHOLD_FRACTION of it is below desertion loyalty. Pure.
 */
export function mutinyConditionMet(family: Family): boolean {
  const crew = family.gangsters.length;
  if (crew < MUTINY_MIN_CREW) return false;
  return atRiskCount(family) / crew >= MUTINY_THRESHOLD_FRACTION;
}

/**
 * Step 4 of the tick: drift every gangster's loyalty, then either a coordinated MUTINY (the
 * whole disloyal cohort walks out at once and skims cash) when the crew has soured, or the
 * usual per-gangster desertion rolls. Draws from the shared RNG only when a family can
 * mutiny (one roll) or for its at-risk gangsters, in family-then-roster order.
 */
export function resolveLoyalty(state: GameState): void {
  const rng = new Rng(state.rngState);

  for (const family of allFamilies(state)) {
    const cashPositive = family.cash >= 0;

    // 1. Drift loyalties per member (no RNG). RTS-14: Cool ignore heat, Loyal soften losses; a
    //    trait-less member uses the legacy loyaltyDelta exactly.
    for (const g of family.gangsters) {
      g.loyalty = clampLoyalty(g.loyalty + memberLoyaltyDelta(g, cashPositive, family.heat));
    }

    // 2. Coordinated mutiny takes precedence over solo desertion.
    if (mutinyConditionMet(family) && rng.chance(MUTINY_CHANCE)) {
      const mutineers = family.gangsters.filter((g) => g.loyalty < DESERT_LOYALTY);
      const skim = family.cash > 0 ? Math.floor(family.cash * MUTINY_SKIM) : 0;
      family.cash -= skim;
      clampDirty(family);
      family.gangsters = family.gangsters.filter((g) => g.loyalty >= DESERT_LOYALTY);
      state.log.push({
        tick: state.tick,
        kind: 'mutiny',
        message: `${mutineers.length} of ${family.name}'s crew mutinied and skimmed $${skim}`,
        data: { familyId: family.id, count: mutineers.length, skim },
      });
      continue;
    }

    // 3. Per-gangster desertion.
    const survivors: Family['gangsters'] = [];
    for (const g of family.gangsters) {
      const chance = desertionChance(g.loyalty) * desertionChanceFactor(g); // RTS-14: Loyal resist
      if (chance > 0 && rng.chance(chance)) {
        state.log.push({
          tick: state.tick,
          kind: 'desertion',
          message: `${g.name} deserted ${family.name} (loyalty ${g.loyalty})`,
          data: { familyId: family.id, gangsterId: g.id, loyalty: g.loyalty },
        });
        continue; // dropped
      }
      survivors.push(g);
    }
    family.gangsters = survivors;
  }

  state.rngState = rng.state;
}
