// RTS-22 — automated collection routes. Pure & deterministic; imports NO Phaser. The original's
// economy mechanic: instead of click-collecting every week, the player assigns a collector to a
// ROUTE over their protected businesses; it cycles them automatically — gathering the take, banking
// it at HQ, looping — so the economy plays itself once set up. The SIGNATURE BOTTLENECK is kept:
// a route collector carrying cash is still interceptable/robbable in transit (resolveInterceptions
// acts on it exactly like a manual run), so guarding the route still matters. The economic
// settlement (tick) is untouched — banking reuses the existing depositCollector skim.

import { spawnCollector, issueMove, unitArrived, type MovableUnit } from './movement';
import { depositCollector, hqTileOf, businessTileOf, navGridForLayout, type MapLayout } from './mapEconomy';
import { uncollectedOf } from './collection';
import { findBusiness } from './commands';
import { businessEarner } from './economy';
import { earningBusinesses } from './interdiction';
import { rivalsDormant } from './strategy';
import { STROLL_SPEED } from './constants';
import type { NavGrid } from './pathfinding';
import type { CollectionRoute, GameState } from './types';

// ── RTS-29 — the FIXED per-business collector model (the sea-of-collectors heartbeat) ─────────────

/** The fixed route id for a single business's collector (one collector per business). */
export function businessRouteId(businessId: string): string {
  return `route-biz-${businessId}`;
}

/**
 * RTS-29 — ensure a SINGLE fixed HQ↔business collector exists for `businessId` if `familyId` earns
 * from it. One collector per business; MANY extorted businesses → MANY collectors walking their fixed
 * tracks each week (the rewarding visible heartbeat). The collector walks at the slow stroll speed →
 * collects → returns → banks → loops (travel time is the throttle). Returns the setup if it created
 * one, else null (already exists / not earned / no tiles). Pure (mutates state).
 */
export function ensureBusinessCollector(
  state: GameState, layout: MapLayout, familyId: string, businessId: string, grid?: NavGrid,
): RouteSetup | null {
  const routeId = businessRouteId(businessId);
  if (state.units.some((u) => u.routeId === routeId)) return null; // already has its collector
  const found = findBusiness(state, businessId);
  if (!found || businessEarner(found.business) !== familyId) return null;
  const hq = hqTileOf(layout, familyId);
  const tile = businessTileOf(layout, businessId);
  if (!hq || !tile) return null;

  const route: CollectionRoute = { id: routeId, familyId, stops: [businessId] };
  state.routes = [...(state.routes ?? []).filter((r) => r.id !== routeId), route];
  const col = spawnCollector(`collector-${businessId}`, hq.gx, hq.gy, familyId, 0, STROLL_SPEED);
  col.routeId = routeId;
  col.routeIndex = 0;
  col.routePhase = 'toStop';
  issueMove(col, tile, grid ?? navGridForLayout(layout));
  state.units.push(col);
  return { route, unit: col };
}

/**
 * RTS-30 HOOK (RETAINED but DORMANT in this slice): whether a collector's cash run can be hit/robbed.
 * Keyed to rival dormancy — FALSE while rivals are dormant (the safe early game), so nothing
 * intercepts and the red threat-ring never shows. The interception/threat code path
 * (resolveInterceptions / threatenedCollectors) is KEPT intact; this gate is where RTS-30 switches it
 * on as a rival-invasion consequence (the re-timed signature pillar — NOT removed). Pure read.
 */
export function collectorsVulnerable(state: GameState): boolean {
  return !rivalsDormant(state);
}

/** The businesses a family would auto-collect on a route — every business it currently earns from
 * that has a tile in the layout, in district order. Pure read. */
export function routeStops(state: GameState, layout: MapLayout, familyId: string): string[] {
  return earningBusinesses(state, familyId)
    .map((b) => b.id)
    .filter((id) => businessTileOf(layout, id) !== undefined);
}

/** A family's active route collector unit, if any. */
export function routeCollectorOf(state: GameState, familyId: string): MovableUnit | undefined {
  return state.units.find((u) => u.routeId !== undefined && u.factionId === familyId && u.role === 'collector');
}

export interface RouteSetup { route: CollectionRoute; unit: MovableUnit; }

/**
 * Create (or replace) `familyId`'s automated collection route over all the businesses it currently
 * protects, and dispatch a collector from HQ to run it. Returns null if there is nothing to collect
 * or no HQ. Replaces any prior route + route collector for that family. Pure (mutates state).
 */
export function createCollectionRoute(
  state: GameState,
  layout: MapLayout,
  familyId: string,
  grid?: NavGrid,
  unitId?: string,
): RouteSetup | null {
  const stops = routeStops(state, layout, familyId);
  if (stops.length === 0) return null;
  const hq = hqTileOf(layout, familyId);
  const firstTile = businessTileOf(layout, stops[0]);
  if (!hq || !firstTile) return null;

  const id = `route-${familyId}-${state.tick}`;
  const route: CollectionRoute = { id, familyId, stops };
  state.routes = [...(state.routes ?? []).filter((r) => r.familyId !== familyId), route];
  // retire any prior route collector for this family
  state.units = state.units.filter((u) => !(u.routeId !== undefined && u.factionId === familyId));

  const uid = unitId ?? `routerunner-${familyId}-${state.tick}`;
  const col = spawnCollector(uid, hq.gx, hq.gy, familyId, 0);
  col.routeId = id;
  col.routeIndex = 0;
  col.routePhase = 'toStop';
  const g = grid ?? navGridForLayout(layout);
  issueMove(col, firstTile, g);
  state.units.push(col);
  return { route, unit: col };
}

/**
 * Advance every automated route collector that has ARRIVED at its current target (movement is
 * handled elsewhere by advanceUnits). At a STOP it gathers that business's takings; after the last
 * stop it heads to HQ; at HQ it BANKS (the existing skim) and loops back to the first stop. A no-op
 * when there are no routes (so prior tests are unaffected). Pure (mutates state).
 */
export function advanceRoutes(state: GameState, layout: MapLayout, grid?: NavGrid): void {
  if (!state.routes || state.routes.length === 0) return;
  const g = grid ?? navGridForLayout(layout);
  for (const col of state.units) {
    if (col.routeId === undefined || col.role !== 'collector') continue;
    const route = state.routes.find((r) => r.id === col.routeId);
    if (!route || route.stops.length === 0) continue;
    if (!unitArrived(col)) continue; // still walking — let movement carry it

    if (col.routePhase === 'toStop') {
      const idx = col.routeIndex ?? 0;
      const stopId = route.stops[idx];
      const found = findBusiness(state, stopId);
      // gather only if it is still ours and producing
      if (found && businessEarner(found.business) === route.familyId) {
        col.carrying = (col.carrying ?? 0) + uncollectedOf(found.business);
        found.business.uncollected = 0;
        col.originDistrictId = found.district.id;
      }
      const next = idx + 1;
      if (next < route.stops.length) {
        col.routeIndex = next;
        const t = businessTileOf(layout, route.stops[next]);
        if (t) issueMove(col, t, g);
      } else {
        col.routePhase = 'toBank';
        const hq = hqTileOf(layout, route.familyId);
        if (hq) issueMove(col, hq, g);
      }
    } else {
      // toBank — arrived at HQ: bank the take (existing skim/heat), then loop the route.
      depositCollector(state, col);
      col.routePhase = 'toStop';
      col.routeIndex = 0;
      const t = businessTileOf(layout, route.stops[0]);
      if (t) issueMove(col, t, g);
    }
  }
}

/** A compact status read for the route (RTS-22 legibility): stops, carrying, phase. */
export interface RouteStatus { active: boolean; stops: number; carrying: number; phase: 'toStop' | 'toBank' | 'idle'; }
export function routeStatus(state: GameState, familyId: string): RouteStatus {
  const col = routeCollectorOf(state, familyId);
  const route = state.routes?.find((r) => r.familyId === familyId);
  if (!col || !route) return { active: false, stops: route?.stops.length ?? 0, carrying: 0, phase: 'idle' };
  return { active: true, stops: route.stops.length, carrying: col.carrying ?? 0, phase: col.routePhase ?? 'idle' };
}
