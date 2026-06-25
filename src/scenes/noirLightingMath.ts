// POLISH-PASS v2 · PACKAGE 1 — NOIR LIGHTING (pure math; Phaser-free, render-side helper). The renderer
// (IsoScene.drawSetDressing / relightBuilding) feeds these numbers into the EXISTING baked TEX.glow pools
// + window tints — this module owns only the falloff/tint MATH so it is unit-tested without pixels.
//
// CANON HELD: the game has DISTRICT CONTROL ONLY — ownership windows read a district's HOLDER, never an
// invented per-building owner. Day→night stays OFF (fixed-night noir). Danger reds (#E11D1D/#FF5A2C) are
// MOTION-only and never appear here; rival windows are the STATIC rival identity #9E1B1B, COOLED + subtle,
// never a bright alarm-red. Player = brass/gold.

/** RTS-34 fix: the streetlamp pool seeded at ~0.15 read as "faint lamp". The noir night wants a real
 * pool of warm light — seed the PEAK alpha at 0.31 (still well under a blown-out highlight). */
export const LAMP_SEED_ALPHA = 0.31;

/** The wet-asphalt sheen is a faint tinted streak, not a real reflection — its peak alpha is gentler than
 * the lamp pool so it reads as a damp sheen, not a second light. */
export const WET_SHEEN_SEED_ALPHA = 0.12;

/** Day→night cycle is OFF this pass — a single fixed-night mood (no time-of-day lerp). */
export const NIGHT_ONLY = true as const;

/** Rival ownership windows must stay NOIR-SUBTLE — a cooled blood-red glow, never a bright alarm. This
 * caps their tint alpha so the renderer can never crank them into a danger-read. */
export const RIVAL_WINDOW_MAX_ALPHA = 0.16;
/** Player ownership windows read brass-warm (the player identity), a touch stronger than rival. */
export const PLAYER_WINDOW_MAX_ALPHA = 0.24;

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/**
 * Streetlamp radial falloff: a soft quadratic (1 − r/R)² profile scaled by the seed peak alpha. Returns
 * the alpha to apply to the baked glow pool at `distPx` from the lamp (peak = seedAlpha at the centre,
 * 0 at/beyond the radius). Pure + monot_non-increasing in distance.
 */
export function lampFalloff(distPx: number, radiusPx: number, seedAlpha: number = LAMP_SEED_ALPHA): number {
  if (radiusPx <= 0) return 0;
  const r = clamp(distPx / radiusPx, 0, 1);
  const soft = (1 - r) * (1 - r);
  return clamp(seedAlpha * soft, 0, seedAlpha);
}

/**
 * Wet-asphalt sheen alpha under a lamp — a gentler, slightly longer-reaching falloff than the lamp pool
 * (so the damp ground reads as a faint smear of the light, not a mirror). Pure; capped at the sheen seed.
 */
export function wetSheenAlpha(distPx: number, radiusPx: number, seedAlpha: number = WET_SHEEN_SEED_ALPHA): number {
  if (radiusPx <= 0) return 0;
  const r = clamp(distPx / radiusPx, 0, 1);
  // a softer shoulder (linear-ish core, quick tail) so the streak lingers a bit past the bright pool
  const soft = (1 - r) * (1 - r * r);
  return clamp(seedAlpha * soft, 0, seedAlpha);
}

export interface WindowTint {
  /** Hex string the renderer tints the window glow with (brass for the player, cooled #9E1B1B for a rival). */
  color: string;
  /** Tint alpha — capped per faction so rival windows can never read as a bright alarm. */
  alpha: number;
}

/**
 * The ownership window tint for a building, derived from its DISTRICT's controlling family (CANON: district
 * control only — there are NO per-building owners). `holder` is the district holder id (undefined ⇒ neutral
 * or contested → no ownership tint, the building keeps its default warm windows). The player's blocks glow
 * brass-warm; a rival's glow a COOLED, subtle blood-red (#9E1B1B), never a bright danger-red. Pure.
 */
export function ownershipWindowTint(holder: string | undefined, playerId: string): WindowTint | null {
  if (!holder) return null;
  if (holder === playerId) return { color: '#E3C36A', alpha: PLAYER_WINDOW_MAX_ALPHA };
  return { color: '#9E1B1B', alpha: RIVAL_WINDOW_MAX_ALPHA };
}
