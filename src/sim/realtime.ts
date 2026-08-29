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
import { resolveProximityCombat, type CombatEvent } from './combat';
import { advanceDownedBodies, recordDownedBody } from './downedBodies';
import { advanceEmbodiedExtortion, type EmbodiedExtortionEvent } from './extortionEmbodied';
import { advanceBeatCops } from './beatCops';
import { advanceCombatOrders, type CombatCtx } from './combatControl';
import { advanceStrategy, type StrategicEvent } from './strategy';
import { evaluateEndgame, type EndgameResult } from './endgame';
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
  /** RTS-35a — unit-vs-unit combat beats this step (hits + downs) for the render layer. */
  combat: CombatEvent[];
  /** RTS-35b — embodied-extortion state transitions this step (approach→…→resolve/failed). */
  extortion: EmbodiedExtortionEvent[];
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
  combatCtx?: CombatCtx,
  lawEnabled = true,
): UpdateResult {
  // RTS-19: bleed the player's offensive cooldown so the crew regroups in real time.
  if ((state.offenseCooldown ?? 0) > 0) {
    state.offenseCooldown = Math.max(0, (state.offenseCooldown ?? 0) - dt);
  }
  const arrivedUnitIds = advanceUnits(state.units, dt);
  const interceptions = resolveInterceptions(state);
  // RTS-35a: embodied unit combat — opposing thugs within range trade blows (settles AROUND the tick,
  // on the freshly-advanced positions, before the week settles). Collectors are untouched (robbed via
  // interception above); this only fights factioned non-collector units.
  const combat = resolveProximityCombat(state, dt);
  // COMBAT READABILITY — ⚠ SIM-ADJACENT (unit lifecycle, kept in this WRAPPER; the combat resolver + tick
  // are untouched): a downed unit leaves a DESATURATED body for a few seconds instead of vanishing the
  // instant it falls. Age existing bodies, then capture any new ones from this step's `down` beats.
  state.downedBodies = advanceDownedBodies(state.downedBodies ?? [], dt);
  for (const ev of combat) state.downedBodies = recordDownedBody(state.downedBodies, ev);
  // RTS-35b: drive the embodied-extortion acts (walk → shake down → convert via the EXISTING path).
  // Runs on the freshly-advanced positions + the combat signal; the economic tick is untouched.
  const extortion = advanceEmbodiedExtortion(state, dt);
  // BEAT-COP P0 — patrol the neutral law markers (OBSERVATION-ONLY: no game number changes). Runs
  // after the embodied systems, before settlement. Draws only from the separate lawRngState cursor,
  // and no-ops when state.beatCops is absent — cop-less games stay byte-identical.
  if (lawEnabled) advanceBeatCops(state, dt);
  // COMBAT PR A — drive the standing combat orders (attack-move / focus-fire / disengage). Purely
  // additive: no-ops unless BOTH state.combatOrders exists (?combat=1 issued something) AND the
  // caller supplied the world ctx (grid + fog predicate) — headless/legacy callers pass nothing and
  // stay byte-identical. Draws no RNG; only ordered units' paths + the slice are ever written.
  advanceCombatOrders(state, dt, combatCtx);
  const weeksFired = advanceClock(state, dt, weekDuration);
  return { weeksFired, arrivedUnitIds, interceptions, combat, extortion };
}

export interface ObserveResult {
  /** The same data plain update() returns. */
  result: UpdateResult;
  /** Territorial moves the rival families made this step (RTS-16). */
  strategy: StrategicEvent;
  /** The endgame resolution this step, if the match was decided (RTS-17). */
  endgame: EndgameResult | null;
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
  pulseSeconds?: number,
  combatCtx?: CombatCtx,
  lawEnabled = true,
): ObserveResult {
  const before = snapshotPlayer(state);
  const result = update(state, dt, weekDuration, combatCtx, lawEnabled); // mutates state in place (logs included)
  // RTS-16: advance the turf war (rival territorial moves). A no-op on the legacy map (no
  // adjacency), so existing 5-district tests are unaffected.
  const strategy = advanceStrategy(state, dt, pulseSeconds).events;
  // RTS-17: resolve the endgame (win/lose) if the contest has been decided.
  const endgame = evaluateEndgame(state);

  let s = harvestIncidents(state); // project the new log entries (interceptions + tick + war)

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

  return { result, strategy, endgame, state: s };
}
