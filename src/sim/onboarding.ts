// RTS-11 — onboarding objectives. Pure & deterministic; imports NO Phaser. A READ-ONLY guidance
// layer that tells a new player the next move (extort → collect → protect → grow) and points at a
// valid first target. No mechanic is touched — it only inspects existing state. IsoScene renders
// the objective as a persistent banner + a highlight over the suggested building.

import { EXTORT_MIN_CONTROL } from './constants';
import { allBusinesses } from './economy';
import { totalUncollected } from './collection';
import { controlOf } from './territory';
import type { GameState } from './types';

/** Whether a family has any income source yet: a front it extorts or an operation it owns. */
export function hasEstablishedIncome(state: GameState, familyId: string): boolean {
  for (const b of allBusinesses(state)) {
    if (b.kind === 'front' && b.extortedBy === familyId) return true;
    if (b.kind !== 'front' && b.ownerFamily === familyId) return true;
  }
  return false;
}

export interface ExtortTarget {
  businessId: string;
  districtId: string;
  districtName: string;
}

/**
 * The best first front to shake down: a front the family does NOT already extort, in a district
 * where it already clears the control gate (so the move is legal). Scans districts then their
 * businesses in order, so it is deterministic. Returns null if there is no legal target.
 */
export function suggestedExtortTarget(state: GameState, familyId: string): ExtortTarget | null {
  for (const d of state.districts) {
    if (controlOf(d, familyId) < EXTORT_MIN_CONTROL) continue;
    for (const b of d.businesses) {
      if (b.kind === 'front' && b.extortedBy !== familyId) {
        return { businessId: b.id, districtId: d.id, districtName: d.name };
      }
    }
  }
  return null;
}

/** Whether the family has a collector physically carrying a take on the map right now. */
export function hasCarryingCollector(state: GameState, familyId: string): boolean {
  return state.units.some((u) => u.role === 'collector' && u.factionId === familyId && (u.carrying ?? 0) > 0);
}

/** Whether the NEXT collector run will ride home protected (a tutorial free-run remains). */
export function nextRunIsProtected(state: GameState): boolean {
  return state.tutorialFreeRuns > 0;
}

/** Whether the family's currently-carrying collector is on a protected (safe) run. */
export function carryingRunIsProtected(state: GameState, familyId: string): boolean {
  return state.units.some(
    (u) => u.role === 'collector' && u.factionId === familyId && (u.carrying ?? 0) > 0 && !!u.protectedRun,
  );
}

export type ObjectiveStep = 'extort' | 'collect' | 'protect' | 'grow';

export interface Objective {
  step: ObjectiveStep;
  title: string;
  detail: string;
  /** The building to highlight for this step (an extort target), if any. */
  targetBusinessId: string | null;
  /** True once the onboarding loop is complete (the 'grow' step). */
  done: boolean;
}

/**
 * The player's current first-objective: the single next move to teach. Drives the in-world
 * guidance. Pure — never mutates state.
 *   • extort  — no income yet: shake down the suggested front ([E]).
 *   • collect — earning, takings waiting, no collector out: send a collector ([C]).
 *   • protect — a collector is carrying cash: get it to HQ, clear of rivals.
 *   • grow    — earning and nothing pending: reinvest and bribe the four channels.
 */
export function firstObjective(state: GameState): Objective {
  const id = state.player.id;

  if (!hasEstablishedIncome(state, id)) {
    const target = suggestedExtortTarget(state, id);
    return {
      step: 'extort',
      title: 'SHAKE DOWN A STOREFRONT',
      detail: target
        ? `Press [E] to lean on the glowing front in ${target.districtName}. It can take a try or two — they don't fold easy.`
        : 'Expand your turf, then shake down a storefront for protection money.',
      targetBusinessId: target?.businessId ?? null,
      done: false,
    };
  }

  if (hasCarryingCollector(state, id)) {
    const safe = carryingRunIsProtected(state, id);
    return {
      step: 'protect',
      title: safe ? 'SAFE PASSAGE — FIRST RUN' : 'WALK THE TAKE TO HQ',
      detail: safe
        ? 'Your first paycheck is guaranteed home. See how the rival enforcer hunts it? Next time, send the collector when the coast is clear — or escort it with your crew.'
        : 'Your collector is carrying cash. Keep it clear of the rival enforcer — if he catches it on the street, he takes the lot.',
      targetBusinessId: null,
      done: false,
    };
  }

  if (totalUncollected(state, id) > 0) {
    const safe = nextRunIsProtected(state);
    return {
      step: 'collect',
      title: 'COLLECT THE TAKE',
      detail: safe
        ? "Takings are piling up — that's money you're owed but don't have yet. Press [C] to send a collector; your first run rides home SAFE."
        : "Takings are piling up — money you're owed but don't have. Press [C] to send a collector, but watch the rival: time the run when he's away.",
      targetBusinessId: null,
      done: false,
    };
  }

  return {
    step: 'grow',
    title: "YOU'RE EARNING — NOW TAKE GROUND",
    detail: 'Grow the outfit: [R] open a racket · [G] grease the four channels · [5] EXPAND your home block 30→50 to HOLD it (unlocks RAID) · [6] RECRUIT muscle toward the 12 a hit needs. Then take the fight to your rivals: [1] raid · [2] sabotage · [4] lockout · [3] assassinate.',
    targetBusinessId: null,
    done: true,
  };
}
