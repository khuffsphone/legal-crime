// RIVAL ARCHETYPE — the per-rival TUNING-HOOK layer (lane-local sibling of rivalStrategy.ts). PURE &
// deterministic; imports NO Phaser and does not touch tick()/applyCommand()/commands.ts. It resolves four
// per-family knobs that give each rival a distinct AI "personality" WITHOUT changing any mechanic:
//
//   1. the three global aggression constants (AGGRO_ON_ATTACK / AGGRO_DECAY / AGGRO_HQ_STRIKE) → per-rival,
//   2. the fixed federal-pressure bribe-channel ladder → a per-rival WEIGHTED table,
//   3. a per-candidate score MULTIPLIER over ai.ts's hardcoded base scores (biases which action a rival favours),
//   4. a `familyArchetype` name → a preset bundle of the above (RIVAL_ARCHETYPES).
//
// RESOLUTION PRECEDENCE for every knob: a direct per-rival field ?? the family's archetype preset ?? the
// global baseline. So each hook is ADDITIVE and DEFAULT-SAFE: a family with no override and no archetype
// resolves to the exact prior value, making baseline behaviour BYTE-IDENTICAL. The registry can carry preset
// archetypes, but no family is ASSIGNED one by default, so shipping presets does not change the baseline.

import { AGGRO_DECAY, AGGRO_HQ_STRIKE, AGGRO_ON_ATTACK } from './constants';
import type { AggroTuning, BribeChannel, Family, RivalCandidateKind } from './types';

// ── the archetype preset bundle ──────────────────────────────────────────────────────────────────────────
/** A preset bundle of the per-rival override knobs — an archetype is just a named `Family` override set. */
export interface RivalTuning {
  aggroTuning?: AggroTuning;
  bribeChannelWeights?: Partial<Record<BribeChannel, number>>;
  candidateBias?: Partial<Record<RivalCandidateKind, number>>;
}

/**
 * Named archetype presets. OFF by default: a family only adopts one when its `familyArchetype` names a key
 * here, and no family sets that field in a fresh state — so this registry never shifts baseline behaviour.
 * These are ready-to-use "personalities" (a direct per-rival field still overrides any preset value):
 *   • vengeful — gains more aggro when hit, sheds it slowly, strikes your HQ sooner, leans on offence.
 *   • cautious — cools fast, strikes late, buys judicial cover early, and favours collecting over expansion.
 *   • kingpin  — an expansionist late-game threat: relentless HQ pressure and a strong push for new turf.
 */
export const RIVAL_ARCHETYPES: Record<string, RivalTuning> = {
  vengeful: {
    aggroTuning: { onAttack: 60, decay: 5, hqStrike: 45 },
    candidateBias: { expandControl: 1.25, establishOperation: 1.15 },
  },
  cautious: {
    aggroTuning: { onAttack: 28, decay: 12, hqStrike: 80 },
    bribeChannelWeights: { judges: 4 }, // reaches for judicial cover as soon as tier 2 unlocks it
    candidateBias: { collect: 1.2, bribe: 1.15, expandControl: 0.8 },
  },
  kingpin: {
    aggroTuning: { onAttack: 45, decay: 8, hqStrike: 50 },
    candidateBias: { expandControl: 1.35 },
  },
};

/** The archetype preset a family has adopted, if its `familyArchetype` names a known one. Pure read. */
function archetypeOf(family: Family): RivalTuning | undefined {
  return family.familyArchetype ? RIVAL_ARCHETYPES[family.familyArchetype] : undefined;
}

// ── HOOK 1 — per-rival aggression constants (override ?? archetype ?? global) ───────────────────────────────
/** Aggression this family gains per hit taken. Absent override/preset ⇒ the global AGGRO_ON_ATTACK. */
export function aggroOnAttackFor(family: Family): number {
  return family.aggroTuning?.onAttack ?? archetypeOf(family)?.aggroTuning?.onAttack ?? AGGRO_ON_ATTACK;
}
/** Aggression this family sheds per strategic pulse. Absent override/preset ⇒ the global AGGRO_DECAY. */
export function aggroDecayFor(family: Family): number {
  return family.aggroTuning?.decay ?? archetypeOf(family)?.aggroTuning?.decay ?? AGGRO_DECAY;
}
/** The menace threshold above which this family strikes YOUR HQ. Absent override/preset ⇒ global AGGRO_HQ_STRIKE. */
export function aggroHqStrikeFor(family: Family): number {
  return family.aggroTuning?.hqStrike ?? archetypeOf(family)?.aggroTuning?.hqStrike ?? AGGRO_HQ_STRIKE;
}

// ── HOOK 2 — per-rival bribe-channel WEIGHTED table (replaces the fixed ladder) ─────────────────────────────
/** The federal pressure tier at which each escalation channel UNLOCKS (police is the flat heat retainer ai.ts
 * buys separately, so it is never a bribeAllocation candidate). This gate is the FAIRNESS floor — a rival only
 * reaches for a channel once the telegraphed pressure justifies it — and is shared, not per-rival. */
export const BRIBE_CHANNEL_UNLOCK_TIER: Partial<Record<BribeChannel, number>> = {
  politicians: 1, judges: 2, feds: 3,
};

/** DEFAULT per-channel preference weights. Chosen so that at every tier the highest-WEIGHTED unlocked channel
 * is exactly the historical ladder's pick (t1→politicians, t2→judges, t3→feds). A per-rival weight table (or an
 * archetype preset) reweights WHICH unlocked channel a family reaches for; absent ⇒ these, so byte-identical. */
export const DEFAULT_BRIBE_WEIGHTS: Record<'politicians' | 'judges' | 'feds', number> = {
  politicians: 1, judges: 2, feds: 3,
};

/** The federal pressure tier a family has reached, mirroring the historical ladder's gate: a bust armed or
 * fedWarningLevel ≥ 3 ⇒ 3; otherwise the fedWarningLevel clamped to 0..3. 0 ⇒ no pressure. Pure read. */
export function bribePressureTier(family: Family): number {
  if (family.bustArmed || family.fedWarningLevel >= 3) return 3;
  return Math.max(0, Math.min(3, family.fedWarningLevel));
}

/**
 * The bribe channel a family reaches for under federal pressure. Channels unlock by tier (politicians@1,
 * judges@2, feds@3); among the UNLOCKED channels the family picks its highest-WEIGHTED one, merging the
 * DEFAULT weights ← the archetype preset ← the direct per-rival table (later wins, per channel). Ties break
 * toward the higher-unlock (more-escalated) channel. Returns undefined when there is no federal pressure.
 * With no override and no archetype this reproduces the fixed ladder exactly (byte-identical). Pure read.
 */
export function chooseBribeChannel(family: Family): BribeChannel | undefined {
  const tier = bribePressureTier(family);
  if (tier < 1) return undefined;
  const weights: Partial<Record<BribeChannel, number>> = {
    ...DEFAULT_BRIBE_WEIGHTS,
    ...archetypeOf(family)?.bribeChannelWeights,
    ...family.bribeChannelWeights,
  };
  let best: BribeChannel | undefined;
  let bestWeight = -Infinity;
  let bestUnlock = -Infinity;
  for (const ch of Object.keys(BRIBE_CHANNEL_UNLOCK_TIER) as BribeChannel[]) {
    const unlock = BRIBE_CHANNEL_UNLOCK_TIER[ch] ?? Infinity;
    if (tier < unlock) continue; // not yet justified by the reached pressure
    const w = weights[ch] ?? 0;
    if (w > bestWeight || (w === bestWeight && unlock > bestUnlock)) {
      best = ch;
      bestWeight = w;
      bestUnlock = unlock;
    }
  }
  return best;
}

// ── HOOK 3 — per-candidate score MULTIPLIER over ai.ts's base scores ────────────────────────────────────────
/**
 * The multiplier applied to an AI candidate's base score for `kind`, merging the direct per-rival `candidateBias`
 * ← the archetype preset ← ×1. Absent (or an unlisted kind) ⇒ 1, so the candidate's base is unchanged and the
 * AI's action ordering is byte-identical. `kind` is a command-type string; unknown kinds resolve to ×1. Pure.
 */
export function candidateBiasFor(family: Family, kind: string): number {
  const direct = (family.candidateBias as Record<string, number> | undefined)?.[kind];
  const preset = (archetypeOf(family)?.candidateBias as Record<string, number> | undefined)?.[kind];
  return direct ?? preset ?? 1;
}
