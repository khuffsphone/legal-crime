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

// RTS-25 readability: keep CANON's typewriter/mono feel but render it in JetBrains Mono — a far more
// legible monospace at small HUD sizes than the thin default Courier New (which recurred as
// "hard to read" three playtests running). Falls back to Courier New if the web font hasn't loaded,
// so an offline boot is no worse than before. Numbers/body use this.
export const NOIR_FONT = '"JetBrains Mono", "Courier New", monospace';

/** RTS-25 display face — a condensed noir sans for titles, totals and big banners (the "empire at a
 * glance" type). Oswald reads sharp and bold at small sizes; Barlow/Arial Narrow as fallbacks. */
export const NOIR_DISPLAY = '"Oswald", "Barlow Semi Condensed", "Arial Narrow", sans-serif';

// ── USER-FACING NAME (display strings only — the repo slug, package name, code identifiers and file paths
// are deliberately left as-is). The working title is BRASSMERE and the fictional city is Brassmere; the win
// newspaper mastheads from the city. Centralised so every surface reads the same and a test can pin them. ──
/** The product title shown to players (uppercased for the deco display face). */
export const GAME_TITLE = 'BRASSMERE';
/** The product tagline/subtitle (replaces the old "Fedora Noir" codename in user-facing surfaces; the
 * codename stays internal in art/comments/CANON). */
export const GAME_SUBTITLE = 'A Prohibition Noir';
/** The fictional city the game is set in (replaces the old "Chicago"). */
export const CITY_NAME = 'Brassmere';
/** The win-screen newspaper masthead — the city's paper of record. */
export const NEWSPAPER_MASTHEAD = `THE ${CITY_NAME.toUpperCase()} LEDGER`;

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

/** Noir flavor for a federal warning tier (null at tier 0 — no warning). */
export function federalWarningLabel(tier: number): string | null {
  switch (tier) {
    case 1:
      return 'The Bureau is asking questions.';
    case 2:
      return 'Agents are watching your fronts.';
    case 3:
      return 'A federal bust is imminent — launder, cool off, or pay The Bureau.';
    default:
      return null;
  }
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
