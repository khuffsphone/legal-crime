// Rival AI. Each living rival family evaluates a small set of candidate actions, scored
// deterministically from its state, and takes the highest-scoring one (a small seeded
// jitter breaks ties). Pure & deterministic — all randomness draws from the shared RNG.

import {
  AI_BRIBE_AMOUNT,
  AI_BRIBE_HEAT_THRESHOLD,
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
import type { Command } from './commands';
import { applyCommand } from './commands';
import { Rng } from './rng';
import { controlOf } from './territory';
import type { District, Family, GameState, OperationKind } from './types';

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

  // Expand control toward holding the stronghold.
  if (rival.cash >= EXPAND_COST) {
    const stronghold = strongholdDistrict(state, rival.id);
    const needsHolding = controlOf(stronghold, rival.id) < CONTROL_HOLD ? 10 : 0;
    out.push({
      command: { type: 'expandControl', familyId: rival.id, districtId: stronghold.id },
      base: AI_EXPAND_BASE + needsHolding,
    });
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
