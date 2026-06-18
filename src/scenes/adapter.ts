// Scene-agnostic adapter between the pure simulation and any renderer. This module holds
// NO Phaser import and no browser globals, so it is fully unit-testable in node. Phaser
// scenes call these selectors to build a view model and dispatch commands; they never read
// or mutate sim state directly.

import {
  applyCommand,
  cleanCash,
  createInitialState,
  districtHolder,
  districtsHeldCount,
  endTurn,
  familyStrength,
  isGameOver,
  launderCapacity,
  pendingCollection,
  totalUncollected,
  tierOf,
  districtsNeededToWin,
  type BribeChannel,
  type Command,
  type Family,
  type GameState,
} from '../sim';

export interface PlayerView {
  name: string;
  cash: number;
  cleanCash: number;
  dirtyCash: number;
  launderCapacity: number;
  uncollected: number;
  heat: number;
  bribeLevel: number;
  bribes: Record<BribeChannel, number>;
  debt: number;
  gangsterCount: number;
  strength: number;
  districtsHeld: number;
}

export interface DistrictView {
  id: string;
  name: string;
  policePresence: number;
  holderId: string | null;
  holderName: string | null;
  playerControl: number;
  businessCount: number;
  operationCount: number;
  playerUncollected: number;
  playerOperationTiers: number[];
}

export interface RivalView {
  id: string;
  name: string;
  alive: boolean;
  cash: number;
  dirtyCash: number;
  debt: number;
  heat: number;
  gangsterCount: number;
  strength: number;
}

export interface StatusView {
  status: GameState['status'];
  lossReason?: GameState['lossReason'];
  tick: number;
  districtsNeededToWin: number;
  over: boolean;
}

/** Map of family id -> display name (player + rivals). */
function familyNames(state: GameState): Record<string, string> {
  const names: Record<string, string> = {};
  for (const f of [state.player, ...state.rivals] as Family[]) names[f.id] = f.name;
  return names;
}

/** Start a new, deterministic game. */
export function newGame(seed: number): GameState {
  return createInitialState(seed);
}

export function playerView(state: GameState): PlayerView {
  const p = state.player;
  return {
    name: p.name,
    cash: p.cash,
    cleanCash: cleanCash(p),
    dirtyCash: p.dirtyCash,
    launderCapacity: launderCapacity(state, p.id),
    uncollected: totalUncollected(state, p.id),
    heat: p.heat,
    bribeLevel: p.bribeLevel,
    bribes: { ...p.bribes },
    debt: p.debt,
    gangsterCount: p.gangsters.length,
    strength: familyStrength(p),
    districtsHeld: districtsHeldCount(state, p.id),
  };
}

export function districtViews(state: GameState): DistrictView[] {
  const names = familyNames(state);
  return state.districts.map((d) => {
    const holderId = districtHolder(d) ?? null;
    return {
      id: d.id,
      name: d.name,
      policePresence: d.policePresence,
      holderId,
      holderName: holderId ? (names[holderId] ?? null) : null,
      playerControl: d.control[state.player.id] ?? 0,
      businessCount: d.businesses.length,
      operationCount: d.businesses.filter((b) => b.kind !== 'front').length,
      playerUncollected: pendingCollection(state, state.player.id, d.id),
      playerOperationTiers: d.businesses
        .filter((b) => b.kind !== 'front' && b.ownerFamily === state.player.id)
        .map((b) => tierOf(b)),
    };
  });
}

export function rivalViews(state: GameState): RivalView[] {
  return state.rivals.map((r) => ({
    id: r.id,
    name: r.name,
    alive: r.alive,
    cash: r.cash,
    dirtyCash: r.dirtyCash,
    debt: r.debt,
    heat: r.heat,
    gangsterCount: r.gangsters.length,
    strength: familyStrength(r),
  }));
}

export function statusView(state: GameState): StatusView {
  return {
    status: state.status,
    lossReason: state.lossReason,
    tick: state.tick,
    districtsNeededToWin: districtsNeededToWin(state),
    over: isGameOver(state),
  };
}

/** A short human-readable status banner. */
export function statusBanner(state: GameState): string {
  switch (state.status) {
    case 'won':
      return 'YOU TOOK THE CITY';
    case 'lost':
      return `GAME OVER — ${state.lossReason ?? 'lost'}`;
    default:
      return `Week ${state.tick}`;
  }
}

/** Dispatch a single command (no tick). Returns the same state. */
export function dispatch(state: GameState, command: Command): GameState {
  return applyCommand(state, command);
}

/** End the player's turn: apply commands then advance a tick. Returns the same state. */
export function advanceTurn(state: GameState, commands: Command[] = []): GameState {
  return endTurn(state, commands);
}
