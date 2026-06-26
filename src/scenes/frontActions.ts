// PLAYTEST FIX (Part 1, Finding C) — FRONT-ACTION CLASSIFIER (pure; Phaser-free, testable). Resolves the
// ONE primary verb a front offers, so the contested-DEFENSE action and the RETAKE action read as legible and
// distinct (the player's conceptual gap: a CONTESTED block — your control being pushed — is NOT the same as a
// rival-HELD block, and each wants a different verb). The scene computes the booleans + the 35d gate; this
// just picks the verb/label/hint/enabled. No sim mutation, no Phaser.

export type FrontVerb = 'extort' | 'retake' | 'defend' | 'none';

export interface FrontActionPlan {
  verb: FrontVerb;
  label: string;
  hint: string;
  enabled: boolean;
}

export interface FrontActionInputs {
  /** A rival HOLDS this front (extortedBy = a rival) — the RETAKE candidate. */
  rivalHeld: boolean;
  /** An un-taken front — the plain 35b EXTORT candidate. */
  extortable: boolean;
  /** The PLAYER holds this front (extortedBy = player) — yours to keep / defend. */
  playerHeld: boolean;
  /** The front's district is under an active rival contest (your control is being pushed). */
  contested: boolean;
  /** The authoritative 35b/35d shakedown gate (canIssueMoveAndShakedown WITH the tile). */
  gate: { ok: boolean; reason: string };
  /** Whether the player currently has muscle selected (DEFEND needs a unit to send). */
  hasSelection: boolean;
}

/**
 * Pick the front's primary action. Priority: a rival-HELD front is a RETAKE (guard-gated); an un-taken front
 * is an EXTORT; a player-held front UNDER CONTEST is a DEFEND (move muscle in to hold the meter — the
 * existing turf-war defense, surfaced where the player looks); a quiet player-held front has nothing to do.
 * RETAKE and DEFEND are deliberately distinct labels + hints so the player never confuses "muscle it back off
 * the rival" with "hold the block they're pushing". Pure.
 */
export function classifyFrontAction(inp: FrontActionInputs): FrontActionPlan {
  if (inp.rivalHeld) return { verb: 'retake', label: 'RETAKE', hint: inp.gate.reason, enabled: inp.gate.ok };
  if (inp.extortable) return { verb: 'extort', label: 'EXTORT', hint: inp.gate.reason, enabled: inp.gate.ok };
  if (inp.playerHeld && inp.contested) {
    return {
      verb: 'defend',
      label: 'DEFEND',
      hint: inp.hasSelection ? 'rival is contesting — move muscle here to hold it' : 'select your muscle first, then DEFEND',
      enabled: inp.hasSelection,
    };
  }
  if (inp.playerHeld) return { verb: 'none', label: 'EXTORT', hint: 'this block already pays you', enabled: false };
  return { verb: 'none', label: 'EXTORT', hint: inp.gate.reason, enabled: false };
}
