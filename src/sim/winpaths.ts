// RTS-24 — MULTIPLE WIN CONDITIONS. Pure & deterministic; imports NO Phaser. Three distinct paths
// to victory, each a progress metric (0..100) the HUD reads, so the systems have distinct purposes
// and the game replays differently:
//   • DOMINATION — last family standing / ≥ TURF_DOMINANCE of the city (the canon force win).
//   • GO STRAIGHT — convert a dirty empire to a clean, legitimate one (launder + legal fronts).
//   • GET ELECTED MAYOR — drive City Hall + civic INFLUENCE to capture the city politically.
// These WRAP the settlement: civic influence accrues in the real-time wrapper (advanceCivics on a
// week boundary), and evaluateEndgame (endgame.ts) consults metWinPath to resolve the match. tick
// is untouched.

import {
  GO_STRAIGHT_FRONT_VALUE,
  GO_STRAIGHT_TARGET,
  INFLUENCE_MAX,
  INFLUENCE_PER_CITYHALL,
  INFLUENCE_PER_DISTRICT,
  INFLUENCE_PER_FRONT,
  MAYOR_CITYHALL_REQ,
  MAYOR_INFLUENCE_REQ,
  TURF_DOMINANCE,
} from './constants';
import { allBusinesses } from './economy';
import { cleanCash } from './laundering';
import { districtsHeld } from './territoryWar';
import type { GameState } from './types';

export type WinPath = 'domination' | 'go-straight' | 'mayor';

export interface WinPathProgress {
  path: WinPath;
  /** Player-facing label. */
  label: string;
  /** 0..100. At 100 the path is won. */
  pct: number;
  /** A clipped plain-English read of where you stand. */
  read: string;
  /** What advances it (the legibility note). */
  advances: string;
}

/** Count of protected legal storefronts (fronts the player extorts) — the GO STRAIGHT base. */
export function legalFrontCount(state: GameState): number {
  return allBusinesses(state).filter((b) => b.kind === 'front' && b.extortedBy === state.player.id).length;
}

/** The player's "legit empire value" toward GO STRAIGHT: clean cash + a value per protected front. */
export function legitEmpireValue(state: GameState): number {
  return cleanCash(state.player) + legalFrontCount(state) * GO_STRAIGHT_FRONT_VALUE;
}

/** The player's civic influence (0..INFLUENCE_MAX). */
export function influenceOf(state: GameState): number {
  return Math.max(0, Math.min(INFLUENCE_MAX, state.player.influence ?? 0));
}

/** DOMINATION progress — held/total toward TURF_DOMINANCE, or rivals eliminated toward last-standing. */
export function dominationProgress(state: GameState): WinPathProgress {
  const total = state.districts.length;
  const held = districtsHeld(state, state.player.id).length;
  const dom = total > 0 ? held / total : 0;
  const rivals = state.rivals;
  const deadFrac = rivals.length > 0 ? rivals.filter((r) => !r.alive).length / rivals.length : 0;
  const pct = Math.round(Math.min(1, Math.max(dom / TURF_DOMINANCE, deadFrac)) * 100);
  const need = Math.max(0, Math.ceil(TURF_DOMINANCE * total) - held);
  return {
    path: 'domination', label: 'DOMINATION', pct,
    read: pct >= 100 ? 'The city is yours by force.' : `${held}/${total} blocks — ${need} more to take the city.`,
    advances: 'hold ≥60% of blocks, or be the last family standing (raid · assassinate).',
  };
}

/** GO STRAIGHT progress — legit empire value toward the retire-clean target. */
export function goStraightProgress(state: GameState): WinPathProgress {
  const val = legitEmpireValue(state);
  const pct = Math.round(Math.min(1, val / GO_STRAIGHT_TARGET) * 100);
  return {
    path: 'go-straight', label: 'GO STRAIGHT', pct,
    read: pct >= 100 ? 'You can retire clean and respectable.' : `clean empire $${val}/${GO_STRAIGHT_TARGET}.`,
    advances: 'LAUNDER dirty → clean and protect legit storefronts (each front counts).',
  };
}

/** GET ELECTED MAYOR progress — City Hall greasing + civic influence, both gated. */
export function mayorProgress(state: GameState): WinPathProgress {
  const cityHall = state.player.bribes.politicians ?? 0;
  const infl = influenceOf(state);
  const cityPct = Math.min(1, cityHall / MAYOR_CITYHALL_REQ);
  const inflPct = Math.min(1, infl / MAYOR_INFLUENCE_REQ);
  const pct = Math.round(Math.min(cityPct, inflPct) * 100); // the LAGGING gate sets the pace
  return {
    path: 'mayor', label: 'GET ELECTED', pct,
    read: pct >= 100 ? 'The city is yours — at the ballot box.' : `City Hall $${cityHall}/${MAYOR_CITYHALL_REQ} · influence ${infl}/${MAYOR_INFLUENCE_REQ}.`,
    advances: 'grease CITY HALL to the max and build civic INFLUENCE (turf + legit fronts).',
  };
}

/** All three win-path progresses, in display order. Pure read. */
export function winPaths(state: GameState): WinPathProgress[] {
  return [dominationProgress(state), goStraightProgress(state), mayorProgress(state)];
}

/** The first win path that has reached 100% (drives evaluateEndgame), or null. Domination is
 * already resolved by the canon evaluator; this surfaces the two NEW paths. */
export function metWinPath(state: GameState): WinPathProgress | null {
  for (const w of [goStraightProgress(state), mayorProgress(state)]) if (w.pct >= 100) return w;
  return null;
}

/**
 * Accrue civic INFLUENCE for the player (the MAYOR path), once per settled week. WRAPS the
 * settlement — never called from tick. Influence grows with City Hall greasing, turf, and legit
 * fronts; capped at INFLUENCE_MAX. Pure (mutates state.player.influence). Logs a Wire slip on a
 * mayor-eligible milestone the first time it crosses the bar.
 */
export function advanceCivics(state: GameState): void {
  const p = state.player;
  const cityHall = p.bribes.politicians ?? 0;
  const gain = cityHall * INFLUENCE_PER_CITYHALL
    + districtsHeld(state, p.id).length * INFLUENCE_PER_DISTRICT
    + legalFrontCount(state) * INFLUENCE_PER_FRONT;
  if (gain <= 0) return;
  const before = influenceOf(state);
  p.influence = Math.min(INFLUENCE_MAX, before + gain);
  if (before < MAYOR_INFLUENCE_REQ && p.influence >= MAYOR_INFLUENCE_REQ) {
    state.log.push({ tick: state.tick, kind: 'civic-influence', message: 'The ward bosses are with you — you have the influence to run for Mayor.', data: { influence: p.influence } });
  }
}
