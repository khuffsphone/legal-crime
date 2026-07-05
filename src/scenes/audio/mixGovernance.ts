// mixGovernance.ts — AUDIO E-H, Ticket H1: the pure MIX-GOVERNANCE policy — the four conceptual buses
// (R3: gain groups over the real AudioManager buses — see atmosphereIntents), the H.2 ducking matrix,
// the H.3 priority/steal policy, and the H.4 master cue-rate caps. Pure data + reducers; intents only.
//
// E-H does NOT redesign the music lane or the shipped combat SFX path: combat appears here ONLY as a
// ducking side-chain trigger (combat ducks the beds — required) and as a rank (85) in the steal order.

import {
  ATMOSPHERE_BUSES, BUS_BUDGETS, cuePriority, type AtmosphereBus, type DuckIntent,
} from './atmosphereIntents';
import type { EventCueIntent } from './eventCueMapper';

// ── H.2 ducking matrix: trigger → per-group dB offsets + envelope ────────────────────────────────
export interface DuckSpec {
  targetsDb: Readonly<Record<AtmosphereBus, number>>;
  attackMs: number;
  holdMs: number;
  releaseMs: number;
}

const duck = (music: number, beds: number, emitters: number, oneshots: number, attackMs: number, holdMs: number, releaseMs: number): DuckSpec =>
  ({ targetsDb: { music, beds, emitters, oneshots }, attackMs, holdMs, releaseMs });

/** Trigger ids are cue keys, plus the synthetic 'combat' side-chain. The federal cue itself is never
 * ducked by its own side-chain (the oneshots offset applies to OTHER one-shots — adapter contract). */
export const DUCK_MATRIX: Readonly<Record<string, DuckSpec>> = {
  combat: duck(0, -6, -3, 0, 30, 250, 1100),                    // combat ducks beds — REQUIRED
  federal_notice: duck(-2, -7, -7, -3, 15, 500, 1300),
  federal_watch: duck(-3, -8, -8, -4, 15, 650, 1500),
  federal_raid: duck(-4, -10, -10, -5, 10, 800, 1800),          // strongest duck in the game
  federal_armed: duck(-2, -6, -6, -3, 15, 600, 1400),
  police_raid_cash: duck(-2, -5, -5, -2, 20, 400, 1200),
  police_raid_operation: duck(-2, -5, -5, -2, 20, 400, 1200),
  police_raid_bust: duck(-2, -5, -5, -2, 20, 400, 1200),
  interception_collector_robbed: duck(0, -4, -4, -2, 20, 300, 900),
  collector_arrival: duck(0, -2, -3, 0, 20, 200, 700),
  collector_deposit: duck(0, -2, -3, 0, 20, 200, 700),
  player_offense_raid: duck(0, -4, -4, -1, 20, 300, 900),       // the player's op — NOT police-coded
};

/** The duck intent for a trigger, or null when the trigger doesn't duck. Pure. */
export function duckFor(trigger: string): DuckIntent | null {
  const spec = DUCK_MATRIX[trigger];
  if (!spec) return null;
  return { op: 'duck', ...spec, trigger };
}

/** Combine overlapping ducks: per group the DEEPEST offset wins (never summed — summing would slam the
 * mix under a busy frame). Pure. */
export function combineDucks(active: readonly DuckIntent[]): Readonly<Record<AtmosphereBus, number>> {
  const out: Record<AtmosphereBus, number> = { music: 0, beds: 0, emitters: 0, oneshots: 0 };
  for (const d of active) {
    for (const bus of ATMOSPHERE_BUSES) out[bus] = Math.min(out[bus], d.targetsDb[bus]);
  }
  return out;
}

// ── H.3 voice stealing ───────────────────────────────────────────────────────────────────────────
export interface ActiveVoice {
  key: string;
  priority: number;
  /** 'loop' voices are FADED out on steal; 'oneShot's are dropped before start, never hard-cut. */
  kind: 'loop' | 'oneShot';
  positional: boolean;
  distPx?: number;
  startedMs: number;
}

const FEDERAL_WARNING_KEYS = new Set(['federal_notice', 'federal_watch', 'federal_raid', 'federal_armed']);

/**
 * Pick the victim when `incoming` needs a voice and the group is full, per H.3:
 * never steal an active federal warning; prop rhythms go before event one-shots (their priorities 35 <
 * events already encode this); lowest priority first; ties: positional → farthest from screen center
 * (an UNKNOWN distance sorts as farthest — an adapter that skipped distance bookkeeping must not make
 * that voice the most protected in its rank), non-positional → oldest. Returns null when nothing may be
 * stolen (the incoming cue is dropped instead).
 */
export function chooseSteal(active: readonly ActiveVoice[], incoming: { priority: number }): ActiveVoice | null {
  const stealable = active.filter((v) => !FEDERAL_WARNING_KEYS.has(v.key) && v.priority < incoming.priority);
  if (stealable.length === 0) return null;
  return [...stealable].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.positional !== b.positional) return Number(b.positional) - Number(a.positional);
    if (a.positional && b.positional) {
      const da = a.distPx ?? Infinity; // unknown distance = assume farthest, steal it first
      const db = b.distPx ?? Infinity;
      if (da !== db) return db - da;
    }
    return a.startedMs - b.startedMs; // oldest loses (also the both-Infinity fallback)
  })[0];
}

export { cuePriority, BUS_BUDGETS };

// ── H.4 master cue-rate caps (pure sliding-window reducer) ───────────────────────────────────────
export const ABSOLUTE_STARTS_PER_SEC = 10;
export const EVENT_ONESHOTS_PER_SEC = 6;
export const ATMOSPHERE_STARTS_PER_SEC = 4; // non-critical atmosphere (prop cues)
export const DUP_EVENT_COOLDOWN_MS = 1000;
export const DUP_PROP_COOLDOWN_MS = 8000;
export const DUP_POLICE_COOLDOWN_MS = 1500;
export const DUP_FEDERAL_SAME_TIER_MS = 2000;

export interface RateLimiterState {
  /** epoch-ms of every admitted start in the last second (any class). */
  allStarts: number[];
  eventStarts: number[];
  atmosphereStarts: number[];
  /** per dedupe-key last admitted time. */
  lastByKey: Record<string, number>;
}

export function createRateLimiterState(): RateLimiterState {
  return { allStarts: [], eventStarts: [], atmosphereStarts: [], lastByKey: {} };
}

export type RateVerdict = 'admit' | 'drop-duplicate' | 'drop-rate';

export interface RateDecision {
  state: RateLimiterState;
  verdict: RateVerdict;
}

function isFederal(key: string): boolean { return FEDERAL_WARNING_KEYS.has(key) || key === 'federal_cooldown'; }
function isPolice(key: string): boolean { return key.startsWith('police_raid_'); }
function isProp(key: string): boolean { return key.startsWith('prop_'); }

/** The longest duplicate window — lastByKey entries older than this can never influence a verdict, so
 * they are pruned on every admit (the dedupe ledger stays bounded over a long session instead of
 * accreting a key per front/event ever heard). */
const MAX_DUP_WINDOW_MS = Math.max(DUP_EVENT_COOLDOWN_MS, DUP_PROP_COOLDOWN_MS, DUP_POLICE_COOLDOWN_MS, DUP_FEDERAL_SAME_TIER_MS);

/**
 * Admit or drop one cue start, per H.4. FEDERAL LAW: a federal tier crossing is NEVER dropped by rate
 * or by prop/bed pressure — the spec's "federal tier crossings must never be dropped" is read as a
 * bypass of EVERY rate cap including the absolute 10/s (only an exact same-key repeat within 2 s is
 * suppressed — a duplicate, not a crossing). Duplicate windows: event keys 1 s, police keys 1.5 s,
 * prop keys 8 s. Absolute cap 10/s; event one-shots 6/s; non-critical atmosphere 4/s.
 *
 * PROP PRECEDENCE NOTE: in the shipped pipeline prop one-shots are throttled at the SOURCE by the
 * planner's seeded scheduler (G.5: 1 per 1.5 s + 4 per 10 s + per-source/family cooldowns) and do NOT
 * route through this gate; the prop lane here (4/s + the 8 s dup window) is the H.4 governance backstop
 * that becomes live if a future adapter routes emitter one-shots through admitCue. The planner is
 * authoritative for prop cadence tuning. Pure — returns a new state.
 */
export function admitCue(state: RateLimiterState, cue: { key: string; dedupeKey?: string }, nowMs: number): RateDecision {
  const prune = (arr: number[], win: number): number[] => arr.filter((t) => nowMs - t < win);
  const all = prune(state.allStarts, 1000);
  const events = prune(state.eventStarts, 1000);
  const atmos = prune(state.atmosphereStarts, 1000);
  const dupKey = cue.dedupeKey ?? cue.key;
  const last = state.lastByKey[dupKey];
  const drop = (verdict: RateVerdict): RateDecision =>
    ({ state: { allStarts: all, eventStarts: events, atmosphereStarts: atmos, lastByKey: state.lastByKey }, verdict });

  const federal = isFederal(cue.key);
  const prop = isProp(cue.key);
  const dupWindow = federal ? DUP_FEDERAL_SAME_TIER_MS : isPolice(cue.key) ? DUP_POLICE_COOLDOWN_MS : prop ? DUP_PROP_COOLDOWN_MS : DUP_EVENT_COOLDOWN_MS;
  if (last !== undefined && nowMs - last < dupWindow) return drop('drop-duplicate');

  if (!federal) { // a federal crossing bypasses every rate cap (never dropped)
    if (all.length >= ABSOLUTE_STARTS_PER_SEC) return drop('drop-rate');
    if (prop && atmos.length >= ATMOSPHERE_STARTS_PER_SEC) return drop('drop-rate');
    if (!prop && events.length >= EVENT_ONESHOTS_PER_SEC) return drop('drop-rate');
  }

  // bound the dedupe ledger: entries beyond the longest window are dead weight.
  const lastByKey: Record<string, number> = {};
  for (const [k, t] of Object.entries(state.lastByKey)) {
    if (nowMs - t < MAX_DUP_WINDOW_MS) lastByKey[k] = t;
  }
  lastByKey[dupKey] = nowMs;

  return {
    state: {
      allStarts: [...all, nowMs],
      eventStarts: prop ? events : [...events, nowMs],
      atmosphereStarts: prop ? [...atmos, nowMs] : atmos,
      lastByKey,
    },
    verdict: 'admit',
  };
}

/** Order one frame's event cues for playback/admission: priority desc, stable within a rank
 * (Array.prototype.sort is spec-stable since ES2019, so input order survives ties). Pure. */
export function orderCues<T extends Pick<EventCueIntent, 'priority'>>(cues: readonly T[]): T[] {
  if (cues.length <= 1) return [...cues];
  return [...cues].sort((a, b) => b.priority - a.priority);
}
