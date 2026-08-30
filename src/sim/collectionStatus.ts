// FP-01 — one truthful, pure read model for the collection HUD. Normal collectors are automatic;
// [C] never starts that system, it only rushes waiting takings home ahead of the next route pass.

import { pendingCollection, totalUncollected } from './collection';
import type { GameState } from './types';

export type CollectionRushState = 'ready' | 'in-flight' | 'nothing-due';

export interface CollectionStatusView {
  automaticCollectors: number;
  automaticOutbound: number;
  automaticReturning: number;
  cashWaiting: number;
  /** Largest single-district take [C] can actually dispatch right now. */
  rushableNow: number;
  cashInTransit: number;
  rushInFlight: boolean;
  tutorialFirstTakeWaiting: boolean;
  rushState: CollectionRushState;
  rushLabel: string;
}

/** Short money copy for fixed-width HUD chips; strategic amounts remain exact in the full drawer. */
export function compactCollectionCash(amount: number): string {
  const safe = Math.max(0, Math.floor(amount));
  if (safe < 1000) return String(safe);
  if (safe < 1_000_000) {
    const value = safe / 1000;
    return `${value >= 100 || Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}k`;
  }
  const value = safe / 1_000_000;
  return `${value >= 100 || Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}m`;
}

/** Summarize the physical collection loop without mutating simulation state. */
export function collectionStatusView(state: GameState, familyId: string): CollectionStatusView {
  const collectors = state.units.filter(
    (unit) => unit.role === 'collector' && unit.factionId === familyId,
  );
  const automatic = collectors.filter((unit) => unit.routeId !== undefined);
  const rushed = collectors.filter(
    (unit) => unit.routeId === undefined && (unit.carrying ?? 0) > 0,
  );
  const cashWaiting = totalUncollected(state, familyId);
  const rushableNow = state.districts.reduce(
    (largest, district) => Math.max(largest, pendingCollection(state, familyId, district.id)),
    0,
  );
  const cashInTransit = collectors.reduce((sum, unit) => sum + (unit.carrying ?? 0), 0);
  const rushInFlight = rushed.length > 0;
  const rushState: CollectionRushState = rushInFlight
    ? 'in-flight'
    : cashWaiting > 0
      ? 'ready'
      : 'nothing-due';

  return {
    automaticCollectors: automatic.length,
    automaticOutbound: automatic.filter((unit) => unit.routePhase === 'toStop').length,
    automaticReturning: automatic.filter((unit) => unit.routePhase === 'toBank').length,
    cashWaiting,
    rushableNow,
    cashInTransit,
    rushInFlight,
    tutorialFirstTakeWaiting:
      familyId === state.player.id
      && state.tutorialFreeRuns > 0
      && automatic.length > 0
      && cashWaiting > 0,
    rushState,
    rushLabel: rushState === 'in-flight'
      ? 'RUSH IN FLIGHT'
      : rushState === 'ready'
        ? `RUSH $${rushableNow} NOW`
        : 'AUTO — NOTHING DUE',
  };
}

/** Compact legacy-panel copy. Kept short enough for its fixed 300 px mono-text pill. */
export function collectionPillLabel(status: CollectionStatusView): string {
  if (status.automaticCollectors === 0) return '◆ AUTO AFTER FIRST FRONT';
  const head = `◆ AUTO ${status.automaticCollectors}`;
  const waiting = compactCollectionCash(status.cashWaiting);
  const road = compactCollectionCash(status.cashInTransit);
  if (status.rushInFlight) return `${head} · RUSH IN FLIGHT $${road}`;
  if (status.cashWaiting > 0 && status.cashInTransit > 0) {
    return `${head} · W$${waiting} R$${road} · RUSH [C]`;
  }
  if (status.cashWaiting > 0) return `${head} · WAIT $${waiting} · RUSH [C]`;
  if (status.cashInTransit > 0) return `${head} · ROAD $${road} · BANKING`;
  return `${head} · NOTHING DUE`;
}
