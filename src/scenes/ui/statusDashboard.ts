// STATUS DASHBOARD — the at-a-glance threat + economy summary (PURE view-model; Phaser-free, like ledgerBar.ts;
// the thin render layer in IsoScene paints it on the sacred fixed-HUD camera). It COMPLEMENTS the existing HUD
// — the ledger bar (the cash/heat numbers), THE WIRE (the event feed), the CONSIGLIERE (the next-action nudge)
// — by distilling the player's SITUATION into four banded reads: federal heat, district health, cashflow trend,
// and rival pressure. It derives EVERY value from player-knowable selectors the scene already shows; it invents
// no sim.
//
// ⭐ NO-X-RAY: rival pressure is a PLAYER-KNOWABLE AGGREGATE only — built from the player's OWN contested turf
// and the count of recent rival-pressure WIRE events the player has already seen. The input/view carry NO
// rival position or hidden-unit count by construction, so the dashboard structurally cannot leak one.
//
// CANON COLOUR (as DATA, not pixels): each cell carries a TONE the renderer maps to the palette — danger is
// MOTION-only (a threshold pulse the renderer owns), the rival-pressure cell paints in the STATIC rival-red
// #9E1B1B, player/economy reads in brass. No green/red gain/loss colour here.

import { FED_WARN_TIER_1, FED_WARN_TIER_2, FED_WARN_TIER_3, federalTierLabel, type FederalTierName } from '../../sim';

/** Cashflow direction. */
export type Trend = 'up' | 'down' | 'flat';
/** A cell's semantic weight — the renderer maps it to the palette (danger = MOTION-only). NOT a colour. */
export type DashboardTone = 'calm' | 'good' | 'watch' | 'danger';

/**
 * Player-knowable inputs the dashboard derives from — every field is something the player can already read off
 * the HUD/ledger or their OWN holdings/WIRE. There is deliberately NO rival-position / hidden-count field.
 */
export interface StatusDashboardInput {
  /** Federal exposure 0..100 (on the ledger). */
  federalExposure: number;
  /** Net weekly cash flow (the ledger trend). */
  netPerWeek: number;
  /** Clean funds on hand. */
  cleanCash: number;
  /** Districts the player holds, and the city total. */
  districtsHeld: number;
  districtsTotal: number;
  /** Districts the player has a foothold in that are currently CONTESTED (player-knowable — their own turf). */
  districtsContested: number;
  /** Count of recent rival-pressure WIRE events the player has SEEN (telegraphs / HQ struck / turf lost). */
  rivalPressureEvents: number;
}

export interface DashboardCell {
  key: 'federal' | 'district' | 'cashflow' | 'rival';
  label: string;   // the heading ("FEDS", "TURF", "CASH", "RIVALS")
  value: string;   // the banded read ("WATCH", "SECURE", "▲ rising", "PROBING")
  detail: string;  // a compact supporting figure ("70/100", "3/9", "+$420/wk", "1 contested")
  tone: DashboardTone;
}

export interface StatusDashboardView {
  cells: DashboardCell[]; // federal, district, cashflow, rival — in display order
}

// ── pure derivations ─────────────────────────────────────────────────────────────────────────────────────
/** The cashflow trend from the weekly net. A small deadband around zero reads as flat (no flicker). */
export function cashflowTrend(netPerWeek: number, deadband = 1): Trend {
  if (netPerWeek > deadband) return 'up';
  if (netPerWeek < -deadband) return 'down';
  return 'flat';
}

/** The federal band (CLEAR/NOTICE/WATCH/RAID at 50/70/85) + its tone. */
export function federalBand(exposure: number): { label: FederalTierName; tone: DashboardTone } {
  const tier = exposure >= FED_WARN_TIER_3 ? 3 : exposure >= FED_WARN_TIER_2 ? 2 : exposure >= FED_WARN_TIER_1 ? 1 : 0;
  const tone: DashboardTone = tier >= 3 ? 'danger' : tier >= 1 ? 'watch' : 'good';
  return { label: federalTierLabel(tier), tone };
}

/** District health from holdings + contested turf. */
export function districtHealth(held: number, total: number, contested: number): { label: string; tone: DashboardTone } {
  if (contested > 0) return { label: contested >= 2 ? 'UNDER FIRE' : 'PRESSED', tone: contested >= 2 ? 'danger' : 'watch' };
  if (held === 0) return { label: 'NO TURF', tone: 'watch' };
  return { label: held >= Math.ceil(total / 2) ? 'SECURE' : 'HOLDING', tone: 'good' };
}

/**
 * Rival pressure — a PLAYER-KNOWABLE aggregate from the player's contested turf + recent observed pressure
 * events. CALM → PROBING → PRESSING → WAR. NEVER a position or a hidden-unit count. Pure.
 */
export function rivalPressure(districtsContested: number, recentEvents: number): { label: string; tone: DashboardTone } {
  const heat = Math.max(0, districtsContested) * 2 + Math.max(0, recentEvents);
  if (heat >= 6) return { label: 'WAR', tone: 'danger' };
  if (heat >= 3) return { label: 'PRESSING', tone: 'danger' };
  if (heat >= 1) return { label: 'PROBING', tone: 'watch' };
  return { label: 'CALM', tone: 'calm' };
}

const MINUS = '−'; // a real minus sign (U+2212)
function money(n: number): string {
  const r = Math.round(Math.abs(n));
  return `${n < 0 ? MINUS : ''}$${String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/**
 * Build the four-cell dashboard view from player-knowable inputs. Every cell value/detail is derived from the
 * input numbers — no live rival state is read, no position is produced. Pure.
 */
export function buildStatusDashboard(input: StatusDashboardInput): StatusDashboardView {
  const fed = federalBand(input.federalExposure);
  const dist = districtHealth(input.districtsHeld, input.districtsTotal, input.districtsContested);
  const trend = cashflowTrend(input.netPerWeek);
  const rivals = rivalPressure(input.districtsContested, input.rivalPressureEvents);
  const trendGlyph = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '·';
  const trendTone: DashboardTone = trend === 'down' && input.netPerWeek < 0 ? 'watch' : 'good';

  return {
    cells: [
      { key: 'federal', label: 'FEDS', value: fed.label, detail: `${Math.round(input.federalExposure)}/100`, tone: fed.tone },
      { key: 'district', label: 'TURF', value: dist.label, detail: `${input.districtsHeld}/${input.districtsTotal}${input.districtsContested > 0 ? ` · ${input.districtsContested} contested` : ''}`, tone: dist.tone },
      { key: 'cashflow', label: 'CASH', value: `${trendGlyph} ${money(input.netPerWeek)}/wk`, detail: money(input.cleanCash), tone: trendTone },
      { key: 'rival', label: 'RIVALS', value: rivals.label, detail: input.districtsContested > 0 ? `${input.districtsContested} contested` : 'no turf contested', tone: rivals.tone },
    ],
  };
}
