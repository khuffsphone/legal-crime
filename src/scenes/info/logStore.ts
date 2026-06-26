// INFO-FEEDBACK — "THE WIRE — LOG" store (pure; Phaser-free). A recent-first scrollback of taxonomy events.
// CANON: state changes log ALWAYS + never dedupe (#4); combat beats coalesce within a throttle window (#4);
// ~250 retained, critical events outlive non-critical when the cap bites; SESSION-ONLY (#6) — there is NO
// log persistence here. ⭐ When the log should persist it folds into the EXISTING save state (saveLoad.ts) as
// additive state — NOT wired this slice (see the hook comment below).

import { metaFor, type EventKind, type EventTier } from './infoEvents';

export const MAX_LOG = 250;
/** Two combat beats of the same kind closer than this coalesce into one row (no per-swing spam). */
export const COMBAT_THROTTLE_MS = 1200;

export interface LogEntry {
  id: number;
  kind: EventKind;
  tier: EventTier;
  message: string;
  /** World location (absent for non-positional federal/rival.fallen events). */
  gx?: number;
  gy?: number;
  /** When it happened (ms; caller-supplied, so the store stays clock-free + pure). */
  t: number;
  /** How many coalesced beats this row represents (combat throttle). */
  count: number;
  /** Unread until the player jumps to / focuses it. */
  unread: boolean;
}

export interface LogStore {
  entries: LogEntry[]; // recent-FIRST
  nextId: number;
}

export function initLog(): LogStore {
  return { entries: [], nextId: 1 };
}

export interface LogInput {
  kind: EventKind;
  message: string;
  gx?: number;
  gy?: number;
  t: number;
}

/**
 * Append an event to the log. STATE CHANGES always append a new row (never dedupe). A combat BEAT coalesces
 * into the most-recent matching combat row if it is within COMBAT_THROTTLE_MS (incrementing its count +
 * bumping its time) instead of spamming a new row. Caps at MAX_LOG, dropping the OLDEST NON-CRITICAL row
 * first so critical events are retained longer. Pure — returns a new store.
 */
export function pushLog(store: LogStore, input: LogInput): LogStore {
  const meta = metaFor(input.kind);
  // combat throttle (#4): fold into a recent same-kind beat instead of a new row.
  if (meta.dedupe) {
    const head = store.entries[0];
    if (head && head.kind === input.kind && input.t - head.t <= COMBAT_THROTTLE_MS) {
      const merged: LogEntry = { ...head, t: input.t, count: head.count + 1, message: input.message, gx: input.gx, gy: input.gy, unread: true };
      return { ...store, entries: [merged, ...store.entries.slice(1)] };
    }
  }
  const entry: LogEntry = {
    id: store.nextId,
    kind: input.kind,
    tier: meta.tier,
    message: input.message,
    ...(input.gx !== undefined ? { gx: input.gx } : {}),
    ...(input.gy !== undefined ? { gy: input.gy } : {}),
    t: input.t,
    count: 1,
    unread: true,
  };
  const entries = [entry, ...store.entries];
  return { entries: capEntries(entries), nextId: store.nextId + 1 };
}

/** Cap to MAX_LOG, dropping the oldest NON-CRITICAL rows first (critical events outlive the cap). Pure. */
function capEntries(entries: LogEntry[]): LogEntry[] {
  if (entries.length <= MAX_LOG) return entries;
  let over = entries.length - MAX_LOG;
  // walk oldest→newest dropping non-critical until we're within cap; if still over, drop oldest critical too.
  const keep: LogEntry[] = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (over > 0 && e.tier !== 'critical') { over--; continue; }
    keep.push(e);
  }
  keep.reverse();
  if (keep.length > MAX_LOG) return keep.slice(0, MAX_LOG); // still over (all critical) → hard cap, newest-first
  return keep;
}

/** The most recent UNREAD entry that has a location (for [Q] jump-to-alert preference of positional ones). */
export function latestUnreadPositional(store: LogStore): LogEntry | undefined {
  return store.entries.find((e) => e.unread && e.gx !== undefined);
}

/** Mark an entry read (e.g. after the player jumps to it). Pure. */
export function markRead(store: LogStore, id: number): LogStore {
  return { ...store, entries: store.entries.map((e) => (e.id === id ? { ...e, unread: false } : e)) };
}

export function unreadCount(store: LogStore): number {
  return store.entries.reduce((n, e) => n + (e.unread ? 1 : 0), 0);
}

// ⭐ PERSISTENCE HOOK (#6): the log is SESSION-ONLY for now (clears on reload). When it should persist, add an
// optional `wireLog?: LogEntry[]` to GameState (additive) and (de)serialize it in saveLoad.ts — do NOT build a
// separate persistence path. Not wired this slice.
