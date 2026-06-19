// RTS-2 — the unified real-time driver. Pure & deterministic; imports NO Phaser. One call,
// `update(state, dt)`, advances BOTH the spatial units and the week clock by the same dt.
//
// The two systems share one real-time clock but are independent: units move continuously every
// frame, while the week settlement (the existing economic `tick`) fires only on WEEK_DURATION
// boundaries. A week firing never touches unit positions, so a settlement cannot reset or
// interrupt movement — units keep walking straight through a week boundary.

import { advanceClock } from './clock';
import { advanceUnits } from './movement';
import { WEEK_DURATION_SECONDS } from './constants';
import type { GameState } from './types';

export interface UpdateResult {
  /** How many week settlements (economic ticks) fired this step. */
  weeksFired: number;
  /** Ids of units that arrived at their destination this step. */
  arrivedUnitIds: string[];
}

/**
 * Advance the whole real-time world by `dt` seconds: move units, then settle any weeks whose
 * boundary the accumulated time crossed. `weekDuration` is forwarded to the clock (defaults to
 * WEEK_DURATION_SECONDS) so tests can drive short weeks. Mutates `state`.
 */
export function update(
  state: GameState,
  dt: number,
  weekDuration: number = WEEK_DURATION_SECONDS,
): UpdateResult {
  const arrivedUnitIds = advanceUnits(state.units, dt);
  const weeksFired = advanceClock(state, dt, weekDuration);
  return { weeksFired, arrivedUnitIds };
}
