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
} from './constants';
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

/**
 * Step 4 of the tick: drift every gangster's loyalty, then roll desertion for any whose
 * loyalty fell below the threshold. Deserters are removed from their family. Draws from
 * the shared RNG only for at-risk gangsters, in family-then-roster order.
 */
export function resolveLoyalty(state: GameState): void {
  const rng = new Rng(state.rngState);

  for (const family of allFamilies(state)) {
    const cashPositive = family.cash >= 0;
    const delta = loyaltyDelta(cashPositive, family.heat);

    const survivors: Family['gangsters'] = [];
    for (const g of family.gangsters) {
      g.loyalty = clampLoyalty(g.loyalty + delta);

      const chance = desertionChance(g.loyalty);
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
