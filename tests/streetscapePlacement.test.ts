// STREETSCAPE TICKET 4 — the pure placement pass (streetscapePlacement.ts). Mutation-style tests: each name
// states the invariant that must hold. Layouts are hand-built so the (district, tile) arrangement is exact.
import { describe, it, expect } from 'vitest';
import {
  placeStreetscape, toStreetscapeDistrict, isFlushFamily, type StreetscapePlacement,
} from '../src/scenes/env/streetscapePlacement';
import { FAMILIES, isForbiddenPlacement, type PropFamilyId } from '../src/scenes/env/streetscapeTaxonomy';
import { capFor } from '../src/scenes/env/streetscapeDistricts';
import { tileKindAt, type WorldLayout, type TileKind } from '../src/sim/worldgen';
import type { DistrictArchetype } from '../src/scenes/art/districtIdentity';
import type { AnchorType } from '../src/scenes/env/streetscapeTypes';

const CH: Record<string, TileKind> = {
  '.': 'ground', A: 'avenue', S: 'street', W: 'sidewalk', B: 'building', P: 'park', Z: 'plaza',
};

/** Build a WorldLayout from an ASCII grid (rows top→bottom). One district id 'd0' partitions the whole map. */
function makeLayout(rows: string[]): WorldLayout {
  const size = rows.length;
  rows.forEach((r) => { if (r.length !== size) throw new Error('grid must be square'); });
  const tiles: TileKind[] = [];
  for (const r of rows) for (const c of r) tiles.push(CH[c] ?? 'ground');
  return {
    size, cols: size, rows: size, tiles,
    districtOfTile: new Array(size * size).fill('d0'),
    districts: [], hqTiles: {}, businessTiles: {},
  } as unknown as WorldLayout;
}

const archMapOf = (a: DistrictArchetype): Map<string, DistrictArchetype> => new Map([['d0', a]]);
const roleOf = (id: PropFamilyId): AnchorType => FAMILIES[id].anchorType;

// An 8-wide commercial block face: avenue / sidewalk(front) / building, padded so it stays one ≤10 face.
const COMMERCIAL_STRIP = makeLayout([
  'AAAAAAAA',
  'WWWWWWWW',
  'BBBBBBBB',
  '........',
  '........',
  '........',
  '........',
  '........',
]);

describe('T4 placement — determinism & purity', () => {
  it('MUTATION nondeterministic-output: same (layout, archMap, seed) → byte-identical placements', () => {
    const a = placeStreetscape(COMMERCIAL_STRIP, archMapOf('FINANCIAL'), { seed: 42 });
    const b = placeStreetscape(COMMERCIAL_STRIP, archMapOf('FINANCIAL'), { seed: 42 });
    expect(b).toEqual(a);
    const c = placeStreetscape(COMMERCIAL_STRIP, archMapOf('FINANCIAL'), { seed: 99 });
    expect(c).not.toEqual(a); // a different seed yields a different (still valid) arrangement
  });

  it('MUTATION mutates-input: the layout tiles and archMap are untouched (pure)', () => {
    const layout = makeLayout(['AAAAAAAA', 'WWWWWWWW', 'BBBBBBBB', '........', '........', '........', '........', '........']);
    const tilesBefore = layout.tiles.slice();
    const archMap = archMapOf('MARKET');
    placeStreetscape(layout, archMap, { seed: 7 });
    expect(layout.tiles).toEqual(tilesBefore);
    expect([...archMap.entries()]).toEqual([['d0', 'MARKET']]);
  });
});

describe('T4 placement — hard invariants', () => {
  const all: StreetscapePlacement[] = placeStreetscape(COMMERCIAL_STRIP, archMapOf('FINANCIAL'), { seed: 3 });

  it('MUTATION allows-forbidden: every placement is a legal (family, zone) pair', () => {
    for (const p of all) expect(isForbiddenPlacement(p.familyId, p.zone), `${p.familyId}@${p.zone}`).toBe(false);
    expect(all.length).toBeGreaterThan(0);
  });

  it('MUTATION places-on-building: no placement ever lands on a building tile', () => {
    for (const p of all) expect(tileKindAt(COMMERCIAL_STRIP, p.gx, p.gy)).not.toBe('building');
  });

  it('MUTATION exceeds-caps: per-role counts on a single ≤10 face stay within the district caps', () => {
    // the sidewalk row (gy=1) is one commercial FINANCIAL face of 8 tiles
    const face = all.filter((p) => p.gy === 1);
    const byRole: Record<AnchorType, number> = { anchor: 0, rhythm: 0, filler: 0, rare: 0 };
    for (const p of face) byRole[roleOf(p.familyId)] += 1;
    for (const role of ['anchor', 'rhythm', 'filler', 'rare'] as AnchorType[]) {
      expect(byRole[role], `${role}`).toBeLessThanOrEqual(capFor('FINANCIAL', role));
    }
  });

  it('MUTATION duplicate-decals: no tile ever carries two identical placements, and ≤1 flush decal per tile', () => {
    // exercises the flush-cluster overlap path the fuzz flagged (INDUSTRIAL/DOCKS emit many decals)
    const layouts = [COMMERCIAL_STRIP, makeLayout(['AAAAAAAA', 'WWWWWWWW', 'WWWWWWWW', 'BBBBBBBB', '.B.B.B.B', '........', '........', '........'])];
    for (const layout of layouts) {
      for (const arc of ['INDUSTRIAL', 'DOCKS', 'FINANCIAL', 'TENEMENT'] as DistrictArchetype[]) {
        for (let seed = 90; seed < 105; seed++) {
          const out = placeStreetscape(layout, archMapOf(arc), { seed });
          const exact = new Set<string>();
          const flushPerTile = new Map<string, number>();
          for (const p of out) {
            const key = `${p.gx},${p.gy},${p.familyId},${p.zone}`;
            expect(exact.has(key), `dup ${key} (${arc}#${seed})`).toBe(false); // no byte-identical duplicate
            exact.add(key);
            if (isFlushFamily(p.familyId)) {
              const t = `${p.gx},${p.gy}`;
              flushPerTile.set(t, (flushPerTile.get(t) ?? 0) + 1);
            }
          }
          for (const [t, n] of flushPerTile) expect(n, `flush@${t} (${arc}#${seed})`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('MUTATION double-stacks: at most one SOLID prop per tile (flush decals may share)', () => {
    const solidByTile = new Map<string, number>();
    for (const p of all) {
      if (isFlushFamily(p.familyId)) continue;
      const k = `${p.gx},${p.gy}`;
      solidByTile.set(k, (solidByTile.get(k) ?? 0) + 1);
    }
    for (const [k, n] of solidByTile) expect(n, k).toBeLessThanOrEqual(1);
  });
});

describe('T4 placement — zone derivation & red-lines (GPT-Pro §E)', () => {
  it('the sidewalk_through zone only ever holds a FLUSH decal (never a solid obstacle)', () => {
    const layout = makeLayout(['AAAAAAAA', 'WWWWWWWW', 'WWWWWWWW', 'BBBBBBBB', '........', '........', '........', '........']);
    const out = placeStreetscape(layout, archMapOf('INDUSTRIAL'), { seed: 11 });
    for (const p of out.filter((x) => x.zone === 'sidewalk_through')) {
      expect(isFlushFamily(p.familyId), `${p.familyId} in sidewalk_through`).toBe(true);
    }
  });

  it('the road zone only holds a VEHICLE or a FLUSH decal — never street furniture', () => {
    const out = placeStreetscape(COMMERCIAL_STRIP, archMapOf('FINANCIAL'), { seed: 5 });
    for (const p of out.filter((x) => x.zone === 'road')) {
      const f = FAMILIES[p.familyId];
      expect(f.heightBand === 'flush' || f.category === 'vehicle', `${p.familyId}@road`).toBe(true);
    }
  });

  it('a frontage zone appears only where a sidewalk fronts a building; an open sidewalk has none', () => {
    // sidewalk row with NO building adjacency → no frontage zone should be produced
    const openWalk = makeLayout(['AAAAAAAA', 'WWWWWWWW', '........', '........', '........', '........', '........', '........']);
    const out = placeStreetscape(openWalk, archMapOf('FINANCIAL'), { seed: 8 });
    const frontage = out.filter((p) => p.zone === 'storefront_frontage' || p.zone === 'residential_frontage');
    expect(frontage).toHaveLength(0);
  });

  it('never places on an open ground lot that touches no building (stays sparse)', () => {
    const openLot = makeLayout(['........', '........', '........', '........', '........', '........', '........', '........']);
    expect(placeStreetscape(openLot, archMapOf('RIVERSIDE'), { seed: 1 })).toHaveLength(0);
  });
});

describe('T4 placement — archetype routing & the QUARTER fold', () => {
  it('MUTATION district-blind: every placed family has a NON-ZERO affinity for its district', () => {
    const out = placeStreetscape(COMMERCIAL_STRIP, archMapOf('MARKET'), { seed: 4 });
    for (const p of out) {
      const w = FAMILIES[p.familyId].districtWeights.MARKET ?? FAMILIES[p.familyId].baseWeight;
      expect(w, `${p.familyId} in MARKET`).toBeGreaterThan(0);
    }
  });

  it('MUTATION quarter-unhandled: a QUARTER archetype routes through the TENEMENT streetscape set', () => {
    expect(toStreetscapeDistrict('QUARTER')).toBe('TENEMENT');
    const out = placeStreetscape(COMMERCIAL_STRIP, archMapOf('QUARTER'), { seed: 6 });
    for (const p of out) {
      const w = FAMILIES[p.familyId].districtWeights.TENEMENT ?? FAMILIES[p.familyId].baseWeight;
      expect(w, `${p.familyId} via QUARTER→TENEMENT`).toBeGreaterThan(0);
    }
  });
});

describe('T4 placement — density rhythm (not confetti)', () => {
  it('MUTATION every-tile-filled: a large uniform sidewalk leaves many eligible tiles EMPTY', () => {
    // 12×12 of sidewalk fronting avenue+building rows → lots of eligible tiles
    const rows: string[] = [];
    rows.push('A'.repeat(12));
    for (let i = 0; i < 5; i++) rows.push('W'.repeat(12));
    rows.push('B'.repeat(12));
    for (let i = 0; i < 5; i++) rows.push('.'.repeat(12));
    const layout = makeLayout(rows);
    const out = placeStreetscape(layout, archMapOf('FINANCIAL'), { seed: 2 });
    const sidewalkTiles = 5 * 12; // eligible sidewalk cells (rows gy 1..5)
    const sidewalkOccupied = new Set(out.filter((p) => p.gy >= 1 && p.gy <= 5).map((p) => `${p.gx},${p.gy}`)).size;
    expect(sidewalkOccupied).toBeLessThan(sidewalkTiles); // not every tile dressed — quiet stretches remain
    expect(sidewalkOccupied).toBeLessThanOrEqual(Math.ceil(sidewalkTiles * 0.6)); // governor keeps mains subordinate
    expect(out.length).toBeGreaterThan(0);        // …but the city is not empty either
  });
});
