// INFO-FEEDBACK — SCREEN-EDGE ALERT geometry (pure; Phaser-free). An off-screen event gets a marker clamped
// to the viewport edge with an arrow pointing TOWARD it; an on-screen event needs no edge marker. Works in
// SCREEN space (the caller projects the event's world tile → screen px first). The danger pulse + click-to-
// jump live in the renderer; this owns only the clamp + direction math so it's unit-tested.

export interface EdgeMarker {
  /** Clamped marker position (screen px). Equals the event position when it is on-screen. */
  x: number;
  y: number;
  /** Direction toward the event (radians; atan2(dy,dx) from screen centre). */
  angleRad: number;
  /** True when the event is already within the (inset) viewport — no edge marker needed. */
  onScreen: boolean;
}

/**
 * Clamp an event's screen position to the viewport edge (inset by `margin`) along the ray from the screen
 * centre, with an arrow angle pointing at the event. An on-screen event returns onScreen=true at its own
 * position. Pure.
 */
export function edgeAlertMarker(px: number, py: number, width: number, height: number, margin = 28): EdgeMarker {
  const cx = width / 2, cy = height / 2;
  const dx = px - cx, dy = py - cy;
  const angleRad = Math.atan2(dy, dx);
  const onScreen = px >= margin && px <= width - margin && py >= margin && py <= height - margin;
  if (onScreen) return { x: px, y: py, angleRad, onScreen: true };
  const halfW = Math.max(1, width / 2 - margin), halfH = Math.max(1, height / 2 - margin);
  const sx = dx !== 0 ? halfW / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const sy = dy !== 0 ? halfH / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const s = Math.max(0, Math.min(sx, sy));
  return { x: cx + dx * s, y: cy + dy * s, angleRad, onScreen: false };
}
