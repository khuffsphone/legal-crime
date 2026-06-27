// FAIRNESS slice — TELEGRAPH VISIBILITY TIERS + PLAYER RETREAT resolution. PURE & deterministic; imports NO
// Phaser. The cautionary tale is Gangsters: Organized Crime — its systems were deep but its information
// feedback was poor, so rival offensives felt unfair. This module makes a rival strike LEGIBLE BEFORE it
// resolves, graduated by the player's OWN intel, and makes the defensive response change the outcome.
//
// It builds ON the merged DRP / rival-offense surface (sequence, don't fight it): it REUSES the rival
// telegraph lead math (strikeLeadMs), the rival retreat gate (RIVAL_RETREAT_TUNING.abortAdvantage), the
// fog visibility layer (isRevealed), and the NO-X-RAY tokens (UNKNOWN / VISIBLE_ONLY) — adding only the
// player-facing fairness layer on top. tick()/applyCommand()/commands.ts are NOT touched.
//
// ⭐ NO-X-RAY is ABSOLUTE. Nothing here ever takes — let alone surfaces — the hidden rival's position. A
// TelegraphReport has NO field for it by construction: it describes the THREAT, the player's OWN geography
// /asset under threat, an ETA bucket, and a severity. resolveStrike takes attacker STRENGTH (a scalar), not
// coordinates. The most intel can ever buy is an earlier, clearer warning about YOUR OWN holdings — never
// omniscience about where the rival is.

import { isRevealed, type FogState } from './fog';
import type { GridPos } from './iso';
import { UNKNOWN, VISIBLE_ONLY, type PreviewRow } from './opPreviewTypes';
import { strikeLeadMs, RIVAL_RETREAT_TUNING, type RivalStrikeReason } from './rivalOffense';

// ── VISIBILITY TIERS ────────────────────────────────────────────────────────────────────────────────────
// The warning graduates by the player's OWN presence/intel in/near the target: a well-defended block earns an
// earlier, clearer telegraph; a blind one gets only a street rumor. NEVER full omniscience — 'confirmed'
// still requires eyes-on (a fog-revealed target), and it still never reveals the rival's position.

export type TelegraphTier = 'rumor' | 'suspected' | 'confirmed';
export const TELEGRAPH_TIERS: readonly TelegraphTier[] = ['rumor', 'suspected', 'confirmed'];

/** Tier thresholds (constants — canon-review before any balance change). */
export const TELEGRAPH_PRESENCE_RADIUS = 6;     // tiles — player muscle within this of the target counts as "near"
export const TELEGRAPH_SUSPECTED_MUSCLE = 1;    // ≥ this many friendly nearby → at least 'suspected'
export const TELEGRAPH_CONFIRMED_MUSCLE = 2;    // ≥ this many friendly nearby (WITH eyes-on) → 'confirmed'

/** Intel bonus to the reaction window per tier (ms): better-defended players are warned EARLIER. Tunable. */
export const TELEGRAPH_TIER_LEAD_BONUS_MS: Record<TelegraphTier, number> = {
  rumor: 0,
  suspected: 1000,
  confirmed: 2000,
};

/** The player's own intel about a threatened tile — ALL player-side reads (no rival data). */
export interface PlayerIntel {
  /** Player combatants within TELEGRAPH_PRESENCE_RADIUS of the target (the player's OWN muscle). */
  friendlyNearby: number;
  /** The target tile is inside the player's fog-revealed area (eyes-on). */
  targetRevealed: boolean;
  /** The player holds/controls the target district. */
  controlsDistrict: boolean;
}

/**
 * The telegraph tier the player has earned for a threatened target. CONFIRMED requires eyes-on (a revealed
 * target) AND real presence (enough nearby muscle, or some muscle on a block you own) — so heavy presence on a
 * tile you CANNOT see still tops out at 'suspected' (never omniscience). Pure.
 */
export function telegraphTier(intel: PlayerIntel): TelegraphTier {
  const near = Math.max(0, intel.friendlyNearby);
  if (
    intel.targetRevealed &&
    (near >= TELEGRAPH_CONFIRMED_MUSCLE || (near >= TELEGRAPH_SUSPECTED_MUSCLE && intel.controlsDistrict))
  ) {
    return 'confirmed';
  }
  if (near >= TELEGRAPH_SUSPECTED_MUSCLE || intel.targetRevealed || intel.controlsDistrict) {
    return 'suspected';
  }
  return 'rumor';
}

/** Count the player's own combatants within `radius` tiles of the target. Pure helper for PlayerIntel. */
export function countFriendlyNear(
  friendly: readonly GridPos[], target: GridPos, radius: number = TELEGRAPH_PRESENCE_RADIUS,
): number {
  const r2 = Math.max(0, radius) * Math.max(0, radius);
  let n = 0;
  for (const f of friendly) {
    const dx = f.gx - target.gx, dy = f.gy - target.gy;
    if (dx * dx + dy * dy <= r2) n++;
  }
  return n;
}

/** Whether the target tile is revealed, via the EXISTING fog layer (eyes-on for the 'confirmed' gate). */
export function targetRevealed(fog: FogState, target: GridPos): boolean {
  return isRevealed(fog, target.gx, target.gy);
}

// ── THE TELEGRAPH REPORT (NO-X-RAY by construction) ──────────────────────────────────────────────────────

/** The player's OWN asset under threat — a district, and (at 'confirmed') the specific front/unit. NEVER the
 * rival. There is intentionally NO position/coordinate field anywhere in this type. */
export interface ThreatTarget {
  districtName: string;
  /** A label for the specific player asset under threat (a front's name / "your collector"). 'confirmed' only. */
  assetLabel?: string;
}

/** What the player learns from a telegraph. Threat + own-geography + ETA bucket + severity — NO rival position. */
export interface TelegraphReport {
  tier: TelegraphTier;
  reason: RivalStrikeReason;
  /** 0..1 — how much is at stake (drives lead + severity wording). */
  severity01: number;
  /** The reaction window in ms (base consequence lead + the tier's intel bonus). ALWAYS > 0 before resolution. */
  leadMs: number;
  /** Tier-gated location text — a whole district at 'rumor'; the specific own asset at 'confirmed'. */
  where: string;
  /** Tier-gated ETA text — vague at 'rumor'; a concrete window at 'confirmed'. */
  eta: string;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** A coarse severity word for a 0..1 consequence. Pure. */
export function severityLabel(severity01: number): 'minor' | 'serious' | 'grave' {
  const s = clamp01(severity01);
  if (s >= 0.66) return 'grave';
  if (s >= 0.33) return 'serious';
  return 'minor';
}

/** The reaction window for a telegraph: the consequence-scaled rival lead PLUS the player's intel-tier bonus.
 * REUSES strikeLeadMs (the rival-offense lead curve) so the two layers stay in sequence. Always > 0. Pure. */
export function telegraphLeadMs(tier: TelegraphTier, severity01: number): number {
  return strikeLeadMs(severity01) + TELEGRAPH_TIER_LEAD_BONUS_MS[tier];
}

/**
 * Build the player-facing telegraph for a committed strike. The detail is GATED by the earned tier — a rumor
 * names only the district and stays vague on timing; a confirmed read names the specific own asset and gives a
 * concrete window. By construction it can carry NO rival position. Pure.
 */
export function buildTelegraphReport(
  tier: TelegraphTier, reason: RivalStrikeReason, severity01: number, target: ThreatTarget,
): TelegraphReport {
  const leadMs = telegraphLeadMs(tier, severity01);
  const sev = severityLabel(severity01);
  let where: string;
  let eta: string;
  switch (tier) {
    case 'confirmed':
      where = target.assetLabel
        ? `${target.assetLabel} in ${target.districtName}`
        : `your holdings in ${target.districtName}`;
      eta = `~${Math.round(leadMs / 1000)}s — ${sev}`;
      break;
    case 'suspected':
      where = `your holdings in ${target.districtName}`;
      eta = `soon — ${sev}`;
      break;
    case 'rumor':
    default:
      where = `somewhere in ${target.districtName}`;
      eta = 'the street is uneasy';
      break;
  }
  return { tier, reason, severity01: clamp01(severity01), leadMs, where, eta };
}

/**
 * A NO-X-RAY preview row for the rival pressure behind a telegraph — mirrors districtPosture.postureContestRumor:
 * the player learns pressure is RISING and how confident the read is, NEVER a rival count or position. A fogged
 * target reads 'visible only'. Pure.
 */
export function telegraphPressureRow(tier: TelegraphTier, isVisible = true): PreviewRow {
  if (!isVisible) return { label: 'Rival pressure', value: VISIBLE_ONLY, tone: 'risk' };
  if (tier === 'rumor') return { label: 'Rival pressure', value: UNKNOWN, tone: 'risk' };
  return { label: 'Rival pressure', value: `rising — ${tier}`, tone: 'risk' };
}

// ── PLAYER RETREAT / DEFEND RESOLUTION ───────────────────────────────────────────────────────────────────
// The defensive response the telegraph window makes actionable. The player issues it through the EXISTING order
// /command system — move muscle into the target (reinforce), brace a FORTIFIED posture (brace), or let an
// autonomous collector bank / pull muscle clear (withdraw). This is the PURE resolution of how that response
// changes a committed strike's outcome. NO new sim verb; collectors stay autonomous (withdraw is a state read,
// not a manual route).

export type RetreatResponse =
  | { kind: 'none' }
  | { kind: 'withdraw' }                          // the threatened asset left the strike's reach (it whiffs)
  | { kind: 'reinforce'; addedStrength: number }  // muscle moved into the target → defender strength ↑
  | { kind: 'brace'; defenseMult: number };       // FORTIFIED posture / police bribe → defender strength ×mult

export type StrikeOutcome = 'landed' | 'aborted-no-edge' | 'whiffed-target-gone';

export interface StrikeResolution {
  /** Does the rival strike LAND, or is it broken off / does it whiff? */
  lands: boolean;
  outcome: StrikeOutcome;
  /** The attacker's resulting local strength ratio over the (response-adjusted) defenders. */
  localAdvantage: number;
}

/**
 * Resolve a committed strike against the player's defensive RESPONSE. A WITHDRAW takes the asset out of reach
 * (the strike whiffs). REINFORCE / BRACE raise the local defender strength; if that drops the attacker's edge
 * below `abortAdvantage` the rival breaks off — the SAME gate the rival's own retreat uses (shouldRetreat), so
 * the two layers agree. Otherwise the strike lands. Pure & deterministic.
 */
export function resolveStrike(
  attackerStrength: number,
  defenderStrength: number,
  response: RetreatResponse = { kind: 'none' },
  abortAdvantage: number = RIVAL_RETREAT_TUNING.abortAdvantage,
): StrikeResolution {
  if (response.kind === 'withdraw') {
    return { lands: false, outcome: 'whiffed-target-gone', localAdvantage: 0 };
  }
  let defense = Math.max(0.0001, defenderStrength);
  if (response.kind === 'reinforce') defense += Math.max(0, response.addedStrength);
  if (response.kind === 'brace') defense *= Math.max(0, response.defenseMult);
  const localAdvantage = attackerStrength / Math.max(0.0001, defense);
  if (localAdvantage < abortAdvantage) return { lands: false, outcome: 'aborted-no-edge', localAdvantage };
  return { lands: true, outcome: 'landed', localAdvantage };
}
