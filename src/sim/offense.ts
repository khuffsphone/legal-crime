// RTS-17 — the offensive. Pure & deterministic (seeded RNG for combat); imports NO Phaser. The
// player's ways to take the fight to a rival, each an EARNED strategic choice: it costs cash and
// crew and draws heat, and the canon four channels gate or ease the bigger moves. These are
// player COMMANDS resolved in the real-time wrapper (like extort/collect) — NOT tick — so the
// economic settlement is untouched. Every attack raises the target's aggression (→ retaliation).

import {
  ASSASSINATE_CITYHALL_CAP,
  ASSASSINATE_CITYHALL_COVER,
  ASSASSINATE_COST,
  ASSASSINATE_HEAT,
  ASSASSINATE_HQ_DAMAGE,
  ASSASSINATE_MIN_STRENGTH,
  HEAT_MAX,
  LOCKOUT_BUREAU_REQ,
  LOCKOUT_COST,
  LOCKOUT_DURATION,
  OFFENSE_COOLDOWN_SECONDS,
  RAID_BENCH_CAP,
  RAID_BENCH_MITIGATION,
  RAID_COST,
  RAID_FORCE,
  RAID_HEAT,
  RAID_MIN_CREW,
  RAID_REPELLED_BASE,
  SABOTAGE_COST,
  SABOTAGE_DESTROY_CHANCE,
  SABOTAGE_HEAT,
  SABOTAGE_MIN_CREW,
} from './constants';
import { muscleInDistrict, findBusiness } from './commands';
import { aggroOnAttackFor } from './rivalArchetype';
import { familyStrength } from './conflict';
import { businessEarner } from './economy';
import { damageHQ } from './endgame';
import { clampDirty } from './laundering';
import { Rng } from './rng';
import { districtHolder } from './territory';
import { pushPresence, districtsHeld } from './territoryWar';
import { findFamily, type Family, type GameState } from './types';

function addHeat(family: Family, amount: number): void {
  family.heat = Math.min(HEAT_MAX, family.heat + Math.max(0, Math.round(amount)));
}
// The aggro gained per hit is now PER-RIVAL (rivalArchetype tuning hook): the default and every fractional
// caller resolve the target family's own onAttack value, which falls back to the global AGGRO_ON_ATTACK
// when the family carries no override/archetype — so the baseline (40, 20, 60, 20) is byte-identical.
function raiseAggro(target: Family, amount = aggroOnAttackFor(target)): void {
  target.aggro = (target.aggro ?? 0) + amount;
}
/** RTS-19: arm the shared crew cooldown after an offensive action — the men regroup before the
 * next job, so heavy hits cannot be chained into an instant board flip. */
function armCooldown(state: GameState): void {
  state.offenseCooldown = OFFENSE_COOLDOWN_SECONDS;
}
function loseWeakest(family: Family): void {
  if (family.gangsters.length === 0) return;
  const ordered = [...family.gangsters].sort((a, b) => a.skill - b.skill);
  const doomed = ordered[0].id;
  family.gangsters = family.gangsters.filter((g) => g.id !== doomed);
}

// ── gates (pure predicates) ─────────────────────────────────────────────────────────────────

export interface Gate {
  ok: boolean;
  reason: string;
}
function gate(ok: boolean, reason: string): Gate {
  return { ok, reason };
}

/** RTS-19: the shared crew cooldown — every offence refuses while the men are still regrouping. */
export function offenseReady(state: GameState): Gate {
  const cd = state.offenseCooldown ?? 0;
  if (cd > 0) return gate(false, `crew regrouping (${Math.ceil(cd)}s)`);
  return gate(true, 'ready');
}

/** Whether the player can RAID a district right now: a SECURED home block + crew + cash + a rival
 * to hit there, and the crew not still regrouping (RTS-19 pacing — you establish before you
 * project force). */
export function canRaid(state: GameState, districtId: string): Gate {
  const cd = offenseReady(state);
  if (!cd.ok) return cd;
  const d = state.districts.find((x) => x.id === districtId);
  if (!d) return gate(false, 'no such district');
  // RTS-19: you must hold a block of your own before you can take the fight onto rival turf.
  if (districtsHeld(state, state.player.id).length === 0) return gate(false, 'secure a home block first');
  if (state.player.gangsters.length < RAID_MIN_CREW) return gate(false, `need ${RAID_MIN_CREW} crew`);
  if (state.player.cash < RAID_COST) return gate(false, `need $${RAID_COST}`);
  const holder = districtHolder(d);
  const rivalPresence = Object.entries(d.control).some(([fid, v]) => fid !== 'player' && v > 0);
  if (!rivalPresence && holder === 'player') return gate(false, 'already yours');
  return gate(true, 'ready');
}

/** Whether the player can SABOTAGE a business (cash + crew + it earns for a rival). The cheapest,
 * earliest offensive tool — the first way to hit back, once a rival has a racket to wreck. */
export function canSabotage(state: GameState, businessId: string): Gate {
  const cd = offenseReady(state);
  if (!cd.ok) return cd;
  if (state.player.gangsters.length < SABOTAGE_MIN_CREW) return gate(false, `need ${SABOTAGE_MIN_CREW} crew`);
  if (state.player.cash < SABOTAGE_COST) return gate(false, `need $${SABOTAGE_COST}`);
  const found = findBusiness(state, businessId);
  if (!found) return gate(false, 'no such target');
  const earner = businessEarner(found.business);
  if (!earner || earner === 'player') return gate(false, 'not a rival racket');
  return gate(true, 'ready');
}

/** Whether the player can ASSASSINATE a rival Don (muscle enables the hit; cash funds it). */
export function canAssassinate(state: GameState, rivalId: string): Gate {
  const cd = offenseReady(state);
  if (!cd.ok) return cd;
  const r = findFamily(state, rivalId);
  if (!r || r.isPlayer || !r.alive) return gate(false, 'invalid target');
  if (familyStrength(state.player) < ASSASSINATE_MIN_STRENGTH) return gate(false, `need ${ASSASSINATE_MIN_STRENGTH} muscle`);
  if (state.player.cash < ASSASSINATE_COST) return gate(false, `need $${ASSASSINATE_COST}`);
  return gate(true, 'ready');
}

/** Whether the player can drop a federal LOCKOUT on a rival (The Bureau investment unlocks it). */
export function canLockout(state: GameState, rivalId: string): Gate {
  const cd = offenseReady(state);
  if (!cd.ok) return cd;
  const r = findFamily(state, rivalId);
  if (!r || r.isPlayer || !r.alive) return gate(false, 'invalid target');
  if ((state.player.bribes.feds ?? 0) < LOCKOUT_BUREAU_REQ) return gate(false, `need The Bureau ≥ ${LOCKOUT_BUREAU_REQ}`);
  if (state.player.cash < LOCKOUT_COST) return gate(false, `need $${LOCKOUT_COST}`);
  return gate(true, 'ready');
}

// ── resolvers (mutate state; seeded where there is risk) ────────────────────────────────────

export interface RaidResult { ok: boolean; reason: string; repelled?: boolean; captured?: boolean; disrupted?: boolean; }

/** RAID a district: muscle in by force. Costs cash + heat (The Bench cuts the legal blowback) and
 * chips player presence in. RTS-19: a single raid SOFTENS — it disrupts the defender's economy
 * (breaks fronts, scatters takings) and erodes their hold, but it only SEIZES the block's rackets
 * if the push actually makes you the new holder; otherwise ownership stays and you must keep the
 * pressure on. Can be REPELLED if the rival guards it. */
export function resolveRaid(state: GameState, districtId: string): RaidResult {
  const g = canRaid(state, districtId);
  if (!g.ok) return { ok: false, reason: g.reason };
  const p = state.player;
  const d = state.districts.find((x) => x.id === districtId)!;
  const defenderId = districtHolder(d) ?? Object.entries(d.control).filter(([fid]) => fid !== 'player').sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const defender = defenderId ? findFamily(state, defenderId) : undefined;

  p.cash -= RAID_COST;
  clampDirty(p);
  armCooldown(state);
  const benchCut = Math.min(RAID_BENCH_CAP, (p.bribes.judges ?? 0) * RAID_BENCH_MITIGATION);
  addHeat(p, RAID_HEAT * (1 - benchCut));

  // repel roll — the rival's guarding muscle defends the district.
  const guard = defender ? muscleInDistrict(defender, districtId) : 0;
  const rng = new Rng(state.rngState);
  const repelChance = Math.min(0.75, RAID_REPELLED_BASE + guard * 0.04);
  const repelled = rng.chance(repelChance);
  state.rngState = rng.state;

  if (defender) raiseAggro(defender);

  if (repelled) {
    loseWeakest(p); // a man down in the failed push
    state.log.push({ tick: state.tick, kind: 'raid', message: `${p.name}'s raid on ${d.name} was repelled`, data: { districtId, repelled: true } });
    return { ok: true, reason: 'repelled', repelled: true };
  }

  const force = RAID_FORCE + Math.floor(familyStrength(p) * 0.5);
  // RTS-19: a raid SEIZES only on a genuine takeover (you become the holder); a mere displacement
  // disrupts but does not hand you the rackets.
  const push = pushPresence(state, 'player', districtId, force, { seizeOnDisplace: false });
  // scatter the defender's takings in the district (the raid's immediate economic bite).
  for (const b of d.businesses) if (businessEarner(b) === defenderId) b.uncollected = 0;
  state.log.push({ tick: state.tick, kind: 'raid', message: `${p.name} raided ${d.name} (force ${force})`, data: { districtId, force, captured: !!push?.captured, disrupted: !!push?.disrupted } });
  return { ok: true, reason: 'ok', captured: !!push?.captured, disrupted: !!push?.disrupted };
}

export interface SabotageResult { ok: boolean; reason: string; destroyed?: boolean; }

/** SABOTAGE a rival racket/front — interdict their economy. An operation may be wrecked outright;
 * a front's protection is broken. Costs cash + heat. The cheapest, earliest offensive tool. */
export function resolveSabotage(state: GameState, businessId: string): SabotageResult {
  const g = canSabotage(state, businessId);
  if (!g.ok) return { ok: false, reason: g.reason };
  const p = state.player;
  const found = findBusiness(state, businessId)!;
  const { business: b, district: d } = found;
  const owner = businessEarner(b)!;
  const ownerFam = findFamily(state, owner);

  p.cash -= SABOTAGE_COST;
  clampDirty(p);
  armCooldown(state);
  addHeat(p, SABOTAGE_HEAT);
  if (ownerFam) raiseAggro(ownerFam, aggroOnAttackFor(ownerFam) / 2);

  const rng = new Rng(state.rngState);
  const wreck = b.kind !== 'front' && rng.chance(SABOTAGE_DESTROY_CHANCE);
  state.rngState = rng.state;

  if (b.kind === 'front') {
    b.extortedBy = undefined; // protection broken
    b.uncollected = 0;
  } else if (wreck) {
    d.businesses = d.businesses.filter((x) => x.id !== b.id); // operation destroyed
  } else {
    b.uncollected = 0; // takings torched
  }
  state.log.push({ tick: state.tick, kind: 'sabotage', message: `${p.name} sabotaged ${ownerFam?.name ?? owner}'s ${b.name}${wreck ? ' (wrecked)' : ''}`, data: { businessId, owner, destroyed: wreck } });
  return { ok: true, reason: 'ok', destroyed: wreck };
}

export interface AssassinateResult { ok: boolean; reason: string; success?: boolean; eliminated?: boolean; }

/** ASSASSINATE a rival Don — strike their HQ. High cost + heat (City Hall buys political cover).
 * Seeded success vs the rival's strength; on success the HQ takes heavy damage and may fall. */
export function resolveAssassinate(state: GameState, rivalId: string): AssassinateResult {
  const g = canAssassinate(state, rivalId);
  if (!g.ok) return { ok: false, reason: g.reason };
  const p = state.player;
  const rival = findFamily(state, rivalId)!;

  p.cash -= ASSASSINATE_COST;
  clampDirty(p);
  armCooldown(state);
  const cover = Math.min(ASSASSINATE_CITYHALL_CAP, (p.bribes.politicians ?? 0) * ASSASSINATE_CITYHALL_COVER);
  addHeat(p, ASSASSINATE_HEAT * (1 - cover));
  raiseAggro(rival, aggroOnAttackFor(rival) * 1.5);

  const pStr = familyStrength(p);
  const rStr = familyStrength(rival);
  const rng = new Rng(state.rngState);
  const successChance = Math.max(0.15, Math.min(0.9, pStr / (pStr + rStr + 6)));
  const success = rng.chance(successChance);
  state.rngState = rng.state;

  if (!success) {
    loseWeakest(p); // a botched hit costs you a man
    state.log.push({ tick: state.tick, kind: 'assassination', message: `${p.name}'s hit on ${rival.name} failed`, data: { rivalId, success: false } });
    return { ok: true, reason: 'failed', success: false };
  }

  const dmg = damageHQ(state, rivalId, ASSASSINATE_HQ_DAMAGE);
  state.log.push({ tick: state.tick, kind: 'assassination', message: `${p.name} struck ${rival.name}'s HQ${dmg.destroyed ? ' — the family is finished' : ''}`, data: { rivalId, success: true, eliminated: dmg.destroyed } });
  return { ok: true, reason: 'ok', success: true, eliminated: dmg.destroyed };
}

export interface LockoutResult { ok: boolean; reason: string; }

/** Drop a federal LOCKOUT on a rival (The Bureau): the Feds freeze their expansion and bleed
 * them for LOCKOUT_DURATION pulses. Costs cash; quiet (a dime, not a gun). */
export function resolveLockout(state: GameState, rivalId: string): LockoutResult {
  const g = canLockout(state, rivalId);
  if (!g.ok) return { ok: false, reason: g.reason };
  const p = state.player;
  const rival = findFamily(state, rivalId)!;
  p.cash -= LOCKOUT_COST;
  clampDirty(p);
  armCooldown(state);
  rival.lockoutTicks = Math.max(rival.lockoutTicks ?? 0, LOCKOUT_DURATION);
  raiseAggro(rival, aggroOnAttackFor(rival) / 2);
  state.log.push({ tick: state.tick, kind: 'lockout', message: `${p.name} sicced the Bureau on ${rival.name} — locked down for ${LOCKOUT_DURATION}`, data: { rivalId, duration: LOCKOUT_DURATION } });
  return { ok: true, reason: 'ok' };
}
