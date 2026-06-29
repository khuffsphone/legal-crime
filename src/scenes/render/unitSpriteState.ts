// unitSpriteState.ts — PURE flag + animation-state logic for the sprite-sheet view. No Phaser.
//
// ?sprites is OPT-IN (default OFF): the procedural figure stays authoritative; the sheet is a presentation
// swap you turn ON to A/B. This mirrors the established query-flag idioms (artMode/fog) but defaults off
// because it's an experimental art path, not a normal toggle.

export type UnitSpriteAction = 'idle' | 'walk' | 'run' | 'hurt' | 'attack';

/**
 * Graceful fallback chain per action → what to play if the desired clip wasn't rendered yet. `idle` is the
 * CORE clip (always present once sprites are ready), so every chain bottoms out there. This is what lets the
 * REAL render ship with only idle+walk (no attack/run/hurt yet) and still drive cleanly — an attack falls
 * back to idle, a run to walk — until K renders those clips. Pure data.
 */
export const ACTION_FALLBACK: Readonly<Record<UnitSpriteAction, readonly UnitSpriteAction[]>> = {
  idle: ['idle'],
  walk: ['walk', 'idle'],
  run: ['run', 'walk', 'idle'],
  hurt: ['hurt', 'walk', 'idle'],
  attack: ['attack', 'idle'],
};

/**
 * Resolve a desired action to one that is actually AVAILABLE (a rendered + registered clip) by walking the
 * fallback chain; returns the first available link, else 'idle'. Pure.
 */
export function resolvePlayableAction(desired: UnitSpriteAction, available: ReadonlySet<string>): UnitSpriteAction {
  for (const a of ACTION_FALLBACK[desired] ?? ['idle']) {
    if (available.has(a)) return a;
  }
  return 'idle';
}

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
 * Pick the DESIRED action clip for a unit's live state (before availability fallback). Attack wins (one-shot);
 * then a flagged hurt state; then `loco` (0..2 idle/walk/run): run at ≥1.5, walk at ≥0.5, else idle. The
 * caller passes the result through resolvePlayableAction() so a not-yet-rendered clip degrades gracefully
 * (run→walk→idle, attack/hurt→idle). `hurt` defaults false (no hurt trigger is wired in the scene yet — the
 * clip is supported end-to-end and ready for a future state to set this).
 */
export function actionForState(opts: { attacking: boolean; moving: boolean; loco: number; hurt?: boolean }): UnitSpriteAction {
  if (opts.attacking) return 'attack';
  if (opts.hurt) return 'hurt';
  if (opts.loco >= 1.5) return 'run';
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
