// Phase 2 pure tests: flat low-tier facade plan → live iso lit-wall skew.
// These pin the renderer-facing math without importing Phaser.
import { describe, it, expect } from 'vitest';
import { composeLowTierFacade, BAY_RUN_PX } from '../src/scenes/env/facadeKit';
import {
  facadeKitRequested,
  isoLitWallBasis,
  isoWallPoint,
  isoWallRect,
  isoWallCourse,
  LIVE_LOW_TIER_FOOT_HALF_W,
  LIVE_LOW_TIER_FOOT_HALF_H,
  LIVE_LOW_TIER_FOOTPRINT_PX,
} from '../src/scenes/env/facadeIso';

describe('facadeKitRequested — reversible opt-in flag', () => {
  it('defaults off and accepts the same truthy/falsy shape as ?sprites', () => {
    expect(facadeKitRequested('')).toBe(false);
    expect(facadeKitRequested('?facadekit')).toBe(true);
    expect(facadeKitRequested('?facadekit=1')).toBe(true);
    expect(facadeKitRequested('?facadekit=on')).toBe(true);
    expect(facadeKitRequested('?facadekit=true')).toBe(true);
    expect(facadeKitRequested('?facadekit=0')).toBe(false);
    expect(facadeKitRequested('?facadekit=off')).toBe(false);
  });
});

describe('iso lit-wall basis — live 108px footprint, not nominal 128px', () => {
  it('pins drawIsoBuilding real inset footprint and 2:1 wall diagonal', () => {
    expect(LIVE_LOW_TIER_FOOT_HALF_W).toBe(54);
    expect(LIVE_LOW_TIER_FOOT_HALF_H).toBe(27);
    expect(LIVE_LOW_TIER_FOOTPRINT_PX).toBe(108);
    const basis = isoLitWallBasis(0, 0);
    expect(basis.baseLeft).toEqual({ x: 0, y: 27 });
    expect(basis.baseRight).toEqual({ x: 54, y: 0 });
    expect(basis.frontage).toEqual({ x: 54, y: -27 });
    expect(Math.abs(basis.frontage.y / basis.frontage.x)).toBe(0.5);
  });

  it('maps the flat plan width onto the actual lit-wall edge', () => {
    const plan = composeLowTierFacade({ floors: 2, frontageTiles: 2 });
    expect(plan.widthPx).toBe(2 * BAY_RUN_PX);
    const basis = isoLitWallBasis(100, 200);
    expect(isoWallPoint(plan, basis, 0, plan.heightPx)).toEqual(basis.baseLeft);
    expect(isoWallPoint(plan, basis, plan.widthPx, plan.heightPx)).toEqual(basis.baseRight);
  });

  it('keeps vertical facade height dead-vertical in screen space', () => {
    const plan = composeLowTierFacade({ floors: 2, frontageTiles: 2 });
    const basis = isoLitWallBasis(100, 200);
    const ground = isoWallPoint(plan, basis, plan.widthPx / 2, plan.heightPx);
    const roof = isoWallPoint(plan, basis, plan.widthPx / 2, 0);
    expect(roof.x).toBeCloseTo(ground.x, 6);
    expect(ground.y - roof.y).toBe(plan.heightPx);
  });

  it('skews a band rectangle into a seamless wall parallelogram', () => {
    const plan = composeLowTierFacade({ floors: 2, frontageTiles: 2 });
    const basis = isoLitWallBasis(0, 0);
    const band = plan.bands[0];
    const poly = isoWallRect(plan, basis, 0, band.yTopPx, plan.widthPx, band.hPx);
    expect(poly).toHaveLength(4);
    const [courseL, courseR] = isoWallCourse(plan, basis, band.yTopPx + band.hPx);
    expect(poly[2]).toEqual(courseR);
    expect(poly[3]).toEqual(courseL);
  });
});
