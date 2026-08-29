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
  | 'unit.down' | 'collector.robbed' | 'collector.banked' | 'hq.attack'
  | 'rival.telegraph'
  | 'bribe.landed' | 'bribe.failed'
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
  // LANE K — a collector REPORTED IN (banked its take): routine GOOD news. Positional (the player's own HQ
  // vault, so the row is click-to-jump) but it must NOT spam an edge arrow or a minimap ping every week.
  'collector.banked': { tier: 'info',     positional: true,  dedupe: false, alert: false, ping: false },
  'hq.attack':        { tier: 'critical', positional: true,  dedupe: false, alert: true,  ping: true },
  // COMBAT DEPTH FINALIZE (Part C-1) — the rival STRIKE telegraph: a pre-strike WARNING (the player's one
  // defensive window). Positional (it has a where), raises an edge alert + a ping, and never dedupes (each
  // committed strike is its own state-change beat).
  'rival.telegraph':  { tier: 'warning',  positional: true,  dedupe: false, alert: true,  ping: true },
  // LANE K — greasing a bribe channel is an ABSTRACT channel action with no world location (like federal),
  // so both outcomes are NON-positional: they log + (landed) read as gain / (failed) as a warning, with no
  // arrow and no ping. A bribe is the PLAYER's own action — it can never leak a rival's whereabouts.
  'bribe.landed':     { tier: 'info',     positional: false, dedupe: false, alert: false, ping: false },
  'bribe.failed':     { tier: 'warning',  positional: false, dedupe: false, alert: false, ping: false },
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

export interface CombatInfoIntent {
  kind: EventKind;
  message: string;
  gx: number;
  gy: number;
}

/** The single NO-X-RAY decision for combat information. Hidden rival-vs-rival combat must be
 * observationally identical to empty fog across The Wire, minimap pings, edge alerts and [Q]. */
export function combatInfoIntent(
  ev: { kind: 'hit' | 'down'; faction: string; gx: number; gy: number },
  playerFamilyId: string,
  visible: boolean,
): CombatInfoIntent | null {
  if (!visible) return null;
  const faction = ev.faction === playerFamilyId ? 'player' : 'rival';
  return {
    kind: combatEventKind(ev.kind),
    message: ev.kind === 'down' ? `a ${faction} thug went DOWN` : `${faction} thug took a hit`,
    gx: ev.gx,
    gy: ev.gy,
  };
}

/** An embodied-extortion transition → its kind (or null for an intermediate transition that isn't logged). */
export function extortionEventKind(ev: { converted: boolean; retook: boolean; failed: boolean }): EventKind | null {
  if (ev.converted) return ev.retook ? 'front.retaken' : 'front.converted';
  if (ev.failed) return 'extort.failed';
  return null;
}

/** A [G] grease outcome → bribe.landed (the channel was paid) or bribe.failed (couldn't afford it). LANE K. */
export function bribeEventKind(landed: boolean): EventKind {
  return landed ? 'bribe.landed' : 'bribe.failed';
}

/** A turf-war capture → district.lost (the player lost it) or district.captured (the player took it). */
export function captureEventKind(lostByPlayer: boolean): EventKind {
  return lostByPlayer ? 'district.lost' : 'district.captured';
}
