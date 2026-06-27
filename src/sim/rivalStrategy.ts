// RIVAL STRATEGY (lane A — rival AI depth). PURE & deterministic; imports NO Phaser. It deepens the greedy
// economic AI in ai.ts with the four behaviours the UAT asked for — rivals TARGET, DEFEND, ALLOCATE BRIBERY,
// and RETREAT UNDER HEAT — WITHOUT touching tick()/applyCommand()/commands.ts. It only READS state and returns
// ADVICE (a posture, an offense/defense target, a per-channel bribery plan); ai.ts turns that advice into the
// EXISTING commands (expandControl / setBribe) and dispatches them through applyCommand as before.
//
// CANON HELD:
//   • /src/sim purity — pure functions, deterministic, no RNG of their own (ai.ts owns the seeded jitter).
//   • Four bribery channels (police / judges / politicians / feds) — reused, none invented.
//   • Federal ladder 50/70/85 — read via the EXISTING federal helpers; bribery reacts to the TELEGRAPHED
//     fedWarningLevel (federal pressure is always telegraphed a tick ahead).
//   • NO-X-RAY — this is the rival's OWN decision-making over board state it already acts on; nothing here is
//     player-facing (lane A ships no HUD), so no hidden information is ever surfaced to the player.
//   • Combat caps / cut-systems-stay-cut — untouched: this layer is economic/control + bribery only, it adds
//     no combat and revives nothing.

import { CONTROL_HOLD, EXPAND_COST } from './constants';
import { fedWarningTier, federalExposure } from './federal';
import { controlOf, districtHolder, topRivalControl } from './territory';
import type { BribeChannel, Family, GameState } from './types';

// ── tuning (lane-local so the lane stays isolated; canon-review before any balance change) ────────────────
export interface RivalStrategyTuning {
  /** heat ≥ this (or a bust looming) → RETREAT: lay low, stop expanding, buy protection. */
  retreatHeat: number;
  /** heat ≥ this → CONSOLIDATE: hold what you have, fewer fresh bets. */
  consolidateHeat: number;
  /** federal warning tier ≥ this → RETREAT regardless of heat (a bust is the existential threat). */
  retreatFedTier: number;
  /** a held district whose strongest challenger is within this control gap is "threatened" → DEFEND it. */
  defendGap: number;
  /** only push a district where our control ÷ the leader's clears this (don't feed a hopeless attack). */
  offenseMinEdge: number;
  /** offensive-score multiplier while RETREATing (heavy damp) and CONSOLIDATEing (light damp). */
  retreatDamp: number;
  consolidateDamp: number;
  /** cash the rival commits to a needed bribery channel per decision (mirrors AI_BRIBE_AMOUNT). */
  bribeStep: number;
}

export const RIVAL_STRATEGY_TUNING: RivalStrategyTuning = {
  retreatHeat: 75,
  consolidateHeat: 50,
  retreatFedTier: 3,
  defendGap: 8,
  offenseMinEdge: 0.6,
  retreatDamp: 0.4,
  consolidateDamp: 0.7,
  bribeStep: 20,
};

// ── POSTURE — retreat under heat / federal pressure ──────────────────────────────────────────────────────
export type RivalPosture = 'expand' | 'consolidate' | 'retreat';

/**
 * The rival's strategic posture from its heat + federal exposure. A looming bust (armed, or the imminent
 * federal tier) or very high heat → RETREAT (lay low). Moderate heat or any federal warning → CONSOLIDATE.
 * Otherwise EXPAND. Pure read.
 */
export function rivalPosture(family: Family, tuning: RivalStrategyTuning = RIVAL_STRATEGY_TUNING): RivalPosture {
  const fedTier = fedWarningTier(federalExposure(family));
  if (family.bustArmed || fedTier >= tuning.retreatFedTier || family.heat >= tuning.retreatHeat) return 'retreat';
  if (family.heat >= tuning.consolidateHeat || fedTier >= 1) return 'consolidate';
  return 'expand';
}

/** The offensive-score multiplier for a posture (1 = no damp). Defensive/cooling actions are never damped. */
export function postureDamp(posture: RivalPosture, tuning: RivalStrategyTuning = RIVAL_STRATEGY_TUNING): number {
  if (posture === 'retreat') return tuning.retreatDamp;
  if (posture === 'consolidate') return tuning.consolidateDamp;
  return 1;
}

// ── DEFEND — shore up a threatened district ──────────────────────────────────────────────────────────────
export interface DefenseTarget {
  districtId: string;
  /** Our control minus the strongest challenger's — small (or negative) ⇒ more urgent. */
  gap: number;
}

/**
 * The most-threatened district the family leads/holds: one where it has the top control but a rival challenger
 * is within `defendGap` of it (closing in). Returns the tightest such race, or undefined when every hold is
 * safe. Pure read.
 */
export function districtToDefend(
  state: GameState,
  familyId: string,
  tuning: RivalStrategyTuning = RIVAL_STRATEGY_TUNING,
): DefenseTarget | undefined {
  let best: DefenseTarget | undefined;
  for (const d of state.districts) {
    const mine = controlOf(d, familyId);
    if (mine <= 0) continue;
    const challenger = topRivalControl(d, familyId);
    if (!challenger) continue;             // uncontested → nothing to defend
    if (challenger.control > mine) continue; // we're already behind here — that's an offense/abandon call, not a defend
    const gap = mine - challenger.control;
    if (gap <= tuning.defendGap && (!best || gap < best.gap)) best = { districtId: d.id, gap };
  }
  return best;
}

// ── TARGET — pick the best district to push into ─────────────────────────────────────────────────────────
export interface OffenseTarget {
  districtId: string;
  /** Higher ⇒ a better opportunity (more of our foothold, weaker leader). */
  score: number;
}

/**
 * The best district to expand into: not already ours, and either uncontested or one where our foothold clears
 * `offenseMinEdge` of the leader's control (so we don't feed a hopeless push). Scored to prefer a real foothold
 * against a weak leader. Returns undefined when no district is worth attacking. Pure read.
 */
export function districtToAttack(
  state: GameState,
  familyId: string,
  tuning: RivalStrategyTuning = RIVAL_STRATEGY_TUNING,
): OffenseTarget | undefined {
  let best: OffenseTarget | undefined;
  for (const d of state.districts) {
    if (districtHolder(d) === familyId) continue; // already ours
    const mine = controlOf(d, familyId);
    const leader = topRivalControl(d, familyId);
    const leaderControl = leader?.control ?? 0;
    const beatable = leaderControl === 0 || mine >= leaderControl * tuning.offenseMinEdge;
    if (!beatable) continue;
    const score = mine + (CONTROL_HOLD - leaderControl); // our foothold + the leader's weakness
    if (!best || score > best.score) best = { districtId: d.id, score };
  }
  return best;
}

// ── ALLOCATE BRIBERY — the single channel most needed now ────────────────────────────────────────────────
export interface BribePlan {
  channel: BribeChannel;
  /** The new ABSOLUTE amount for the channel (current + a step) — matches the setBribe slider command. */
  amount: number;
  /** Extra cash over the current allocation this plan costs. */
  delta: number;
}

/**
 * The channel a family should bribe next, driven by the TELEGRAPHED federal warning it has actually reached
 * (federal pressure is always telegraphed a tick ahead, so reacting to fedWarningLevel is fair, not omniscient):
 *   • a bust armed / imminent tier (3) → FEDS (shield against the federal shock)
 *   • agents near the fronts (tier 2)  → JUDGES (survive a bust if it lands)
 *   • asking questions (tier 1)        → POLITICIANS (faster heat decay to cool back down)
 * Police stays the flat heat retainer ai.ts already buys — this layer adds the OTHER three channels under
 * federal pressure. Returns undefined when no federal warning is active. Pure read.
 */
export function bribeAllocation(
  family: Family,
  tuning: RivalStrategyTuning = RIVAL_STRATEGY_TUNING,
): BribePlan | undefined {
  let channel: BribeChannel | undefined;
  if (family.bustArmed || family.fedWarningLevel >= 3) channel = 'feds';
  else if (family.fedWarningLevel >= 2) channel = 'judges';
  else if (family.fedWarningLevel >= 1) channel = 'politicians';
  if (!channel) return undefined;
  const current = family.bribes[channel] ?? 0;
  return { channel, amount: current + tuning.bribeStep, delta: tuning.bribeStep };
}

/** Whether the family can currently afford a bribery plan (the step over its existing allocation). */
export function canAffordBribe(family: Family, plan: BribePlan): boolean {
  return family.cash >= plan.delta;
}

// Re-export the cost the offense/defense expand decisions gate on, so ai.ts reads one source.
export { EXPAND_COST };
