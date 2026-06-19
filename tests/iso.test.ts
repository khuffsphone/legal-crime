import { describe, it, expect } from 'vitest';
import {
  ISO_TILE_WIDTH,
  ISO_TILE_HEIGHT,
  ISO_TILE_HALF_WIDTH,
  ISO_TILE_HALF_HEIGHT,
  gridToScreen,
  screenToGrid,
  screenToTile,
  tileCorners,
  depthValue,
  compareDepth,
  depthSort,
  tileNeighbors,
  tileNeighbors8,
  inBounds,
  manhattan,
  tileEquals,
} from '../src/sim/iso';

describe('projection spec (2:1 dimetric, 128×64)', () => {
  it('tiles are 128×64 with a 2:1 ratio and matching halves', () => {
    expect(ISO_TILE_WIDTH).toBe(128);
    expect(ISO_TILE_HEIGHT).toBe(64);
    expect(ISO_TILE_WIDTH).toBe(2 * ISO_TILE_HEIGHT); // 2:1 dimetric
    expect(ISO_TILE_HALF_WIDTH).toBe(64);
    expect(ISO_TILE_HALF_HEIGHT).toBe(32);
  });
});

describe('gridToScreen — known points', () => {
  it('places tile centers at the expected screen coordinates', () => {
    expect(gridToScreen(0, 0)).toEqual({ x: 0, y: 0 });
    expect(gridToScreen(1, 0)).toEqual({ x: 64, y: 32 });
    expect(gridToScreen(0, 1)).toEqual({ x: -64, y: 32 });
    expect(gridToScreen(1, 1)).toEqual({ x: 0, y: 64 });
    expect(gridToScreen(2, 0)).toEqual({ x: 128, y: 64 });
  });
});

describe('grid <-> screen round-trips', () => {
  it('grid -> screen -> grid returns the original tile exactly', () => {
    for (let gx = -8; gx <= 8; gx++) {
      for (let gy = -8; gy <= 8; gy++) {
        const s = gridToScreen(gx, gy);
        const back = screenToGrid(s.x, s.y);
        expect(back.gx).toBe(gx);
        expect(back.gy).toBe(gy);
      }
    }
  });

  it('screenToGrid is the exact inverse for a known fractional point', () => {
    expect(screenToGrid(64, 32)).toEqual({ gx: 1, gy: 0 });
    expect(screenToGrid(0, 64)).toEqual({ gx: 1, gy: 1 });
  });
});

describe('screenToTile — lands in the correct tile', () => {
  it('maps a tile center back to that tile', () => {
    for (const [gx, gy] of [[0, 0], [3, 2], [5, 7], [9, 1]] as const) {
      const c = gridToScreen(gx, gy);
      expect(screenToTile(c.x, c.y)).toEqual({ gx, gy });
    }
  });

  it('maps points clearly inside a tile to that tile (within half-extent)', () => {
    const c = gridToScreen(4, 4);
    // small offsets stay inside tile (4,4)'s diamond
    expect(screenToTile(c.x + 10, c.y + 5)).toEqual({ gx: 4, gy: 4 });
    expect(screenToTile(c.x - 10, c.y - 5)).toEqual({ gx: 4, gy: 4 });
    expect(screenToTile(c.x + 30, c.y - 10)).toEqual({ gx: 4, gy: 4 });
  });

  it('a point on the right half of tile (0,0) stays in (0,0), not a neighbor', () => {
    expect(screenToTile(32, 0)).toEqual({ gx: 0, gy: 0 });
  });
});

describe('tileCorners', () => {
  it('returns the diamond corners around the tile center in [top,right,bottom,left]', () => {
    expect(tileCorners(0, 0)).toEqual([
      { x: 0, y: -32 },
      { x: 64, y: 0 },
      { x: 0, y: 32 },
      { x: -64, y: 0 },
    ]);
  });
});

describe('depth ordering (painter back-to-front)', () => {
  it('depthValue is gx + gy', () => {
    expect(depthValue(0, 0)).toBe(0);
    expect(depthValue(2, 3)).toBe(5);
    expect(depthValue(1, 0)).toBe(1);
  });

  it('depthSort orders a sample set back-to-front (sum asc, then gx, then layer)', () => {
    const items = [
      { id: 'a', gx: 2, gy: 2 }, // 4
      { id: 'b', gx: 0, gy: 0 }, // 0
      { id: 'c', gx: 1, gy: 0 }, // 1
      { id: 'd', gx: 0, gy: 1 }, // 1
      { id: 'e', gx: 1, gy: 1 }, // 2
    ];
    expect(depthSort(items).map((i) => i.id)).toEqual(['b', 'd', 'c', 'e', 'a']);
  });

  it('compareDepth tie-breaks by gx then layer', () => {
    expect(compareDepth({ gx: 1, gy: 0 }, { gx: 0, gy: 1 })).toBeGreaterThan(0); // same sum, gx 1 after 0
    expect(compareDepth({ gx: 0, gy: 0, layer: 0 }, { gx: 0, gy: 0, layer: 1 })).toBeLessThan(0);
    expect(compareDepth({ gx: 0, gy: 0 }, { gx: 1, gy: 1 })).toBeLessThan(0); // sum 0 before 2
  });

  it('does not mutate the input array', () => {
    const items = [{ gx: 2, gy: 2 }, { gx: 0, gy: 0 }];
    const sorted = depthSort(items);
    expect(items[0]).toEqual({ gx: 2, gy: 2 }); // original order intact
    expect(sorted[0]).toEqual({ gx: 0, gy: 0 });
  });
});

describe('tile neighbor math', () => {
  it('tileNeighbors gives the 4 orthogonal neighbors [E,W,S,N]', () => {
    expect(tileNeighbors(2, 3)).toEqual([
      { gx: 3, gy: 3 },
      { gx: 1, gy: 3 },
      { gx: 2, gy: 4 },
      { gx: 2, gy: 2 },
    ]);
  });

  it('tileNeighbors8 gives all 8 surrounding tiles and excludes the center', () => {
    const n = tileNeighbors8(0, 0);
    expect(n).toHaveLength(8);
    expect(n).not.toContainEqual({ gx: 0, gy: 0 });
    expect(n).toContainEqual({ gx: 1, gy: 1 });
    expect(n).toContainEqual({ gx: -1, gy: -1 });
  });

  it('inBounds, manhattan, and tileEquals behave', () => {
    expect(inBounds(0, 0, 4, 4)).toBe(true);
    expect(inBounds(4, 0, 4, 4)).toBe(false);
    expect(inBounds(-1, 2, 4, 4)).toBe(false);
    expect(manhattan({ gx: 0, gy: 0 }, { gx: 2, gy: 3 })).toBe(5);
    expect(tileEquals({ gx: 1, gy: 2 }, { gx: 1, gy: 2 })).toBe(true);
    expect(tileEquals({ gx: 1, gy: 2 }, { gx: 2, gy: 1 })).toBe(false);
  });
});
