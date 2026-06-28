// unitSpriteState.ts — PURE flag + animation-state logic for the sprite-sheet view. No Phaser.
//
// ?sprites is OPT-IN (default OFF): the procedural figure stays authoritative; the sheet is a presentation
// swap you turn ON to A/B. This mirrors the established query-flag idioms (artMode/fog) but defaults off
// because it's an experimental art path, not a normal toggle.

export type UnitSpriteAction = 'idle' | 'walk' | 'attack';

const TRUTHY = new Set(['', '1', 'on', 'true', 'yes', 'sprites']);
const FALSY = new Set(['0', 'off', 'false', 'no']);

/**
 * ?sprites opt-in. ON for `?sprites`, `?sprites=1|on|true|yes`; OFF when absent or `?sprites=0|off|false|no`.
 * Pure & total — a malformed search string yields OFF.
 */
export function spritesRequested(search: string): boolean {
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(search).get('sprites');
  } catch {
    return false;
  }
  if (raw === null) return false;
  const v = raw.toLowerCase();
  if (FALSY.has(v)) return false;
  return TRUTHY.has(v) || true; // any other non-falsy value still opts in
}

/** Optional ?spritescale=N display-scale multiplier (clamped). Default 1. */
export function spriteScaleParam(search: string, min = 0.25, max = 6): number {
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(search).get('spritescale');
  } catch {
    return 1;
  }
  if (raw === null) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(min, Math.min(max, n));
}

/**
 * Pick the action clip for a unit's live state. Attack wins (one-shot); otherwise moving → walk, still →
 * idle. `loco` (0..2 idle/walk/run) folds RUN into walk for this 3-clip placeholder.
 */
export function actionForState(opts: { attacking: boolean; moving: boolean; loco: number }): UnitSpriteAction {
  if (opts.attacking) return 'attack';
  if (opts.moving || opts.loco >= 0.5) return 'walk';
  return 'idle';
}

/**
 * Phaser display scale to map the rendered figure height (px, from the manifest) to the game's on-screen
 * unit height (FIGURE_PX), times the optional ?spritescale knob.
 */
export function spriteDisplayScale(figurePxH: number, figureTargetPx: number, scaleParam = 1): number {
  if (!(figurePxH > 0)) return scaleParam;
  return (figureTargetPx / figurePxH) * scaleParam;
}
