// RTS-16 — the contest trajectory. Pure & deterministic; imports NO Phaser. Scores who is
// winning the city so the turf war has a readable arc the player can push on: districts held
// (weighted by wealth), rackets earned, war chest, and muscle. Surfaced in the HUD; feeds no
// settlement math (the canon win/loss in flow.ts is untouched).

import { CONTROL_HOLD, TURF_DOMINANCE } from './constants';
import { districtIdentity } from './city';
import { familyStrength } from './conflict';
import { allBusinesses, businessEarner } from './economy';
import { controlOf } from './territory';
import { districtsHeld } from './territoryWar';
import { allFamilies, type District, type GameState } from './types';

/** A family's power in the contest: held turf (wealth-weighted) dominates, then rackets, war
 * chest, and muscle. Pure. */
export function familyPower(state: GameState, familyId: string): number {
  let power = 0;
  for (const d of districtsHeld(state, familyId)) {
    power += 12 + districtIdentity(d, state.districts.indexOf(d)).wealth * 4;
  }
  power += allBusinesses(state).filter((b) => businessEarner(b) === familyId).length * 3;
  const fam = allFamilies(state).find((f) => f.id === familyId);
  if (fam) {
    power += Math.floor(fam.cash / 500);
    power += familyStrength(fam);
  }
  return power;
}

export type Trajectory = 'establishing' | 'dominant' | 'ahead' | 'contested' | 'behind' | 'crushed' | 'eliminated';

/** The player's strongest UNSECURED foothold — their home corner before it clears CONTROL_HOLD.
 * Drives the honest founding read so the cold open shows a base + a clear path to lock it down. */
export interface HomeFront {
  districtId: string;
  districtName: string;
  control: number; // current player control points here
  needed: number; // points still required to HOLD it (clear CONTROL_HOLD)
}

/** The player's best foothold they don't yet hold (the home corner to secure). Null if they
 * already hold turf or have no foothold anywhere. Pure. */
export function playerHomeFront(state: GameState): HomeFront | null {
  let best: District | null = null;
  let bestControl = 0;
  for (const d of state.districts) {
    const c = controlOf(d, state.player.id);
    if (c <= 0 || c >= CONTROL_HOLD) continue; // absent, or already holding
    if (c > bestControl) { bestControl = c; best = d; }
  }
  if (!best) return null;
  return { districtId: best.id, districtName: best.name, control: bestControl, needed: CONTROL_HOLD - bestControl };
}

export interface StandingRow {
  familyId: string;
  name: string;
  isPlayer: boolean;
  alive: boolean;
  power: number;
  districtsHeld: number;
}

export interface CityStanding {
  rows: StandingRow[]; // sorted by power desc
  leaderId: string;
  totalDistricts: number;
  /** Fraction of all districts the player holds. */
  playerDominance: number;
  trajectory: Trajectory;
  read: string; // a clipped noir status line
  /** The home corner to secure (set while founding), so the opening shows a base + a path. */
  homeFront: HomeFront | null;
}

/** The full standings + the player's trajectory in the war. Pure; never mutates. */
export function cityStanding(state: GameState): CityStanding {
  const rows: StandingRow[] = allFamilies(state).map((f) => ({
    familyId: f.id,
    name: f.name,
    isPlayer: f.isPlayer,
    alive: f.alive,
    power: familyPower(state, f.id),
    districtsHeld: districtsHeld(state, f.id).length,
  }));
  rows.sort((a, b) => b.power - a.power || a.familyId.localeCompare(b.familyId));

  const total = state.districts.length;
  const playerRow = rows.find((r) => r.isPlayer)!;
  const leader = rows[0];
  const playerDominance = total > 0 ? playerRow.districtsHeld / total : 0;

  const homeFront = playerHomeFront(state);
  const trajectory = computeTrajectory(state, rows, playerRow, leader, playerDominance, homeFront);
  return {
    rows,
    leaderId: leader.familyId,
    totalDistricts: total,
    playerDominance,
    trajectory,
    read: trajectoryRead(trajectory, leader, playerRow, homeFront),
    homeFront,
  };
}

function computeTrajectory(
  state: GameState,
  rows: StandingRow[],
  player: StandingRow,
  leader: StandingRow,
  dominance: number,
  homeFront: HomeFront | null,
): Trajectory {
  if (!state.player.alive) return 'eliminated';
  const rivalsLeft = rows.filter((r) => !r.isPlayer && r.alive).length;
  if (player.districtsHeld === 0 && rivalsLeft > 0) {
    // The FOUNDING read: you hold no block yet, but your home corner is yours to secure and the
    // city is still wide open (no rival has locked down turf either). Honest + motivating — you
    // have a base and a path, not "get buried". Only truly crushed (no foothold, no power) reads red.
    const noRivalHolds = !rows.some((r) => !r.isPlayer && r.districtsHeld > 0);
    if (homeFront && noRivalHolds) return 'establishing';
    if (player.power <= 4 && !homeFront) return 'crushed';
  }
  if (leader.isPlayer && dominance >= TURF_DOMINANCE) return 'dominant';
  if (leader.isPlayer) return 'ahead';
  // within a fifth of the leader's power reads as a real contest.
  if (player.power >= leader.power * 0.8) return 'contested';
  return 'behind';
}

function trajectoryRead(t: Trajectory, leader: StandingRow, player: StandingRow, homeFront: HomeFront | null): string {
  switch (t) {
    case 'establishing':
      return homeFront
        ? `${homeFront.districtName} is your corner — build ${homeFront.needed} more control to lock it down.`
        : 'Plant your flag — take a corner and make it yours.';
    case 'dominant':
      return 'The city is bending to you. Finish it.';
    case 'ahead':
      return `You lead the city — ${player.districtsHeld} blocks and climbing.`;
    case 'contested':
      return `A dead heat with ${leader.name}. The next block decides it.`;
    case 'behind':
      return `${leader.name} is ahead. Take ground or get buried.`;
    case 'crushed':
      return 'You are down to nothing. Claw back a corner — fast.';
    case 'eliminated':
      return 'They pulled you from the river. The city moves on.';
  }
}

/** Whether every rival family has been driven out (the canon win still needs held turf). */
export function allRivalsCrushed(state: GameState): boolean {
  return state.rivals.every((r) => !r.alive);
}
