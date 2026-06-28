// SPRITE SPIKE (thug) — a deliberate ONE-OFF, fully reversible probe that swaps the procedural thug rig for a
// single STATIC drawn sprite, behind a flag, with the procedural figure as the fallback. PURE & Phaser-free
// (so the flag/scale/plate decisions are unit-tested): the scene reads these to decide what to draw.
//
// Default OFF — nothing changes unless ?sprites is present. NO-X-RAY is untouched: the sprite reuses the unit's
// existing occlusion/fog gating (it renders only when the procedural figure would), so a hidden rival stays
// hidden. The monochrome sprite is NEVER recolored; the friend/foe colour rides the base-plate (spritePlateColor).

/** Texture cache key + served URL (the normal asset pipeline; missing → graceful procedural fallback). */
export const THUG_SPRITE_KEY = 'thug_idle';
export const THUG_SPRITE_URL = 'assets/units/thug_idle.png';
/** Native height of the prepared PNG (226x258, foot anchor bottom-center). */
export const THUG_SPRITE_NATIVE_H = 258;
/** Canon on-tile figure height the procedural rig draws to (~56px) — the matched default sprite height. */
export const FIGURE_TARGET_H = 56;

/** Scale knob bounds (?spritescale) so larger sizes can be probed in-engine without a rebuild. */
export const SPRITE_SCALE_MIN = 0.25;
export const SPRITE_SCALE_MAX = 6;

export interface SpriteFlags {
  /** Render the thug as the drawn sprite instead of the procedural rig. */
  thugSprite: boolean;
  /** Multiplier on the matched figure height (1 = matched ~56px). */
  scale: number;
}

/**
 * Parse the sprite flags from a URL query string. `?sprites` turns the thug sprite ON (default OFF — absent or
 * an explicit off/0/false/no keeps it off); `?spritescale=N` sets the render scale (clamped; default 1). Pure.
 */
export function parseSpriteFlags(search: string): SpriteFlags {
  let p: URLSearchParams;
  try { p = new URLSearchParams(search); } catch { p = new URLSearchParams(); }
  const s = p.get('sprites');
  const thugSprite = s !== null && !['off', '0', 'false', 'no'].includes(s.toLowerCase());
  const raw = Number(p.get('spritescale'));
  const scale = Number.isFinite(raw) && raw > 0
    ? Math.min(SPRITE_SCALE_MAX, Math.max(SPRITE_SCALE_MIN, raw))
    : 1;
  return { thugSprite, scale };
}

export type ThugRenderMode = 'sprite' | 'procedural';

/**
 * Which render path a thug should use: 'sprite' only when the flag is on AND the texture actually loaded
 * (so a missing/failed asset always falls back to the procedural figure — the spike can never blank a unit).
 * Pure.
 */
export function thugRenderMode(flags: SpriteFlags, textureReady: boolean): ThugRenderMode {
  return flags.thugSprite && textureReady ? 'sprite' : 'procedural';
}

/** The sprite's on-tile display height = matched figure height × the scale knob. Pure. */
export function spriteDisplayHeight(scale: number): number {
  return FIGURE_TARGET_H * scale;
}

/** The uniform scale factor to apply to the native texture so it renders at `displayH`. Pure. */
export function spriteScaleFactor(nativeH: number, displayH: number): number {
  return displayH / nativeH;
}

// ── base-plate colour (the plate carries faction colour; the sprite is never recolored) ──────────────────
/** Player BRASS (#B8862B). */
export const PLATE_PLAYER = 0xb8862b;
/** Rival STATIC blood-red (#9E1B1B) — identity, not danger. */
export const PLATE_RIVAL = 0x9e1b1b;
/** Downed body gray (#6A6660) — desaturated; downed NEVER reads rival-red (canon). */
export const PLATE_DOWNED = 0x6a6660;

/**
 * The base-plate tint under a thug: player brass, rival static blood-red, and — when downed — a desaturated
 * gray (never rival-red, never a danger-red). The danger reds stay motion-only elsewhere. Pure.
 */
export function spritePlateColor(faction: 'player' | 'rival', downed: boolean): number {
  if (downed) return PLATE_DOWNED;
  return faction === 'player' ? PLATE_PLAYER : PLATE_RIVAL;
}
