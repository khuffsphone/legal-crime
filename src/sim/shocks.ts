// Systemic shocks (Phase 16). A seeded world-event system that stresses every signature
// mechanic at once. Disabled by default (state.shocksEnabled); real games turn it on. When
// disabled, resolveShocks is a no-op and draws no RNG, so isolated unit tests are unaffected.

import {
  AUDIT_FED_SHIELD_PER_LEVEL,
  AUDIT_SEIZE_FRACTION,
  BOOM_MULT,
  BUST_MULT,
  CRACKDOWN_HEAT,
  HEAT_MAX,
  SHOCK_CHANCE,
  SHOCK_DURATION,
} from './constants';
import { clampDirty } from './laundering';
import { Rng } from './rng';
import { allFamilies, type ActiveShock, type GameState, type ShockKind } from './types';

/** Shock kinds that persist for a duration (vs. instantaneous ones). */
const DURATIONAL: ReadonlySet<ShockKind> = new Set<ShockKind>(['crackdown', 'boom', 'bust']);

/** The full shock table, picked from uniformly when a shock fires. */
export const SHOCK_KINDS: readonly ShockKind[] = [
  'crackdown',
  'boom',
  'bust',
  'audit',
  'gangWar',
  'speakeasyRaid',
];

/** The income multiplier currently imposed by active boom/bust shocks (1 if none). */
export function incomeShockMultiplier(state: GameState): number {
  let mult = 1;
  for (const s of state.activeShocks) {
    if (s.kind === 'boom') mult *= BOOM_MULT;
    else if (s.kind === 'bust') mult *= BUST_MULT;
  }
  return mult;
}

/** Audit shield fraction from the Feds bribe channel (capped at 1). */
export function fedShield(feds: number): number {
  return Math.min(1, Math.max(0, feds) * AUDIT_FED_SHIELD_PER_LEVEL);
}

/** Dirty cash a federal audit seizes from a family given its feds bribe. Pure. */
export function auditSeizure(dirtyCash: number, feds: number): number {
  if (dirtyCash <= 0) return 0;
  return Math.floor(dirtyCash * AUDIT_SEIZE_FRACTION * (1 - fedShield(feds)));
}

function applyAudit(state: GameState): void {
  for (const family of allFamilies(state)) {
    const seized = auditSeizure(family.dirtyCash, family.bribes.feds);
    if (seized <= 0) continue;
    family.cash -= seized; // dirty money is confiscated; clean (laundered) money survives
    family.dirtyCash -= seized;
    clampDirty(family);
    state.log.push({
      tick: state.tick,
      kind: 'shock-audit-seizure',
      message: `Federal audit seized $${seized} of dirty cash from ${family.name}`,
      data: { familyId: family.id, seized },
    });
  }
}

function applyGangWar(state: GameState): void {
  // Every living rival with muscle moves on the player; hits resolve at the conflict step.
  for (const rival of state.rivals) {
    if (!rival.alive || rival.gangsters.length === 0) continue;
    state.pendingHits.push({ attackerId: rival.id, targetId: state.player.id, orderedTick: state.tick });
  }
}

function applySpeakeasyRaid(state: GameState): void {
  for (const district of state.districts) {
    const idx = district.businesses.findIndex((b) => b.kind !== 'front');
    if (idx >= 0) {
      const removed = district.businesses.splice(idx, 1)[0];
      state.log.push({
        tick: state.tick,
        kind: 'shock-speakeasy-raid',
        message: `A speakeasy raid shut down ${removed.name} in ${district.name}`,
        data: { businessId: removed.id, ownerFamily: removed.ownerFamily },
      });
      return;
    }
  }
}

/** Fire a shock of a given kind: instant shocks apply now; durational ones register. */
export function triggerShock(state: GameState, kind: ShockKind): void {
  state.log.push({
    tick: state.tick,
    kind: 'shock',
    message: `Systemic shock: ${kind}`,
    data: { shock: kind },
  });

  switch (kind) {
    case 'audit':
      applyAudit(state);
      return;
    case 'gangWar':
      applyGangWar(state);
      return;
    case 'speakeasyRaid':
      applySpeakeasyRaid(state);
      return;
    case 'crackdown':
    case 'boom':
    case 'bust':
      state.activeShocks.push({ kind, ticksRemaining: SHOCK_DURATION });
      return;
  }
}

/** Per-tick effect of an active durational shock. */
function applyOngoingShock(state: GameState, shock: ActiveShock): void {
  if (shock.kind === 'crackdown') {
    for (const family of allFamilies(state)) {
      family.heat = Math.min(HEAT_MAX, family.heat + CRACKDOWN_HEAT);
    }
  }
  // boom/bust act through incomeShockMultiplier at accrual time, not here.
}

/**
 * Step 0 of the tick (only when shocksEnabled): possibly fire a new shock, apply the per-tick
 * effects of all active durational shocks, then age and expire them. Draws one RNG value for
 * the trigger chance (and one to pick the kind) only when enabled.
 */
export function resolveShocks(state: GameState): void {
  if (!state.shocksEnabled) return;

  const rng = new Rng(state.rngState);

  if (rng.chance(SHOCK_CHANCE)) {
    const kind = rng.pick(SHOCK_KINDS);
    triggerShock(state, kind);
  }

  for (const shock of state.activeShocks) applyOngoingShock(state, shock);

  state.activeShocks = state.activeShocks
    .map((s) => ({ kind: s.kind, ticksRemaining: s.ticksRemaining - 1 }))
    .filter((s) => s.ticksRemaining > 0 && DURATIONAL.has(s.kind));

  state.rngState = rng.state;
}
