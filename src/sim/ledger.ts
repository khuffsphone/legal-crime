// RTS-9 — incident ledger & causal readout. Pure & deterministic; imports NO Phaser. An
// OBSERVE layer: it records what ALREADY happens so a playthrough's cause-and-effect is legible
// for tuning, debrief, and judging. It does NOT change any mechanic — every mechanic already
// writes a structured GameEvent to state.log; the ledger PROJECTS the meaningful ones into a
// bounded, curated, sequence-stamped list, and the real-time wrapper adds weekly-settlement
// summaries. recordIncident is pure (returns a NEW state); nothing here mutates the settlement.

import type { GameState } from './types';

/** Severity drives the readout's colour coding (blood/brass/amber/fog). */
export type IncidentSeverity = 'info' | 'gain' | 'warning' | 'danger';

/** Coarse incident category — stable keys for selectors / replay / debrief / AI. */
export type IncidentType =
  | 'collector_run'
  | 'robbery'
  | 'deposit'
  | 'settlement'
  | 'federal_warning'
  | 'federal_warrant'
  | 'federal_cooldown'
  | 'bust'
  | 'raid'
  | 'mutiny'
  | 'desertion'
  | 'loan'
  | 'shock'
  | 'extortion'
  | 'territory'
  | 'family_fallen'
  | 'offense'
  | 'market'
  | 'vice'
  | 'event'
  | 'civic'
  | 'game_over';

export interface IncidentRecord {
  /** Monotonic identity; never reused, never decreases (survives the cap). */
  seq: number;
  /** In-game week (state.tick) the incident occurred on. */
  week: number;
  type: IncidentType;
  severity: IncidentSeverity;
  /** Human-readable one-liner (taken from the source event's message, or built for summaries). */
  summary: string;
  /** Structured payload (amounts, district/tile, units involved) for tooling. */
  data?: Record<string, unknown>;
}

/** Max incidents kept in memory; older ones drop off the front so a long session is bounded. */
export const INCIDENT_CAP = 200;

export interface IncidentInput {
  type: IncidentType;
  severity: IncidentSeverity;
  summary: string;
  week?: number; // defaults to state.tick
  data?: Record<string, unknown>;
}

/**
 * Append one incident, returning a NEW state (the original is untouched — pure). The record gets
 * the next monotonic seq; the list is capped to the last INCIDENT_CAP, but seq keeps climbing so
 * identities stay stable across the cap.
 */
export function recordIncident(state: GameState, input: IncidentInput): GameState {
  const seq = state.incidentSeq;
  const record: IncidentRecord = {
    seq,
    week: input.week ?? state.tick,
    type: input.type,
    severity: input.severity,
    summary: input.summary,
    ...(input.data !== undefined ? { data: input.data } : {}),
  };
  const next = [...state.incidents, record];
  const capped = next.length > INCIDENT_CAP ? next.slice(next.length - INCIDENT_CAP) : next;
  return { ...state, incidents: capped, incidentSeq: seq + 1 };
}

/** How a source log `kind` maps into the curated ledger (kinds not listed are ignored). */
interface KindMapping {
  type: IncidentType;
  severity: IncidentSeverity;
}

const LOG_KIND_MAP: Record<string, KindMapping> = {
  // Collector lifecycle (RTS-4/5).
  'collector-dispatched': { type: 'collector_run', severity: 'info' },
  'interception': { type: 'robbery', severity: 'danger' },
  'collector-deposit': { type: 'deposit', severity: 'gain' },
  // Federal telegraphing (Phase 18/19).
  'fed-warning': { type: 'federal_warning', severity: 'warning' },
  'fed-armed': { type: 'federal_warrant', severity: 'danger' },
  'fed-cooldown': { type: 'federal_cooldown', severity: 'info' },
  // Law / raids (Phase 6/8).
  'raid-bust': { type: 'bust', severity: 'danger' },
  'raid-cash': { type: 'raid', severity: 'danger' },
  'raid-operation': { type: 'raid', severity: 'danger' },
  // Crew (Phase 15 / S5).
  'mutiny': { type: 'mutiny', severity: 'danger' },
  'desertion': { type: 'desertion', severity: 'warning' },
  'auto-loan': { type: 'loan', severity: 'warning' },
  // Systemic shocks (Phase 16).
  'shock': { type: 'shock', severity: 'warning' },
  'shock-audit-seizure': { type: 'shock', severity: 'danger' },
  'shock-speakeasy-raid': { type: 'shock', severity: 'danger' },
  // Extortion (Phase 2).
  'extort-success': { type: 'extortion', severity: 'gain' },
  'extort-fail': { type: 'extortion', severity: 'info' },
  // The turf war (RTS-16) + RTS-19 disruption (a softening blow that breaks fronts without seizing).
  'district-captured': { type: 'territory', severity: 'danger' },
  'district-disrupted': { type: 'territory', severity: 'warning' },
  'family-fallen': { type: 'family_fallen', severity: 'gain' },
  // The offensive (RTS-17).
  'raid': { type: 'offense', severity: 'warning' },
  'sabotage': { type: 'offense', severity: 'warning' },
  'assassination': { type: 'offense', severity: 'danger' },
  'lockout': { type: 'offense', severity: 'info' },
  'hq-struck': { type: 'territory', severity: 'danger' },
  'family-eliminated': { type: 'family_fallen', severity: 'gain' },
  // RTS-24 — content: market trades, vice upgrades, civic influence, world events.
  'market-buy': { type: 'market', severity: 'info' },
  'market-sell': { type: 'market', severity: 'gain' },
  'vice-upgrade': { type: 'vice', severity: 'gain' },
  'civic-influence': { type: 'civic', severity: 'gain' },
  'event-legalization': { type: 'event', severity: 'gain' },
  'event-fbi-lockout': { type: 'event', severity: 'danger' },
  'event-booze-glut': { type: 'event', severity: 'warning' },
  'event-booze-shortage': { type: 'event', severity: 'warning' },
  'event-expose': { type: 'event', severity: 'danger' },
  // Terminal.
  'game-over': { type: 'game_over', severity: 'danger' },
};

/** The log kinds the ledger projects (exposed for tests / tooling). */
export function isLedgerKind(kind: string): boolean {
  return kind in LOG_KIND_MAP;
}

/**
 * Project every NEW state.log entry (since the stored cursor) whose kind is curated into the
 * incident ledger, then advance the cursor. Pure — returns a NEW state; the original is
 * unchanged. Idempotent across calls: already-harvested log entries are never re-projected.
 */
export function harvestIncidents(state: GameState): GameState {
  let s = state;
  const start = state.incidentLogCursor;
  for (let i = start; i < state.log.length; i++) {
    const e = state.log[i];
    const m = LOG_KIND_MAP[e.kind];
    if (!m) continue;
    s = recordIncident(s, { type: m.type, severity: m.severity, summary: e.message, week: e.tick, data: e.data });
  }
  return { ...s, incidentLogCursor: state.log.length };
}

// ── selectors ────────────────────────────────────────────────────────────────────────────────

/** The last `n` incidents, NEWEST FIRST — for the readout feed. */
export function recentIncidents(state: GameState, n: number): IncidentRecord[] {
  if (n <= 0) return [];
  return state.incidents.slice(Math.max(0, state.incidents.length - n)).reverse();
}

/** All incidents of a given type, in chronological (seq) order. */
export function incidentsByType(state: GameState, type: IncidentType): IncidentRecord[] {
  return state.incidents.filter((r) => r.type === type);
}

/** The most recent incident, or undefined if none yet. */
export function lastIncident(state: GameState): IncidentRecord | undefined {
  return state.incidents[state.incidents.length - 1];
}

/** Count incidents, optionally of a single type. */
export function incidentCount(state: GameState, type?: IncidentType): number {
  return type ? incidentsByType(state, type).length : state.incidents.length;
}
