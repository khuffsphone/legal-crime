// COMBAT DEPTH · PART 1 — WEAPON-TIER + SKILL tuning (pure; Phaser-free). A TUNING-TABLE EXTENSION the 35a
// resolver READS — it is NOT a rewrite of the resolver. Tier 0 (no weapon) + skill 0 reproduce EXACTLY the
// current flat values (COMBAT_MELEE_DAMAGE / COMBAT_ATTACK_INTERVAL / COMBAT_ENGAGE_RANGE), so existing
// combat behaviour and tests are unchanged. tick()/applyCommand() are untouched.
//
// ⭐ HARD CAPS (anti-burst-delete): per-hit damage is clamped to MAX_HIT_DAMAGE and the swing interval has a
// floor MIN_ATTACK_INTERVAL, so even max-tier + max-skill can NEVER one-shot a fresh thug (≥3 hits) and DPS
// is bounded (≤ MAX_HIT_DAMAGE / MIN_ATTACK_INTERVAL). The cap values are documented at the top here for
// canon review.

import { COMBAT_ATTACK_INTERVAL, COMBAT_ENGAGE_RANGE, COMBAT_MELEE_DAMAGE } from './constants';
import type { MovableUnit } from './movement';
import type { WeaponTier } from './types';

/** Per-weapon multipliers vs the tier-0 base. dmg/range scale up the swing; cadence scales the INTERVAL
 * (lower = faster). A plain thug (no weapon) is the NEUTRAL 1.0/1.0/1.0 baseline. */
export interface WeaponMult { dmg: number; range: number; cadence: number; }

const NEUTRAL: WeaponMult = { dmg: 1, range: 1, cadence: 1 };

export const WEAPON_TUNING: Record<WeaponTier, WeaponMult> = {
  pistol:      { dmg: 1.25, range: 1.30, cadence: 0.90 }, // quick, a little reach
  shotgun:     { dmg: 1.60, range: 1.10, cadence: 1.15 }, // big hit, slow, short
  rifle:       { dmg: 1.50, range: 1.60, cadence: 0.85 }, // reach + cadence
  hitman:      { dmg: 1.90, range: 1.20, cadence: 0.80 }, // the deadliest specialist
  demolitions: { dmg: 1.70, range: 1.00, cadence: 1.25 }, // heavy + slow
};

// ── deterministic SKILL modifiers (skill 0..10; a unit with no skill ⇒ 0, no modifier) ─────────────
export const SKILL_DMG_PER = 0.04;     // attacker: +4% outgoing damage per skill point
export const SKILL_CADENCE_PER = 0.02; // attacker: −2% swing interval per skill point (faster)
export const SKILL_DEF_PER = 0.03;     // defender: −3% incoming damage taken per skill point

// ── ⭐ HARD CAPS (documented for canon review) ─────────────────────────────────────────────────────
/** Per-hit damage ceiling. THUG_MAX_HEALTH is 100, so a fresh thug always survives ≥3 hits — NO one-shot. */
export const MAX_HIT_DAMAGE = 45;
/** Swing-interval floor (seconds). Caps cadence so DPS ≤ MAX_HIT_DAMAGE / MIN_ATTACK_INTERVAL (= 100/s). */
export const MIN_ATTACK_INTERVAL = 0.45;
const MAX_SKILL = 10;

function multFor(u: Pick<MovableUnit, 'weapon'>): WeaponMult {
  return u.weapon ? WEAPON_TUNING[u.weapon] : NEUTRAL;
}

function skillOf(u: { skill?: number }): number {
  return Math.max(0, Math.min(MAX_SKILL, u.skill ?? 0));
}

/**
 * Per-swing damage `attacker` deals to `target`: base × weapon-tier × (1 + attacker skill) reduced by the
 * target's defensive skill, then HARD-CLAMPED to MAX_HIT_DAMAGE (no burst-delete). Tier-0/skill-0 ⇒ exactly
 * COMBAT_MELEE_DAMAGE. Pure.
 */
export function meleeDamage(attacker: MovableUnit, target: MovableUnit): number {
  const out = COMBAT_MELEE_DAMAGE * multFor(attacker).dmg * (1 + skillOf(attacker) * SKILL_DMG_PER);
  const afterDef = out * (1 - skillOf(target) * SKILL_DEF_PER);
  return Math.min(MAX_HIT_DAMAGE, Math.max(0, afterDef));
}

/**
 * `attacker`'s swing interval (seconds): base × weapon-cadence × (1 − attacker skill), FLOORED at
 * MIN_ATTACK_INTERVAL so cadence can never spiral into a burst. Tier-0/skill-0 ⇒ COMBAT_ATTACK_INTERVAL. Pure.
 */
export function attackInterval(attacker: MovableUnit): number {
  const raw = COMBAT_ATTACK_INTERVAL * multFor(attacker).cadence * (1 - skillOf(attacker) * SKILL_CADENCE_PER);
  return Math.max(MIN_ATTACK_INTERVAL, raw);
}

/** `attacker`'s engagement range (tiles): base × weapon-range. Tier-0 ⇒ COMBAT_ENGAGE_RANGE. Pure. */
export function engageRange(attacker: Pick<MovableUnit, 'weapon'>): number {
  return COMBAT_ENGAGE_RANGE * multFor(attacker).range;
}
