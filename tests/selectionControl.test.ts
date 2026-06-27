import { describe, it, expect } from 'vitest';
import {
  isIdleUnit,
  idleUnitIds,
  nextIdleId,
  bindGroup,
  hasGroup,
  recallGroup,
  pruneGroup,
  isCenterRecall,
  idsInScreenRect,
  GROUP_DOUBLE_TAP_MS,
  type ControlGroups,
} from '../src/scenes/selectionControl';
import { spawnUnit } from '../src/sim/movement';
import type { MovableUnit } from '../src/sim';

// A unit standing idle, or one with a standing order (a waypoint / a patrol stance).
const idle = (id: string): MovableUnit => spawnUnit(id, 0, 0);
const moving = (id: string): MovableUnit => ({ ...spawnUnit(id, 0, 0), path: [{ gx: 5, gy: 5 }] });
const patrolling = (id: string): MovableUnit => ({ ...spawnUnit(id, 0, 0), patrol: true });

describe('idle (no-order) TAB cycle', () => {
  it('isIdleUnit: only no-path, non-patrol units are idle', () => {
    expect(isIdleUnit(idle('a'))).toBe(true);
    expect(isIdleUnit(moving('a'))).toBe(false);
    expect(isIdleUnit(patrolling('a'))).toBe(false);
  });

  it('idleUnitIds keeps array order and drops busy/patrol units', () => {
    const units = [idle('a'), moving('b'), idle('c'), patrolling('d'), idle('e')];
    expect(idleUnitIds(units)).toEqual(['a', 'c', 'e']);
  });

  it('TAB cycles forward through idle units, wrapping', () => {
    const ids = ['a', 'c', 'e'];
    expect(nextIdleId(ids, [], false)).toBe('a'); // nothing selected → first
    expect(nextIdleId(ids, ['a'], false)).toBe('c');
    expect(nextIdleId(ids, ['c'], false)).toBe('e');
    expect(nextIdleId(ids, ['e'], false)).toBe('a'); // wraps
  });

  it('Shift+TAB cycles backward through idle units, wrapping', () => {
    const ids = ['a', 'c', 'e'];
    expect(nextIdleId(ids, [], true)).toBe('e'); // nothing selected → last
    expect(nextIdleId(ids, ['c'], true)).toBe('a');
    expect(nextIdleId(ids, ['a'], true)).toBe('e'); // wraps
  });

  it('anchors on the last selected unit that is itself idle', () => {
    const ids = ['a', 'c', 'e'];
    // 'b' isn't an idle candidate; 'c' is — cycle should advance from 'c'.
    expect(nextIdleId(ids, ['b', 'c'], false)).toBe('e');
    // none of the selected are idle → start from the top.
    expect(nextIdleId(ids, ['x', 'y'], false)).toBe('a');
  });

  it('returns undefined when there are no idle units', () => {
    expect(nextIdleId([], ['a'], false)).toBeUndefined();
    expect(nextIdleId([], [], true)).toBeUndefined();
  });
});

describe('control groups — bind / recall', () => {
  it('binds the current selection to a numbered group (immutably, deduped)', () => {
    const g0: ControlGroups = {};
    const g1 = bindGroup(g0, 1, ['a', 'b', 'a']); // dedupes
    expect(g1[1]).toEqual(['a', 'b']);
    expect(g0).toEqual({}); // original untouched
    expect(hasGroup(g1, 1)).toBe(true);
    expect(hasGroup(g1, 2)).toBe(false);
  });

  it('rebinding a group replaces its members', () => {
    let g: ControlGroups = bindGroup({}, 3, ['a', 'b']);
    g = bindGroup(g, 3, ['c']);
    expect(g[3]).toEqual(['c']);
  });

  it('recall returns the bound members for the current live units', () => {
    const g = bindGroup({}, 2, ['a', 'b', 'c']);
    expect(recallGroup(g, 2, ['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
  });

  it('recall drops STALE ids (units that died/despawned), preserving order', () => {
    const g = bindGroup({}, 1, ['a', 'b', 'c']);
    expect(recallGroup(g, 1, ['c', 'a'])).toEqual(['a', 'c']); // 'b' gone, order kept
    expect(recallGroup(g, 1, [])).toEqual([]); // whole group gone
  });

  it('recall of an unbound group is empty', () => {
    expect(recallGroup({}, 5, ['a', 'b'])).toEqual([]);
  });

  it('pruneGroup persists the stale-pruned membership', () => {
    const g = bindGroup({}, 1, ['a', 'b', 'c']);
    const pruned = pruneGroup(g, 1, ['a', 'c']);
    expect(pruned[1]).toEqual(['a', 'c']);
    expect(g[1]).toEqual(['a', 'b', 'c']); // original untouched
    // a still-bound-but-fully-stale group prunes to empty (but stays a bound group).
    const emptied = pruneGroup(g, 1, []);
    expect(emptied[1]).toEqual([]);
    expect(hasGroup(emptied, 1)).toBe(true);
  });
});

describe('control groups — double-tap recall centres the camera', () => {
  it('a second recall of the SAME group within the window is a centre gesture', () => {
    const first = { group: 1, atMs: 1000 };
    expect(isCenterRecall(first, 1, 1000 + GROUP_DOUBLE_TAP_MS - 1)).toBe(true);
    expect(isCenterRecall(first, 1, 1000)).toBe(true); // same instant counts
  });

  it('is NOT a centre gesture when too slow, a different group, or the first tap', () => {
    const first = { group: 1, atMs: 1000 };
    expect(isCenterRecall(first, 1, 1000 + GROUP_DOUBLE_TAP_MS + 1)).toBe(false); // too slow
    expect(isCenterRecall(first, 2, 1100)).toBe(false); // different group
    expect(isCenterRecall(undefined, 1, 1100)).toBe(false); // no prior tap
  });
});

describe('drag-box — screen-rect hit math', () => {
  const pts = [
    { id: 'a', x: 10, y: 10 },
    { id: 'b', x: 50, y: 50 },
    { id: 'c', x: 100, y: 100 },
  ];

  it('returns every unit inside the rectangle (corners any order)', () => {
    // drag bottom-right → top-left still selects a + b.
    expect(idsInScreenRect(pts, 60, 60, 0, 0).sort()).toEqual(['a', 'b']);
    expect(idsInScreenRect(pts, 0, 0, 60, 60).sort()).toEqual(['a', 'b']);
  });

  it('is inclusive of the edges', () => {
    expect(idsInScreenRect(pts, 10, 10, 50, 50).sort()).toEqual(['a', 'b']);
  });

  it('is empty when the box covers no units', () => {
    expect(idsInScreenRect(pts, 200, 200, 300, 300)).toEqual([]);
  });
});
