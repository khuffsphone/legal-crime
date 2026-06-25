// RTS-30b-ui — pure UI-state helpers for the clickable hotkey TOOLBAR. Phaser-free + deterministic, so
// the per-button READY/CONDITIONAL/LOCKED logic is unit-tested directly (the green gate must catch a
// mis-stated button even though it can't catch a dead click — see the receipt). The offensive/build
// verbs ([1]-[6]) reuse the existing pure offenseReadout/buildReadout; this covers the CORE verbs whose
// availability is a function of GameState (+ a few scene-only context flags passed in by the scene).

import type { GameState } from './types';
import { pendingCollection } from './collection';
import { affordableOperation } from './ai';

export type VerbState = 'READY' | 'CONDITIONAL' | 'LOCKED';

/** Any district has player takings waiting to be collected (the [C] gate). */
export function canCollect(state: GameState): boolean {
  const pid = state.player.id;
  return state.districts.some((d) => pendingCollection(state, pid, d.id) > 0);
}

/** There is a racket the player can afford to open right now (the [R] reinvest gate). */
export function canReinvest(state: GameState): boolean {
  return affordableOperation(state.player.cash) != null;
}

/** Scene-only context the core-verb states depend on (resolved view-side, passed in as plain booleans). */
export interface CoreVerbContext {
  /** A player thug is SELECTED to take the order (RTS-35b.1 — selection is authoritative for the
   * embodied extort: the chip is only READY when the player has picked the thug that will act). */
  selectedThug: boolean;
  /** A clicked/onboarding [%] front is currently extortable. */
  extortTarget: boolean;
  /** A racket is hovered/selected (the [U] vice context exists). */
  viceCtx: boolean;
  /** That racket has an affordable next vice rung. */
  viceAfford: boolean;
}

export type CoreVerbId = 'extort' | 'collect' | 'reinvest' | 'grease' | 'vice' | 'krew';

/** The chip state for a CORE toolbar verb. Pure: GameState + the scene context flags. */
export function coreVerbState(id: CoreVerbId, state: GameState, ctx: CoreVerbContext): VerbState {
  switch (id) {
    case 'krew':
      return 'READY'; // toggling the crew roster is always available
    case 'collect':
      return canCollect(state) ? 'READY' : 'LOCKED';
    case 'reinvest':
      return canReinvest(state) ? 'READY' : 'CONDITIONAL';
    case 'grease':
      return state.player.cash >= 10 ? 'READY' : 'CONDITIONAL';
    case 'extort':
      return !ctx.extortTarget ? 'LOCKED' : ctx.selectedThug ? 'READY' : 'CONDITIONAL';
    case 'vice':
      return !ctx.viceCtx ? 'LOCKED' : ctx.viceAfford ? 'READY' : 'CONDITIONAL';
  }
}
