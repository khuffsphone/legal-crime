// RTS-10/15 — procedural Fedora-Noir art. Phaser-only (lives in /src/scenes); generates all city
// art from vector Graphics at runtime — NO external assets. Bakes reusable textures for unit
// figures, the protection coin, tiles, and the RTS-15 effect sprites (greenback, banknote, soft
// glow). Colours follow docs/VISUAL_DIRECTION.md exact hex ROLES: a ~90% soot+brick world with
// brass (player/money), rival-red identity, and danger-red reserved for motion only.

import Phaser from 'phaser';
import { parseArtMode } from './artMode';

/** RTS-26 — rich (elevated gangster figures) vs lean (pre-rts26 shapes). Read once from the URL. */
export function richArt(): boolean {
  const search = typeof window !== 'undefined' ? window.location.search : '';
  return parseArtMode(search) === 'rich';
}

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
  // RTS-26: faction-specific figure keys (player = brass accents, rival = blood-red accents) so the
  // silhouette ITSELF reads the faction, not just the foot-ring. figureKeyFor() resolves role+faction.
  collector: 'lcr_fig_collector', // legacy/lean aliases (player); kept for compatibility
  thug: 'lcr_fig_thug',
  enforcer: 'lcr_fig_enforcer',
  boss: 'lcr_fig_boss',
  car: 'lcr_car', // a parked period Cadillac (set-dressing)
  lamppost: 'lcr_lamppost',
  coin: 'lcr_coin',
  tileStreet: 'lcr_tile_street',
  tileLot: 'lcr_tile_lot',
  greenback: 'lcr_greenback',
  note: 'lcr_note',
  glow: 'lcr_glow',
} as const;

type Faction = 'player' | 'rival';
type FigRole = 'thug' | 'thompson' | 'collector';

/** The baked texture key for a unit role + faction (player/rival). */
export function figureKeyFor(role: string | undefined, faction: Faction): string {
  const r: FigRole = role === 'collector' ? 'collector' : role === 'enforcer' ? 'thompson' : 'thug';
  return `lcr_fig_${r}_${faction}`;
}

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

/** LEAN (pre-rts26) figure: the original "shapes" person, facing RIGHT, feet at (16, 45). */
function drawFigureLean(
  g: Phaser.GameObjects.Graphics,
  opts: { coat: number; coatDark: number; broad?: boolean; bag?: boolean; gun?: boolean; hatBand?: number },
): void {
  const cx = 16;
  const bodyW = opts.broad ? 17 : 13;
  g.fillStyle(PAL.soot, 1);
  g.fillRect(cx - 5, 33, 4, 12);
  g.fillRect(cx + 1, 33, 4, 12);
  g.fillStyle(PAL.ink, 1);
  g.fillRect(cx - 7, 44, 7, 3);
  g.fillRect(cx, 44, 7, 3);
  g.fillStyle(opts.coat, 1);
  g.fillRoundedRect(cx - bodyW / 2, 17, bodyW, 22, 3);
  g.fillStyle(opts.coatDark, 1);
  g.fillRect(cx, 17, bodyW / 2, 22);
  g.fillStyle(opts.coat, 1);
  g.fillEllipse(cx, 19, bodyW + 5, 9);
  g.fillStyle(PAL.skin, 1);
  g.fillRect(cx - 2, 11, 4, 4);
  g.fillCircle(cx, 9, 4.5);
  g.fillStyle(PAL.ink, 1);
  g.fillEllipse(cx, 8, 17, 5);
  g.fillRoundedRect(cx - 5, 1, 10, 6, 2);
  if (opts.hatBand) { g.fillStyle(opts.hatBand, 1); g.fillRect(cx - 5, 5, 10, 1.5); }
  if (opts.bag) {
    g.fillStyle(PAL.bone, 1); g.fillCircle(cx + 11, 30, 5.5);
    g.fillStyle(PAL.brassDim, 1); g.fillRect(cx + 8, 24, 6, 2.5);
  }
  if (opts.gun) {
    g.fillStyle(PAL.ink, 1); g.fillRect(cx + 6, 25, 14, 2.5); g.fillCircle(cx + 11, 29, 3);
  }
}

/**
 * RICH (rts26) figure — reads as a period mob character: a fedora with a real BRIM + pinched crown, a
 * DOUBLE-BREASTED suit (broad padded shoulders, peaked lapels, two columns of accent buttons), and a
 * wide stance. role adds the readable prop: THOMPSON = a Tommy gun held across the body; COLLECTOR =
 * an unassuming courier with a fat CASH SATCHEL + shoulder strap. `accent` is the faction colour
 * (brass = player, blood-red = rival) on the hatband, lapels and buttons — so faction reads from the
 * silhouette itself. Facing RIGHT, feet at (16, 45). Drawn once, baked to a texture.
 */
function drawFigureRich(
  g: Phaser.GameObjects.Graphics,
  role: FigRole,
  accent: number,
  accentDim: number,
): void {
  const cx = 16;
  const broad = role !== 'collector';
  const coat = PAL.charcoal; // period black/charcoal suit for everyone; faction = the accent + ring
  const coatDark = PAL.ink;
  const shoulderW = broad ? 22 : 17;
  const torsoW = broad ? 16 : 12;

  // wide stance: two trouser legs angled out + shoes
  g.fillStyle(coatDark, 1);
  g.fillRect(cx - (broad ? 7 : 5), 33, 4, 12); // left leg
  g.fillRect(cx + (broad ? 3 : 1), 33, 4, 12); // right leg
  g.fillStyle(PAL.ink, 1);
  g.fillEllipse(cx - (broad ? 5 : 3), 45, 9, 4); // left shoe
  g.fillEllipse(cx + (broad ? 5 : 3), 45, 9, 4); // right shoe

  // long double-breasted coat (trapezoid: wide shoulders → nipped waist → flare)
  g.fillStyle(coat, 1);
  g.fillPoints([
    { x: cx - shoulderW / 2, y: 18 },
    { x: cx + shoulderW / 2, y: 18 },
    { x: cx + torsoW / 2, y: 38 },
    { x: cx - torsoW / 2, y: 38 },
  ], true);
  // shadowed right half (two flat tones per face — VISUAL_DIRECTION §6)
  g.fillStyle(coatDark, 1);
  g.fillPoints([
    { x: cx, y: 18 }, { x: cx + shoulderW / 2, y: 18 }, { x: cx + torsoW / 2, y: 38 }, { x: cx, y: 38 },
  ], true);
  // padded shoulders
  g.fillStyle(coat, 1);
  g.fillEllipse(cx, 19, shoulderW + 3, 8);
  // peaked lapels (a faint accent V) + a tie
  g.fillStyle(accentDim, 1);
  g.fillTriangle(cx, 21, cx - 5, 20, cx - 1, 31); // left lapel
  g.fillTriangle(cx, 21, cx + 5, 20, cx + 1, 31); // right lapel
  g.fillStyle(accent, 1);
  g.fillRect(cx - 1, 21, 2, 11); // tie
  // two columns of double-breasted buttons (the period read), faction-coloured
  g.fillStyle(accent, 1);
  for (let r = 0; r < 3; r++) {
    g.fillCircle(cx - 4, 24 + r * 4, 1.1);
    g.fillCircle(cx + 4, 24 + r * 4, 1.1);
  }

  // neck + head
  g.fillStyle(PAL.skin, 1);
  g.fillRect(cx - 2, 12, 4, 4);
  g.fillCircle(cx, 9, 4.6);

  // FEDORA — a real brim ellipse + pinched crown + accent band
  g.fillStyle(PAL.ink, 1);
  g.fillEllipse(cx, 8, 20, 5.5); // brim
  g.fillEllipse(cx + 4, 7.5, 9, 3); // brim front dip
  g.fillRoundedRect(cx - 5, 0.5, 10, 6.5, 2.5); // crown
  g.fillStyle(coatDark, 1);
  g.fillRect(cx - 1.5, 1, 3, 5); // crown pinch (a dark crease)
  g.fillStyle(accent, 1);
  g.fillRect(cx - 5, 5, 10, 1.6); // hatband (faction)

  if (role === 'thompson') {
    // TOMMY GUN held diagonally across the chest — a barrel quad (hip → forward-up), round drum
    // magazine, and a wooden stock. Drawn as flat polygons so it bakes cleanly to a texture.
    g.fillStyle(PAL.slate, 1);
    g.fillRect(cx - 7, 31, 7, 2.6); // wooden stock at the hip
    g.fillStyle(PAL.ink, 1);
    g.fillPoints([ // diagonal barrel + receiver across the body
      { x: cx - 2, y: 34 }, { x: cx - 1, y: 30.5 }, { x: cx + 15, y: 21.5 }, { x: cx + 14, y: 25 },
    ], true);
    g.fillRect(cx + 11, 20, 5, 1.8); // foresight / muzzle
    g.fillStyle(PAL.ink, 1);
    g.fillCircle(cx + 5, 31, 3.4); // drum magazine
    g.fillStyle(PAL.slate, 1);
    g.fillCircle(cx + 5, 31, 1.4); // drum hub
  } else if (role === 'collector') {
    // shoulder STRAP across the chest + a fat CASH SATCHEL on the hip (the courier read)
    g.fillStyle(coatDark, 1);
    g.fillRect(cx - 6, 19, 14, 2.2); // strap (rotated-ish, simple band)
    g.fillStyle(PAL.brassDim, 1);
    g.fillRoundedRect(cx + 5, 27, 10, 10, 2.5); // satchel body
    g.fillStyle(PAL.bone, 1);
    g.fillRect(cx + 5, 27, 10, 3); // flap
    g.fillStyle(accent, 1);
    g.fillCircle(cx + 10, 31, 1.6); // brass clasp
  } else {
    // THUG: one hand tucked in the coat (the "heater under the arm" read) — a small dark cuff
    g.fillStyle(coatDark, 1);
    g.fillRect(cx + 3, 27, 4, 3);
    g.fillStyle(PAL.skin, 1);
    g.fillRect(cx + 6, 28, 2, 2);
  }
}

interface FigSpec { role: FigRole; accent: number; accentDim: number; lean: Parameters<typeof drawFigureLean>[1]; }

function bakeFigureVariant(scene: Phaser.Scene, key: string, rich: boolean, spec: FigSpec): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  if (rich) drawFigureRich(g, spec.role, spec.accent, spec.accentDim);
  else drawFigureLean(g, spec.lean);
  g.generateTexture(key, 32, 48);
  g.destroy();
}

/** A parked period CADILLAC — long hood, rounded fenders, running board, headlamp, vertical grille.
 * Set-dressing (no car unit exists in the sim). Faction-neutral black with a faint brass trim. */
function bakeCar(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.car)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const W = 50, H = 30;
  // shadow
  g.fillStyle(PAL.ink, 0.4); g.fillEllipse(W / 2, H - 3, 46, 7);
  // rear + front rounded fenders (humps over the wheels)
  g.fillStyle(PAL.ink, 1);
  g.fillEllipse(12, 20, 18, 14);
  g.fillEllipse(38, 20, 18, 14);
  // body (low, long)
  g.fillStyle(0x1a1714, 1);
  g.fillRoundedRect(5, 13, 40, 9, 3); // hood + trunk line
  // raised cabin
  g.fillStyle(0x14110f, 1);
  g.fillRoundedRect(17, 5, 18, 10, 3);
  g.fillStyle(PAL.slate, 0.9);
  g.fillRect(19, 7, 6, 5); // windshield
  g.fillRect(27, 7, 6, 5); // rear window
  // running board
  g.fillStyle(PAL.ink, 1); g.fillRect(8, 21, 34, 2.5);
  // wheels
  g.fillStyle(PAL.ink, 1); g.fillCircle(13, 23, 5.5); g.fillCircle(37, 23, 5.5);
  g.fillStyle(PAL.slate, 1); g.fillCircle(13, 23, 2.2); g.fillCircle(37, 23, 2.2);
  // vertical grille + headlamp (front = right)
  g.fillStyle(PAL.brassDim, 1); g.fillRect(44, 14, 1.6, 7); // grille trim
  g.fillStyle(PAL.windowLit, 1); g.fillCircle(45, 13, 2); // headlamp
  // brass beltline trim
  g.lineStyle(1, PAL.brassDim, 0.8); g.beginPath(); g.moveTo(6, 16); g.lineTo(44, 16); g.strokePath();
  g.generateTexture(TEX.car, W, H);
  g.destroy();
}

/** A cast-iron LAMPPOST with a warm lit lamp head — period street dressing. */
function bakeLamppost(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.lamppost)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const W = 16, H = 46;
  g.fillStyle(PAL.ink, 0.4); g.fillEllipse(W / 2, H - 2, 12, 4); // base shadow
  g.fillStyle(PAL.slate, 1);
  g.fillRect(W / 2 - 1.5, 8, 3, H - 9); // post
  g.fillRect(W / 2 - 3, H - 4, 6, 3); // foot
  g.fillStyle(PAL.ink, 1);
  g.fillRoundedRect(W / 2 - 1.5, 6, 8, 2, 1); // arm
  g.fillStyle(0x2a2520, 1);
  g.fillRoundedRect(W / 2 + 3, 3, 6, 7, 2); // lantern housing
  g.fillStyle(PAL.windowLit, 0.95);
  g.fillRect(W / 2 + 4, 4.5, 4, 4.5); // lit pane
  g.generateTexture(TEX.lamppost, W, H);
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

/** Bake every reusable texture once (idempotent). Honours the rts26 rich/lean art flag. */
export function buildCityTextures(scene: Phaser.Scene): void {
  const rich = richArt();
  // lean fallbacks (the pre-rts26 per-role look) reused for both factions when rich is off.
  const leanThug = { coat: PAL.charcoal, coatDark: PAL.soot, broad: true, hatBand: PAL.bone } as const;
  const leanThompson = { coat: PAL.charcoal, coatDark: PAL.soot, broad: true, gun: true, hatBand: PAL.bone } as const;
  const leanCollector = { coat: PAL.brassDim, coatDark: 0x6a4f24, bag: true, hatBand: PAL.brass } as const;
  // RTS-26: faction figures — player carries BRASS accents, rival carries BLOOD-RED identity accents.
  const factions: { f: Faction; accent: number; accentDim: number; lean: number }[] = [
    { f: 'player', accent: PAL.brass, accentDim: PAL.brassDim, lean: PAL.brass },
    { f: 'rival', accent: PAL.blood, accentDim: PAL.bloodDim, lean: PAL.blood },
  ];
  for (const { f, accent, accentDim } of factions) {
    bakeFigureVariant(scene, `lcr_fig_thug_${f}`, rich, { role: 'thug', accent, accentDim, lean: leanThug });
    bakeFigureVariant(scene, `lcr_fig_thompson_${f}`, rich, { role: 'thompson', accent, accentDim, lean: { ...leanThompson, coat: f === 'rival' ? PAL.bloodDim : PAL.charcoal } });
    bakeFigureVariant(scene, `lcr_fig_collector_${f}`, rich, { role: 'collector', accent, accentDim, lean: leanCollector });
  }
  // legacy single-role keys (kept so any old reference still resolves)
  bakeFigureVariant(scene, TEX.thug, rich, { role: 'thug', accent: PAL.brass, accentDim: PAL.brassDim, lean: leanThug });
  bakeFigureVariant(scene, TEX.collector, rich, { role: 'collector', accent: PAL.brass, accentDim: PAL.brassDim, lean: leanCollector });
  bakeFigureVariant(scene, TEX.enforcer, rich, { role: 'thompson', accent: PAL.blood, accentDim: PAL.bloodDim, lean: leanThompson });
  bakeCar(scene);
  bakeLamppost(scene);
  bakeCoin(scene);
  bakeTile(scene, TEX.tileStreet, PAL.charcoal, PAL.slate, PAL.soot);
  bakeTile(scene, TEX.tileLot, 0x221d18, PAL.charcoal, PAL.ink);
  bakeGreenback(scene);
  bakeNote(scene);
  bakeGlow(scene);
}

/** Legacy texture key for a unit by role (faction conveyed by the foot-ring). Prefer figureKeyFor. */
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
  // RTS-26: the rts24 vice morph target — a taller, brass-trimmed CASINO (the speakeasy "upgraded"
  // silhouette). Visual only; the sim's viceRung drives when the scene swaps the style.
  casino: { wall: PAL.charcoal, wallDark: PAL.ink, roof: PAL.brassDim, trim: PAL.brass, height: 52, windows: 3 },
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
  opts: { rich?: boolean; lit?: boolean; sign?: number } = {},
): { roofX: number; roofY: number; gfx: Phaser.GameObjects.Graphics } {
  const rich = opts.rich ?? richArt();
  const lit = opts.lit ?? true;
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
  // windows on the right wall — warm when lit, dead-dark when shut (the lit/shut read)
  for (let r = 0; r < style.windows; r++) {
    const wy = cy - h + 10 + r * ((h - 14) / Math.max(1, style.windows));
    g.fillStyle(lit ? PAL.windowLit : PAL.ink, lit ? 0.9 : 1);
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

  if (rich) {
    // ── RTS-26 period elevation: art-deco cornice, a striped door AWNING, and a hanging SIGN ──
    const top = cy - h;
    // stepped deco cornice along the right (lit) eave — two brass courses
    g.fillStyle(style.trim, 0.85);
    g.fillPoints([{ x: bBottom.x, y: bBottom.y - h }, { x: bRight.x, y: bRight.y - h },
      { x: bRight.x, y: bRight.y - h + 3 }, { x: bBottom.x, y: bBottom.y - h + 3 }], true);
    g.fillStyle(PAL.ink, 0.5);
    g.fillPoints([{ x: bBottom.x, y: bBottom.y - h + 3 }, { x: bRight.x, y: bRight.y - h + 3 },
      { x: bRight.x, y: bRight.y - h + 5 }, { x: bBottom.x, y: bBottom.y - h + 5 }], true);
    // striped awning over the front door (canvas-flat trapezoid + dark stripes)
    const ax = cx, ay = cy + hh - 17;
    g.fillStyle(style.trim, 0.95);
    g.fillPoints([{ x: ax - 9, y: ay }, { x: ax + 9, y: ay }, { x: ax + 12, y: ay + 6 }, { x: ax - 12, y: ay + 6 }], true);
    g.fillStyle(PAL.ink, 0.4);
    for (let s = -2; s <= 2; s++) g.fillRect(ax + s * 5 - 0.8, ay, 1.6, 6);
    // a small hanging sign on the lit wall (neon dot when lit)
    g.fillStyle(PAL.ink, 1);
    g.fillRect(cx + hw * 0.6, top + 14, 12, 7);
    g.fillStyle(lit ? (opts.sign ?? PAL.windowLit) : PAL.slate, lit ? 0.95 : 1);
    g.fillRect(cx + hw * 0.6 + 2, top + 16, 8, 3);
  }

  return { roofX: cx, roofY: cy - h - hh, gfx: g };
}
