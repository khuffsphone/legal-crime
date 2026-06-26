// HUD PHASE 2 — the TOP LEDGER BAR model (PURE; Phaser-free, fully unit-tested). It derives EVERY value the
// newspaper-masthead ledger bar shows — the clean/dirty cash hero + dirty-exposure meter, the federal heat
// ladder (NOTICE@50 / WATCH@70 / RAID@85), the win-path ticker (DOM / STRAIGHT / ELECT), the funding budget,
// and the week/clock — from EXISTING sim selectors. It invents no sim. The thin render layer in IsoScene
// draws this on the sacred fixed-HUD camera.
//
// CANON COLOUR LAW encoded here as DATA (not pixels): trends are 'up'/'down'/'flat' → ▲/▼/· glyphs the
// renderer paints in BRASS. There is NO green/red anywhere — gains and losses differ by the GLYPH, never the
// colour. Bright danger is MOTION-only (a brief threshold-cross pulse the renderer owns); the model only
// flags WHEN that is warranted (overDanger / bottleneck / a freshly-passed rung).

import {
  realtimeHudView, playerWeeklyNet, dirtyExposurePoints, fedWarningTier, districtsHeld,
  goStraightProgress, mayorProgress,
  DIRTY_EXPOSURE_CAP, FED_WARN_TIER_1, FED_WARN_TIER_2, FED_WARN_TIER_3, FED_DIRTY_DANGER,
  type GameState,
} from '../../sim';

// ── number formatting (thousands separators · real minus · per-week flows · brass+arrow trends) ──
const MINUS = '−'; // a REAL minus sign (U+2212), never a hyphen

/** Group an integer's digits with thousands commas: 12450 → "12,450". Sign-agnostic (pass the magnitude). */
export function groupThousands(n: number): string {
  return String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A money stock: "$12,450", losses with a REAL minus "−$1,234". Rounded to whole dollars. */
export function formatMoney(n: number): string {
  const r = Math.round(n);
  return `${r < 0 ? MINUS : ''}$${groupThousands(r)}`;
}

/** A per-week FLOW: "+$420/wk", "−$420/wk", "$0/wk". (Gain/loss read by sign + the renderer's ▲/▼, never colour.) */
export function formatFlowPerWeek(n: number): string {
  const r = Math.round(n);
  const sign = r > 0 ? '+' : r < 0 ? MINUS : '';
  return `${sign}$${groupThousands(r)}/wk`;
}

export type Trend = 'up' | 'down' | 'flat';

/** Direction of a change, with a dead-band so jitter reads flat. */
export function trendOf(delta: number, eps = 0): Trend {
  if (delta > eps) return 'up';
  if (delta < -eps) return 'down';
  return 'flat';
}

/** The trend GLYPH — ▲ up / ▼ down / · flat. The renderer paints all three in BRASS (no green/red). */
export function trendGlyph(t: Trend): string {
  return t === 'up' ? '▲' : t === 'down' ? '▼' : '·';
}

// ── the paired CASH HERO + dirty-exposure meter ─────────────────────────────────────────────────
export interface CashPairView {
  cleanText: string;
  dirtyText: string;
  cleanTrend: Trend;
  dirtyTrend: Trend;
  /** Exposure POINTS the dirty hoard currently generates (the EXISTING dirtyExposurePoints, 0..CAP). */
  exposurePoints: number;
  /** Meter fill 0..1 — how full the dirty-exposure ceiling is. */
  exposureFill: number;
  /** Whole-number "% of the dirty-exposure cap" — the "% SAFE CAP" readout. */
  safeCapPct: number;
  /** Dirty is over the launder-prompt danger line (FED_DIRTY_DANGER) — the renderer may pulse (motion). */
  overDanger: boolean;
}

/** Derive the clean/dirty hero pair + the dirty-exposure meter. `prev` (last frame's values) drives the
 * ▲/▼ trends; omit it for a flat first frame. Reuses the EXISTING dirtyExposurePoints — no new sim. */
export function cashPair(clean: number, dirty: number, prev?: { clean: number; dirty: number }): CashPairView {
  const points = dirtyExposurePoints(dirty);
  const fill = DIRTY_EXPOSURE_CAP > 0 ? Math.min(1, points / DIRTY_EXPOSURE_CAP) : 0;
  return {
    cleanText: formatMoney(clean),
    dirtyText: formatMoney(dirty),
    cleanTrend: prev ? trendOf(clean - prev.clean) : 'flat',
    dirtyTrend: prev ? trendOf(dirty - prev.dirty) : 'flat',
    exposurePoints: points,
    exposureFill: fill,
    safeCapPct: Math.round(fill * 100),
    overDanger: dirty > FED_DIRTY_DANGER,
  };
}

// ── the FEDERAL HEAT LADDER (NOTICE@50 / WATCH@70 / RAID@85) ─────────────────────────────────────
export type HeatRung = 'CLEAR' | 'NOTICE' | 'WATCH' | 'RAID';
const RUNG_BY_TIER: readonly HeatRung[] = ['CLEAR', 'NOTICE', 'WATCH', 'RAID'];

export interface HeatTick {
  name: 'NOTICE' | 'WATCH' | 'RAID';
  at: number;
  passed: boolean;
}

export interface HeatLadderView {
  exposure: number;
  /** The current rung (from the EXISTING fedWarningTier mapping). */
  rung: HeatRung;
  ticks: HeatTick[];
  /** Points to the NEXT rung, and its name (null/null once at RAID). */
  toNext: number | null;
  nextLabel: HeatTick['name'] | null;
  /** Points to RAID specifically (the "N to RAID" read); 0 once there. */
  toRaid: number;
  /** Rail fill 0..1. */
  fill: number;
}

/** Map a 0..100 federal exposure onto the segmented ladder. Rung + tick `passed` flags come straight off the
 * canon thresholds (fedWarningTier / FED_WARN_TIER_*) — the bar is brass/case-file; danger-red is the
 * renderer's MOTION-only cross pulse, not encoded here. */
export function heatLadder(exposure: number): HeatLadderView {
  const e = Math.max(0, Math.min(100, exposure));
  const ticks: HeatTick[] = [
    { name: 'NOTICE', at: FED_WARN_TIER_1, passed: e >= FED_WARN_TIER_1 },
    { name: 'WATCH', at: FED_WARN_TIER_2, passed: e >= FED_WARN_TIER_2 },
    { name: 'RAID', at: FED_WARN_TIER_3, passed: e >= FED_WARN_TIER_3 },
  ];
  const next = ticks.find((t) => !t.passed) ?? null;
  return {
    exposure: e,
    rung: RUNG_BY_TIER[fedWarningTier(e)],
    ticks,
    toNext: next ? next.at - e : null,
    nextLabel: next ? next.name : null,
    toRaid: Math.max(0, FED_WARN_TIER_3 - e),
    fill: e / 100,
  };
}

// ── the WIN-PATH TICKER (DOM X/9 · STRAIGHT Y% · ELECT Z/100) ────────────────────────────────────
export interface WinPathTickerView {
  domText: string;
  straightText: string;
  electText: string;
}

export function winPathTicker(domHeld: number, domTotal: number, straightPct: number, electPct: number): WinPathTickerView {
  return {
    domText: `DOM ${domHeld}/${domTotal}`,
    straightText: `STRAIGHT ${straightPct}%`,
    electText: `ELECT ${electPct}/100`,
  };
}

// ── the CONTROL / FUNDING BUDGET (secondary) ─────────────────────────────────────────────────────
// NOTE: the sim's control-CAP constants (CONTROL_START/PER_FAVOR/CAP_MAX/COST_*) are ORPHANED — defined but
// wired into no selector — so there is no live "control budget" resource to read. Per the invent-no-sim law
// we surface the real funding budget instead: the player's net weekly cash flow (the resource that actually
// gates expansion). It reads secondary and flags as the active bottleneck when it goes non-positive.
export interface ControlBudgetView {
  text: string;
  trend: Trend;
  /** Net flow ≤ 0 — funding is the constraint (the renderer may emphasise it; never bigger than cash/heat otherwise). */
  bottleneck: boolean;
}

export function controlBudget(netPerWeek: number, prevNet?: number): ControlBudgetView {
  return {
    text: `NET ${formatFlowPerWeek(netPerWeek)}`,
    trend: prevNet === undefined ? trendOf(netPerWeek) : trendOf(netPerWeek - prevNet),
    bottleneck: netPerWeek <= 0,
  };
}

// ── the assembled model ──────────────────────────────────────────────────────────────────────────
export interface LedgerBarModel {
  cash: CashPairView;
  heat: HeatLadderView;
  winPaths: WinPathTickerView;
  budget: ControlBudgetView;
  weekText: string;
  clockText: string;
  paused: boolean;
}

export interface LedgerBarPrev {
  clean: number;
  dirty: number;
  net: number;
}

export interface LedgerBarOpts {
  weekDuration?: number;
  paused?: boolean;
  /** Last frame's clean/dirty/net — drives the ▲/▼ trends. */
  prev?: LedgerBarPrev;
}

/** Assemble the whole ledger-bar model from live state — the thin wiring over the pure pieces. Every value
 * comes from an EXISTING selector (realtimeHudView / playerWeeklyNet / win-paths / districtsHeld). Pure. */
export function buildLedgerBar(state: GameState, opts: LedgerBarOpts = {}): LedgerBarModel {
  const hud = realtimeHudView(state, opts.weekDuration);
  const p = hud.player;
  const net = playerWeeklyNet(state);
  const domHeld = districtsHeld(state, state.player.id).length;
  const domTotal = state.districts.length;
  return {
    cash: cashPair(p.cleanCash, p.dirtyCash, opts.prev ? { clean: opts.prev.clean, dirty: opts.prev.dirty } : undefined),
    heat: heatLadder(p.federalExposure),
    winPaths: winPathTicker(domHeld, domTotal, goStraightProgress(state).pct, mayorProgress(state).pct),
    budget: controlBudget(net, opts.prev?.net),
    weekText: `WK ${hud.week}`,
    clockText: hud.weekCountdownLabel,
    paused: !!opts.paused,
  };
}
