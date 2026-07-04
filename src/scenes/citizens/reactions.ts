// Citizen Life P0 (T10, Rider R3) — the PURE visible-crime reaction model + the event-source ADAPTER stub.
// Phaser-free. MVP reactions are VISUAL-ONLY and VISIBLE-ONLY (spec §7.1/§7.2): a citizen may pause or flee,
// but NOTHING here writes heat, federal case state, economy, incidents, fog, hidden intel, or unit orders.
// NO-X-RAY (spec §7.2/§9.4): a hidden event (visible:false) produces NO reaction — a citizen must never leak
// unrevealed rival activity by reacting to it.
//
// WIRE-UP STATUS (Rider R3): AmbientLife.update() is called (dt, cam, reveal) with NO event stream, and there
// is no IsoScene-free per-frame crime-event seam (the visible signals — this.units attackUntil/hitUntil,
// state.downedBodies, state.extortionActs — are only reachable by editing the scene's update call). So per R3
// this ships as the tested adapter INTERFACE + pure reaction logic; the citizen layer accepts an OPTIONAL,
// currently-dormant event list. Feeding it is the serialized T13 wire-up (behind the combat merge).

/** The visible crime events a citizen can react to (spec §7.3 matrix). */
export type CitizenEventKind =
  | 'combat' | 'shakedown' | 'sabotage' | 'downedBody' | 'copPursuit' | 'raid' | 'crewNearby';

/** A single scene-visible event. `visible` is the fog/reveal verdict at the event tile — a false value means
 * the event is hidden and MUST NOT drive any reaction (NO-X-RAY). Position is in grid tiles. */
export interface CitizenEvent {
  kind: CitizenEventKind;
  gx: number;
  gy: number;
  visible: boolean;
}

/** The reaction a citizen takes. 'none' = no eligible event; 'pause' = stop/look/recoil; 'panic' = flee on the
 * sidewalk graph (visual only, capped speed — see states.panicSpeed). */
export type CitizenReactionKind = 'none' | 'pause' | 'panic';

export interface CitizenReaction {
  kind: CitizenReactionKind;
  /** The event that drove the reaction (null when kind==='none'). */
  eventKind: CitizenEventKind | null;
  /** The event tile the citizen orients away from (for flee heading); NaN when none. */
  sourceGx: number;
  sourceGy: number;
}

const NO_REACTION: CitizenReaction = { kind: 'none', eventKind: null, sourceGx: NaN, sourceGy: NaN };

interface ReactionSpec {
  /** Reaction trigger radius (tiles). */
  radius: number;
  /** Panic-vs-pause probability band [min,max] over the roll. */
  panicMin: number;
  panicMax: number;
  /** Overlap priority — LOWER wins (spec §7.4: downed/combat=1 highest). */
  priority: number;
  /** MVP shipping status (spec §7.3). DEFER kinds are still handled if fed; the scene decides what to feed. */
  status: 'MVP' | 'MVP-lite' | 'DEFER';
}

/** The reaction matrix (spec §7.3 radii + §7.4 priorities). Radii use the outer bound of the spec's range as
 * the trigger radius. */
export const REACTION_MATRIX: Record<CitizenEventKind, ReactionSpec> = {
  combat: { radius: 5.0, panicMin: 0.35, panicMax: 0.60, priority: 1, status: 'MVP' },
  downedBody: { radius: 4.0, panicMin: 0.20, panicMax: 0.40, priority: 1, status: 'MVP' },
  sabotage: { radius: 5.0, panicMin: 0.50, panicMax: 0.80, priority: 2, status: 'MVP' },
  raid: { radius: 7.0, panicMin: 0.60, panicMax: 0.90, priority: 2, status: 'DEFER' },
  shakedown: { radius: 3.5, panicMin: 0.10, panicMax: 0.30, priority: 3, status: 'MVP' },
  copPursuit: { radius: 4.0, panicMin: 0.20, panicMax: 0.40, priority: 4, status: 'DEFER' },
  crewNearby: { radius: 2.5, panicMin: 0.0, panicMax: 0.0, priority: 5, status: 'MVP-lite' },
};

/** Squared tile distance (avoids a sqrt in the hot path). Pure. */
function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * The reaction (if any) a citizen at (cx,cy) takes to a set of visible events, given a deterministic [0,1)
 * roll. Picks the highest-priority (lowest number) VISIBLE event whose trigger radius contains the citizen,
 * then rolls panic-vs-pause against that event's band. Returns 'none' when no eligible event exists.
 *
 * PURE + NO-X-RAY: hidden events (visible:false) and out-of-radius events are ignored; the function writes
 * nothing and reads no global state — it CANNOT touch heat/federal/economy/incidents (spec §7.1/§7.6).
 */
export function reactionFor(events: readonly CitizenEvent[], cx: number, cy: number, roll01: number): CitizenReaction {
  let best: CitizenEvent | null = null;
  let bestSpec: ReactionSpec | null = null;
  for (const e of events) {
    if (!e.visible) continue; // NO-X-RAY: never react to a hidden event
    const spec = REACTION_MATRIX[e.kind];
    if (dist2(cx, cy, e.gx, e.gy) > spec.radius * spec.radius) continue; // out of range
    if (!best || spec.priority < bestSpec!.priority) { best = e; bestSpec = spec; }
  }
  if (!best || !bestSpec) return NO_REACTION;
  const t = roll01 < 0 ? 0 : roll01 > 1 ? 1 : roll01;
  const panicChance = bestSpec.panicMin + (bestSpec.panicMax - bestSpec.panicMin) * t;
  const kind: CitizenReactionKind = t < panicChance ? 'panic' : 'pause';
  return { kind, eventKind: best.kind, sourceGx: best.gx, sourceGy: best.gy };
}

/**
 * The event-source ADAPTER (Rider R3 stub). A future T13 wire-up implements this scene-side (reading the
 * render-side UnitView combat windows + state.downedBodies + state.extortionActs, each gated by the SAME
 * reveal predicate) and hands its output to the citizen layer per frame. MVP wires NO source — reactions stay
 * dormant, which is why they cannot leak hidden activity today.
 */
export interface CitizenEventSource {
  /** Collect the frame's scene-visible crime events. Each event's `visible` MUST already be the fog verdict. */
  collect(): CitizenEvent[];
}
