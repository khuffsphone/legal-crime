// Ticket 1 — asset taxonomy. Guards that every MVP prop family carries COMPLETE, valid metadata, so the
// placement pass (Ticket 4) can trust the spine. PURE data; no Phaser, no render.
import { describe, it, expect } from 'vitest';
import {
  FAMILIES, FAMILY_IDS, familyById, weightFor, familiesByAnchorType, placementShapeOf, weightsWithinBounds,
  type PropFamily,
} from '../src/scenes/env/streetscapeTaxonomy';
import {
  ANCHOR_TYPES, PLACEMENT_ZONE_IDS, STREETSCAPE_DISTRICTS, WEIGHT_MAX, WEIGHT_MIN,
  type ConditionState, type HeightBand, type PropCategory, type Rarity,
} from '../src/scenes/env/streetscapeTypes';

const CATEGORIES: readonly PropCategory[] = [
  'utility', 'street_furniture', 'vegetation', 'commercial', 'vehicle', 'debris', 'ground_decal', 'civic',
];
const HEIGHT_BANDS: readonly HeightBand[] = ['flush', 'low', 'mid', 'tall'];
const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare'];
const CONDITIONS: readonly ConditionState[] = ['pristine', 'weathered', 'damaged', 'lit', 'unlit'];

const isInt = (n: number) => Number.isInteger(n);

describe('streetscape taxonomy — the 28 MVP prop families', () => {
  it('has exactly 28 families with unique ids matching their keys', () => {
    expect(FAMILY_IDS).toHaveLength(28);
    expect(new Set(FAMILY_IDS).size).toBe(28);
    for (const id of FAMILY_IDS) expect(FAMILIES[id].id).toBe(id); // key === record.id
  });

  it('every family has COMPLETE, valid required metadata', () => {
    for (const id of FAMILY_IDS) {
      const f: PropFamily = FAMILIES[id];
      expect(f.label.length, `${id} label`).toBeGreaterThan(0);
      expect(CATEGORIES, `${id} category`).toContain(f.category);
      expect(HEIGHT_BANDS, `${id} heightBand`).toContain(f.heightBand);
      expect(ANCHOR_TYPES, `${id} anchorType`).toContain(f.anchorType);
      expect(RARITIES, `${id} rarity`).toContain(f.rarity);

      // placementZones: non-empty, valid, no dupes
      expect(f.placementZones.length, `${id} placementZones`).toBeGreaterThan(0);
      expect(new Set(f.placementZones).size, `${id} placementZones dupes`).toBe(f.placementZones.length);
      for (const z of f.placementZones) expect(PLACEMENT_ZONE_IDS, `${id} zone ${z}`).toContain(z);

      // conditionStates: non-empty, valid, no dupes
      expect(f.conditionStates.length, `${id} conditionStates`).toBeGreaterThan(0);
      expect(new Set(f.conditionStates).size, `${id} conditionStates dupes`).toBe(f.conditionStates.length);
      for (const c of f.conditionStates) expect(CONDITIONS, `${id} condition ${c}`).toContain(c);

      // weights: baseWeight in range; every override key is a real district with an in-range int value
      expect(isInt(f.baseWeight) && f.baseWeight >= WEIGHT_MIN && f.baseWeight <= WEIGHT_MAX, `${id} baseWeight`).toBe(true);
      for (const [dist, w] of Object.entries(f.districtWeights)) {
        expect(STREETSCAPE_DISTRICTS as readonly string[], `${id} override district ${dist}`).toContain(dist);
        expect(isInt(w) && w >= WEIGHT_MIN && w <= WEIGHT_MAX, `${id} override ${dist}=${w}`).toBe(true);
      }
    }
  });

  it('resolves an in-range weight for EVERY family across ALL 8 districts', () => {
    expect(weightsWithinBounds()).toBe(true);
    for (const id of FAMILY_IDS) {
      for (const d of STREETSCAPE_DISTRICTS) {
        const w = weightFor(FAMILIES[id], d);
        expect(typeof w).toBe('number');
        expect(w).toBeGreaterThanOrEqual(WEIGHT_MIN);
        expect(w).toBeLessThanOrEqual(WEIGHT_MAX);
      }
    }
  });

  it('populates every placement role AND every category (a complete vocabulary)', () => {
    for (const t of ANCHOR_TYPES) expect(familiesByAnchorType(t).length, `role ${t}`).toBeGreaterThan(0);
    const cats = new Set(FAMILY_IDS.map((id) => FAMILIES[id].category));
    for (const c of CATEGORIES) expect(cats, `category ${c}`).toContain(c);
  });

  it('familyById + placementShapeOf are consistent projections', () => {
    expect(familyById('bench')).toBe(FAMILIES.bench);
    expect(familyById('nope')).toBeUndefined();
    const shape = placementShapeOf(FAMILIES.fire_hydrant);
    expect(shape.allowedZones).toBe(FAMILIES.fire_hydrant.placementZones);
    expect(shape.heightBand).toBe('low');
    expect(shape.category).toBe('utility');
  });

  it('the three named test props exist with the expected role/zone shape', () => {
    // the ticket's forbidden-placement examples reference these families
    expect(FAMILIES.fire_hydrant.placementZones).not.toContain('sidewalk_through');
    expect(FAMILIES.bench.placementZones).not.toContain('road');
    expect(FAMILIES.vendor_cart.placementZones).not.toContain('residential_frontage');
  });
});
