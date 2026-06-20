// RTS-6 — real-time presentation selectors. Pure & deterministic; imports NO Phaser. Turns the
// live GameState + the real-time clock into a HUD view-model: the week-timer countdown, every
// family's federal-exposure / warning-ladder state, mutiny risk, and active shocks. The Phaser
// HUD reads ONLY this (and the noir theme for flavor) — it never recomputes sim logic. All the
// underlying numbers come from the EXISTING federal / mutiny / shock / laundering selectors, so
// the HUD surfaces the same logic the tick resolves.

import { WEEK_DURATION_SECONDS } from './constants';
import { secondsUntilNextWeek, weekProgress } from './clock';
import { federalExposure, fedWarningTier, fedWarningMessage } from './federal';
import { atRiskCount, mutinyConditionMet } from './gangsters';
import { cleanCash } from './laundering';
import { allFamilies, type Family, type GameState, type GameStatus, type LossReason } from './types';

export interface FamilyHudView {
  familyId: string;
  name: string;
  isPlayer: boolean;
  cash: number;
  cleanCash: number;
  dirtyCash: number;
  heat: number;
  debt: number;
  /** Federal exposure 0..100 and its warning tier 0..3 (the 50/70/85 ladder). */
  federalExposure: number;
  federalTier: number;
  /** Terse warning message for the current tier ('' at tier 0). */
  federalMessage: string;
  bustArmed: boolean;
  /** Gangsters below the desertion-loyalty line, and whether a coordinated mutiny is primed. */
  mutinyRisk: number;
  mutinyImminent: boolean;
  crew: number;
}

export interface ShockHudView {
  kind: string;
  ticksRemaining: number;
}

export interface HudView {
  week: number;
  status: GameStatus;
  lossReason?: LossReason;
  /** Real seconds until the next week settlement, and progress [0,1] toward it. */
  secondsUntilNextWeek: number;
  weekProgress: number;
  /** "M:SS" countdown to the next settlement. */
  weekCountdownLabel: string;
  player: FamilyHudView;
  rivals: FamilyHudView[];
  shocks: ShockHudView[];
}

/** Format a seconds value as a "M:SS" countdown (negatives clamp to 0:00). */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** The HUD snapshot for one family — federal ladder + mutiny risk + the money ledger. */
export function familyHudView(family: Family): FamilyHudView {
  const exposure = federalExposure(family);
  const tier = fedWarningTier(exposure);
  return {
    familyId: family.id,
    name: family.name,
    isPlayer: family.isPlayer,
    cash: family.cash,
    cleanCash: cleanCash(family),
    dirtyCash: family.dirtyCash,
    heat: family.heat,
    debt: family.debt,
    federalExposure: exposure,
    federalTier: tier,
    federalMessage: fedWarningMessage(tier),
    bustArmed: family.bustArmed,
    mutinyRisk: atRiskCount(family),
    mutinyImminent: mutinyConditionMet(family),
    crew: family.gangsters.length,
  };
}

/**
 * The full real-time HUD view-model. `weekDuration` (defaults to WEEK_DURATION_SECONDS) drives
 * the countdown so the HUD reflects the configured pace. Pure — never mutates state.
 */
export function realtimeHudView(
  state: GameState,
  weekDuration: number = WEEK_DURATION_SECONDS,
): HudView {
  const secs = secondsUntilNextWeek(state, weekDuration);
  return {
    week: state.tick,
    status: state.status,
    lossReason: state.lossReason,
    secondsUntilNextWeek: secs,
    weekProgress: weekProgress(state, weekDuration),
    weekCountdownLabel: formatCountdown(secs),
    player: familyHudView(state.player),
    rivals: state.rivals.map(familyHudView),
    shocks: state.activeShocks.map((s) => ({ kind: s.kind, ticksRemaining: s.ticksRemaining })),
  };
}

/** The most urgent federal line to surface for the player (or null when clear) — convenience
 * for the HUD banner. */
export function topFederalWarning(state: GameState): { tier: number; message: string } | null {
  const tier = fedWarningTier(federalExposure(state.player));
  if (tier <= 0) return null;
  return { tier, message: fedWarningMessage(tier) };
}

/** Whether ANY family is primed to mutiny (for an alert pip). */
export function anyMutinyPrimed(state: GameState): boolean {
  return allFamilies(state).some(mutinyConditionMet);
}
