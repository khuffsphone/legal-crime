// RTS-10 — inspection & facing selectors (the data behind hover tooltips and unit orientation).
// Pure & deterministic; imports NO Phaser, so the "what is this thing" model and the movement-
// facing math are unit-tested headlessly. READ-ONLY over existing state — no mechanic touched.

import { businessAccrual, businessEarner } from './economy';
import { uncollectedOf } from './collection';
import { tierOf } from './tiers';
import { controlOf, districtHolder } from './territory';
import { collectorCarryView } from './gamefeel';
import { collectorThreat, type ThreatLevel } from './gamefeel';
import type { MovableUnit } from './movement';
import { findBusiness } from './commands';
import { findFamily, type GameState } from './types';

// ── facing ────────────────────────────────────────────────────────────────────────────────

/** Eight-way compass facing in grid space (+x = E, +y = S). Null = no movement. */
export type Facing = 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'N' | 'NE';

const COMPASS: Facing[] = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

/**
 * Snap a grid-space movement vector to one of eight compass facings. A (near-)zero vector has
 * no direction and returns null. Deterministic: bucketed by 45° sectors of atan2(dy, dx).
 */
export function facingFromVector(dx: number, dy: number): Facing | null {
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
  const angle = Math.atan2(dy, dx); // -PI..PI, 0 = +x (E), PI/2 = +y (S)
  const sector = Math.round(angle / (Math.PI / 4)); // -4..4 in eighths
  const idx = ((sector % 8) + 8) % 8;
  return COMPASS[idx];
}

/** Which way a unit is heading (toward its next waypoint), or a default 'S' when idle. */
export function unitFacing(unit: MovableUnit): Facing {
  const wp = unit.path[0];
  if (!wp) return 'S';
  return facingFromVector(wp.gx - unit.pos.gx, wp.gy - unit.pos.gy) ?? 'S';
}

/** Whether a facing reads as pointing screen-right (used to flip a 2D figure). */
export function facesRight(facing: Facing): boolean {
  return facing === 'E' || facing === 'NE' || facing === 'SE';
}

// ── inspection (tooltip models) ─────────────────────────────────────────────────────────────

export interface UnitInspection {
  id: string;
  /** 'Collector' | 'Enforcer' | 'Muscle' | 'Unit'. */
  kind: string;
  ownerId: string | null;
  ownerName: string | null;
  /** Dirty cash carried (collectors); 0 otherwise. */
  carrying: number;
  vulnerable: boolean;
  /** Danger level from the nearest hostile enforcer (collectors): safe/threatened/ambush. */
  threat: ThreatLevel;
  facing: Facing;
}

function unitKindLabel(u: MovableUnit): string {
  switch (u.role) {
    case 'collector':
      return 'Collector';
    case 'enforcer':
      return 'Enforcer';
    default:
      return 'Muscle';
  }
}

/** The hover model for a unit: what it is, whose it is, what it carries, and how exposed it is. */
export function inspectUnit(state: GameState, unitId: string): UnitInspection | null {
  const u = state.units.find((x) => x.id === unitId);
  if (!u) return null;
  const owner = u.factionId ? findFamily(state, u.factionId) : undefined;
  const carry = collectorCarryView(u);
  const threat = u.role === 'collector' ? collectorThreat(u, state.units).level : 'safe';
  return {
    id: u.id,
    kind: unitKindLabel(u),
    ownerId: u.factionId ?? null,
    ownerName: owner?.name ?? null,
    carrying: carry.carrying,
    vulnerable: carry.vulnerable,
    threat,
    facing: unitFacing(u),
  };
}

export interface BusinessInspection {
  id: string;
  name: string;
  /** 'front' or the operation kind. */
  kind: string;
  districtId: string;
  districtName: string;
  /** The family that earns from it (extorter of a front / owner of an operation), if any. */
  earnerId: string | null;
  earnerName: string | null;
  /** True when the PLAYER extorts this front — the "paying protection" marker state. */
  payingProtection: boolean;
  /** Per-tick income it yields its earner. */
  income: number;
  /** Takings piled up awaiting collection. */
  uncollected: number;
  /** Operation tier (1 for fronts / tier-1 ops). */
  tier: number;
}

/** The hover model for a building/business: name, kind, who earns, income, protection state. */
export function inspectBusiness(state: GameState, businessId: string): BusinessInspection | null {
  const found = findBusiness(state, businessId);
  if (!found) return null;
  const { business: b, district: d } = found;
  const earnerId = businessEarner(b) ?? null;
  const earner = earnerId ? findFamily(state, earnerId) : undefined;
  return {
    id: b.id,
    name: b.name,
    kind: b.kind,
    districtId: d.id,
    districtName: d.name,
    earnerId,
    earnerName: earner?.name ?? null,
    payingProtection: b.kind === 'front' && b.extortedBy === state.player.id,
    income: businessAccrual(b),
    uncollected: uncollectedOf(b),
    tier: tierOf(b),
  };
}

export interface DistrictInspection {
  id: string;
  name: string;
  holderId: string | null;
  holderName: string | null;
  policePresence: number;
  playerControl: number;
  businessCount: number;
  operationCount: number;
}

/** The hover model for a district: who holds it, the heat of the law, the player's foothold. */
export function inspectDistrict(state: GameState, districtId: string): DistrictInspection | null {
  const d = state.districts.find((x) => x.id === districtId);
  if (!d) return null;
  const holderId = districtHolder(d) ?? null;
  const holder = holderId ? findFamily(state, holderId) : undefined;
  return {
    id: d.id,
    name: d.name,
    holderId,
    holderName: holder?.name ?? null,
    policePresence: d.policePresence,
    playerControl: controlOf(d, state.player.id),
    businessCount: d.businesses.length,
    operationCount: d.businesses.filter((b) => b.kind !== 'front').length,
  };
}
