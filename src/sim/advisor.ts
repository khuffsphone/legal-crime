// Lane — THE CONSIGLIERE. Pure & deterministic; imports NO Phaser (passes the /src/sim purity invariant in
// adapter.test.ts). An in-world advisor that turns player-knowable facts + recent WIRE events into a ranked
// list of actionable suggestions ("federal heat is climbing — lie low", "a front is unshaken — move in") so a
// new player is never lost.
//
// ⭐ NO-X-RAY (the cardinal rule). The advisor decides from TWO inputs only:
//   1. AdvisorSnapshot — a curated, PLAYER-KNOWABLE state read (the player's own economy/heat/turf/crew +
//      win-path telegraph + a suggested extort target on turf the player ALREADY controls). It has NO field
//      for a rival's hidden position, so a suggestion structurally CANNOT leak one.
//   2. AdvisorEvent[] — the scene's WIRE log entries (logStore/infoEvents). Positional WIRE kinds locate only
//      the player's OWN assets (HQ struck, a block lost, a collector robbed) or a TELEGRAPHED strike (the
//      player's defensive window); the non-positional kinds (federal/bribe/rival.fallen) carry no location.
// A suggestion's (gx,gy) is ever only COPIED from one of those player-knowable inputs — the advisor never
// derives or invents a position. THE WIRE is scene-side, so the SCENE feeds it in; we import no scene code.
//
// Decision logic is PURE; the scene owns the HUD surface + the snapshot construction. tick.ts/commands.ts are
// never touched.

import { FED_DIRTY_DANGER, FED_WARN_TIER_3 } from './constants';

/** How loud a suggestion is. Drives both the rank and the HUD colour. */
export type Urgency = 'critical' | 'warning' | 'opportunity' | 'info';

/** A player-knowable place a suggestion can point at (a click-to-jump hint). */
export interface AdvisorPlace {
  name: string;
  gx?: number;
  gy?: number;
}

/**
 * A curated, PLAYER-KNOWABLE snapshot — every field is something the player can already read off the HUD or
 * their own holdings. Deliberately has NO rival-position field (NO-X-RAY by construction). The scene builds it
 * from existing pure selectors (realtimeHudView / playerWeeklyNet / districtsHeld / victoryConditions /
 * suggestedExtortTarget).
 */
export interface AdvisorSnapshot {
  tick: number;
  /** Player's own clean cash. */
  cleanCash: number;
  /** Player's own dirty hoard (drives federal exposure — shown on the ledger). */
  dirtyCash: number;
  /** Player's own net weekly cash flow. */
  netPerWeek: number;
  /** Federal exposure 0..100 (on the HUD ledger). */
  federalExposure: number;
  /** Federal warning tier 0..3 (CLEAR / NOTICE / WATCH / RAID). */
  federalTier: number;
  /** Districts the player holds, and the city total. */
  districtsHeld: number;
  districtsTotal: number;
  /** Player's own crew, and how many are idle (unassigned muscle). */
  crewTotal: number;
  crewIdle: number;
  /** The closest victory condition, 0..100 (the telegraphed win race). */
  topWinPathPct: number;
  /** Total standing grease across all channels (whether the player has touched bribery). */
  greaseTotal: number;
  /** A genuinely-takeable front on turf the player ALREADY controls (player-knowable opportunity). */
  extortTarget?: AdvisorPlace;
}

/**
 * A WIRE log entry, structurally. Kept decoupled from the scene-side logStore/infoEvents types (kind is a bare
 * string) so /src/sim imports no scene code — a logStore `LogEntry[]` is assignable to this as-is.
 */
export interface AdvisorEvent {
  kind: string;
  tier: 'info' | 'warning' | 'critical';
  /** ms timestamp (same clock the scene stamps WIRE rows with). */
  t: number;
  count?: number;
  gx?: number;
  gy?: number;
  message?: string;
}

export interface Suggestion {
  /** Stable identity for the kind of advice (de-dup / render key). */
  id: string;
  /** The consigliere's line. */
  text: string;
  urgency: Urgency;
  /** 0..100 within-urgency tiebreak (more pressing → higher). */
  score: number;
  /** A player-knowable location to jump to, when the advice is about a place. */
  gx?: number;
  gy?: number;
}

/** Events newer than this (ms) count as "recent" — the advisor reacts to fresh WIRE beats, not stale history. */
export const ADVISOR_RECENT_MS = 20_000;

const URGENCY_WEIGHT: Record<Urgency, number> = { critical: 300, warning: 200, opportunity: 100, info: 50 };

/** The absolute rank of a suggestion: urgency band first, then its within-band score. Higher = surfaced first. */
export function rankScore(s: Suggestion): number {
  return URGENCY_WEIGHT[s.urgency] + s.score;
}

/** The most recent event of a kind within the recency window, or undefined. Pure read. */
function recentEvent(events: AdvisorEvent[], kind: string, now: number): AdvisorEvent | undefined {
  let best: AdvisorEvent | undefined;
  for (const e of events) {
    if (e.kind !== kind || now - e.t > ADVISOR_RECENT_MS) continue;
    if (!best || e.t > best.t) best = e;
  }
  return best;
}

/**
 * The ranked suggestion list for the current run — most urgent first. Pure: derives ONLY from the
 * player-knowable snapshot + the WIRE events (NO-X-RAY). Returns [] when there is nothing worth saying.
 */
export function adviseRun(snap: AdvisorSnapshot, events: AdvisorEvent[], now: number): Suggestion[] {
  const out: Suggestion[] = [];
  const push = (s: Suggestion): void => { out.push(s); };

  // ── CRITICAL — direct attacks on the player's own assets (positions come from the player's WIRE) ──
  const hq = recentEvent(events, 'hq.attack', now);
  if (hq) push({ id: 'hq-attack', text: 'Your HQ is under attack — pull muscle home and defend it now.', urgency: 'critical', score: 95, gx: hq.gx, gy: hq.gy });

  const lost = recentEvent(events, 'district.lost', now);
  if (lost) push({ id: 'district-lost', text: 'You just lost a block — retake it or shore up the border before it spreads.', urgency: 'critical', score: 80, gx: lost.gx, gy: lost.gy });

  // RAID tier is a player-knowable HUD reading (non-positional).
  if (snap.federalTier >= 3 || snap.federalExposure >= FED_WARN_TIER_3) {
    push({ id: 'heat-raid', text: 'A federal bust is imminent — lie low: stop the dirty rackets and grease the Bureau.', urgency: 'critical', score: 70 });
  }

  // ── WARNING — building threats + bleeding ──
  const tel = recentEvent(events, 'rival.telegraph', now);
  if (tel) push({ id: 'rival-strike', text: 'A rival is massing for a strike — brace that block before it lands.', urgency: 'warning', score: 85, gx: tel.gx, gy: tel.gy });

  if (snap.federalTier === 2) push({ id: 'heat-watch', text: 'Federal heat is climbing — consider lying low and laundering the dirty money.', urgency: 'warning', score: 60 });

  const robbed = recentEvent(events, 'collector.robbed', now);
  if (robbed) push({ id: 'collector-robbed', text: 'A collector was robbed — guard the routes or send an escort.', urgency: 'warning', score: 55, gx: robbed.gx, gy: robbed.gy });

  if (snap.dirtyCash >= FED_DIRTY_DANGER) push({ id: 'launder', text: 'Your dirty hoard is drawing federal eyes — launder it into clean cash.', urgency: 'warning', score: 50 });

  if (snap.netPerWeek <= 0 && snap.districtsHeld > 0) push({ id: 'cashflow', text: "You're bleeding cash each week — open a racket or trim the crew's upkeep.", urgency: 'warning', score: 40 });

  // ── OPPORTUNITY — moves to make (the extort target is on turf the player already controls) ──
  if (snap.topWinPathPct >= 80) push({ id: 'win-close', text: "You're one move from taking the city — press your lead.", urgency: 'opportunity', score: 90 });

  if (snap.extortTarget) {
    const tgt = snap.extortTarget;
    if (snap.crewIdle > 0) {
      push({ id: 'extort-idle', text: `Idle muscle on the payroll — send them to shake down ${tgt.name}.`, urgency: 'opportunity', score: 70, gx: tgt.gx, gy: tgt.gy });
    } else {
      push({ id: 'extort', text: `${tgt.name} is unshaken — move in and put it on the payroll.`, urgency: 'opportunity', score: 50, gx: tgt.gx, gy: tgt.gy });
    }
  }

  // ── INFO — gentle onboarding nudges ──
  if (snap.districtsHeld === 0) push({ id: 'foothold', text: 'Get a foothold — extort a front in your home corner to start the cash flowing.', urgency: 'info', score: 60 });

  if (snap.greaseTotal === 0 && snap.federalTier >= 1) push({ id: 'grease', text: 'Grease a channel — a little money to the right people slows the heat.', urgency: 'info', score: 40 });

  return out.sort((a, b) => rankScore(b) - rankScore(a));
}

/** The single most-urgent suggestion right now, or null when the consigliere has nothing to add. Pure. */
export function topSuggestion(snap: AdvisorSnapshot, events: AdvisorEvent[], now: number): Suggestion | null {
  return adviseRun(snap, events, now)[0] ?? null;
}

/** The top `n` ranked suggestions (most urgent first). Pure. */
export function topSuggestions(snap: AdvisorSnapshot, events: AdvisorEvent[], now: number, n: number): Suggestion[] {
  return adviseRun(snap, events, now).slice(0, Math.max(0, n));
}
