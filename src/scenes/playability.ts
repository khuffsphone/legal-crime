// RTS-28 — pure (Phaser-free) playability helpers: the real-time clock-speed control, the skip-week
// math, the collector-cap rule, and feature-flag parsing. Kept pure so they're unit-tested; the
// scene just applies them. NO economy logic here — only how fast real-time advances + UX caps.

export const TIME_SCALES = [1, 2, 4] as const;
export type TimeScale = (typeof TIME_SCALES)[number];

/** Cycle the fast-forward multiplier 1× → 2× → 4× → 1×. */
export function nextTimeScale(cur: number): TimeScale {
  const i = TIME_SCALES.indexOf(cur as TimeScale);
  return TIME_SCALES[(i + 1) % TIME_SCALES.length];
}

/** The real dt to feed the sim this frame, scaled by the fast-forward multiplier (≥1×). */
export function scaledDt(dtSeconds: number, timeScale: number): number {
  return Math.max(0, dtSeconds) * Math.max(1, timeScale);
}

/** The dt that advances exactly to the NEXT week boundary (for the SKIP-WEEK control) — fires one
 * settlement, never multiple. `weekElapsed` is the seconds already accumulated into the week. */
export function skipWeekDt(weekElapsed: number, weekDuration: number): number {
  if (!(weekDuration > 0)) return 0;
  const remain = weekDuration - weekElapsed;
  return (remain > 0 ? remain : weekDuration) + 1e-4;
}

/** A feature toggle from a query string: ON unless explicitly turned off (off/0/false/no). Default on. */
export function flagEnabled(search: string, key: string): boolean {
  let v: string | null = null;
  try { v = new URLSearchParams(search).get(key); } catch { v = null; }
  if (v === null) return true;
  return !['off', '0', 'false', 'no'].includes(v.toLowerCase());
}

/** The collector cap (RTS-28 [T] anti-spam): at most ONE route collector per family. */
export const MAX_ROUTE_COLLECTORS = 1;
export function canAddRouteCollector(existingRouteCollectors: number): boolean {
  return existingRouteCollectors < MAX_ROUTE_COLLECTORS;
}
