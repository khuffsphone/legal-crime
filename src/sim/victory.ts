// Lane E — WIN-PATH VARIETY. Pure & deterministic; imports NO Phaser. The FOUR telegraphed victory
// CONDITIONS and the end-of-match REPORT the victory newspaper prints. This WRAPS the canon endgame
// (endgame.ts) and the win-path metrics (winpaths.ts); it adds NO new win MECHANIC. Canon is THREE
// WIN PATHS — Domination simply *telegraphs its two triggers* (LAST FAMILY STANDING and CITY
// DOMINANCE) as separate, legible conditions, so the player always reads four concrete ways the
// match can end and how close each one is. It only READS state; tick/applyCommand stays untouched.

import { MAYOR_INFLUENCE_REQ, TURF_DOMINANCE } from './constants';
import { cleanCash } from './laundering';
import { districtsHeld } from './territoryWar';
import { goStraightProgress, influenceOf, mayorProgress } from './winpaths';
import type { EndKind } from './endgame';
import type { GameState } from './types';

export type VictoryConditionId = 'last-standing' | 'dominance' | 'go-straight' | 'mayor';

/** Telegraph escalation — how loudly a condition is announcing itself. Drives the HUD glyph. */
export type VictoryStage = 'dormant' | 'building' | 'closing' | 'imminent' | 'won';

export type VictoryOutcome = GameState['status']; // 'playing' | 'won' | 'lost'

export interface VictoryCondition {
  id: VictoryConditionId;
  /** The EndKind this condition resolves to (matches evaluateEndgame). */
  endKind: 'win-last-standing' | 'win-dominance' | 'win-go-straight' | 'win-mayor';
  /** Short HUD label. */
  label: string;
  /** Big newspaper headline when this is the win. */
  headline: string;
  /** Newspaper kicker (the over-the-headline strap). */
  kicker: string;
  /** 0..100. At 100 the condition is met. */
  pct: number;
  /** Telegraph stage derived from pct. */
  stage: VictoryStage;
  /** A clipped plain-English read of where the player stands on this condition. */
  read: string;
  /** What pushes it forward (the legibility note). */
  advances: string;
}

const KIND_TO_ID: Record<string, VictoryConditionId> = {
  'win-last-standing': 'last-standing',
  'win-dominance': 'dominance',
  'win-go-straight': 'go-straight',
  'win-mayor': 'mayor',
};

/** Map a 0..100 progress to its telegraph stage. The bands are the legibility contract. */
export function victoryStage(pct: number): VictoryStage {
  if (pct >= 100) return 'won';
  if (pct >= 80) return 'imminent';
  if (pct >= 50) return 'closing';
  if (pct > 0) return 'building';
  return 'dormant';
}

/** LAST FAMILY STANDING — the share of rival families already wiped out. The force-win's first trigger. */
export function lastStandingCondition(state: GameState): VictoryCondition {
  const rivals = state.rivals;
  const dead = rivals.filter((r) => !r.alive).length;
  const pct = rivals.length > 0 ? Math.round((dead / rivals.length) * 100) : 100;
  const left = rivals.length - dead;
  return {
    id: 'last-standing', endKind: 'win-last-standing', label: 'LAST STANDING',
    headline: 'THE LAST FAMILY STANDING', kicker: 'A CITY UNDER ONE NAME',
    pct, stage: victoryStage(pct),
    read: pct >= 100 ? 'Every rival family is in the ground.' : `${dead} of ${rivals.length} families down — ${left} left to break.`,
    advances: 'raze rival HQs — RAID to soften, ASSASSINATE to finish.',
  };
}

/** CITY DOMINANCE — held blocks toward the TURF_DOMINANCE threshold. The force-win's second trigger. */
export function dominanceCondition(state: GameState): VictoryCondition {
  const total = state.districts.length;
  const held = districtsHeld(state, state.player.id).length;
  const dom = total > 0 ? held / total : 0;
  const pct = Math.round(Math.min(1, dom / TURF_DOMINANCE) * 100);
  const need = Math.max(0, Math.ceil(TURF_DOMINANCE * total) - held);
  return {
    id: 'dominance', endKind: 'win-dominance', label: 'DOMINANCE',
    headline: 'THE CITY IS YOURS', kicker: 'ONE OUTFIT RULES THE BLOCKS',
    pct, stage: victoryStage(pct),
    read: pct >= 100 ? `You hold ${held} of ${total} blocks — the city bends to you.` : `${held}/${total} blocks — ${need} more to take the city.`,
    advances: `hold ≥${Math.round(TURF_DOMINANCE * 100)}% of blocks — EXPAND and defend your turf.`,
  };
}

/** GO STRAIGHT — legit empire value toward the retire-clean target (reuses the canon metric). */
export function goStraightCondition(state: GameState): VictoryCondition {
  const w = goStraightProgress(state);
  return {
    id: 'go-straight', endKind: 'win-go-straight', label: 'GO STRAIGHT',
    headline: 'YOU WENT STRAIGHT', kicker: 'RACKETEER RETIRES RESPECTABLE',
    pct: w.pct, stage: victoryStage(w.pct), read: w.read, advances: w.advances,
  };
}

/** GET ELECTED MAYOR — City Hall + civic influence (reuses the canon metric). */
export function mayorCondition(state: GameState): VictoryCondition {
  const w = mayorProgress(state);
  return {
    id: 'mayor', endKind: 'win-mayor', label: 'GET ELECTED',
    headline: 'MR. MAYOR', kicker: 'THE MACHINE TAKES CITY HALL',
    pct: w.pct, stage: victoryStage(w.pct), read: w.read, advances: w.advances,
  };
}

/**
 * The FOUR telegraphed victory conditions, in stable display order (the two Domination triggers, then
 * the two soft wins). Pure read — this is what the HUD telegraphs every frame and what the endgame
 * newspaper ranks into a "final standing".
 */
export function victoryConditions(state: GameState): VictoryCondition[] {
  return [
    lastStandingCondition(state),
    dominanceCondition(state),
    goStraightCondition(state),
    mayorCondition(state),
  ];
}

/** The condition closest to completion (the player's likeliest route). Ties keep display order. */
export function leadingVictory(state: GameState): VictoryCondition {
  return victoryConditions(state).reduce((a, b) => (b.pct > a.pct ? b : a));
}

/**
 * The player's most-advanced UNFINISHED condition that has crossed into the 'imminent' band (≥80%,
 * <100%) — the "one move from winning" telegraph. Null until the player is genuinely on the brink.
 */
export function imminentVictory(state: GameState): VictoryCondition | null {
  const close = victoryConditions(state)
    .filter((c) => c.stage === 'imminent')
    .sort((a, b) => b.pct - a.pct);
  return close[0] ?? null;
}

export interface VictoryReport {
  outcome: VictoryOutcome;
  won: boolean;
  /** The resolved EndKind from the game-over log, if the match has ended. */
  kind: EndKind | null;
  /** Big newspaper headline. */
  headline: string;
  /** Newspaper kicker. */
  kicker: string;
  /** The game-over message — the deck / sub-headline. */
  dek: string;
  /** The week the match resolved. */
  week: number;
  /** The four conditions ranked closest-first — the standing the paper prints. */
  standing: VictoryCondition[];
  /** Which condition was achieved on a win, else null. */
  achievedId: VictoryConditionId | null;
  /** The closest condition the player did NOT take (a loss: the path they were nearest). */
  runnerUp: VictoryCondition | null;
  /** A deterministic "by the numbers" stat block for the lower column. */
  byTheNumbers: string[];
}

function lossMasthead(kind: EndKind | null): { headline: string; kicker: string } {
  switch (kind) {
    case 'lose-collapse': return { headline: 'BROKE AND BURIED', kicker: 'THE OUTFIT FOLDS' };
    case 'lose-city': return { headline: 'THE CITY TOOK YOU', kicker: 'A RIVAL TAKES THE BLOCKS' };
    case 'lose-hq':
    default: return { headline: 'THE CITY TOOK YOU', kicker: 'YOUR HOUSE IS RAZED' };
  }
}

/**
 * Build the end-of-match REPORT the victory newspaper renders (Lane E). Pure read: it ranks the four
 * conditions into a final standing, names the win (or the loss), and assembles the deterministic
 * "by the numbers" column. The EndKind/message are read from the game-over log written by
 * evaluateEndgame, so the paper always agrees with the canon resolution. Safe to call mid-match.
 */
export function victoryReport(state: GameState): VictoryReport {
  const conditions = victoryConditions(state);
  const standing = [...conditions].sort((a, b) => b.pct - a.pct);
  const won = state.status === 'won';

  const last = [...state.log].reverse().find((e) => e.kind === 'game-over');
  const kind = ((last?.data as { kind?: EndKind } | undefined)?.kind) ?? null;
  const dek = last?.message ?? '';

  const achievedId = kind && kind in KIND_TO_ID ? KIND_TO_ID[kind] : null;
  const achieved = achievedId ? conditions.find((c) => c.id === achievedId) ?? null : null;

  let headline: string, kicker: string;
  if (won && achieved) {
    headline = achieved.headline; kicker = achieved.kicker;
  } else if (won) {
    // won but the log didn't pin a kind — fall back to the completed condition.
    const done = standing.find((c) => c.pct >= 100) ?? standing[0];
    headline = done.headline; kicker = done.kicker;
  } else if (state.status === 'lost') {
    ({ headline, kicker } = lossMasthead(kind));
  } else {
    // mid-match (preview): no result yet — name the race, not a winner.
    headline = 'THE RACE FOR THE CITY'; kicker = `CLOSEST: ${standing[0].label}`;
  }

  // runner-up = the nearest condition the player did NOT win on (for a loss, simply the nearest).
  const runnerUp = standing.find((c) => c.id !== achievedId && c.pct > 0) ?? null;

  const p = state.player;
  const total = state.districts.length;
  const held = districtsHeld(state, p.id).length;
  const rivalsDown = state.rivals.filter((r) => !r.alive).length;
  const byTheNumbers = [
    `Blocks held: ${held} of ${total}`,
    `Crew on the books: ${p.gangsters.length}`,
    `Clean fortune: $${cleanCash(p)}`,
    `Civic influence: ${influenceOf(state)} / ${MAYOR_INFLUENCE_REQ}`,
    `Rivals put down: ${rivalsDown} of ${state.rivals.length}`,
  ];

  return {
    outcome: state.status, won, kind, headline, kicker, dek,
    week: state.tick, standing, achievedId, runnerUp, byTheNumbers,
  };
}
