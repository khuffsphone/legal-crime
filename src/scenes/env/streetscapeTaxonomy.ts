// streetscapeTaxonomy.ts — Streetscape Layer, Phase 1, TICKET 1: the 28 MVP prop families (§11.1) as PURE,
// Phaser-free metadata — category, placementZones, districtWeights, conditionStates, rarity, heightBand
// (§10.2), anchorType (§12.1 anchor/rhythm/filler/rare). This is the ASSET TAXONOMY the placement pass
// (Ticket 4) reads; it renders/places NOTHING. See the CC-DERIVED provenance note in streetscapeTypes.ts —
// the roster + weights are synthesised from the 25-Asset Batch prop list, the building-kit §5/§7 period +
// ground-plane grammar, and LIVING_CITY_SPEC, pending reconciliation with GPT-Pro's §11.1.

import type {
  AnchorType, ConditionState, HeightBand, PlacementZoneId, PropCategory, Rarity, StreetscapeDistrict,
} from './streetscapeTypes';
import { STREETSCAPE_DISTRICTS, WEIGHT_MAX, WEIGHT_MIN } from './streetscapeTypes';
import { isForbiddenPlacement as zoneForbids, type PlacementShape } from './streetscapeZones';

/** The 28 MVP prop-family ids. */
export type PropFamilyId =
  | 'street_lamp' | 'utility_pole' | 'traffic_signal' | 'fire_hydrant' | 'police_call_box'
  | 'mailbox' | 'bench' | 'trash_can' | 'bollard'
  | 'news_stand' | 'vendor_cart' | 'produce_stall' | 'sandwich_board' | 'awning' | 'blade_sign'
  | 'street_tree' | 'planter' | 'hedge_shrub'
  | 'fountain' | 'statue_monument'
  | 'parked_car' | 'delivery_truck'
  | 'crate_stack' | 'barrel_drum' | 'pallet_stack'
  | 'manhole_cover' | 'sewer_grate' | 'puddle_stain';

export interface PropFamily {
  id: PropFamilyId;
  label: string;
  category: PropCategory;
  heightBand: HeightBand;
  /** placement ROLE in a block-face composition (§12.1). */
  anchorType: AnchorType;
  /** how often the family appears AT ALL (distinct from anchorType, which is WHERE it sits). */
  rarity: Rarity;
  /** zones this family MAY occupy (§2.1). The Ticket-2 predicate rejects every other zone; the data here is
   * authored to also respect the structural through-zone rule (road = vehicles/flush only; sidewalk = flush). */
  placementZones: readonly PlacementZoneId[];
  /** condition/visual states the family supports (a renderer picks one; Phase 4+). */
  conditionStates: readonly ConditionState[];
  /** baseline district affinity (0..5) for any district not overridden in districtWeights. */
  baseWeight: number;
  /** per-district affinity overrides (0..5); sparse — only where it differs from baseWeight. */
  districtWeights: Partial<Record<StreetscapeDistrict, number>>;
}

// ── the 28 families ───────────────────────────────────────────────────────────────────────────────────
// Weights are tuned so each district reads distinctly (FINANCIAL formal, MARKET busy-retail, THEATRE signage,
// TENEMENT sparse-poor, CIVIC green-monumental, DOCKS/INDUSTRIAL debris-heavy, RIVERSIDE green-leisure) and no
// single family is the top pick everywhere. 0 = never appears in that district.
export const FAMILIES: Readonly<Record<PropFamilyId, PropFamily>> = {
  // — utility —
  street_lamp: {
    id: 'street_lamp', label: 'Street lamp', category: 'utility', heightBand: 'tall', anchorType: 'rhythm',
    rarity: 'common', placementZones: ['furniture_band', 'park_plaza', 'storefront_frontage'],
    conditionStates: ['unlit', 'lit', 'weathered'], baseWeight: 3,
    districtWeights: { THEATRE: 5, FINANCIAL: 4, CIVIC: 4, TENEMENT: 2, DOCKS: 1, INDUSTRIAL: 1 },
  },
  utility_pole: {
    id: 'utility_pole', label: 'Utility pole', category: 'utility', heightBand: 'tall', anchorType: 'rhythm',
    rarity: 'common', placementZones: ['furniture_band', 'curb', 'alley_service', 'industrial_apron'],
    conditionStates: ['weathered', 'damaged'], baseWeight: 2,
    districtWeights: { INDUSTRIAL: 5, DOCKS: 4, TENEMENT: 4, FINANCIAL: 1, THEATRE: 1, CIVIC: 0, RIVERSIDE: 0 },
  },
  traffic_signal: {
    id: 'traffic_signal', label: 'Traffic signal tower', category: 'utility', heightBand: 'tall', anchorType: 'rare',
    rarity: 'rare', placementZones: ['curb', 'furniture_band'],
    conditionStates: ['unlit', 'lit', 'weathered'], baseWeight: 0,
    districtWeights: { FINANCIAL: 3, MARKET: 2, THEATRE: 2, CIVIC: 2 },
  },
  fire_hydrant: {
    id: 'fire_hydrant', label: 'Fire hydrant', category: 'utility', heightBand: 'low', anchorType: 'filler',
    rarity: 'common', placementZones: ['curb', 'furniture_band'],
    conditionStates: ['pristine', 'weathered', 'damaged'], baseWeight: 2,
    districtWeights: { TENEMENT: 3, RIVERSIDE: 1 },
  },
  police_call_box: {
    id: 'police_call_box', label: 'Police call box', category: 'utility', heightBand: 'mid', anchorType: 'rare',
    rarity: 'rare', placementZones: ['curb', 'furniture_band'],
    conditionStates: ['unlit', 'lit', 'weathered'], baseWeight: 0,
    districtWeights: { CIVIC: 3, FINANCIAL: 2, THEATRE: 1, DOCKS: 1 },
  },
  // — street furniture —
  mailbox: {
    id: 'mailbox', label: 'Mail collection box', category: 'street_furniture', heightBand: 'mid', anchorType: 'filler',
    rarity: 'common', placementZones: ['furniture_band', 'storefront_frontage', 'curb'],
    conditionStates: ['pristine', 'weathered'], baseWeight: 2,
    districtWeights: { FINANCIAL: 3, INDUSTRIAL: 1, DOCKS: 1, RIVERSIDE: 1 },
  },
  bench: {
    id: 'bench', label: 'Bench', category: 'street_furniture', heightBand: 'mid', anchorType: 'rhythm',
    rarity: 'common', placementZones: ['furniture_band', 'park_plaza', 'storefront_frontage'],
    conditionStates: ['pristine', 'weathered', 'damaged'], baseWeight: 2,
    districtWeights: { RIVERSIDE: 5, CIVIC: 4, FINANCIAL: 3, THEATRE: 3, TENEMENT: 1, DOCKS: 0, INDUSTRIAL: 0 },
  },
  trash_can: {
    id: 'trash_can', label: 'Refuse / ash can', category: 'street_furniture', heightBand: 'low', anchorType: 'filler',
    rarity: 'common',
    placementZones: ['furniture_band', 'alley_service', 'park_plaza', 'storefront_frontage', 'residential_frontage'],
    conditionStates: ['weathered', 'damaged'], baseWeight: 3,
    districtWeights: { MARKET: 4, TENEMENT: 4, CIVIC: 2, RIVERSIDE: 2 },
  },
  bollard: {
    id: 'bollard', label: 'Iron bollard / hitching post', category: 'street_furniture', heightBand: 'low', anchorType: 'filler',
    rarity: 'common', placementZones: ['curb', 'furniture_band', 'storefront_frontage', 'industrial_apron'],
    conditionStates: ['pristine', 'weathered'], baseWeight: 1,
    districtWeights: { FINANCIAL: 3, DOCKS: 3, INDUSTRIAL: 3, MARKET: 2, CIVIC: 2 },
  },
  // — commercial —
  news_stand: {
    id: 'news_stand', label: 'Newsstand kiosk', category: 'commercial', heightBand: 'mid', anchorType: 'anchor',
    rarity: 'uncommon', placementZones: ['storefront_frontage', 'furniture_band', 'park_plaza'],
    conditionStates: ['pristine', 'weathered'], baseWeight: 1,
    // DOCKS/INDUSTRIAL fall to base 1 (a dockside/works news-and-tobacco kiosk) so every district has an
    // anchor-eligible family — see streetscapeDistricts' composition invariant.
    districtWeights: { MARKET: 4, THEATRE: 3, FINANCIAL: 3, CIVIC: 2 },
  },
  vendor_cart: {
    id: 'vendor_cart', label: 'Vendor pushcart', category: 'commercial', heightBand: 'mid', anchorType: 'rare',
    rarity: 'uncommon', placementZones: ['park_plaza', 'storefront_frontage'],
    conditionStates: ['pristine', 'weathered'], baseWeight: 0,
    districtWeights: { MARKET: 5, THEATRE: 3, FINANCIAL: 2, CIVIC: 2, RIVERSIDE: 2, DOCKS: 1 },
  },
  produce_stall: {
    id: 'produce_stall', label: 'Market stall', category: 'commercial', heightBand: 'mid', anchorType: 'rhythm',
    rarity: 'uncommon', placementZones: ['storefront_frontage', 'park_plaza'],
    conditionStates: ['pristine', 'weathered'], baseWeight: 0,
    districtWeights: { MARKET: 5, TENEMENT: 2, CIVIC: 1, RIVERSIDE: 1 },
  },
  sandwich_board: {
    id: 'sandwich_board', label: 'A-frame sign', category: 'commercial', heightBand: 'low', anchorType: 'filler',
    rarity: 'common', placementZones: ['storefront_frontage'],
    conditionStates: ['pristine', 'weathered'], baseWeight: 1,
    districtWeights: { MARKET: 3, THEATRE: 3, FINANCIAL: 2, DOCKS: 0, INDUSTRIAL: 0 },
  },
  awning: {
    id: 'awning', label: 'Shop awning', category: 'commercial', heightBand: 'tall', anchorType: 'rhythm',
    rarity: 'common', placementZones: ['storefront_frontage'],
    conditionStates: ['pristine', 'weathered', 'damaged'], baseWeight: 1,
    districtWeights: { MARKET: 4, THEATRE: 4, FINANCIAL: 3, DOCKS: 0, INDUSTRIAL: 0 },
  },
  blade_sign: {
    id: 'blade_sign', label: 'Projecting blade / neon sign', category: 'commercial', heightBand: 'tall', anchorType: 'rare',
    rarity: 'uncommon', placementZones: ['storefront_frontage'],
    conditionStates: ['unlit', 'lit', 'weathered'], baseWeight: 0,
    districtWeights: { THEATRE: 5, MARKET: 3, FINANCIAL: 3, DOCKS: 1 },
  },
  // — vegetation —
  street_tree: {
    id: 'street_tree', label: 'Street tree', category: 'vegetation', heightBand: 'tall', anchorType: 'anchor',
    rarity: 'common', placementZones: ['furniture_band', 'park_plaza', 'residential_frontage'],
    conditionStates: ['pristine', 'weathered'], baseWeight: 2,
    districtWeights: { RIVERSIDE: 5, CIVIC: 5, FINANCIAL: 3, DOCKS: 0, INDUSTRIAL: 0 },
  },
  planter: {
    id: 'planter', label: 'Planter box', category: 'vegetation', heightBand: 'low', anchorType: 'filler',
    rarity: 'common', placementZones: ['furniture_band', 'storefront_frontage', 'residential_frontage', 'park_plaza'],
    conditionStates: ['pristine', 'weathered'], baseWeight: 1,
    districtWeights: { CIVIC: 3, RIVERSIDE: 3, FINANCIAL: 2, MARKET: 2, THEATRE: 2, DOCKS: 0, INDUSTRIAL: 0 },
  },
  hedge_shrub: {
    id: 'hedge_shrub', label: 'Hedge / shrub', category: 'vegetation', heightBand: 'low', anchorType: 'rhythm',
    rarity: 'common', placementZones: ['park_plaza', 'residential_frontage'],
    conditionStates: ['pristine', 'weathered'], baseWeight: 1,
    districtWeights: { RIVERSIDE: 4, CIVIC: 3, TENEMENT: 2, MARKET: 0, THEATRE: 0, DOCKS: 0, INDUSTRIAL: 0 },
  },
  // — civic —
  fountain: {
    id: 'fountain', label: 'Plaza fountain', category: 'civic', heightBand: 'mid', anchorType: 'anchor',
    rarity: 'rare', placementZones: ['park_plaza'],
    conditionStates: ['pristine', 'weathered'], baseWeight: 0,
    districtWeights: { CIVIC: 5, RIVERSIDE: 3, FINANCIAL: 2, THEATRE: 1 },
  },
  statue_monument: {
    id: 'statue_monument', label: 'Statue / monument', category: 'civic', heightBand: 'tall', anchorType: 'anchor',
    rarity: 'rare', placementZones: ['park_plaza'],
    conditionStates: ['pristine', 'weathered'], baseWeight: 0,
    districtWeights: { CIVIC: 5, FINANCIAL: 2, RIVERSIDE: 2, THEATRE: 1 },
  },
  // — vehicles (belong on the roadway / service ways) —
  parked_car: {
    id: 'parked_car', label: 'Parked automobile', category: 'vehicle', heightBand: 'mid', anchorType: 'rhythm',
    rarity: 'common', placementZones: ['road', 'alley_service'],
    conditionStates: ['pristine', 'weathered', 'damaged'], baseWeight: 2,
    districtWeights: { FINANCIAL: 5, THEATRE: 4, MARKET: 3, TENEMENT: 3, CIVIC: 3 },
  },
  delivery_truck: {
    id: 'delivery_truck', label: 'Delivery truck', category: 'vehicle', heightBand: 'mid', anchorType: 'rare',
    rarity: 'uncommon', placementZones: ['road', 'alley_service', 'industrial_apron'],
    conditionStates: ['pristine', 'weathered'], baseWeight: 0,
    districtWeights: { INDUSTRIAL: 4, DOCKS: 4, MARKET: 2, FINANCIAL: 1, TENEMENT: 1 },
  },
  // — debris (service / industrial clutter) —
  crate_stack: {
    id: 'crate_stack', label: 'Crate stack', category: 'debris', heightBand: 'low', anchorType: 'filler',
    rarity: 'common', placementZones: ['alley_service', 'industrial_apron', 'storefront_frontage'],
    conditionStates: ['pristine', 'weathered', 'damaged'], baseWeight: 0,
    districtWeights: { DOCKS: 5, INDUSTRIAL: 5, MARKET: 2, TENEMENT: 1 },
  },
  barrel_drum: {
    id: 'barrel_drum', label: 'Barrel / drum', category: 'debris', heightBand: 'low', anchorType: 'filler',
    rarity: 'common', placementZones: ['alley_service', 'industrial_apron'],
    conditionStates: ['weathered', 'damaged'], baseWeight: 0,
    districtWeights: { INDUSTRIAL: 5, DOCKS: 4, MARKET: 1, TENEMENT: 1 },
  },
  pallet_stack: {
    id: 'pallet_stack', label: 'Pallet stack', category: 'debris', heightBand: 'low', anchorType: 'filler',
    rarity: 'common', placementZones: ['alley_service', 'industrial_apron'],
    conditionStates: ['weathered', 'damaged'], baseWeight: 0,
    districtWeights: { INDUSTRIAL: 5, DOCKS: 4 },
  },
  // — ground decals (flush; may lie on the roadway / sidewalk since they have no mass) —
  manhole_cover: {
    id: 'manhole_cover', label: 'Manhole cover', category: 'ground_decal', heightBand: 'flush', anchorType: 'filler',
    rarity: 'common', placementZones: ['road', 'alley_service'],
    conditionStates: ['pristine', 'weathered'], baseWeight: 1,
    districtWeights: { INDUSTRIAL: 2, DOCKS: 2, FINANCIAL: 2 },
  },
  sewer_grate: {
    id: 'sewer_grate', label: 'Sewer grate', category: 'ground_decal', heightBand: 'flush', anchorType: 'filler',
    rarity: 'common', placementZones: ['curb', 'road', 'alley_service'],
    conditionStates: ['weathered'], baseWeight: 1,
    districtWeights: { DOCKS: 3, INDUSTRIAL: 3, TENEMENT: 2 },
  },
  puddle_stain: {
    id: 'puddle_stain', label: 'Puddle / oil stain', category: 'ground_decal', heightBand: 'flush', anchorType: 'filler',
    rarity: 'common', placementZones: ['road', 'alley_service', 'sidewalk_through'],
    conditionStates: ['weathered'], baseWeight: 1,
    districtWeights: { DOCKS: 3, INDUSTRIAL: 3, TENEMENT: 2, CIVIC: 0, RIVERSIDE: 0 },
  },
};

/** All 28 family ids, in declaration order. */
export const FAMILY_IDS = Object.keys(FAMILIES) as PropFamilyId[];

/** Look up a family by id (undefined for an unknown id). Pure. */
export function familyById(id: string): PropFamily | undefined {
  return (FAMILIES as Record<string, PropFamily>)[id];
}

/** The structural shape the zone predicate needs, projected from a family. */
export function placementShapeOf(family: PropFamily): PlacementShape {
  return { allowedZones: family.placementZones, heightBand: family.heightBand, category: family.category };
}

/**
 * Ticket-2 forbidden-placement predicate at the FAMILY level: is placing `familyId` in `zoneId` forbidden?
 * Combines the family's declared zones with the structural through-zone rule (see streetscapeZones). Pure &
 * total: an unknown family id is forbidden everywhere.
 */
export function isForbiddenPlacement(familyId: string, zoneId: PlacementZoneId): boolean {
  const family = familyById(familyId);
  if (!family) return true;
  return zoneForbids(placementShapeOf(family), zoneId);
}

/** A family's affinity weight for a district: the per-district override, else its baseWeight. Pure. */
export function weightFor(family: PropFamily, district: StreetscapeDistrict): number {
  return family.districtWeights[district] ?? family.baseWeight;
}

/** All families with a given placement role (anchor/rhythm/filler/rare). Pure. */
export function familiesByAnchorType(type: AnchorType): PropFamily[] {
  return FAMILY_IDS.map((id) => FAMILIES[id]).filter((f) => f.anchorType === type);
}

/** All families that may (per the Ticket-2 predicate) occupy a zone. Pure. */
export function familiesAllowedInZone(zoneId: PlacementZoneId): PropFamily[] {
  return FAMILY_IDS.map((id) => FAMILIES[id]).filter((f) => !zoneForbids(placementShapeOf(f), zoneId));
}

/** True if every weight in the taxonomy sits within [WEIGHT_MIN, WEIGHT_MAX] across all 8 districts. Pure —
 * exported for the invariant test (and any future editor validation). */
export function weightsWithinBounds(): boolean {
  return FAMILY_IDS.every((id) => {
    const f = FAMILIES[id];
    if (f.baseWeight < WEIGHT_MIN || f.baseWeight > WEIGHT_MAX) return false;
    return STREETSCAPE_DISTRICTS.every((d) => {
      const w = weightFor(f, d);
      return w >= WEIGHT_MIN && w <= WEIGHT_MAX;
    });
  });
}
