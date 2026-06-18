// Win/loss evaluation and the turn flow. Pure & deterministic.

import { BANKRUPT_FLOOR, WIN_DISTRICTS } from './constants';
import type { Command } from './commands';
import { applyCommands } from './commands';
import { districtsHeldCount } from './territory';
import { tick } from './tick';
import type { GameState } from './types';

/** Number of districts the player must hold to satisfy the win condition. */
export function districtsNeededToWin(state: GameState): number {
  return Math.ceil(state.districts.length * WIN_DISTRICTS);
}

/** Whether every rival family's boss is dead. */
export function allRivalsEliminated(state: GameState): boolean {
  return state.rivals.every((r) => !r.alive);
}

/** Whether the game has ended (someone won or the player lost). */
export function isGameOver(state: GameState): boolean {
  return state.status !== 'playing';
}

/**
 * Step 8 of the tick: evaluate win and loss. No-op once the game is already decided (a
 * 'busted' loss from the law step or a 'dead' loss from conflict is preserved). Loss is
 * checked before win. The player wins by eliminating every rival AND holding at least
 * WIN_DISTRICTS of the city.
 */
export function resolveWinLoss(state: GameState): void {
  if (state.status !== 'playing') return;

  // Loss: bankruptcy.
  if (state.player.cash < BANKRUPT_FLOOR) {
    state.status = 'lost';
    state.lossReason = 'bankrupt';
    state.log.push({
      tick: state.tick,
      kind: 'game-over',
      message: `${state.player.name} went bankrupt (cash $${state.player.cash})`,
      data: { reason: 'bankrupt', cash: state.player.cash },
    });
    return;
  }

  // Loss: the player's boss is dead (normally set by conflict, re-checked here).
  if (!state.player.alive) {
    state.status = 'lost';
    state.lossReason = 'dead';
    return;
  }

  // Win: all rivals eliminated and the player holds enough of the city.
  const held = districtsHeldCount(state, state.player.id);
  if (allRivalsEliminated(state) && held >= districtsNeededToWin(state)) {
    state.status = 'won';
    state.log.push({
      tick: state.tick,
      kind: 'game-over',
      message: `${state.player.name} took the city (${held} districts, all rivals down)`,
      data: { reason: 'won', held },
    });
  }
}

/**
 * Run one turn: apply the player's commands for this turn, then advance the simulation a
 * tick (which resolves every system and re-evaluates win/loss). A no-op once the game is
 * over. Returns the same state object.
 */
export function endTurn(state: GameState, commands: Command[] = []): GameState {
  if (isGameOver(state)) return state;
  applyCommands(state, commands);
  tick(state);
  return state;
}
