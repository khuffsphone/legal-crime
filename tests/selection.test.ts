import { describe, it, expect } from 'vitest';
import {
  emptySelection,
  selectOnly,
  selectMany,
  addToSelection,
  toggleSelection,
  clearSelection,
  isSelected,
  selectedUnits,
  pickUnit,
  pickVisibleUnit,
  unitsInBox,
  resolveMoveCommand,
  isCommandableTile,
} from '../src/sim/selection';
import { spawnUnit, unitDestination, unitArrived } from '../src/sim/movement';
import { makeGrid } from '../src/sim/pathfinding';
import { PICK_RADIUS } from '../src/sim/constants';

const units = () => [
  spawnUnit('a', 2, 2),
  spawnUnit('b', 5, 5),
  spawnUnit('c', 2, 3),
];

describe('selection set — immutable helpers', () => {
  it('builds and queries selections without mutating', () => {
    const e = emptySelection();
    expect(e.ids).toEqual([]);
    expect(selectOnly('a').ids).toEqual(['a']);

    const m = selectMany(['a', 'b', 'a']); // dedupes
    expect(m.ids).toEqual(['a', 'b']);
    expect(isSelected(m, 'b')).toBe(true);
    expect(isSelected(m, 'z')).toBe(false);

    const added = addToSelection(m, 'c');
    expect(added.ids).toEqual(['a', 'b', 'c']);
    expect(m.ids).toEqual(['a', 'b']); // original untouched
    expect(addToSelection(added, 'a')).toBe(added); // already in -> same ref (no-op)
  });

  it('toggleSelection adds then removes', () => {
    let s = emptySelection();
    s = toggleSelection(s, 'a');
    expect(s.ids).toEqual(['a']);
    s = toggleSelection(s, 'b');
    expect(s.ids).toEqual(['a', 'b']);
    s = toggleSelection(s, 'a');
    expect(s.ids).toEqual(['b']);
    expect(clearSelection().ids).toEqual([]);
  });

  it('selectedUnits resolves live units and drops missing ids', () => {
    const us = units();
    const sel = selectMany(['c', 'gone', 'a']);
    expect(selectedUnits(sel, us).map((u) => u.id)).toEqual(['c', 'a']);
  });
});

describe('pickUnit — hit-testing', () => {
  it('selects the unit under the click', () => {
    expect(pickUnit(units(), { gx: 2, gy: 2 })?.id).toBe('a');
    expect(pickUnit(units(), { gx: 5, gy: 5 })?.id).toBe('b');
  });

  it('returns null when the click is on empty ground', () => {
    expect(pickUnit(units(), { gx: 9, gy: 9 })).toBeNull();
    expect(pickUnit([], { gx: 0, gy: 0 })).toBeNull();
  });

  it('picks the nearest unit when two are close', () => {
    // 'a' at (2,2), 'c' at (2,3); a click at (2, 2.4) is nearer to 'a'.
    expect(pickUnit(units(), { gx: 2, gy: 2.4 })?.id).toBe('a');
    expect(pickUnit(units(), { gx: 2, gy: 2.6 })?.id).toBe('c');
  });

  it('respects the pick radius (a click just outside selects nothing)', () => {
    const us = [spawnUnit('a', 0, 0)];
    expect(pickUnit(us, { gx: PICK_RADIUS - 0.01, gy: 0 })?.id).toBe('a');
    expect(pickUnit(us, { gx: PICK_RADIUS + 0.01, gy: 0 })).toBeNull();
  });
});

describe('pickVisibleUnit — the fog-safe pick (NO-X-RAY primitive)', () => {
  // every scene cursor read (hover tooltip, left-click hint, op-preview, right-click routing) resolves
  // its unit through this, so a fogged unit is invisible to the pick and collapses to empty ground.
  const ALL = () => true;
  const NONE = () => false;

  it('matches pickUnit exactly when every tile is visible', () => {
    expect(pickVisibleUnit(units(), { gx: 2, gy: 2 }, ALL)?.id).toBe('a');
    expect(pickVisibleUnit(units(), { gx: 5, gy: 5 }, ALL)?.id).toBe('b');
    expect(pickVisibleUnit(units(), { gx: 9, gy: 9 }, ALL)).toBeNull();
  });

  it('a FOGGED unit is unpickable — its tile deep-equals empty ground', () => {
    // twin worlds: a rival sits AT the probe tile in one, nothing in the other. With the tile fogged
    // the pick is null in BOTH — byte-identical, so hover/hint/preview cannot tell them apart.
    const foggedRivalWorld = [spawnUnit('r1', 6, 6)];
    const emptyGroundWorld: ReturnType<typeof spawnUnit>[] = [];
    const probe = { gx: 6, gy: 6 };
    expect(pickVisibleUnit(foggedRivalWorld, probe, NONE)).toBeNull();
    expect(pickVisibleUnit(emptyGroundWorld, probe, NONE)).toBeNull();
    expect(pickVisibleUnit(foggedRivalWorld, probe, NONE))
      .toEqual(pickVisibleUnit(emptyGroundWorld, probe, NONE)); // deep-equal (both null)
  });

  it('MUTATION WITNESS — the fog filter is load-bearing (delete it and the fogged rival leaks)', () => {
    // pickVisibleUnit == pickUnit with the fog filter removed. The ungated pickUnit DOES surface the
    // fogged rival (this is the leak the fix closes); the gated pick does NOT. If pickVisibleUnit ever
    // stopped filtering, these two would agree and this assertion would fail.
    const foggedRival = [spawnUnit('r1', 6, 6)];
    const probe = { gx: 6, gy: 6 };
    expect(pickUnit(foggedRival, probe)?.id).toBe('r1');   // ungated (the leak) — picks it
    expect(pickVisibleUnit(foggedRival, probe, NONE)).toBeNull(); // gated — does not
  });

  it('gates per-tile — a click nearest a FOGGED unit falls through to the visible one, never the hidden one', () => {
    // 'a' at (2,2) visible, 'c' at (2,3) fogged. A click at (2, 2.6) is NEAREST 'c' (0.4) with 'a' also
    // in the 0.7 pick radius (0.6). Ungated it would pick the hidden 'c'; the fog gate removes 'c' so
    // the pick falls through to the visible 'a' — the hidden unit never surfaces.
    const onlyRowTwoVisible = (pos: { gy: number }) => pos.gy < 3;
    expect(pickUnit(units(), { gx: 2, gy: 2.6 })?.id).toBe('c');                              // ungated → the hidden one
    expect(pickVisibleUnit(units(), { gx: 2, gy: 2.6 }, onlyRowTwoVisible)?.id).toBe('a');    // gated → the visible one
    expect(pickVisibleUnit(units(), { gx: 2, gy: 2 }, onlyRowTwoVisible)?.id).toBe('a');
  });
});

describe('unitsInBox — drag multi-select', () => {
  it('returns every unit inside the grid rectangle (corners any order)', () => {
    const ids = unitsInBox(units(), { gx: 3, gy: 3 }, { gx: 1, gy: 1 });
    expect(ids.sort()).toEqual(['a', 'c']); // a(2,2) and c(2,3) inside; b(5,5) outside
  });

  it('is empty when the box covers no units', () => {
    expect(unitsInBox(units(), { gx: 8, gy: 8 }, { gx: 9, gy: 9 })).toEqual([]);
  });
});

describe('resolveMoveCommand — click-to-move', () => {
  it('issues a valid path to the target and the unit arrives there', () => {
    const us = units();
    const grid = makeGrid(8, 8, []);
    const res = resolveMoveCommand(us, ['a'], { gx: 6, gy: 2 }, grid);
    expect(res.moved).toEqual(['a']);
    expect(res.failed).toEqual([]);
    const a = us.find((u) => u.id === 'a')!;
    expect(unitArrived(a)).toBe(false);
    expect(unitDestination(a)).toEqual({ gx: 6, gy: 2 });
  });

  it('moves several selected units with one command', () => {
    const us = units();
    const grid = makeGrid(8, 8, []);
    const res = resolveMoveCommand(us, ['a', 'b'], { gx: 7, gy: 7 }, grid);
    expect(res.moved.sort()).toEqual(['a', 'b']);
    expect(unitDestination(us[0])).toEqual({ gx: 7, gy: 7 });
    expect(unitDestination(us[1])).toEqual({ gx: 7, gy: 7 });
  });

  it('reports failure (and does not crash) when the target is unreachable', () => {
    const us = units();
    // Wall off column x=4 so (5,5) is unreachable from the left-side units.
    const grid = makeGrid(8, 8, [
      { gx: 4, gy: 0 }, { gx: 4, gy: 1 }, { gx: 4, gy: 2 }, { gx: 4, gy: 3 },
      { gx: 4, gy: 4 }, { gx: 4, gy: 5 }, { gx: 4, gy: 6 }, { gx: 4, gy: 7 },
    ]);
    const res = resolveMoveCommand(us, ['a'], { gx: 7, gy: 7 }, grid);
    expect(res.moved).toEqual([]);
    expect(res.failed).toEqual(['a']);
    expect(unitArrived(us[0])).toBe(true); // left idle where it was
  });

  it('skips ids that are not present', () => {
    const us = units();
    const grid = makeGrid(8, 8, []);
    const res = resolveMoveCommand(us, ['ghost'], { gx: 1, gy: 1 }, grid);
    expect(res).toEqual({ moved: [], failed: [] });
  });

  it('is deterministic: the same command yields the same paths', () => {
    const grid = makeGrid(8, 8, [{ gx: 3, gy: 2 }]);
    const a = units();
    const b = units();
    resolveMoveCommand(a, ['a'], { gx: 6, gy: 2 }, grid);
    resolveMoveCommand(b, ['a'], { gx: 6, gy: 2 }, grid);
    expect(a[0].path).toEqual(b[0].path);
  });
});

describe('isCommandableTile', () => {
  it('accepts open tiles and rejects walls / out-of-bounds', () => {
    const grid = makeGrid(6, 6, [{ gx: 2, gy: 2 }]);
    expect(isCommandableTile({ gx: 1, gy: 1 }, grid)).toBe(true);
    expect(isCommandableTile({ gx: 2, gy: 2 }, grid)).toBe(false); // wall
    expect(isCommandableTile({ gx: 6, gy: 0 }, grid)).toBe(false); // OOB
    expect(isCommandableTile({ gx: -1, gy: 0 }, grid)).toBe(false);
  });
});
