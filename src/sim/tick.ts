// The tick engine. Advances the simulation one week, resolving systems in the fixed
// order documented in LEGAL_CRIME_DESIGN.md §5. Pure & deterministic: it mutates the
// state in place and returns it; all randomness (added in later phases) draws from the
// seeded RNG cursor on state.rngState.
//
// Phase 1 implements the economy steps and the tick counter. Later phases insert their
// steps at the documented positions without reordering earlier ones.

import { EXTORT_HEAT, HEAT_MAX } from './constants';
import { allBusinesses, familyExpenses, familyIncome, operationHeat } from './economy';
import { resolveRivalAI } from './ai';
import { resolveConflict } from './conflict';
import { resolveWinLoss } from './flow';
import { resolveLoyalty } from './gangsters';
import { resolveLaw } from './law';
import { allFamilies, findFamily, type Family, type GameState } from './types';

/** Apply one tick's economy to a single family: cash += income - expenses. */
function resolveFamilyEconomy(state: GameState, family: Family): void {
  const income = familyIncome(state, family.id);
  const expenses = familyExpenses(family);
  const net = income - expenses;
  family.cash += net;
  if (net !== 0) {
    state.log.push({
      tick: state.tick,
      kind: 'economy',
      message: `${family.name}: ${net >= 0 ? '+' : ''}${net} (income ${income}, expenses ${expenses})`,
      data: { familyId: family.id, income, expenses, net },
    });
  }
}

/** Step 2 (heat): each illegal operation generates per-tick heat for its owner,
 * amplified by the district's police presence. */
function resolveOperationHeat(state: GameState): void {
  for (const district of state.districts) {
    for (const business of district.businesses) {
      if (business.kind !== 'front' && business.ownerFamily) {
        const fam = findFamily(state, business.ownerFamily);
        if (fam) {
          fam.heat = Math.min(HEAT_MAX, fam.heat + operationHeat(business, district));
        }
      }
    }
  }
}

/** Step 3 (heat): each extorted front generates per-tick heat for its extorter. */
function resolveExtortionHeat(state: GameState): void {
  for (const business of allBusinesses(state)) {
    if (business.kind === 'front' && business.extortedBy) {
      const fam = findFamily(state, business.extortedBy);
      if (fam) fam.heat = Math.min(HEAT_MAX, fam.heat + EXTORT_HEAT);
    }
  }
}

/**
 * Advance the simulation by one tick. Resolves the economy for every family, applies
 * per-tick extortion heat, then increments the tick counter. Returns the same state
 * object for convenience.
 */
export function tick(state: GameState): GameState {
  // A decided game does not advance — its final state is preserved.
  if (state.status !== 'playing') return state;

  // Step 1–3 (economy): passive income + extortion + operations, minus expenses.
  for (const family of allFamilies(state)) {
    resolveFamilyEconomy(state, family);
  }

  // Step 2 (heat from illegal operations).
  resolveOperationHeat(state);

  // Step 3 (heat from extortion).
  resolveExtortionHeat(state);

  // Step 4 (gangster loyalty drift & desertion).
  resolveLoyalty(state);

  // Step 5 (rival AI actions).
  resolveRivalAI(state);

  // Step 6 (conflict resolution — pending hits).
  resolveConflict(state);

  // Step 7 (heat decay + raid checks).
  resolveLaw(state);

  // Step 8 (win/loss evaluation).
  resolveWinLoss(state);

  // Step 9: advance the clock.
  state.tick += 1;
  return state;
}

/** Convenience: run `n` ticks in sequence. */
export function tickN(state: GameState, n: number): GameState {
  for (let i = 0; i < n; i++) tick(state);
  return state;
}
