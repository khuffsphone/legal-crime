// RTS-24 — LIGHT SYSTEMIC EVENTS. Pure & deterministic (seeded RNG); imports NO Phaser. A handful
// of world events tied to the existing systems, each a TRIGGER + EFFECT + a WIRE slip that explains
// cause→effect in plain mob English. WRAPS the settlement (advanceEvents is called on a week
// boundary from the wrapper, never tick), and rolls from state.rngState so it is deterministic.

import { EVENT_WEEKLY_CHANCE, HEAT_MAX } from './constants';
import { Rng } from './rng';
import { shockDemand } from './market';
import { advanceMarket } from './market';
import { advanceCivics } from './winpaths';
import type { GameState } from './types';

export type EventKind = 'legalization' | 'fbi-lockout' | 'booze-glut' | 'booze-shortage' | 'expose';

interface EventDef {
  kind: EventKind;
  message: string;
  severity: 'info' | 'warning' | 'danger' | 'gain';
  apply: (state: GameState) => void;
}

function addHeat(state: GameState, n: number): void {
  state.player.heat = Math.max(0, Math.min(HEAT_MAX, state.player.heat + n));
}

const EVENTS: ReadonlyArray<EventDef> = [
  { kind: 'legalization', severity: 'gain', message: 'The aldermen vote the ward WET — booze demand spikes and the heat eases off.', apply: (s) => { shockDemand(s, 'booze', 25); addHeat(s, -8); } },
  { kind: 'fbi-lockout', severity: 'danger', message: 'The Bureau opens a field office downtown — federal heat spikes.', apply: (s) => addHeat(s, 14) },
  { kind: 'booze-glut', severity: 'warning', message: 'A rival floods the streets with cheap booze — liquor prices CRASH.', apply: (s) => shockDemand(s, 'booze', -30) },
  { kind: 'booze-shortage', severity: 'warning', message: 'A dockside bust dries up the supply — liquor prices SPIKE.', apply: (s) => shockDemand(s, 'booze', 30) },
  { kind: 'expose', severity: 'danger', message: 'The Tribune runs an exposé on your outfit — heat spikes citywide.', apply: (s) => addHeat(s, 12) },
];

/** Roll (seeded) for a weekly event and APPLY it, logging a Wire slip. Returns the kind that fired,
 * or null. Pure (mutates state + the RNG cursor). */
export function advanceEvents(state: GameState): EventKind | null {
  const rng = new Rng(state.rngState);
  const fires = rng.chance(EVENT_WEEKLY_CHANCE);
  const pick = EVENTS[rng.nextInt(0, EVENTS.length - 1)];
  state.rngState = rng.state;
  if (!fires) return null;
  pick.apply(state);
  state.log.push({ tick: state.tick, kind: `event-${pick.kind}`, message: pick.message, data: { event: pick.kind, severity: pick.severity } });
  return pick.kind;
}

/**
 * The weekly CONTENT beat — wraps the settlement: accrue civic influence (MAYOR path), ease the
 * market, and roll a light event. Called from the scene after each settled week (it never touches
 * tick/applyCommand). Pure; mutates state. `weeks` fires it once per settled week.
 */
export function advanceWeeklyContent(state: GameState, weeks: number): void {
  for (let i = 0; i < Math.max(0, weeks); i++) {
    advanceCivics(state);
    advanceMarket(state);
    advanceEvents(state);
  }
}
