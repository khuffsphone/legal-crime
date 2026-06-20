// RTS-14 — crew traits. Pure & deterministic; imports NO Phaser. Traits are pure DATA on a
// gangster plus pure MODIFIER functions over existing mechanics (extort, combat, heat, bribery,
// upkeep, loyalty drift/desertion). Every modifier is a no-op for a trait-less crew, so the
// feature is purely additive — existing behaviour and tests are unchanged without traits.

import {
  LOYALTY_GAIN_PAID,
  LOYALTY_DROP_UNPAID,
  LOYALTY_HEAT_DIVISOR,
} from './constants';
import { Rng, seedToCursor } from './rng';
import type { Family, Gangster } from './types';

export type Trait = 'brutal' | 'loyal' | 'greedy' | 'cool' | 'green' | 'connected';

export interface TraitDef {
  trait: Trait;
  label: string;
  blurb: string;
}

export const TRAIT_DEFS: Record<Trait, TraitDef> = {
  brutal: { trait: 'brutal', label: 'Brutal', blurb: 'Leans harder — better at shakedowns and in a fight.' },
  loyal: { trait: 'loyal', label: 'Loyal', blurb: 'Stands by the boss — slow to sour, slow to walk.' },
  greedy: { trait: 'greedy', label: 'Greedy', blurb: 'Wants a bigger cut — costs more to keep.' },
  cool: { trait: 'cool', label: 'Cool', blurb: 'Keeps it quiet — sheds heat and never sweats it.' },
  green: { trait: 'green', label: 'Green', blurb: 'Wet behind the ears — cheap and weak, for now.' },
  connected: { trait: 'connected', label: 'Connected', blurb: 'Knows people — trims the bribe bill.' },
};

export const ALL_TRAITS: Trait[] = ['brutal', 'loyal', 'greedy', 'cool', 'green', 'connected'];

// Trait pairs that cannot co-occur on the same gangster.
const CONFLICTS: ReadonlyArray<readonly [Trait, Trait]> = [['greedy', 'green']];

// ── trait-effect magnitudes (tunables) ───────────────────────────────────────────────────────
export const BRUTAL_EXTORT_BONUS = 0.08; // +extort success per Brutal guarding the district
export const BRUTAL_COMBAT_BONUS = 2; // +effective strength per Brutal in the family
export const COOL_HEAT_RELIEF = 1; // extra heat shed per tick per Cool member
export const CONNECTED_BRIBE_DISCOUNT = 5; // bribe-retainer cut per tick per Connected member
export const GREEDY_UPKEEP = 15; // extra upkeep for a Greedy member
export const GREEN_UPKEEP = -10; // a Green member works cheap
export const LOYAL_DRIFT_SHIELD = 3; // softens a Loyal member's loyalty losses
export const LOYAL_DESERT_FACTOR = 0.5; // Loyal members are half as likely to desert

// ── per-gangster trait access ────────────────────────────────────────────────────────────────

export function gangsterTraits(g: Gangster): Trait[] {
  return g.traits ?? [];
}
export function hasTrait(g: Gangster, t: Trait): boolean {
  return gangsterTraits(g).includes(t);
}

/** Upkeep adjustment from a trait set (Greedy costs more, Green costs less). */
export function traitUpkeepModifier(traits: readonly Trait[]): number {
  let mod = 0;
  if (traits.includes('greedy')) mod += GREEDY_UPKEEP;
  if (traits.includes('green')) mod += GREEN_UPKEEP;
  return mod;
}

// ── crew-level aggregate modifiers (pure over a family) ────────────────────────────────────────

/** Extra extortion success from Brutal gangsters guarding `districtId` (matches muscle gating). */
export function crewExtortBonus(family: Family, districtId: string): number {
  let bonus = 0;
  for (const g of family.gangsters) {
    if (g.assignment.type === 'guard' && g.assignment.districtId === districtId && hasTrait(g, 'brutal')) {
      bonus += BRUTAL_EXTORT_BONUS;
    }
  }
  return bonus;
}

/** Extra effective combat strength from Brutal gangsters anywhere in the family. */
export function crewCombatBonus(family: Family): number {
  return family.gangsters.reduce((s, g) => s + (hasTrait(g, 'brutal') ? BRUTAL_COMBAT_BONUS : 0), 0);
}

/** Extra per-tick heat shed by Cool gangsters. */
export function crewHeatRelief(family: Family): number {
  return family.gangsters.reduce((s, g) => s + (hasTrait(g, 'cool') ? COOL_HEAT_RELIEF : 0), 0);
}

/** Per-tick bribe-retainer discount from Connected gangsters. */
export function crewBribeDiscount(family: Family): number {
  return family.gangsters.reduce((s, g) => s + (hasTrait(g, 'connected') ? CONNECTED_BRIBE_DISCOUNT : 0), 0);
}

// ── per-member loyalty modifiers ───────────────────────────────────────────────────────────────

/**
 * A single gangster's per-tick loyalty drift, trait-aware: a Cool member ignores the heat
 * penalty, and a Loyal member's NET losses are softened by LOYAL_DRIFT_SHIELD (never flipping a
 * loss into a gain). For a trait-less gangster this equals the legacy loyaltyDelta exactly.
 */
export function memberLoyaltyDelta(g: Gangster, cashPositive: boolean, heat: number): number {
  const base = cashPositive ? LOYALTY_GAIN_PAID : -LOYALTY_DROP_UNPAID;
  const heatPenalty = hasTrait(g, 'cool') ? 0 : Math.floor(heat / LOYALTY_HEAT_DIVISOR);
  let delta = base - heatPenalty;
  if (delta < 0 && hasTrait(g, 'loyal')) delta = Math.min(0, delta + LOYAL_DRIFT_SHIELD);
  return delta;
}

/** Multiplier on a member's desertion chance: Loyal members defect half as often. */
export function desertionChanceFactor(g: Gangster): number {
  return hasTrait(g, 'loyal') ? LOYAL_DESERT_FACTOR : 1;
}

// ── seeded, cursor-safe trait assignment ───────────────────────────────────────────────────────

/** FNV-1a 32-bit hash of a string → a stable seed for deterministic per-gangster trait rolls. */
function hashStr(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministically roll 1–2 non-conflicting traits for a gangster, seeded from a key (its id).
 * Uses its OWN Rng seeded by the key — it never touches the shared state.rngState, so assigning
 * traits at recruitment is cursor-safe (the recruit's skill/loyalty/name draws are unchanged).
 */
export function rollTraits(key: string): Trait[] {
  const rng = new Rng(seedToCursor(hashStr(key)));
  const pool = [...ALL_TRAITS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const want = rng.nextInt(1, 2);
  const out: Trait[] = [];
  for (const t of pool) {
    if (out.length >= want) break;
    const conflicts = out.some((o) => CONFLICTS.some(([a, b]) => (a === o && b === t) || (b === o && a === t)));
    if (!conflicts) out.push(t);
  }
  return out;
}
