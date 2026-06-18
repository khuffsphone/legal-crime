// Territory / control helpers. Pure & deterministic — no RNG, no Phaser.

import { CONTROL_HOLD } from './constants';
import type { District, GameState } from './types';

/** A family's control points in a district (0 if absent). */
export function controlOf(district: District, familyId: string): number {
  return district.control[familyId] ?? 0;
}

/**
 * The family that holds a district: the unique family whose control is the strict maximum
 * and is at least CONTROL_HOLD. Returns undefined if nobody clears the threshold or if the
 * top control is tied between families (contested).
 */
export function districtHolder(district: District): string | undefined {
  let topId: string | undefined;
  let topVal = -1;
  let tied = false;
  for (const [familyId, val] of Object.entries(district.control)) {
    if (val > topVal) {
      topVal = val;
      topId = familyId;
      tied = false;
    } else if (val === topVal) {
      tied = true;
    }
  }
  if (topId === undefined || tied) return undefined;
  return topVal >= CONTROL_HOLD ? topId : undefined;
}

/** Whether a family holds a district. */
export function holdsDistrict(district: District, familyId: string): boolean {
  return districtHolder(district) === familyId;
}

/** Districts currently held by a family. */
export function districtsHeldBy(state: GameState, familyId: string): District[] {
  return state.districts.filter((d) => holdsDistrict(d, familyId));
}

/** Count of districts held by a family. */
export function districtsHeldCount(state: GameState, familyId: string): number {
  return districtsHeldBy(state, familyId).length;
}

/**
 * The strongest rival (any family id other than `familyId`) in a district, with its
 * control. Returns undefined if no other family has control here.
 */
export function topRivalControl(
  district: District,
  familyId: string,
): { id: string; control: number } | undefined {
  let best: { id: string; control: number } | undefined;
  for (const [id, control] of Object.entries(district.control)) {
    if (id === familyId) continue;
    if (control <= 0) continue;
    if (!best || control > best.control) best = { id, control };
  }
  return best;
}
