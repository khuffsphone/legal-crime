import type { TileKind } from '../sim';

export type FootstepKey = 'sfx_step_pavement' | 'sfx_step_gravel';

/** Ground-distance spacing: an unhurried shoe cadence, not a rapid mechanical click-track. */
export const WALK_FOOTFALL_TILES = 0.6;
export const RUN_FOOTFALL_TILES = 0.84;

/** Parks and unfinished ground read as loose grit; every paved city surface uses the hard step. */
export function footstepKeyForTile(kind: TileKind): FootstepKey {
  return kind === 'park' || kind === 'ground' ? 'sfx_step_gravel' : 'sfx_step_pavement';
}

export interface FootstepCadence {
  travelTiles: number;
  emit: boolean;
}

/**
 * Convert actual GRID travel into governed footfalls. Grid distance keeps equal travel equally audible
 * in every isometric direction; the remainder keeps cadence frame-rate independent and stopped units silent.
 */
export function advanceFootstepCadence(travelTiles: number, distanceTiles: number, spacingTiles: number): FootstepCadence {
  const spacing = Math.max(0.01, spacingTiles);
  const total = Math.max(0, travelTiles) + Math.max(0, distanceTiles);
  return { travelTiles: total % spacing, emit: total >= spacing };
}

const STEP_RATES = [0.9, 0.98, 0.94, 1.01] as const;
const STEP_GAINS = [0.86, 0.94, 0.9, 0.92] as const;

/** Deterministic heel/toe variation without RNG or immediate repetition of the exact same playback. */
export function footstepPlayback(stepIndex: number, unitSeed = 0): { rate: number; gain: number } {
  const i = Math.abs(Math.trunc(stepIndex + unitSeed)) % STEP_RATES.length;
  return { rate: STEP_RATES[i], gain: STEP_GAINS[i] };
}
