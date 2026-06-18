// Heat decay, bribery effects, and police raids. The probability helpers are pure and
// exactly testable; `resolveLaw` is the tick step that rolls raids (seeded) and applies
// decay. Draws from the shared RNG only for families at or above the raid threshold, so
// low-heat ticks leave the cursor untouched.

import {
  BRIBE_DECAY_PER_LEVEL,
  BRIBE_MAX_MITIGATION,
  BRIBE_MITIGATION_PER_LEVEL,
  BUST_HEAT,
  HEAT_DECAY,
  HEAT_MAX,
  RAID_CASH_SEIZE_FRACTION,
  RAID_HEAT_RELIEF,
  RAID_MAX_CHANCE,
  RAID_THRESHOLD,
} from './constants';
import { bustAvoidChance } from './bribery';
import { Rng } from './rng';
import { allFamilies, type Family, type GameState } from './types';

/**
 * Base raid probability from heat alone: zero below RAID_THRESHOLD, rising linearly to
 * RAID_MAX_CHANCE at HEAT_MAX.
 */
export function raidBaseChance(heat: number): number {
  if (heat < RAID_THRESHOLD) return 0;
  const span = HEAT_MAX - RAID_THRESHOLD;
  const frac = Math.min(1, (heat - RAID_THRESHOLD) / span);
  return frac * RAID_MAX_CHANCE;
}

/** Raid-chance reduction from a standing bribe, capped at BRIBE_MAX_MITIGATION. */
export function bribeMitigation(bribeLevel: number): number {
  return Math.min(BRIBE_MAX_MITIGATION, Math.max(0, bribeLevel) * BRIBE_MITIGATION_PER_LEVEL);
}

/** Effective raid probability after bribery. */
export function raidChance(heat: number, bribeLevel: number): number {
  return raidBaseChance(heat) * (1 - bribeMitigation(bribeLevel));
}

/** Extra heat decay each tick granted by a standing bribe. */
export function bribeDecayBonus(bribeLevel: number): number {
  return Math.floor(Math.max(0, bribeLevel) * BRIBE_DECAY_PER_LEVEL);
}

/** Total heat decay per tick for a family (base plus bribe bonus). */
export function effectiveDecay(bribeLevel: number): number {
  return HEAT_DECAY + bribeDecayBonus(bribeLevel);
}

/** All illegal operations owned by a family, with their district, for raid seizure. */
function ownedOperations(state: GameState, familyId: string) {
  const out: { districtIndex: number; businessIndex: number }[] = [];
  state.districts.forEach((d, di) => {
    d.businesses.forEach((b, bi) => {
      if (b.kind !== 'front' && b.ownerFamily === familyId) {
        out.push({ districtIndex: di, businessIndex: bi });
      }
    });
  });
  return out;
}

/** Resolve a raid that has already been determined to fire against `family`. */
function resolveRaid(state: GameState, family: Family, rng: Rng): void {
  if (family.heat >= BUST_HEAT && family.bustArmed) {
    // Judges (Phase 13) buy a chance to spring the boss, downgrading a fatal bust to a
    // severe seizure. The roll is only drawn when judges are actually retained.
    const avoid = bustAvoidChance(family.bribes.judges);
    const saved = avoid > 0 && rng.chance(avoid);
    if (!saved) {
      family.alive = false;
      state.log.push({
        tick: state.tick,
        kind: 'raid-bust',
        message: `${family.name}'s boss was busted in a raid (heat ${family.heat})`,
        data: { familyId: family.id, heat: family.heat },
      });
      if (family.isPlayer) {
        state.status = 'lost';
        state.lossReason = 'busted';
      }
      return;
    }
    state.log.push({
      tick: state.tick,
      kind: 'raid-averted',
      message: `${family.name}'s judges sprang the boss — the bust became a seizure`,
      data: { familyId: family.id, heat: family.heat },
    });
    // fall through to a non-bust seizure
  } else if (family.heat >= BUST_HEAT && family.isPlayer) {
    // Bust-level heat, but the bust is not yet armed (Phase 18): the danger has not been
    // telegraphed to its terminal point, so the raid lands as a seizure, not a bust.
    state.log.push({
      tick: state.tick,
      kind: 'bust-withheld',
      message: `${family.name} weathered a federal raid — for now`,
      data: { familyId: family.id, heat: family.heat },
    });
  }

  // Non-bust raid: either seize an operation or seize cash.
  const ops = ownedOperations(state, family.id);
  const seizeOp = rng.nextInt(0, 1) === 1 && ops.length > 0;

  if (seizeOp) {
    const target = ops[0];
    const removed = state.districts[target.districtIndex].businesses.splice(
      target.businessIndex,
      1,
    )[0];
    state.log.push({
      tick: state.tick,
      kind: 'raid-operation',
      message: `Police shut down ${family.name}'s ${removed.name}`,
      data: { familyId: family.id, businessId: removed.id },
    });
  } else {
    const seized = family.cash > 0 ? Math.floor(family.cash * RAID_CASH_SEIZE_FRACTION) : 0;
    family.cash -= seized;
    state.log.push({
      tick: state.tick,
      kind: 'raid-cash',
      message: `Police seized $${seized} from ${family.name}`,
      data: { familyId: family.id, seized },
    });
  }

  // A raid lets off pressure.
  family.heat = Math.floor(family.heat * (1 - RAID_HEAT_RELIEF));
}

/**
 * Step 7 of the tick: roll raids against each living family at or above the raid
 * threshold, then decay heat (base + bribe bonus, floored at 0).
 */
export function resolveLaw(state: GameState): void {
  const rng = new Rng(state.rngState);

  for (const family of allFamilies(state)) {
    if (!family.alive) continue;

    // Phase 13: the Police channel mitigates raid chance; Politicians speed heat decay.
    const chance = raidChance(family.heat, family.bribes.police);
    if (chance > 0 && rng.chance(chance)) {
      resolveRaid(state, family, rng);
    }

    family.heat = Math.max(
      0,
      Math.min(HEAT_MAX, family.heat - effectiveDecay(family.bribes.politicians)),
    );
  }

  state.rngState = rng.state;
}
