// RTS-0 — the continuous real-time week clock. Pure & deterministic; imports NO Phaser.
//
// The economy is unchanged: a "week" settlement is the EXISTING economic tick (`tick`),
// fired here by elapsed real time instead of by a keypress. `advanceClock` accumulates dt
// and fires the settlement each time WEEK_DURATION_SECONDS elapses — wrapping, not
// rewriting, the verified tick logic. Step dt manually to unit-test the real-time loop.

import { WEEK_DURATION_SECONDS } from './constants';
import { tick } from './tick';
import type { GameState } from './types';

/**
 * Advance the real-time clock by `dtSeconds`, firing the existing week settlement once for
 * every full `weekDuration` of accumulated time. Mutates `state` (its `weekElapsed`
 * accumulator and, per settlement, the full economic tick). Returns how many weeks fired.
 *
 * - Non-positive dt (or NaN) is ignored (returns 0) — a paused/garbage frame changes nothing.
 * - A single large dt can fire multiple weeks (e.g. dt = 3·weekDuration fires 3), so a long
 *   step or a sequence of steps both settle the right number of weeks.
 * - An invalid weekDuration (≤ 0) is a no-op (returns 0) rather than looping forever.
 */
export function advanceClock(
  state: GameState,
  dtSeconds: number,
  weekDuration: number = WEEK_DURATION_SECONDS,
): number {
  if (!(dtSeconds > 0) || !(weekDuration > 0)) return 0;

  state.weekElapsed += dtSeconds;

  let weeksFired = 0;
  while (state.weekElapsed >= weekDuration) {
    state.weekElapsed -= weekDuration;
    tick(state); // the existing economic settlement, unchanged (no-op once the game is over)
    weeksFired += 1;
  }
  return weeksFired;
}

/** Fraction [0, 1) of the way to the next week settlement — for a real-time countdown. */
export function weekProgress(
  state: GameState,
  weekDuration: number = WEEK_DURATION_SECONDS,
): number {
  if (!(weekDuration > 0)) return 0;
  const frac = state.weekElapsed / weekDuration;
  return frac < 0 ? 0 : frac > 1 ? 1 : frac;
}

/** Real seconds remaining until the next week settlement. */
export function secondsUntilNextWeek(
  state: GameState,
  weekDuration: number = WEEK_DURATION_SECONDS,
): number {
  if (!(weekDuration > 0)) return 0;
  return Math.max(0, weekDuration - state.weekElapsed);
}
