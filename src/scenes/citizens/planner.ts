// Citizen Life P0 (T2 + T8) — the PURE deterministic spawn/composition planner. Phaser-free. Turns
// (layout, cityGraph sidewalk nodes, seed, district) into (a) a stable per-node spawn-weight field driven by
// the ART-DistrictArchetype density table + local tile heuristics, and (b) a deterministic role pick per
// citizen slot. NO Math.random / Date.now — every choice is a pure function of stable integer inputs
// (spec §4.7), so the same seed reproduces the same city (spec §11.5 determinism acceptance).
//
// LAYOUT-DERIVED DATA (spec §13.1 generateWorld trap): the district→archetype map + node weights are computed
// from the CURRENT layout at layer creation and thrown away on world regeneration — never a long-lived cache.

import { mulberry32, districtOfWorldTile, tileKindAt, type WorldLayout } from '../../sim';
import { districtIdentityFor, type DistrictArchetype } from '../art/districtIdentity';
import {
  CITIZEN_ROLES, DISTRICT_COMPOSITION, DISTRICT_DENSITY,
  DENSITY_CLAMP_MIN, DENSITY_CLAMP_MAX,
  type CitizenRole, type Composition,
} from './roles';

// ── deterministic stream helpers ────────────────────────────────────────────────────────────────

/** Independent deterministic sub-streams per decision, so a citizen's role, speed, timing and node picks
 * never correlate (each salt is a distinct constant). */
export const enum RollSalt {
  Role = 0x9e37,
  Speed = 0x85eb,
  Timing = 0xc2b2,
  Node = 0x27d4,
  React = 0x165b,
}

/** FNV-1a-style mix of unsigned ints → uint32. Pure + stable. The determinism spine: role/speed/timing are
 * all seeded from this so the SAME (seed, district, slot, epoch, salt) always yields the same value. */
export function mix32(...nums: number[]): number {
  let h = 2166136261 >>> 0;
  for (const n of nums) {
    let x = (n | 0) >>> 0;
    for (let b = 0; b < 4; b++) {
      h ^= x & 0xff;
      h = Math.imul(h, 16777619) >>> 0;
      x >>>= 8;
    }
  }
  return h >>> 0;
}

/** A deterministic [0,1) roll for a citizen decision. NEVER uses wall-clock/global RNG (spec §4.7 / §13). */
export function citizenRoll(seed: number, districtOrdinal: number, slot: number, epoch: number, salt: RollSalt): number {
  return mulberry32(mix32(seed >>> 0, districtOrdinal, slot, epoch, salt)).value;
}

// ── role selection (composition CDF) ─────────────────────────────────────────────────────────────

/** Pick a citizen role from a district composition by a [0,1) roll, walking the STABLE CITIZEN_ROLES order
 * as a cumulative distribution (spec §5.2). Deterministic; a missing/zero-weight role is skipped. Pure. */
export function pickRole(archetype: DistrictArchetype, roll01: number): CitizenRole {
  const comp: Composition = DISTRICT_COMPOSITION[archetype];
  const target = (roll01 < 0 ? 0 : roll01 >= 1 ? 0.999999 : roll01) * 100;
  let acc = 0;
  let last: CitizenRole | null = null;
  for (const role of CITIZEN_ROLES) {
    const w = comp[role] ?? 0;
    if (w <= 0) continue;
    last = role;
    acc += w;
    if (target < acc) return role;
  }
  // rounding fallback: the final non-zero role (sums are 100, so this is only hit at target≈100).
  return last ?? 'worker';
}

/** The deterministic role for a specific citizen slot in a district (spec §4.7). Pure. */
export function roleForSlot(seed: number, districtOrdinal: number, slot: number, epoch: number, archetype: DistrictArchetype): CitizenRole {
  return pickRole(archetype, citizenRoll(seed, districtOrdinal, slot, epoch, RollSalt.Role));
}

// ── district → ART archetype resolution (ordinal-keyed, per recon §11 flag 1) ────────────────────

/** Map every district id in the layout to its ART DistrictArchetype via ORDINAL (index in layout.districts),
 * exactly as the scene assigns identity (districtIdentityFor(index)). Built once from the current layout —
 * rebuild on world regeneration, never cache across epochs (spec §13.1). Pure. */
export function buildDistrictArchetypeMap(layout: WorldLayout): Map<string, DistrictArchetype> {
  const m = new Map<string, DistrictArchetype>();
  layout.districts.forEach((d, i) => m.set(d.id, districtIdentityFor(i).archetype));
  return m;
}

/** The ART archetype covering a tile, or null off-map / on an unpartitioned tile. Pure. */
export function archetypeAtTile(
  layout: WorldLayout, archMap: Map<string, DistrictArchetype>, gx: number, gy: number,
): DistrictArchetype | null {
  const id = districtOfWorldTile(layout, gx, gy);
  if (!id) return null;
  return archMap.get(id) ?? null;
}

// ── density weighting (spec §4.6) ────────────────────────────────────────────────────────────────

/** Local placement modifiers that nudge a node's spawn weight (spec §4.6 optional modifiers). All additive. */
export interface LocalDensityMods {
  storefrontFrontage?: boolean;  // +0.15 market-like frontage
  plazaPark?: boolean;           // +0.10
  highFrontage?: boolean;        // +0.10 business-dense
  industrialApron?: boolean;     // -0.15 unless the role is a worker kind
  sparseEdge?: boolean;          // -0.20 park/road-edge-only
}

/** A node's final spawn weight: district base density + additive local modifiers, clamped to [0.45, 1.50]
 * BEFORE normalisation (spec §4.6). Pure. The clamp is load-bearing — removing it fails the T8 mutation test. */
export function densityWeight(archetype: DistrictArchetype, mods: LocalDensityMods = {}): number {
  let w = DISTRICT_DENSITY[archetype];
  if (mods.storefrontFrontage) w += 0.15;
  if (mods.plazaPark) w += 0.10;
  if (mods.highFrontage) w += 0.10;
  if (mods.industrialApron) w -= 0.15;
  if (mods.sparseEdge) w -= 0.20;
  return w < DENSITY_CLAMP_MIN ? DENSITY_CLAMP_MIN : w > DENSITY_CLAMP_MAX ? DENSITY_CLAMP_MAX : w;
}

/** Derive the local density modifiers for a sidewalk tile from cheap worldgen tile heuristics (no PR#62
 * streetscape zones on this branch — recon §11 flag 7). A sidewalk fronting a building reads as frontage;
 * next to park/plaza reads as plaza-park; an isolated sidewalk (few sidewalk neighbours) reads sparse. Pure. */
export function localModsForTile(layout: WorldLayout, gx: number, gy: number): LocalDensityMods {
  const near = (k: string): boolean =>
    tileKindAt(layout, gx + 1, gy) === k || tileKindAt(layout, gx - 1, gy) === k ||
    tileKindAt(layout, gx, gy + 1) === k || tileKindAt(layout, gx, gy - 1) === k;
  const mods: LocalDensityMods = {};
  if (near('building')) mods.storefrontFrontage = true;
  if (near('park') || near('plaza')) mods.plazaPark = true;
  return mods;
}

/** Per-node spawn weights over the sidewalk node list — the district-aware density field AmbientLife samples
 * to place citizens (spec §4.6). Layout-derived; recompute on regen (spec §13.1). Pure + deterministic. */
export function spawnWeightsForNodes(
  layout: WorldLayout, archMap: Map<string, DistrictArchetype>, sidewalkNodes: readonly number[],
): Float64Array {
  const size = layout.size;
  const out = new Float64Array(sidewalkNodes.length);
  for (let i = 0; i < sidewalkNodes.length; i++) {
    const ti = sidewalkNodes[i];
    const gx = ti % size, gy = (ti / size) | 0;
    const arch = archetypeAtTile(layout, archMap, gx, gy);
    out[i] = arch ? densityWeight(arch, localModsForTile(layout, gx, gy)) : DENSITY_CLAMP_MIN;
  }
  return out;
}

/** A prefix-sum (cumulative) array of weights, for O(log n) weighted sampling. Pure. */
export function cumulative(weights: Float64Array): Float64Array {
  const out = new Float64Array(weights.length);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) { acc += weights[i]; out[i] = acc; }
  return out;
}

/** Pick an index into a cumulative-weight array by a [0,1) roll (weighted). Returns -1 for an empty/zero
 * field. Deterministic binary search. Pure. */
export function weightedIndex(cum: Float64Array, roll01: number): number {
  const n = cum.length;
  if (n === 0) return -1;
  const total = cum[n - 1];
  if (total <= 0) return -1;
  const target = (roll01 < 0 ? 0 : roll01 >= 1 ? 0.999999 : roll01) * total;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= target) lo = mid + 1; else hi = mid;
  }
  return lo;
}
