// COMBAT DEPTH · PART 2 — RIVAL OFFENSIVE AI, a PURE PLANNER (Phaser-free, seeded). The builder-only rival AI
// gains offense as a planner WRAPPER that emits ONLY two order kinds — contestFront (the mirror of the player
// RETAKE) and interceptUnit (the mirror of the player ATTACK) — reusing the existing menace/contest + 35a
// combat. It adds NO new raid/sabotage/assassinate verbs and does NOT touch the resolver/tick/applyCommand:
// it returns a plan; the wrapper applies it by moving rival muscle (the existing systems then resolve it).
//
// ⚠ BALANCE-GATED — START CONSERVATIVE. Long cooldowns, a commitment cap of ONE, an odds check (only commit
// with a clear advantage), a recovery/garrison guard, and a timid seeded commit roll. The aggression table is
// at the top and is the ONLY knob. ⚠ NEEDS A HUMAN BALANCE PLAYTEST before ANY aggression increase.

import { Rng } from './rng';

/** ⚠ THE AGGRESSION TABLE (canon review + human playtest before raising any of these). Biased TOO TIMID. */
export interface RivalOffenseTuning {
  /** Minimum seconds between a rival's offensives (LONG — a rival rarely acts). */
  cooldownSeconds: number;
  /** Max simultaneous offensive orders per rival (LOW commitment — one at a time). */
  maxConcurrent: number;
  /** Commit ONLY with at least this strength ratio over the target's defenders (a clear edge). */
  minAdvantage: number;
  /** Even when fully eligible, commit only with this seeded probability (usually waits — timid). */
  commitChance: number;
  /** Never commit below this many free, healthy combatants (keep a garrison). */
  minMuscle: number;
}

export const RIVAL_OFFENSE_TUNING: RivalOffenseTuning = {
  cooldownSeconds: 60,  // a full minute between offensives
  maxConcurrent: 1,     // never more than one offensive in flight
  minAdvantage: 1.6,    // need a clear 1.6× edge to even consider it
  commitChance: 0.35,   // and even then, usually holds back
  minMuscle: 2,         // always leave a garrison behind
};

export type RivalOrder =
  | { kind: 'contestFront'; rivalId: string; frontId: string; gx: number; gy: number }
  | { kind: 'interceptUnit'; rivalId: string; targetUnitId: string; gx: number; gy: number };

export interface FrontTarget { frontId: string; gx: number; gy: number; defenderStrength: number; }
export interface UnitTarget { id: string; gx: number; gy: number; defenderStrength: number; }

export interface RivalOffenseInput {
  rivalId: string;
  nowSec: number;
  /** When this rival last launched an offensive (drives the cooldown). */
  lastOffenseSec: number;
  /** Open offensive orders this rival already has in flight (the commitment cap). */
  activeOrders: number;
  /** Count of free, healthy rival combatants available to commit. */
  freeMuscle: number;
  /** The rival's committable strength (e.g. muscle count × a tier weight). */
  attackerStrength: number;
  /** Player-held fronts the rival could CONTEST (retake mirror). */
  fronts: readonly FrontTarget[];
  /** Player units the rival could INTERCEPT (attack mirror). */
  units: readonly UnitTarget[];
  /** Deterministic RNG cursor (state.rngState) for the seeded commit roll. */
  rngState: number;
}

export interface RivalOffensePlan {
  orders: RivalOrder[];
  /** The advanced RNG cursor — the caller writes it back so the world stays deterministic. */
  rngState: number;
}

/**
 * Decide a rival's offensive orders for this beat. Returns an empty plan UNLESS every conservative gate
 * passes: off cooldown, under the commitment cap, holding a garrison, a target where the odds clear
 * minAdvantage, AND a timid seeded commit roll. Commits to at most (cap − active) of the BEST-odds targets —
 * never beyond the commitment cap. Pure + seeded-deterministic (same input + rngState ⇒ same plan).
 */
export function planRivalOffense(input: RivalOffenseInput, tuning: RivalOffenseTuning = RIVAL_OFFENSE_TUNING): RivalOffensePlan {
  const rng = new Rng(input.rngState);
  const none = (): RivalOffensePlan => ({ orders: [], rngState: rng.state });

  // ── conservative GUARDS (bias too timid) ──────────────────────────────────────────────────────
  if (input.nowSec - input.lastOffenseSec < tuning.cooldownSeconds) return none(); // still on cooldown
  if (input.activeOrders >= tuning.maxConcurrent) return none();                    // at the commitment cap
  if (input.freeMuscle < tuning.minMuscle) return none();                           // hold a garrison / recover

  // ── ODDS CHECK — only targets where the rival has a clear advantage ───────────────────────────
  const scored: { order: RivalOrder; ratio: number }[] = [];
  for (const f of input.fronts) {
    if (input.attackerStrength >= f.defenderStrength * tuning.minAdvantage) {
      scored.push({ order: { kind: 'contestFront', rivalId: input.rivalId, frontId: f.frontId, gx: f.gx, gy: f.gy }, ratio: input.attackerStrength / Math.max(0.0001, f.defenderStrength) });
    }
  }
  for (const u of input.units) {
    if (input.attackerStrength >= u.defenderStrength * tuning.minAdvantage) {
      scored.push({ order: { kind: 'interceptUnit', rivalId: input.rivalId, targetUnitId: u.id, gx: u.gx, gy: u.gy }, ratio: input.attackerStrength / Math.max(0.0001, u.defenderStrength) });
    }
  }
  if (scored.length === 0) return none(); // no favourable target → do nothing

  // ── timid seeded COMMIT roll (advances the RNG exactly once, deterministically) ───────────────
  if (!rng.chance(tuning.commitChance)) return { orders: [], rngState: rng.state }; // eligible but holds back

  // commit to the BEST-odds target(s), never beyond the remaining commitment budget.
  scored.sort((a, b) => b.ratio - a.ratio);
  const budget = Math.max(0, tuning.maxConcurrent - input.activeOrders);
  return { orders: scored.slice(0, budget).map((s) => s.order), rngState: rng.state };
}
