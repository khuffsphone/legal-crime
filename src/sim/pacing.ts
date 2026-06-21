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
  ASSASSINATE_HQ_DAMAGE,
  ASSASSINATE_MIN_STRENGTH,
  CONTROL_HOLD,
  EXPAND_COST,
  LOCKOUT_COST,
  LOCKOUT_DURATION,
  RAID_BENCH_CAP,
  RAID_BENCH_MITIGATION,
  RAID_COST,
  RAID_FORCE,
  RAID_HEAT,
  RECRUIT_COST,
  SABOTAGE_COST,
  SABOTAGE_HEAT,
  TURF_DOMINANCE,
} from './constants';
import { HQ_MAX } from './constants';
import { familyNet } from './economy';
import { allBusinesses, businessEarner } from './economy';
import { familyStrength } from './conflict';
import { districtsHeld } from './territoryWar';
import { controlOf, districtHolder } from './territory';
import { playerHomeFront } from './contest';
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
  /** RTS-21 legibility: weeks of current net income until the CASH for this action is in hand —
   * 0 when already affordable, N when N weeks off, null when income won't get there (net ≤ 0). */
  affordEtaWeeks: number | null;
}

/** RTS-21 — when (in weeks of current net income) the player can afford `cost`: 0 if already in
 * hand, else ⌈gap / weekly-net⌉, or null if the net is ≤ 0 (never, at this rate). Pure. */
export function weeksToAfford(state: GameState, cost: number): number | null {
  const cash = state.player.cash;
  if (cash >= cost) return 0;
  const net = playerWeeklyNet(state);
  if (net <= 0) return null;
  return Math.ceil((cost - cash) / net);
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
    { key: 'sabotage', label: 'Sabotage', hotkey: '2', cost: SABOTAGE_COST, heat: SABOTAGE_HEAT, available: sabGate.ok, reason: sabGate.reason, target: sab?.name ?? null, affordEtaWeeks: weeksToAfford(state, SABOTAGE_COST) },
    { key: 'raid', label: 'Raid', hotkey: '1', cost: RAID_COST, heat: raidHeatAfterBench(state), available: raidGate.ok, reason: raidGate.reason, target: district(raidT), affordEtaWeeks: weeksToAfford(state, RAID_COST) },
    { key: 'lockout', label: 'Lockout', hotkey: '4', cost: LOCKOUT_COST, heat: 0, available: lockGate.ok, reason: lockGate.reason, target: weak?.name ?? null, affordEtaWeeks: weeksToAfford(state, LOCKOUT_COST) },
    { key: 'assassinate', label: 'Assassinate', hotkey: '3', cost: ASSASSINATE_COST, heat: hitHeatAfterCityHall(state), available: hitGate.ok, reason: hitGate.reason, target: weak?.name ?? null, affordEtaWeeks: weeksToAfford(state, ASSASSINATE_COST) },
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

// ── the BUILD verbs (RTS-20) — how the player leaves ESTABLISH ─────────────────────────────────

export type BuildKey = 'expand' | 'recruit';

export interface BuildOption {
  key: BuildKey;
  label: string;
  hotkey: string;
  cost: number;
  /** Whether the player can afford it right now. */
  affordable: boolean;
  /** A short "what this gets you / unlocks" line (drives the build board). */
  effect: string;
  /** The district the expand would target (its name), or null for recruit. */
  target: string | null;
  /** RTS-21 legibility: weeks of net income until affordable (0 now, N off, null at net ≤ 0). */
  affordEtaWeeks: number | null;
}

/** The district an EXPAND would push: the home corner still to secure (so it can be HELD), else
 * the player's strongest district (keep growing). */
export function expandTargetDistrictId(state: GameState): string | null {
  const home = playerHomeFront(state);
  if (home) return home.districtId;
  // already securing/holding — grow the strongest foothold.
  let best: string | null = null;
  let bestControl = -1;
  for (const d of state.districts) {
    const c = controlOf(d, state.player.id);
    if (c > bestControl) { bestControl = c; best = d.id; }
  }
  return bestControl > 0 ? best : null;
}

/**
 * The two BUILD verbs with live cost / affordability / effect (RTS-20) — the moves that let the
 * player leave ESTABLISH: EXPAND control (toward HOLDING a block, which unlocks RAID) and RECRUIT
 * muscle (toward the strength that unlocks ASSASSINATE). Pure — drives the HUD build board.
 */
export function buildReadout(state: GameState): BuildOption[] {
  const p = state.player;
  const home = playerHomeFront(state);
  const expandId = expandTargetDistrictId(state);
  const expandName = expandId ? (state.districts.find((d) => d.id === expandId)?.name ?? expandId) : null;
  const expandEffect = home
    ? `secure ${home.districtName} (+${home.needed} to HOLD → unlocks RAID)`
    : expandName ? `grow control in ${expandName}` : 'expand your turf';

  const strength = familyStrength(p);
  const recruitEffect = strength >= ASSASSINATE_MIN_STRENGTH
    ? `muscle ${strength} — hit-ready`
    : `muscle ${strength}/${ASSASSINATE_MIN_STRENGTH} (toward ASSASSINATE)`;

  return [
    { key: 'expand', label: 'Expand', hotkey: '5', cost: EXPAND_COST, affordable: p.cash >= EXPAND_COST && expandId !== null, effect: expandEffect, target: expandName, affordEtaWeeks: weeksToAfford(state, EXPAND_COST) },
    { key: 'recruit', label: 'Recruit', hotkey: '6', cost: RECRUIT_COST, affordable: p.cash >= RECRUIT_COST, effect: recruitEffect, target: null, affordEtaWeeks: weeksToAfford(state, RECRUIT_COST) },
  ];
}

/** Whether a district is one short push from being HELD (control in [CONTROL_HOLD − EXPAND_BASE, HOLD)). */
export function isNearlyHeld(state: GameState, districtId: string): boolean {
  const d = state.districts.find((x) => x.id === districtId);
  if (!d) return false;
  const c = controlOf(d, state.player.id);
  return c > 0 && c < CONTROL_HOLD;
}

// ── RTS-23 — the 4-stage match-phase header (ESTABLISH → FIRST BLOOD → CONTEST → DECAPITATE) ────

export type HudPhase = 'ESTABLISH' | 'FIRST BLOOD' | 'CONTEST' | 'DECAPITATE';

export interface HudPhaseReadout {
  phase: HudPhase;
  /** A clipped noir line naming the stage + what to push on. */
  read: string;
}

/**
 * The player-facing 4-stage arc header (RTS-23), derived deterministically from matchPhase + how
 * much turf the player holds:
 *  • ESTABLISH   — hold no block yet: extort the neighbourhood, secure your corner.
 *  • FIRST BLOOD — your first block is secured: make your first move on a rival.
 *  • CONTEST     — you hold ≥2 blocks: a real turf war over the city.
 *  • DECAPITATE  — you can finish a rival (muscle, a battered/locked rival, or near dominance).
 * Pure read; never mutates.
 */
export function hudPhase(state: GameState): HudPhaseReadout {
  const mp = matchPhase(state).phase;
  if (mp === 'establish') return { phase: 'ESTABLISH', read: 'Extort the neighbourhood — build income before any war.' };
  if (mp === 'endgame') return { phase: 'DECAPITATE', read: 'Finish a rival — raid to soften, lockout to pin, then assassinate.' };
  const held = districtsHeld(state, state.player.id).length;
  return held >= 2
    ? { phase: 'CONTEST', read: 'A real turf war — hold your blocks and take rival ground.' }
    : { phase: 'FIRST BLOOD', read: 'Your corner is secure — make your first move on a rival.' };
}

// ── RTS-23 — offense previews (cost / effect / heat / retaliation BEFORE commit) ────────────────

export interface OffensePreview {
  key: OffenseKey;
  /** What the strike does, in plain mob English (derived from the tuned constants). */
  effect: string;
  /** How the rival hits back. */
  retaliation: string;
}

/** The effect + retaliation a player should read BEFORE committing an offensive verb (RTS-23). Cost
 * and heat live on the OffenseOption; this adds the consequence preview. Pure, deterministic. */
export function offensePreview(key: OffenseKey): OffensePreview {
  switch (key) {
    case 'sabotage':
      return { key, effect: 'wreck/shut a rival racket — it stops earning', retaliation: 'the owner gets sore (minor)' };
    case 'raid':
      return { key, effect: `shove ~${RAID_FORCE} control + scatter their take (softens; one raid won't seize)`, retaliation: 'the defender enrages — may push your turf' };
    case 'lockout':
      return { key, effect: `the Feds freeze + bleed the rival for ${LOCKOUT_DURATION} weeks`, retaliation: 'mild — a quiet move' };
    case 'assassinate':
      return { key, effect: `−${ASSASSINATE_HQ_DAMAGE} HQ integrity (≈3 hits topple a Don)`, retaliation: 'the rival ENRAGES — strikes your HQ' };
  }
}

