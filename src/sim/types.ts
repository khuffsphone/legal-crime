// Core data model for the Legal Crime simulation. Pure types — no Phaser, no DOM.
// See LEGAL_CRIME_DESIGN.md §3.

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
