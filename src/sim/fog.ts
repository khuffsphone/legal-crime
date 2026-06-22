// RTS-29 — FOG OF WAR (pure reveal math). No Phaser, no DOM: the scene holds a FogState and renders a
// soot veil over the unrevealed tiles; this module just decides WHICH tiles are revealed and returns
// the INCREMENTAL delta so the renderer only redraws what changed (never a per-frame full sweep).
// Rivals sit beyond the fog (not drawn) until first contact.

/** Revealed tiles, keyed "gx,gy". A plain Set so it is cheap, serializable, and pure to test. */
export type FogState = Set<string>;

export function createFog(): FogState {
  return new Set<string>();
}

export function tileKey(gx: number, gy: number): string {
  return `${Math.round(gx)},${Math.round(gy)}`;
}

/** Whether a tile has been revealed. */
export function isRevealed(fog: FogState, gx: number, gy: number): boolean {
  return fog.has(tileKey(gx, gy));
}

/** Reveal every in-bounds tile within `radius` (Euclidean) of (cx, cy). Mutates `fog` and returns
 * the keys NEWLY revealed this call (empty when nothing changed) — the renderer's incremental delta. */
export function revealAround(
  fog: FogState, cx: number, cy: number, radius: number, cols: number, rows: number,
): string[] {
  const newly: string[] = [];
  const r = Math.max(0, radius);
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(cols - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(rows - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let gx = minX; gx <= maxX; gx++) {
    for (let gy = minY; gy <= maxY; gy++) {
      const dx = gx - cx, dy = gy - cy;
      if (dx * dx + dy * dy > r2) continue;
      const key = `${gx},${gy}`;
      if (!fog.has(key)) { fog.add(key); newly.push(key); }
    }
  }
  return newly;
}

/** How many tiles are revealed (for a progress read / tests). */
export function revealedCount(fog: FogState): number {
  return fog.size;
}

/** DEBUG (?reveal=1): parse the reveal-all flag from a query string. Pure + testable; default off so
 * normal play keeps the fog. Empty / malformed / absent ⇒ false. */
export function revealAllRequested(search: string): boolean {
  if (!search) return false;
  try {
    return new URLSearchParams(search).get('reveal') === '1';
  } catch {
    return false;
  }
}

/** DEBUG (?reveal=1): lift the fog over the WHOLE map so the full sparse city is inspectable. Mutates
 * `fog`; returns the count of tiles now revealed. */
export function revealAll(fog: FogState, cols: number, rows: number): number {
  for (let gx = 0; gx < cols; gx++) for (let gy = 0; gy < rows; gy++) fog.add(`${gx},${gy}`);
  return fog.size;
}
