// RTS-35c — the VERB SPLIT (pure, Phaser-free). A player order's TARGET TYPE selects the verb: a RIVAL
// UNIT → ATTACK (the 35a move-to-engage; proximity combat resolves it on contact), a BUILDING/front →
// EXTORT (the 35b move-and-shakedown), empty GROUND → MOVE. This is ROUTING only — it creates no combat
// and no extortion; the scene dispatches the chosen verb to the EXISTING systems. Extracted so the
// target→verb decision (the heart of the split) is unit-tested without Phaser.

import type { GridPos } from '../sim';

/** A resolved pointer target, projected view-side from what's under the cursor. */
export type OrderTarget =
  | { kind: 'rival'; unitId: string }      // a RIVAL combatant under the cursor → ATTACK
  | { kind: 'front'; businessId: string }  // a BUILDING/front under the cursor → EXTORT
  | { kind: 'ground'; tile: GridPos };     // empty walkable ground → MOVE

export type OrderVerb = 'attack' | 'extort' | 'move';

/** RTS-35c — map a resolved pointer TARGET to its VERB. Pure + total: the target TYPE alone decides,
 * so attacking a rival and extorting a front can never be confused. Selection gating is the command
 * layer's job (consistent with 35b.1 — selection is authoritative); this only names the verb. */
export function orderVerbFor(target: OrderTarget): OrderVerb {
  switch (target.kind) {
    case 'rival':
      return 'attack';
    case 'front':
      return 'extort';
    case 'ground':
      return 'move';
  }
}
