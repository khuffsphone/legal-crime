// RTS-11 — onboarding objectives. Pure & deterministic; imports NO Phaser. A READ-ONLY guidance
// layer that tells a new player the next move (extort → collect → protect → grow) and points at a
// valid first target. No mechanic is touched — it only inspects existing state. IsoScene renders
// the objective as a persistent banner + a highlight over the suggested building.

import { EXTORT_MIN_CONTROL } from './constants';
import { allBusinesses } from './economy';
import { totalUncollected } from './collection';
import { controlOf } from './territory';
import { districtsHeld } from './territoryWar';
import type { BribeChannel, GameState } from './types';

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

export type ObjectiveStep =
  | 'extort' | 'collect' | 'protect' // the earn loop
  | 'grease' | 'hold' | 'specialist' | 'war' | 'win'; // RTS-33: the mid-game, one beat at a time

/** Total standing grease across the four channels — whether the player has touched the bribe system. */
export function totalGrease(state: GameState): number {
  const b = state.player.bribes;
  return (['police', 'judges', 'politicians', 'feds'] as BribeChannel[]).reduce((sum, ch) => sum + (b[ch] ?? 0), 0);
}

/** Whether the player has fielded a channel-gated SPECIALIST (enforcer ids are `enf-<tier>-…`), i.e.
 * built a real crew beyond plain thugs. Pure read — no dependency on the enforcer roster. */
export function hasSpecialistCrew(state: GameState): boolean {
  return state.player.gangsters.some((g) => g.id.startsWith('enf-'));
}

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
        ? `SELECT one of your thugs, then RIGHT-CLICK the glowing storefront in ${target.districtName} → EXTORT (or press [E]) — that thug walks over and shakes it down. Then shake down EVERY cheap front on your block — breadth is your early economy.`
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

  // ── RTS-33: the post-earn progression — the player is earning; teach the MID-GAME one beat at a
  // time so they always have a next goal until they're self-directing. Each step is a pure completion
  // check, ordered so a beat already done is simply skipped (never forced to repeat). ──
  const id2 = state.player.id;

  // 1) GREASE — the four channels are the political toolkit; greasing buys down heat AND unlocks crew.
  if (totalGrease(state) <= 0) {
    return {
      step: 'grease',
      title: 'GREASE A CHANNEL',
      detail: 'You\'re earning — now buy some protection. Press [G] to grease a bribery channel ($10/wk). The four channels (The Beat / The Bench / City Hall / The Bureau) buy down heat, slow raids, and UNLOCK weapon specialists. Greasing The Beat is the place to start.',
      targetBusinessId: null,
      done: false,
    };
  }

  // 2) HOLD — held turf is the board: it unlocks RAID, feeds your standing, and counts toward DOMINATION.
  if (districtsHeld(state, id2).length < 1) {
    return {
      step: 'hold',
      title: 'HOLD A DISTRICT',
      detail: 'Press [5] to EXPAND your control in your home block until you HOLD it (≥60%). Held districts are the board state of the war — holding turf unlocks RAID, anchors your standing, and is the road to DOMINATION.',
      targetBusinessId: null,
      done: false,
    };
  }

  // 3) SPECIALIST — a real crew, not just thugs (the path surfaced in the RECRUIT inspector).
  if (!hasSpecialistCrew(state)) {
    return {
      step: 'specialist',
      title: 'RECRUIT A SPECIALIST',
      detail: 'You can field more than street muscle. With The Beat greased to $10/wk, press [6] RECRUIT → PISTOL MAN. Specialists (PISTOL/SHOTGUN/RIFLE via The Beat · HITMAN via The Bench · DEMOLITIONS via City Hall) win the turf war and power the hits — build a real crew.',
      targetBusinessId: null,
      done: false,
    };
  }

  // 4) WAR — defend your turf / take ground; grow your hold through the turf war.
  if (districtsHeld(state, id2).length < 2) {
    return {
      step: 'war',
      title: 'WIN THE TURF WAR',
      detail: 'The rivals will come for your blocks. DEFEND — move muscle into a contested district and your presence holds the meter. Or take ground: [1] RAID rival turf · [2] SABOTAGE their rackets · [4] LOCKOUT a rival with The Bureau. Hold a SECOND district to turn the tide.',
      targetBusinessId: null,
      done: false,
    };
  }

  // 5) WIN — self-directing now: point at the three roads to taking the city.
  return {
    step: 'win',
    title: 'CLOSE IT OUT — PICK YOUR WIN',
    detail: 'You run your own outfit now. Three ways to take the city: DOMINATION (hold most of the districts / outlast the rivals) · GO STRAIGHT (launder a clean fortune and retire on top) · GET ELECTED MAYOR (max City Hall + civic influence). Pick your road and finish it.',
    targetBusinessId: null,
    done: true,
  };
}
