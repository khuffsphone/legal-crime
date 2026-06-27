// COMBAT CONTROL VERBS — the pure order layer (state/orders, never pixels). STOP clears a unit's orders,
// HOLD stands and fights WITHOUT chasing, and ATTACK-MOVE converts to an attack on contact then resumes its
// advance. These verbs reuse the existing order system + the 35a auto-engage; this checks the decisions the
// scene dispatches (issueMove / stopUnit) — no Phaser, no sim mutation beyond the existing stopUnit helper.
import { describe, it, expect } from 'vitest';
import {
  stopOrder, holdOrder, attackMoveOrder, resolveAutoOrder, nearestHostile, isHostileTarget,
  ATTACK_MOVE_ACQUIRE_RADIUS, type OrderUnit,
} from '../src/scenes/combatOrders';
import { stopUnit } from '../src/sim/movement';
import type { MovableUnit } from '../src/sim/movement';

const u = (id: string, gx: number, gy: number, factionId?: string, role?: string, downed?: boolean): OrderUnit =>
  ({ id, pos: { gx, gy }, factionId, role, downed });

describe('STOP — clears the unit\'s orders and holds its tile', () => {
  it('stopOrder() resets the stance to NORMAL', () => {
    expect(stopOrder().stance).toBe('NORMAL');
    expect(stopOrder().dest).toBeUndefined();
  });
  it('a stopped unit has an empty path and its stance is no longer managed', () => {
    // a player thug mid-march with an ATTACK-MOVE stance...
    const unit = { id: 'p1', pos: { gx: 2, gy: 2 }, path: [{ gx: 5, gy: 5 }, { gx: 6, gy: 6 }], speed: 1, factionId: 'player' } as MovableUnit;
    stopUnit(unit);                                   // [S] clears the path (existing sim helper)
    expect(unit.path).toEqual([]);                    // held tile — no remaining waypoints
    // ...and with the stance cleared to NORMAL, the auto-order system ignores it (no chase, no advance)
    const decision = resolveAutoOrder(u('p1', 2, 2, 'player'), stopOrder(), [u('p1', 2, 2, 'player'), u('r1', 3, 2, 'rival')], ATTACK_MOVE_ACQUIRE_RADIUS);
    expect(decision.kind).toBe('none');
  });
});

describe('HOLD — defends without chasing', () => {
  it('holdOrder() is a persistent HOLD stance', () => {
    expect(holdOrder().stance).toBe('HOLD');
  });
  it('a HOLD unit STANDS even with a hostile in acquire range — it never moves to chase', () => {
    const self = u('p1', 4, 4, 'player');
    const foe = u('r1', 5, 4, 'rival'); // one tile away — well inside acquire range
    const decision = resolveAutoOrder(self, holdOrder(), [self, foe], ATTACK_MOVE_ACQUIRE_RADIUS);
    expect(decision.kind).toBe('hold');  // stand and fight (35a trades blows); NOT an 'engage' chase
  });
});

describe('ATTACK-MOVE — converts to attack on contact, else advances', () => {
  it('attackMoveOrder(dest) carries the destination', () => {
    const o = attackMoveOrder({ gx: 9, gy: 9 });
    expect(o.stance).toBe('ATTACK_MOVE');
    expect(o.dest).toEqual({ gx: 9, gy: 9 });
  });
  it('a hostile within acquire range ⇒ ENGAGE it (the attack-move attacks on contact)', () => {
    const self = u('p1', 2, 2, 'player');
    const foe = u('r1', 4, 2, 'rival'); // 2 tiles away — inside ATTACK_MOVE_ACQUIRE_RADIUS (5)
    const decision = resolveAutoOrder(self, attackMoveOrder({ gx: 10, gy: 2 }), [self, foe], ATTACK_MOVE_ACQUIRE_RADIUS);
    expect(decision.kind).toBe('engage');
    if (decision.kind === 'engage') {
      expect(decision.targetId).toBe('r1');
      expect(decision.tile).toEqual({ gx: 4, gy: 2 }); // move onto the foe's tile
    }
  });
  it('no hostile in range ⇒ ADVANCE toward the destination; arrived ⇒ HOLD', () => {
    const self = u('p1', 2, 2, 'player');
    const farFoe = u('r1', 40, 40, 'rival'); // out of acquire range
    const advancing = resolveAutoOrder(self, attackMoveOrder({ gx: 10, gy: 2 }), [self, farFoe], ATTACK_MOVE_ACQUIRE_RADIUS);
    expect(advancing.kind).toBe('advance');
    if (advancing.kind === 'advance') expect(advancing.tile).toEqual({ gx: 10, gy: 2 });
    // standing on the destination with nothing to chase → hold
    const arrived = resolveAutoOrder(u('p1', 10, 2, 'player'), attackMoveOrder({ gx: 10, gy: 2 }), [u('p1', 10, 2, 'player')], ATTACK_MOVE_ACQUIRE_RADIUS);
    expect(arrived.kind).toBe('hold');
  });
  it('never diverts onto a COLLECTOR or a same-faction unit (collectors stay autonomous)', () => {
    const self = u('p1', 2, 2, 'player');
    const rivalCollector = u('rc', 3, 2, 'rival', 'collector'); // a rival, but a collector
    const friend = u('p2', 3, 2, 'player');                     // your own man
    const decision = resolveAutoOrder(self, attackMoveOrder({ gx: 10, gy: 2 }), [self, rivalCollector, friend], ATTACK_MOVE_ACQUIRE_RADIUS);
    expect(decision.kind).toBe('advance'); // no valid hostile → keep advancing
  });
});

describe('hostility + acquisition helpers', () => {
  it('isHostileTarget: different factions fight; collectors/downed/own-faction do not', () => {
    expect(isHostileTarget(u('p1', 0, 0, 'player'), u('r1', 1, 0, 'rival'))).toBe(true);
    expect(isHostileTarget(u('p1', 0, 0, 'player'), u('p2', 1, 0, 'player'))).toBe(false); // same family
    expect(isHostileTarget(u('p1', 0, 0, 'player'), u('rc', 1, 0, 'rival', 'collector'))).toBe(false); // collector
    expect(isHostileTarget(u('p1', 0, 0, 'player'), u('rd', 1, 0, 'rival', undefined, true))).toBe(false); // downed
    expect(isHostileTarget(u('n1', 0, 0, undefined), u('r1', 1, 0, 'rival'))).toBe(false); // neutral has no fight
  });
  it('nearestHostile picks the closest enemy within radius, none beyond it', () => {
    const self = u('p1', 0, 0, 'player');
    const near = u('r1', 2, 0, 'rival');
    const far = u('r2', 3, 0, 'rival');
    expect(nearestHostile(self, [self, far, near], 5)?.id).toBe('r1');
    expect(nearestHostile(self, [self, u('r3', 9, 0, 'rival')], 5)).toBeUndefined();
  });
});
