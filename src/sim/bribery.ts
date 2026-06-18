// Bribery sliders (S3). Pure helpers for the multi-channel bribe model. The single
// `bribeLevel` (total retainer cost) is kept in sync with the per-channel `bribes` map.

import { JUDGE_BUST_MITIGATION_PER_LEVEL, JUDGE_MAX_BUST_MITIGATION } from './constants';
import type { BribeChannel, Family } from './types';

/** All bribe channels, in display order. */
export const BRIBE_CHANNELS: readonly BribeChannel[] = ['police', 'judges', 'politicians', 'feds'];

/** Sum of a family's per-channel bribes — its total standing retainer. */
export function sumBribes(family: Family): number {
  return BRIBE_CHANNELS.reduce((total, c) => total + (family.bribes[c] ?? 0), 0);
}

/** Re-sync the cached `bribeLevel` total to the channel allocation. */
export function recomputeBribeLevel(family: Family): void {
  family.bribeLevel = sumBribes(family);
}

/**
 * Probability the Judges channel springs the boss from a bust-level raid, turning a fatal
 * bust into a (severe) seizure. Linear in the judges allocation, capped.
 */
export function bustAvoidChance(judges: number): number {
  return Math.min(JUDGE_MAX_BUST_MITIGATION, Math.max(0, judges) * JUDGE_BUST_MITIGATION_PER_LEVEL);
}
