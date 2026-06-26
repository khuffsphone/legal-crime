// DISTRICT RACKET POSTURE (Variant A) — PURE & deterministic; imports NO Phaser. A NEW system: each
// PLAYER-controlled district runs under one posture (BALANCED / AGGRESSIVE / FORTIFIED / LOW_PROFILE) that
// trades economy for risk. This module is the pure MODEL: the modifier table, the wrapper selectors that
// APPLY the modifiers to existing economy/heat/collector/control values (so tick/applyCommand/commands stay
// untouched — callers wrap their EXISTING values through these), the change state machine (cooldown +
// next-period-boundary application, slower while CONTESTED), the bribery BENDS (bounded, never immunity), and
// the op-preview surfaces (a modifier line + a NO-X-RAY rival-pressure token).
//
// ⭐ COLLECTORS STAY AUTONOMOUS: posture only scales their carry/risk through the wrappers here — it adds NO
// command, NO manual routing. ⭐ NO-X-RAY: a rival contest of a postured district surfaces ONLY as a rumor
// token (Unknown / visible only), never a rival count or position.
//
// EMBODIED-SETTER SEAM (Variant C, NOT built now): the change API is split into requestPosture (stage) +
// applyPostureBoundary (promote). A future embodied "set posture" act reuses the EXISTING framework in
// extortionEmbodied.ts (canIssueMoveAndSabotage / createMoveAndSabotageAct) and, on resolve, calls
// requestPosture(district, posture, tick) — no new act framework. canRequestPosture is the gate it asks first.

import {
  POSTURE_CHANGE_COOLDOWN_TICKS, POSTURE_APPLY_DELAY_TICKS, POSTURE_CONTESTED_EXTRA_TICKS,
  POSTURE_FEDS_EVIDENCE_PER, POSTURE_FEDS_EVIDENCE_MAX, POSTURE_EVIDENCE_FLOOR,
  POSTURE_POLICE_SAFETY_PER, POSTURE_POLICE_SAFETY_MAX, POSTURE_SAFETY_CAP,
  POSTURE_POLICE_DEFENSE_PER, POSTURE_POLICE_DEFENSE_MAX,
  POSTURE_JUDGES_BACKFIRE_PER, POSTURE_JUDGES_BACKFIRE_MAX,
} from './constants';
import { districtStatusOf } from './districtStatus';
import { UNKNOWN, VISIBLE_ONLY, type PreviewRow } from './opPreviewTypes';
import type { District, DistrictPosture, Family, GameState } from './types';

// ── THE MODIFIER TABLE (starting tuning — canon-review before any balance change) ───────────────────────
// Every field is a MULTIPLIER (1.0 = neutral). The prompt's "+15%"/"−10%" deltas are normalised to
// multipliers (1.15 / 0.90) so application is uniform: adjusted = base × mult.
export interface PostureMods {
  dirtyIncome: number;            // crime (dirty) income from the district's rackets
  cleanIncome: number;            // laundered (clean) income — LOW_PROFILE legitimacy
  controlPressureOut: number;     // how hard the district pushes control into neighbours
  rivalProvocation: number;       // how strongly it provokes rival contest
  localHeatGain: number;          // local police-heat generated
  collectorCarry: number;         // how much an autonomous collector hauls per run
  collectorAmbushRisk: number;    // ambush risk on collector runs (<1 = safer)
  defense: number;                // combat defense of the district's muscle
  controlDecayResistance: number; // resistance to control decay (≥1 = decays slower)
  expansionPressure: number;      // outward expansion drive
  federalEvidenceGain: number;    // federal EVIDENCE accrued from this district's dirty exposure
}

const NEUTRAL: PostureMods = {
  dirtyIncome: 1, cleanIncome: 1, controlPressureOut: 1, rivalProvocation: 1, localHeatGain: 1,
  collectorCarry: 1, collectorAmbushRisk: 1, defense: 1, controlDecayResistance: 1, expansionPressure: 1,
  federalEvidenceGain: 1,
};

export const POSTURE_MODS: Record<DistrictPosture, PostureMods> = {
  BALANCED: { ...NEUTRAL },
  AGGRESSIVE: { ...NEUTRAL, dirtyIncome: 1.25, controlPressureOut: 1.15, rivalProvocation: 1.20, localHeatGain: 1.20, collectorCarry: 1.15, defense: 0.90 },
  FORTIFIED: { ...NEUTRAL, dirtyIncome: 0.95, controlDecayResistance: 1.25, defense: 1.25, collectorAmbushRisk: 0.80, localHeatGain: 1.05, expansionPressure: 0.90 },
  LOW_PROFILE: { ...NEUTRAL, dirtyIncome: 0.70, cleanIncome: 1.05, localHeatGain: 0.70, federalEvidenceGain: 0.80, controlPressureOut: 0.75, collectorCarry: 0.80 },
};

export const POSTURES: readonly DistrictPosture[] = ['BALANCED', 'AGGRESSIVE', 'FORTIFIED', 'LOW_PROFILE'];

// ── reads ───────────────────────────────────────────────────────────────────────────────────────────
/** The ACTIVE posture of a district (absent ⇒ BALANCED). Pure. */
export function postureOf(d: District): DistrictPosture {
  return d.posture?.active ?? 'BALANCED';
}
/** A staged-but-not-yet-applied posture, or null. Pure. */
export function pendingPostureOf(d: District): DistrictPosture | null {
  return d.posture?.pending ?? null;
}
/** The modifier table for a district's active posture. Pure. */
export function postureMods(d: District): PostureMods {
  return POSTURE_MODS[postureOf(d)];
}

// ── MODIFIER APPLICATION (wrap an EXISTING base value through the district's posture) ───────────────────
// These never read or write tick/applyCommand/commands — a caller passes its already-computed base and gets
// the posture-adjusted value back. BALANCED ⇒ identity (so wiring is a no-op until a posture is set).

/** Crime (dirty) income from a district's racket, posture-scaled. Floored to whole dollars (matches the
 * economy's Math.floor accrual). The natural wrap point is accrueUncollected (it already has the district). */
export function posturedDirtyIncome(base: number, d: District): number {
  return Math.floor(base * postureMods(d).dirtyIncome);
}
/** Laundered (clean) income, posture-scaled (LOW_PROFILE legitimacy bonus). */
export function posturedCleanIncome(base: number, d: District): number {
  return base * postureMods(d).cleanIncome;
}
/** Local police-heat gain, posture-scaled. */
export function posturedLocalHeat(base: number, d: District): number {
  return base * postureMods(d).localHeatGain;
}
/** Outward control pressure, posture-scaled. */
export function posturedControlPressureOut(base: number, d: District): number {
  return base * postureMods(d).controlPressureOut;
}
/** Control DECAY, posture-scaled by resistance (FORTIFIED decays slower). */
export function posturedControlDecay(baseDecay: number, d: District): number {
  return baseDecay / postureMods(d).controlDecayResistance;
}
/** Rival provocation pressure, posture-scaled (AGGRESSIVE provokes more). A pressure number — NOT a reveal. */
export function posturedProvocation(base: number, d: District): number {
  return base * postureMods(d).rivalProvocation;
}
/** Expansion drive, posture-scaled. */
export function posturedExpansionPressure(base: number, d: District): number {
  return base * postureMods(d).expansionPressure;
}

// ── COLLECTORS (autonomous — these only SCALE carry/risk; they add no routing) ──────────────────────────
/** How much an autonomous collector hauls, posture-scaled. */
export function posturedCollectorCarry(base: number, d: District): number {
  return base * postureMods(d).collectorCarry;
}
/**
 * Collector run SAFETY (a 0..1 safe fraction), posture-scaled + bent by the POLICE bribe. FORTIFIED's lower
 * ambush risk pulls safety toward 1; the police bribe bends it further — but a hard cap (POSTURE_SAFETY_CAP)
 * keeps it under 1.0, so a collector is NEVER immune. Pure.
 */
export function posturedCollectorSafety(base: number, d: District, policeBribe = 0): number {
  const reduction = 1 - postureMods(d).collectorAmbushRisk;          // 0.20 for FORTIFIED, 0 otherwise
  let safety = base + (1 - base) * reduction;                        // pull toward 1 by the risk reduction
  safety += Math.min(POSTURE_POLICE_SAFETY_MAX, Math.max(0, policeBribe) * POSTURE_POLICE_SAFETY_PER);
  return Math.min(POSTURE_SAFETY_CAP, Math.max(0, safety));          // never immunity
}

// ── DEFENSE + FEDERAL EVIDENCE (bribery BENDS, never immunity) ──────────────────────────────────────────
/** District combat defense, posture-scaled + bent UP by the POLICE bribe (FORTIFIED especially). Bounded. */
export function posturedDefense(base: number, d: District, policeBribe = 0): number {
  const bend = 1 + Math.min(POSTURE_POLICE_DEFENSE_MAX, Math.max(0, policeBribe) * POSTURE_POLICE_DEFENSE_PER);
  return base * postureMods(d).defense * bend;
}
/**
 * Federal EVIDENCE gained from this district's DIRTY exposure, posture-scaled (LOW_PROFILE −20%, AGGRESSIVE
 * neutral here — its evidence rises because its dirty income rises, never a flat punishment) and bent DOWN by
 * the FEDS bribe. A hard floor (POSTURE_EVIDENCE_FLOOR) keeps evidence non-zero — bribery bends, never grants
 * immunity. ALWAYS tied to the passed dirty-exposure base. Pure.
 */
export function posturedFederalEvidence(base: number, d: District, fedsBribe = 0): number {
  const bribeRelief = Math.min(POSTURE_FEDS_EVIDENCE_MAX, Math.max(0, fedsBribe) * POSTURE_FEDS_EVIDENCE_PER);
  const factor = Math.max(POSTURE_EVIDENCE_FLOOR, postureMods(d).federalEvidenceGain * (1 - bribeRelief));
  return base * factor;
}
/**
 * Mitigation fraction (0..cap) softening a FAILED AGGRESSIVE consequence, bought with the JUDGES bribe. Only
 * AGGRESSIVE postures backfire this way; bounded by POSTURE_JUDGES_BACKFIRE_MAX so it never fully cancels the
 * consequence. Returns 0 for non-AGGRESSIVE. Pure.
 */
export function aggressiveBackfireMitigation(d: District, judgesBribe = 0): number {
  if (postureOf(d) !== 'AGGRESSIVE') return 0;
  return Math.min(POSTURE_JUDGES_BACKFIRE_MAX, Math.max(0, judgesBribe) * POSTURE_JUDGES_BACKFIRE_PER);
}

// ── THE CHANGE STATE MACHINE (cooldown · next-period-boundary application · slower while CONTESTED) ──────
export interface PostureGate { ok: boolean; reason: string; }

/** Whether the player may POSTURE this district at all: it must be one they run (HELD / ESTABLISHING, or
 * CONTESTED while leading). A NEUTRAL/RIVAL district isn't theirs to set. Pure read. */
export function isPosturable(state: GameState, districtId: string): boolean {
  const row = districtStatusOf(state, districtId);
  if (!row) return false;
  if (row.status === 'HELD' || row.status === 'ESTABLISHING') return true;
  return row.status === 'CONTESTED' && row.owner === state.player.id; // contested-but-leading is still yours to set
}

/** The cooldown (in settlements) this district needs between posture changes — longer while CONTESTED. Pure. */
export function postureCooldownTicks(state: GameState, districtId: string): number {
  const contested = districtStatusOf(state, districtId)?.status === 'CONTESTED';
  return POSTURE_CHANGE_COOLDOWN_TICKS + (contested ? POSTURE_CONTESTED_EXTRA_TICKS : 0);
}

/** Whether the player can REQUEST a posture change on this district right now. Gates: it's theirs to set, and
 * the change cooldown (longer while contested) has elapsed since the last change took effect. Pure read. */
export function canRequestPosture(state: GameState, districtId: string, nowTick: number): PostureGate {
  if (!isPosturable(state, districtId)) return { ok: false, reason: "you don't run this block" };
  const d = state.districts.find((x) => x.id === districtId)!;
  const cooldown = postureCooldownTicks(state, districtId);
  const since = nowTick - (d.posture?.setTick ?? Number.NEGATIVE_INFINITY);
  if (since < cooldown) return { ok: false, reason: `still settling — ${cooldown - since} more` };
  const contested = districtStatusOf(state, districtId)?.status === 'CONTESTED';
  return { ok: true, reason: contested ? 'change is slower under fire' : 'ready' };
}

/**
 * STAGE a posture change (Variant-A picker, OR the future embodied setter's resolve step). Sets `pending` +
 * `requestTick`; the change PROMOTES at the next period boundary via applyPostureBoundary. Returns true if a
 * change was actually queued (a no-op when the target equals the active posture with nothing pending). Pure
 * (mutates the district). The CALLER is responsible for the canRequestPosture gate.
 */
export function requestPosture(d: District, posture: DistrictPosture, nowTick: number): boolean {
  const active = postureOf(d);
  if (posture === active && !d.posture?.pending) return false;
  d.posture = { active, pending: posture, setTick: d.posture?.setTick ?? 0, requestTick: nowTick };
  return true;
}

/**
 * PROMOTE a staged posture at a PERIOD BOUNDARY (called from the real-time wrapper when a settlement fires).
 * A staged change lands once it has waited the apply delay (one boundary), or an EXTRA delay while the
 * district is CONTESTED. Returns the newly-applied posture, or null if nothing promoted. Pure (mutates).
 */
export function applyPostureBoundary(state: GameState, districtId: string, nowTick: number): DistrictPosture | null {
  const d = state.districts.find((x) => x.id === districtId);
  const ps = d?.posture;
  if (!d || !ps?.pending) return null;
  const contested = districtStatusOf(state, districtId)?.status === 'CONTESTED';
  const need = POSTURE_APPLY_DELAY_TICKS + (contested ? POSTURE_CONTESTED_EXTRA_TICKS : 0);
  if (nowTick - (ps.requestTick ?? nowTick) < need) return null; // still landing (slower under fire)
  const applied = ps.pending;
  d.posture = { active: applied, setTick: nowTick };
  return applied;
}

// ── OP-PREVIEW SURFACES (the modifier line + the NO-X-RAY rival-pressure token) ──────────────────────────
/** A signed-percent string for a multiplier, e.g. 1.25 → "+25%", 0.7 → "−30%". '' for neutral. */
function pct(mult: number): string {
  const d = Math.round((mult - 1) * 100);
  return d === 0 ? '' : `${d > 0 ? '+' : '−'}${Math.abs(d)}%`;
}

/** The active posture's modifier line for an operation preview (a detail row). Plain numbers, no colour. */
export function posturePreviewRow(d: District): PreviewRow {
  const p = postureOf(d);
  const m = POSTURE_MODS[p];
  if (p === 'BALANCED') return { label: 'Posture', value: 'BALANCED — neutral racket', tone: 'neutral' };
  const parts: string[] = [];
  if (m.dirtyIncome !== 1) parts.push(`dirty income ${pct(m.dirtyIncome)}`);
  if (m.localHeatGain !== 1) parts.push(`heat ${pct(m.localHeatGain)}`);
  if (m.defense !== 1) parts.push(`defense ${pct(m.defense)}`);
  if (m.federalEvidenceGain !== 1) parts.push(`evidence ${pct(m.federalEvidenceGain)}`);
  return { label: 'Posture', value: `${p} — ${parts.join(', ')}`, tone: 'neutral' };
}

/**
 * The rival-pressure read for a postured district — NO-X-RAY. A contest surfaces ONLY as a rumor token
 * (Unknown strength while in sight, "visible only" while fogged): the player learns pressure is RISING, never
 * a rival count or position. AGGRESSIVE raises provocation, so the rumor reads hotter — but still never a
 * number. Pure read.
 */
export function postureContestRumor(state: GameState, districtId: string, isVisible = true): PreviewRow {
  const contested = districtStatusOf(state, districtId)?.status === 'CONTESTED';
  if (!contested) {
    const d = state.districts.find((x) => x.id === districtId);
    const hot = d && postureOf(d) === 'AGGRESSIVE';
    return { label: 'Rival pressure', value: hot ? 'your aggression draws eyes' : 'none reported', tone: hot ? 'risk' : 'neutral' };
  }
  // contested: pressure is rising, but the rival's strength/position is NEVER revealed.
  return { label: 'Rival pressure', value: isVisible ? UNKNOWN : VISIBLE_ONLY, tone: 'risk' };
}

export type { Family };
