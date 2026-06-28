// SPRITE SPIKE (BRASSMERE — one-sprite exception) — a REVERSIBLE probe: render ONE drawn sprite as the
// THUG unit's visual, STATIC idle only, behind a flag, with the procedural figure (the RTS-32 rig) kept as
// the fallback. The whole feature is OFF unless `?sprites` is present, so a normal/production boot is
// visually unchanged (CANON's procedural-vector direction holds by default). Pure & Phaser-free so the
// flag + the skin decision are unit-tested at the logic level; the scene owns the actual draw.
//
// COLOR-LANGUAGE: the sprite is monochrome ink — friend/foe is carried by the existing tinted BASE-PLATE
// (the faction ring/shadow drawn UNDER the unit: player brass, rival blood-red, downed desaturate, danger
// motion-only). The sprite is never recolored. NO-X-RAY: the skin reuses the unit's existing sprite object
// and the existing occlusion/fog pipeline, so a rival sprite + plate render ONLY when revealed — identical
// gating to the procedural figure (the skin changes the TEXTURE + SCALE, never the visibility/reveal rule).

/** Texture key for the spike thug sprite (kept distinct from BootScene's manifest keys so that scene is
 *  untouched). */
export const SPRITE_THUG_KEY = 'lcr_sprite_thug';

/** Public path Phaser loads the sprite from (served from /public). Loaded ONLY when the flag is on. */
export const SPRITE_THUG_PATH = 'sprites/thug.png';

/** The prepared PNG's native height in px (Design cutout: 214×240, feet at bottom-center). */
export const SPRITE_THUG_NATIVE_H = 240;

/** On-screen scale: brings the 240px native down to ~65px tall so it sits at the same read as the ~56–64px
 *  procedural figure on the iso board. Tuned against the live frame; the foot anchor keeps it on-tile. */
export const SPRITE_THUG_SCALE = 0.27;

/** Vertical origin: the figure's FEET sit at the very bottom of the trimmed PNG → anchor near 1.0 so the
 *  feet land on the tile (matching the procedural figure's foot anchor). Horizontally feet-centered (0.5). */
export const SPRITE_THUG_ORIGIN_Y = 0.98;

/** Default for the spike flag: OFF — production/normal boots keep the procedural figure unchanged. */
export const SPRITES_DEFAULT = false;

/**
 * Parse the `?sprites` feature flag from a URL query string. `?sprites`, `?sprites=on|1|true|yes` → ON;
 * `?sprites=off|0|false|no` → OFF; absent → SPRITES_DEFAULT (off). Case-insensitive. Pure. Not dev-gated:
 * the flag is OFF by default, so it can be flipped to judge the spike in any build without changing the
 * default production visuals.
 */
export function parseSpritesFlag(search: string): boolean {
  if (!search) return SPRITES_DEFAULT;
  const p = new URLSearchParams(search);
  if (!p.has('sprites')) return SPRITES_DEFAULT;
  const v = (p.get('sprites') ?? '').toLowerCase();
  if (v === '' || v === 'on' || v === '1' || v === 'true' || v === 'yes') return true;
  if (v === 'off' || v === '0' || v === 'false' || v === 'no') return false;
  return SPRITES_DEFAULT; // unrecognised value → the safe default
}

/**
 * THE SKIN DECISION (per unit): use the thug sprite for this unit iff the flag is ON, the unit is a plain
 * rigged thug (a button-man — the same set that gets the procedural rig; weapon enforcers & collectors keep
 * their baked silhouettes), AND the texture actually loaded. Any false → the procedural figure renders
 * (the fallback). Pure — no Phaser, no globals; the scene passes the three facts in.
 */
export function usesThugSprite(flagOn: boolean, isRiggedThug: boolean, textureLoaded: boolean): boolean {
  return flagOn && isRiggedThug && textureLoaded;
}
