// RTS-16 — territorial control & conflict. Pure & deterministic; imports NO Phaser. Taking and
// holding turf is a real decision: a family pushes PRESENCE into a district (raising control,
// eroding the defender — blunted by guarding muscle), and when control flips the holder, the
// CAPTURE bites: the loser's fronts in that district are disrupted (extortion broken) and its
// rackets are SEIZED by the captor. This is where limited crew becomes the logistics puzzle —
// you cannot guard everywhere, so an undefended district can be taken from you.

import { CONTROL_MAX, CONTEST_REDUCTION } from './constants';
import { muscleInDistrict } from './commands';
import { controlOf, districtHolder, topRivalControl } from './territory';
import { allBusinesses } from './economy';
import { findFamily, type District, type GameState } from './types';

export type DistrictStatus = 'neutral' | 'held' | 'contested';

/** Coarse status of a district: who, if anyone, holds it (a strict, threshold-clearing leader). */
export function districtStatus(d: District): { status: DistrictStatus; holderId: string | null } {
  const holder = districtHolder(d) ?? null;
  if (holder) return { status: 'held', holderId: holder };
  // contested if two families both have a real foothold; else neutral.
  const real = Object.values(d.control).filter((v) => v >= 10).length;
  return { status: real >= 2 ? 'contested' : 'neutral', holderId: null };
}

export interface PushResult {
  districtId: string;
  before: string | null;
  after: string | null;
  captured: boolean;
}

/**
 * Push `familyId`'s presence into a district: raise their control by `amount` (capped), then
 * erode the strongest rival there — but their GUARDING MUSCLE blunts the erosion (defense
 * matters). If control flips the holder away from a prior holder, resolve the capture. Pure.
 */
export function pushPresence(
  state: GameState,
  familyId: string,
  districtId: string,
  amount: number,
): PushResult | null {
  const district = state.districts.find((d) => d.id === districtId);
  if (!district || amount <= 0) return null;

  const before = districtHolder(district) ?? null;
  district.control[familyId] = Math.min(CONTROL_MAX, controlOf(district, familyId) + amount);

  const rival = topRivalControl(district, familyId);
  if (rival) {
    const rivalFam = findFamily(state, rival.id);
    const guard = rivalFam ? muscleInDistrict(rivalFam, districtId) : 0;
    const erosion = Math.max(0, Math.floor(amount * CONTEST_REDUCTION) - guard);
    if (erosion > 0) district.control[rival.id] = Math.max(0, rival.control - erosion);
  }

  const after = districtHolder(district) ?? null;
  // A capture fires when the pusher DISPLACES a prior holder — even to neutral. Muscling in and
  // grabbing the rackets is the painful moment; you don't have to fully hold it yet.
  const captured = before !== null && before !== familyId && after !== before;
  if (captured) applyCapture(state, district, familyId, before);
  return { districtId, before, after, captured };
}

/**
 * Resolve a capture: the captor seizes the loser's rackets in the district and breaks the
 * loser's extortion there (lost protection income). Logged. Pure (mutates state).
 */
export function applyCapture(state: GameState, district: District, newHolder: string, oldHolder: string): void {
  let seizedOps = 0;
  let brokenFronts = 0;
  for (const b of district.businesses) {
    if (b.kind === 'front' && b.extortedBy === oldHolder) {
      b.extortedBy = undefined; // protection racket broken
      brokenFronts++;
    } else if (b.kind !== 'front' && b.ownerFamily === oldHolder) {
      b.ownerFamily = newHolder; // the racket changes hands
      b.uncollected = 0; // takings scatter in the takeover
      seizedOps++;
    }
  }
  state.log.push({
    tick: state.tick,
    kind: 'district-captured',
    message: `${newHolder} seized ${district.name} from ${oldHolder} (${seizedOps} rackets taken, ${brokenFronts} fronts broken)`,
    data: { districtId: district.id, newHolder, oldHolder, seizedOps, brokenFronts },
  });
}

/** Districts a family currently holds (strict threshold-clearing leader). */
export function districtsHeld(state: GameState, familyId: string): District[] {
  return state.districts.filter((d) => districtHolder(d) === familyId);
}

/** Player-held districts where the player has NO guarding muscle — the exposed flank a rival can
 * take. The logistics read: where you're overextended. */
export function exposedDistricts(state: GameState, familyId: string): District[] {
  const fam = findFamily(state, familyId);
  if (!fam) return [];
  return districtsHeld(state, familyId).filter((d) => muscleInDistrict(fam, d.id) === 0);
}

/** Total per-week front+racket income a family currently earns from a district (for capture
 * stakes / standings). */
export function districtIncomeFor(state: GameState, familyId: string, districtId: string): number {
  let total = 0;
  for (const b of allBusinesses(state)) {
    if (b.districtId !== districtId) continue;
    if (b.kind === 'front' && b.extortedBy === familyId) total += Math.floor(b.baseIncome * 0.3);
    else if (b.kind !== 'front' && b.ownerFamily === familyId) total += b.baseIncome;
  }
  return total;
}
