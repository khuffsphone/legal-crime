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
 * The best first front to shake down: an UN-SHAKEN front (nobody is extorting it yet), in a district
 * where the family already clears the control gate (so the move is legal). Scans districts then their
 * businesses in order, so it is deterministic. Returns null if there is no legal target.
 *
 * RTS-31: this must agree with the actual extortable affordance (`extortProgress().extortable`, which
 * is `extortedBy === undefined`). The old test `extortedBy !== familyId` also matched RIVAL-held
 * fronts — so the objective could point [E] at a front that isn't actually shakeable, and the first
 * extort silently no-op'd ("click an un-shaken [%] front"). Only suggest genuinely un-shaken fronts.
 */
export function suggestedExtortTarget(state: GameState, familyId: string): ExtortTarget | null {
  for (const d of state.districts) {
    if (controlOf(d, familyId) < EXTORT_MIN_CONTROL) continue;
    for (const b of d.businesses) {
      if (b.kind === 'front' && b.extortedBy === undefined) {
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
      title: 'EXTORT THE NEIGHBOURHOOD',
      detail: target
        ? `RIGHT-CLICK the glowing storefront in ${target.districtName} → EXTORT (or press [E]). Then shake down EVERY cheap front on your block — breadth is your early economy.`
        : 'Expand your turf, then shake down the storefronts for protection money.',
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
    title: "YOU'RE EARNING — BUILD THE EMPIRE",
    detail: 'Extort-first: shake down MORE storefronts across the neighbourhood, then press [T] to set an automated COLLECTION ROUTE so the take banks itself (guard it — a collector can still be robbed). Grow with [6] RECRUIT more thugs · [5] EXPAND into the next block · [G] grease The Beat to keep heat down · [R] open a racket once you can cover the heat. War comes later: [1] raid · [2] sabotage · [4] lockout · [3] assassinate.',
    targetBusinessId: null,
    done: true,
  };
}
