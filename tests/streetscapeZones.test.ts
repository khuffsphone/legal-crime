// Ticket 2 — placement zones + the forbidden-placement predicate. Guards the 9 zones and that forbidden
// placements are REJECTED (the named cases: hydrant mid-sidewalk, bench in road, vendor cart in a
// residential yard) while legitimate ones pass. PURE; no collision-system coupling.
import { describe, it, expect } from 'vitest';
import {
  ZONES, PlacementShape, forbiddenReason, isForbiddenPlacement, zoneBlocksThrough, allowedZonesFor,
} from '../src/scenes/env/streetscapeZones';
import { PLACEMENT_ZONE_IDS, type PlacementZoneId } from '../src/scenes/env/streetscapeTypes';
import {
  FAMILIES, FAMILY_IDS, isForbiddenPlacement as familyForbidden, placementShapeOf,
} from '../src/scenes/env/streetscapeTaxonomy';

const EXPECTED_ZONES: readonly PlacementZoneId[] = [
  'road', 'curb', 'sidewalk_through', 'furniture_band', 'storefront_frontage',
  'residential_frontage', 'alley_service', 'park_plaza', 'industrial_apron',
];

describe('streetscape placement zones — the 9 §2.1 bands', () => {
  it('defines exactly the 9 expected zones with complete metadata', () => {
    expect(PLACEMENT_ZONE_IDS).toHaveLength(9);
    expect(new Set(PLACEMENT_ZONE_IDS).size).toBe(9);
    expect(new Set(PLACEMENT_ZONE_IDS)).toEqual(new Set(EXPECTED_ZONES));
    for (const id of PLACEMENT_ZONE_IDS) {
      const z = ZONES[id];
      expect(z.id).toBe(id);
      expect(z.label.length).toBeGreaterThan(0);
      expect(z.description.length).toBeGreaterThan(0);
      expect(['roadway', 'pedestrian', 'furnishing', 'frontage', 'service', 'open']).toContain(z.surface);
      expect(typeof z.blocksThrough).toBe('boolean');
    }
  });

  it('marks ONLY the road + sidewalk-through as through-movement zones', () => {
    expect(zoneBlocksThrough('road')).toBe(true);
    expect(zoneBlocksThrough('sidewalk_through')).toBe(true);
    for (const id of PLACEMENT_ZONE_IDS) {
      if (id !== 'road' && id !== 'sidewalk_through') expect(zoneBlocksThrough(id), id).toBe(false);
    }
  });

  it('REJECTS the named forbidden placements, ACCEPTS their legitimate zones', () => {
    // hydrant mid-sidewalk → rejected; hydrant at the curb → fine
    expect(familyForbidden('fire_hydrant', 'sidewalk_through')).toBe(true);
    expect(familyForbidden('fire_hydrant', 'curb')).toBe(false);
    // bench in the road → rejected; bench in the furniture band → fine
    expect(familyForbidden('bench', 'road')).toBe(true);
    expect(familyForbidden('bench', 'furniture_band')).toBe(false);
    // vendor cart in a residential yard → rejected; cart on a plaza → fine
    expect(familyForbidden('vendor_cart', 'residential_frontage')).toBe(true);
    expect(familyForbidden('vendor_cart', 'park_plaza')).toBe(false);
  });

  it('the STRUCTURAL layer blocks a solid non-vehicle prop from a through-zone even if it lists it', () => {
    // a bench that (mis)declares 'road' is still rejected by the structural layer
    const rogueBench: PlacementShape = { allowedZones: ['road'], heightBand: 'mid', category: 'street_furniture' };
    expect(isForbiddenPlacement(rogueBench, 'road')).toBe(true);
    expect(forbiddenReason(rogueBench, 'road')).toBe('blocks-through');
    // and nothing solid may sit in the sidewalk through-zone
    const rogueOnWalk: PlacementShape = { allowedZones: ['sidewalk_through'], heightBand: 'low', category: 'utility' };
    expect(forbiddenReason(rogueOnWalk, 'sidewalk_through')).toBe('blocks-through');
  });

  it('EXEMPTS vehicles on the roadway and flush ground decals from the structural block', () => {
    expect(familyForbidden('parked_car', 'road')).toBe(false); // a car belongs on the road
    expect(familyForbidden('delivery_truck', 'road')).toBe(false);
    expect(familyForbidden('manhole_cover', 'road')).toBe(false); // flush decal, no mass
    expect(familyForbidden('puddle_stain', 'sidewalk_through')).toBe(false); // flush decal on the walk is fine
    // but a mid-height vehicle is NOT exempt on the sidewalk (only the roadway exempts vehicles)
    const carOnWalk: PlacementShape = { allowedZones: ['sidewalk_through'], heightBand: 'mid', category: 'vehicle' };
    expect(forbiddenReason(carOnWalk, 'sidewalk_through')).toBe('blocks-through');
  });

  it('is SELF-CONSISTENT: every family is allowed in each of its OWN declared zones', () => {
    // the data respects the structural rule — a family never lists a zone the predicate would then reject.
    for (const id of FAMILY_IDS) {
      const f = FAMILIES[id];
      for (const z of f.placementZones) {
        expect(familyForbidden(id, z), `${id} should be allowed in its own zone ${z}`).toBe(false);
      }
    }
  });

  it('no NON-flush, NON-vehicle family declares a through-movement zone', () => {
    for (const id of FAMILY_IDS) {
      const f = FAMILIES[id];
      const throughZones = f.placementZones.filter((z) => z === 'road' || z === 'sidewalk_through');
      if (throughZones.length > 0) {
        const ok = f.heightBand === 'flush' || (f.category === 'vehicle' && !throughZones.includes('sidewalk_through'));
        expect(ok, `${id} lists ${throughZones} but is ${f.heightBand}/${f.category}`).toBe(true);
      }
    }
  });

  it('handles unknown families/zones defensively', () => {
    expect(familyForbidden('does_not_exist', 'road')).toBe(true);
    const shape: PlacementShape = { allowedZones: ['curb'], heightBand: 'low', category: 'utility' };
    expect(forbiddenReason(shape, 'nowhere' as PlacementZoneId)).toBe('unknown-zone');
  });

  it('allowedZonesFor round-trips against the predicate', () => {
    const shape = placementShapeOf(FAMILIES.street_tree);
    const allowed = allowedZonesFor(shape);
    for (const z of PLACEMENT_ZONE_IDS) {
      expect(allowed.includes(z)).toBe(!isForbiddenPlacement(shape, z));
    }
    expect(allowed).toContain('furniture_band');
    expect(allowed).not.toContain('road');
  });
});
