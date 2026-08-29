// COMBAT PR A — the ?combat=1 CONTROL SURFACE (attack-move / focus-fire / disengage).
// Four laws under test, each with mutation teeth (an assertion that fails if the wiring is deleted):
//   1. NO-X-RAY — acquisition, focus designation, and the disengage vector see ONLY visible
//      hostiles; a fogged rival is indistinguishable from an empty tile in every observable
//      (denial value, course, retreat direction). The plan-mandated fog-probe tests live here.
//   2. NUMBERS-FROZEN — flag off (no slice, or no ctx) the game state stays byte-identical and
//      the shared RNG cursor never moves (the verbs draw NO randomness at all).
//   3. WRAPPED, NEVER MODIFIED — orders drive through the realtime wrapper hook; the advance
//      tests run through realtime.update itself, so deleting the hook line fails them.
//   4. WIRING EXISTS — source-scan assertions on realtime.ts + IsoScene.ts (the beatCops
//      pattern: vitest runs node-side, so scene wiring is asserted from the source text).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMBAT_ACQUIRE_RADIUS, DISENGAGE_STEP_TILES,
  clearCombatOrders, combatRequested,
  nearestVisibleHostile, orderAttackMove, orderDisengage, orderFocusFire,
  pickVisibleHostile, visibleThreats, type CombatCtx, type CombatDenial,
} from '../src/sim/combatControl';
import { combatDenialText } from '../src/scenes/combatOrders';
import { createInitialState } from '../src/sim/state';
import { update } from '../src/sim/realtime';
import { makeGrid } from '../src/sim/pathfinding';
import { spawnCollector, spawnEnforcer, unitTile, type MovableUnit } from '../src/sim/movement';
import { serializeGame, deserializeGame } from '../src/sim/saveLoad';
import type { GameState } from '../src/sim/types';
import type { GridPos } from '../src/sim/iso';

const GRID = makeGrid(32, 32);
const ALL = (_pos: GridPos): boolean => true;
const ctx = (isVisible: (pos: GridPos) => boolean = ALL): CombatCtx => ({ grid: GRID, isVisible });
const json = (x: unknown): string => JSON.stringify(x);

function fighter(id: string, factionId: string, gx: number, gy: number): MovableUnit {
  return spawnEnforcer(id, gx, gy, factionId);
}

function withUnits(...units: MovableUnit[]): GameState {
  const s = createInitialState(1, { bigCity: true });
  s.units = units;
  return s;
}

/** The end tile of a unit's current path (undefined when idle). */
function pathEnd(u: MovableUnit): GridPos | undefined {
  return u.path.length > 0 ? u.path[u.path.length - 1] : undefined;
}

describe('combatRequested — the ?combat=1 opt-in flag (default OFF)', () => {
  it('is OFF by default and ON only for combat=1 exactly', () => {
    expect(combatRequested('')).toBe(false);
    expect(combatRequested('?combat=1')).toBe(true);
    expect(combatRequested('?combat=0')).toBe(false);
    expect(combatRequested('?combat')).toBe(false);
    expect(combatRequested('?cops=1')).toBe(false);
    expect(combatRequested('?cops=1&combat=1')).toBe(true);
  });
});

describe('orderAttackMove — issue + denials', () => {
  it('paths each fighter to the destination and records the standing order', () => {
    const p1 = fighter('p1', 'player', 2, 2);
    const p2 = fighter('p2', 'player', 3, 3);
    const s = withUnits(p1, p2);
    const res = orderAttackMove(s, ['p1', 'p2'], { gx: 12, gy: 2 }, ctx());
    expect(res.issued).toEqual(['p1', 'p2']);
    expect(res.denial).toBeUndefined();
    expect(s.combatOrders!.p1).toEqual({ stance: 'ATTACK_MOVE', dest: { gx: 12, gy: 2 } });
    expect(pathEnd(p1)).toEqual({ gx: 12, gy: 2 });
    expect(pathEnd(p2)).toEqual({ gx: 12, gy: 2 });
  });

  it('denies an empty/stale selection WITHOUT creating the slice', () => {
    const s = withUnits(fighter('r1', 'rival-a', 5, 5));
    expect(orderAttackMove(s, [], { gx: 4, gy: 4 }, ctx())).toEqual({ issued: [], denial: 'no-selection' });
    expect(orderAttackMove(s, ['ghost'], { gx: 4, gy: 4 }, ctx())).toEqual({ issued: [], denial: 'no-selection' });
    // collectors are autonomous — never orderable, even when explicitly named
    const s2 = withUnits(spawnCollector('c1', 2, 2, 'player', 100));
    expect(orderAttackMove(s2, ['c1'], { gx: 4, gy: 4 }, ctx())).toEqual({ issued: [], denial: 'no-selection' });
    expect(s.combatOrders).toBeUndefined();
    expect(s2.combatOrders).toBeUndefined();
  });

  it('denies an off-map destination without touching any unit', () => {
    const p1 = fighter('p1', 'player', 2, 2);
    const s = withUnits(p1);
    const res = orderAttackMove(s, ['p1'], { gx: 99, gy: 99 }, ctx());
    expect(res).toEqual({ issued: [], denial: 'bad-destination' });
    expect(p1.path).toEqual([]);
    expect(s.combatOrders).toBeUndefined();
  });
});

describe('attack-move acquisition (through realtime.update — the wrapper hook has teeth)', () => {
  it('diverts onto a VISIBLE hostile inside the acquire radius, en route', () => {
    const p1 = fighter('p1', 'player', 2, 2);
    const r1 = fighter('r1', 'rival-a', 5, 5); // dist ~4.2 < 5, off the walking line (no 35a contact yet)
    const s = withUnits(p1, r1);
    orderAttackMove(s, ['p1'], { gx: 12, gy: 2 }, ctx());
    expect(pathEnd(p1)).toEqual({ gx: 12, gy: 2 }); // ordered course
    update(s, 0.05, 1e9, ctx()); // realtime wrapper drives the hook
    expect(pathEnd(p1)).toEqual(unitTile(r1)); // converted to attack on sight — course changed
    expect(s.combatOrders!.p1.stance).toBe('ATTACK_MOVE'); // the order survives the divert
  });

  it('NO-X-RAY (plan-mandated): a HIDDEN hostile in radius causes no engagement and NO course change', () => {
    // Twin worlds: A has a fogged rival inside the acquire radius; B has no rival at all.
    // Every observable of the ordered unit must be byte-identical — attack-move must not be a fog probe.
    const hidden = (pos: GridPos): boolean => !(Math.round(pos.gx) === 5 && Math.round(pos.gy) === 5);
    const mk = (withRival: boolean): GameState => {
      const units = [fighter('p1', 'player', 2, 2)];
      if (withRival) units.push(fighter('r1', 'rival-a', 5, 5)); // in radius, but fogged
      return withUnits(...units);
    };
    const a = mk(true);
    const b = mk(false);
    orderAttackMove(a, ['p1'], { gx: 12, gy: 2 }, ctx(hidden));
    orderAttackMove(b, ['p1'], { gx: 12, gy: 2 }, ctx(hidden));
    for (let i = 0; i < 10; i++) {
      update(a, 0.3, 1e9, ctx(hidden));
      update(b, 0.3, 1e9, ctx(hidden));
    }
    const pa = a.units.find((u) => u.id === 'p1')!;
    const pb = b.units.find((u) => u.id === 'p1')!;
    expect(json(pa)).toBe(json(pb));                    // position + path identical
    expect(json(a.combatOrders)).toBe(json(b.combatOrders)); // order lifecycle identical
    expect(a.rngState).toBe(b.rngState);                // and no draw anywhere
  });

  it('an attack-move onto the unit\'s OWN tile clears instead of freezing it (mid-step fractional pos)', () => {
    // Review finding: at pos (3.45,7.45) the fractional offset to tile (3,7) is ~0.636 > eps 0.6,
    // and issueMove-to-own-tile trims to an EMPTY path — without the standing-on-dest arrival rule
    // the order was immortal and the unit frozen.
    const p1 = fighter('p1', 'player', 3, 7);
    p1.pos = { gx: 3.45, gy: 7.45 }; // mid-diagonal fractional position (rounds to (3,7))
    const s = withUnits(p1);
    const res = orderAttackMove(s, ['p1'], { gx: 3, gy: 7 }, ctx());
    expect(res.issued).toEqual(['p1']);
    update(s, 0.05, 1e9, ctx());
    expect(s.combatOrders?.p1).toBeUndefined(); // standing on the dest tile IS arrival — order spent
  });

  it('resumes the advance when the foe drops, then clears itself on arrival', () => {
    const p1 = fighter('p1', 'player', 2, 2);
    const r1 = fighter('r1', 'rival-a', 4, 3);
    const s = withUnits(p1, r1);
    orderAttackMove(s, ['p1'], { gx: 8, gy: 2 }, ctx());
    update(s, 0.05, 1e9, ctx());
    expect(pathEnd(p1)).toEqual(unitTile(r1)); // engaged
    s.units = s.units.filter((u) => u.id !== 'r1'); // the foe goes down (35a removes downed units)
    update(s, 0.05, 1e9, ctx());
    expect(pathEnd(p1)).toEqual({ gx: 8, gy: 2 }); // re-aimed at the ordered destination
    for (let i = 0; i < 30 && s.combatOrders?.p1; i++) update(s, 0.5, 1e9, ctx());
    expect(s.combatOrders?.p1).toBeUndefined(); // arrived — the order is spent
    const arrived = s.units.find((u) => u.id === 'p1')!;
    expect(Math.hypot(arrived.pos.gx - 8, arrived.pos.gy - 2)).toBeLessThan(0.7);
  });
});

describe('orderFocusFire — designation + NO-X-RAY denial collapse', () => {
  it('converges every selected fighter on the visible mark via the existing move-to-engage', () => {
    const p1 = fighter('p1', 'player', 2, 2);
    const p2 = fighter('p2', 'player', 3, 2);
    const r1 = fighter('r1', 'rival-a', 8, 8);
    const s = withUnits(p1, p2, r1);
    const res = orderFocusFire(s, ['p1', 'p2'], 'r1', ctx());
    expect(res.issued).toEqual(['p1', 'p2']);
    expect(s.combatOrders!.p1).toEqual({ stance: 'FOCUS_FIRE', targetId: 'r1', lastSeen: { gx: 8, gy: 8 } });
    expect(pathEnd(p1)).toEqual({ gx: 8, gy: 8 });
    expect(pathEnd(p2)).toEqual({ gx: 8, gy: 8 });
  });

  it('NO-X-RAY: a fogged target and a missing target produce the IDENTICAL result object', () => {
    const hidden = (pos: GridPos): boolean => !(Math.round(pos.gx) === 8 && Math.round(pos.gy) === 8);
    const withHidden = withUnits(fighter('p1', 'player', 2, 2), fighter('r1', 'rival-a', 8, 8));
    const withNothing = withUnits(fighter('p1', 'player', 2, 2));
    const a = orderFocusFire(withHidden, ['p1'], 'r1', ctx(hidden));
    const b = orderFocusFire(withNothing, ['p1'], 'r1', ctx(hidden));
    expect(a).toEqual({ issued: [], denial: 'no-visible-target' });
    expect(json(a)).toBe(json(b)); // no observable distinguishes hidden-rival from nothing-there
    expect(withHidden.combatOrders).toBeUndefined();
    expect(json(withHidden.units.find((u) => u.id === 'p1'))).toBe(
      json(withNothing.units.find((u) => u.id === 'p1')),
    );
  });

  it('refuses visible-but-invalid marks with specific (leak-free) denials', () => {
    const p1 = fighter('p1', 'player', 2, 2);
    const p2 = fighter('p2', 'player', 4, 2);
    const rc = spawnCollector('rc', 6, 6, 'rival-a', 50);
    const s = withUnits(p1, p2, rc);
    expect(orderFocusFire(s, ['p1'], 'rc', ctx()).denial).toBe('not-a-fighter'); // visible rival collector
    expect(orderFocusFire(s, ['p1'], 'p2', ctx()).denial).toBe('not-hostile');   // visible friendly
    expect(orderFocusFire(s, ['p1'], 'p1', ctx()).denial).toBe('not-hostile');   // self
    expect(s.combatOrders).toBeUndefined();
  });

  it('chases a moving visible mark, then demotes to the LAST-SEEN tile when it slips into fog', () => {
    const p1 = fighter('p1', 'player', 2, 2);
    const r1 = fighter('r1', 'rival-a', 8, 8);
    const s = withUnits(p1, r1);
    let fogWall = 99; // tiles with gx >= fogWall are hidden
    const vis = (pos: GridPos): boolean => Math.round(pos.gx) < fogWall;
    orderFocusFire(s, ['p1'], 'r1', ctx(vis));
    r1.pos = { gx: 10, gy: 8 }; // the mark relocates while visible
    update(s, 0.05, 1e9, ctx(vis));
    expect(pathEnd(p1)).toEqual({ gx: 10, gy: 8 });                    // chase re-aims
    expect(s.combatOrders!.p1.lastSeen).toEqual({ gx: 10, gy: 8 });    // knowledge updated
    fogWall = 10; // the mark's tile goes dark
    update(s, 0.05, 1e9, ctx(vis));
    expect(s.combatOrders!.p1).toEqual({ stance: 'ATTACK_MOVE', dest: { gx: 10, gy: 8 } }); // demoted
    r1.pos = { gx: 14, gy: 14 }; // it keeps moving in the fog…
    update(s, 0.05, 1e9, ctx(vis));
    expect(pathEnd(p1)).toEqual({ gx: 10, gy: 8 }); // …and NOTHING tracks it (course pinned to last-seen)
  });

  it('demotes to the last-seen tile when the mark leaves play (never a bare delete)', () => {
    const p1 = fighter('p1', 'player', 2, 2);
    const r1 = fighter('r1', 'rival-a', 8, 8);
    const s = withUnits(p1, r1);
    orderFocusFire(s, ['p1'], 'r1', ctx());
    s.units = s.units.filter((u) => u.id !== 'r1'); // downed → removed
    update(s, 0.05, 1e9, ctx());
    // the crew walks to where the mark last stood; the attack-move then clears on arrival
    expect(s.combatOrders?.p1).toEqual({ stance: 'ATTACK_MOVE', dest: { gx: 8, gy: 8 } });
  });

  it('NO-X-RAY: a mark that DIES unseen in the fog plays out exactly like one still alive in it', () => {
    // Review finding: gone-vs-fogged must be ONE branch — if "gone" deleted where "fogged" demotes,
    // watching whether your man keeps walking would reveal whether the hidden mark died.
    const hidden = (pos: GridPos): boolean => !(Math.round(pos.gx) >= 8); // gx≥8 is fog
    const mk = (): GameState => withUnits(fighter('p1', 'player', 2, 2), fighter('r1', 'rival-a', 7, 8));
    const died = mk();
    const lives = mk();
    orderFocusFire(died, ['p1'], 'r1', ctx(hidden));
    orderFocusFire(lives, ['p1'], 'r1', ctx(hidden));
    // the mark steps into the fog in both worlds…
    for (const s of [died, lives]) s.units.find((u) => u.id === 'r1')!.pos = { gx: 9, gy: 8 };
    died.units = died.units.filter((u) => u.id !== 'r1'); // …and dies there in ONE of them
    for (let i = 0; i < 8; i++) {
      update(died, 0.3, 1e9, ctx(hidden));
      update(lives, 0.3, 1e9, ctx(hidden));
    }
    expect(json(died.combatOrders)).toBe(json(lives.combatOrders));
    expect(json(died.units.find((u) => u.id === 'p1'))).toBe(json(lives.units.find((u) => u.id === 'p1')));
  });
});

describe('orderDisengage — break off away from VISIBLE threats only', () => {
  it('retreats directly away from the visible threat and self-clears once clear', () => {
    const p1 = fighter('p1', 'player', 10, 10);
    const r1 = fighter('r1', 'rival-a', 12, 10); // 2 east — inside the scan radius
    const s = withUnits(p1, r1);
    const res = orderDisengage(s, ['p1'], ctx());
    expect(res.issued).toEqual(['p1']);
    expect(s.combatOrders!.p1).toEqual({ stance: 'DISENGAGE' });
    expect(pathEnd(p1)).toEqual({ gx: 10 - DISENGAGE_STEP_TILES, gy: 10 }); // due west, one clean leg
    const before = Math.hypot(p1.pos.gx - r1.pos.gx, p1.pos.gy - r1.pos.gy);
    for (let i = 0; i < 12 && s.combatOrders?.p1; i++) update(s, 0.4, 1e9, ctx());
    const after = Math.hypot(p1.pos.gx - r1.pos.gx, p1.pos.gy - r1.pos.gy);
    expect(after).toBeGreaterThan(before);              // it actually broke off
    expect(after).toBeGreaterThan(COMBAT_ACQUIRE_RADIUS); // clear of the scan radius
    expect(s.combatOrders?.p1).toBeUndefined();         // breakoff complete — order spent
  });

  it('NO-X-RAY: a HIDDEN flanker never steers the retreat (fog-probe test)', () => {
    // Twin worlds: both have the same visible threat east; A adds a fogged flanker north that WOULD
    // rotate the away-vector if it were (wrongly) counted. The retreat must be byte-identical.
    const hidden = (pos: GridPos): boolean => !(Math.round(pos.gx) === 10 && Math.round(pos.gy) === 13);
    const mk = (withFlanker: boolean): GameState => {
      const units = [fighter('p1', 'player', 10, 10), fighter('r1', 'rival-a', 12, 10)];
      if (withFlanker) units.push(fighter('r2', 'rival-a', 10, 13)); // fogged, 3 south
      return withUnits(...units);
    };
    const a = mk(true);
    const b = mk(false);
    expect(orderDisengage(a, ['p1'], ctx(hidden)).issued).toEqual(['p1']);
    expect(orderDisengage(b, ['p1'], ctx(hidden)).issued).toEqual(['p1']);
    for (let i = 0; i < 6; i++) {
      update(a, 0.3, 1e9, ctx(hidden));
      update(b, 0.3, 1e9, ctx(hidden));
    }
    expect(json(a.units.find((u) => u.id === 'p1'))).toBe(json(b.units.find((u) => u.id === 'p1')));
    expect(json(a.combatOrders)).toBe(json(b.combatOrders));
  });

  it('a cornered retreat self-clears instead of re-flooding pathfinding every tick', () => {
    // Review finding: with every retreat rung blocked, the standing order retried 3 findPath calls
    // per tick forever. Now a failed leg clears the order — the unit stands and 35a defends.
    const walls: GridPos[] = [];
    for (let gy = 0; gy < 32; gy++) walls.push({ gx: 0, gy }); // wall the western edge
    const walled = makeGrid(32, 32, walls);
    const p1 = fighter('p1', 'player', 1, 10);
    const r1 = fighter('r1', 'rival-a', 3, 10); // pushes the retreat due west, into the wall
    const s = withUnits(p1, r1);
    s.combatOrders = { p1: { stance: 'DISENGAGE' } }; // order stood before the corner closed
    update(s, 0.05, 1e9, { grid: walled, isVisible: ALL });
    expect(s.combatOrders.p1).toBeUndefined(); // cornered — cleared, not spinning
  });

  it("denies 'not-engaged' when no VISIBLE threat is in the scan radius (hidden ≡ absent)", () => {
    const clear = withUnits(fighter('p1', 'player', 10, 10)); // nothing anywhere
    const fogged = withUnits(fighter('p1', 'player', 10, 10), fighter('r1', 'rival-a', 12, 10));
    const hideAll = (): boolean => false;
    const a = orderDisengage(clear, ['p1'], ctx());
    const b = orderDisengage(fogged, ['p1'], ctx(hideAll));
    expect(a).toEqual({ issued: [], denial: 'not-engaged' });
    expect(json(a)).toBe(json(b)); // a hidden nearby rival reads exactly like open ground
  });
});

describe('numbers-frozen — flag off / hook inert, the game is byte-identical', () => {
  it('same seed, ctx supplied vs not: no orders ⇒ identical states and an untouched shared cursor', () => {
    const a = createInitialState(7, { startingCrew: true, bigCity: true });
    const b = createInitialState(7, { startingCrew: true, bigCity: true });
    for (let i = 0; i < 30; i++) {
      update(a, 0.5, 2, ctx()); // ctx present but no slice — the hook must be a structural no-op
      update(b, 0.5, 2);        // legacy caller shape
    }
    expect(a.rngState).toBe(b.rngState);
    expect(json(a)).toBe(json(b));
    expect(a.combatOrders).toBeUndefined();
    expect(b.combatOrders).toBeUndefined();
  });

  it('slice present but NO ctx (headless/legacy update): orders are inert, never advanced or pruned', () => {
    const p1 = fighter('p1', 'player', 2, 2);
    const r1 = fighter('r1', 'rival-a', 4, 2); // in radius — would divert if the hook ran with a ctx
    const s = withUnits(p1, r1);
    orderAttackMove(s, ['p1'], { gx: 12, gy: 2 }, ctx());
    const orders0 = json(s.combatOrders);
    update(s, 0.2, 1e9); // no ctx — the hook may not invent a visibility rule of its own
    expect(json(s.combatOrders)).toBe(orders0);
    expect(pathEnd(s.units.find((u) => u.id === 'p1')!)).toEqual({ gx: 12, gy: 2 }); // no divert
  });

  it('active orders draw NO randomness: the shared cursor matches an order-free twin exactly', () => {
    const mk = (): GameState => {
      const s = createInitialState(7, { startingCrew: true, bigCity: true });
      s.units = [fighter('p1', 'player', 2, 2), fighter('r1', 'rival-a', 30, 30)];
      return s;
    };
    const a = mk();
    const b = mk();
    orderAttackMove(a, ['p1'], { gx: 12, gy: 2 }, ctx());
    for (let i = 0; i < 30; i++) {
      update(a, 0.5, 2, ctx());
      update(b, 0.5, 2);
    }
    expect(a.rngState).toBe(b.rngState); // not one extra draw, same order — there is no combat cursor
    expect(a.lawRngState).toBe(b.lawRngState); // and no other cursor was touched either
  });
});

describe('clearCombatOrders — STOP/HOLD/fresh-MOVE hygiene', () => {
  it('drops exactly the named orders and no-ops without the slice', () => {
    const s = withUnits(fighter('p1', 'player', 2, 2), fighter('p2', 'player', 3, 3), fighter('r1', 'rival-a', 9, 9));
    clearCombatOrders(s, ['p1']); // no slice yet — must not create one
    expect(s.combatOrders).toBeUndefined();
    orderAttackMove(s, ['p1', 'p2'], { gx: 12, gy: 12 }, ctx());
    clearCombatOrders(s, ['p1']);
    expect(s.combatOrders!.p1).toBeUndefined();
    expect(s.combatOrders!.p2).toBeDefined();
  });
});

describe('pickVisibleHostile — the fog-safe right-click target pick', () => {
  it('picks a visible rival fighter; a fogged one resolves exactly like empty ground', () => {
    const r1 = fighter('r1', 'rival-a', 8, 8);
    const units = [fighter('p1', 'player', 2, 2), r1];
    expect(pickVisibleHostile(units, { gx: 8.2, gy: 8.1 }, 'player', ALL)?.id).toBe('r1');
    const hidden = (pos: GridPos): boolean => !(Math.round(pos.gx) === 8 && Math.round(pos.gy) === 8);
    expect(pickVisibleHostile(units, { gx: 8.2, gy: 8.1 }, 'player', hidden)).toBeUndefined();
    expect(pickVisibleHostile([units[0]], { gx: 8.2, gy: 8.1 }, 'player', ALL)).toBeUndefined(); // ≡ nothing there
  });

  it('never picks own units, collectors, or downed rivals', () => {
    const own = fighter('p1', 'player', 8, 8);
    const rc = spawnCollector('rc', 8, 8, 'rival-a', 50);
    const down = { ...fighter('r2', 'rival-a', 8, 8), downed: true };
    expect(pickVisibleHostile([own], { gx: 8, gy: 8 }, 'player', ALL)).toBeUndefined();
    expect(pickVisibleHostile([rc], { gx: 8, gy: 8 }, 'player', ALL)).toBeUndefined();
    expect(pickVisibleHostile([down], { gx: 8, gy: 8 }, 'player', ALL)).toBeUndefined();
  });
});

describe('visibility selectors', () => {
  it('nearestVisibleHostile: nearest wins among the visible; hidden and friendly never do', () => {
    const self = fighter('p1', 'player', 0, 0);
    const near = fighter('r1', 'rival-a', 2, 0);
    const far = fighter('r2', 'rival-a', 4, 0);
    const friend = fighter('p2', 'player', 1, 0);
    expect(nearestVisibleHostile(self, [self, friend, far, near], 5, ALL)?.id).toBe('r1');
    const hideNear = (pos: GridPos): boolean => Math.round(pos.gx) !== 2;
    expect(nearestVisibleHostile(self, [self, friend, far, near], 5, hideNear)?.id).toBe('r2');
    expect(nearestVisibleHostile(self, [self, near], 5, () => false)).toBeUndefined();
    expect(nearestVisibleHostile(self, [self, far], 3, ALL)).toBeUndefined(); // out of radius
  });

  it('visibleThreats: only visible hostiles inside the radius', () => {
    const self = fighter('p1', 'player', 0, 0);
    const a = fighter('r1', 'rival-a', 2, 0);
    const b = fighter('r2', 'rival-a', 0, 3);
    const c = fighter('r3', 'rival-a', 9, 9); // out of radius
    const hideB = (pos: GridPos): boolean => Math.round(pos.gy) !== 3;
    expect(visibleThreats(self, [self, a, b, c], 5, ALL).map((t) => t.id)).toEqual(['r1', 'r2']);
    expect(visibleThreats(self, [self, a, b, c], 5, hideB).map((t) => t.id)).toEqual(['r1']);
  });
});

describe('denial feedback — no silent refusals, no leaky wording', () => {
  it('every denial value has a non-empty status line', () => {
    const denials: CombatDenial[] = [
      'no-selection', 'bad-destination', 'no-visible-target', 'not-a-fighter', 'not-hostile', 'not-engaged',
    ];
    for (const d of denials) {
      expect(combatDenialText(d).length, `denial '${d}' must speak`).toBeGreaterThan(0);
    }
  });
});

describe('save round-trip — the slice is plain JSON and resumes in lockstep', () => {
  it('orders survive serialize/deserialize byte-exactly and keep driving after a load', () => {
    const s = withUnits(fighter('p1', 'player', 2, 2), fighter('r1', 'rival-a', 20, 20));
    orderAttackMove(s, ['p1'], { gx: 12, gy: 2 }, ctx());
    const back = deserializeGame(serializeGame(s));
    if (!back.ok) throw new Error(`load failed: ${back.reason}`);
    expect(json(back.state.combatOrders)).toBe(json(s.combatOrders));
    for (let i = 0; i < 5; i++) {
      update(s, 0.4, 1e9, ctx());
      update(back.state, 0.4, 1e9, ctx());
    }
    expect(back.state.combatOrders).toEqual(s.combatOrders);
    expect(back.state.units).toEqual(s.units);
  });
});

describe('wiring exists (mutation-verified at the source): realtime hook + IsoScene input/feedback', () => {
  const simSrc = readFileSync(join(process.cwd(), 'src', 'sim', 'realtime.ts'), 'utf8');
  const sceneSrc = readFileSync(join(process.cwd(), 'src', 'scenes', 'IsoScene.ts'), 'utf8');

  it('realtime.update carries the additive combat hook and threads the ctx through updateAndObserve', () => {
    expect(simSrc).toContain('advanceCombatOrders(state, dt, combatCtx)');
    expect(simSrc).toMatch(/update\(state, dt, weekDuration, combatCtx, lawEnabled\)/); // exact updateAndObserve pass-through
  });

  it('IsoScene gates every combat input path behind the runtime profile and reuses THE seams', () => {
    // FP-01 promotes combat into the showcase profile while retaining profile/per-layer rollback.
    expect(sceneSrc).toContain('private combatControlsEnabled = this.featureProfile.combatControls;');
    // the frame loop hands the wrapper the ctx only when flagged
    expect(sceneSrc).toContain('this.combatControlsEnabled ? this.combatCtx() : undefined');
    // [A]-armed click routes through the sim verb when flagged, the #17 stance otherwise
    expect(sceneSrc).toMatch(/if \(this\.combatControlsEnabled\) this\.commandCombatAttackMove\(p\);\s*\n\s*else this\.commandAttackMove\(p\);/);
    // right-click rival routes to focus-fire when flagged
    expect(sceneSrc).toMatch(/if \(this\.combatControlsEnabled\) this\.commandFocusFire\(target\.unitId\);\s*\n\s*else this\.commandAttackUnit\(target\.unitId\);/);
    // the rival pick itself is fog-safe when flagged (verb routing must not be an X-ray)
    expect(sceneSrc).toContain('? pickVisibleHostile(');
    // [W] disengage is bound, and the handler is a hard no-op without the flag
    expect(sceneSrc).toMatch(/keydown-W', \(\) => this\.commandDisengage\(\)/);
    const disengage = sceneSrc.slice(sceneSrc.indexOf('private commandDisengage('));
    expect(disengage.slice(0, 300)).toContain('if (!this.combatControlsEnabled) return;');
  });

  it('denials speak through combatDenialText and target feedback rides shouldEmitFeedback', () => {
    expect(sceneSrc).toContain('combatDenialText(');
    const focus = sceneSrc.slice(sceneSrc.indexOf('private commandFocusFire('));
    expect(focus.slice(0, 1600)).toContain('shouldEmitFeedback('); // THE gate — no parallel visibility check
  });

  it('STOP / HOLD / MOVE / ATTACK / both embodied dispatches all clear the sim orders (single-driver hygiene)', () => {
    const count = (sceneSrc.match(/clearCombatOrders\(this\.state, /g) ?? []).length;
    // commandStop, commandHold, commandMove, commandAttackUnit, commandExtortBusiness,
    // commandAttackBusiness — a standing order must never steal a dispatched thug's path back.
    expect(count).toBeGreaterThanOrEqual(6);
  });

  it('the combat surface introduces NO cursor leak — the legacy channels stay fog-safe with the flag OFF', () => {
    // fog-leak-fix superseded #67's combat-ONLY cursor gating (`this.combatEnabled ? …filter(isVisible)`),
    // which leaked a fogged rival's identity on hover/left-click/preview whenever ?combat=1 was off. The
    // flagged verb routing still uses the fog-safe hostile pick; the exhaustive per-channel wiring proof
    // lives in tests/fogLeak.test.ts. Here we only guard that the combat lane never re-adds the conditional.
    expect(sceneSrc).toContain('? pickVisibleHostile('); // flagged right-click stays fog-safe
    expect(sceneSrc).not.toMatch(/this\.combatControlsEnabled \? \w+\.filter\(\(u\) => (this\.combatCtx\(\)\.isVisible|isVis)\(u\.pos\)\)/);
  });
});
