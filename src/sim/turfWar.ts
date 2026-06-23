// RTS-30c-1 — TURF WAR CORE. Pure & deterministic; imports NO Phaser. The mid/late-game depth: a rival
// whose dormancy has lifted (~wk3) CONTESTS a border district (one adjacent to both its holdings and
// yours), pressing muscle in. The contest is PRESENCE-BASED and READABLE — control shifts by how much
// muscle each side has IN the district over time, not a hidden dice roll: net (rival − player) muscle
// moves a pressure meter; crossing +CONTEST_FLIP flips one of your businesses to the invader (eroding
// your hold %), crossing −CONTEST_PUSHOUT repels them (you held, and claw a block back). The hold % the
// roster shows is the inspectable truth. This module is the bookkeeping + resolution; the scene spawns/
// steers the visible rival muscle and feeds back the per-district presence counts.
//
// CANON: control = DISTRICT STATUS; war happens at the BORDERS of held districts; interception is the
// re-timed pillar — a collector routing through a CONTESTED district becomes robbable (this switches it
// on per-district; uncontested districts stay safe).

import {
  CONTEST_ESCALATE_WEEKS, CONTEST_FLIP, CONTEST_MAX, CONTEST_PRESSURE_MAX, CONTEST_PRESSURE_STEP,
  CONTEST_PUSHOUT,
} from './constants';
import { businessEarner } from './economy';
import { districtNeighbors } from './city';
import { controlOf } from './territory';
import { rivalsDormant } from './strategy';
import type { Contest, District, GameState } from './types';

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }

/** Fraction (0..1) of a district's businesses currently earned by `familyId`. */
export function familyShare(d: District, familyId: string): number {
  const total = d.businesses.length;
  if (total === 0) return 0;
  return d.businesses.filter((b) => businessEarner(b) === familyId).length / total;
}

/** The living rival with the strongest foothold in district `d`, else null. A "foothold" is either
 * territorial PRESENCE (legacy control points — how rivals expand) OR an earned business there, so the
 * war triggers as a rival pushes toward you even before it has captured a racket. */
function rivalFootholdIn(state: GameState, d: District): string | null {
  let best: string | null = null;
  let bestVal = 0;
  for (const r of state.rivals) {
    if (!r.alive) continue;
    const val = Math.max(controlOf(d, r.id), familyShare(d, r.id) * 100);
    if (val > 0 && val > bestVal) { bestVal = val; best = r.id; }
  }
  return best;
}

/** Border districts a rival could contest: a district the PLAYER has a stake in that is adjacent to a
 * district a rival holds a foothold in (war at the borders). Deterministic: most player-held first,
 * tie-break by district id. Returns {districtId, invaderId}. Pure. */
export function borderContestTargets(state: GameState): { districtId: string; invaderId: string }[] {
  const out: { districtId: string; invaderId: string; share: number }[] = [];
  for (const d of state.districts) {
    const myShare = familyShare(d, state.player.id);
    if (myShare <= 0) continue; // nothing of yours to contest here
    let invader: string | null = null;
    for (const n of districtNeighbors(state, d.id)) {
      const r = rivalFootholdIn(state, n);
      if (r) { invader = r; break; }
    }
    if (invader) out.push({ districtId: d.id, invaderId: invader, share: myShare });
  }
  out.sort((a, b) => (b.share - a.share) || (a.districtId < b.districtId ? -1 : 1));
  return out.map(({ districtId, invaderId }) => ({ districtId, invaderId }));
}

/** How many contests should be running now — gradual escalation: 1 once the rivals wake, +1 every
 * CONTEST_ESCALATE_WEEKS, capped at CONTEST_MAX. Zero while dormant. Pure. */
export function desiredContestCount(state: GameState): number {
  if (rivalsDormant(state)) return 0;
  const weeksAwake = state.tick - (state.rivalWakeWeek ?? 0);
  return Math.max(1, Math.min(CONTEST_MAX, 1 + Math.floor(Math.max(0, weeksAwake) / CONTEST_ESCALATE_WEEKS)));
}

/** Open new contests up to the desired count on the juiciest un-contested borders. Bookkeeping only
 * (pressure 0, no muscle yet — the scene spawns the visible units for each returned contest). Pure. */
export function activateContests(state: GameState): Contest[] {
  if (!state.contests) state.contests = [];
  const active = state.contests;
  const desired = desiredContestCount(state);
  if (active.length >= desired) return [];
  const created: Contest[] = [];
  for (const t of borderContestTargets(state)) {
    if (active.length >= desired) break;
    if (active.some((c) => c.districtId === t.districtId)) continue;
    const c: Contest = { districtId: t.districtId, invaderId: t.invaderId, pressure: 0, muscleIds: [] };
    active.push(c);
    created.push(c);
  }
  return created;
}

export interface ContestOutcome {
  districtId: string;
  /** A player business flipped to the invader this pulse (hold % dropped). */
  flipped: boolean;
  /** The contest resolved: 'lost' (the player was pushed out) / 'held' (the invader repelled). */
  ended: 'lost' | 'held' | null;
}
export interface ContestResult {
  outcomes: ContestOutcome[];
  /** The Contest records that ended this pulse (with their muscleIds — so the scene despawns them). */
  ended: Contest[];
}

/** Flip ONE of `fromFamily`'s businesses in `d` to `toFamily` (prefer a protection front, then a
 * racket). Returns true if one flipped. Logged. Pure (mutates state). */
function flipOneBusiness(state: GameState, d: District, toFamily: string, fromFamily: string): boolean {
  const front = d.businesses.find((b) => b.kind === 'front' && b.extortedBy === fromFamily);
  if (front) { front.extortedBy = toFamily; logFlip(state, d, toFamily, fromFamily); return true; }
  const op = d.businesses.find((b) => b.kind !== 'front' && b.ownerFamily === fromFamily);
  if (op) { op.ownerFamily = toFamily; op.uncollected = 0; logFlip(state, d, toFamily, fromFamily); return true; }
  return false;
}

function logFlip(state: GameState, d: District, toFamily: string, fromFamily: string): void {
  state.log.push({
    tick: state.tick,
    kind: 'turf-flip',
    message: `${toFamily} took a block of ${d.name} from ${fromFamily}`,
    data: { districtId: d.id, toFamily, fromFamily },
  });
}

/**
 * Resolve one turf-war pulse. `presence` is the per-district muscle count {rival, player} the scene
 * measured by UNIT POSITION. For each contest: shift pressure by net muscle; on +CONTEST_FLIP flip a
 * player business to the invader (and end 'lost' if the player no longer has a stake); on
 * −CONTEST_PUSHOUT the player repelled them — claw one rival block back and end 'held'. Pure.
 */
export function resolveContestStep(
  state: GameState,
  presence: ReadonlyMap<string, { rival: number; player: number }>,
): ContestResult {
  const outcomes: ContestOutcome[] = [];
  const ended: Contest[] = [];
  if (!state.contests || state.contests.length === 0) return { outcomes, ended };
  const survivors: Contest[] = [];
  for (const c of state.contests) {
    const d = state.districts.find((x) => x.id === c.districtId);
    if (!d) { continue; } // district vanished — drop the contest
    const p = presence.get(c.districtId) ?? { rival: 0, player: 0 };
    const net = p.rival - p.player; // > 0 ⇒ the invader is winning
    c.pressure = clamp(c.pressure + net * CONTEST_PRESSURE_STEP, -CONTEST_PRESSURE_MAX, CONTEST_PRESSURE_MAX);
    let flipped = false;
    let end: 'lost' | 'held' | null = null;
    if (c.pressure >= CONTEST_FLIP) {
      flipped = flipOneBusiness(state, d, c.invaderId, state.player.id);
      c.pressure = CONTEST_FLIP * 0.4; // bleed back after a flip (must re-earn the next one)
      if (familyShare(d, state.player.id) <= 0) end = 'lost'; // nothing of yours left here
    } else if (c.pressure <= CONTEST_PUSHOUT) {
      flipOneBusiness(state, d, state.player.id, c.invaderId); // you held — claw a block back
      end = 'held';
    }
    outcomes.push({ districtId: c.districtId, flipped, ended: end });
    if (end) ended.push(c); else survivors.push(c);
  }
  state.contests = survivors;
  return { outcomes, ended };
}

// ── reads (status + per-district collector vulnerability) ──────────────────────────────────────

export function contestOf(state: GameState, districtId: string): Contest | undefined {
  return state.contests?.find((c) => c.districtId === districtId);
}
export function districtContested(state: GameState, districtId: string): boolean {
  return !!state.contests?.some((c) => c.districtId === districtId);
}
export function contestedDistrictIds(state: GameState): string[] {
  return state.contests?.map((c) => c.districtId) ?? [];
}

/** ⭐ THE INTERCEPTION SWITCH-ON, per district: a collector inside `districtId` is robbable iff that
 * district is CONTESTED (an active invasion). Uncontested districts stay safe — the early game (no
 * contests) is unaffected. Pure read. */
export function collectorVulnerableInDistrict(state: GameState, districtId: string | undefined): boolean {
  return !!districtId && districtContested(state, districtId);
}
