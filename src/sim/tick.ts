// The tick engine. Advances the simulation one week, resolving systems in the fixed
// order documented in LEGAL_CRIME_DESIGN.md §5. Pure & deterministic: it mutates the
// state in place and returns it; all randomness (added in later phases) draws from the
// seeded RNG cursor on state.rngState.
//
// Phase 1 implements the economy steps and the tick counter. Later phases insert their
// steps at the documented positions without reordering earlier ones.

import { EXTORT_HEAT, HEAT_MAX } from './constants';
import { allBusinesses, familyExpenses, operationHeat } from './economy';
import { accrueUncollected } from './collection';
import { clampDirty, heatFromDirty } from './laundering';
import { resolveRivalAI } from './ai';
import { resolveConflict } from './conflict';
import { resolveWinLoss } from './flow';
import { resolveLoyalty } from './gangsters';
import { resolveLaw } from './law';
import { allFamilies, findFamily, type Family, type GameState } from './types';

/** Apply one tick's expenses to a family: cash -= upkeep + bribe retainer. Income is no
 * longer credited here — under the Collector mechanic (S2) it accrues at businesses and is
 * realized only when collected. Expenses spend clean money first, which the dirty clamp
 * realizes. */
function resolveFamilyExpenses(state: GameState, family: Family): void {
  const expenses = familyExpenses(family);
  if (expenses === 0) return;
  family.cash -= expenses;
  clampDirty(family);
  state.log.push({
    tick: state.tick,
    kind: 'economy',
    message: `${family.name}: -${expenses} (upkeep + bribes)`,
    data: { familyId: family.id, income: 0, expenses, net: -expenses },
  });
}

/** Step 3.5 (heat): a standing hoard of dirty cash radiates per-tick heat for its owner. */
function resolveDirtyHeat(state: GameState): void {
  for (const family of allFamilies(state)) {
    const add = heatFromDirty(family.dirtyCash);
    if (add > 0) family.heat = Math.min(HEAT_MAX, family.heat + add);
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

  // Step 1a (accrual): takings pile up at each earning business as uncollected funds.
  accrueUncollected(state);

  // Step 1b (expenses): families pay upkeep + bribe retainers. Income is realized only by
  // collecting (S2), not here.
  for (const family of allFamilies(state)) {
    resolveFamilyExpenses(state, family);
  }

  // Step 2 (heat from illegal operations).
  resolveOperationHeat(state);

  // Step 3 (heat from extortion).
  resolveExtortionHeat(state);

  // Step 3.5 (heat from a standing dirty-cash hoard — dual economy / S1).
  resolveDirtyHeat(state);

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

  // Normalize the dirty-cash ledger after raids/seizures may have reduced cash this tick.
  for (const family of allFamilies(state)) clampDirty(family);

  // Step 9: advance the clock.
  state.tick += 1;
  return state;
}

/** Convenience: run `n` ticks in sequence. */
export function tickN(state: GameState, n: number): GameState {
  for (let i = 0; i < n; i++) tick(state);
  return state;
}
