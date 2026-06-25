// Core data model for the Legal Crime simulation. Pure types — no Phaser, no DOM.
// See LEGAL_CRIME_DESIGN.md §3.

import type { MovableUnit } from './movement';
import type { IncidentRecord } from './ledger';
import type { Trait } from './traits';
import type { EmbodiedExtortionAct } from './extortionEmbodied';
import type { CrewTie } from './crew';

export type GameStatus = 'playing' | 'won' | 'lost';
export type LossReason = 'bankrupt' | 'dead' | 'busted';

/** Channels a family can bribe (Phase 13 / S3). Police → fewer raids; Judges → survive a
 * bust; Politicians → faster heat decay; Feds → shield against federal shocks (Phase 16). */
export type BribeChannel = 'police' | 'judges' | 'politicians' | 'feds';

/** Illegal operation kinds a family can establish (Phase 3). */
export type OperationKind = 'numbers' | 'smuggling' | 'speakeasy' | 'protection';

/** A business is either a legitimate `front` (extortable) or an illegal operation. */
export type BusinessKind = 'front' | OperationKind;

/** RTS-30c-2a — the channel-gated weapon-tier ENFORCER / specialist roles (abstract strategy units; a
 * plain thug has none). Drives the recruit gate/cost/heat, the procedural silhouette, and the turf-war
 * muscle-presence weight. NOT a depiction — a stat + a readable silhouette. */
export type WeaponTier = 'pistol' | 'shotgun' | 'rifle' | 'hitman' | 'demolitions';

/** Where a gangster is assigned: idle, guarding a district, or running an operation. */
export type GangsterAssignment =
  | { type: 'idle' }
  | { type: 'guard'; districtId: string }
  | { type: 'operation'; businessId: string };

export interface Gangster {
  id: string;
  name: string;
  skill: number; // 1..10
  loyalty: number; // 0..100
  upkeep: number; // cash per tick
  assignment: GangsterAssignment;
  /** Character traits with mechanical effects (RTS-14). Absent ⇒ a plain, effectless crewman, so
   * a trait-less roster behaves exactly as before. Assigned (seeded, cursor-safe) at recruitment. */
  traits?: Trait[];
}

export interface Family {
  id: string;
  name: string;
  isPlayer: boolean;
  cash: number;
  /** Portion of `cash` that is illicit (0 ≤ dirtyCash ≤ cash). Clean = cash − dirtyCash.
   * Crime income arrives dirty; laundering converts it to clean. (Phase 11 / S1) */
  dirtyCash: number;
  heat: number; // 0..HEAT_MAX
  /** Total standing bribe = sum of all channels; the per-tick retainer cost. Kept in sync
   * with `bribes` by the bribe/setBribe commands. (Phase 13) */
  bribeLevel: number;
  /** Standing bribe allocated per channel (Phase 13 / S3). */
  bribes: Record<BribeChannel, number>;
  /** Outstanding loan-shark debt (Phase 15 / S5). A cash shortfall is auto-loaned into
   * debt, which compounds interest each tick; too much debt is bankruptcy. */
  debt: number;
  /** Highest federal-warning tier reached so far (Phase 18). 0 = none; FED_MAX_WARN_LEVEL
   * = "bust imminent". A terminal federal bust requires this to be armed. */
  fedWarningLevel: number;
  /** Whether a terminal federal bust is currently possible — only armed after the imminent
   * warning has held for FED_ARM_DELAY ticks, so a bust is always telegraphed. (Phase 18/19) */
  bustArmed: boolean;
  /** Consecutive ticks the family has sat at the imminent federal tier (Phase 19). Drives
   * the arming delay; resets when exposure drops below the imminent tier. */
  fedImminentTicks: number;
  alive: boolean; // boss alive; false => family eliminated
  gangsters: Gangster[];
  /** HQ integrity 0..100 (RTS-17). Absent ⇒ full (100). Assassination/HQ strikes reduce it; at
   * 0 the family's HQ is destroyed and the family is eliminated. Additive, default-safe. */
  hqIntegrity?: number;
  /** Federal lockout pulses remaining (RTS-17) — a rival under a Bureau lockout cannot expand and
   * bleeds. Absent ⇒ 0. */
  lockoutTicks?: number;
  /** Aggression toward the player (RTS-17), raised by being attacked and decaying over pulses —
   * drives retaliation (harder pushes onto your turf, HQ strikes). Absent ⇒ 0. */
  aggro?: number;
  /** Interpersonal ties between crew members (RTS-14). Absent ⇒ none; a wronged member's ally
   * loses heart too. Additive — default-absent so prior states are byte-identical. */
  ties?: CrewTie[];
  /** RTS-24 — civic INFLUENCE 0..INFLUENCE_MAX (the GET ELECTED MAYOR path). Accrues weekly from
   * City Hall greasing + turf + legit fronts. Absent ⇒ 0. Additive, default-safe. */
  influence?: number;
  /** RTS-24 — goods held for the Market (goodId → units). Absent ⇒ none. */
  inventory?: Record<string, number>;
}

export interface Business {
  id: string;
  name: string;
  kind: BusinessKind;
  baseIncome: number; // per-tick gross
  heatPerTick: number; // heat generated while operating (illegal)
  extortedBy?: string; // familyId currently extorting (fronts only)
  ownerFamily?: string; // familyId running this illegal operation
  districtId: string;
  /** Takings that have piled up and not yet been collected (Phase 12 / S2). Income accrues
   * here each tick and is realized only when a Collector run gathers it. Optional/absent is
   * treated as 0; real construction paths initialize it. */
  uncollected?: number;
  /** Upgrade tier of an illegal operation (Phase 14 / S4). Absent ⇒ tier 1. Higher tiers
   * multiply income AND heat. Fronts ignore this. */
  tier?: number;
  /** RTS-22: weeks this business is SHUT DOWN (an ATTACK temporarily stops it producing). While
   * > 0 it accrues NOTHING; decremented each settlement. Absent ⇒ open/0. Additive, default-safe. */
  shutdownTicks?: number;
  /** RTS-24 — vice-upgrade branch this operation has been converted along (bootlegging / gambling /
   * entertainment / troubleshooting). Absent ⇒ not yet converted. */
  viceBranch?: string;
  /** RTS-24 — how many vice rungs this operation has climbed (0..VICE_RUNG_MAX). Absent ⇒ 0. */
  viceRung?: number;
  /** RTS-29 — muscle visits paid toward converting a front (extort-as-repeated-visits). Absent ⇒ 0.
   * At `extortResistance` visits the front converts to extorted. Additive, default-safe. */
  extortVisits?: number;
}

export interface District {
  id: string;
  name: string;
  /** familyId -> control points (0..CONTROL_MAX). Not forced to sum to 100. */
  control: Record<string, number>;
  policePresence: number; // 0..100
  businesses: Business[];
  /** Wealth tier 1..5 (RTS-16) — richer districts have fatter businesses and are worth more.
   * Absent ⇒ derived by districtIdentity from the district index. */
  wealth?: number;
  /** How readily the law leans on this district, 0..1 (RTS-16). Scales heat pressure. */
  heatSensitivity?: number;
  /** Neighbourhood archetype (RTS-16) — Chicago flavour + identity. */
  archetype?: string;
  /** Ids of adjacent districts (RTS-16) — the fronts a family can push along. */
  neighbors?: string[];
}

/** A queued hit, ordered by one family against another, resolved at the next tick. */
export interface HitOrder {
  attackerId: string;
  targetId: string;
  orderedTick: number;
}

/** RTS-24 — a tradeable good on THE MARKET. Price drifts toward base; supply/demand move with the
 * player's footprint and events. */
export interface MarketGood {
  id: string;
  name: string;
  basePrice: number;
  price: number;
  /** 0..100 each — the supply/demand gauge that narrates the market. */
  supply: number;
  demand: number;
}

/** RTS-24 — the market state (a small set of vice commodities). Additive on GameState. */
export interface MarketState {
  goods: MarketGood[];
}

/** RTS-22 — an automated collection route: a collector cycles these businesses in order, gathering
 * the family's protection takings and banking them at HQ, then loops. Still interceptable in
 * transit (the signature bottleneck is preserved). Pure data; the route logic lives in routes.ts. */
export interface CollectionRoute {
  id: string;
  familyId: string;
  /** Business ids to visit, in order. */
  stops: string[];
}

/** Systemic shock kinds (Phase 16). */
export type ShockKind = 'crackdown' | 'boom' | 'bust' | 'audit' | 'gangWar' | 'speakeasyRaid';

/** A shock currently in effect, with the ticks it has left to run (durational shocks). */
export interface ActiveShock {
  kind: ShockKind;
  ticksRemaining: number;
}

/** Structured, append-only event for UI/debug. */
export interface GameEvent {
  tick: number;
  kind: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface GameState {
  seed: number;
  rngState: number; // serialized PRNG cursor
  tick: number;
  status: GameStatus;
  lossReason?: LossReason;
  player: Family;
  rivals: Family[];
  districts: District[];
  pendingHits: HitOrder[];
  /** Shocks currently in effect (Phase 16). */
  activeShocks: ActiveShock[];
  /** Whether the systemic-shock system rolls each tick. Off in isolated unit tests; on in
   * real games. */
  shocksEnabled: boolean;
  /** Real-time seconds accumulated toward the next week settlement (RTS-0). Driven by
   * advanceClock; the economic tick itself never touches it. */
  weekElapsed: number;
  /** Spatial units moving on the map in real time (RTS-2). Advanced by the movement system
   * via `update(state, dt)`, independent of the week clock; the economic tick never touches
   * them. Empty until the RTS control layer (RTS-3+) spawns units. */
  units: MovableUnit[];
  /** Tutorial safety net (RTS-12): how many upcoming collector runs are guaranteed safe from
   * interception. startCollectorRun marks a run protected and decrements this while > 0, so a
   * new player's first paycheck cannot be robbed before they're taught the counter. Default 0. */
  tutorialFreeRuns: number;
  /** Real-time seconds accumulated toward the next strategic pulse (RTS-16) — the cadence on
   * which rival families make territorial moves. Driven by advanceStrategy; default 0. */
  strategyElapsed: number;
  /** RTS-22 — automated collection routes (additive; absent ⇒ none, so prior states are
   * byte-identical and the manual collector path is unchanged). */
  routes?: CollectionRoute[];
  /** RTS-35b — active EMBODIED-EXTORTION acts (a thug walking to + shaking down a front). Additive;
   * absent ⇒ none. Driven by the real-time wrapper (advanceEmbodiedExtortion); the tick never sees them. */
  extortionActs?: EmbodiedExtortionAct[];
  /** RTS-24 — THE MARKET (trade mini-game). Additive; absent ⇒ no market yet. */
  market?: MarketState;
  /** RTS-29 — the week before which rival TERRITORIAL aggression is dormant (the peaceful runway).
   * advanceStrategy fires no pulses while state.tick < this. Absent/0 ⇒ no dormancy (prior states +
   * tests behave exactly as before). Additive, default-safe. */
  rivalWakeWeek?: number;
  /** Real-time seconds the player's crew must regroup before the next offensive action (RTS-19).
   * Set by every offence (raid/sabotage/hit/lockout) and bled down in the real-time wrapper; the
   * offence gates refuse while it is > 0, so heavy hits cannot be chained into an instant board
   * flip. Absent/0 ⇒ ready. Additive, default-safe. */
  offenseCooldown?: number;
  /** Causal incident ledger (RTS-9): a bounded, curated, newest-last list of structured records
   * projected from `log` + settlement summaries. Additive observe layer — no mechanic writes it;
   * the ledger functions do. Empty by default. */
  incidents: IncidentRecord[];
  /** Monotonic incident sequence counter (RTS-9). Never decreases, even when old incidents are
   * dropped by the cap — so a record's seq is a stable identity. */
  incidentSeq: number;
  /** How far into `log` the ledger harvester has already projected (RTS-9). */
  incidentLogCursor: number;
  /** RTS-30c-1 — active turf-war CONTESTS (a rival invading a border district). Additive; absent ⇒
   * no war yet, so prior states/tests are byte-identical. Drives the CONTESTED status + the per-
   * district collector vulnerability. */
  contests?: Contest[];
  /** Real-time seconds accumulated toward the next turf-war pulse (RTS-30c-1). Additive, default 0. */
  contestElapsed?: number;
  log: GameEvent[];
}

/** RTS-30c-1 — one active turf war: `invaderId` is pressing the player out of `districtId`. `pressure`
 * ∈ [-100,100] shifts by MUSCLE PRESENCE (rival minus player) over time; crossing +flip flips a player
 * business to the rival (eroding hold %), crossing -pushout repels the invader (the player held). The
 * spawned rival muscle unit ids are tracked so the scene can despawn them when the contest ends. */
export interface Contest {
  districtId: string;
  invaderId: string;
  pressure: number;
  /** Scene-spawned rival muscle unit ids fighting this contest (despawned when it ends). */
  muscleIds: string[];
}

/** Convenience: iterate the player + all rivals. */
export function allFamilies(state: GameState): Family[] {
  return [state.player, ...state.rivals];
}

/** Find any family by id (player or rival). Returns undefined if absent. */
export function findFamily(state: GameState, id: string): Family | undefined {
  if (state.player.id === id) return state.player;
  return state.rivals.find((r) => r.id === id);
}

/** Find a gangster and its owning family by gangster id. */
export function findGangster(
  state: GameState,
  gangsterId: string,
): { family: Family; gangster: Gangster } | undefined {
  for (const family of allFamilies(state)) {
    const gangster = family.gangsters.find((g) => g.id === gangsterId);
    if (gangster) return { family, gangster };
  }
  return undefined;
}
