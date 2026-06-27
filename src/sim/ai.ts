// Rival AI. Each living rival family evaluates a small set of candidate actions, scored
// deterministically from its state, and takes the highest-scoring one (a small seeded
// jitter breaks ties). Pure & deterministic — all randomness draws from the shared RNG.

import {
  AI_BRIBE_AMOUNT,
  AI_BRIBE_HEAT_THRESHOLD,
  AI_COLLECT_BASE,
  AI_EXPAND_BASE,
  AI_JITTER,
  AI_OP_BASE,
  AI_OP_PER_OP,
  AI_RECRUIT_BASE,
  AI_RECRUIT_PER_GANGSTER,
  CONTROL_HOLD,
  EXPAND_COST,
  OPERATION_COST,
  RECRUIT_COST,
} from './constants';
import { pendingCollection } from './collection';
import type { Command } from './commands';
import { applyCommand } from './commands';
import { Rng } from './rng';
import { controlOf } from './territory';
import {
  rivalPosture, postureDamp, districtToDefend, districtToAttack, bribeAllocation, canAffordBribe,
  RIVAL_STRATEGY_TUNING,
} from './rivalStrategy';
import type { District, Family, GameState, OperationKind } from './types';

// Lane A (rival AI depth) — base scores for the strategic candidates the rivalStrategy overlay adds. Kept
// local (not in constants.ts) so the lane stays file-isolated. DEFEND outranks opportunistic expansion; a
// federal-pressure bribe outranks a fresh offensive bet (protect what you have before reaching further).
const AI_DEFEND_BONUS = 30;   // added to a defensive expandControl on a threatened hold
const AI_SETBRIBE_BASE = 55;  // base for a federal-pressure channel bribe (setBribe)
const AI_SETBRIBE_PER_TIER = 12; // +per federal warning tier (a looming bust is bought down hard)

/** The district where a family has the most uncollected takings waiting, if any. */
function richestPendingDistrict(
  state: GameState,
  familyId: string,
): { districtId: string; pending: number } | undefined {
  let best: { districtId: string; pending: number } | undefined;
  for (const d of state.districts) {
    const pending = pendingCollection(state, familyId, d.id);
    if (pending > 0 && (!best || pending > best.pending)) {
      best = { districtId: d.id, pending };
    }
  }
  return best;
}

/** Count of illegal operations a family owns. */
function ownedOperationCount(state: GameState, familyId: string): number {
  let n = 0;
  for (const d of state.districts) {
    for (const b of d.businesses) {
      if (b.kind !== 'front' && b.ownerFamily === familyId) n++;
    }
  }
  return n;
}

/** The district where a family holds the most control (its stronghold); ties → first. */
export function strongholdDistrict(state: GameState, familyId: string): District {
  let best = state.districts[0];
  let bestControl = controlOf(best, familyId);
  for (const d of state.districts) {
    const c = controlOf(d, familyId);
    if (c > bestControl) {
      best = d;
      bestControl = c;
    }
  }
  return best;
}

/** Most expensive operation kind the family can currently afford, if any. */
export function affordableOperation(cash: number): OperationKind | undefined {
  const byCostDesc = (Object.keys(OPERATION_COST) as OperationKind[]).sort(
    (a, b) => OPERATION_COST[b] - OPERATION_COST[a],
  );
  return byCostDesc.find((k) => cash >= OPERATION_COST[k]);
}

export interface ScoredAction {
  command: Command;
  base: number;
}

/**
 * The candidate actions available to a rival, with deterministic base scores (no RNG).
 * Only affordable / valid actions are included.
 */
export function rivalCandidates(state: GameState, rival: Family): ScoredAction[] {
  const out: ScoredAction[] = [];
  const nGang = rival.gangsters.length;
  const nOps = ownedOperationCount(state, rival.id);

  // Collect waiting takings — high priority, scaled by how big the pile is. Only a
  // candidate when there is something to collect (so it never appears in a fresh state).
  const rich = richestPendingDistrict(state, rival.id);
  if (rich) {
    out.push({
      command: { type: 'collect', familyId: rival.id, districtId: rich.districtId },
      base: AI_COLLECT_BASE + Math.min(40, Math.floor(rich.pending / 50)),
    });
  }

  // Bribe when heat is high enough and affordable.
  if (rival.heat > AI_BRIBE_HEAT_THRESHOLD && rival.cash >= AI_BRIBE_AMOUNT) {
    out.push({
      command: { type: 'bribe', familyId: rival.id, amount: AI_BRIBE_AMOUNT },
      base: rival.heat,
    });
  }

  // Recruit muscle; more valuable with a thin roster.
  if (rival.cash >= RECRUIT_COST) {
    out.push({
      command: { type: 'recruitGangster', familyId: rival.id },
      base: AI_RECRUIT_BASE - nGang * AI_RECRUIT_PER_GANGSTER,
    });
  }

  // Establish an operation; more valuable with few existing ones.
  const opKind = affordableOperation(rival.cash);
  if (opKind) {
    out.push({
      command: {
        type: 'establishOperation',
        familyId: rival.id,
        districtId: strongholdDistrict(state, rival.id).id,
        kind: opKind,
      },
      base: AI_OP_BASE - nOps * AI_OP_PER_OP,
    });
  }

  // Expand control — STRATEGICALLY TARGETED (lane A): DEFEND a threatened hold first, else push the best
  // attack TARGET while the posture allows it, else fall back to holding the stronghold (the prior behaviour).
  // Type + base are unchanged from before in the no-threat / expand case, so the base AI contract is preserved;
  // only the district chosen (and a defend bonus when a hold is slipping) changes.
  const posture = rivalPosture(rival, RIVAL_STRATEGY_TUNING);
  const defend = districtToDefend(state, rival.id, RIVAL_STRATEGY_TUNING);
  if (rival.cash >= EXPAND_COST) {
    const stronghold = strongholdDistrict(state, rival.id);
    const needsHolding = controlOf(stronghold, rival.id) < CONTROL_HOLD ? 10 : 0;
    const attack = posture === 'expand' ? districtToAttack(state, rival.id, RIVAL_STRATEGY_TUNING) : undefined;
    const targetId = defend?.districtId ?? attack?.districtId ?? stronghold.id;
    out.push({
      command: { type: 'expandControl', familyId: rival.id, districtId: targetId },
      base: AI_EXPAND_BASE + needsHolding + (defend ? AI_DEFEND_BONUS : 0),
    });
  }

  // Allocate bribery across the four channels under FEDERAL pressure (lane A). Police stays the flat heat
  // retainer above; this adds judges/feds/politicians via the existing setBribe slider, keyed to the
  // telegraphed federal warning. Only appears once a federal warning is active (fedWarningLevel ≥ 1).
  const plan = bribeAllocation(rival, RIVAL_STRATEGY_TUNING);
  if (plan && canAffordBribe(rival, plan)) {
    out.push({
      command: { type: 'setBribe', familyId: rival.id, channel: plan.channel, amount: plan.amount },
      base: AI_SETBRIBE_BASE + rival.fedWarningLevel * AI_SETBRIBE_PER_TIER,
    });
  }

  // RETREAT UNDER HEAT (lane A): damp OFFENSIVE bets (expand / establish) while consolidating or retreating, so
  // a hot rival stops reaching for new turf and leans on collecting + buying protection. Defensive expansion is
  // exempt (a threatened hold still scores its defend bonus); cooling actions (bribe/collect) are never damped.
  if (posture !== 'expand') {
    const damp = postureDamp(posture, RIVAL_STRATEGY_TUNING);
    for (const c of out) {
      if (c.command.type === 'establishOperation') c.base *= damp;
      // a DEFENSIVE expand (retargeted onto the threatened hold) is exempt — never damp shoring up a slipping hold.
      else if (c.command.type === 'expandControl' && c.command.districtId !== defend?.districtId) c.base *= damp;
    }
  }

  return out;
}

/**
 * Choose a rival's action: score each candidate (base + seeded jitter) and return the
 * max. Returns null when nothing is affordable. Advances the provided Rng.
 */
export function chooseRivalAction(
  state: GameState,
  rival: Family,
  rng: Rng,
): Command | null {
  const candidates = rivalCandidates(state, rival);
  if (candidates.length === 0) return null;

  let best: Command | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const score = c.base + rng.nextFloat() * AI_JITTER;
    if (score > bestScore) {
      bestScore = score;
      best = c.command;
    }
  }
  return best;
}

/**
 * Step 5 of the tick: every living rival takes its chosen action. The scoring jitter and
 * any command randomness share the single RNG cursor on state.
 */
export function resolveRivalAI(state: GameState): void {
  for (const rival of state.rivals) {
    if (!rival.alive) continue;

    const rng = new Rng(state.rngState);
    const command = chooseRivalAction(state, rival, rng);
    state.rngState = rng.state;

    if (command) applyCommand(state, command);
  }
}
