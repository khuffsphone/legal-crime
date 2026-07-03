// Ticket 3 — district composition tables + density caps. Guards that the 8 districts produce DISTINCT
// distributions, that NO family dominates every district, and that per-block-face density caps are enforced
// in the table data. PURE; composes nothing onto the map.
import { describe, it, expect } from 'vitest';
import {
  DISTRICTS, DISTRICT_IDS, districtById, capFor, blockFaceBudget, compositionFor,
  districtWeightVector, topFamiliesFor,
} from '../src/scenes/env/streetscapeDistricts';
import { ANCHOR_TYPES, type StreetscapeDistrict } from '../src/scenes/env/streetscapeTypes';
import { FAMILIES, FAMILY_IDS, weightFor } from '../src/scenes/env/streetscapeTaxonomy';
import { districtIdentityFor } from '../src/scenes/art/districtIdentity';

const isInt = (n: number) => Number.isInteger(n);

// the canonical 9 archetypes, reconstructed from districtIdentity (wraps index % 9) — the streetscape 8 must
// be a subset, so the two models never disagree on a district name.
const CANONICAL_ARCHETYPES = new Set(Array.from({ length: 9 }, (_, i) => districtIdentityFor(i).archetype));

describe('streetscape district composition — the 8 §6.1 archetypes', () => {
  it('defines exactly 8 districts, each a subset of the canonical districtIdentity archetypes', () => {
    expect(DISTRICT_IDS).toHaveLength(8);
    expect(new Set(DISTRICT_IDS).size).toBe(8);
    for (const id of DISTRICT_IDS) {
      expect(DISTRICTS[id].id).toBe(id);
      expect(DISTRICTS[id].label.length).toBeGreaterThan(0);
      expect(CANONICAL_ARCHETYPES, `${id} must be a real districtIdentity archetype`).toContain(id);
    }
  });

  it('ENFORCES sane per-block-face density caps (int, ordered, rare ≤ 2)', () => {
    for (const id of DISTRICT_IDS) {
      const c = DISTRICTS[id].densityCaps;
      for (const [role, n] of Object.entries(c)) {
        expect(isInt(n), `${id}.${role} int`).toBe(true);
        expect(n, `${id}.${role} ≥ 0`).toBeGreaterThanOrEqual(0);
      }
      expect(c.anchor, `${id} anchor ≥ 1`).toBeGreaterThanOrEqual(1);        // every face gets an anchor
      expect(c.rhythm, `${id} rhythm ≥ anchor`).toBeGreaterThanOrEqual(c.anchor);
      expect(c.filler, `${id} filler ≥ anchor`).toBeGreaterThanOrEqual(c.anchor);
      expect(c.rare, `${id} rare ≤ 2`).toBeLessThanOrEqual(2);               // a rare special is at most 1–2
      expect(blockFaceBudget(id), `${id} budget`).toBe(c.anchor + c.rhythm + c.filler + c.rare);
    }
    // capFor mirrors the table
    expect(capFor('MARKET', 'filler')).toBe(DISTRICTS.MARKET.densityCaps.filler);
  });

  it('produces DISTINCT distributions across all 8 districts (no two identical)', () => {
    const vectors = DISTRICT_IDS.map((id) => JSON.stringify(districtWeightVector(id)));
    expect(new Set(vectors).size).toBe(8); // all pairwise distinct
    // every vector is 28-long (one weight per family)
    for (const id of DISTRICT_IDS) expect(districtWeightVector(id)).toHaveLength(28);
  });

  it('has NO family that dominates ALL districts (signature props vary)', () => {
    const tops = DISTRICT_IDS.map((id) => topFamiliesFor(id));
    // every district has at least one signature (max-weight) family
    for (let i = 0; i < DISTRICT_IDS.length; i++) {
      expect(tops[i].length, `${DISTRICT_IDS[i]} has a top family`).toBeGreaterThan(0);
    }
    // no single family is the top pick in all 8
    for (const fam of FAMILY_IDS) {
      const dominatedCount = tops.filter((t) => t.includes(fam)).length;
      expect(dominatedCount, `${fam} tops ${dominatedCount}/8 districts`).toBeLessThan(8);
    }
    // and the districts don't all crown the same family (variety across the map)
    const distinctTop = new Set(tops.flat());
    expect(distinctTop.size).toBeGreaterThan(1);
  });

  it('compositionFor returns capped, weighted, sorted, eligible families per role', () => {
    for (const id of DISTRICT_IDS) {
      const comp = compositionFor(id);
      for (const role of ANCHOR_TYPES) {
        const tier = comp[role];
        expect(tier.role).toBe(role);
        expect(tier.cap).toBe(DISTRICTS[id].densityCaps[role]);
        // eligible families: correct role, weight > 0, weight matches the taxonomy, sorted desc then id
        for (const wf of tier.families) {
          expect(FAMILIES[wf.id].anchorType, `${id}/${role} ${wf.id} role`).toBe(role);
          expect(wf.weight, `${id}/${role} ${wf.id} weight>0`).toBeGreaterThan(0);
          expect(wf.weight).toBe(weightFor(FAMILIES[wf.id], id as StreetscapeDistrict));
        }
        for (let i = 1; i < tier.families.length; i++) {
          const prev = tier.families[i - 1];
          const cur = tier.families[i];
          expect(prev.weight > cur.weight || (prev.weight === cur.weight && prev.id < cur.id)).toBe(true);
        }
      }
      // every district can field at least one ANCHOR (else a block-face has no focal prop)
      expect(comp.anchor.families.length, `${id} anchor-eligible`).toBeGreaterThan(0);
    }
  });

  it('has NO dead families — every family is eligible in at least one district', () => {
    for (const fam of FAMILY_IDS) {
      const live = DISTRICT_IDS.some((id) => weightFor(FAMILIES[fam], id as StreetscapeDistrict) > 0);
      expect(live, `${fam} appears in no district`).toBe(true);
    }
  });

  it('districtById is a safe lookup', () => {
    expect(districtById('CIVIC')).toBe(DISTRICTS.CIVIC);
    expect(districtById('ATLANTIS')).toBeUndefined();
  });
});
