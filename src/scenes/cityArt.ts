// RTS-10/15 — procedural Fedora-Noir art. Phaser-only (lives in /src/scenes); generates all city
// art from vector Graphics at runtime — NO external assets. Bakes reusable textures for unit
// figures, the protection coin, tiles, and the RTS-15 effect sprites (greenback, banknote, soft
// glow). Colours follow docs/VISUAL_DIRECTION.md exact hex ROLES: a ~90% soot+brick world with
// brass (player/money), rival-red identity, and danger-red reserved for motion only.

import Phaser from 'phaser';

export const PAL = {
  // world / structure (the spec's dominant tones)
  soot: 0x16130f,
  ink: 0x0d0b0a, // deepest shadow
  charcoal: 0x241c17,
  slate: 0x322a22,
  fog: 0x9a8f80,
  brick: 0x7e3326, // lit wall (spec brickLight)
  brickDark: 0x5a241b, // shadow wall (spec brickDark)
  bone: 0xe8e2d4,
  skin: 0xc9a883,
  windowLit: 0xe8c87a,
  // state / identity — never decoration
  brass: 0xb8862b, // player + money/value
  brassDim: 0x7c5c1d,
  blood: 0x9e1b1b, // RIVAL identity (static)
  bloodDim: 0x5e1414,
  danger: 0xe11d1d, // DANGER motion only
  cashGreen: 0x4e8b5a, // cash in motion
} as const;

/** Texture keys baked once at boot. */
export const TEX = {
  collector: 'lcr_fig_collector',
  thug: 'lcr_fig_thug',
  enforcer: 'lcr_fig_enforcer',
  boss: 'lcr_fig_boss',
  coin: 'lcr_coin',
  tileStreet: 'lcr_tile_street',
  tileLot: 'lcr_tile_lot',
  greenback: 'lcr_greenback',
  note: 'lcr_note',
  glow: 'lcr_glow',
} as const;

const ISO_HW = 64; // tile half-width
const ISO_HH = 32; // tile half-height

function diamond(cx: number, cy: number, hw = ISO_HW, hh = ISO_HH): Phaser.Geom.Point[] {
  return [
    new Phaser.Geom.Point(cx, cy - hh),
    new Phaser.Geom.Point(cx + hw, cy),
    new Phaser.Geom.Point(cx, cy + hh),
    new Phaser.Geom.Point(cx - hw, cy),
  ];
}

// ── baked textures ───────────────────────────────────────────────────────────────────────────

/** A little person facing RIGHT, feet centered at (W/2, H-3). Scene flips for leftward facings. */
function drawFigure(
  g: Phaser.GameObjects.Graphics,
  opts: { coat: number; coatDark: number; broad?: boolean; bag?: boolean; gun?: boolean; hatBand?: number },
): void {
  const cx = 16;
  const bodyW = opts.broad ? 17 : 13;
  // legs + shoes
  g.fillStyle(PAL.soot, 1);
  g.fillRect(cx - 5, 33, 4, 12);
  g.fillRect(cx + 1, 33, 4, 12);
  g.fillStyle(PAL.ink, 1);
  g.fillRect(cx - 7, 44, 7, 3);
  g.fillRect(cx, 44, 7, 3);
  // long coat
  g.fillStyle(opts.coat, 1);
  g.fillRoundedRect(cx - bodyW / 2, 17, bodyW, 22, 3);
  g.fillStyle(opts.coatDark, 1);
  g.fillRect(cx, 17, bodyW / 2, 22); // shadowed (right) half
  // shoulders
  g.fillStyle(opts.coat, 1);
  g.fillEllipse(cx, 19, bodyW + 5, 9);
  // head + neck
  g.fillStyle(PAL.skin, 1);
  g.fillRect(cx - 2, 11, 4, 4);
  g.fillCircle(cx, 9, 4.5);
  // fedora
  g.fillStyle(PAL.ink, 1);
  g.fillEllipse(cx, 8, 17, 5);
  g.fillRoundedRect(cx - 5, 1, 10, 6, 2);
  if (opts.hatBand) {
    g.fillStyle(opts.hatBand, 1);
    g.fillRect(cx - 5, 5, 10, 1.5);
  }
  // money bag (collectors carry the take on their right/front)
  if (opts.bag) {
    g.fillStyle(PAL.bone, 1);
    g.fillCircle(cx + 11, 30, 5.5);
    g.fillStyle(PAL.brassDim, 1);
    g.fillRect(cx + 8, 24, 6, 2.5); // bag tie
  }
  // tommy gun (enforcers)
  if (opts.gun) {
    g.fillStyle(PAL.ink, 1);
    g.fillRect(cx + 6, 25, 14, 2.5); // barrel
    g.fillCircle(cx + 11, 29, 3); // drum mag
  }
}

function bakeFigure(scene: Phaser.Scene, key: string, opts: Parameters<typeof drawFigure>[1]): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  drawFigure(g, opts);
  g.generateTexture(key, 32, 48);
  g.destroy();
}

/** The rotating brass "protection" coin (a % badge) that floats over an extorted front. */
function bakeCoin(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.coin)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(PAL.brass, 1);
  g.fillCircle(11, 11, 10);
  g.fillStyle(PAL.brassDim, 1);
  g.fillCircle(11, 11, 10);
  g.fillStyle(PAL.brass, 1);
  g.fillCircle(11, 9, 9);
  // a percent glyph: two pips and a slash
  g.fillStyle(PAL.ink, 1);
  g.fillCircle(7, 7, 2);
  g.fillCircle(15, 15, 2);
  g.lineStyle(2, PAL.ink, 1);
  g.beginPath();
  g.moveTo(16, 6);
  g.lineTo(6, 16);
  g.strokePath();
  g.generateTexture(TEX.coin, 22, 22);
  g.destroy();
}

function bakeTile(scene: Phaser.Scene, key: string, base: number, accent: number, speckle: number): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const cx = ISO_HW;
  const cy = ISO_HH;
  g.fillStyle(base, 1);
  g.fillPoints(diamond(cx, cy), true);
  // cobble/curb seams
  g.lineStyle(1, accent, 0.5);
  g.beginPath();
  g.moveTo(cx - ISO_HW / 2, cy - ISO_HH / 2);
  g.lineTo(cx + ISO_HW / 2, cy + ISO_HH / 2);
  g.moveTo(cx + ISO_HW / 2, cy - ISO_HH / 2);
  g.lineTo(cx - ISO_HW / 2, cy + ISO_HH / 2);
  g.strokePath();
  // grime speckle
  g.fillStyle(speckle, 0.5);
  for (let i = 0; i < 7; i++) {
    const a = (i * 53) % 360;
    const r = 6 + ((i * 17) % 22);
    g.fillCircle(cx + Math.cos(a) * r, cy + (Math.sin(a) * r) / 2, 1.2);
  }
  g.lineStyle(1, PAL.ink, 0.35);
  g.strokePoints(diamond(cx, cy), true);
  g.generateTexture(key, ISO_HW * 2, ISO_HH * 2);
  g.destroy();
}

/** A small greenback for the cash trail / banked arc (RTS-15). */
function bakeGreenback(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.greenback)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(PAL.cashGreen, 1);
  g.fillRoundedRect(0, 0, 14, 8, 2);
  g.lineStyle(1, 0x2f5e3a, 1);
  g.strokeRoundedRect(0, 0, 14, 8, 2);
  g.fillStyle(0x2f5e3a, 1);
  g.fillCircle(7, 4, 2);
  g.generateTexture(TEX.greenback, 14, 8);
  g.destroy();
}

/** A grab-able banknote that scatters from a robbed collector (RTS-15). */
function bakeNote(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.note)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(PAL.cashGreen, 1);
  g.fillRect(0, 0, 16, 9);
  g.fillStyle(PAL.bone, 0.7);
  g.fillRect(6, 2, 4, 5);
  g.generateTexture(TEX.note, 16, 9);
  g.destroy();
}

/** A soft radial glow (white, fading out) — tinted per use. Glows are soft alpha, never fills. */
function bakeGlow(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.glow)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const R = 32;
  for (let r = R; r > 0; r--) {
    const a = (1 - r / R) ** 2 * 0.5; // soft falloff
    g.fillStyle(0xffffff, a);
    g.fillCircle(R, R, r);
  }
  g.generateTexture(TEX.glow, R * 2, R * 2);
  g.destroy();
}

/** Bake every reusable texture once (idempotent). */
export function buildCityTextures(scene: Phaser.Scene): void {
  bakeFigure(scene, TEX.collector, { coat: PAL.brassDim, coatDark: 0x6a4f24, bag: true, hatBand: PAL.brass });
  bakeFigure(scene, TEX.thug, { coat: PAL.charcoal, coatDark: PAL.soot, broad: true, hatBand: PAL.bone });
  bakeFigure(scene, TEX.enforcer, { coat: PAL.blood, coatDark: PAL.bloodDim, broad: true, gun: true, hatBand: PAL.ink });
  bakeFigure(scene, TEX.boss, { coat: PAL.bone, coatDark: 0xbdb6a4, hatBand: PAL.brass });
  bakeCoin(scene);
  bakeTile(scene, TEX.tileStreet, PAL.charcoal, PAL.slate, PAL.soot);
  bakeTile(scene, TEX.tileLot, 0x221d18, PAL.charcoal, PAL.ink);
  bakeGreenback(scene);
  bakeNote(scene);
  bakeGlow(scene);
}

/** Texture key for a unit by role (faction colour is conveyed by the foot-ring in the scene). */
export function figureKeyForRole(role: string | undefined): string {
  switch (role) {
    case 'collector':
      return TEX.collector;
    case 'enforcer':
      return TEX.enforcer;
    default:
      return TEX.thug;
  }
}

// ── parametric iso buildings (drawn straight into the scene) ──────────────────────────────────

export interface BuildingStyle {
  wall: number;
  wallDark: number;
  roof: number;
  trim: number;
  height: number;
  windows: number; // window rows
  footHalfW?: number;
  footHalfH?: number;
}

export const BUILDING_STYLES: Record<string, BuildingStyle> = {
  storefront: { wall: PAL.brick, wallDark: PAL.brickDark, roof: PAL.charcoal, trim: PAL.brass, height: 40, windows: 2 },
  speakeasy: { wall: PAL.charcoal, wallDark: PAL.soot, roof: PAL.ink, trim: PAL.bloodDim, height: 34, windows: 1 },
  warehouse: { wall: PAL.slate, wallDark: PAL.charcoal, roof: PAL.charcoal, trim: PAL.fog, height: 30, windows: 1, footHalfW: 60, footHalfH: 30 },
  hq: { wall: PAL.charcoal, wallDark: PAL.soot, roof: PAL.brassDim, trim: PAL.brass, height: 66, windows: 3 },
};

/**
 * Draw a Fedora-Noir iso building centred on tile-screen point (cx, cy). Returns the roof-centre
 * screen point (so the caller can float a protection coin / glow above it) plus the objects it
 * created, parented under `container` if given. Pure drawing — no game state involved.
 */
export function drawIsoBuilding(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  style: BuildingStyle,
  depth: number,
): { roofX: number; roofY: number } {
  const hw = style.footHalfW ?? 54;
  const hh = style.footHalfH ?? 27;
  const h = style.height;
  const g = scene.add.graphics().setDepth(depth);

  // base corners
  const bTop = { x: cx, y: cy - hh };
  const bRight = { x: cx + hw, y: cy };
  const bBottom = { x: cx, y: cy + hh };
  const bLeft = { x: cx - hw, y: cy };

  // left wall (darker)
  g.fillStyle(style.wallDark, 1);
  g.fillPoints([bLeft, bBottom, { x: bBottom.x, y: bBottom.y - h }, { x: bLeft.x, y: bLeft.y - h }], true);
  // right wall (lit)
  g.fillStyle(style.wall, 1);
  g.fillPoints([bBottom, bRight, { x: bRight.x, y: bRight.y - h }, { x: bBottom.x, y: bBottom.y - h }], true);
  // roof
  g.fillStyle(style.roof, 1);
  g.fillPoints(
    [
      { x: bTop.x, y: bTop.y - h },
      { x: bRight.x, y: bRight.y - h },
      { x: bBottom.x, y: bBottom.y - h },
      { x: bLeft.x, y: bLeft.y - h },
    ],
    true,
  );
  // brick courses on the lit wall
  g.lineStyle(1, style.wallDark, 0.5);
  for (let i = 1; i < style.windows + 2; i++) {
    const yy = cy - (h * i) / (style.windows + 2);
    g.beginPath();
    g.moveTo(bBottom.x, yy + hh);
    g.lineTo(bRight.x, yy);
    g.strokePath();
  }
  // lit windows on the right wall
  for (let r = 0; r < style.windows; r++) {
    const wy = cy - h + 10 + r * ((h - 14) / Math.max(1, style.windows));
    g.fillStyle(PAL.windowLit, 0.9);
    g.fillRect(cx + hw * 0.45, wy, 7, 6);
    g.fillRect(cx + hw * 0.7, wy + 2, 7, 6);
  }
  // brass trim line along the roof eave + a door
  g.lineStyle(2, style.trim, 0.9);
  g.strokePoints(
    [
      { x: bTop.x, y: bTop.y - h },
      { x: bRight.x, y: bRight.y - h },
      { x: bBottom.x, y: bBottom.y - h },
      { x: bLeft.x, y: bLeft.y - h },
    ],
    true,
  );
  g.fillStyle(PAL.ink, 1);
  g.fillRect(cx - 5, cy + hh - 16, 10, 16); // door at the front base

  return { roofX: cx, roofY: cy - h - hh };
}
