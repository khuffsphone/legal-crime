// Economy calculations. Pure functions over state — no Phaser, no RNG needed here
// (income/expense math is fully deterministic given the state).

import { EXTORT_RATE } from './constants';
import type { Business, Family, GameState } from './types';

/** Every business across every district. */
export function allBusinesses(state: GameState): Business[] {
  return state.districts.flatMap((d) => d.businesses);
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
      total += b.baseIncome;
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
