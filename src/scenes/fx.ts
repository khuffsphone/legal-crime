// RTS-34 — pure (Phaser-free, DOM-free) helpers for the "make it beautiful" pass, kept out of the
// Phaser scene so they're unit-testable: the top-bar cash COUNT-UP easing and the WIN/LOSS COMPASS
// (fastest win path + top threat). Mirrors audioMap.ts / gait.ts — the scene renders what these return.

import { winPaths } from '../sim/winpaths';
import { victoryProximity } from '../sim/endgame';
import { TURF_DOMINANCE } from '../sim/constants';
import type { GameState } from '../sim';

// ── cash juice — a number that ROLLS toward its target instead of snapping ───────────────────────
/** Ease a displayed number toward its target by an exponential approach (frame-rate independent).
 * `ratePerSec` ≈ fraction of the remaining gap closed per second. Snaps the last cent so it always
 * LANDS exactly on the target (no asymptotic crawl that never reads as "arrived"). Pure. */
export function rollToward(shown: number, target: number, dtMs: number, ratePerSec = 6): number {
  if (shown === target) return target;
  const k = 1 - Math.exp(-Math.max(0, dtMs / 1000) * ratePerSec);
  const next = shown + (target - shown) * k;
  // land exactly once we're within a dollar (so "+$X BANKED" resolves to the real number)
  return Math.abs(target - next) < 1 ? target : next;
}

// ── the win/loss compass — where am I heading, what's coming for me ──────────────────────────────
export interface Compass {
  /** The win path closest to done (the fastest road), named + its 0..100 progress. */
  pathLabel: string;
  pathPct: number;
  /** The looming threat (a rival taking the city / your HQ failing), one-liner. */
  threatLabel: string;
  threatUrgent: boolean;
  /** A single compact readout the HUD prints. */
  line: string;
}

/** A compact "fastest win path + top threat" readout so the player always knows where they're heading
 * and what's coming for them. Reads the EXISTING win-path + proximity helpers; never mutates. Pure. */
export function winLossCompass(state: GameState): Compass {
  const paths = winPaths(state);
  const best = paths.reduce((a, b) => (b.pct > a.pct ? b : a), paths[0]);
  const vp = victoryProximity(state);
  const leaderIsRival = vp.leaderId !== state.player.id;

  let threatLabel: string;
  let threatUrgent: boolean;
  if (leaderIsRival && vp.leaderHeld > 0) {
    const need = Math.max(1, Math.ceil(TURF_DOMINANCE * vp.total) - vp.leaderHeld);
    threatLabel = `${vp.leaderName} leads ${vp.leaderHeld}/${vp.total} — ${need} from the city`;
    threatUrgent = need <= 2 || vp.playerLosePct >= 50;
  } else if (vp.playerLosePct >= 40) {
    threatLabel = `your HQ is failing — ${vp.playerLosePct}% to ruin`;
    threatUrgent = true;
  } else {
    threatLabel = 'no rival holds the city — press your lead';
    threatUrgent = false;
  }

  const line = `▸ ${best.label} ${best.pct}%   ·   ${threatUrgent ? '⚠ ' : ''}${threatLabel}`;
  return { pathLabel: best.label, pathPct: best.pct, threatLabel, threatUrgent, line };
}

// ── fog-gate for ambient life (peds/cars only show on revealed ground) ───────────────────────────
/** Whether an ambient agent at (gx,gy) should be DRAWN: only on a tile the player has revealed (so
 * peds/cars no longer wander through the fog). `reveal` is the scene's revealed-tile predicate;
 * undefined ⇒ always shown (e.g. ?reveal=1 lifts the fog). Pure. */
export function ambientShown(reveal: ((gx: number, gy: number) => boolean) | undefined, gx: number, gy: number): boolean {
  return !reveal || reveal(Math.round(gx), Math.round(gy));
}

