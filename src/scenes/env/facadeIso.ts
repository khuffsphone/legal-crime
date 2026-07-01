// facadeIso.ts — Environment Modular Kit Phase 2 PURE iso-wall projection helpers.
// No Phaser imports. The live renderer consumes these numbers to skew the Phase-1 flat facade PLAN onto
// drawIsoBuilding's actual inset lit wall (hw=54/hh=27), not the nominal 128px asset-manifest footprint.

import type { FacadePlan } from './facadeKit';

export interface IsoPoint { x: number; y: number }

export const LIVE_LOW_TIER_FOOT_HALF_W = 54;
export const LIVE_LOW_TIER_FOOT_HALF_H = 27;
export const LIVE_LOW_TIER_FOOTPRINT_PX = LIVE_LOW_TIER_FOOT_HALF_W * 2;

const TRUTHY = new Set(['', '1', 'on', 'true', 'yes', 'facadekit']);
const FALSY = new Set(['0', 'off', 'false', 'no']);

/**
 * ?facadekit opt-in. ON for ?facadekit or ?facadekit=1|on|true|yes; OFF when absent or explicitly false.
 * Mirrors the ?sprites convention: experimental art path defaults OFF and can be toggled without rebuild.
 */
export function facadeKitRequested(search: string): boolean {
  let raw: string | null = null;
  try {
    const params = new URLSearchParams(search);
    raw = params.get('facadekit') ?? params.get('facadeKit');
  } catch {
    return false;
  }
  if (raw === null) return false;
  const v = raw.toLowerCase();
  if (FALSY.has(v)) return false;
  return TRUTHY.has(v) || true; // any non-falsy value opts in, matching ?sprites.
}

export interface IsoWallBasis {
  /** Ground-left/base point of the lit wall: drawIsoBuilding's bBottom. */
  baseLeft: IsoPoint;
  /** Ground-right/base point of the lit wall: drawIsoBuilding's bRight. */
  baseRight: IsoPoint;
  /** Screen-space frontage vector along the lit-wall diagonal. */
  frontage: IsoPoint;
  /** Vertical screen vector for 1 px of facade height. */
  vertical: IsoPoint;
  /** The real live diamond footprint width, 2*hw. */
  footprintWidthPx: number;
}

/** Lit wall basis matching cityArt.ts::drawIsoBuilding: bBottom → bRight, using the REAL live hw/hh. */
export function isoLitWallBasis(cx: number, cy: number, hw = LIVE_LOW_TIER_FOOT_HALF_W, hh = LIVE_LOW_TIER_FOOT_HALF_H): IsoWallBasis {
  const baseLeft = { x: cx, y: cy + hh };
  const baseRight = { x: cx + hw, y: cy };
  return {
    baseLeft,
    baseRight,
    frontage: { x: baseRight.x - baseLeft.x, y: baseRight.y - baseLeft.y },
    vertical: { x: 0, y: -1 },
    footprintWidthPx: hw * 2,
  };
}

/** Map a flat facade-plan point (x px from left, y px from roofline top) onto the live iso lit wall. */
export function isoWallPoint(plan: FacadePlan, basis: IsoWallBasis, xPx: number, yFromTopPx: number): IsoPoint {
  const u = plan.widthPx > 0 ? xPx / plan.widthPx : 0;
  const z = plan.heightPx - yFromTopPx;
  return {
    x: basis.baseLeft.x + basis.frontage.x * u + basis.vertical.x * z,
    y: basis.baseLeft.y + basis.frontage.y * u + basis.vertical.y * z,
  };
}

/** Skew a flat facade rectangle into the lit-wall parallelogram. */
export function isoWallRect(plan: FacadePlan, basis: IsoWallBasis, xPx: number, yTopPx: number, wPx: number, hPx: number): IsoPoint[] {
  const x2 = xPx + wPx;
  const y2 = yTopPx + hPx;
  return [
    isoWallPoint(plan, basis, xPx, yTopPx),
    isoWallPoint(plan, basis, x2, yTopPx),
    isoWallPoint(plan, basis, x2, y2),
    isoWallPoint(plan, basis, xPx, y2),
  ];
}

/** Horizontal facade course at a plan y; used for band seams, cornices, and storefront mullions. */
export function isoWallCourse(plan: FacadePlan, basis: IsoWallBasis, yFromTopPx: number): [IsoPoint, IsoPoint] {
  return [isoWallPoint(plan, basis, 0, yFromTopPx), isoWallPoint(plan, basis, plan.widthPx, yFromTopPx)];
}

/** Vertical bay separator at a plan x; it must have zero screen-x drift except for frontage skew. */
export function isoWallBayLine(plan: FacadePlan, basis: IsoWallBasis, xPx: number): [IsoPoint, IsoPoint] {
  return [isoWallPoint(plan, basis, xPx, 0), isoWallPoint(plan, basis, xPx, plan.heightPx)];
}
