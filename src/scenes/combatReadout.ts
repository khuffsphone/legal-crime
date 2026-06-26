// COMBAT READABILITY — health-bar VIEW math (pure; Phaser-free, render-side). The 35a health model is real
// but INVISIBLE (no bar). This owns the small decisions the renderer needs — read the lazy health safely,
// the 0..1 fraction the bar fills to, and WHEN to show the bar — so they're unit-tested without pixels.
//
// RESTRAINT: the bar shows ONLY when it matters (the unit has taken damage OR is actively in combat) and is
// hidden at full health out of combat, so the noir board never clutters with bars over idle thugs.

import { unitHealth } from './../sim/combat';
import { THUG_MAX_HEALTH } from './../sim/constants';
import type { MovableUnit } from './../sim/movement';

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** The unit's 0..1 health fraction (reads the LAZY health field safely — absent ⇒ full). Pure. */
export function healthFraction(u: MovableUnit): number {
  return clamp01(unitHealth(u) / THUG_MAX_HEALTH);
}

/** Whether the unit has taken any damage (health below full). Pure. */
export function isDamaged(u: MovableUnit): boolean {
  return healthFraction(u) < 1;
}

/** Show the health bar ONLY when it matters: the unit has taken damage OR is actively in combat — and is
 * not already downed. Hidden at full health out of combat (the restraint rule). Pure. */
export function shouldShowHealthBar(u: MovableUnit, inCombat: boolean): boolean {
  return !u.downed && (isDamaged(u) || inCombat);
}

/** A low-health unit (≤ 1/3) — the renderer can flash the bar to a warning read. Pure. */
export function isCritical(u: MovableUnit): boolean {
  return healthFraction(u) <= 1 / 3;
}
