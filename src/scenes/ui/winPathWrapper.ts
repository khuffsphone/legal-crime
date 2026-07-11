// PLAYER SPINE — Ticket 3. Win-path selector PRESENTATION wrapper. Wraps the EXISTING pure progress
// selectors (dominationProgress / goStraightProgress / mayorProgress in winpaths.ts) into screen-ready
// cards: an honest label, pct, a one-line plain-language read, a source-breakdown TOOLTIP, and the detail
// screen each card drills into. It invents NO win logic and NEVER mutates — winpaths.ts is untouched, every
// number comes straight off the underlying WinPathProgress. Pure & Phaser-free.
//
// HONEST DEPTH (recon note): Political Capture (mayor / GET ELECTED) is surfaced as a FULL progress readout,
// same shape and prominence as the other two — it is NOT hidden or downranked. It carries a `note` marking
// it an early-depth system so the readout is honest about its maturity, not a facade.

import {
  dominationProgress, goStraightProgress, mayorProgress,
  type GameState, type WinPath, type WinPathProgress,
} from '../../sim';

export interface WinPathCardView {
  path: WinPath;
  /** Player-facing label (DOMINATION / GO STRAIGHT / GET ELECTED). */
  label: string;
  /** 0..100 — straight off the underlying selector. */
  pct: number;
  /** One-line plain-language status (the underlying `read`). */
  read: string;
  /** Tooltip source-breakdown: what advances this path (the underlying `advances`). */
  tooltip: string;
  /** The status screen this card drills into on click-through (a real statusScreenRegistry id). */
  screenId: string;
  /** True once the path has reached 100% (won). */
  complete: boolean;
  /** Optional honesty note (e.g. the mayor path's early-depth disclosure). Absent for mature paths. */
  note?: string;
}

/** The detail screen each win path drills into (all are real statusScreenRegistry ids). */
const SCREEN_BY_PATH: Record<WinPath, string> = {
  domination: 'controlMap',
  'go-straight': 'moneyLedger',
  mayor: 'civicInfluence',
};

/** Honesty notes per path — only the early-depth mayor system carries one. */
const NOTE_BY_PATH: Partial<Record<WinPath, string>> = {
  mayor: 'Political Capture is an early-depth system — a full, honest readout, not a placeholder.',
};

/** Wrap one WinPathProgress into a presentation card. Pure — copies the selector's own fields, adds routing
 * + the optional honesty note. */
function toCard(p: WinPathProgress): WinPathCardView {
  return {
    path: p.path,
    label: p.label,
    pct: p.pct,
    read: p.read,
    tooltip: p.advances,
    screenId: SCREEN_BY_PATH[p.path],
    complete: p.pct >= 100,
    ...(NOTE_BY_PATH[p.path] ? { note: NOTE_BY_PATH[p.path] } : {}),
  };
}

/** All three win-path cards in display order (DOMINATION · GO STRAIGHT · GET ELECTED). Every card wraps a
 * live selector call — never a cached/constant value — so the readout always tracks real progress. */
export function winPathCards(state: GameState): WinPathCardView[] {
  return [
    toCard(dominationProgress(state)),
    toCard(goStraightProgress(state)),
    toCard(mayorProgress(state)),
  ];
}
