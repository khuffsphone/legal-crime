// Hits & conflict resolution. The strength and casualty math is pure and exactly
// testable; `resolveConflict` (tick step 6) applies seeded combat variance and processes
// the queued hits.

import {
  HIT_CLOSE_MARGIN,
  HIT_HEAT,
  HIT_ROUT_MARGIN,
  HIT_VARIANCE_MIN,
  HEAT_MAX,
} from './constants';
import { Rng } from './rng';
import { findFamily, type Family, type GameState } from './types';

/** Raw combat strength of a family: the summed skill of its gangsters. */
export function familyStrength(family: Family): number {
  return family.gangsters.reduce((sum, g) => sum + g.skill, 0);
}

export interface CasualtyOutcome {
  attackerWins: boolean;
  attackerLosses: number;
  defenderLosses: number;
  margin: number;
}

/**
 * Decide a fight's casualties from the two effective strengths and roster sizes. Pure and
 * deterministic. Ties go to the attacker (aggressor's edge). The loser takes 1 casualty,
 * or 2 in a rout (margin > HIT_ROUT_MARGIN); the winner also loses 1 in a close fight
 * (margin < HIT_CLOSE_MARGIN). Losses are clamped to roster size.
 */
export function decideCasualties(
  effAtt: number,
  effDef: number,
  attackerRoster: number,
  defenderRoster: number,
): CasualtyOutcome {
  const attackerWins = effAtt >= effDef;
  const hi = Math.max(effAtt, effDef);
  const lo = Math.min(effAtt, effDef);
  const margin = hi <= 0 ? 0 : (hi - lo) / hi;

  const loserBase = 1 + (margin > HIT_ROUT_MARGIN ? 1 : 0);
  const winnerBase = margin < HIT_CLOSE_MARGIN ? 1 : 0;

  let attackerLosses: number;
  let defenderLosses: number;
  if (attackerWins) {
    defenderLosses = Math.min(defenderRoster, loserBase);
    attackerLosses = Math.min(attackerRoster, winnerBase);
  } else {
    attackerLosses = Math.min(attackerRoster, loserBase);
    defenderLosses = Math.min(defenderRoster, winnerBase);
  }
  return { attackerWins, attackerLosses, defenderLosses, margin };
}

/** Remove the `count` lowest-skill gangsters from a family (deterministic). */
function removeWeakest(family: Family, count: number): void {
  if (count <= 0) return;
  const ordered = [...family.gangsters].sort((a, b) => a.skill - b.skill);
  const doomed = new Set(ordered.slice(0, count).map((g) => g.id));
  family.gangsters = family.gangsters.filter((g) => !doomed.has(g.id));
}

/** Kill a family's boss (eliminating it); flags a player loss if it is the player. */
function killBoss(state: GameState, family: Family, cause: string): void {
  family.alive = false;
  state.log.push({
    tick: state.tick,
    kind: 'boss-killed',
    message: `${family.name}'s boss was killed (${cause})`,
    data: { familyId: family.id, cause },
  });
  if (family.isPlayer) {
    state.status = 'lost';
    state.lossReason = 'dead';
  }
}

/**
 * Step 6 of the tick: resolve every queued hit in order, then clear the queue. Each hit
 * draws two variance multipliers from the shared RNG (attacker then defender). A family
 * left with no gangsters after losing the fight has its boss killed.
 */
export function resolveConflict(state: GameState): void {
  if (state.pendingHits.length === 0) return;

  const rng = new Rng(state.rngState);

  for (const hit of state.pendingHits) {
    const attacker = findFamily(state, hit.attackerId);
    const target = findFamily(state, hit.targetId);
    if (!attacker || !target || !attacker.alive || !target.alive) continue;

    const attStrength = familyStrength(attacker);
    const defStrength = familyStrength(target);
    const effAtt = attStrength * (HIT_VARIANCE_MIN + rng.nextFloat());
    const effDef = defStrength * (HIT_VARIANCE_MIN + rng.nextFloat());

    const outcome = decideCasualties(
      effAtt,
      effDef,
      attacker.gangsters.length,
      target.gangsters.length,
    );

    removeWeakest(attacker, outcome.attackerLosses);
    removeWeakest(target, outcome.defenderLosses);

    // Ordering a hit is loud.
    attacker.heat = Math.min(HEAT_MAX, attacker.heat + HIT_HEAT);

    state.log.push({
      tick: state.tick,
      kind: 'hit-resolved',
      message: `${attacker.name} hit ${target.name}: ${
        outcome.attackerWins ? 'attacker prevailed' : 'defender held'
      } (att -${outcome.attackerLosses}, def -${outcome.defenderLosses})`,
      data: {
        attackerId: attacker.id,
        targetId: target.id,
        ...outcome,
      },
    });

    // A side left with no muscle after losing exposes its boss.
    const loser = outcome.attackerWins ? target : attacker;
    if (loser.gangsters.length === 0) {
      killBoss(state, loser, 'overrun in a hit');
    }
  }

  state.pendingHits = [];
  state.rngState = rng.state;
}
