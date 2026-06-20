// RTS-2 — the unified real-time driver. Pure & deterministic; imports NO Phaser. One call,
// `update(state, dt)`, advances BOTH the spatial units and the week clock by the same dt.
//
// The two systems share one real-time clock but are independent: units move continuously every
// frame, while the week settlement (the existing economic `tick`) fires only on WEEK_DURATION
// boundaries. A week firing never touches unit positions, so a settlement cannot reset or
// interrupt movement — units keep walking straight through a week boundary.

import { advanceClock } from './clock';
import { advanceUnits } from './movement';
import { resolveInterceptions, type InterceptionEvent } from './interception';
import { harvestIncidents, recordIncident } from './ledger';
import { federalExposure } from './federal';
import { cleanCash } from './laundering';
import { WEEK_DURATION_SECONDS } from './constants';
import type { GameState } from './types';

export interface UpdateResult {
  /** How many week settlements (economic ticks) fired this step. */
  weeksFired: number;
  /** Ids of units that arrived at their destination this step. */
  arrivedUnitIds: string[];
  /** Ambushes resolved this step (RTS-4). Empty when no carrying collector was caught. */
  interceptions: InterceptionEvent[];
}

/**
 * Advance the whole real-time world by `dt` seconds: move units, resolve any spatial ambushes
 * (RTS-4), then settle any weeks whose boundary the accumulated time crossed. `weekDuration` is
 * forwarded to the clock (defaults to WEEK_DURATION_SECONDS) so tests can drive short weeks.
 * Interception is checked AFTER movement (on the new positions) and BEFORE settlement, so a
 * collector robbed in transit never banks its take at the week boundary. Mutates `state`.
 */
export function update(
  state: GameState,
  dt: number,
  weekDuration: number = WEEK_DURATION_SECONDS,
): UpdateResult {
  const arrivedUnitIds = advanceUnits(state.units, dt);
  const interceptions = resolveInterceptions(state);
  const weeksFired = advanceClock(state, dt, weekDuration);
  return { weeksFired, arrivedUnitIds, interceptions };
}

export interface ObserveResult {
  /** The same data plain update() returns. */
  result: UpdateResult;
  /** The state with the incident ledger advanced (a NEW object — reassign your reference). */
  state: GameState;
}

interface PlayerSnapshot {
  tick: number;
  cleanCash: number;
  dirtyCash: number;
  heat: number;
  exposure: number;
}

function snapshotPlayer(state: GameState): PlayerSnapshot {
  return {
    tick: state.tick,
    cleanCash: cleanCash(state.player),
    dirtyCash: state.player.dirtyCash,
    heat: state.player.heat,
    exposure: federalExposure(state.player),
  };
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * RTS-9 — the OBSERVING driver: runs the unchanged real-time `update()` (which mutates `state`
 * in place), then projects the resulting log entries into the incident ledger and, when a week
 * settled, records a curated settlement summary with the player's key deltas. Returns the plain
 * UpdateResult plus the ledger-advanced state (a NEW object — assign it back). The economic
 * settlement is never touched; this only READS what happened and appends incidents.
 */
export function updateAndObserve(
  state: GameState,
  dt: number,
  weekDuration: number = WEEK_DURATION_SECONDS,
): ObserveResult {
  const before = snapshotPlayer(state);
  const result = update(state, dt, weekDuration); // mutates state in place (logs included)

  let s = harvestIncidents(state); // project the new log entries (interceptions + tick events)

  if (result.weeksFired > 0) {
    const after = snapshotPlayer(s);
    const dHeat = after.heat - before.heat;
    const dExp = after.exposure - before.exposure;
    const dClean = after.cleanCash - before.cleanCash;
    const dDirty = after.dirtyCash - before.dirtyCash;
    s = recordIncident(s, {
      type: 'settlement',
      severity: dExp > 0 || dHeat > 0 ? 'warning' : 'info',
      week: after.tick,
      summary:
        `Week ${after.tick} settled — clean ${signed(dClean)} · dirty ${signed(dDirty)} · ` +
        `heat ${signed(dHeat)} · exposure ${signed(dExp)}`,
      data: {
        weeksFired: result.weeksFired,
        cleanDelta: dClean,
        dirtyDelta: dDirty,
        heatDelta: dHeat,
        exposureDelta: dExp,
        heat: after.heat,
        exposure: after.exposure,
      },
    });
  }

  return { result, state: s };
}
