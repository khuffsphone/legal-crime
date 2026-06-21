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
  /** The pusher TOOK the block — became its holder, seizing the loser's rackets (full takeover). */
  captured: boolean;
  /** The pusher knocked the prior holder off the block but did NOT take it (RTS-19) — a softening
   * blow that breaks the loser's protection + scatters their takings WITHOUT transferring rackets. */
  disrupted: boolean;
}

/** Options for a push (RTS-19). */
export interface PushOptions {
  /**
   * Whether merely DISPLACING a prior holder (knocking them below the hold threshold, even to
   * neutral) seizes their rackets. Default TRUE — the strategy/rival model: muscling a holder off
   * their block grabs the spoils. A RAID passes FALSE: it only SEIZES if the pusher actually
   * becomes the new holder; a mere displacement DISRUPTS (breaks fronts + scatters takings) but
   * leaves ownership, so flipping turf by force is a sustained campaign, not a one-press win.
   */
  seizeOnDisplace?: boolean;
}

/**
 * Push `familyId`'s presence into a district: raise their control by `amount` (capped), then
 * erode the strongest rival there — but their GUARDING MUSCLE blunts the erosion (defense
 * matters). If the push displaces a prior holder, resolve a SEIZE (full takeover) or a DISRUPT
 * (softening blow) per `opts.seizeOnDisplace`. Pure.
 */
export function pushPresence(
  state: GameState,
  familyId: string,
  districtId: string,
  amount: number,
  opts?: PushOptions,
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
  const becameHolder = after === familyId && before !== familyId; // a genuine TAKEOVER this push
  const displaced = before !== null && before !== familyId && after !== before; // a holder knocked off
  const seizeOnDisplace = opts?.seizeOnDisplace !== false;

  let captured = false;
  let disrupted = false;
  if (becameHolder) {
    // A real takeover: you hold the block now, so its rackets are yours (whoever owned them).
    applyCapture(state, district, familyId, before);
    captured = true;
  } else if (displaced) {
    if (seizeOnDisplace) {
      // Strategy/rival model: muscling a holder below the threshold grabs the spoils outright.
      applyCapture(state, district, familyId, before);
      captured = true;
    } else {
      // RTS-19 raid model: a softening blow — break their protection + scatter takings, but the
      // rackets stay theirs until you actually take and hold the block.
      applyDisruption(state, district, before!);
      disrupted = true;
    }
  }
  return { districtId, before, after, captured, disrupted };
}

/**
 * Resolve a capture: the captor seizes the rackets of EVERY other family in the district and
 * breaks their extortion there (lost protection income). `oldHolder` (the displaced holder, if
 * any) is recorded for flavour. Logged. Pure (mutates state).
 */
export function applyCapture(state: GameState, district: District, newHolder: string, oldHolder: string | null): void {
  let seizedOps = 0;
  let brokenFronts = 0;
  for (const b of district.businesses) {
    if (b.kind === 'front' && b.extortedBy !== undefined && b.extortedBy !== newHolder) {
      b.extortedBy = undefined; // protection racket broken
      brokenFronts++;
    } else if (b.kind !== 'front' && b.ownerFamily !== undefined && b.ownerFamily !== newHolder) {
      b.ownerFamily = newHolder; // the racket changes hands
      b.uncollected = 0; // takings scatter in the takeover
      seizedOps++;
    }
  }
  state.log.push({
    tick: state.tick,
    kind: 'district-captured',
    message: `${newHolder} seized ${district.name}${oldHolder ? ` from ${oldHolder}` : ''} (${seizedOps} rackets taken, ${brokenFronts} fronts broken)`,
    data: { districtId: district.id, newHolder, oldHolder, seizedOps, brokenFronts },
  });
}

/**
 * Resolve a DISRUPTION (RTS-19): the prior holder was knocked off the block but the attacker did
 * NOT take it. Their protection rackets are broken and their pending takings here scatter — a real
 * economic blow — but ownership does NOT change hands (you have to actually hold a block to own its
 * rackets). Logged. Pure (mutates state).
 */
export function applyDisruption(state: GameState, district: District, oldHolder: string): void {
  let brokenFronts = 0;
  let hitOps = 0;
  for (const b of district.businesses) {
    if (b.kind === 'front' && b.extortedBy === oldHolder) {
      b.extortedBy = undefined; // protection broken
      brokenFronts++;
    } else if (b.kind !== 'front' && b.ownerFamily === oldHolder && (b.uncollected ?? 0) > 0) {
      b.uncollected = 0; // takings scattered, but the racket is not seized
      hitOps++;
    }
  }
  state.log.push({
    tick: state.tick,
    kind: 'district-disrupted',
    message: `${oldHolder} was knocked off ${district.name} (${brokenFronts} fronts broken, ${hitOps} rackets disrupted)`,
    data: { districtId: district.id, oldHolder, brokenFronts, hitOps },
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
