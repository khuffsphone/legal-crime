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
import { unitCombatStrength } from './combatTuning';
import type { WeaponTier } from './types';

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

// ── COMBAT DEPTH FINALIZE (Part B) — ACCURATE commit force ─────────────────────────────────────────
/** A unit the rival could commit (only its combat-relevant stats matter to the planner). */
export type CommittableUnit = { weapon?: WeaponTier; skill?: number };

export interface CommittedForce<T extends CommittableUnit> {
  /** The units actually SENT on one offensive (strongest-first, garrison reserve withheld). */
  units: T[];
  /** Their summed weapon-tier-weighted strength — what the odds are scored on (NOT the whole idle pool). */
  strength: number;
}

/**
 * The force a rival actually COMMITS to one offensive: its free muscle minus the garrison `reserve`, taken
 * strongest-first, with the SUMMED weapon-tier-weighted strength it will send. Scoring AND dispatching the
 * SAME force is the accuracy fix — today the planner credits itself the whole idle pool, then dispatches
 * one unit (over-credit → under-dispatch). Never sends so many that fewer than `reserve` remain free. Pure.
 */
export function committedForce<T extends CommittableUnit>(freeMuscle: readonly T[], reserve: number): CommittedForce<T> {
  const sorted = [...freeMuscle].sort((a, b) => unitCombatStrength(b) - unitCombatStrength(a));
  const sendable = Math.max(0, sorted.length - Math.max(0, reserve));
  const units = sorted.slice(0, sendable);
  let strength = 0;
  for (const u of units) strength += unitCombatStrength(u);
  return { units, strength };
}

// ── COMBAT DEPTH FINALIZE (Part C-1) — the TELEGRAPH (pre-strike beat) ──────────────────────────────
/** Why a rival is striking — surfaced to the player so the warning is legible (drives the WIRE line). */
export type RivalStrikeReason = 'route exposure' | 'escort gap' | 'payout' | 'proximity' | 'cooldown window';

export interface RivalTelegraph {
  reason: RivalStrikeReason;
  /** Lead time before the muscle actually moves — the player's ONE defensive window. */
  leadMs: number;
}

/** Telegraph lead bounds: the player always gets at least the MIN; a high-consequence strike gets up to MAX
 * (more warning for the bigger threat — you can react to the thing that matters). Tunable. */
export const RIVAL_TELEGRAPH_LEAD_MIN_MS = 1500;
export const RIVAL_TELEGRAPH_LEAD_MAX_MS = 6000;

/** Map a 0..1 consequence to a lead time — higher consequence ⇒ LONGER lead. Pure, clamped. */
export function strikeLeadMs(consequence01: number): number {
  const c = Math.max(0, Math.min(1, consequence01));
  return Math.round(RIVAL_TELEGRAPH_LEAD_MIN_MS + (RIVAL_TELEGRAPH_LEAD_MAX_MS - RIVAL_TELEGRAPH_LEAD_MIN_MS) * c);
}

export interface TelegraphContext {
  /** 0..1 — how much is at stake (front payout / carried cash). Drives the lead. */
  consequence01: number;
  /** The intercept target is a collector carrying a take (route exposure). */
  carrying?: boolean;
  /** The carrier had an escort that the rival is slipping past (escort gap). */
  escorted?: boolean;
}

/**
 * Build the telegraph for a committed order: a 'why' reason + a consequence-scaled lead. The reason reads
 * off the order kind + context (a carried collector ⇒ route-exposure/escort-gap; a contested front ⇒
 * payout; a bare unit ⇒ proximity; nothing notable ⇒ the rival's cooldown just opened). Pure.
 */
export function planTelegraph(kind: RivalOrder['kind'], ctx: TelegraphContext): RivalTelegraph {
  const leadMs = strikeLeadMs(ctx.consequence01);
  let reason: RivalStrikeReason;
  if (kind === 'interceptUnit') {
    reason = ctx.carrying ? (ctx.escorted ? 'escort gap' : 'route exposure') : 'proximity';
  } else {
    reason = ctx.consequence01 >= 0.5 ? 'payout' : (ctx.consequence01 > 0 ? 'proximity' : 'cooldown window');
  }
  return { reason, leadMs };
}

// ── COMBAT DEPTH FINALIZE (Part C-2) — RETREAT when the edge collapses ──────────────────────────────
export interface RivalRetreatTuning {
  /** Break off if the attacker's LOCAL strength ratio over the defenders falls below this (edge gone). */
  abortAdvantage: number;
  /** Or if at least this fraction of the committed force has gone DOWN (losses cap). */
  maxLossFraction: number;
}

/** Conservative retreat seeds — a rival that loses its edge or half its strike force pulls back (fair: it
 * won't grind your defenders down by feeding units into a fight it's losing). Tunable. */
export const RIVAL_RETREAT_TUNING: RivalRetreatTuning = {
  abortAdvantage: 1.1,   // below near-parity → break off
  maxLossFraction: 0.5,  // half the force down → break off
};

/**
 * Whether a committed offensive should RETREAT: its local edge collapsed below abortAdvantage, OR its losses
 * reached maxLossFraction. `localAdvantage` = surviving committed strength ÷ local defender strength;
 * `lossFraction` = downed committed units ÷ initial committed units. Pure.
 */
export function shouldRetreat(localAdvantage: number, lossFraction: number, tuning: RivalRetreatTuning = RIVAL_RETREAT_TUNING): boolean {
  return localAdvantage < tuning.abortAdvantage || lossFraction >= tuning.maxLossFraction;
}
