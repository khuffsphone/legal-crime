// RTS-35c — the VERB SPLIT: a player order's TARGET TYPE selects the verb. These lock the ROUTING (a
// front → EXTORT, a rival unit → ATTACK, ground → MOVE) and the end-to-end: with a thug SELECTED, a
// building target produces a 35b extortion ACT for that thug, and a rival-unit target produces a 35a
// MOVE-TO-ENGAGE for that same thug. No new combat/extortion is created — the order routes to the
// EXISTING systems (applyCommandWithEmbodiedExtortion for extort, resolveMoveCommand for the engage).
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { orderVerbFor, type OrderTarget } from '../src/scenes/orderRouting';
import { pickSelectedMuscle, type MuscleCandidate } from '../src/scenes/dispatch';
import { applyCommandWithEmbodiedExtortion } from '../src/sim/extortionEmbodied';
import { resolveMoveCommand, unitTile } from '../src/sim/selection';
import type { NavGrid } from '../src/sim/pathfinding';
import type { MovableUnit } from '../src/sim/movement';

/** A wide-open grid so the move-to-engage always finds a path (routing is the thing under test). */
const OPEN_GRID: NavGrid = { cols: 40, rows: 40, isBlocked: () => false };

describe('orderVerbFor — the target TYPE alone picks the verb (attack vs extort can never be confused)', () => {
  it('a RIVAL unit → ATTACK', () => {
    expect(orderVerbFor({ kind: 'rival', unitId: 'rival-1' })).toBe('attack');
  });
  it('a BUILDING/front → EXTORT', () => {
    expect(orderVerbFor({ kind: 'front', businessId: 'biz-1' })).toBe('extort');
  });
  it('empty GROUND → MOVE', () => {
    expect(orderVerbFor({ kind: 'ground', tile: { gx: 3, gy: 4 } })).toBe('move');
  });
});

describe('the split, end-to-end: the SELECTED thug is the actor for BOTH verbs (consistent with 35b.1)', () => {
  /** Two free player thugs (A,B) + a rival combatant + an eligible front. A is the selection. */
  function world() {
    const s = createInitialState(1, { bigCity: true });
    const front = s.districts[0].businesses.find((b) => b.kind === 'front' && b.extortedBy === undefined)!;
    const A: MovableUnit = { id: 'thug-A', pos: { gx: 5, gy: 5 }, path: [], speed: 1, factionId: s.player.id, role: 'enforcer' };
    const B: MovableUnit = { id: 'thug-B', pos: { gx: 6, gy: 5 }, path: [], speed: 1, factionId: s.player.id, role: 'enforcer' };
    const rival: MovableUnit = { id: 'rival-gun', pos: { gx: 12, gy: 9 }, path: [], speed: 1, factionId: 'rival-a', role: 'enforcer' };
    s.units = [A, B, rival];
    const candidates: MuscleCandidate[] = [A, B].map((u) => ({ id: u.id, faction: 'player', isCollector: false, idle: true }));
    return { s, A, B, rival, frontId: front.id, candidates };
  }

  it('a BUILDING target → an EXTORTION ACT for the SELECTED thug A (not free B)', () => {
    const { s, frontId, candidates } = world();
    const target: OrderTarget = { kind: 'front', businessId: frontId };
    expect(orderVerbFor(target)).toBe('extort');
    const actor = pickSelectedMuscle(candidates, ['thug-A']); // selection is authoritative
    const act = applyCommandWithEmbodiedExtortion(
      s, { type: 'moveAndShakedown', familyId: s.player.id, thugId: actor!.id, frontId }, () => {}, { gx: 5, gy: 5 },
    );
    expect(act?.thugId).toBe('thug-A');
    expect(s.extortionActs?.map((a) => a.thugId)).toEqual(['thug-A']); // B was never tasked
  });

  it('a RIVAL-UNIT target → a MOVE-TO-ENGAGE order for the SELECTED thug A, pathing onto the rival', () => {
    const { s, A, rival } = world();
    const target: OrderTarget = { kind: 'rival', unitId: rival.id };
    expect(orderVerbFor(target)).toBe('attack');
    // the scene resolves the actor from the selection, then walks it onto the rival (auto-engage fights).
    const dest = unitTile(rival);
    const res = resolveMoveCommand(s.units, ['thug-A'], dest, OPEN_GRID);
    expect(res.moved).toEqual(['thug-A']);        // A is the actor…
    expect(A.path.length).toBeGreaterThan(0);     // …and is now moving…
    expect(A.path[A.path.length - 1]).toEqual(dest); // …onto the rival's tile (move-to-engage)
    expect(s.extortionActs?.length ?? 0).toBe(0); // an ATTACK never created an extortion act
  });

  it('the routing keeps the two verbs DISJOINT: a front never attacks, a rival never extorts', () => {
    expect(orderVerbFor({ kind: 'front', businessId: 'b' })).not.toBe('attack');
    expect(orderVerbFor({ kind: 'rival', unitId: 'r' })).not.toBe('extort');
  });
});
