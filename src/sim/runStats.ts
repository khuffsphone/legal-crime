// Lane L — RUN STATS. Pure & deterministic; imports NO Phaser (passes the /src/sim purity invariant in
// adapter.test.ts). Satisfying per-run counters accumulated through a match and surfaced at endgame to
// ENRICH Lane E's victory/loss newspaper (it does NOT fork a parallel screen). The counters come in two
// families:
//   • EVENT records  — discrete inflows the scene calls at the moment they happen: funds banked by a
//     collector, the gross income booked at a settlement, a racket brought online, a bribe greased on a
//     channel. These cannot be recovered from a single state snapshot, so they accumulate.
//   • STATE observes — derived from the live GameState at each settlement + once at endgame: turf held
//     (peak & final), rivals put down, federal-heat peak, weeks survived. Every field is a max() or a
//     latest-value, so observeRun() is idempotent — calling it repeatedly never double-counts.
//
// The scene owns the call sites (existing outcome points); tick()/applyCommand() are NEVER edited, and this
// module only READS state (in observeRun). The tally lives on GameState (additive, default-absent) so a
// save round-trips it (JSON clone) and a load resumes the run's stats.

import { districtsHeld } from './territoryWar';
import { federalExposure } from './federal';
import type { BribeChannel, GameState } from './types';

export interface RunStats {
  /** Total cash BANKED via collector deposits (manual + automated routes) — the take you pulled in. */
  fundsBanked: number;
  /** Total GROSS weekly income the empire produced across every settled week. */
  incomeEarned: number;
  /** Most districts the player controlled at any single observation (the high-water mark). */
  districtsPeak: number;
  /** Districts the player controls at the latest observation (the FINAL hold at endgame). */
  districtsFinal: number;
  /** Rival families put in the ground (any cause). Monotonic. */
  rivalsDefeated: number;
  /** Standing bribes greased, by channel (cumulative dollars pushed per channel). */
  bribesByChannel: Record<BribeChannel, number>;
  /** Sum of bribesByChannel — total greased across every channel. */
  bribesTotal: number;
  /** Highest federal exposure (0..100) reached at any observation. */
  federalHeatPeak: number;
  /** Weeks (economic ticks) survived — the latest tick observed (final at endgame). */
  weeksSurvived: number;
  /** Rackets brought online — illegal operations opened + fronts shaken into protection. */
  racketsRun: number;
}

/** A fresh, zeroed tally for a new run. */
export function createRunStats(): RunStats {
  return {
    fundsBanked: 0,
    incomeEarned: 0,
    districtsPeak: 0,
    districtsFinal: 0,
    rivalsDefeated: 0,
    bribesByChannel: { police: 0, judges: 0, politicians: 0, feds: 0 },
    bribesTotal: 0,
    federalHeatPeak: 0,
    weeksSurvived: 0,
    racketsRun: 0,
  };
}

/** Lazily attach + return the run-stat tally on a state (additive, default-absent — so createInitialState
 * stays byte-identical and the determinism/save-load tests are untouched). The scene calls this to get the
 * live tally; the returned object is mutated by the record/observe helpers below. */
export function ensureRunStats(state: GameState): RunStats {
  if (!state.runStats) state.runStats = createRunStats();
  return state.runStats;
}

// ── EVENT records (discrete inflows; non-positive amounts are ignored so the totals only ever climb) ──

/** Bank a collector deposit (the take actually pulled off the streets, after the transit skim). */
export function recordFundsBanked(stats: RunStats, amount: number): void {
  if (amount > 0) stats.fundsBanked += amount;
}

/** Book the gross weekly income the empire produced at a settlement. */
export function recordIncomeEarned(stats: RunStats, amount: number): void {
  if (amount > 0) stats.incomeEarned += amount;
}

/** Record a bribe greased on a channel (the dollars pushed this bump). Tracks per-channel + the total. */
export function recordBribePaid(stats: RunStats, channel: BribeChannel, amount: number): void {
  if (amount <= 0) return;
  stats.bribesByChannel[channel] += amount;
  stats.bribesTotal += amount;
}

/** Record a racket brought online — an operation opened or a front converted to protection. */
export function recordRacketRun(stats: RunStats, count = 1): void {
  if (count > 0) stats.racketsRun += count;
}

// ── STATE observe (monotonic + idempotent; only READS the live state) ───────────────────────────────

/**
 * Sample the live state into the peak/final counters. Call once per SETTLED week (so PEAK turf is captured
 * even if the player later loses ground) and once more at ENDGAME (so FINAL turf + weeks are exact). Every
 * field is a max() or a direct latest-value, so repeated calls never inflate the tally.
 */
export function observeRun(stats: RunStats, state: GameState): void {
  const held = districtsHeld(state, state.player.id).length;
  stats.districtsFinal = held;
  if (held > stats.districtsPeak) stats.districtsPeak = held;

  const defeated = state.rivals.filter((r) => !r.alive).length;
  if (defeated > stats.rivalsDefeated) stats.rivalsDefeated = defeated;

  const exposure = federalExposure(state.player);
  if (exposure > stats.federalHeatPeak) stats.federalHeatPeak = exposure;

  if (state.tick > stats.weeksSurvived) stats.weeksSurvived = state.tick;
}

// ── the newspaper block (the endgame summary tokens Lane E's paper injects under the deck) ───────────

/** A whole-dollar money token with thousands separators: 12450 → "$12,450". Pure (no DOM/Intl). */
function money(n: number): string {
  return `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/**
 * The run-stat summary block — eight compact, order-stable tokens the victory/loss newspaper prints under
 * the deck. Pairs with Lane E's existing "BY THE NUMBERS" column (which carries the final standing); this
 * is the "how the run actually went" enrichment. Deterministic.
 */
export function runStatsSummary(stats: RunStats): string[] {
  return [
    `FUNDS ${money(stats.fundsBanked)}`,
    `INCOME ${money(stats.incomeEarned)}`,
    `PEAK ${stats.districtsPeak} BLOCK${stats.districtsPeak === 1 ? '' : 'S'}`,
    `RIVALS ${stats.rivalsDefeated} DOWN`,
    `RACKETS ${stats.racketsRun}`,
    `TOP HEAT ${Math.round(stats.federalHeatPeak)}`,
    `GREASED ${money(stats.bribesTotal)}`,
    `${stats.weeksSurvived} WEEK${stats.weeksSurvived === 1 ? '' : 'S'}`,
  ];
}
