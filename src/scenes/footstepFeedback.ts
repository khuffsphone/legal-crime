import type { TileKind } from '../sim';

export type FootstepKey = 'sfx_step_pavement' | 'sfx_step_gravel';

/** Parks and unfinished ground read as loose grit; every paved city surface uses the hard step. */
export function footstepKeyForTile(kind: TileKind): FootstepKey {
  return kind === 'park' || kind === 'ground' ? 'sfx_step_gravel' : 'sfx_step_pavement';
}

export interface FootstepCadence {
  travelPx: number;
  emit: boolean;
}

/**
 * Convert actual screen-space travel into one footfall per half stride. The remainder is retained,
 * so frame rate changes cannot speed up the shoes and stopped units never emit time-driven steps.
 */
export function advanceFootstepCadence(travelPx: number, distancePx: number, stridePx: number): FootstepCadence {
  const spacing = Math.max(1, stridePx * 0.5);
  const total = Math.max(0, travelPx) + Math.max(0, distancePx);
  return { travelPx: total % spacing, emit: total >= spacing };
}
