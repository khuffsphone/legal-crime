// ⚠ SUPERSEDED (A-D era) — the E-H pipeline routes positional gating through weaponFeedback's
// shouldEmitFeedback directly (propEmitterPlanner for emitters; atmosphereCoordinator downgrades
// tiled event cues). Kept only until H3 lands; retire with the A-D lane.
// noXrayGate.ts — AUDIO ATMOSPHERE lane, Ticket C: the NO-X-RAY gate for positional audio cues. Pure,
// Phaser-free. Audio is an information surface like the minimap — a sound tied to a world tile can leak a
// hidden actor's position, so a LOCAL cue may only play when its tile passes the SAME reveal predicate the
// render already uses. This module does NOT invent a parallel visibility system:
//
// - The predicate is INJECTED as the sim's own `IsVisible` type (src/sim/opPreview.ts — the exact contract
//   the op-preview selectors take). The scene supplies its existing closure over fog.isRevealed
//   (IsoScene builds `(pos) => isRevealed(this.fog, round(gx), round(gy))` today — recon note: some scene
//   call sites also OR in `debugRevealAll`; WHICH closure to inject is the integration ticket's call, this
//   gate is agnostic). Fog is grow-only (no re-shroud), so revealed == currently-visible.
// - The pass/fail combinator is the SHIPPED gate: weaponFeedback.shouldEmitFeedback(revealed, onScreen) —
//   the same function that already guards the combat hit-SFX/flash at the render layer. One law, one gate.
//
// GLOBAL and HUD cues bypass entirely: they carry no tile, so they cannot leak one (own actions, own
// federal ladder, the Wire, endgame). A LOCAL cue WITHOUT a position is suppressed defensively — an
// unverifiable positional cue must never play. NOTHING here reads or writes the nav grid, the fog set, or
// any sim state; it only applies the injected predicate.

import type { GridPos, IsVisible } from '../../sim';
import { shouldEmitFeedback } from '../weaponFeedback';
import type { AudioCueDescriptor } from './sfxEventMapper';

export interface CueGateOptions {
  /** The render's OWN reveal predicate (the scene's fog closure — the same shape opPreview takes). */
  isVisible: IsVisible;
  /** Optional viewport test (tile → on screen?). Omitted ⇒ treated as on-screen, leaving the reveal
   * predicate as the sole (conservative-enough) gate — matching shouldEmitFeedback's contract where the
   * caller owns the viewport half. */
  isOnScreen?: (pos: GridPos) => boolean;
}

/** Why the gate suppressed a cue (diagnostics / ?debugaudio). */
export type CueSuppressReason = 'hidden' | 'no-position';

/**
 * The Ticket-C decision: may this cue play, per the no-x-ray law?
 * - spatial 'global' | 'hud' → always yes (no tile ⇒ nothing to leak).
 * - spatial 'local' → requires a pos AND shouldEmitFeedback(isVisible(pos), isOnScreen(pos)).
 * Returns null when allowed, else the suppression reason. Pure.
 */
export function cueSuppressReason(cue: AudioCueDescriptor, opts: CueGateOptions): CueSuppressReason | null {
  if (cue.spatial !== 'local') return null; // global/hud: player-facing, positionless — bypass
  if (!cue.pos) return 'no-position';       // a positional cue we cannot verify must not play
  const revealed = opts.isVisible(cue.pos);
  const onScreen = opts.isOnScreen ? opts.isOnScreen(cue.pos) : true;
  return shouldEmitFeedback(revealed, onScreen) ? null : 'hidden';
}

/** True when the cue may play (the boolean face of cueSuppressReason). Pure. */
export function cueAllowed(cue: AudioCueDescriptor, opts: CueGateOptions): boolean {
  return cueSuppressReason(cue, opts) === null;
}

export interface GatedCues {
  allowed: AudioCueDescriptor[];
  suppressed: Array<{ cue: AudioCueDescriptor; reason: CueSuppressReason }>;
}

/** Gate a batch of mapped cues, preserving order among the allowed. Pure. */
export function gateCues(cues: readonly AudioCueDescriptor[], opts: CueGateOptions): GatedCues {
  const allowed: AudioCueDescriptor[] = [];
  const suppressed: GatedCues['suppressed'] = [];
  for (const cue of cues) {
    const reason = cueSuppressReason(cue, opts);
    if (reason === null) allowed.push(cue);
    else suppressed.push({ cue, reason });
  }
  return { allowed, suppressed };
}
