// RTS-16 — the living city: district identity + the bigger contested map. Pure & deterministic;
// imports NO Phaser. District wealth/heat-sensitivity/archetype and adjacency drive the turf war
// — richer districts are worth more, heat-sensitive ones draw the law, and adjacency defines the
// fronts along which families push. Identity is DERIVED when absent, so the legacy 5-district map
// keeps working unchanged; createInitialState({ bigCity }) seeds a 9-district 3×3 city with
// explicit identities. See docs/VISUAL_DIRECTION.md for the noir naming.

import type { District, GameState } from './types';

export interface DistrictIdentity {
  wealth: number; // 1..5
  heatSensitivity: number; // 0..1
  archetype: string;
}

/** Chicago-flavoured archetypes for the 3×3 city, in district index order. */
export const CITY_ARCHETYPES: ReadonlyArray<{ name: string; archetype: string; wealth: number; heatSensitivity: number }> = [
  { name: 'Dockside', archetype: 'docks', wealth: 2, heatSensitivity: 0.4 },
  { name: 'Little Italy', archetype: 'oldtown', wealth: 3, heatSensitivity: 0.5 },
  { name: 'The Heights', archetype: 'heights', wealth: 5, heatSensitivity: 0.7 },
  { name: 'Riverside', archetype: 'riverside', wealth: 2, heatSensitivity: 0.3 },
  { name: 'The Loop', archetype: 'downtown', wealth: 5, heatSensitivity: 0.9 },
  { name: 'The Stockyards', archetype: 'stockyards', wealth: 3, heatSensitivity: 0.4 },
  { name: 'South Side', archetype: 'southside', wealth: 4, heatSensitivity: 0.6 },
  { name: 'The Levee', archetype: 'levee', wealth: 4, heatSensitivity: 0.8 },
  { name: 'Uptown', archetype: 'uptown', wealth: 3, heatSensitivity: 0.5 },
];

/** Orthogonal adjacency on a 3×3 grid (district index → neighbour indices). */
export const GRID3_NEIGHBORS: ReadonlyArray<number[]> = [
  [1, 3], [0, 2, 4], [1, 5],
  [0, 4, 6], [1, 3, 5, 7], [2, 4, 8],
  [3, 7], [4, 6, 8], [5, 7],
];

/** Identity for a district: its explicit fields, or values derived deterministically from its
 * index (so the legacy 5-district map has sensible identity without storing it). */
export function districtIdentity(d: District, index: number): DistrictIdentity {
  const proto = CITY_ARCHETYPES[index % CITY_ARCHETYPES.length];
  return {
    wealth: d.wealth ?? proto.wealth,
    heatSensitivity: d.heatSensitivity ?? proto.heatSensitivity,
    archetype: d.archetype ?? proto.archetype,
  };
}

/** Neighbours of a district by id: explicit `neighbors`, else empty (legacy map has none). */
export function districtNeighbors(state: GameState, districtId: string): District[] {
  const d = state.districts.find((x) => x.id === districtId);
  if (!d || !d.neighbors) return [];
  return d.neighbors
    .map((id) => state.districts.find((x) => x.id === id))
    .filter((x): x is District => x !== undefined);
}

/** A wealth-scaled value multiplier for a district (richer = worth more in the standings). */
export function districtValue(d: District, index: number): number {
  return districtIdentity(d, index).wealth;
}

/** Whether the world is the big 9-district contested city (vs the legacy 5). */
export function isBigCity(state: GameState): boolean {
  return state.districts.length >= 9;
}
