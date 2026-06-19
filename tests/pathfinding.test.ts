import { describe, it, expect } from 'vitest';
import { findPath, makeGrid, isValidPath } from '../src/sim/pathfinding';
import type { GridPos } from '../src/sim/iso';

const open = (cols = 8, rows = 8) => makeGrid(cols, rows, []);

describe('findPath — open grid', () => {
  it('walks a straight, minimal row path (deterministic E-first BFS)', () => {
    const path = findPath({ gx: 0, gy: 0 }, { gx: 3, gy: 0 }, open());
    expect(path).toEqual([
      { gx: 0, gy: 0 },
      { gx: 1, gy: 0 },
      { gx: 2, gy: 0 },
      { gx: 3, gy: 0 },
    ]);
  });

  it('a path to the current tile is just that tile', () => {
    expect(findPath({ gx: 2, gy: 2 }, { gx: 2, gy: 2 }, open())).toEqual([{ gx: 2, gy: 2 }]);
  });

  it('finds a Manhattan-length path on the diagonal (4 steps for (0,0)->(2,2))', () => {
    const path = findPath({ gx: 0, gy: 0 }, { gx: 2, gy: 2 }, open());
    expect(path).not.toBeNull();
    expect(path!).toHaveLength(5); // 4 orthogonal steps, inclusive of both ends
    expect(path![0]).toEqual({ gx: 0, gy: 0 });
    expect(path![path!.length - 1]).toEqual({ gx: 2, gy: 2 });
    expect(isValidPath(path!, open())).toBe(true);
  });
});

describe('findPath — routes around blocked tiles', () => {
  it('detours around a single blocked tile and never steps on it', () => {
    const grid = makeGrid(8, 8, [{ gx: 1, gy: 0 }]);
    const path = findPath({ gx: 0, gy: 0 }, { gx: 2, gy: 0 }, grid);
    expect(path).not.toBeNull();
    // Shortest detour around one blocker is 4 steps (5 tiles): straight 2 tiles is impossible.
    expect(path!).toHaveLength(5);
    expect(path).not.toContainEqual({ gx: 1, gy: 0 });
    expect(path![0]).toEqual({ gx: 0, gy: 0 });
    expect(path![path!.length - 1]).toEqual({ gx: 2, gy: 0 });
    expect(isValidPath(path!, grid)).toBe(true);
  });

  it('routes around a wall (a column of blockers) to reach the far side', () => {
    // Wall down x=2 with a gap at the bottom row forces the path under the wall.
    const wall: GridPos[] = [
      { gx: 2, gy: 0 },
      { gx: 2, gy: 1 },
      { gx: 2, gy: 2 },
      { gx: 2, gy: 3 },
    ];
    const grid = makeGrid(6, 6, wall);
    const path = findPath({ gx: 0, gy: 0 }, { gx: 4, gy: 0 }, grid);
    expect(path).not.toBeNull();
    expect(isValidPath(path!, grid)).toBe(true);
    // It must dip to at least row 4 (the gap) to get past the wall.
    expect(Math.max(...path!.map((p) => p.gy))).toBeGreaterThanOrEqual(4);
    for (const w of wall) expect(path).not.toContainEqual(w);
  });

  it('returns null when the goal tile is blocked', () => {
    const grid = makeGrid(6, 6, [{ gx: 3, gy: 3 }]);
    expect(findPath({ gx: 0, gy: 0 }, { gx: 3, gy: 3 }, grid)).toBeNull();
  });

  it('returns null when the goal is walled off entirely (unreachable)', () => {
    // Full vertical wall splits a 3-wide grid; (2,*) is unreachable from (0,0).
    const grid = makeGrid(3, 3, [{ gx: 1, gy: 0 }, { gx: 1, gy: 1 }, { gx: 1, gy: 2 }]);
    expect(findPath({ gx: 0, gy: 0 }, { gx: 2, gy: 0 }, grid)).toBeNull();
  });

  it('returns null for an out-of-bounds goal', () => {
    expect(findPath({ gx: 0, gy: 0 }, { gx: 9, gy: 0 }, open())).toBeNull();
  });
});

describe('findPath — determinism', () => {
  it('the same query yields a byte-identical path', () => {
    const grid = makeGrid(10, 10, [{ gx: 4, gy: 4 }, { gx: 5, gy: 4 }, { gx: 4, gy: 5 }]);
    const a = findPath({ gx: 0, gy: 0 }, { gx: 9, gy: 9 }, grid);
    const b = findPath({ gx: 0, gy: 0 }, { gx: 9, gy: 9 }, grid);
    expect(a).toEqual(b);
    expect(isValidPath(a!, grid)).toBe(true);
  });
});

describe('isValidPath', () => {
  it('rejects an empty path, a teleport, and a step onto a blocker', () => {
    const grid = makeGrid(5, 5, [{ gx: 2, gy: 0 }]);
    expect(isValidPath([], grid)).toBe(false);
    expect(isValidPath([{ gx: 0, gy: 0 }, { gx: 2, gy: 0 }], grid)).toBe(false); // jump of 2
    expect(isValidPath([{ gx: 1, gy: 0 }, { gx: 2, gy: 0 }], grid)).toBe(false); // onto blocker
    expect(isValidPath([{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }], grid)).toBe(true);
  });
});
