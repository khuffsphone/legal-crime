// streetscapePlacement.ts — Streetscape Layer, TICKET 4: the PURE, Phaser-free placement pass. Turns a
// generated world layout into a district- and zone-aware list of streetscape prop placements, consuming the
// merged data spine (streetscapeTypes/Zones/Taxonomy/Districts) + the citizen-layer archetype helpers. It
// DECIDES placement; it renders NOTHING (the scene's drawStreetscape reads this and bakes images). Pure &
// deterministic from (layout, archMap, seed).
//
// This supersedes the district-blind legacy scatterProps for the streetscape system. Where scatterProps read
// only TileKind + neighbours, this crosses TileKind × district ARCHETYPE × placement ZONE, then samples the
// weighted, cap-limited family composition per block-face.
//
// DESIGN AUTHORITY: the aesthetic rules encoded here (zone derivation, block-face length bands, role rhythm,
// condition policy, sub-tile offsets) follow GPT-Pro's Environmental Asset / Streetscape Aesthetic Spec §9
// A/B/D/E/G reconciliation. This module is ROSTER-AGNOSTIC: it reads whatever families the taxonomy exposes,
// so a later roster reconciliation (adopting GPT-Pro's §11.1 exactly) needs no change here — only the data.

import { tileKindAt, type WorldLayout, type TileKind } from '../../sim/worldgen';
import { Rng } from '../../sim/rng';
import { hashKey, type DistrictArchetype } from '../art/districtIdentity';
import { buildDistrictArchetypeMap, archetypeAtTile } from '../citizens/planner';
import type { AnchorType, ConditionState, PlacementZoneId, StreetscapeDistrict } from './streetscapeTypes';
import { FAMILIES, familyById, isForbiddenPlacement, type PropFamilyId } from './streetscapeTaxonomy';
import { capFor, compositionFor } from './streetscapeDistricts';

/** One placed streetscape prop — the richer contract (a superset of the legacy PropPlacement). */
export interface StreetscapePlacement {
  familyId: PropFamilyId;
  zone: PlacementZoneId;
  gx: number;
  gy: number;
  /** sub-tile pixel nudge expressing the prop's cross-section zone (§A). */
  subOffset: { dx: number; dy: number };
  /** maintenance/visual condition, chosen by district × family × zone (§D). */
  condition: ConditionState;
  /** deterministic per-instance art-variety index (0..3). */
  variant: number;
}

export interface PlaceOptions { seed?: number; }

/** The block-face "type", derived from the dominant zone of a contiguous frontage run (§B). */
type FaceType = 'commercial' | 'residential' | 'industrial' | 'alley' | 'park' | 'road';

/** A candidate tile the placement pass may dress. */
interface Candidate {
  gx: number;
  gy: number;
  district: StreetscapeDistrict;
  faceType: FaceType;
  zones: PlacementZoneId[];
}

// ── §A sub-tile offset candidates per zone (pixel nudges from the tile's screen centre). Exposed as DATA so
// the exact magnitudes stay a tuning knob, never logic. Directional bias per GPT-Pro's zone table. ──────────
const ZONE_ANCHORS: Readonly<Record<PlacementZoneId, ReadonlyArray<{ dx: number; dy: number }>>> = {
  road: [{ dx: 0, dy: 0 }, { dx: 0, dy: -2 }, { dx: 0, dy: 2 }],                 // center-biased
  curb: [{ dx: 0, dy: -6 }, { dx: -4, dy: -4 }, { dx: 4, dy: -4 }],             // tight to the road/sidewalk seam
  furniture_band: [{ dx: -10, dy: 2 }, { dx: 10, dy: 2 }, { dx: 0, dy: 4 }],    // curb-side sidewalk band
  sidewalk_through: [{ dx: 0, dy: 0 }],                                         // clear centre (flush decals only)
  storefront_frontage: [{ dx: -8, dy: -8 }, { dx: 8, dy: -8 }, { dx: 0, dy: -10 }], // building-side
  residential_frontage: [{ dx: -8, dy: -8 }, { dx: 8, dy: -8 }, { dx: 0, dy: -8 }], // building-side
  alley_service: [{ dx: -12, dy: 0 }, { dx: 12, dy: 0 }, { dx: -10, dy: 4 }, { dx: 10, dy: 4 }], // wall-adjacent, denser
  park_plaza: [{ dx: -16, dy: 4 }, { dx: 16, dy: 4 }, { dx: -12, dy: -6 }, { dx: 12, dy: -6 }],  // edge-biased, centre open
  industrial_apron: [{ dx: 0, dy: 6 }, { dx: -10, dy: 4 }, { dx: 10, dy: 4 }],  // loading-door / curb-adjacent
};

// ── §D district condition preference (ordered, among the taxonomy's weathering states). chooseCondition
// intersects this with the family's supported states; the ordering expresses class/maintenance/neglect. ─────
const DISTRICT_CONDITION_PREF: Readonly<Record<StreetscapeDistrict, ReadonlyArray<ConditionState>>> = {
  FINANCIAL: ['pristine', 'weathered', 'damaged'],
  CIVIC: ['pristine', 'weathered', 'damaged'],
  MARKET: ['weathered', 'pristine', 'damaged'],
  THEATRE: ['weathered', 'pristine', 'damaged'],
  RIVERSIDE: ['pristine', 'weathered', 'damaged'],
  TENEMENT: ['weathered', 'damaged', 'pristine'],
  DOCKS: ['weathered', 'damaged', 'pristine'],
  INDUSTRIAL: ['weathered', 'damaged', 'pristine'],
};

const ORTHO: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ── §G "not confetti" governor: the max fraction of a face's tiles that may carry a SOLID prop, so quiet
// stretches always survive regardless of the (cap-heavy) district budgets. Alleys/aprons read denser than
// main streets; nothing here counts flush ground decals (they never block the game read). Tuning DATA. ──────
const FILL_FRACTION: Readonly<Record<FaceType, number>> = {
  commercial: 0.55, residential: 0.5, park: 0.45, road: 0.4, alley: 0.8, industrial: 0.8,
};

/** QUARTER folds to TENEMENT for streetscape purposes; the other 8 archetypes ARE the streetscape set. */
export function toStreetscapeDistrict(archetype: DistrictArchetype): StreetscapeDistrict {
  return archetype === 'QUARTER' ? 'TENEMENT' : (archetype as StreetscapeDistrict);
}

/** A stable per-instance index in [0,n) from (gx,gy,familyId[,salt]) — independent of placement order. */
function stableIndex(gx: number, gy: number, familyId: string, salt: string, n: number): number {
  if (n <= 1) return 0;
  return hashKey(`${gx}:${gy}:${familyId}:${salt}`) % n;
}

/** Which of the 9 placement zones a tile makes available, and its block-face type (§E derivation). Worldgen
 * carries no zones, so they are DERIVED here from TileKind + orthogonal neighbourhood + district archetype. */
function zonesForTile(
  layout: WorldLayout, gx: number, gy: number, kind: TileKind, district: StreetscapeDistrict,
): { zones: PlacementZoneId[]; faceType: FaceType } | null {
  const k = (x: number, y: number): TileKind => tileKindAt(layout, x, y);
  const touches = (t: TileKind): boolean => ORTHO.some(([dx, dy]) => k(gx + dx, gy + dy) === t);
  const touchesRoad = (): boolean => ORTHO.some(([dx, dy]) => { const n = k(gx + dx, gy + dy); return n === 'avenue' || n === 'street'; });

  if (kind === 'building') return null; // facade path owns the building face
  if (kind === 'sidewalk') {
    const zones: PlacementZoneId[] = ['furniture_band', 'sidewalk_through'];
    if (touchesRoad()) zones.push('curb');
    if (touches('building')) {
      // MVP frontage-by-archetype proxy (§F reconciliation deferred: building-kind-first needs a tile→business
      // lookup). Commercial-reading districts get a storefront frontage; residential ones a yard frontage.
      const commercial = district === 'FINANCIAL' || district === 'MARKET' || district === 'THEATRE' || district === 'CIVIC';
      zones.push(commercial ? 'storefront_frontage' : 'residential_frontage');
      return { zones, faceType: commercial ? 'commercial' : 'residential' };
    }
    return { zones, faceType: 'road' };
  }
  if (kind === 'avenue' || kind === 'street') {
    if (!touches('sidewalk')) return null; // only curbside strips carry road props
    return { zones: ['road', 'curb'], faceType: 'road' };
  }
  if (kind === 'park' || kind === 'plaza') return { zones: ['park_plaza'], faceType: 'park' };
  if (kind === 'ground') {
    if (!touches('building')) return null; // open lot — stays sparse
    if (district === 'INDUSTRIAL' || district === 'DOCKS') return { zones: ['industrial_apron'], faceType: 'industrial' };
    return { zones: ['residential_frontage'], faceType: 'residential' };
  }
  return null;
}

/** Effective per-role caps for a face, applying the §B length bands to the district's base caps. */
function faceCaps(district: StreetscapeDistrict, faceLen: number): Record<AnchorType, number> {
  const base = { anchor: capFor(district, 'anchor'), rhythm: capFor(district, 'rhythm'), filler: capFor(district, 'filler'), rare: capFor(district, 'rare') };
  if (faceLen <= 2) return { anchor: 0, rhythm: Math.min(base.rhythm, faceLen), filler: Math.min(base.filler, faceLen), rare: 0 }; // micro
  if (faceLen <= 5) return { ...base, anchor: Math.min(1, base.anchor) };                                                          // small
  return base;                                                                                                                     // standard (6-10; >10 pre-split)
}

/** Pick a legal (family, zone) pair for a role on a tile: weighted by district affinity, filtered by the
 * forbidden-placement predicate. Returns null if the role has no eligible family for any of the tile's zones. */
function pickFamilyZone(
  comp: ReturnType<typeof compositionFor>, role: AnchorType, zones: PlacementZoneId[], rng: Rng,
): { familyId: PropFamilyId; zone: PlacementZoneId } | null {
  const pairs: { familyId: PropFamilyId; zone: PlacementZoneId; weight: number }[] = [];
  for (const wf of comp[role].families) {
    for (const zone of zones) {
      if (!isForbiddenPlacement(wf.id, zone)) pairs.push({ familyId: wf.id, zone, weight: wf.weight });
    }
  }
  if (pairs.length === 0) return null;
  const total = pairs.reduce((s, p) => s + p.weight, 0);
  let roll = rng.nextFloat() * total;
  for (const p of pairs) { roll -= p.weight; if (roll <= 0) return { familyId: p.familyId, zone: p.zone }; }
  const last = pairs[pairs.length - 1];
  return { familyId: last.familyId, zone: last.zone };
}

/** Choose a condition by district preference intersected with the family's supported states (§D). */
function chooseCondition(familyId: PropFamilyId, district: StreetscapeDistrict, gx: number, gy: number): ConditionState {
  const family = FAMILIES[familyId];
  const supported = family.conditionStates.filter((c) => c === 'pristine' || c === 'weathered' || c === 'damaged');
  const pool = supported.length > 0 ? supported : family.conditionStates;
  const pref = DISTRICT_CONDITION_PREF[district].filter((c) => pool.includes(c));
  const ordered = pref.length > 0 ? pref : pool;
  // favour the district's top preference; a stable minority picks the secondary for variety.
  const idx = ordered.length > 1 && stableIndex(gx, gy, familyId, 'cond', 4) === 0 ? 1 : 0;
  return ordered[Math.min(idx, ordered.length - 1)];
}

/** Build one placement record for a chosen (family, zone) on a tile. */
function makePlacement(familyId: PropFamilyId, zone: PlacementZoneId, gx: number, gy: number, district: StreetscapeDistrict): StreetscapePlacement {
  const anchors = ZONE_ANCHORS[zone];
  const subOffset = anchors[stableIndex(gx, gy, familyId, 'off', anchors.length)];
  return {
    familyId, zone, gx, gy,
    subOffset: { dx: subOffset.dx, dy: subOffset.dy },
    condition: chooseCondition(familyId, district, gx, gy),
    variant: stableIndex(gx, gy, familyId, 'var', 4),
  };
}

/**
 * The Ticket-4 placement pass. Deterministic from (layout, archMap, seed): scans tiles row-major, derives each
 * tile's zones + district, segments contiguous same-(district,face) runs into block-faces (split at >10),
 * then per face places the weighted family composition to the per-role caps with anchor/rhythm/filler/rare
 * rhythm discipline (spaced anchors, cadenced rhythm, clustered filler, rare specials — quiet stretches left
 * empty). Never places on a building tile, never a forbidden (family, zone) pair, never re-runs generateWorld.
 */
export function placeStreetscape(layout: WorldLayout, archMap: Map<string, DistrictArchetype>, opts: PlaceOptions = {}): StreetscapePlacement[] {
  const rng = new Rng(((opts.seed ?? 1) ^ 0x30c0) >>> 0);
  const size = layout.size;
  const idx = (gx: number, gy: number): number => gy * size + gx;

  // ── Pass 1: classify every candidate tile (row-major, stable order) ──
  const cand: (Candidate | null)[] = new Array(size * size).fill(null);
  for (let gy = 0; gy < size; gy++) {
    for (let gx = 0; gx < size; gx++) {
      const arch = archetypeAtTile(layout, archMap, gx, gy);
      if (!arch) continue;
      const district = toStreetscapeDistrict(arch);
      const kind = tileKindAt(layout, gx, gy);
      const derived = zonesForTile(layout, gx, gy, kind, district);
      if (!derived || derived.zones.length === 0) continue;
      cand[idx(gx, gy)] = { gx, gy, district, faceType: derived.faceType, zones: derived.zones };
    }
  }

  // ── Pass 2: segment into block-faces (4-connected, same district+faceType), split runs >10 ──
  const faceOf = new Int32Array(size * size).fill(-1);
  const faces: Candidate[][] = [];
  for (let gy = 0; gy < size; gy++) {
    for (let gx = 0; gx < size; gx++) {
      const start = cand[idx(gx, gy)];
      if (!start || faceOf[idx(gx, gy)] !== -1) continue;
      // flood-fill this face (BFS in scan order → deterministic)
      const face: Candidate[] = [];
      const queue: Candidate[] = [start];
      faceOf[idx(gx, gy)] = faces.length; // provisional; reassigned after split
      while (queue.length > 0) {
        const c = queue.shift()!;
        face.push(c);
        for (const [dx, dy] of ORTHO) {
          const nx = c.gx + dx, ny = c.gy + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const n = cand[idx(nx, ny)];
          if (!n || faceOf[idx(nx, ny)] !== -1) continue;
          if (n.district !== start.district || n.faceType !== start.faceType) continue;
          faceOf[idx(nx, ny)] = faces.length;
          queue.push(n);
        }
      }
      face.sort((a, b) => idx(a.gx, a.gy) - idx(b.gx, b.gy)); // stable scan order within the face
      // §B split: chunk faces longer than 10 tiles into standard faces of ≤10
      for (let i = 0; i < face.length; i += 10) faces.push(face.slice(i, i + 10));
    }
  }

  // ── Pass 3: per face, place the composition with rhythm discipline ──
  const out: StreetscapePlacement[] = [];
  const solidOccupied = new Set<number>(); // ≤1 solid prop per tile (a flush decal may coexist)
  const flushOccupied = new Set<number>(); // ≤1 flush decal per tile (no duplicate stacked decals)
  for (const face of faces) {
    const district = face[0].district;
    const caps = faceCaps(district, face.length);
    const comp = compositionFor(district);
    const budget: Record<AnchorType, number> = { ...caps };
    // §G fill governor: cap SOLID props on this face so quiet stretches survive the (high) district caps.
    const solidFillCap = Math.max(1, Math.ceil(face.length * FILL_FRACTION[face[0].faceType]));
    let solidsOnFace = 0;

    const isFlush = (familyId: PropFamilyId): boolean => FAMILIES[familyId].heightBand === 'flush';
    const tryPlace = (c: Candidate, role: AnchorType): boolean => {
      if (budget[role] <= 0) return false;
      const occ = solidOccupied.has(idx(c.gx, c.gy));
      const pick = pickFamilyZone(comp, role, c.zones, rng);
      if (!pick) return false;
      const flush = isFlush(pick.familyId);
      const tile = idx(c.gx, c.gy);
      if (!flush && occ) return false;                  // tile already holds a solid; only a flush decal may share
      if (!flush && solidsOnFace >= solidFillCap) return false; // §G: leave quiet stretches, never confetti
      if (flush && flushOccupied.has(tile)) return false; // never stack a duplicate decal on the same tile
      out.push(makePlacement(pick.familyId, pick.zone, c.gx, c.gy, district));
      if (flush) flushOccupied.add(tile);
      else { solidOccupied.add(tile); solidsOnFace += 1; }
      budget[role] -= 1;
      return true;
    };

    // ANCHOR — spaced evenly across the face (0-2; defines place identity)
    if (budget.anchor > 0) {
      const step = Math.max(1, Math.floor(face.length / (caps.anchor + 1)));
      for (let i = step; i < face.length && budget.anchor > 0; i += step) tryPlace(face[i], 'anchor');
    }
    // RHYTHM — cadenced (every ~2nd tile), leaving gaps; the repeating city beat
    for (let i = 0; i < face.length && budget.rhythm > 0; i += 2) tryPlace(face[i], 'rhythm');
    // FILLER — clustered (contiguous sub-runs), not evenly salted; a couple of pockets
    for (let i = 0; i < face.length && budget.filler > 0; i++) {
      // seed a cluster at a hash-stable position, then fill forward
      if (stableIndex(face[i].gx, face[i].gy, district, 'fill', 3) !== 0) continue;
      for (let j = i; j < face.length && budget.filler > 0; j++) if (!tryPlace(face[j], 'filler')) break;
    }
    // RARE — a memorable accent, seldom (≤ cap, low probability)
    for (let i = 0; i < face.length && budget.rare > 0; i++) if (rng.chance(0.15)) tryPlace(face[i], 'rare');
  }
  return out;
}

/** Convenience: build the archetype map from the layout and place in one call (the scene's entry point). */
export function placeStreetscapeForLayout(layout: WorldLayout, opts: PlaceOptions = {}): StreetscapePlacement[] {
  return placeStreetscape(layout, buildDistrictArchetypeMap(layout), opts);
}

/** Exposed for tests + the render layer: is this family a flush ground decal (may share a tile)? */
export function isFlushFamily(familyId: string): boolean {
  const f = familyById(familyId);
  return !!f && f.heightBand === 'flush';
}
