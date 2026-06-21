// RTS-19 — pacing & legibility. Pure & deterministic; imports NO Phaser. The balance pass made
// offense an EARNED, paced progression (sabotage → raid → lockout → assassinate); this module
// makes that progression legible so the player can plan: what each action costs in cash AND heat,
// whether they can afford/unlock it right now (and if not, why), the weekly money trajectory, and
// which phase of the match arc they are in. It READS the sim (the gates + economy selectors) and
// never mutates — the HUD renders this, it does not recompute balance.

import {
  ASSASSINATE_COST,
  ASSASSINATE_HEAT,
  ASSASSINATE_CITYHALL_CAP,
  ASSASSINATE_CITYHALL_COVER,
  ASSASSINATE_MIN_STRENGTH,
  LOCKOUT_COST,
  RAID_BENCH_CAP,
  RAID_BENCH_MITIGATION,
  RAID_COST,
  RAID_HEAT,
  SABOTAGE_COST,
  SABOTAGE_HEAT,
  TURF_DOMINANCE,
} from './constants';
import { HQ_MAX } from './constants';
import { familyNet } from './economy';
import { allBusinesses, businessEarner } from './economy';
import { familyStrength } from './conflict';
import { districtsHeld } from './territoryWar';
import { districtHolder } from './territory';
import { hqIntegrityOf, weakestRival } from './endgame';
import { canRaid, canSabotage, canAssassinate, canLockout, type Gate } from './offense';
import type { GameState } from './types';

export type OffenseKey = 'sabotage' | 'raid' | 'lockout' | 'assassinate';

export interface OffenseOption {
  key: OffenseKey;
  /** Player-facing label + the hotkey the scene binds. */
  label: string;
  hotkey: string;
  /** Cash this action costs. */
  cost: number;
  /** Heat it draws, AFTER the relevant channel mitigation the player has bought (for display). */
  heat: number;
  /** Whether it can be performed right now. */
  available: boolean;
  /** Why not (the gate reason) when unavailable; 'ready' when available. */
  reason: string;
  /** The target the readout scored against (district name / racket name / rival name), if any. */
  target: string | null;
}

/** The first rival-held / contested district a raid would hit (mirrors the scene's targeting). */
function raidTarget(state: GameState): string | null {
  const held = state.districts.find((d) => { const h = districtHolder(d); return !!h && h !== state.player.id; });
  if (held) return held.id;
  const contested = state.districts.find((d) => Object.entries(d.control).some(([f, v]) => f !== state.player.id && v > 0));
  return contested ? contested.id : null;
}

/** The first rival-earning racket a sabotage would hit. */
function sabotageTarget(state: GameState): { id: string; name: string } | null {
  const b = allBusinesses(state).find((x) => { const e = businessEarner(x); return !!e && e !== state.player.id; });
  return b ? { id: b.id, name: b.name } : null;
}

/** Heat a raid would draw given the player's The Bench (judges) investment. */
function raidHeatAfterBench(state: GameState): number {
  const cut = Math.min(RAID_BENCH_CAP, (state.player.bribes.judges ?? 0) * RAID_BENCH_MITIGATION);
  return Math.round(RAID_HEAT * (1 - cut));
}

/** Heat a hit would draw given the player's City Hall (politicians) cover. */
function hitHeatAfterCityHall(state: GameState): number {
  const cover = Math.min(ASSASSINATE_CITYHALL_CAP, (state.player.bribes.politicians ?? 0) * ASSASSINATE_CITYHALL_COVER);
  return Math.round(ASSASSINATE_HEAT * (1 - cover));
}

/**
 * The four offensive actions with their live cost / heat / availability, in the intended unlock
 * order (sabotage first, the decapitating hit last). Pure — drives the HUD's "what can I do, what
 * will it cost" readout. Each row uses a representative target (the same one the scene's command
 * would pick), so the gate reason is the true reason that command would give.
 */
export function offenseReadout(state: GameState): OffenseOption[] {
  const sab = sabotageTarget(state);
  const raidT = raidTarget(state);
  const weak = weakestRival(state);
  const district = (id: string | null): string | null => id ? (state.districts.find((d) => d.id === id)?.name ?? id) : null;

  const sabGate: Gate = sab ? canSabotage(state, sab.id) : { ok: false, reason: 'no rival racket to hit' };
  const raidGate: Gate = raidT ? canRaid(state, raidT) : { ok: false, reason: 'no rival turf to raid' };
  const lockGate: Gate = weak ? canLockout(state, weak.familyId) : { ok: false, reason: 'no rival to lock down' };
  const hitGate: Gate = weak ? canAssassinate(state, weak.familyId) : { ok: false, reason: 'no rival Don left' };

  return [
    { key: 'sabotage', label: 'Sabotage', hotkey: '2', cost: SABOTAGE_COST, heat: SABOTAGE_HEAT, available: sabGate.ok, reason: sabGate.reason, target: sab?.name ?? null },
    { key: 'raid', label: 'Raid', hotkey: '1', cost: RAID_COST, heat: raidHeatAfterBench(state), available: raidGate.ok, reason: raidGate.reason, target: district(raidT) },
    { key: 'lockout', label: 'Lockout', hotkey: '4', cost: LOCKOUT_COST, heat: 0, available: lockGate.ok, reason: lockGate.reason, target: weak?.name ?? null },
    { key: 'assassinate', label: 'Assassinate', hotkey: '3', cost: ASSASSINATE_COST, heat: hitHeatAfterCityHall(state), available: hitGate.ok, reason: hitGate.reason, target: weak?.name ?? null },
  ];
}

export type MatchPhase = 'establish' | 'contest' | 'endgame';

export interface PhaseReadout {
  phase: MatchPhase;
  /** A clipped noir line naming where the player is in the arc + what to push on. */
  read: string;
}

/**
 * Which phase of the match arc the player is in (RTS-19) — a legible signpost:
 *  • establish — you hold no block yet; build income + secure your home corner.
 *  • contest — you hold turf and trade blows over the city.
 *  • endgame — you can decapitate: you have the muscle for a hit, a rival is on the ropes, or you
 *    are closing on dominance. Time to finish it.
 * Pure read; never mutates.
 */
export function matchPhase(state: GameState): PhaseReadout {
  const p = state.player;
  const held = districtsHeld(state, p.id).length;
  const total = state.districts.length;
  const dominance = total > 0 ? held / total : 0;
  const livingRivals = state.rivals.filter((r) => r.alive).length;

  if (held === 0 && livingRivals > 0) {
    return { phase: 'establish', read: 'Establish — build income and secure your first block.' };
  }
  const canDecapitate = familyStrength(p) >= ASSASSINATE_MIN_STRENGTH;
  // A rival is genuinely ON THE ROPES (not merely undeveloped) once its HQ is battered or it is
  // pinned under a Bureau lockout — i.e. you have already started closing it out.
  const rivalBattered = state.rivals.some((r) => r.alive && (hqIntegrityOf(r) < HQ_MAX || (r.lockoutTicks ?? 0) > 0));
  if (livingRivals === 0 || dominance >= TURF_DOMINANCE - 0.15 || canDecapitate || rivalBattered) {
    return { phase: 'endgame', read: 'Endgame — you have the reach to finish a rival. Decapitate.' };
  }
  return { phase: 'contest', read: 'Contest — hold your turf and pick your openings.' };
}

/** The player's projected weekly net cash flow (gross income − upkeep − bribe retainer). Positive
 * means the economy funds the war; negative means the bleed is winning. Pure. */
export function playerWeeklyNet(state: GameState): number {
  return familyNet(state, state.player);
}
