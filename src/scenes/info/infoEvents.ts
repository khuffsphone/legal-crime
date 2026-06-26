// INFO-FEEDBACK — the EVENT TAXONOMY + adapter (pure; Phaser-free, render-side). Maps the sim's existing
// real-time events to a small, canon-ruled taxonomy that drives the log / edge-alerts / minimap-pings. This
// READS sim state — it adds no mechanics and no sim state.
//
// CANON RULINGS encoded here:
//  #4 — STATE CHANGES (front converted, district lost, unit down, collector robbed, federal threshold, HQ
//       attack) log ALWAYS and NEVER dedupe; combat BEATS (individual hits) are INFO-tier and MUST dedupe/
//       throttle (no per-swing spam — the audio-mix-mud lesson).
//  #3 — FEDERAL events are GLOBAL/non-positional: log + a global banner, NO directional arrow, NO ping.

export type EventTier = 'info' | 'warning' | 'critical';

export type EventKind =
  | 'front.converted' | 'front.retaken' | 'extort.failed'
  | 'district.lost' | 'district.captured' | 'rival.fallen'
  | 'unit.down' | 'collector.robbed' | 'hq.attack'
  | 'federal.threshold'
  | 'combat.hit';

export interface EventMeta {
  tier: EventTier;
  /** Has a world location (drives a ping / an edge arrow). Federal events are NON-positional (#3). */
  positional: boolean;
  /** Combat beats coalesce; state changes never do (#4). */
  dedupe: boolean;
  /** Raises a screen-edge alert when off-screen. */
  alert: boolean;
  /** Drops a minimap ping. */
  ping: boolean;
}

/** The canon-ruled taxonomy. State changes: dedupe=false. Combat beats: dedupe=true, no alert/ping. Federal:
 * positional=false, alert=false, ping=false (#3) — it rides the global banner instead. */
export const EVENT_TAXONOMY: Record<EventKind, EventMeta> = {
  'front.converted':  { tier: 'info',     positional: true,  dedupe: false, alert: false, ping: true },
  'front.retaken':    { tier: 'info',     positional: true,  dedupe: false, alert: false, ping: true },
  'extort.failed':    { tier: 'warning',  positional: true,  dedupe: false, alert: true,  ping: true },
  'district.lost':    { tier: 'critical', positional: true,  dedupe: false, alert: true,  ping: true },
  'district.captured':{ tier: 'info',     positional: true,  dedupe: false, alert: false, ping: true },
  'rival.fallen':     { tier: 'info',     positional: false, dedupe: false, alert: false, ping: false },
  'unit.down':        { tier: 'warning',  positional: true,  dedupe: false, alert: true,  ping: true },
  'collector.robbed': { tier: 'warning',  positional: true,  dedupe: false, alert: true,  ping: true },
  'hq.attack':        { tier: 'critical', positional: true,  dedupe: false, alert: true,  ping: true },
  'federal.threshold':{ tier: 'critical', positional: false, dedupe: false, alert: false, ping: false }, // #3
  'combat.hit':       { tier: 'info',     positional: true,  dedupe: true,  alert: false, ping: false }, // #4
};

export function metaFor(kind: EventKind): EventMeta {
  return EVENT_TAXONOMY[kind];
}

// ── classifiers: map an existing sim event → its taxonomy kind ───────────────────────────────────
/** A 35a combat beat: a `down` is a STATE CHANGE (unit.down, never dedupes); a `hit` is a combat BEAT
 * (combat.hit, throttled). #4. */
export function combatEventKind(kind: 'hit' | 'down'): EventKind {
  return kind === 'down' ? 'unit.down' : 'combat.hit';
}

/** An embodied-extortion transition → its kind (or null for an intermediate transition that isn't logged). */
export function extortionEventKind(ev: { converted: boolean; retook: boolean; failed: boolean }): EventKind | null {
  if (ev.converted) return ev.retook ? 'front.retaken' : 'front.converted';
  if (ev.failed) return 'extort.failed';
  return null;
}

/** A turf-war capture → district.lost (the player lost it) or district.captured (the player took it). */
export function captureEventKind(lostByPlayer: boolean): EventKind {
  return lostByPlayer ? 'district.lost' : 'district.captured';
}
