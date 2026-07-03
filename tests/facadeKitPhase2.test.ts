// Phase-2 facade wiring — PURE tests (no Phaser, no pixels). Guards the skew math (flat plan → iso lit wall)
// and the reversible ?facadekit flag. The in-engine look is K's eyeball; this locks the geometry contract.
import { describe, it, expect } from 'vitest';
import { composeLowTierFacade } from '../src/scenes/env/facadeKit';
import { projectToWall, skewBands, skewOpenings, type WallFace } from '../src/scenes/env/facadeSkew';
import { facadeKitRequested } from '../src/scenes/env/facadeKitFlag';

// The REAL drawn low-tier footprint (drawIsoBuilding: hw=54, hh=27 — a 108px diamond, NOT nominal 128) + a
// representative extrusion height. Conflict (a): the skew must target THESE, or walls float off their bases.
const WALL: WallFace = { cx: 400, cy: 300, hw: 54, hh: 27, h: 120 };
const bBottom = { x: WALL.cx, y: WALL.cy + WALL.hh };       // (400, 327) ground, left of frontage
const bRight = { x: WALL.cx + WALL.hw, y: WALL.cy };        // (454, 300) ground, right of frontage
const close = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

describe('facadeSkew — flat plan skews onto the REAL iso lit wall (conflict a + b)', () => {
  it('projectToWall pins the four wall corners exactly (ground rides the drawn 108px footprint edge)', () => {
    expect(close(projectToWall(WALL, 0, 1), bBottom)).toBe(true); // left-ground = bBottom
    expect(close(projectToWall(WALL, 1, 1), bRight)).toBe(true);  // right-ground = bRight (uses hw=54, not 128)
    expect(close(projectToWall(WALL, 0, 0), { x: bBottom.x, y: bBottom.y - WALL.h })).toBe(true); // left-roof
    expect(close(projectToWall(WALL, 1, 0), { x: bRight.x, y: bRight.y - WALL.h })).toBe(true);   // right-roof
  });

  it('the bottom-most band SITS on the footprint edge (no float/seam) and the top band rises by h', () => {
    const plan = composeLowTierFacade({ floors: 2, frontageTiles: 2, storefront: 'glass' });
    const bands = skewBands(plan, WALL);
    const ground = bands[bands.length - 1]; // bulkhead is the last band pushed (yTop = heightPx − bulkhead)
    // its bottom edge (pts[3]=bottom-left, pts[2]=bottom-right) must land on bBottom→bRight
    expect(close(ground.pts[3], bBottom)).toBe(true);
    expect(close(ground.pts[2], bRight)).toBe(true);
    const roof = bands[0]; // parapet at yTopPx=0 → its top edge is the roofline, raised by full h
    expect(close(roof.pts[0], { x: bBottom.x, y: bBottom.y - WALL.h })).toBe(true);
    expect(close(roof.pts[1], { x: bRight.x, y: bRight.y - WALL.h })).toBe(true);
  });

  it('every band + opening quad stays within the wall parallelogram bbox (no overflow off the face)', () => {
    const plan = composeLowTierFacade({ floors: 2, frontageTiles: 3, storefront: 'glass' });
    const minX = WALL.cx, maxX = WALL.cx + WALL.hw;
    const minY = WALL.cy - WALL.h, maxY = WALL.cy + WALL.hh; // roof-top of right corner .. ground of left corner
    const pts = [...skewBands(plan, WALL), ...skewOpenings(plan, WALL)].flatMap((q) => q.pts);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(minX - 1e-6);
      expect(p.x).toBeLessThanOrEqual(maxX + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(minY - 1e-6);
      expect(p.y).toBeLessThanOrEqual(maxY + 1e-6);
    }
  });

  it('bands skew (top edge is higher on the right than the left — the iso diagonal, conflict b)', () => {
    const plan = composeLowTierFacade();
    const b = skewBands(plan, WALL)[0];
    expect(b.pts[1].y).toBeLessThan(b.pts[0].y); // right corner higher on screen (smaller y) than left
  });
});

describe('facadeKitRequested — reversible ?facadekit flag (OFF by default)', () => {
  it('OFF unless explicitly requested', () => {
    expect(facadeKitRequested('')).toBe(false);
    expect(facadeKitRequested('?sprites')).toBe(false);
    expect(facadeKitRequested('?facadekit=0')).toBe(false);
    expect(facadeKitRequested('?facadekit=off')).toBe(false);
  });
  it('ON for ?facadekit and non-falsy values', () => {
    expect(facadeKitRequested('?facadekit')).toBe(true);
    expect(facadeKitRequested('?facadekit=1')).toBe(true);
    expect(facadeKitRequested('?facadekit=true')).toBe(true);
    expect(facadeKitRequested('?other=1&facadekit=yes')).toBe(true);
  });
});
