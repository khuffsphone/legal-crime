// RTS-30a — SPARSE WORLD generator. Pure & deterministic; imports NO Phaser. Produces a much larger,
// sparse iso city laid out as the world-spec asks: wide avenues + streets as negative space, building
// footprints on parcels with a ≥1-tile setback + a MIN 1 empty tile between footprints, parks +
// plazas (with a fountain) as breathing room, and a DISTRICT PARTITION (every tile belongs to exactly
// one district). It supersedes buildMapLayout for the scene but is MapLayout-compatible (cols/rows/
// hqTiles/businessTiles), so the existing pure collector/route/movement code consumes it unchanged.
//
// Pacing intent: businesses sit far apart across avenues + setbacks, so a thug walks visible seconds
// between them at the stroll speed — distance IS the throttle (no control-spend gate any more).

import { Rng } from './rng';
import type { GridPos } from './iso';
import type { GameState } from './types';
import type { MapLayout } from './mapEconomy';

export type TileKind = 'ground' | 'avenue' | 'street' | 'sidewalk' | 'park' | 'plaza' | 'building';

export interface WorldDistrict {
  id: string;
  name: string;
  /** Inclusive region bounds on the tile grid. */
  minX: number; minY: number; maxX: number; maxY: number;
  centroid: GridPos;
  plaza: GridPos;   // the fountain / nameplate pin
  park: GridPos;    // park centre
  businessIds: string[];
}

export interface WorldLayout extends MapLayout {
  size: number;                       // square map edge in tiles
  tiles: TileKind[];                  // row-major size×size classification
  districtOfTile: string[];          // districtId per tile (a complete partition)
  districts: WorldDistrict[];
}

export interface WorldGenOptions { size?: number; }

const idx = (size: number, gx: number, gy: number): number => gy * size + gx;
const inb = (size: number, gx: number, gy: number): boolean => gx >= 0 && gy >= 0 && gx < size && gy < size;

/** Generate the sparse world for `state`'s districts. Deterministic from state.seed. */
export function generateWorld(state: GameState, opts: WorldGenOptions = {}): WorldLayout {
  const size = Math.max(48, opts.size ?? 64);
  const prng = new Rng((state.seed ^ 0x30a) >>> 0);
  const rng = (): number => prng.nextFloat();
  const tiles: TileKind[] = new Array(size * size).fill('ground');
  const districtOfTile: string[] = new Array(size * size).fill('');
  const businessTiles: Record<string, GridPos> = {};
  const hqTiles: Record<string, GridPos> = {};

  // ── arrange the sim's districts into a region grid that PARTITIONS the map ──
  const dists = state.districts;
  const cols = Math.ceil(Math.sqrt(dists.length));
  const rowsN = Math.ceil(dists.length / cols);
  const regW = Math.floor(size / cols);
  const regH = Math.floor(size / rowsN);
  const worldDistricts: WorldDistrict[] = [];

  dists.forEach((d, i) => {
    const cx = i % cols, cy = Math.floor(i / cols);
    const minX = cx * regW;
    const minY = cy * regH;
    const maxX = (cx === cols - 1 ? size : minX + regW) - 1;
    const maxY = (cy === rowsN - 1 ? size : minY + regH) - 1;
    // every tile of the region belongs to this district (the partition)
    for (let gx = minX; gx <= maxX; gx++) for (let gy = minY; gy <= maxY; gy++) districtOfTile[idx(size, gx, gy)] = d.id;

    // AVENUES (4-wide) frame the district; a STREET seam runs through the middle (the block grid).
    paintBand(tiles, size, minX, minY, maxX, maxY, 'edge', 'avenue', 4);
    const midX = Math.round((minX + maxX) / 2);
    for (let gy = minY; gy <= maxY; gy++) for (let w = -1; w <= 1; w++) setIf(tiles, size, midX + w, gy, 'street');
    const midY = Math.round((minY + maxY) / 2);
    for (let gx = minX; gx <= maxX; gx++) for (let w = -1; w <= 1; w++) setIf(tiles, size, gx, midY + w, 'street');

    // PARK (4×4) in a quiet corner + PLAZA (3×3, with a fountain at centre) near the heart.
    const park = { gx: clamp(minX + 3, minX + 2, maxX - 4), gy: clamp(minY + 3, minY + 2, maxY - 4) };
    stamp(tiles, size, park.gx, park.gy, 4, 4, 'park');
    const plaza = { gx: clamp(midX, minX + 2, maxX - 2), gy: clamp(Math.round(minY + (maxY - minY) * 0.66), minY + 2, maxY - 3) };
    stamp(tiles, size, plaza.gx - 1, plaza.gy - 1, 3, 3, 'plaza');

    // BUSINESS PARCELS — placed sparsely with a ≥1-tile setback + the min-gap rule (no two footprints
    // adjacent). Buildings shoulder onto the interior, off the avenues/park/plaza.
    const placed: GridPos[] = [];
    for (const b of d.businesses) {
      const spot = findParcel(tiles, size, minX, minY, maxX, maxY, placed, rng);
      if (spot) {
        tiles[idx(size, spot.gx, spot.gy)] = 'building';
        businessTiles[b.id] = spot;
        placed.push(spot);
      } else {
        // fallback: park-edge tile (rare on a tight region) so every business still has a tile
        businessTiles[b.id] = { gx: clamp(park.gx + placed.length, minX + 1, maxX - 1), gy: clamp(park.gy + 5, minY + 1, maxY - 1) };
      }
    }

    worldDistricts.push({
      id: d.id, name: d.name, minX, minY, maxX, maxY,
      centroid: { gx: Math.round((minX + maxX) / 2), gy: Math.round((minY + maxY) / 2) },
      plaza, park, businessIds: d.businesses.map((b) => b.id),
    });
  });

  // HQs: each family's seat near its home district's plaza (player = district 0).
  const families = [state.player, ...state.rivals];
  families.forEach((f, i) => {
    const home = worldDistricts[i % worldDistricts.length];
    const t = { gx: clamp(home.plaza.gx + 2, home.minX + 1, home.maxX - 1), gy: clamp(home.plaza.gy - 3, home.minY + 1, home.maxY - 1) };
    hqTiles[f.id] = t;
    if (inb(size, t.gx, t.gy)) tiles[idx(size, t.gx, t.gy)] = 'building';
  });

  return { size, cols: size, rows: size, tiles, districtOfTile, districts: worldDistricts, hqTiles, businessTiles };
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
function setIf(tiles: TileKind[], size: number, gx: number, gy: number, k: TileKind): void {
  if (inb(size, gx, gy)) tiles[idx(size, gx, gy)] = k;
}
function stamp(tiles: TileKind[], size: number, x0: number, y0: number, w: number, h: number, k: TileKind): void {
  for (let gx = x0; gx < x0 + w; gx++) for (let gy = y0; gy < y0 + h; gy++) setIf(tiles, size, gx, gy, k);
}
function paintBand(tiles: TileKind[], size: number, minX: number, minY: number, maxX: number, maxY: number, _mode: 'edge', k: TileKind, width: number): void {
  for (let gx = minX; gx <= maxX; gx++) for (let w = 0; w < width; w++) { setIf(tiles, size, gx, minY + w, k); setIf(tiles, size, gx, maxY - w, k); }
  for (let gy = minY; gy <= maxY; gy++) for (let w = 0; w < width; w++) { setIf(tiles, size, minX + w, gy, k); setIf(tiles, size, maxX - w, gy, k); }
}

/** Find a sparse building parcel inside a district region: an open 'ground' tile with a ≥1-tile
 * setback (no building in the 8-neighbourhood) and the min-gap from already-placed footprints. */
function findParcel(
  tiles: TileKind[], size: number, minX: number, minY: number, maxX: number, maxY: number,
  placed: GridPos[], rng: () => number,
): GridPos | null {
  for (let attempt = 0; attempt < 80; attempt++) {
    const gx = minX + 2 + Math.floor(rng() * Math.max(1, maxX - minX - 3));
    const gy = minY + 2 + Math.floor(rng() * Math.max(1, maxY - minY - 3));
    if (!inb(size, gx, gy) || tiles[idx(size, gx, gy)] !== 'ground') continue;
    // min-gap: no building in the 8-neighbourhood (a clear setback on all sides)
    let ok = true;
    for (let dx = -1; dx <= 1 && ok; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (inb(size, gx + dx, gy + dy) && tiles[idx(size, gx + dx, gy + dy)] === 'building') { ok = false; break; }
    }
    if (!ok) continue;
    if (placed.some((p) => Math.abs(p.gx - gx) <= 1 && Math.abs(p.gy - gy) <= 1)) continue;
    return { gx, gy };
  }
  return null;
}

/** The district id covering a tile (the partition lookup). */
export function districtOfTile(layout: WorldLayout, gx: number, gy: number): string | undefined {
  const g = Math.round(gx), y = Math.round(gy);
  if (!inb(layout.size, g, y)) return undefined;
  return layout.districtOfTile[y * layout.size + g] || undefined;
}

/** The tile kind at (gx,gy) — 'ground' off-map. */
export function tileKindAt(layout: WorldLayout, gx: number, gy: number): TileKind {
  const g = Math.round(gx), y = Math.round(gy);
  if (!inb(layout.size, g, y)) return 'ground';
  return layout.tiles[y * layout.size + g];
}

/** Fraction of a district's tiles that are OPEN (not building) — the sparseness read (≥ ~0.9 here). */
export function openFraction(layout: WorldLayout, districtId: string): number {
  let total = 0, open = 0;
  const d = layout.districts.find((x) => x.id === districtId);
  if (!d) return 1;
  for (let gx = d.minX; gx <= d.maxX; gx++) for (let gy = d.minY; gy <= d.maxY; gy++) {
    total++;
    if (layout.tiles[gy * layout.size + gx] !== 'building') open++;
  }
  return total > 0 ? open / total : 1;
}
