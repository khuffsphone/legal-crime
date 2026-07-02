// streetscapeTypes.ts — Streetscape Layer, Phase 1: the shared VOCABULARY for the environmental prop/street-
// furniture data spine (Tickets 1–3). PURE, Phaser-free. This is the foundational module the zone table
// (streetscapeZones), the asset taxonomy (streetscapeTaxonomy), and the district composition tables
// (streetscapeDistricts) all build on — kept separate so those three never form an import cycle.
//
// ⚠ PROVENANCE — CC-DERIVED PENDING GPT-Pro RECONCILIATION. The task named GPT-Pro's "Environmental Asset /
// Streetscape Aesthetic Specification" (§2.1 zones, §6.1 districts, §10.2 height bands, §11.1 the 28 MVP
// families, §12.1 anchor/rhythm/filler/rare, §12.2 density caps) as the design source, but that document was
// not in the dispatch or the Drive brain folder. This vocabulary + the roster/weights/caps in the sibling
// modules are SYNTHESISED from the canon that IS available — the Brassmere building/ground-plane kit spec
// (§7 ground-plane bands, §7.3 "props subordinate / sidewalk stays clear"), LIVING_CITY_SPEC (placement +
// the faction-neutral colour law), src/scenes/art/districtIdentity.ts (the 9 district archetypes), the
// 25-Asset Batch prop list, and the ticket's own verbatim 9 zones + 4 anchor tiers. Structure is stable and
// tested; the exact family names / weights / cap numbers should be reconciled against GPT-Pro's spec before
// Ticket 4's placement pass consumes them. This layer is PURE DATA — it renders and places NOTHING.

import type { DistrictArchetype } from '../art/districtIdentity';

// ── §2.1 placement zones — the 9 cross-section bands a prop can occupy (verbatim from the ticket) ──────
export type PlacementZoneId =
  | 'road'                 // the vehicular travel surface (lane + parking edge)
  | 'curb'                 // the curb/gutter edge between road and sidewalk
  | 'sidewalk_through'     // the pedestrian THROUGH zone — must stay walkable (NACTO)
  | 'furniture_band'       // the furnishing strip (curb→walk): lamps, trees, hydrants, poles
  | 'storefront_frontage'  // the shallow frontage zone at a commercial building face
  | 'residential_frontage' // the frontage zone at a residential/tenement face (stoops, yards)
  | 'alley_service'        // the rear service alley (Chicago's alley grid)
  | 'park_plaza'           // open civic/leisure ground (plazas, squares, parks)
  | 'industrial_apron';    // the hard apron in front of warehouses / industrial lots

/** The 9 zone ids, in cross-section order (building face → road → alley). */
export const PLACEMENT_ZONE_IDS: readonly PlacementZoneId[] = [
  'storefront_frontage', 'residential_frontage', 'furniture_band', 'sidewalk_through',
  'curb', 'road', 'park_plaza', 'alley_service', 'industrial_apron',
];

// ── §10.2 height bands — how tall a prop reads against the ~56px standing figure (building-kit §7.3) ───
// Ground clutter must stay subordinate (≤ ~⅓ figure); only the deliberate vertical-accent props (lamp/pole/
// tree/sign) rise above head height. Approx screen-px ranges at the game's 56px character scale.
export type HeightBand =
  | 'flush'  // ~0px — ground decals (manhole, grate, puddle): no vertical mass, never occludes
  | 'low'    // ≤ ~20px (≤ ⅓ figure) — subordinate clutter (hydrant, can, crate, bollard)
  | 'mid'    // ~20–56px (⅓–1 figure) — waist/chest props (bench, mailbox, cart, stall)
  | 'tall';  // > 56px — vertical accents that rise past the figure (lamp, pole, tree, blade sign)

/** Approx screen-px height range per band (at the 56px figure scale). Diagnostic / renderer guidance. */
export const HEIGHT_BAND_PX: Readonly<Record<HeightBand, readonly [number, number]>> = {
  flush: [0, 2],
  low: [2, 20],
  mid: [20, 56],
  tall: [56, 160],
};

// ── §11.1 categories — the coarse family grouping ─────────────────────────────────────────────────────
export type PropCategory =
  | 'utility'          // lamps, poles, hydrants, signals — municipal infrastructure
  | 'street_furniture' // benches, mailboxes, bollards, cans — pedestrian fittings
  | 'vegetation'       // trees, hedges, planters
  | 'commercial'       // carts, stalls, news stands, awnings, signage — retail life
  | 'vehicle'          // parked cars, delivery trucks (belong on the roadway)
  | 'debris'           // crates, barrels, pallets — service/industrial clutter
  | 'ground_decal'     // manholes, grates, puddles, stains — flush ground marks
  | 'civic';           // fountains, statues, monuments, call boxes — institutional

// ── §12.1 placement role — how a family participates in a block-face composition ──────────────────────
export type AnchorType =
  | 'anchor'  // the sparse, high-visual-weight prop that ANCHORS a block-face (tree, lamp, fountain)
  | 'rhythm'  // a repeating-cadence prop that sets the beat down the block (lamp row, poles, parked cars)
  | 'filler'  // small subordinate props that fill gaps (can, planter, bollard, hydrant, crate)
  | 'rare';   // special / infrequent props (call box, vendor cart, statue, delivery truck)

export const ANCHOR_TYPES: readonly AnchorType[] = ['anchor', 'rhythm', 'filler', 'rare'];

// ── condition/visual states (building-kit §3.2 growth language, adapted to props; LIVING_CITY weathering) ─
export type ConditionState =
  | 'pristine'   // clean / new
  | 'weathered'  // aged, muted, worn paint (the default noir read)
  | 'damaged'    // broken / dented / boarded
  | 'lit'        // emissive at night (lamps, blade signs, lit transoms)
  | 'unlit';     // the daytime / dark state of a lightable prop

// ── how often a family appears at all (distinct from anchorType, which is WHERE it sits) ──────────────
export type Rarity = 'common' | 'uncommon' | 'rare';

// ── §6.1 district archetypes — the 8 streetscape districts. Tied to the canonical district model so they
// stay a COMPILE-TIME subset of src/scenes/art/districtIdentity.ts's 9 archetypes (QUARTER folds into the
// residential/market read for streetscape purposes; reconcile the exact 8 with GPT-Pro's §6.1). ──────────
export const STREETSCAPE_DISTRICTS = [
  'FINANCIAL', 'MARKET', 'THEATRE', 'TENEMENT', 'CIVIC', 'DOCKS', 'INDUSTRIAL', 'RIVERSIDE',
] as const satisfies readonly DistrictArchetype[];

export type StreetscapeDistrict = (typeof STREETSCAPE_DISTRICTS)[number];

/** Min/max affinity weight a family may declare for a district (0 = never appears there). */
export const WEIGHT_MIN = 0;
export const WEIGHT_MAX = 5;
