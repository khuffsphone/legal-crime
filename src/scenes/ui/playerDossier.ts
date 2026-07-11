// PLAYER SPINE — Ticket 1. The player DOSSIER metadata read layer. Surfaces the two COSMETIC identity
// fields (Family.bossTitle? / Family.outfit?) with safe display fallbacks so an old save — which lacks
// both (they read as undefined) — still renders a sensible identity. Pure & Phaser-free; NO mutation, NO
// mechanical effect. The fields are additive/optional (schema v1, no version bump), matching the
// hqIntegrity?/aggro?/ties? precedent.

import type { GameState } from '../../sim';

export interface PlayerDossier {
  /** The boss's honorific — the player's chosen `bossTitle`, or the fallback "Boss". */
  bossTitle: string;
  /** The outfit / family name — the player's chosen `outfit`, or the fallback "The Outfit". */
  outfit: string;
}

/** Read the player's cosmetic dossier identity with fallbacks. A blank/whitespace or absent field falls
 * back, so an old save (undefined) and a cleared field both render the default. Pure read. */
export function playerDossier(state: GameState): PlayerDossier {
  const p = state.player;
  return {
    bossTitle: (p.bossTitle ?? '').trim() || 'Boss',
    outfit: (p.outfit ?? '').trim() || 'The Outfit',
  };
}
