// streetscapeZones.ts — Streetscape Layer, Phase 1, TICKET 2: the 9 placement ZONES (§2.1) + the pure
// forbidden-placement predicate. PURE, Phaser-free. NO collision-system changes — this only DECIDES whether a
// prop family may occupy a zone; nothing here reads or writes the live nav grid (Ticket 4 will).
//
// The predicate has two layers:
//   1. FAMILY layer — a family declares the zones it may occupy (PropFamily.placementZones); any other zone
//      is forbidden. (This is what rejects "hydrant mid-sidewalk", "bench in road", "vendor cart in a
//      residential yard": those zones aren't in those families' lists.)
//   2. STRUCTURAL layer — a THROUGH-MOVEMENT zone (the road travel surface, the sidewalk through-zone) rejects
//      any SOLID (non-flush) prop that isn't part of that flow: vehicles belong on the road, flush ground
//      decals have no mass, everything else would block movement (building-kit §7.3: props stay subordinate
//      and NEVER on a tile that must stay clear). This layer is a belt-and-suspenders invariant guard — the
//      family data is authored to already respect it, and a test asserts they agree.
// See CC-DERIVED provenance note in streetscapeTypes.ts.

import type { HeightBand, PlacementZoneId, PropCategory } from './streetscapeTypes';
import { PLACEMENT_ZONE_IDS } from './streetscapeTypes';

export interface PlacementZone {
  id: PlacementZoneId;
  label: string;
  /** the zone's primary-function surface. */
  surface: 'roadway' | 'pedestrian' | 'furnishing' | 'frontage' | 'service' | 'open';
  /** true if the zone's primary function is THROUGH-MOVEMENT, so a solid obstacle here blocks it: the road
   * (vehicles travel) and the sidewalk through-zone (pedestrians walk). See the structural layer above. */
  blocksThrough: boolean;
  description: string;
}

/** The 9 zones (§2.1). Keyed by id for O(1) lookup; PLACEMENT_ZONE_IDS gives the cross-section order. */
export const ZONES: Readonly<Record<PlacementZoneId, PlacementZone>> = {
  road: {
    id: 'road', label: 'Roadway', surface: 'roadway', blocksThrough: true,
    description: 'Vehicular travel surface (lane + parking edge). Only vehicles and flush ground decals may sit here.',
  },
  curb: {
    id: 'curb', label: 'Curb / gutter', surface: 'furnishing', blocksThrough: false,
    description: 'The ~6-in edge between road and sidewalk; hydrants, signals and grates line it.',
  },
  sidewalk_through: {
    id: 'sidewalk_through', label: 'Sidewalk through-zone', surface: 'pedestrian', blocksThrough: true,
    description: 'The walkable pedestrian corridor (NACTO). MUST stay clear — furniture goes in the furniture band, not here.',
  },
  furniture_band: {
    id: 'furniture_band', label: 'Furniture band', surface: 'furnishing', blocksThrough: false,
    description: 'The furnishing strip (curb→walk): lamps, street trees, hydrants, poles, benches, cans.',
  },
  storefront_frontage: {
    id: 'storefront_frontage', label: 'Storefront frontage', surface: 'frontage', blocksThrough: false,
    description: 'The shallow zone at a commercial building face: awnings, sandwich boards, stalls, blade signs.',
  },
  residential_frontage: {
    id: 'residential_frontage', label: 'Residential frontage', surface: 'frontage', blocksThrough: false,
    description: 'The frontage at a residential/tenement face: stoops, small planters, hedges, cans.',
  },
  alley_service: {
    id: 'alley_service', label: 'Alley / service', surface: 'service', blocksThrough: false,
    description: "The rear service alley (Chicago's alley grid): crates, barrels, pallets, cans, delivery access.",
  },
  park_plaza: {
    id: 'park_plaza', label: 'Park / plaza', surface: 'open', blocksThrough: false,
    description: 'Open civic/leisure ground: fountains, statues, benches, trees, hedges, plaza vendors.',
  },
  industrial_apron: {
    id: 'industrial_apron', label: 'Industrial apron', surface: 'service', blocksThrough: false,
    description: 'The hard apron in front of warehouses/industrial lots: pallets, drums, crates, trucks.',
  },
};

/** The structural subset a family must expose for the predicate. A subset of PropFamily, taken structurally
 * so this module never imports the taxonomy (keeps the module DAG acyclic: zones ← taxonomy ← districts). */
export interface PlacementShape {
  allowedZones: readonly PlacementZoneId[];
  heightBand: HeightBand;
  category: PropCategory;
}

/** Does this zone's primary function forbid a solid (non-flush) obstacle? (road, sidewalk-through). */
export function zoneBlocksThrough(zoneId: PlacementZoneId): boolean {
  return ZONES[zoneId]?.blocksThrough === true;
}

/**
 * Why a placement is forbidden, or null if it's allowed. Pure. Layers, in order:
 *  - 'zone-not-allowed': the zone isn't in the family's declared placementZones.
 *  - 'blocks-through': the zone is a travel/through corridor and this solid, non-vehicle prop would block it.
 * A flush ground decal (heightBand 'flush') is never blocked by the structural layer; a vehicle is exempt on
 * the roadway only.
 */
export function forbiddenReason(shape: PlacementShape, zoneId: PlacementZoneId): 'unknown-zone' | 'zone-not-allowed' | 'blocks-through' | null {
  const zone = ZONES[zoneId];
  if (!zone) return 'unknown-zone';
  if (!shape.allowedZones.includes(zoneId)) return 'zone-not-allowed';
  if (zone.blocksThrough && shape.heightBand !== 'flush') {
    // vehicles belong on the roadway; nothing solid belongs in the sidewalk through-zone.
    if (zone.id === 'road' && shape.category === 'vehicle') return null;
    return 'blocks-through';
  }
  return null;
}

/** True if placing a prop of `shape` in `zoneId` is forbidden (the Ticket-2 predicate). Pure & total. */
export function isForbiddenPlacement(shape: PlacementShape, zoneId: PlacementZoneId): boolean {
  return forbiddenReason(shape, zoneId) !== null;
}

/** Convenience: the zones (from the 9) where `shape` MAY be placed after both layers. Pure. */
export function allowedZonesFor(shape: PlacementShape): PlacementZoneId[] {
  return PLACEMENT_ZONE_IDS.filter((z) => !isForbiddenPlacement(shape, z));
}
