// Federal exposure & telegraphing (Phase 18). Makes the dirty-cash → heat → federal-bust
// danger chain legible: a queryable exposure level, escalating warnings, and a hard gate
// that forbids a terminal bust until the imminent warning has been outstanding for a tick.
// Pure & deterministic — no Phaser, no RNG.

import {
  DIRTY_EXPOSURE_CAP,
  DIRTY_EXPOSURE_DIVISOR,
  FED_MAX_WARN_LEVEL,
  FED_RELIEF_CAP,
  FED_RELIEF_PER_LEVEL,
  FED_WARN_TIER_1,
  FED_WARN_TIER_2,
  FED_WARN_TIER_3,
} from './constants';
import { allFamilies, type Family, type GameState } from './types';

/** Exposure points contributed by a dirty-cash hoard: floor(dirty / divisor), capped. */
export function dirtyExposurePoints(dirtyCash: number): number {
  if (dirtyCash <= 0) return 0;
  return Math.min(DIRTY_EXPOSURE_CAP, Math.floor(dirtyCash / DIRTY_EXPOSURE_DIVISOR));
}

/** Exposure relief bought by the The Bureau (feds) bribe, capped. */
export function fedExposureRelief(feds: number): number {
  return Math.min(FED_RELIEF_CAP, Math.max(0, feds) * FED_RELIEF_PER_LEVEL);
}

/** Federal exposure for a family: heat + dirty hoard − The Bureau relief, clamped [0,100]. */
export function federalExposure(family: Family): number {
  const raw = family.heat + dirtyExposurePoints(family.dirtyCash) - fedExposureRelief(family.bribes.feds);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** Warning tier (0..FED_MAX_WARN_LEVEL) for an exposure value. */
export function fedWarningTier(exposure: number): number {
  if (exposure >= FED_WARN_TIER_3) return 3;
  if (exposure >= FED_WARN_TIER_2) return 2;
  if (exposure >= FED_WARN_TIER_1) return 1;
  return 0;
}

/** Terse log message for a warning tier (richer noir flavor lives in the theme). */
export function fedWarningMessage(tier: number): string {
  switch (tier) {
    case 1:
      return 'The Bureau is asking questions about your books.';
    case 2:
      return 'Agents have been seen near your fronts.';
    case 3:
      return 'Word is a federal bust is imminent.';
    default:
      return '';
  }
}

/**
 * Tick step (before the law step): for every family, arm the bust if the imminent tier was
 * already reached on a prior tick, then escalate or de-escalate the warning level to match
 * current exposure. Player escalations emit a surfaced 'fed-warning' event. Deterministic,
 * draws no RNG. This is what guarantees a federal bust is telegraphed at least one tick
 * ahead — the law step only busts a family whose `bustArmed` is true.
 */
export function resolveFederalWarnings(state: GameState): void {
  for (const family of allFamilies(state)) {
    const exposure = federalExposure(family);
    const tier = fedWarningTier(exposure);
    const oldLevel = family.fedWarningLevel;

    // Arm the bust only when the imminent tier was reached on a PRIOR tick and still holds.
    if (oldLevel >= FED_MAX_WARN_LEVEL && tier >= FED_MAX_WARN_LEVEL && !family.bustArmed) {
      family.bustArmed = true;
      if (family.isPlayer) {
        state.log.push({
          tick: state.tick,
          kind: 'fed-armed',
          message: `The Bureau has the warrant. A bust can come at any time now.`,
          data: { familyId: family.id, exposure },
        });
      }
    }

    if (tier > oldLevel) {
      family.fedWarningLevel = tier;
      if (family.isPlayer) {
        state.log.push({
          tick: state.tick,
          kind: 'fed-warning',
          message: fedWarningMessage(tier),
          data: { familyId: family.id, tier, exposure },
        });
      }
    } else if (tier < oldLevel) {
      family.fedWarningLevel = tier;
      // Cooling off below the imminent tier disarms the bust — the danger recedes.
      if (tier < FED_MAX_WARN_LEVEL && family.bustArmed) {
        family.bustArmed = false;
        if (family.isPlayer) {
          state.log.push({
            tick: state.tick,
            kind: 'fed-cooldown',
            message: `Federal heat is cooling — the Bureau backs off for now.`,
            data: { familyId: family.id, tier, exposure },
          });
        }
      }
    }
  }
}
