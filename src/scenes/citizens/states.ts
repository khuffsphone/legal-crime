// Citizen Life P0 (T4 + T9) — the PURE citizen state machine + local loiter/queue/cluster rules. Phaser-free.
// Layered ONTO AmbientLife's existing wander/window-shop pause — NOT a forked actor sim (spec §6.1). No needs,
// jobs, inventory, home assignment, or persistent identity (spec §6.1 / §13). Timer-driven + deterministic:
// entry is a pure roll, duration is a clamped band, exit is a timer. These helpers own the mutation-sensitive
// numbers (duration clamps, pause chances, cluster caps, panic-speed cap) so they can be tested exactly.

import type { CitizenState } from './roles';

/** Per-state duration band in SECONDS [min, max] (spec §6.2). walk/spawn/despawn are not timer-bounded here
 * (walk is indefinite until a pause roll; spawn/despawn are instant) and carry no band. */
export const STATE_DURATION: Partial<Record<CitizenState, readonly [number, number]>> = {
  loiter: [1.5, 6.0],
  windowShop: [1.5, 5.0],
  queue: [3.0, 8.0],
  react: [0.35, 1.2],
  panic: [2.0, 6.0],
  enterBuilding: [0.4, 0.8],
  exitBuilding: [0.2, 0.6],
};

/** Dead-end beat for a pedestrian, reused from the existing AmbientLife constant (spec §6.3). */
export const DEAD_END_PAUSE = 1.4;

/** Base per-roll pause chance while walking — matches the existing 6% window-shop flavour (spec §6.3). */
export const BASE_PAUSE_CHANCE = 0.06;
export const FRONTAGE_PAUSE_BONUS = 0.08;   // +8% near storefront/residential frontage
export const PLAZA_LOITER_BONUS = 0.10;     // +10% in park_plaza / plaza
export const ANCHOR_QUEUE_BONUS = 0.12;     // +12% at vendor/news/produce anchors (if cluster cap permits)

/** Panic is VISUAL-ONLY (spec §6.3 / §7.1): a speed nudge, never a gameplay signal. Multiplier band over the
 * actor's base speed, hard-capped at 0.70 tiles/s so a fleeing citizen never outruns the readable ambient
 * calm. */
export const PANIC_SPEED_MULT_MIN = 1.35;
export const PANIC_SPEED_MULT_MAX = 1.60;
export const PANIC_SPEED_CAP = 0.70;

/** Reaction cooldown band per citizen (spec §6.3) — deterministic jitter so a citizen can't stutter-react. */
export const REACT_COOLDOWN_MIN = 6.0;
export const REACT_COOLDOWN_MAX = 12.0;

/** The local placement context a citizen occupies, derived from cheap tile heuristics (PR#62 zones are not on
 * this branch — recon §11 flag 7). Drives pause chance + cluster cap. */
export type PauseContext = 'generic' | 'frontage' | 'anchor' | 'plaza' | 'apron';

/** Max citizens that may cluster (pause within ~one tile / one anchor radius) per context — MVP sizes
 * (spec §4.5). Hard rule: a cluster is VISUAL only, never a collision/path block (spec §4.5). */
export const CLUSTER_CAP_MAX: Record<PauseContext, number> = {
  generic: 2,
  frontage: 3,
  anchor: 3,
  plaza: 4,
  apron: 2,
};

/** The pause CHANCE per walk roll for a context (spec §6.3). generic = base; frontage/plaza/anchor add their
 * bonus on top of base. Clamped to a sane ceiling. Pure. */
export function pauseChance(ctx: PauseContext): number {
  let c = BASE_PAUSE_CHANCE;
  if (ctx === 'frontage') c += FRONTAGE_PAUSE_BONUS;
  else if (ctx === 'plaza') c += PLAZA_LOITER_BONUS;
  else if (ctx === 'anchor') c += ANCHOR_QUEUE_BONUS;
  return c > 0.95 ? 0.95 : c;
}

/** The pause STATE a context resolves to when a pause fires (spec §6.2/§6.4): plaza→loiter, frontage→
 * windowShop, anchor→queue, apron→loiter, generic→loiter. Pure. */
export function pauseStateFor(ctx: PauseContext): CitizenState {
  switch (ctx) {
    case 'frontage': return 'windowShop';
    case 'anchor': return 'queue';
    case 'plaza': return 'loiter';
    case 'apron': return 'loiter';
    default: return 'loiter';
  }
}

/** A deterministic clamped duration (seconds) for a timer-bounded state, given a [0,1) roll. States without a
 * band (walk/spawn/despawn) return 0. Pure. The band clamp is load-bearing — the T4 mutation test flips it. */
export function stateDuration(state: CitizenState, roll01: number): number {
  const band = STATE_DURATION[state];
  if (!band) return 0;
  const [lo, hi] = band;
  const t = roll01 < 0 ? 0 : roll01 > 1 ? 1 : roll01;
  return lo + (hi - lo) * t;
}

/** Whether a timer-bounded state has elapsed (the deterministic EXIT condition, spec §6.2). Pure. */
export function stateExpired(elapsed: number, duration: number): boolean {
  return elapsed >= duration;
}

/** The visual panic speed for an actor (spec §6.3): base × band-multiplier, hard-capped. Pure. */
export function panicSpeed(baseSpeed: number, roll01: number): number {
  const t = roll01 < 0 ? 0 : roll01 > 1 ? 1 : roll01;
  const mult = PANIC_SPEED_MULT_MIN + (PANIC_SPEED_MULT_MAX - PANIC_SPEED_MULT_MIN) * t;
  const s = baseSpeed * mult;
  return s > PANIC_SPEED_CAP ? PANIC_SPEED_CAP : s;
}

/** A deterministic reaction cooldown (seconds) in [6,12] (spec §6.3). Pure. */
export function reactionCooldown(roll01: number): number {
  const t = roll01 < 0 ? 0 : roll01 > 1 ? 1 : roll01;
  return REACT_COOLDOWN_MIN + (REACT_COOLDOWN_MAX - REACT_COOLDOWN_MIN) * t;
}

/** Whether a citizen may JOIN a cluster of the given current size in a context — enforces the visual cluster
 * cap (spec §4.5 / §6.2 "queue cap exceeded" exit). Pure. */
export function canJoinCluster(ctx: PauseContext, currentSize: number): boolean {
  return currentSize < CLUSTER_CAP_MAX[ctx];
}
