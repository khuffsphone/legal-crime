// Core data model for the Legal Crime simulation. Pure types — no Phaser, no DOM.
// See LEGAL_CRIME_DESIGN.md §3.

import type { MovableUnit } from './movement';
import type { IncidentRecord } from './ledger';

export type GameStatus = 'playing' | 'won' | 'lost';
export type LossReason = 'bankrupt' | 'dead' | 'busted';

/** Channels a family can bribe (Phase 13 / S3). Police → fewer raids; Judges → survive a
 * bust; Politicians → faster heat decay; Feds → shield against federal shocks (Phase 16). */
export type BribeChannel = 'police' | 'judges' | 'politicians' | 'feds';

/** Illegal operation kinds a family can establish (Phase 3). */
export type OperationKind = 'numbers' | 'smuggling' | 'speakeasy' | 'protection';

/** A business is either a legitimate `front` (extortable) or an illegal operation. */
export type BusinessKind = 'front' | OperationKind;

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
}

export interface District {
  id: string;
  name: string;
  /** familyId -> control points (0..CONTROL_MAX). Not forced to sum to 100. */
  control: Record<string, number>;
  policePresence: number; // 0..100
  businesses: Business[];
}

/** A queued hit, ordered by one family against another, resolved at the next tick. */
export interface HitOrder {
  attackerId: string;
  targetId: string;
  orderedTick: number;
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
  /** Causal incident ledger (RTS-9): a bounded, curated, newest-last list of structured records
   * projected from `log` + settlement summaries. Additive observe layer — no mechanic writes it;
   * the ledger functions do. Empty by default. */
  incidents: IncidentRecord[];
  /** Monotonic incident sequence counter (RTS-9). Never decreases, even when old incidents are
   * dropped by the cap — so a record's seq is a stable identity. */
  incidentSeq: number;
  /** How far into `log` the ledger harvester has already projected (RTS-9). */
  incidentLogCursor: number;
  log: GameEvent[];
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
