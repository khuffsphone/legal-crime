// RTS-5 — economy-on-map integration. Pure & deterministic; imports NO Phaser. The existing
// economic settlement is UNCHANGED — this module only wires it to spatial triggers:
//   • businesses and family HQs occupy tiles (a deterministic MapLayout);
//   • a COLLECTOR spawns at a business, carries the gathered take, and walks a real path to its
//     family HQ (intercept-able via RTS-4);
//   • on ARRIVAL the take is banked using the EXISTING collection rules (collectionSafety ×
//     collectionFraction skim, then creditCrimeIncome) — robbed in transit ⇒ nothing banked;
//   • extortion targets a building by its tile;
//   • map actions are control-gated (the same EXTORT_MIN_CONTROL foothold rule).

import {
  COLLECT_HEAT,
  EXTORT_MIN_CONTROL,
  HEAT_MAX,
  ROUTE_DANGER_RADIUS,
} from './constants';
import {
  collectibleBusinesses,
  collectionFraction,
  collectionSafety,
  uncollectedOf,
} from './collection';
import { applyCommand, muscleInDistrict } from './commands';
import { hostileEnforcerNear } from './gamefeel';
import { applyCrewLoyaltyEvent } from './crew';
import { creditCrimeIncome } from './laundering';
import { controlOf } from './territory';
import { Rng } from './rng';
import {
  spawnCollector,
  issueMove,
  unitTile,
  unitArrived,
  type MovableUnit,
} from './movement';
import { makeGrid, type NavGrid } from './pathfinding';
import { tileEquals, type GridPos } from './iso';
import { allBusinesses } from './economy';
import { findFamily, type GameState } from './types';

// ── map layout ────────────────────────────────────────────────────────────────────────────

export interface MapLayout {
  cols: number;
  rows: number;
  /** Tile of each family's HQ / collection house (deposit destination). */
  hqTiles: Record<string, GridPos>;
  /** Tile each business occupies. */
  businessTiles: Record<string, GridPos>;
}

const HQ_CORNERS: GridPos[] = [
  { gx: 15, gy: 15 },
  { gx: 15, gy: 0 },
  { gx: 0, gy: 15 },
  { gx: 0, gy: 0 },
];

/**
 * A deterministic spatial layout for the current world: each family gets an HQ corner (in the
 * player-then-rivals order), and each business gets a tile derived from its district index and
 * its order within that district. Pure — derived from the state, never mutates it.
 */
export function buildMapLayout(state: GameState, cols = 16, rows = 16): MapLayout {
  const hqTiles: Record<string, GridPos> = {};
  const families = [state.player, ...state.rivals];
  families.forEach((f, i) => {
    hqTiles[f.id] = HQ_CORNERS[i % HQ_CORNERS.length];
  });

  const businessTiles: Record<string, GridPos> = {};
  state.districts.forEach((d, di) => {
    d.businesses.forEach((b, bi) => {
      // District bands run down the map; businesses step across within a band. Clamped to grid.
      const gx = Math.min(cols - 2, 2 + bi * 2);
      const gy = Math.min(rows - 2, 1 + di * 3);
      businessTiles[b.id] = { gx, gy };
    });
  });

  return { cols, rows, hqTiles, businessTiles };
}

/** The nav grid for collector movement. Businesses are walkable storefronts (not blocked); the
 * grid exists so paths respect the map bounds and any future obstacles. */
export function navGridForLayout(layout: MapLayout, blocked: GridPos[] = []): NavGrid {
  return makeGrid(layout.cols, layout.rows, blocked);
}

export function businessTileOf(layout: MapLayout, businessId: string): GridPos | undefined {
  return layout.businessTiles[businessId];
}

export function hqTileOf(layout: MapLayout, familyId: string): GridPos | undefined {
  return layout.hqTiles[familyId];
}

/** The id of a business occupying `tile`, or undefined if the tile is empty. */
export function businessAtTile(layout: MapLayout, tile: GridPos): string | undefined {
  const gx = Math.round(tile.gx);
  const gy = Math.round(tile.gy);
  for (const [id, t] of Object.entries(layout.businessTiles)) {
    if (t.gx === gx && t.gy === gy) return id;
  }
  return undefined;
}

// ── control gating ──────────────────────────────────────────────────────────────────────────

/** Whether a family has the foothold to act (extort) in a district — the existing control gate. */
export function hasFootholdForExtort(
  state: GameState,
  familyId: string,
  districtId: string,
): boolean {
  const district = state.districts.find((d) => d.id === districtId);
  if (!district) return false;
  return controlOf(district, familyId) >= EXTORT_MIN_CONTROL;
}

// ── collector runs ────────────────────────────────────────────────────────────────────────

export interface CollectorRunResult {
  /** The spawned collector unit (also pushed onto state.units), or null if nothing to run. */
  unit: MovableUnit | null;
  /** Gross take the collector is carrying (0 if no run started). */
  carrying: number;
}

/**
 * Start a spatial collection run: gather a family's pending takings in a district into a
 * Collector that spawns at the first collectible business and walks a real path to the family
 * HQ. The businesses are emptied now (the take is "in the bag"); it is banked only on safe
 * arrival (depositCollector) — or stolen if intercepted en route (RTS-4). Returns null if there
 * is nothing to collect, no HQ, or no path. Deterministic; no RNG here (the skim is at deposit).
 */
export function startCollectorRun(
  state: GameState,
  layout: MapLayout,
  familyId: string,
  districtId: string,
  grid: NavGrid = navGridForLayout(layout),
  unitId = `collector-${familyId}-${districtId}-${state.tick}`,
): CollectorRunResult {
  const targets = collectibleBusinesses(state, familyId, districtId);
  const pending = targets.reduce((sum, b) => sum + uncollectedOf(b), 0);
  if (pending <= 0) return { unit: null, carrying: 0 };

  const startTile = businessTileOf(layout, targets[0].id);
  const hq = hqTileOf(layout, familyId);
  if (!startTile || !hq) return { unit: null, carrying: 0 };

  const collector = spawnCollector(unitId, startTile.gx, startTile.gy, familyId, pending);
  collector.originDistrictId = districtId;
  if (!issueMove(collector, hq, grid)) return { unit: null, carrying: 0 };

  // Tutorial safety net (RTS-12): the first run(s) ride home un-robbable so a new player isn't
  // punished by a mechanic they haven't been taught. Spent one per dispatched run.
  if (state.tutorialFreeRuns > 0) {
    collector.protectedRun = true;
    state.tutorialFreeRuns -= 1;
  }

  for (const b of targets) b.uncollected = 0; // the take is now in transit
  state.units.push(collector);

  state.log.push({
    tick: state.tick,
    kind: 'collector-dispatched',
    message: `${familyId} sent a collector for $${pending} from ${districtId}`,
    data: { familyId, districtId, carrying: pending, unitId },
  });
  return { unit: collector, carrying: pending };
}

/**
 * Bank a collector's carried take at HQ using the EXISTING collection rules: the source
 * district's police presence and the family's heat/muscle set the safe fraction, a seeded skim
 * is taken off the top, and the surviving amount is credited as dirty money (creditCrimeIncome).
 * Returns the banked amount. The collector is emptied either way. Mutates state (+ RNG cursor).
 *
 * A protectedRun (RTS-12/13 tutorial) banks the FULL carried amount with NO skim and draws no
 * RNG — so the "✓ SAFE" promise is exact: the player gets every dollar they were shown.
 */
export function depositCollector(state: GameState, collector: MovableUnit): number {
  const family = collector.factionId ? findFamily(state, collector.factionId) : undefined;
  const carried = collector.carrying ?? 0;
  if (!family || carried <= 0) {
    collector.carrying = 0;
    return 0;
  }

  const district = state.districts.find((d) => d.id === collector.originDistrictId);
  let banked = carried;
  if (district && !collector.protectedRun) {
    const muscle = muscleInDistrict(family, district.id);
    const safety = collectionSafety(district.policePresence, family.heat, muscle);
    const rng = new Rng(state.rngState);
    const roll = rng.nextFloat();
    state.rngState = rng.state;
    banked = Math.floor(carried * collectionFraction(safety, roll));
  }

  creditCrimeIncome(family, banked);
  family.heat = Math.min(HEAT_MAX, family.heat + COLLECT_HEAT);
  collector.carrying = 0;
  if (banked > 0) applyCrewLoyaltyEvent(family, 'score'); // RTS-14: a score lifts crew morale

  state.log.push({
    tick: state.tick,
    kind: 'collector-deposit',
    message: `${family.id} banked $${banked} of $${carried} at HQ`,
    data: { familyId: family.id, banked, carried, unitId: collector.id },
  });
  return banked;
}

export interface DepositEvent {
  collectorId: string;
  familyId: string;
  banked: number;
}

/**
 * Bank every collector that has ARRIVED at its own HQ tile still carrying a take. Call each
 * frame after the world step; deterministic. Returns the deposits made.
 */
export function processCollectorArrivals(state: GameState, layout: MapLayout): DepositEvent[] {
  const events: DepositEvent[] = [];
  for (const u of state.units) {
    if (u.role !== 'collector' || (u.carrying ?? 0) <= 0 || !unitArrived(u)) continue;
    const hq = u.factionId ? hqTileOf(layout, u.factionId) : undefined;
    if (!hq || !tileEquals(unitTile(u), hq)) continue;
    const banked = depositCollector(state, u);
    events.push({ collectorId: u.id, familyId: u.factionId!, banked });
  }
  return events;
}

// ── dispatch telegraph (RTS-13 run-2 ramp) ───────────────────────────────────────────────────

export interface DispatchThreat {
  /** True when a hostile enforcer is positioned to catch a run sent right now. */
  hot: boolean;
  /** The threatening enforcer's id, if hot. */
  enemyId: string | null;
}

/**
 * Whether it is risky to send a collector THIS INSTANT: "hot" when a hostile enforcer is within
 * ROUTE_DANGER_RADIUS of the family's HQ or of any business with takings waiting (the run's
 * endpoints). Lets the UI coach a new player to WAIT for the coast to clear before [C] — turning
 * the jump from a guaranteed first run to full stakes into a timing skill they can read. Pure.
 */
export function dispatchThreat(
  state: GameState,
  layout: MapLayout,
  familyId: string,
  radius: number = ROUTE_DANGER_RADIUS,
): DispatchThreat {
  const points: GridPos[] = [];
  const hq = hqTileOf(layout, familyId);
  if (hq) points.push(hq);
  for (const d of state.districts) {
    for (const b of collectibleBusinesses(state, familyId, d.id)) {
      const t = businessTileOf(layout, b.id);
      if (t) points.push(t);
    }
  }
  for (const p of points) {
    const enemy = hostileEnforcerNear(state, familyId, p, radius);
    if (enemy) return { hot: true, enemyId: enemy.id };
  }
  return { hot: false, enemyId: null };
}

// ── extortion on the map ────────────────────────────────────────────────────────────────────

export interface ExtortAtTileResult {
  /** The business id targeted, or undefined if the tile holds no business. */
  businessId?: string;
  /** Whether a business was found at the tile (the command was dispatched). Control gating and
   * success are resolved by the existing extort command (see state.log). */
  targeted: boolean;
}

/**
 * Translate a map click on a building into the existing extort command. Resolves the tile to a
 * business and dispatches `applyCommand({ type: 'extort' })`; the existing command enforces the
 * control gate and rolls success. Returns which building (if any) was targeted.
 */
export function extortAtTile(
  state: GameState,
  layout: MapLayout,
  familyId: string,
  tile: GridPos,
): ExtortAtTileResult {
  const businessId = businessAtTile(layout, tile);
  if (!businessId) return { targeted: false };
  applyCommand(state, { type: 'extort', familyId, businessId });
  return { businessId, targeted: true };
}

/** All business ids that have a tile in the layout (handy for rendering / iteration). */
export function laidOutBusinessIds(layout: MapLayout): string[] {
  return Object.keys(layout.businessTiles);
}

/** Re-export for callers that want to confirm a business exists in the world. */
export { allBusinesses };
