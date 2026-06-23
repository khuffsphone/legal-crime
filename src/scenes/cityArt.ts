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
  sootDeep: 0x0e0c0b,
  sootWarm: 0x1a1410,
  ink: 0x0d0b0a, // deepest shadow
  charcoal: 0x241c17,
  slate: 0x322a22,
  fog: 0x9a8f80,
  brick: 0x7e3326, // lit wall (spec brickLight)
  brickDark: 0x5a241b, // shadow wall (spec brickDark)
  brickBase: 0x3a211a, // PROCEDURAL_ART_SPEC brick base
  brickLit: 0x5a3326, // spec brick lit course
  mortar: 0x6b5344,
  bone: 0xe8e2d4,
  skin: 0xc9a883,
  fleshLit: 0xc9a07a,
  fleshDark: 0x9a7355,
  windowLit: 0xe8c87a,
  // RTS-26 ART SPEC material tokens
  suitCharcoal: 0x23211e,
  pinstripe: 0x2e2b27,
  suitBrown: 0x3a2c20,
  shirt: 0xd8cdb0,
  glass: 0x2e3a3a,
  glassGlow: 0xe3a12b,
  lamp: 0xf2c879,
  gunmetal: 0x2a2a2e,
  // state / identity — never decoration
  brass: 0xb8862b, // player + money/value
  brassHi: 0xe3c36a,
  brassDim: 0x7c5c1d,
  brassDark: 0x7a5a1e,
  blood: 0x9e1b1b, // RIVAL identity (static)
  bloodDim: 0x5e1414,
  danger: 0xe11d1d, // DANGER motion only
  muzzle: 0xff5a2c, // muzzle-flash core (motion only)
  cashGreen: 0x4e8b5a, // cash in motion
  federalGreen: 0x4e8b5a,
} as const;

/** Texture keys baked once at boot. */
export const TEX = {
  // RTS-26: faction-specific figure keys (player = brass accents, rival = blood-red accents) so the
  // silhouette ITSELF reads the faction, not just the foot-ring. figureKeyFor() resolves role+faction.
  collector: 'lcr_fig_collector', // legacy/lean aliases (player); kept for compatibility
  thug: 'lcr_fig_thug',
  enforcer: 'lcr_fig_enforcer',
  boss: 'lcr_fig_boss',
  car: 'lcr_car', // neutral parked Cadillac (set-dressing, no faction accent)
  carPlayer: 'lcr_car_player', // hero ride, brass coachline + hubs
  carRival: 'lcr_car_rival', // hero ride, blood coachline + hubs
  lamppost: 'lcr_lamppost',
  // RTS-30b-ground: faction-NEUTRAL static set dressing (muted, low-contrast — never brass/red).
  tree: 'lcr_tree',
  hydrant: 'lcr_hydrant',
  mailbox: 'lcr_mailbox',
  bench: 'lcr_bench',
  fence: 'lcr_fence',
  // RTS-30 living-city Pass 1: ambient moving life — faction-NEUTRAL, subordinate to the 56px units.
  carLite: 'lcr_carlite',
  taxi: 'lcr_taxi',
  coin: 'lcr_coin',
  tileStreet: 'lcr_tile_street',
  tileLot: 'lcr_tile_lot',
  greenback: 'lcr_greenback',
  note: 'lcr_note',
  glow: 'lcr_glow',
} as const;

type Faction = 'player' | 'rival';
type FigRole = 'thug' | 'thompson' | 'collector';

/** The baked texture key for a unit role + faction. Collectors have 3 satchel TIERS (1/2/3) keyed
 * to the carried cash; the scene swaps the texture only when the tier changes (state-driven). */
export function figureKeyFor(role: string | undefined, faction: Faction, tier: 1 | 2 | 3 = 1): string {
  if (role === 'collector') return `lcr_fig_collector_${faction}_t${tier}`;
  const r: FigRole = role === 'enforcer' ? 'thompson' : 'thug';
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

// RICH figure canvas — taller than the lean 32×48 so the spec proportions (26px shoulders, the gun
// bar, the satchel bulge) read. Foot-anchored near the bottom-centre; the scene sets origin 0.5,0.93.
const FIG_W = 38;
const FIG_H = 56;
const FIG_CX = 19;
const FIG_GROUND = 52;

/** Shared FEDORA — brim ellipse + pinched crown trapezoid + a 2px faction HATBAND (the high, always-
 * legible faction read). `soft` flattens it for the collector's plainer hat. */
function drawFedora(g: Phaser.GameObjects.Graphics, cx: number, topY: number, brimW: number, band: number, soft: boolean): void {
  const crownW = brimW * 0.62;
  // brim (lit top edge + dark underside so it shadows the eyes)
  g.fillStyle(PAL.sootDeep, 1);
  g.fillEllipse(cx, topY + 7, brimW, soft ? 4 : 5);
  g.fillStyle(PAL.ink, 1);
  g.fillEllipse(cx + 2, topY + 7.5, brimW * 0.6, 2.6); // front brim shadow over the eyes
  // pinched crown (trapezoid, NW-lit left face)
  g.fillStyle(soft ? PAL.suitBrown : PAL.ink, 1);
  g.fillPoints([
    { x: cx - crownW / 2, y: topY + 7 }, { x: cx + crownW / 2, y: topY + 7 },
    { x: cx + crownW / 2 - 1.5, y: topY + (soft ? 1.5 : 0.5) }, { x: cx - crownW / 2 + 1.5, y: topY + (soft ? 1.5 : 0.5) },
  ], true);
  g.fillStyle(PAL.slate, 0.5);
  g.fillRect(cx - crownW / 2 + 1, topY + 1.5, 1.5, 5.5); // NW light edge of the crown
  if (!soft) { g.fillStyle(PAL.sootDeep, 1); g.fillRect(cx - 1, topY + 1, 2, 5.5); } // pinch crease
  // hatband (faction)
  g.fillStyle(band, 1);
  g.fillRect(cx - crownW / 2, topY + 5.4, crownW, soft ? 1.4 : 2);
}

/**
 * RICH (rts26, built to PROCEDURAL_ART_SPEC §1) period mob figure. Silhouette-first + the FACTION
 * ACCENT LAW: exactly ONE saturated faction read placed twice high in the silhouette (hatband +
 * pocket-square / lapel pin / cash-glint), never smeared over the body. role drives the silhouette:
 *   THUG      — broadest (26px shoulders), double-breasted pinstripe, planted wide stance.
 *   THOMPSON  — suited mass BROKEN by the gun bar + the drum-magazine circle (the recognition key).
 *   COLLECTOR — narrow (18px), hunched, mid-stride, a fat 3-tier CASH SATCHEL, no gun.
 * `accent` = faction colour (brass player / blood rival). Facing RIGHT; the scene flips for left.
 */
function drawFigureRich(
  g: Phaser.GameObjects.Graphics,
  role: FigRole,
  accent: number,
  accentDim: number,
  tier = 2,
): void {
  const cx = FIG_CX;
  const shoulderW = role === 'thug' ? 26 : role === 'thompson' ? 22 : 18;
  const waistW = role === 'collector' ? 13 : 18;
  const suit = role === 'thompson' ? PAL.suitBrown : role === 'collector' ? PAL.suitBrown : PAL.suitCharcoal;
  const suitDark = role === 'thompson' ? 0x2a2018 : PAL.sootDeep;
  const hunch = role === 'collector' ? 2 : 0; // forward lean
  const topY = 1 + hunch;
  const headY = 11 + hunch;
  const shoulderY = 17 + hunch;

  // ── legs + shoes ──
  if (role === 'collector') {
    // mid-stride plain brown trousers (one forward, one back) — the "always moving" read
    g.fillStyle(PAL.suitBrown, 1);
    g.fillPoints([{ x: cx - 6, y: 37 }, { x: cx - 1, y: 37 }, { x: cx - 4, y: FIG_GROUND }, { x: cx - 9, y: FIG_GROUND }], true);
    g.fillPoints([{ x: cx + 1, y: 37 }, { x: cx + 6, y: 37 }, { x: cx + 10, y: FIG_GROUND - 1 }, { x: cx + 5, y: FIG_GROUND - 1 }], true);
    g.fillStyle(PAL.ink, 1);
    g.fillEllipse(cx - 7, FIG_GROUND, 9, 3.5); g.fillEllipse(cx + 8, FIG_GROUND - 1, 9, 3.5);
  } else {
    const stance = role === 'thompson' ? 5 : 8; // thug = planted wide; thompson = bladed
    g.fillStyle(suit, 1);
    g.fillPoints([{ x: cx - stance - 3, y: 36 }, { x: cx - stance + 3, y: 36 }, { x: cx - stance + 2, y: FIG_GROUND }, { x: cx - stance - 4, y: FIG_GROUND }], true);
    g.fillPoints([{ x: cx + stance - 3, y: 36 }, { x: cx + stance + 3, y: 36 }, { x: cx + stance + 4, y: FIG_GROUND }, { x: cx + stance - 2, y: FIG_GROUND }], true);
    g.fillStyle(PAL.ink, 1);
    g.fillEllipse(cx - stance, FIG_GROUND, 11, 4); g.fillEllipse(cx + stance, FIG_GROUND, 11, 4);
  }

  // ── torso (double-breasted for suited; soft sack coat for the collector) ──
  const torso = [
    { x: cx - shoulderW / 2, y: shoulderY + 1 }, { x: cx + shoulderW / 2, y: shoulderY + 1 },
    { x: cx + waistW / 2, y: 38 }, { x: cx - waistW / 2, y: 38 },
  ];
  g.fillStyle(suit, 1); g.fillPoints(torso, true);
  // SE shadow half (light from NW — 2 tone per material)
  g.fillStyle(suitDark, 0.55);
  g.fillPoints([{ x: cx, y: shoulderY + 1 }, { x: cx + shoulderW / 2, y: shoulderY + 1 }, { x: cx + waistW / 2, y: 38 }, { x: cx, y: 38 }], true);
  // padded shoulders
  g.fillStyle(suit, 1); g.fillEllipse(cx, shoulderY, shoulderW + (role === 'thug' ? 4 : 2), role === 'collector' ? 6 : 9);

  if (role !== 'collector') {
    // pinstripe verticals (texture, not noise)
    g.lineStyle(1, PAL.pinstripe, role === 'thug' ? 0.7 : 0.4);
    for (let x = -shoulderW / 2 + 3; x <= shoulderW / 2 - 3; x += 4) { g.beginPath(); g.moveTo(cx + x, shoulderY + 3); g.lineTo(cx + x * (waistW / shoulderW), 37); g.strokePath(); }
    // lapel V + shirt + tie wedge
    g.fillStyle(PAL.shirt, 1);
    g.fillTriangle(cx, 20 + hunch, cx - 4, 21 + hunch, cx, 31 + hunch);
    g.fillTriangle(cx, 20 + hunch, cx + 4, 21 + hunch, cx, 31 + hunch);
    g.fillStyle(suitDark, 1); g.fillRect(cx - 1, 22 + hunch, 2, 9); // tie
    // two rows of 2 double-breasted buttons (brass-dark — value-metal, not the faction read)
    g.fillStyle(PAL.brassDark, 1);
    for (const by of [27 + hunch, 32 + hunch]) { g.fillCircle(cx - 4, by, 1.2); g.fillCircle(cx + 4, by, 1.2); }
  }

  // ── arms ──
  if (role === 'thug') {
    // stubby cylinders held slightly out + fists
    g.fillStyle(suit, 1);
    g.fillRoundedRect(cx - shoulderW / 2 - 1, shoulderY + 2, 5, 14, 2);
    g.fillRoundedRect(cx + shoulderW / 2 - 4, shoulderY + 2, 5, 14, 2);
    g.fillStyle(PAL.fleshDark, 1);
    g.fillCircle(cx - shoulderW / 2 + 1.5, shoulderY + 17, 2.4); g.fillCircle(cx + shoulderW / 2 - 1.5, shoulderY + 17, 2.4);
  }

  // ── neck + head + heavy jaw ──
  g.fillStyle(PAL.fleshDark, 1); g.fillRect(cx - 2, headY + 2, 4, 3); // neck
  g.fillStyle(PAL.fleshLit, 1); g.fillCircle(cx - 0.7, headY, 4.5); // head (NW lit)
  g.fillStyle(PAL.fleshDark, 1); g.fillCircle(cx + 1.6, headY + 0.6, 3.6); // SE shadow cheek/jaw
  if (role === 'thug') { g.fillStyle(PAL.fleshDark, 1); g.fillEllipse(cx, headY + 3.2, 8, 3.5); } // heavy jaw

  // ── the prop / weapon layer (in front of the torso) ──
  if (role === 'thompson') {
    // TOMMY GUN across the chest on the iso diagonal — the BROKEN silhouette + the DRUM is the key.
    g.fillStyle(PAL.suitBrown, 1); // wooden stock into the shoulder
    g.fillPoints([{ x: cx - 9, y: 30 }, { x: cx - 4, y: 27 }, { x: cx - 2, y: 30 }, { x: cx - 7, y: 33 }], true);
    g.fillStyle(PAL.gunmetal, 1); // barrel + receiver bar
    g.fillPoints([{ x: cx - 3, y: 31 }, { x: cx - 1.5, y: 28 }, { x: cx + 16, y: 22 }, { x: cx + 15, y: 25 }], true);
    g.fillRect(cx + 14, 21, 5, 1.8); // Cutts compensator / muzzle
    g.fillStyle(PAL.gunmetal, 1); g.fillRect(cx + 5, 27, 2.4, 5); // front grip
    g.fillStyle(PAL.sootDeep, 1); g.fillCircle(cx + 4, 31, 4.6); // DRUM magazine (recognition key)
    g.fillStyle(PAL.gunmetal, 1); g.fillCircle(cx + 4, 31, 3.2);
    g.fillStyle(PAL.brassDark, 1); g.fillCircle(cx + 4, 31, 1); // drum pin
    // front arm to the grip
    g.fillStyle(suit, 1); g.fillRoundedRect(cx + 3, shoulderY + 3, 4, 9, 2);
  } else if (role === 'collector') {
    // SATCHEL — hero prop, 3 size TIERS keyed to the carried cash (spec §1.3).
    const bw = tier === 1 ? 11 : tier === 2 ? 15 : 19;
    const bh = tier === 1 ? 9 : tier === 2 ? 12 : 14;
    const bx = cx + 3, by = 30;
    g.lineStyle(2, PAL.suitBrown, 1); g.beginPath(); g.moveTo(cx - 6, shoulderY + 1); g.lineTo(bx + bw / 2 - 3, by); g.strokePath(); // diagonal strap
    g.fillStyle(0x5a4634, 1); g.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 2.5); // leather body (lit)
    g.fillStyle(0x3a2c20, 1); g.fillRoundedRect(bx, by - bh / 2, bw / 2, bh, 2.5); // SE shadow half
    g.fillStyle(0x6a523c, 1); g.fillRect(bx - bw / 2, by - bh / 2, bw, 3); // flap
    g.fillStyle(PAL.brassDark, 1); g.fillRect(bx - 1.5, by - 1, 3, 3); // buckle
    if (tier === 3) { g.fillStyle(PAL.brassHi, 1); g.fillRect(bx + bw / 2 - 3, by - bh / 2 + 1, 2.5, 2.5); } // money-glint notch (overfull)
    // arm clutching the strap (protective)
    g.fillStyle(suit, 1); g.fillRoundedRect(cx - shoulderW / 2, shoulderY + 3, 4, 11, 2);
    g.fillStyle(PAL.fleshDark, 1); g.fillCircle(bx - bw / 2 + 1, by - bh / 2, 2);
  } else {
    // THUG accent #2 — chest POCKET-SQUARE triangle (faction), high in the silhouette
    g.fillStyle(accent, 1);
    g.fillTriangle(cx - 6, 24 + hunch, cx - 2.5, 24 + hunch, cx - 4.3, 27.5 + hunch);
  }

  // ── fedora (front) + the second faction accent for thompson ──
  drawFedora(g, cx, topY, role === 'thug' ? 17 : role === 'collector' ? 13 : 15, role === 'collector' ? accentDim : accent, role === 'collector');
  if (role === 'thompson') { g.fillStyle(accent, 1); g.fillCircle(cx - 3.5, 22 + hunch, 1.3); } // lapel pin (small — gun stays the read)
}

/** RTS-30c-2a — the baked texture key for a weapon-tier enforcer silhouette. */
export function enforcerTexKey(tier: string): string { return `lcr_enf_${tier}`; }

const ENFORCER_FIG_TIERS = ['pistol', 'shotgun', 'rifle', 'hitman', 'demolitions'] as const;

/**
 * RTS-30c-2a — a distinct PLAYER enforcer silhouette per weapon tier. Reuses the period rich body
 * (brass accents) and adds ONE readable "tell" per tier. ⭐ RED DISCIPLINE: every weapon/bandolier/
 * dynamite tell is GUNMETAL or BRASS-DARK — never rival-red (no rival-red on a player unit, cargo
 * included); the HITMAN's only accent is BONE-WHITE (motion-discipline — no static danger colour). This
 * is a silhouette, not a depiction of violence (the Thompson Man already carries a gun shape in canon).
 */
function bakeEnforcer(scene: Phaser.Scene, tier: (typeof ENFORCER_FIG_TIERS)[number]): void {
  const key = enforcerTexKey(tier);
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const cx = FIG_CX;
  // base body — player BRASS; the HITMAN's ONLY accent is BONE-WHITE (unique among the brass crew).
  if (tier === 'hitman') drawFigureRich(g, 'thug', PAL.bone, PAL.bone);
  else drawFigureRich(g, 'thug', PAL.brass, PAL.brassDim);
  if (tier === 'pistol') {
    g.fillStyle(PAL.gunmetal, 1); g.fillRect(cx + 6, 31, 8, 2.2); g.fillRect(cx + 12, 30, 2.4, 3); // a short sidearm
  } else if (tier === 'shotgun') {
    g.lineStyle(3, PAL.brassDark, 1); g.beginPath(); g.moveTo(cx - 7, 19); g.lineTo(cx + 8, 34); g.strokePath(); // bandolier (brass-dark, NOT red)
    g.fillStyle(PAL.gunmetal, 1); g.fillRect(cx + 2, 30, 15, 2.8); g.fillRect(cx + 15, 29, 3, 4.4); // stubby barrel
  } else if (tier === 'rifle') {
    g.fillStyle(PAL.suitBrown, 1); g.fillRect(cx - 10, 23.4, 6, 3); // wooden stock
    g.fillStyle(PAL.gunmetal, 1); g.fillRect(cx - 8, 24, 26, 2); g.fillRect(cx + 16, 23.2, 4, 1.6); // a long gun across the body
  } else if (tier === 'hitman') {
    g.fillStyle(PAL.bone, 1); g.fillRect(cx - 5, 6.4, 10, 1.6); // bone-white hatband (the only accent)
    g.fillStyle(PAL.suitCharcoal, 1); g.fillRect(cx - 4, 38, 8, 12); // long slim coat tail
    g.fillStyle(PAL.bone, 1); g.fillCircle(cx + 3.4, 12.6, 1.3); // ⭐ the bone-white EMBER (static; a fast pulse only when working — never a static danger dot)
  } else { // demolitions
    g.fillStyle(PAL.gunmetal, 1); g.fillRect(cx - 13, 25, 9, 1.8); // pack strap
    g.fillStyle(PAL.brassDark, 1); for (let i = 0; i < 3; i++) g.fillRoundedRect(cx - 12 + i * 3, 26, 2.4, 9, 1); // dynamite cluster (brass-dark, NOT red)
    g.fillStyle(PAL.gunmetal, 1); g.fillRect(cx + 5, 33, 9, 7); // ⭐ the TOOL-CASE (Design's unique tell) in the off hand
    g.fillStyle(PAL.brassDark, 1); g.fillRect(cx + 7.5, 31.4, 4, 2); // brass-dark case handle
  }
  g.generateTexture(key, FIG_W, FIG_H);
  g.destroy();
}

interface FigSpec { role: FigRole; accent: number; accentDim: number; tier?: number; lean: Parameters<typeof drawFigureLean>[1]; }

function bakeFigureVariant(scene: Phaser.Scene, key: string, rich: boolean, spec: FigSpec): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  if (rich) { drawFigureRich(g, spec.role, spec.accent, spec.accentDim, spec.tier ?? 2); g.generateTexture(key, FIG_W, FIG_H); }
  else { drawFigureLean(g, spec.lean); g.generateTexture(key, 32, 48); }
  g.destroy();
}

/**
 * A long low 1930s CADILLAC (PROCEDURAL_ART_SPEC §1.4) along the 2:1 axis: rounded fender arches over
 * the two near wheels, running board, long hood + cabin greenhouse, a tall vertical-slat grille and
 * twin headlamps. `accent` (brass/blood) paints ONLY the coachline pinstripe + wheel-hub centres (the
 * faction read — never the body). `parked` dims it ~20% and drops the accent so set-dressing recedes.
 */
function bakeCar(scene: Phaser.Scene, key: string, accent: number | null, parked: boolean): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const W = 64, H = 30;
  const body = parked ? 0x141210 : 0x1c1916;
  const bodyLit = parked ? 0x1c1916 : 0x262220;
  const chrome = parked ? PAL.slate : PAL.brassDim;
  g.fillStyle(PAL.sootDeep, 0.4); g.fillEllipse(W / 2, H - 2, 60, 8); // big soft shadow
  // rounded FENDER ARCHES over the two near wheels (the era's signature)
  g.fillStyle(body, 1); g.fillEllipse(15, 19, 22, 15); g.fillEllipse(49, 19, 22, 15);
  // main body + long hood (rounded-top), lit roof/hood vs darker shadow side
  g.fillStyle(bodyLit, 1); g.fillRoundedRect(5, 11, 54, 11, 4);
  g.fillStyle(body, 1); g.fillRect(5, 17, 54, 5); // SE shadow underside
  // greenhouse cabin (dark glass trapezoid)
  g.fillStyle(0x14110f, 1); g.fillRoundedRect(22, 3, 22, 11, 3);
  g.fillStyle(PAL.glass, 1); g.fillRect(24, 5, 8, 6); g.fillRect(34, 5, 8, 6); // split windscreen
  g.fillStyle(PAL.bone, 0.18); g.fillRect(24, 5, 8, 1.2); // 1px hi
  // running boards
  g.fillStyle(PAL.sootDeep, 1); g.fillRect(8, 21, 48, 3);
  // NEAR wheels: black tori + hub + 4 spoke ticks
  for (const wx of [15, 49]) {
    g.fillStyle(PAL.sootDeep, 1); g.fillCircle(wx, 23, 6);
    g.fillStyle(0x5a5048, 1); g.fillCircle(wx, 23, 2.6); // hub
    g.fillStyle(accent ?? 0x5a5048, 1); g.fillCircle(wx, 23, 1.2); // hub centre = faction accent
    g.lineStyle(1, 0x3a342e, 1);
    for (let a = 0; a < 4; a++) { const ang = a * Math.PI / 2 + 0.4; g.beginPath(); g.moveTo(wx, 23); g.lineTo(wx + Math.cos(ang) * 5, 23 + Math.sin(ang) * 5); g.strokePath(); }
  }
  // tall vertical-slat grille + twin headlamps + thin chrome bumper (front = right)
  g.fillStyle(PAL.gunmetal, 1); g.fillRect(57, 10, 4, 11);
  g.lineStyle(1, chrome, 0.9); for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(57.5 + i, 10); g.lineTo(57.5 + i, 21); g.strokePath(); }
  g.fillStyle(PAL.lamp, 1); g.fillCircle(60, 9, 2.1); g.fillCircle(60, 22, 1.6); // twin headlamps
  g.fillStyle(chrome, 1); g.fillRect(56, 22, 7, 1.4); // bumper
  // beltline coachline (faction coachline pinstripe when accented)
  g.lineStyle(1, accent ?? chrome, parked ? 0.7 : 1); g.beginPath(); g.moveTo(6, 14); g.lineTo(57, 14); g.strokePath();
  g.generateTexture(key, W, H);
  g.destroy();
}

/** A cast-iron LAMPPOST with a warm lit lamp head — period street dressing. */
function bakeLamppost(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.lamppost)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const W = 18, H = 48;
  const px = W / 2;
  g.fillStyle(PAL.sootDeep, 0.35); g.fillEllipse(px, H - 2, 12, 4); // base shadow
  // stepped deco base
  g.fillStyle(PAL.slate, 1); g.fillRect(px - 3, H - 6, 6, 4); g.fillRect(px - 2, H - 9, 4, 3);
  g.fillRect(px - 1.2, 12, 2.4, H - 18); // thin deco standard
  g.fillStyle(PAL.charcoal, 1); g.fillRect(px - 0.5, 12, 1, H - 18); // shadow edge
  // deco bracket scroll up to the lamp arm
  g.fillStyle(PAL.slate, 1); g.fillRoundedRect(px - 1, 9, 7, 2, 1);
  // hexagonal lantern cage holding the glow
  const hx = px + 5, hy = 7;
  g.fillStyle(0x2a2520, 1); g.fillPoints([
    { x: hx - 3, y: hy - 1 }, { x: hx, y: hy - 4 }, { x: hx + 3, y: hy - 1 },
    { x: hx + 3, y: hy + 3 }, { x: hx, y: hy + 6 }, { x: hx - 3, y: hy + 3 },
  ], true);
  g.fillStyle(PAL.lamp, 0.95); g.fillCircle(hx, hy + 1, 2.2); // warm glow pane
  g.lineStyle(1, PAL.brassDark, 0.8); g.strokeCircle(hx, hy + 1, 2.4); // brass cage ring
  g.generateTexture(TEX.lamppost, W, H);
  g.destroy();
}

// ── RTS-30b-ground: faction-neutral STATIC SET DRESSING (muted greys/browns/greens only) ───────
// The governing law: ambient scenery is atmosphere behind the instrument panel — never brass (player/
// money), never red (rival/danger). Drawn once, cached, blitted by the culled scene draw.

/** A deco street TREE — a soot-dark trunk + a muted two-tone canopy. Anchored at the base. */
function bakeTree(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.tree)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const W = 26, H = 34, cx = W / 2;
  g.fillStyle(PAL.sootDeep, 0.3); g.fillEllipse(cx, H - 2, 16, 5); // contact shadow
  g.fillStyle(0x3a2c20, 1); g.fillRect(cx - 1.5, H - 12, 3, 12); // trunk
  g.fillStyle(0x283626, 1); g.fillEllipse(cx, H - 17, 22, 18); // canopy (shadow tone)
  g.fillStyle(0x33442f, 1); g.fillEllipse(cx - 2, H - 19, 16, 13); // NW-lit canopy mass
  g.fillStyle(0x3c4e36, 0.8); g.fillEllipse(cx - 4, H - 22, 8, 7); // top highlight clump
  g.generateTexture(TEX.tree, W, H);
  g.destroy();
}

/** A cast-iron FIRE HYDRANT — dull iron, NOT rival-red (the law). Tiny. */
function bakeHydrant(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.hydrant)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const W = 10, H = 14, cx = W / 2;
  g.fillStyle(PAL.sootDeep, 0.3); g.fillEllipse(cx, H - 1, 8, 3);
  g.fillStyle(0x4a4036, 1); g.fillRoundedRect(cx - 2.5, 4, 5, 9, 1.5); // body
  g.fillStyle(0x5a5043, 1); g.fillRect(cx - 2.5, 4, 2, 9); // NW lit edge
  g.fillStyle(0x4a4036, 1); g.fillRect(cx - 4, 7, 8, 2); // side caps
  g.fillStyle(0x3a342e, 1); g.fillEllipse(cx, 3.5, 6, 3); // bonnet
  g.generateTexture(TEX.hydrant, W, H);
  g.destroy();
}

/** A civic MAILBOX — muted slate-blue civic box on a post (neutral, not federal-green/brass). */
function bakeMailbox(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.mailbox)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const W = 12, H = 16, cx = W / 2;
  g.fillStyle(PAL.sootDeep, 0.3); g.fillEllipse(cx, H - 1, 9, 3);
  g.fillStyle(0x2a2620, 1); g.fillRect(cx - 1, 8, 2, 7); // post
  g.fillStyle(0x3a4048, 1); g.fillRoundedRect(cx - 4, 3, 8, 7, 2); // domed body (slate)
  g.fillStyle(0x474f59, 1); g.fillRect(cx - 4, 3, 8, 2); // lit dome top
  g.fillStyle(PAL.sootDeep, 1); g.fillRect(cx - 3, 6.5, 6, 1.4); // letter slot
  g.generateTexture(TEX.mailbox, W, H);
  g.destroy();
}

/** A park/plaza BENCH — wood slats on iron legs, muted. Low + wide. */
function bakeBench(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.bench)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const W = 24, H = 14, cx = W / 2;
  g.fillStyle(PAL.sootDeep, 0.3); g.fillEllipse(cx, H - 1, 20, 4);
  g.fillStyle(0x2a2620, 1); g.fillRect(4, 7, 2, 6); g.fillRect(W - 6, 7, 2, 6); // iron legs
  g.fillStyle(0x4a3a2a, 1); g.fillRect(3, 6, W - 6, 2.4); // seat plank
  g.fillStyle(0x563f2c, 1); g.fillRect(3, 5.6, W - 6, 1); // lit plank edge
  g.fillStyle(0x4a3a2a, 1); g.fillRect(3, 1, W - 6, 2.2); // back rail
  g.fillStyle(0x2a2620, 1); g.fillRect(4, 1, 1.6, 5); g.fillRect(W - 5.6, 1, 1.6, 5); // back posts
  g.generateTexture(TEX.bench, W, H);
  g.destroy();
}

/** A low yard FENCE segment — a soot-iron picket row (yard-edge dressing). */
function bakeFence(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.fence)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const W = 44, H = 16;
  g.fillStyle(PAL.sootDeep, 0.25); g.fillEllipse(W / 2, H - 1, 40, 4);
  g.fillStyle(0x322a22, 1); g.fillRect(2, 9, W - 4, 1.6); // bottom rail
  g.fillStyle(0x322a22, 1); g.fillRect(2, 4, W - 4, 1.6); // top rail
  g.fillStyle(0x3a322a, 1);
  for (let x = 3; x < W - 3; x += 4) g.fillRect(x, 2, 1.4, 10); // pickets
  g.fillStyle(0x241c17, 1);
  for (let x = 3; x < W - 3; x += 4) g.fillRect(x + 1, 2, 0.5, 10); // shadow side
  g.generateTexture(TEX.fence, W, H);
  g.destroy();
}

// ── RTS-30 living-city Pass 1: ambient PEDESTRIANS + CARS (faction-neutral, muted, subordinate) ──
// THE GOVERNING LAW: muted greys/browns ONLY — never brass (player/money), never red (rival/danger).
// A pedestrian/taxi must be instantly distinguishable from a 56px brass thug or a rival-red unit:
// they are ~14–24px, flatter, lower-contrast, no accent/glow/badge.

/** The four muted civilian COAT tones (the law — civilian greys/browns, never accent colours). */
export const PED_COATS = [0x3a3733, 0x4a4036, 0x3a2c20, 0x5a5043] as const;

/** Baked texture key for a pedestrian coat variant + walk frame (2-frame leg tick). */
export function pedTexKey(coat: number, frameB: boolean): string {
  return `lcr_ped_${coat}_${frameB ? 'b' : 'a'}`;
}

/** A tiny ~14px "stick-with-mass" pedestrian: coat capsule + flesh head dot + a dark hat brim + two
 * leg ticks that alternate between the two frames. NO face — a background figure. Muted, flat. */
function bakePed(scene: Phaser.Scene, coatIdx: number, frameB: boolean): void {
  const key = pedTexKey(coatIdx, frameB);
  if (scene.textures.exists(key)) return;
  const coat = PED_COATS[coatIdx];
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const W = 12, H = 20, cx = W / 2;
  g.fillStyle(PAL.sootDeep, 0.25); g.fillEllipse(cx, H - 2, 8, 3); // contact shadow
  g.fillStyle(0x2a2620, 1); // leg ticks (alternating stance)
  if (frameB) { g.fillRect(cx - 1.6, H - 7, 1.6, 6); g.fillRect(cx + 0.2, H - 7, 1.6, 6); }
  else { g.fillRect(cx - 3, H - 7, 1.6, 6); g.fillRect(cx + 1.4, H - 7, 1.6, 6); }
  g.fillStyle(coat, 1); g.fillRoundedRect(cx - 3, H - 15, 6, 9, 2.4); // coat capsule (the mass)
  g.fillStyle(PAL.sootDeep, 0.35); g.fillRect(cx, H - 15, 3, 9); // SE shadow half (subtle)
  g.fillStyle(PAL.fleshDark, 1); g.fillCircle(cx, H - 16, 2.3); // head dot (muted flesh)
  g.fillStyle(PAL.ink, 1); g.fillEllipse(cx, H - 17.6, 5, 1.6); // hat brim
  g.generateTexture(key, W, H);
  g.destroy();
}

/** A simplified ~24px ambient car (much smaller/flatter than the 64px hero Cadillac): body + cabin +
 * window glint + 2 wheels + a faint warm headlamp. `taxi` adds a MUTED checker band (never yellow). */
function bakeCarLite(scene: Phaser.Scene, key: string, taxi: boolean): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const W = 26, H = 14;
  g.fillStyle(PAL.sootDeep, 0.35); g.fillEllipse(W / 2, H - 2, 22, 4); // shadow
  const body = taxi ? 0x2e2b27 : 0x23211e; // dull neutrals (taxi NOT yellow; civilian never rival-red)
  g.fillStyle(body, 1); g.fillRoundedRect(2, 5, 22, 6, 2.5); // body
  g.fillStyle(0x14110f, 1); g.fillRoundedRect(8, 2, 10, 5, 2); // cabin / roof
  g.fillStyle(PAL.glass, 1); g.fillRect(9, 3, 7, 2.4); // window glint band
  g.fillStyle(PAL.bone, 0.16); g.fillRect(9, 3, 7, 0.8); // 1px hi
  if (taxi) for (let i = 0; i < 8; i++) { g.fillStyle(i % 2 ? 0x4a4036 : 0x2e2b27, 1); g.fillRect(3 + i * 2.6, 8, 2.6, 1.8); } // muted checker
  g.fillStyle(PAL.sootDeep, 1); g.fillCircle(7, 11, 2.2); g.fillCircle(19, 11, 2.2); // wheels
  g.fillStyle(0x3a342e, 1); g.fillCircle(7, 11, 1); g.fillCircle(19, 11, 1);
  g.fillStyle(0x3a3733, 1); g.fillRect(23, 6.5, 2, 3.5); // front fender
  g.fillStyle(PAL.lamp, 0.85); g.fillCircle(24, 7.5, 1); // faint warm headlamp (warm, never danger)
  g.generateTexture(key, W, H);
  g.destroy();
}

// ── RTS-30c-2b: contextual ACTION ICONS (art-deco brass-line glyph on an aged-paper chip) ──────────
// ⭐ KEY DISCIPLINE: the violent verbs (attack/sabotage/demolish/assassinate) stay CALM brass-line — the
// danger lives in the motion beat on the board, NEVER in the static icon. No red, no gore in any glyph.
const ICON_PAPER = 0xe8e1ce; // aged paper field
export function actionIconKey(verb: string): string { return `lcr_icon_${verb}`; }
export const ACTION_ICON_VERBS = ['move', 'attack', 'extort', 'collect', 'patrol', 'sabotage', 'demolish', 'assassinate', 'raid', 'expand', 'recruit'] as const;

function bakeActionIcon(scene: Phaser.Scene, verb: (typeof ACTION_ICON_VERBS)[number]): void {
  const key = actionIconKey(verb);
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const S = 44, c = S / 2;
  // aged-paper chip with a 2px brass frame + stepped-deco corner notches + inner bevel
  g.fillStyle(ICON_PAPER, 1); g.fillRect(2, 2, S - 4, S - 4);
  g.lineStyle(2, PAL.brass, 1); g.strokeRect(2.5, 2.5, S - 5, S - 5);
  g.lineStyle(1, PAL.brassDark, 0.8); g.strokeRect(5.5, 5.5, S - 11, S - 11);
  g.fillStyle(PAL.brass, 1); // stepped corner ticks
  for (const [cx, cy] of [[3, 3], [S - 3, 3], [3, S - 3], [S - 3, S - 3]] as const) g.fillRect(cx - 1.5, cy - 1.5, 3, 3);
  // the brass-line glyph (deco primitives) — drawn centred ~24px
  g.lineStyle(2, PAL.brass, 1);
  const line = (x1: number, y1: number, x2: number, y2: number) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath(); };
  if (verb === 'move') { line(c - 8, c + 6, c + 6, c - 6); g.fillStyle(PAL.brass, 1); g.fillTriangle(c + 6, c - 8, c + 9, c - 3, c + 2, c - 4); g.fillCircle(c - 9, c + 8, 1.8); }
  else if (verb === 'attack') { line(c - 7, c - 7, c + 7, c + 7); line(c + 7, c - 7, c - 7, c + 7); g.fillStyle(PAL.brassHi, 1); g.fillCircle(c, c, 2); } // crossed chevrons (X strike)
  else if (verb === 'extort') { g.strokeCircle(c, c, 8); g.fillStyle(PAL.brass, 1); g.fillCircle(c - 3, c - 3, 1.6); g.fillCircle(c + 3, c + 3, 1.6); line(c + 4, c - 4, c - 4, c + 4); } // % coin
  else if (verb === 'collect') { g.strokeRect(c - 7, c - 2, 14, 9); line(c - 7, c + 1, c + 7, c + 1); g.fillStyle(PAL.brass, 1); g.fillTriangle(c, c - 10, c - 3, c - 5, c + 3, c - 5); } // satchel + down-arrow
  else if (verb === 'patrol') { g.strokeCircle(c, c, 8); g.fillStyle(PAL.brass, 1); g.fillTriangle(c + 8, c - 2, c + 11, c + 2, c + 5, c + 2); } // looping circuit arrow
  else if (verb === 'sabotage') { g.strokeCircle(c, c, 7); for (let a = 0; a < 6; a++) { const an = a * Math.PI / 3; line(c + Math.cos(an) * 7, c + Math.sin(an) * 7, c + Math.cos(an) * 10, c + Math.sin(an) * 10); } line(c - 4, c - 4, c + 4, c + 5); } // cracked gear
  else if (verb === 'demolish') { line(c, c - 9, c, c + 1); g.strokeRect(c - 5, c - 11, 10, 3); for (const a of [-1, 0, 1]) line(c, c + 1, c + a * 7, c + 9); } // plunger + deco shards
  else if (verb === 'assassinate') { g.strokeCircle(c, c, 7); line(c - 11, c, c - 4, c); line(c + 4, c, c + 11, c); line(c, c - 11, c, c - 4); line(c, c + 4, c, c + 11); g.fillStyle(PAL.brass, 1); g.fillCircle(c, c, 1.6); } // reticle
  else if (verb === 'raid') { line(c - 9, c, c + 5, c); g.fillStyle(PAL.brass, 1); g.fillTriangle(c + 5, c - 4, c + 9, c, c + 5, c + 4); g.lineStyle(2, PAL.brassDark, 1); line(c + 8, c - 9, c + 8, c + 9); } // arrow through a gate
  else if (verb === 'expand') { for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) { line(c, c, c + dx * 9, c + dy * 9); g.fillStyle(PAL.brass, 1); g.fillCircle(c + dx * 10, c + dy * 10, 1.8); } } // outward compass
  else { g.strokeCircle(c - 3, c - 4, 3.5); line(c - 3, c - 1, c - 3, c + 7); line(c - 7, c + 2, c + 1, c + 2); g.lineStyle(2, PAL.brassHi, 1); line(c + 6, c - 3, c + 6, c + 3); line(c + 3, c, c + 9, c); } // recruit: figure + '+'
  g.generateTexture(key, S, S);
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
    // collector: three satchel tiers (Light / Heavy / Stuffed) keyed to the carried cash
    for (const tier of [1, 2, 3]) {
      bakeFigureVariant(scene, `lcr_fig_collector_${f}_t${tier}`, rich, { role: 'collector', accent, accentDim, tier, lean: leanCollector });
    }
  }
  // legacy single-role keys (kept so any old reference still resolves)
  bakeFigureVariant(scene, TEX.thug, rich, { role: 'thug', accent: PAL.brass, accentDim: PAL.brassDim, lean: leanThug });
  bakeFigureVariant(scene, TEX.collector, rich, { role: 'collector', accent: PAL.brass, accentDim: PAL.brassDim, lean: leanCollector });
  bakeFigureVariant(scene, TEX.enforcer, rich, { role: 'thompson', accent: PAL.blood, accentDim: PAL.bloodDim, lean: leanThompson });
  bakeCar(scene, TEX.car, null, true); // neutral parked dressing
  bakeCar(scene, TEX.carPlayer, PAL.brass, false); // hero ride (brass coachline + hubs)
  bakeCar(scene, TEX.carRival, PAL.blood, false); // hero ride (blood coachline + hubs)
  bakeLamppost(scene);
  bakeTree(scene);
  bakeHydrant(scene);
  bakeMailbox(scene);
  bakeBench(scene);
  bakeFence(scene);
  // RTS-30 living-city Pass 1: 4 coats × 2 walk frames of pedestrian + the small car + the taxi.
  for (let c = 0; c < PED_COATS.length; c++) { bakePed(scene, c, false); bakePed(scene, c, true); }
  bakeCarLite(scene, TEX.carLite, false);
  bakeCarLite(scene, TEX.taxi, true);
  for (const t of ENFORCER_FIG_TIERS) bakeEnforcer(scene, t); // RTS-30c-2a weapon-tier silhouettes
  for (const v of ACTION_ICON_VERBS) bakeActionIcon(scene, v); // RTS-30c-2b deco action icons
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

export type BuildingKind = 'storefront' | 'speakeasy' | 'casino' | 'hq' | 'warehouse';

export interface BuildingStyle {
  kind: BuildingKind;
  wall: number;
  wallDark: number;
  roof: number;
  trim: number;
  height: number;
  windows: number; // window rows
  footHalfW?: number;
  footHalfH?: number;
}

// RTS-30c-scale — unit-to-world proportion fix (Design): KEEP the ~56px unit as the anchor, GROW the
// world. This multiplies a building's VERTICAL MASSING (height) only — the iso FOOTPRINT (hw/hh) is
// unchanged, so a building still sits on its parcel; it just rises to a real-street proportion. At MID:
// a 1-story storefront ≈ 190px (~3× the man), the HQ/casino ≈ 230–280px (~4–5×) — a man reads ~20–30%
// of a building, not a giant over a model village. Single tunable lever (re-tune on playtest).
export const ENV_HEIGHT_SCALE = 3.4;

export const BUILDING_STYLES: Record<string, BuildingStyle> = {
  storefront: { kind: 'storefront', wall: PAL.brickBase, wallDark: PAL.brickDark, roof: PAL.charcoal, trim: PAL.brass, height: 40, windows: 2 },
  speakeasy: { kind: 'speakeasy', wall: PAL.charcoal, wallDark: PAL.soot, roof: PAL.ink, trim: PAL.bloodDim, height: 34, windows: 1 },
  warehouse: { kind: 'warehouse', wall: PAL.slate, wallDark: PAL.charcoal, roof: PAL.charcoal, trim: PAL.fog, height: 30, windows: 1, footHalfW: 60, footHalfH: 30 },
  hq: { kind: 'hq', wall: PAL.charcoal, wallDark: PAL.soot, roof: PAL.brassDim, trim: PAL.brass, height: 66, windows: 3 },
  // RTS-26: the rts24 vice morph target — a taller, marquee-crowned CASINO (the speakeasy "upgraded"
  // silhouette). Visual only; the sim's viceRung drives when the scene swaps the style.
  casino: { kind: 'casino', wall: PAL.charcoal, wallDark: PAL.ink, roof: PAL.brassDim, trim: PAL.brass, height: 52, windows: 3 },
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
  opts: { rich?: boolean; lit?: boolean; sign?: number; faction?: 'player' | 'rival' } = {},
): { roofX: number; roofY: number; gfx: Phaser.GameObjects.Graphics } {
  const rich = opts.rich ?? richArt();
  const lit = opts.lit ?? true;
  const hw = style.footHalfW ?? 54;
  const hh = style.footHalfH ?? 27;
  // RTS-30c-scale: grow the VERTICAL massing (the whole facade — walls/windows/cornice/trim derive from
  // `h`, so they scale together); the footprint hw/hh stays so the building keeps its parcel.
  const h = style.height * ENV_HEIGHT_SCALE;
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
  if (rich) {
    // running-bond BRICK on the lit wall: mortar courses every ~5px + offset vertical ticks (texture)
    g.lineStyle(1, PAL.mortar, 0.35);
    for (let yy = cy - 4; yy > cy - h; yy -= 5) {
      g.beginPath(); g.moveTo(bBottom.x, yy + hh - 1); g.lineTo(bRight.x, yy - 1); g.strokePath();
    }
    g.lineStyle(1, PAL.mortar, 0.22);
    for (let f = 0.2; f < 1; f += 0.2) {
      const sx = bBottom.x + (bRight.x - bBottom.x) * f, sy = (bBottom.y - hh) + (bRight.y - (bBottom.y - hh)) * f;
      g.beginPath(); g.moveTo(sx, sy - h + 6); g.lineTo(sx, sy - 2); g.strokePath();
    }
    // soot streaks under the cornice
    g.fillStyle(PAL.sootDeep, 0.2); g.fillRect(cx + hw * 0.3, cy - h + 4, hw * 0.5, 4);
  } else {
    g.lineStyle(1, style.wallDark, 0.5);
    for (let i = 1; i < style.windows + 2; i++) {
      const yy = cy - (h * i) / (style.windows + 2);
      g.beginPath(); g.moveTo(bBottom.x, yy + hh); g.lineTo(bRight.x, yy); g.strokePath();
    }
  }

  // windows on the right wall — warm amber when lit, dead-dark when shut (the lit/shut read).
  // The speakeasy is discreet (no big windows); its read is the peephole + basement grate below.
  if (style.kind !== 'speakeasy') {
    for (let r = 0; r < style.windows; r++) {
      const wy = cy - h + 10 + r * ((h - 14) / Math.max(1, style.windows));
      g.fillStyle(lit ? PAL.glassGlow : PAL.glass, 1); g.fillRect(cx + hw * 0.42, wy, 8, 7);
      g.fillStyle(lit ? PAL.glassGlow : PAL.glass, 1); g.fillRect(cx + hw * 0.68, wy + 2, 8, 7);
      if (lit) { g.fillStyle(PAL.bone, 0.25); g.fillRect(cx + hw * 0.42, wy, 8, 1.5); g.fillRect(cx + hw * 0.68, wy + 2, 8, 1.5); } // warm sill hi
    }
  }

  // brass deco eave trim
  g.lineStyle(2, style.trim, 0.9);
  g.strokePoints([{ x: bTop.x, y: bTop.y - h }, { x: bRight.x, y: bRight.y - h }, { x: bBottom.x, y: bBottom.y - h }, { x: bLeft.x, y: bLeft.y - h }], true);
  g.fillStyle(PAL.ink, 1);
  g.fillRect(cx - 5, cy + hh - 16, 10, 16); // door at the front base

  if (rich) {
    // ── stepped art-deco CORNICE along the lit eave (two courses) ──
    g.fillStyle(style.trim, 0.85);
    g.fillPoints([{ x: bBottom.x, y: bBottom.y - h }, { x: bRight.x, y: bRight.y - h }, { x: bRight.x, y: bRight.y - h + 3 }, { x: bBottom.x, y: bBottom.y - h + 3 }], true);
    g.fillStyle(PAL.sootDeep, 0.5);
    g.fillPoints([{ x: bBottom.x, y: bBottom.y - h + 3 }, { x: bRight.x, y: bRight.y - h + 3 }, { x: bRight.x, y: bRight.y - h + 5 }, { x: bBottom.x, y: bBottom.y - h + 5 }], true);

    drawFacade(g, cx, cy, hw, hh, h, style, lit, opts.faction);
  }

  return { roofX: cx, roofY: cy - h - hh, gfx: g };
}

/** RTS-26 — the per-KIND deco facade drawn above the brick massing (and above the ownership plate):
 * storefront window+awning+shingle, speakeasy peephole+grate, casino marquee blade+bulb canopy, HQ
 * pilaster spine + torchères + faction crest. Lit/shut states drive the warm glows. */
function drawFacade(
  g: Phaser.GameObjects.Graphics,
  cx: number, cy: number, hw: number, hh: number, h: number,
  style: BuildingStyle, lit: boolean, faction?: 'player' | 'rival',
): void {
  const doorX = cx, doorY = cy + hh - 16;
  if (style.kind === 'storefront') {
    // big shop WINDOW (mullion cross) on the ground floor + a flat striped AWNING + hanging shingle
    g.fillStyle(lit ? PAL.glassGlow : PAL.glass, 1); g.fillRect(cx + 6, doorY - 2, 16, 12);
    g.lineStyle(1, PAL.brassDark, 0.8); g.beginPath();
    g.moveTo(cx + 14, doorY - 2); g.lineTo(cx + 14, doorY + 10); g.moveTo(cx + 6, doorY + 4); g.lineTo(cx + 22, doorY + 4); g.strokePath();
    if (lit) { g.fillStyle(PAL.glassGlow, 0.25); g.fillEllipse(cx + 14, cy + hh + 4, 26, 7); } // warm pavement spill
    const ay = doorY - 4;
    g.fillStyle(style.trim, 0.95); g.fillPoints([{ x: doorX - 10, y: ay }, { x: doorX + 10, y: ay }, { x: doorX + 13, y: ay + 6 }, { x: doorX - 13, y: ay + 6 }], true);
    g.fillStyle(PAL.sootDeep, 0.4); for (let s = -2; s <= 2; s++) g.fillRect(doorX + s * 5 - 0.8, ay, 1.6, 6);
    g.fillStyle(PAL.ink, 1); g.fillRect(cx - hw * 0.5, cy - h + 13, 13, 7); // shingle board on a deco bracket
    g.fillStyle(lit ? PAL.lamp : PAL.slate, lit ? 0.95 : 1); g.fillRect(cx - hw * 0.5 + 2, cy - h + 15, 9, 3);
  } else if (style.kind === 'speakeasy') {
    // discreet: a narrow recessed DOOR with a 4px brass-dark grilled PEEPHOLE (the recognition detail)
    g.fillStyle(PAL.sootDeep, 1); g.fillRect(doorX - 4, doorY - 2, 8, 16); // recessed dark doorway
    g.lineStyle(1, style.trim, 0.7); g.strokeRect(doorX - 5, doorY - 3, 10, 17); // subtle deco doorframe
    g.fillStyle(PAL.brassDark, 1); g.fillCircle(doorX, doorY + 3, 2.2); // peephole housing
    g.fillStyle(lit ? PAL.lamp : PAL.sootDeep, 1); g.fillCircle(doorX, doorY + 3, 1); // peephole glow when lit
    if (lit) { g.fillStyle(PAL.glassGlow, 0.3); g.fillRect(cx + 4, cy + hh - 3, hw * 0.5, 2.5); } // basement grate leak
    g.fillStyle(PAL.slate, 1); g.fillRect(cx - hw * 0.5, cy - h + 16, 12, 5); // contradicting legit sign
  } else if (style.kind === 'casino') {
    // tall deco BLADE SIGN off the corner + a bulb-lined marquee canopy + chevron inlays
    const bx = cx + hw - 6, byTop = cy - h - 12;
    g.fillStyle(style.trim, 1); g.fillRect(bx - 3, byTop, 6, h * 0.7); // brass blade frame
    g.fillStyle(PAL.sootDeep, 1); g.fillRect(bx - 1.5, byTop + 2, 3, h * 0.7 - 4); // letter channel
    g.fillStyle(lit ? PAL.lamp : PAL.slate, 1); for (let i = 0; i < 4; i++) g.fillRect(bx - 1, byTop + 4 + i * 5, 2, 2.5); // stacked letters
    g.fillStyle(style.trim, 1); g.fillTriangle(bx - 4, byTop, bx + 4, byTop, bx, byTop - 5); // ziggurat finial
    // bulb-lined marquee canopy over the entrance
    const my = doorY - 5;
    g.fillStyle(PAL.brassDark, 1); g.fillRect(cx - 14, my, 28, 4);
    for (let i = 0; i < 7; i++) { g.fillStyle(lit ? PAL.lamp : PAL.slate, 1); g.fillCircle(cx - 12 + i * 4, my + 5.5, 1.4); }
    if (lit) { g.fillStyle(PAL.glassGlow, 0.3); g.fillEllipse(cx, cy + hh + 5, 34, 9); } // big street spill
    g.lineStyle(1, style.trim, 0.6); // deco chevron inlays
    for (let i = 0; i < 2; i++) { const yy = cy - h + 18 + i * 10; g.beginPath(); g.moveTo(cx + 6, yy + 4); g.lineTo(cx + 12, yy); g.lineTo(cx + 18, yy + 4); g.strokePath(); }
  } else if (style.kind === 'hq') {
    // the proudest seat: a central pilaster SPINE + flanking torchère lamps + a faction CREST
    const crest = faction === 'player' ? PAL.brass : faction === 'rival' ? PAL.blood : style.trim;
    g.fillStyle(style.trim, 0.85); g.fillRect(cx + hw * 0.5, cy - h + 6, 5, h - 18); // pilaster spine
    g.fillStyle(PAL.brass, 1); // stepped brass crown cornice cap
    g.fillRect(cx - 8, cy - h - 3, 16, 3);
    g.fillRect(cx - 5, cy - h - 6, 10, 3);
    for (const sx of [cx - 9, cx + 9]) { // two flanking torchère lamps
      g.fillStyle(PAL.brassDark, 1); g.fillRect(sx - 1, doorY - 8, 2, 8);
      g.fillStyle(lit ? PAL.lamp : PAL.slate, lit ? 0.95 : 1); g.fillCircle(sx, doorY - 9, 2.4);
    }
    g.fillStyle(PAL.brass, 1); g.fillRect(doorX - 6, doorY - 3, 12, 17); // grand brass door surround
    g.fillStyle(PAL.sootDeep, 1); g.fillRect(doorX - 4, doorY - 1, 8, 15);
    g.fillStyle(crest, 1); g.fillTriangle(doorX, doorY - 9, doorX - 4, doorY - 4, doorX + 4, doorY - 4); // faction crest plate
  }
}
