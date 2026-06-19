import { describe, it, expect } from 'vitest';
import {
  spawnUnit,
  unitTile,
  unitArrived,
  unitDestination,
  setUnitPath,
  issueMove,
  stopUnit,
  advanceUnit,
  advanceUnits,
} from '../src/sim/movement';
import { makeGrid } from '../src/sim/pathfinding';
import { update } from '../src/sim/realtime';
import { createInitialState } from '../src/sim/state';
import { MOVE_SPEED } from '../src/sim/constants';
import type { GridPos } from '../src/sim/iso';

describe('spawnUnit & unit predicates', () => {
  it('spawns an idle unit at a tile with the default speed', () => {
    const u = spawnUnit('u1', 3, 5);
    expect(u.pos).toEqual({ gx: 3, gy: 5 });
    expect(u.path).toEqual([]);
    expect(u.speed).toBe(MOVE_SPEED);
    expect(unitArrived(u)).toBe(true);
    expect(unitTile(u)).toEqual({ gx: 3, gy: 5 });
    expect(unitDestination(u)).toBeUndefined();
  });

  it('setUnitPath trims a leading waypoint equal to the current tile', () => {
    const u = spawnUnit('u1', 0, 0);
    setUnitPath(u, [{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }, { gx: 2, gy: 0 }]);
    expect(u.path).toEqual([{ gx: 1, gy: 0 }, { gx: 2, gy: 0 }]);
    expect(unitArrived(u)).toBe(false);
    expect(unitDestination(u)).toEqual({ gx: 2, gy: 0 });
  });

  it('stopUnit clears the path but leaves the position unchanged', () => {
    const u = spawnUnit('u1', 0, 0, 2);
    setUnitPath(u, [{ gx: 1, gy: 0 }]);
    advanceUnit(u, 0.25); // partway
    const where = { ...u.pos };
    stopUnit(u);
    expect(u.path).toEqual([]);
    expect(u.pos).toEqual(where);
    expect(unitArrived(u)).toBe(true);
  });
});

describe('advanceUnit — travels and arrives over stepped dt', () => {
  it('covers speed·dt tiles per second along a straight path', () => {
    const u = spawnUnit('u1', 0, 0, 2); // 2 tiles/sec
    setUnitPath(u, [{ gx: 1, gy: 0 }, { gx: 2, gy: 0 }, { gx: 3, gy: 0 }, { gx: 4, gy: 0 }]);
    expect(advanceUnit(u, 1)).toBe(false); // 2 tiles in 1s -> at (2,0), not yet arrived
    expect(u.pos.gx).toBeCloseTo(2);
    expect(u.pos.gy).toBeCloseTo(0);
    expect(unitArrived(u)).toBe(false);
  });

  it('arrives exactly on the step that empties the path, then stays put', () => {
    const u = spawnUnit('u1', 0, 0, 2);
    setUnitPath(u, [{ gx: 1, gy: 0 }, { gx: 2, gy: 0 }, { gx: 3, gy: 0 }, { gx: 4, gy: 0 }]);
    expect(advanceUnit(u, 1)).toBe(false); // -> (2,0)
    expect(advanceUnit(u, 1)).toBe(true); // -> (4,0), arrives THIS step
    expect(u.pos.gx).toBeCloseTo(4);
    expect(unitArrived(u)).toBe(true);
    expect(advanceUnit(u, 1)).toBe(false); // idle: no further movement
    expect(u.pos.gx).toBeCloseTo(4);
  });

  it('reaches the destination across many tiny steps (and stops moving)', () => {
    const u = spawnUnit('u1', 0, 0, 2);
    setUnitPath(u, [{ gx: 1, gy: 0 }, { gx: 2, gy: 0 }, { gx: 3, gy: 0 }, { gx: 4, gy: 0 }]);
    let arrived = false;
    for (let i = 0; i < 100 && !arrived; i++) arrived = advanceUnit(u, 0.05);
    expect(arrived).toBe(true);
    expect(u.pos.gx).toBeCloseTo(4);
    expect(u.pos.gy).toBeCloseTo(0);
    expect(unitArrived(u)).toBe(true);
  });

  it('ignores a non-positive dt', () => {
    const u = spawnUnit('u1', 0, 0, 2);
    setUnitPath(u, [{ gx: 4, gy: 0 }]);
    expect(advanceUnit(u, 0)).toBe(false);
    expect(advanceUnit(u, -1)).toBe(false);
    expect(u.pos).toEqual({ gx: 0, gy: 0 });
  });
});

describe('advanceUnit — frame-rate independence', () => {
  it('one big step lands where many small steps land (straight segment)', () => {
    const path: GridPos[] = [{ gx: 10, gy: 0 }];
    const big = spawnUnit('a', 0, 0, 2);
    const small = spawnUnit('b', 0, 0, 2);
    setUnitPath(big, path);
    setUnitPath(small, path);

    advanceUnit(big, 1.0); // once
    advanceUnit(small, 0.5); // twice == same total time
    advanceUnit(small, 0.5);

    expect(small.pos.gx).toBeCloseTo(big.pos.gx, 9);
    expect(small.pos.gy).toBeCloseTo(big.pos.gy, 9);
    expect(big.pos.gx).toBeCloseTo(2); // 2 tiles/sec * 1s
  });

  it('stays frame-rate independent across a waypoint corner', () => {
    const path: GridPos[] = [{ gx: 2, gy: 0 }, { gx: 2, gy: 2 }];
    const big = spawnUnit('a', 0, 0, 2);
    const small = spawnUnit('b', 0, 0, 2);
    setUnitPath(big, path);
    setUnitPath(small, path);

    advanceUnit(big, 1.5); // 3 tiles of arc length in one go -> (2,1)
    for (let i = 0; i < 3; i++) advanceUnit(small, 0.5); // 3 x 1 tile -> (2,1)

    expect(small.pos.gx).toBeCloseTo(big.pos.gx, 9);
    expect(small.pos.gy).toBeCloseTo(big.pos.gy, 9);
    expect(big.pos.gx).toBeCloseTo(2);
    expect(big.pos.gy).toBeCloseTo(1);
  });
});

describe('issueMove — pathfinds around blockers then drives to arrival', () => {
  it('routes around a blocked tile and arrives at the target', () => {
    const grid = makeGrid(8, 8, [{ gx: 1, gy: 0 }]);
    const u = spawnUnit('u1', 0, 0, 2);
    const ok = issueMove(u, { gx: 2, gy: 0 }, grid);
    expect(ok).toBe(true);
    expect(u.path).not.toContainEqual({ gx: 1, gy: 0 }); // detour avoids the blocker
    expect(unitDestination(u)).toEqual({ gx: 2, gy: 0 });

    let arrived = false;
    for (let i = 0; i < 200 && !arrived; i++) arrived = advanceUnit(u, 0.1);
    expect(arrived).toBe(true);
    expect(u.pos.gx).toBeCloseTo(2);
    expect(u.pos.gy).toBeCloseTo(0);
  });

  it('returns false and leaves the unit idle when the target is unreachable', () => {
    const grid = makeGrid(3, 3, [{ gx: 1, gy: 0 }, { gx: 1, gy: 1 }, { gx: 1, gy: 2 }]);
    const u = spawnUnit('u1', 0, 0, 2);
    expect(issueMove(u, { gx: 2, gy: 0 }, grid)).toBe(false);
    expect(unitArrived(u)).toBe(true);
    expect(u.pos).toEqual({ gx: 0, gy: 0 });
  });
});

describe('advanceUnits — batch & arrival ids', () => {
  it('advances every unit and reports the ids that arrived this step', () => {
    const a = spawnUnit('a', 0, 0, 2);
    const b = spawnUnit('b', 0, 0, 2);
    setUnitPath(a, [{ gx: 1, gy: 0 }]); // 1 tile -> arrives in 0.5s
    setUnitPath(b, [{ gx: 10, gy: 0 }]); // far -> still moving
    const arrived = advanceUnits([a, b], 0.5);
    expect(arrived).toEqual(['a']);
    expect(unitArrived(a)).toBe(true);
    expect(unitArrived(b)).toBe(false);
  });
});

describe('update — movement is on the week clock but never interrupted by it', () => {
  it('a week settlement fires without resetting or stopping a unit mid-move', () => {
    const state = createInitialState(1);
    const u = spawnUnit('runner', 0, 0, 2.5);
    setUnitPath(u, [{ gx: 10, gy: 0 }]);
    state.units.push(u);

    // Short 1-second "weeks" so a settlement boundary falls mid-journey.
    const r1 = update(state, 0.5, 1);
    expect(r1.weeksFired).toBe(0);
    expect(state.tick).toBe(0);
    expect(u.pos.gx).toBeCloseTo(1.25); // 2.5 tiles/sec * 0.5s

    const r2 = update(state, 0.6, 1); // crosses the 1s week boundary
    expect(r2.weeksFired).toBe(1); // the economic tick fired...
    expect(state.tick).toBe(1);
    expect(u.pos.gx).toBeCloseTo(2.75); // ...and the unit kept moving straight through it
    expect(unitArrived(u)).toBe(false); // its path was not reset
    expect(state.weekElapsed).toBeCloseTo(0.1);
  });

  it('is deterministic: identical dt sequences yield deeply equal states', () => {
    const run = () => {
      const s = createInitialState(3);
      s.units.push(spawnUnit('m', 1, 1, 2));
      setUnitPath(s.units[0], [{ gx: 6, gy: 1 }]);
      for (let i = 0; i < 20; i++) update(s, 0.3, 5);
      return s;
    };
    expect(run()).toEqual(run());
  });
});
