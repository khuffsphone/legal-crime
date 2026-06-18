// Fedora Noir presentation layer (Phase 17). Pure flavor + palette helpers — no Phaser, no
// sim logic. Scenes render with these; the simulation never sees them. See CANON.md §1.

import type { BribeChannel, GameState, ShockKind } from '../sim';

/** The locked Fedora Noir palette (CANON §1). */
export const NOIR_PALETTE = {
  ink: '#14110f',
  charcoal: '#26211c',
  fog: '#9a8f80',
  brass: '#c79a4b',
  blood: '#8a2b22',
  bone: '#e8e2d4',
} as const;

/** Typewriter/serif-mono feel. */
export const NOIR_FONT = 'Courier New, monospace';

/** Noir display name for a bribery channel. */
export function bribeChannelLabel(channel: BribeChannel): string {
  switch (channel) {
    case 'police':
      return 'The Beat';
    case 'judges':
      return 'The Bench';
    case 'politicians':
      return 'City Hall';
    case 'feds':
      return 'The Bureau';
  }
}

/** Noir display name for a systemic shock. */
export function shockFlavor(kind: ShockKind): string {
  switch (kind) {
    case 'crackdown':
      return 'Police Crackdown';
    case 'boom':
      return 'Boom Times';
    case 'bust':
      return 'Market Bust';
    case 'audit':
      return 'Federal Audit';
    case 'gangWar':
      return 'Gang War';
    case 'speakeasyRaid':
      return 'Speakeasy Raid';
  }
}

/** Noir name for an operation tier (1..3+). */
export function tierName(tier: number): string {
  if (tier <= 1) return 'Street';
  if (tier === 2) return 'Block';
  return 'Empire';
}

/** A terse heat descriptor. */
export function heatLabel(heat: number): string {
  if (heat < 20) return 'Quiet';
  if (heat < 40) return 'Watched';
  if (heat < 60) return 'Heated';
  if (heat < 90) return 'Hunted';
  return 'Marked';
}

/** Clean/dirty money framing for the HUD. */
export function moneyLine(cleanCash: number, dirtyCash: number): string {
  return `Clean $${cleanCash} · Dirty $${dirtyCash}`;
}

/** A clipped noir narration line for the current game state. */
export function statusNarration(state: GameState): string {
  if (state.status === 'won') {
    return 'The city is yours. The rain falls the same as ever.';
  }
  if (state.status === 'lost') {
    switch (state.lossReason) {
      case 'dead':
        return 'They pulled you from the river come morning. The End.';
      case 'busted':
        return 'The Bureau finally made it stick. The End.';
      case 'bankrupt':
        return 'The shark came to collect, and you were short. The End.';
      default:
        return 'The lights went out on your operation. The End.';
    }
  }
  return `Week ${state.tick} — the city sleeps with one eye open.`;
}
