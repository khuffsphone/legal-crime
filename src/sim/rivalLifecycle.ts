// Dead-rival embodied cleanup. Pure & deterministic; imports NO Phaser.
//
// A rival can be eliminated by several independent strategic paths (a hit, a federal bust,
// HQ damage, or total strategic collapse). `alive` is the single authority for that result;
// this helper retires the map-side machinery that must not outlive it. Keeping the cleanup in
// one pass avoids each elimination path having to know about units, routes, contests, and the
// optional combat/extortion slices.

import type { CombatOrder } from './combatControl';
import type { GameState } from './types';

export interface RivalEmbodimentCleanup {
  /** Dead rival family ids observed by this pass (stable rival-array order). */
  familyIds: string[];
  /** Active map units removed because their owning rival is dead. */
  unitIds: string[];
  /** Automated collection routes retired with their dead owner. */
  routeIds: string[];
  /** Turf-war districts whose dead invader can no longer contest them. */
  contestDistrictIds: string[];
}

/** An allocation-safe empty report factory (callers may merge/mutate arrays without aliasing). */
export function emptyRivalEmbodimentCleanup(): RivalEmbodimentCleanup {
  return { familyIds: [], unitIds: [], routeIds: [], contestDistrictIds: [] };
}

/** Merge sequential cleanup passes while preserving first-seen order and removing duplicates. */
export function mergeRivalEmbodimentCleanup(
  first: RivalEmbodimentCleanup,
  second: RivalEmbodimentCleanup,
): RivalEmbodimentCleanup {
  const unique = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])];
  return {
    familyIds: unique(first.familyIds, second.familyIds),
    unitIds: unique(first.unitIds, second.unitIds),
    routeIds: unique(first.routeIds, second.routeIds),
    contestDistrictIds: unique(first.contestDistrictIds, second.contestDistrictIds),
  };
}

function orderReferencesRemovedUnit(order: CombatOrder, removed: ReadonlySet<string>): boolean {
  return order.stance === 'FOCUS_FIRE' && !!order.targetId && removed.has(order.targetId);
}

/**
 * Retire every embodied/runtime reference owned by a rival whose `alive` flag is false.
 *
 * Deliberately preserved:
 * - district control/business ownership (strategic aftermath belongs to the systems that killed it),
 * - downedBodies (short-lived, player-visible death memory),
 * - player/live-rival/neutral units and their routes,
 * - absent optional slices (old saves stay structurally absent).
 *
 * Mutates `state` and returns the exact ids a render layer must reconcile.
 */
export function cleanupDeadRivalEmbodiment(state: GameState): RivalEmbodimentCleanup {
  const familyIds = state.rivals.filter((rival) => !rival.alive).map((rival) => rival.id);
  if (familyIds.length === 0) return emptyRivalEmbodimentCleanup();

  const dead = new Set(familyIds);
  const unitIds = state.units.filter((unit) => !!unit.factionId && dead.has(unit.factionId)).map((unit) => unit.id);
  const removedUnits = new Set(unitIds);
  if (unitIds.length > 0) state.units = state.units.filter((unit) => !removedUnits.has(unit.id));

  const routeIds = (state.routes ?? []).filter((route) => dead.has(route.familyId)).map((route) => route.id);
  if (state.routes && routeIds.length > 0) {
    const removedRoutes = new Set(routeIds);
    state.routes = state.routes.filter((route) => !removedRoutes.has(route.id));
  }

  const contestDistrictIds = (state.contests ?? [])
    .filter((contest) => dead.has(contest.invaderId))
    .map((contest) => contest.districtId);
  if (state.contests) {
    state.contests = state.contests
      .filter((contest) => !dead.has(contest.invaderId))
      .map((contest) => {
        const muscleIds = contest.muscleIds.filter((id) => !removedUnits.has(id));
        return muscleIds.length === contest.muscleIds.length ? contest : { ...contest, muscleIds };
      });
  }

  // A queued hit cannot be carried out by or against a family that has already left play.
  state.pendingHits = state.pendingHits.filter((hit) => !dead.has(hit.attackerId) && !dead.has(hit.targetId));

  // Extortion acts are keyed by embodied unit id; do not let a removed thug resolve later.
  if (state.extortionActs && removedUnits.size > 0) {
    state.extortionActs = state.extortionActs.filter((act) => !removedUnits.has(act.thugId));
  }

  // Prune standing orders owned by removed units, plus player/live-rival focus orders whose known
  // target was retired. This reveals no fog information: family death is already public state.
  if (state.combatOrders && removedUnits.size > 0) {
    for (const [unitId, order] of Object.entries(state.combatOrders)) {
      if (removedUnits.has(unitId) || orderReferencesRemovedUnit(order, removedUnits)) {
        delete state.combatOrders[unitId];
      }
    }
  }

  return { familyIds, unitIds, routeIds, contestDistrictIds };
}
