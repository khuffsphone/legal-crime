// RTS-24 — VICE UPGRADES. Pure & deterministic; imports NO Phaser. The original's conversion tree
// as real economic decisions: each illegal operation climbs a BRANCH (Bootlegging / Gambling /
// Entertainment / Troubleshooting) with distinct yield / heat profiles, gated by a prerequisite on
// later rungs (City Hall, crew, influence). Applying a rung raises the operation's base income and
// shifts its heat — it WRAPS the economy (it edits a Business's tuning, never tick's math). The
// HUD's "The Books" reads the ladder: cost · yield-Δ · heat-Δ · prereq · READY/CONDITIONAL/LOCKED.

import { VICE_RUNG_COST_BASE, VICE_RUNG_INCOME_BUMP, VICE_RUNG_MAX } from './constants';
import { findBusiness } from './commands';
import { familyStrength } from './conflict';
import { influenceOf } from './winpaths';
import { clampDirty } from './laundering';
import { findFamily, type Business, type GameState, type OperationKind } from './types';

export type ViceBranch = 'bootlegging' | 'gambling' | 'entertainment' | 'troubleshooting';

interface BranchDef {
  branch: ViceBranch;
  label: string;
  /** Flavour name per rung (index 0 = rung 1). */
  rungs: [string, string, string];
  /** Income-bump multiplier vs VICE_RUNG_INCOME_BUMP. */
  incomeMult: number;
  /** Heat shift per rung (bootlegging loud; troubleshooting quiets the block). */
  heatDelta: number;
  /** Prerequisite for the FINAL rung (the gated leap). */
  finalPrereq: { kind: 'cityHall' | 'crew' | 'influence'; min: number; label: string };
}

const BRANCHES: Record<OperationKind, BranchDef> = {
  smuggling: { branch: 'bootlegging', label: 'BOOTLEGGING', rungs: ['Backroom Still', 'Truck Route', 'Distribution Network'], incomeMult: 1.4, heatDelta: 4, finalPrereq: { kind: 'cityHall', min: 20, label: "AN ALDERMAN'S EAR (City Hall ≥ 20)" } },
  numbers: { branch: 'gambling', label: 'GAMBLING', rungs: ['Numbers Game', 'Card Room', 'Casino Floor'], incomeMult: 1.0, heatDelta: 2, finalPrereq: { kind: 'crew', min: 8, label: 'MADE MEN (crew strength ≥ 8)' } },
  speakeasy: { branch: 'entertainment', label: 'ENTERTAINMENT', rungs: ['Speakeasy', 'Jazz Club', 'Grand Cabaret'], incomeMult: 1.2, heatDelta: 1, finalPrereq: { kind: 'influence', min: 30, label: 'A SOCIETY NAME (influence ≥ 30)' } },
  protection: { branch: 'troubleshooting', label: 'TROUBLESHOOTING', rungs: ['Leg-Breakers', 'Protection Racket', "The Outfit's Muscle"], incomeMult: 0.8, heatDelta: -1, finalPrereq: { kind: 'crew', min: 12, label: 'A CREW OF ENFORCERS (strength ≥ 12)' } },
};

/** The vice branch for an operation kind (fronts have none). */
export function viceBranchFor(kind: string): BranchDef | null {
  return (BRANCHES as Record<string, BranchDef>)[kind] ?? null;
}

export type RungState = 'READY' | 'CONDITIONAL' | 'LOCKED';

export interface ViceRungView {
  rung: number; // 1-based
  name: string;
  cost: number;
  incomeBump: number;
  heatDelta: number;
  /** The prereq label for this rung, or null when none. */
  prereq: string | null;
  state: RungState;
  /** Plain reason when not READY. */
  reason: string;
}

export interface ViceLadder {
  branch: ViceBranch | null;
  label: string;
  current: number; // rungs already climbed (0..MAX)
  /** The NEXT rung the player would buy, or null when maxed / not an operation. */
  next: ViceRungView | null;
}

function rungCost(rung: number): number { return VICE_RUNG_COST_BASE * rung; }

function prereqMet(state: GameState, def: BranchDef): { ok: boolean; reason: string } {
  const pr = def.finalPrereq;
  const have = pr.kind === 'cityHall' ? (state.player.bribes.politicians ?? 0) : pr.kind === 'crew' ? familyStrength(state.player) : influenceOf(state);
  return have >= pr.min ? { ok: true, reason: '' } : { ok: false, reason: `needs ${pr.label}` };
}

/** The upgrade ladder for an operation — the next rung's cost / yield-Δ / heat-Δ / prereq / state. */
export function viceLadder(state: GameState, businessId: string): ViceLadder | null {
  const found = findBusiness(state, businessId);
  if (!found) return null;
  const b = found.business;
  const def = viceBranchFor(b.kind);
  if (!def) return { branch: null, label: '—', current: 0, next: null };
  const current = b.viceRung ?? 0;
  if (current >= VICE_RUNG_MAX) return { branch: def.branch, label: def.label, current, next: null };

  const rung = current + 1;
  const cost = rungCost(rung);
  const incomeBump = Math.round(VICE_RUNG_INCOME_BUMP * def.incomeMult);
  const isFinal = rung === VICE_RUNG_MAX;
  const prereq = isFinal ? def.finalPrereq.label : null;

  let stateTag: RungState = 'READY';
  let reason = 'ready';
  const owns = b.ownerFamily === state.player.id;
  if (!owns) { stateTag = 'LOCKED'; reason = 'not your racket'; }
  else if (isFinal && !prereqMet(state, def).ok) { stateTag = 'LOCKED'; reason = prereqMet(state, def).reason; }
  else if (state.player.cash < cost) { stateTag = 'CONDITIONAL'; reason = `need $${cost}`; }

  return {
    branch: def.branch, label: def.label, current,
    next: { rung, name: def.rungs[rung - 1], cost, incomeBump, heatDelta: def.heatDelta, prereq, state: stateTag, reason },
  };
}

export interface ViceUpgradeResult { ok: boolean; reason: string; rung?: number; }

/**
 * Climb the next vice rung on an operation the player owns: pay the cost, raise its base income by
 * the branch's bump and shift its heat, and record the branch/rung. Pure (mutates state). Gated by
 * the ladder's READY/CONDITIONAL/LOCKED state.
 */
export function applyViceUpgrade(state: GameState, businessId: string): ViceUpgradeResult {
  const ladder = viceLadder(state, businessId);
  if (!ladder || !ladder.next) return { ok: false, reason: ladder ? 'maxed' : 'no such racket' };
  const n = ladder.next;
  if (n.state === 'LOCKED') return { ok: false, reason: n.reason };
  if (n.state === 'CONDITIONAL') return { ok: false, reason: n.reason };

  const found = findBusiness(state, businessId)!;
  const b: Business = found.business;
  const p = findFamily(state, state.player.id)!;
  p.cash -= n.cost;
  clampDirty(p);
  b.baseIncome += n.incomeBump;
  b.heatPerTick = Math.max(0, b.heatPerTick + n.heatDelta);
  b.viceBranch = ladder.branch ?? undefined;
  b.viceRung = n.rung;

  state.log.push({
    tick: state.tick,
    kind: 'vice-upgrade',
    message: `${p.name} upgraded a ${ladder.label} racket → ${n.name} (+$${n.incomeBump}/wk, ${n.heatDelta >= 0 ? '+' : ''}${n.heatDelta} heat)`,
    data: { businessId, branch: ladder.branch, rung: n.rung, cost: n.cost },
  });
  return { ok: true, reason: 'ok', rung: n.rung };
}
