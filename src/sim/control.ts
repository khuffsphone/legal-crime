// RTS-29 — CONTROL currency. Pure & deterministic; imports NO Phaser. Caps how much turf/business a
// family can actively HOLD, so overproduction is mathematically gated rather than merely discouraged.
// It is NOT a parallel economy: the CAP is raised by CITY HALL political favour (the politicians
// bribe channel) + a slow time-drift floor; it is SPENT on the holdings you maintain (each extorted
// front + each held district), and returns when a holding is released/lost. The chain
// extort→launder→bribe→favor→cap→expand is the 60-minute pacing metronome.

import {
  CONTROL_START, CONTROL_PER_FAVOR, CONTROL_DRIFT_PER_WEEK, CONTROL_CAP_MAX,
  CONTROL_COST_BUSINESS, CONTROL_COST_DISTRICT,
} from './constants';
import { allBusinesses, businessEarner } from './economy';
import { districtsHeld } from './territoryWar';
import { findFamily, type GameState } from './types';

/** The control CAP: a starting reach + City Hall political favour ($/wk greased into politicians) +
 * a slow time-drift floor, clamped. This is what bribing City Hall BUYS — room to hold more. */
export function controlCap(state: GameState, familyId: string): number {
  const fam = findFamily(state, familyId);
  if (!fam) return 0;
  const cityHall = fam.bribes.politicians ?? 0;
  const favor = Math.floor(cityHall / CONTROL_PER_FAVOR);
  const drift = Math.floor(state.tick * CONTROL_DRIFT_PER_WEEK);
  return Math.min(CONTROL_CAP_MAX, CONTROL_START + favor + drift);
}

/** Control SPENT: the holdings the family actively maintains — each extorted front + each held
 * district. Released holdings return their control automatically (this is a live read of holdings). */
export function controlSpent(state: GameState, familyId: string): number {
  const fronts = allBusinesses(state).filter((b) => b.kind === 'front' && businessEarner(b) === familyId).length;
  const districts = districtsHeld(state, familyId).length;
  return fronts * CONTROL_COST_BUSINESS + districts * CONTROL_COST_DISTRICT;
}

/** Control still available to spend (cap − spent; never negative for the read). */
export function controlAvailable(state: GameState, familyId: string): number {
  return Math.max(0, controlCap(state, familyId) - controlSpent(state, familyId));
}

/** Whether the family can take on a new holding costing `cost` control (default a front). At the cap
 * this is false — the EXPAND/EXTORT verb greys "NO CONTROL LEFT — raise it first". */
export function canHold(state: GameState, familyId: string, cost: number = CONTROL_COST_BUSINESS): boolean {
  return controlAvailable(state, familyId) >= cost;
}

export interface ControlReadout {
  spent: number;
  cap: number;
  available: number;
  /** A unicode bar like "███████░░" sized to `width` for the HUD meter. */
  bar: string;
  /** "CONTROL ███████░░ 7/10" — named + capped. */
  label: string;
  /** Plain-English tooltip. */
  read: string;
}

/** The HUD readout for the CONTROL meter (the freed Market dock tab). Pure read. */
export function controlReadout(state: GameState, familyId: string, width: number = 10): ControlReadout {
  const cap = controlCap(state, familyId);
  const spent = controlSpent(state, familyId);
  const available = Math.max(0, cap - spent);
  const filled = cap > 0 ? Math.round((spent / cap) * width) : 0;
  const clamped = Math.max(0, Math.min(width, filled));
  const bar = '█'.repeat(clamped) + '░'.repeat(width - clamped);
  return {
    spent, cap, available, bar,
    label: `CONTROL ${bar} ${spent}/${cap}`,
    read: available > 0
      ? `Control is how much turf you can hold — ${available} left. Grease CITY HALL to raise it.`
      : 'NO CONTROL LEFT — grease CITY HALL to raise the cap before you take more.',
  };
}
