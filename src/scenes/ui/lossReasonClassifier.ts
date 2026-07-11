// PLAYER SPINE — Ticket 4. Loss-reason PRESENTATION classifier. Maps the EXISTING sim LossReason
// ('bankrupt' | 'dead' | 'busted', types.ts) onto a newspaper-headline category + tone copy for the ending
// screen (Player Spine spec §6 / §10.2 ending headlines). Pure & Phaser-free; it re-derives NOTHING — the
// canon loss is decided by the sim (tick's bankrupt/bust losses; evaluateEndgame's HQ/collapse/city losses),
// which stamp state.lossReason. This module ONLY dresses that decided reason in copy.
//
// SOURCE OF TRUTH (recon note): a "dead" loss comes from Family.hqIntegrity/alive via damageHQ/
// eliminateFamily/evaluateEndgame (endgame.ts). This classifier does NOT build a parallel assassination
// check — it reads the already-set state.lossReason and classifies it.

import type { GameState, LossReason } from '../../sim';

/** Ending tone (self-contained — does not depend on the parallel Status UI screenView layer). */
export type LossTone = 'blood' | 'law' | 'money';

export interface LossClassification {
  reason: LossReason;
  /** Short headline category (e.g. "DEAD"). */
  category: string;
  /** The newspaper-masthead headline (spec §10.2). */
  headline: string;
  /** A one-line flavour subhead. */
  subhead: string;
  tone: LossTone;
}

/** LossReason → ending copy. Each reason maps to a DISTINCT category/headline/tone so the three endings read
 * differently (deleting/no-op-ing this mapping collapses that distinctness — see the mutation-surface spec). */
const BY_REASON: Record<LossReason, Omit<LossClassification, 'reason'>> = {
  bankrupt: {
    category: 'BANKRUPT',
    headline: 'THE OUTFIT IS BROKE',
    subhead: 'The debts came due and the vault was empty. There is nothing left to run.',
    tone: 'money',
  },
  dead: {
    category: 'DEAD',
    headline: 'THE BOSS IS GONE',
    subhead: 'They razed your HQ and put you in the ground. The family is finished.',
    tone: 'blood',
  },
  busted: {
    category: 'BUSTED',
    headline: 'THE FEDS TOOK IT ALL',
    subhead: 'The Bureau built its case and the cuffs came out. The empire is evidence now.',
    tone: 'law',
  },
};

/** Classify a known LossReason into its ending copy. Pure. */
export function classifyLoss(reason: LossReason): LossClassification {
  return { reason, ...BY_REASON[reason] };
}

/** Classify the CURRENT end state. Returns null unless the game is lost; otherwise reads the sim-stamped
 * state.lossReason (defaulting to 'dead' — the canonical fallback evaluateEndgame itself uses when a loss
 * resolves without a more specific reason). Reads state, never mutates. */
export function classifyEndState(state: GameState): LossClassification | null {
  if (state.status !== 'lost') return null;
  return classifyLoss(state.lossReason ?? 'dead');
}
