// cityArt.ts — Phase 2 facade-kit wrapper.
// The full pre-Phase-2 procedural art module is preserved byte-for-byte in cityArtLegacy.ts. This wrapper
// re-exports the legacy surface, then overrides ONLY low-tier drawIsoBuilding behind ?facadekit.

import Phaser from 'phaser';
import {
  BUILDING_STYLES as LEGACY_BUILDING_STYLES,
  ENV_HEIGHT_SCALE,
  PAL,
  drawIsoBuilding as drawIsoBuildingLegacy,
  type BuildingStyle,
} from './cityArtLegacy';
import {
  BAY_RUN_PX,
  FASCIA_SIGN,
  FIGURE_PX,
  composeLowTierFacade,
  type FacadeBand,
  type FacadeOpening,
  type FacadePlan,
} from './env/facadeKit';
import {
  LIVE_LOW_TIER_FOOT_HALF_H,
  LIVE_LOW_TIER_FOOT_HALF_W,
  facadeKitRequested,
  isoLitWallBasis,
  isoWallBayLine,
  isoWallCourse,
  isoWallPoint,
  isoWallRect,
  type IsoPoint,
} from './env/facadeIso';

export * from './cityArtLegacy';

export function facadeKitArt(): boolean {
  const search = typeof window !== 'undefined' ? window.location.search : '';
  return facadeKitRequested(search);
}

const LOW_STOREFRONT_PLAN = composeLowTierFacade({ floors: 2, frontageTiles: 2, storefront: 'glass', door: 'commercial' });
const LOW_SPEAKEASY_PLAN = composeLowTierFacade({ floors: 1, frontageTiles: 2, storefront: 'bar', door: 'residential' });

/**
 * Export the same style table when the flag is off. When ?facadekit is on, only low-tier style heights are
 * raised to the corrected plan height so IsoScene's existing occlusion hull uses the same vertical massing
 * that drawIsoBuilding renders. Mid/large styles are passed through untouched.
 */
export const BUILDING_STYLES: Record<string, BuildingStyle> = facadeKitArt() ? {
  ...LEGACY_BUILDING_STYLES,
  storefront: {
    ...LEGACY_BUILDING_STYLES.storefront,
    height: LOW_STOREFRONT_PLAN.heightPx / ENV_HEIGHT_SCALE,
    windows: 2,
  },
  speakeasy: {
    ...LEGACY_BUILDING_STYLES.speakeasy,
    height: LOW_SPEAKEASY_PLAN.heightPx / ENV_HEIGHT_SCALE,
    windows: 1,
  },
} : LEGACY_BUILDING_STYLES;

function planForLowTier(style: BuildingStyle): FacadePlan | undefined {
  if (style.kind === 'storefront') return LOW_STOREFRONT_PLAN;
  if (style.kind === 'speakeasy') return LOW_SPEAKEASY_PLAN;
  return undefined;
}

const FACADE = {
  brick: 0x4a2d23,
  brickDark: 0x342018,
  brickLine: 0x6b5344,
  parapet: 0x24201c,
  parapetHi: 0x8a7a62,
  signHost: 0x17120f,
  signBoard: 0x11100e,
  signInk: 0x2a2119,
  glass: 0x243536,
  glassLit: 0xd99b3a,
  glassHi: 0xf0cf7a,
  transom: 0x2e3a3a,
  bulkhead: 0x3d2b22,
  door: 0x12100e,
  doorFrame: 0x8a7a62,
  shadow: 0x0d0b0a,
} as const;

function toPhaserPoint(p: IsoPoint): Phaser.Geom.Point {
  return new Phaser.Geom.Point(p.x, p.y);
}

function fillIsoRect(g: Phaser.GameObjects.Graphics, plan: FacadePlan, basis: ReturnType<typeof isoLitWallBasis>, x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillPoints(isoWallRect(plan, basis, x, y, w, h).map(toPhaserPoint), true);
}

function strokeIsoRect(g: Phaser.GameObjects.Graphics, plan: FacadePlan, basis: ReturnType<typeof isoLitWallBasis>, x: number, y: number, w: number, h: number, color: number, alpha = 1, lineWidth = 1): void {
  g.lineStyle(lineWidth, color, alpha);
  g.strokePoints(isoWallRect(plan, basis, x, y, w, h).map(toPhaserPoint), true);
}

function strokeCourse(g: Phaser.GameObjects.Graphics, plan: FacadePlan, basis: ReturnType<typeof isoLitWallBasis>, y: number, color: number, alpha = 1, lineWidth = 1): void {
  const [a, b] = isoWallCourse(plan, basis, y);
  g.lineStyle(lineWidth, color, alpha);
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.strokePath();
}

function strokeBayLine(g: Phaser.GameObjects.Graphics, plan: FacadePlan, basis: ReturnType<typeof isoLitWallBasis>, x: number, color: number, alpha = 1): void {
  const [a, b] = isoWallBayLine(plan, basis, x);
  g.lineStyle(1, color, alpha);
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.strokePath();
}

function bandColor(band: FacadeBand, storefront: FacadePlan['storefront'], lit: boolean): [number, number] {
  switch (band.role) {
    case 'parapet': return [FACADE.parapet, 1];
    case 'signHost': return [FACADE.signHost, 1];
    case 'transom': return [lit ? FACADE.transom : FACADE.shadow, 1];
    case 'glass': return [FACADE.glass, lit ? 0.95 : 0.72];
    case 'storefrontBar': return [storefront === 'bar' ? FACADE.shadow : FACADE.glass, 1];
    case 'bulkhead': return [FACADE.bulkhead, 1];
    case 'brickUpper': return [band.hPx <= 24 ? FACADE.bulkhead : FACADE.brick, 1];
    default: return [FACADE.brick, 1];
  }
}

function drawBands(g: Phaser.GameObjects.Graphics, plan: FacadePlan, basis: ReturnType<typeof isoLitWallBasis>, lit: boolean): void {
  for (const band of plan.bands) {
    const [color, alpha] = bandColor(band, plan.storefront, lit);
    fillIsoRect(g, plan, basis, 0, band.yTopPx, plan.widthPx, band.hPx, color, alpha);
    if (band.role === 'parapet') {
      strokeCourse(g, plan, basis, band.yTopPx + band.hPx - 4, FACADE.parapetHi, 0.55, 1);
    }
  }
  for (const band of plan.bands) strokeCourse(g, plan, basis, band.yTopPx, FACADE.brickLine, 0.35, 1);
  strokeCourse(g, plan, basis, plan.heightPx, FACADE.shadow, 0.8, 1.5);
  for (let b = 1; b < plan.frontageTiles; b++) strokeBayLine(g, plan, basis, b * BAY_RUN_PX, FACADE.brickLine, 0.25);
}

function openingTop(opening: FacadeOpening): number {
  return opening.yBottomPx - opening.hPx;
}

function drawOpening(g: Phaser.GameObjects.Graphics, plan: FacadePlan, basis: ReturnType<typeof isoLitWallBasis>, opening: FacadeOpening, lit: boolean): void {
  const y = openingTop(opening);
  if (opening.role === 'glass') {
    fillIsoRect(g, plan, basis, opening.xPx, y, opening.wPx, opening.hPx, lit ? FACADE.glassLit : FACADE.glass, lit ? 0.58 : 0.75);
    strokeIsoRect(g, plan, basis, opening.xPx, y, opening.wPx, opening.hPx, FACADE.glassHi, lit ? 0.42 : 0.22);
    strokeCourse(g, plan, basis, y + Math.round(opening.hPx / 2), FACADE.glassHi, lit ? 0.3 : 0.18);
    return;
  }

  if (opening.role === 'doorCommercial' || opening.role === 'doorResidential') {
    fillIsoRect(g, plan, basis, opening.xPx, y, opening.wPx, opening.hPx, FACADE.door, 1);
    strokeIsoRect(g, plan, basis, opening.xPx, y, opening.wPx, opening.hPx, FACADE.doorFrame, 0.75, 1.2);
    const knob = isoWallPoint(plan, basis, opening.xPx + opening.wPx * 0.72, opening.yBottomPx - opening.hPx * 0.42);
    g.fillStyle(lit ? FACADE.glassHi : FACADE.doorFrame, 0.8);
    g.fillCircle(knob.x, knob.y, 1.6);
    return;
  }

  if (opening.role === 'window' && opening.bayIndex < 0) {
    // Fascia board remains 28px per Phase-1 note; it is intentionally not corrected here.
    fillIsoRect(g, plan, basis, opening.xPx, y, opening.wPx, FASCIA_SIGN, FACADE.signBoard, 1);
    strokeIsoRect(g, plan, basis, opening.xPx, y, opening.wPx, FASCIA_SIGN, FACADE.parapetHi, 0.45);
    const mid = isoWallPoint(plan, basis, opening.xPx + opening.wPx * 0.5, y + FASCIA_SIGN * 0.55);
    g.fillStyle(FACADE.signInk, 0.9);
    g.fillCircle(mid.x, mid.y, 2.2);
    return;
  }

  // Upper-floor double-hung windows.
  fillIsoRect(g, plan, basis, opening.xPx, y, opening.wPx, opening.hPx, lit ? FACADE.glassLit : FACADE.glass, lit ? 0.42 : 0.9);
  strokeIsoRect(g, plan, basis, opening.xPx, y, opening.wPx, opening.hPx, FACADE.parapetHi, 0.45);
  strokeCourse(g, plan, basis, y + Math.round(opening.hPx / 2), FACADE.parapetHi, 0.28);
}

function drawLowTierFacadePlan(g: Phaser.GameObjects.Graphics, plan: FacadePlan, basis: ReturnType<typeof isoLitWallBasis>, lit: boolean): void {
  drawBands(g, plan, basis, lit);
  for (const opening of plan.openings) drawOpening(g, plan, basis, opening, lit);
}

function drawLowTierBuilding(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  style: BuildingStyle,
  depth: number,
  plan: FacadePlan,
  opts: { rich?: boolean; lit?: boolean; sign?: number; faction?: 'player' | 'rival'; accent?: number } = {},
): { roofX: number; roofY: number; gfx: Phaser.GameObjects.Graphics } {
  const lit = opts.lit ?? true;
  const hw = style.footHalfW ?? LIVE_LOW_TIER_FOOT_HALF_W;
  const hh = style.footHalfH ?? LIVE_LOW_TIER_FOOT_HALF_H;
  const h = plan.heightPx;
  const g = scene.add.graphics().setDepth(depth);

  const bTop = { x: cx, y: cy - hh };
  const bRight = { x: cx + hw, y: cy };
  const bBottom = { x: cx, y: cy + hh };
  const bLeft = { x: cx - hw, y: cy };

  // Dark side wall remains a plain mass so the new kit does not create x-ray information or faction tint.
  g.fillStyle(FACADE.brickDark, 1);
  g.fillPoints([bLeft, bBottom, { x: bBottom.x, y: bBottom.y - h }, { x: bLeft.x, y: bLeft.y - h }], true);
  g.lineStyle(1, FACADE.brickLine, 0.18);
  for (let yy = cy + hh - 16; yy > cy + hh - h; yy -= 12) {
    g.beginPath(); g.moveTo(bLeft.x, yy); g.lineTo(bBottom.x, yy); g.strokePath();
  }

  // Lit wall base: immediately overpainted by skewed facade bands, but kept as a seam-safe backer.
  g.fillStyle(FACADE.brick, 1);
  g.fillPoints([bBottom, bRight, { x: bRight.x, y: bRight.y - h }, { x: bBottom.x, y: bBottom.y - h }], true);

  const basis = isoLitWallBasis(cx, cy, hw, hh);
  drawLowTierFacadePlan(g, plan, basis, lit);

  // Roof/parapet top. Neutral charcoal only; no faction colour on facades.
  g.fillStyle(PAL.charcoal, 1);
  g.fillPoints(
    [
      { x: bTop.x, y: bTop.y - h },
      { x: bRight.x, y: bRight.y - h },
      { x: bBottom.x, y: bBottom.y - h },
      { x: bLeft.x, y: bLeft.y - h },
    ],
    true,
  );
  g.lineStyle(1.5, FACADE.parapetHi, 0.45);
  g.strokePoints([
    { x: bTop.x, y: bTop.y - h },
    { x: bRight.x, y: bRight.y - h },
    { x: bBottom.x, y: bBottom.y - h },
    { x: bLeft.x, y: bLeft.y - h },
  ].map(toPhaserPoint), true);

  // Door-clearance invariant: the plan's 68/76px doors clear the 56px character. Kept as a local guard.
  if (FIGURE_PX > 76) {
    g.lineStyle(1, FACADE.shadow, 0.01); // unreachable with current canon; prevents the guard from being tree-shaken into dead commentary only.
  }

  return { roofX: cx, roofY: cy - h - hh, gfx: g };
}

/**
 * Flag OFF: exact legacy procedural building path. Flag ON: low-tier storefront/speakeasy only are replaced
 * by the Phase-1 vector facade plan skewed onto the real 108px live lit wall. Mid/large remain legacy.
 */
export function drawIsoBuilding(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  style: BuildingStyle,
  depth: number,
  opts: { rich?: boolean; lit?: boolean; sign?: number; faction?: 'player' | 'rival'; accent?: number } = {},
): { roofX: number; roofY: number; gfx: Phaser.GameObjects.Graphics } {
  const plan = facadeKitArt() ? planForLowTier(style) : undefined;
  if (!plan) return drawIsoBuildingLegacy(scene, cx, cy, style, depth, opts);
  return drawLowTierBuilding(scene, cx, cy, style, depth, plan, opts);
}
