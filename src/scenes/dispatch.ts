// RTS-29.1 — the muscle-dispatch SEAM, extracted PURE (no Phaser) so it is unit-tested. The blocker
// it fixes: sim MUSCLE units (spawnUnit) carry NO factionId/role — faction lives on the scene's
// UnitView. The old idlePlayerThug() read u.factionId off the raw sim unit, so it matched zero idle
// thugs and the whole earn loop (extort→convert→collector) was dead. Faction/role MUST be resolved
// from the VIEW layer; this helper takes that view-projected shape and picks the dispatchable thug.

/** A view-layer projection of a unit for the dispatch decision: faction comes from the UnitView,
 * isCollector from the sim unit's role (collectors DO carry a role), idle from an empty path. */
export interface MuscleCandidate {
  id: string;
  faction: 'player' | 'rival';
  isCollector: boolean;
  idle: boolean;
}

/** The first idle PLAYER muscle (non-collector, not already tasked) free to send on a job, or
 * undefined. Pure — operates on the view-projected candidates, never on raw sim factionId/role. */
export function pickIdleMuscle(
  candidates: readonly MuscleCandidate[],
  tasked: ReadonlySet<string>,
): MuscleCandidate | undefined {
  return candidates.find(
    (c) => c.faction === 'player' && !c.isCollector && c.idle && !tasked.has(c.id),
  );
}
