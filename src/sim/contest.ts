// RTS-16 — the contest trajectory. Pure & deterministic; imports NO Phaser. Scores who is
// winning the city so the turf war has a readable arc the player can push on: districts held
// (weighted by wealth), rackets earned, war chest, and muscle. Surfaced in the HUD; feeds no
// settlement math (the canon win/loss in flow.ts is untouched).

import { TURF_DOMINANCE } from './constants';
import { districtIdentity } from './city';
import { familyStrength } from './conflict';
import { allBusinesses, businessEarner } from './economy';
import { districtsHeld } from './territoryWar';
import { allFamilies, type GameState } from './types';

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

export type Trajectory = 'dominant' | 'ahead' | 'contested' | 'behind' | 'crushed' | 'eliminated';

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

  const trajectory = computeTrajectory(state, rows, playerRow, leader, playerDominance);
  return {
    rows,
    leaderId: leader.familyId,
    totalDistricts: total,
    playerDominance,
    trajectory,
    read: trajectoryRead(trajectory, leader, playerRow),
  };
}

function computeTrajectory(
  state: GameState,
  rows: StandingRow[],
  player: StandingRow,
  leader: StandingRow,
  dominance: number,
): Trajectory {
  if (!state.player.alive) return 'eliminated';
  const rivalsLeft = rows.filter((r) => !r.isPlayer && r.alive).length;
  if (player.districtsHeld === 0 && player.power <= 4 && rivalsLeft > 0) return 'crushed';
  if (leader.isPlayer && dominance >= TURF_DOMINANCE) return 'dominant';
  if (leader.isPlayer) return 'ahead';
  // within a fifth of the leader's power reads as a real contest.
  if (player.power >= leader.power * 0.8) return 'contested';
  return 'behind';
}

function trajectoryRead(t: Trajectory, leader: StandingRow, player: StandingRow): string {
  switch (t) {
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
