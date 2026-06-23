// RTS-30c-2a — channel-gated weapon-tier ENFORCERS + specialists. Pure & Phaser-free. Each is an
// ABSTRACT strategy role: a RECRUIT gated by a bribery-channel grease level (The Beat / The Bench /
// City Hall / The Bureau), a cash cost, a heat contribution, a crew skill (feeds familyStrength → the
// Assassinate gate), and a turf-war muscle-PRESENCE weight. ⭐ ABSTRACTION RULE: we model cost /
// eligibility / channel-gate / heat / outcome ONLY — never a procedural depiction of violence, weapons,
// or evasion. The "weapon" is a stat + a readable silhouette (drawn scene-side), not an instruction.
//
// Balance values are CANDIDATE + centralized in ENFORCER_SPECS (DATA SETTLES BALANCE at playtest).

import { HEAT_MAX } from './constants';
import type { BribeChannel, GameState, Gangster, WeaponTier } from './types';

export interface EnforcerSpec {
  tier: WeaponTier;
  label: string;
  /** The grease channel that gates the recruit. */
  channel: BribeChannel;
  channelLabel: string;
  /** Minimum standing bribe ($/wk) on `channel` to UNLOCK this unit. */
  gateLevel: number;
  cost: number;     // recruit cash cost
  heat: number;     // heat added on recruit
  skill: number;    // crew skill (familyStrength)
  upkeep: number;   // cash/tick
  presence: number; // turf-war muscle-presence weight (a plain thug = 1)
  /** The existing offensive verb this specialist powers (flavor/wiring), if any. */
  verb?: 'assassinate' | 'sabotage';
  blurb: string;
}

/** The approved CANON REV-b roster (CANDIDATE balance — tune on playtest data). */
export const ENFORCER_SPECS: Record<WeaponTier, EnforcerSpec> = {
  pistol: { tier: 'pistol', label: 'PISTOL MAN', channel: 'police', channelLabel: 'The Beat', gateLevel: 10, cost: 350, heat: 2, skill: 4, upkeep: 18, presence: 1.4, blurb: 'light armed enforcer — early ranged pressure, safer patrols' },
  shotgun: { tier: 'shotgun', label: 'SHOTGUN MAN', channel: 'police', channelLabel: 'The Beat', gateLevel: 25, cost: 500, heat: 3, skill: 5, upkeep: 22, presence: 2.2, blurb: 'close-range deterrent — strong in-district / chokepoint presence' },
  rifle: { tier: 'rifle', label: 'RIFLE MAN', channel: 'police', channelLabel: 'The Beat', gateLevel: 40, cost: 650, heat: 4, skill: 6, upkeep: 26, presence: 1.8, blurb: 'longer-range / district-edge pressure' },
  hitman: { tier: 'hitman', label: 'HITMAN', channel: 'judges', channelLabel: 'The Bench', gateLevel: 30, cost: 1500, heat: 10, skill: 8, upkeep: 40, presence: 1.6, verb: 'assassinate', blurb: 'assassination specialist — powers [3] Assassinate; very high heat' },
  demolitions: { tier: 'demolitions', label: 'DEMOLITIONS', channel: 'politicians', channelLabel: 'City Hall', gateLevel: 30, cost: 900, heat: 8, skill: 5, upkeep: 34, presence: 1.5, verb: 'sabotage', blurb: 'demolitions specialist — powers the wreck ([2] Sabotage); very high heat' },
};

export const ENFORCER_TIERS: WeaponTier[] = ['pistol', 'shotgun', 'rifle', 'hitman', 'demolitions'];

/** The turf-war muscle-presence weight of a player unit (a plain thug = 1). Pure. */
export function enforcerPresenceWeight(weapon: WeaponTier | undefined): number {
  return weapon ? ENFORCER_SPECS[weapon].presence : 1;
}

/** RTS-30c-2b — a PATROLLING unit holds its zone: it contributes EXTRA muscle presence (a defensive/
 * control stance). Flat bonus on top of its weapon weight. CANDIDATE/tunable. */
export const PATROL_PRESENCE_BONUS = 0.8;

/** A single unit's turf-war muscle presence: 0 for a collector, else its weapon weight + a patrol
 * bonus when it is holding the zone. Pure. */
export function unitMusclePresence(u: { role?: string; weapon?: WeaponTier; patrol?: boolean }): number {
  if (u.role === 'collector') return 0;
  return enforcerPresenceWeight(u.weapon) + (u.patrol ? PATROL_PRESENCE_BONUS : 0);
}

/** Sum the muscle presence of a set of units (the scene filters to a faction + district first). Pure. */
export function totalMusclePresence(units: ReadonlyArray<{ role?: string; weapon?: WeaponTier; patrol?: boolean }>): number {
  let w = 0;
  for (const u of units) w += unitMusclePresence(u);
  return w;
}

export interface RecruitGate { ok: boolean; reason: string; }

/** Whether the player can recruit `tier` now: the channel grease level must meet the gate, then cash
 * must cover the cost. Pure read — a plain reason drives the locked-affordance chip. */
export function enforcerGate(state: GameState, tier: WeaponTier): RecruitGate {
  const spec = ENFORCER_SPECS[tier];
  const level = state.player.bribes[spec.channel] ?? 0;
  if (level < spec.gateLevel) return { ok: false, reason: `needs ${spec.channelLabel} ≥ $${spec.gateLevel}/wk` };
  if (state.player.cash < spec.cost) return { ok: false, reason: `need $${spec.cost}` };
  return { ok: true, reason: 'ready' };
}

export interface RecruitResult { ok: boolean; reason: string; gangster?: Gangster; }

/**
 * Recruit a weapon-tier enforcer: check the channel gate + cash, deduct the cost, add the heat, and add
 * a crew member (its skill feeds familyStrength → the Assassinate gate; its presence feeds the turf
 * war). Returns the new crew member so the scene can spawn the on-map unit. Pure (mutates state).
 */
export function recruitEnforcer(state: GameState, tier: WeaponTier, idSuffix?: string): RecruitResult {
  const g = enforcerGate(state, tier);
  if (!g.ok) return { ok: false, reason: g.reason };
  const spec = ENFORCER_SPECS[tier];
  state.player.cash -= spec.cost;
  state.player.heat = Math.min(HEAT_MAX, state.player.heat + spec.heat);
  const gangster: Gangster = {
    id: `enf-${tier}-${idSuffix ?? state.tick}-${state.player.gangsters.length}`,
    name: spec.label,
    skill: spec.skill,
    loyalty: 70,
    upkeep: spec.upkeep,
    assignment: { type: 'idle' },
  };
  state.player.gangsters.push(gangster);
  state.log.push({
    tick: state.tick,
    kind: 'recruit-enforcer',
    message: `recruited a ${spec.label} (via ${spec.channelLabel})`,
    data: { tier, cost: spec.cost, heat: spec.heat },
  });
  return { ok: true, reason: 'recruited', gangster };
}

export interface RecruitOption { tier: WeaponTier; spec: EnforcerSpec; gate: RecruitGate; }

/** The recruit options for the menu/UI — each tier + its live gate state. Pure read. */
export function recruitableEnforcers(state: GameState): RecruitOption[] {
  return ENFORCER_TIERS.map((tier) => ({ tier, spec: ENFORCER_SPECS[tier], gate: enforcerGate(state, tier) }));
}
