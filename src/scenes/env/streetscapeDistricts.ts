// streetscapeDistricts.ts — Streetscape Layer, Phase 1, TICKET 3: the 8 district COMPOSITION tables (§6.1)
// — prop-family weights (sourced from the taxonomy) + per-block-face density CAPS (§12.2:
// anchor/rhythm/filler/rare counts). PURE, Phaser-free. This tells Ticket 4's placement pass, for a given
// district's block-face, HOW MANY of each role to place and WHICH families are eligible (weighted). It
// composes NOTHING onto the live map. See the CC-DERIVED provenance note in streetscapeTypes.ts.

import type { AnchorType, StreetscapeDistrict } from './streetscapeTypes';
import { ANCHOR_TYPES, STREETSCAPE_DISTRICTS } from './streetscapeTypes';
import { FAMILIES, FAMILY_IDS, weightFor, type PropFamilyId } from './streetscapeTaxonomy';

/** Per-block-face maximum prop counts by placement role (§12.2). A "block-face" = one side of a block
 * (a handful of tiles). Caps keep the streetscape SUBORDINATE (building-kit §7.3) and legible: a few
 * anchors, a repeating rhythm, some filler, at most a rare special. */
export interface DensityCaps {
  anchor: number;
  rhythm: number;
  filler: number;
  rare: number;
}

export interface DistrictComposition {
  id: StreetscapeDistrict;
  label: string;
  description: string;
  densityCaps: DensityCaps;
}

/** The 8 districts (§6.1). Caps are tuned per archetype: dense downtown (FINANCIAL) vs sparse-poor
 * (TENEMENT) vs debris-heavy service (DOCKS/INDUSTRIAL) vs green-leisure (RIVERSIDE). Every cap set keeps
 * anchor ≤ rhythm, filler ≥ anchor, and rare ≤ 2 (a rare special is at most one, occasionally two). */
export const DISTRICTS: Readonly<Record<StreetscapeDistrict, DistrictComposition>> = {
  FINANCIAL: {
    id: 'FINANCIAL', label: 'Financial district',
    description: 'Dense downtown: formal lamps + signals anchor the corners, parked autos set the rhythm, mail/bollards fill.',
    densityCaps: { anchor: 2, rhythm: 6, filler: 6, rare: 1 },
  },
  MARKET: {
    id: 'MARKET', label: 'Market district',
    description: 'Busy retail: newsstands anchor, stalls + awnings set the beat, carts + refuse crowd the filler.',
    densityCaps: { anchor: 2, rhythm: 5, filler: 8, rare: 2 },
  },
  THEATRE: {
    id: 'THEATRE', label: 'Theatre / vice row',
    description: 'Entertainment strip: bright lamps anchor, awnings rhythm, blade/neon signs are the signature rare.',
    densityCaps: { anchor: 2, rhythm: 4, filler: 5, rare: 2 },
  },
  TENEMENT: {
    id: 'TENEMENT', label: 'Tenement quarter',
    description: 'Poor residential: sparse + worn — a tree or two, pole rhythm, hydrants/cans filler, no specials.',
    densityCaps: { anchor: 1, rhythm: 3, filler: 4, rare: 0 },
  },
  CIVIC: {
    id: 'CIVIC', label: 'Civic center',
    description: 'Institutional: fountains/statues/trees anchor, benches + lamps rhythm, planters filler, call box rare.',
    densityCaps: { anchor: 2, rhythm: 4, filler: 4, rare: 1 },
  },
  DOCKS: {
    id: 'DOCKS', label: 'Docks / waterfront',
    description: 'Gritty waterfront: a lone kiosk anchor, poles rhythm, crates/barrels/grates/puddles heavy filler.',
    densityCaps: { anchor: 1, rhythm: 3, filler: 7, rare: 1 },
  },
  INDUSTRIAL: {
    id: 'INDUSTRIAL', label: 'Industrial yards',
    description: 'Warehouse aprons: sparse anchor, pole rhythm, drums/pallets/crates dominate the filler, trucks rare.',
    densityCaps: { anchor: 1, rhythm: 3, filler: 8, rare: 1 },
  },
  RIVERSIDE: {
    id: 'RIVERSIDE', label: 'Riverside / park',
    description: 'Leisure green: trees anchor, hedges + benches rhythm, planters filler, a fountain the rare feature.',
    densityCaps: { anchor: 2, rhythm: 5, filler: 5, rare: 1 },
  },
};

/** The 8 district ids (a compile-time-checked subset of districtIdentity's archetypes). */
export const DISTRICT_IDS = STREETSCAPE_DISTRICTS;

/** Look up a district by id (undefined for unknown). Pure. */
export function districtById(id: string): DistrictComposition | undefined {
  return (DISTRICTS as Record<string, DistrictComposition>)[id];
}

/** The per-block-face cap for a role in a district. Pure. */
export function capFor(district: StreetscapeDistrict, role: AnchorType): number {
  return DISTRICTS[district].densityCaps[role];
}

/** Total props a district's block-face may carry (sum of the four role caps). Pure. */
export function blockFaceBudget(district: StreetscapeDistrict): number {
  const c = DISTRICTS[district].densityCaps;
  return c.anchor + c.rhythm + c.filler + c.rare;
}

export interface WeightedFamily {
  id: PropFamilyId;
  weight: number;
}

export interface TierComposition {
  role: AnchorType;
  /** the per-block-face cap for this role in this district. */
  cap: number;
  /** eligible families (weight > 0 in this district) with that role, sorted by weight desc then id. */
  families: WeightedFamily[];
}

/**
 * The composition table for a district: for each placement role, the cap + the weighted, eligible families
 * (those with a non-zero affinity for this district) sorted by weight. Ticket 4's placement pass samples up
 * to `cap` families per role from `families`. Pure & deterministic (stable sort by weight then id).
 */
export function compositionFor(district: StreetscapeDistrict): Record<AnchorType, TierComposition> {
  const out = {} as Record<AnchorType, TierComposition>;
  for (const role of ANCHOR_TYPES) {
    const families: WeightedFamily[] = FAMILY_IDS
      .map((id) => FAMILIES[id])
      .filter((f) => f.anchorType === role && weightFor(f, district) > 0)
      .map((f) => ({ id: f.id, weight: weightFor(f, district) }))
      .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
    out[role] = { role, cap: DISTRICTS[district].densityCaps[role], families };
  }
  return out;
}

/** The full 28-length affinity vector for a district (weightFor every family, in FAMILY_IDS order). Pure —
 * the basis for the "districts produce DISTINCT distributions" invariant test. */
export function districtWeightVector(district: StreetscapeDistrict): number[] {
  return FAMILY_IDS.map((id) => weightFor(FAMILIES[id], district));
}

/** The family ids with the MAXIMUM affinity in a district (its signature props). Pure — the basis for the
 * "no family dominates ALL districts" invariant test. */
export function topFamiliesFor(district: StreetscapeDistrict): PropFamilyId[] {
  let max = -1;
  for (const id of FAMILY_IDS) {
    const w = weightFor(FAMILIES[id], district);
    if (w > max) max = w;
  }
  return FAMILY_IDS.filter((id) => weightFor(FAMILIES[id], district) === max && max > 0);
}
