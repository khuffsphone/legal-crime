import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  rivalCandidates,
  chooseRivalAction,
  resolveRivalAI,
  strongholdDistrict,
  affordableOperation,
} from '../src/sim/ai';
import { Rng } from '../src/sim/rng';
import {
  AI_RECRUIT_BASE,
  AI_RECRUIT_PER_GANGSTER,
  AI_OP_BASE,
  OPERATION_COST,
  EXPAND_COST,
} from '../src/sim/constants';
import type { Family, Gangster } from '../src/sim/types';

function rival(s: ReturnType<typeof createInitialState>): Family {
  return s.rivals[0]; // rival-a, home turf district-2
}

function gangster(id: string): Gangster {
  return { id, name: id, skill: 5, loyalty: 60, upkeep: 50, assignment: { type: 'idle' } };
}

describe('affordableOperation', () => {
  it('returns the most expensive affordable operation kind', () => {
    expect(affordableOperation(OPERATION_COST.smuggling)).toBe('smuggling');
    expect(affordableOperation(OPERATION_COST.speakeasy)).toBe('speakeasy');
    expect(affordableOperation(OPERATION_COST.numbers)).toBe('numbers');
    expect(affordableOperation(OPERATION_COST.numbers - 1)).toBeUndefined();
  });
});

describe('strongholdDistrict', () => {
  it('returns the rival home turf where it has the most control', () => {
    const s = createInitialState(1);
    expect(strongholdDistrict(s, 'rival-a').id).toBe('district-2'); // seeded 40 there
  });
});

describe('rivalCandidates — deterministic base scores', () => {
  it('scores recruit highest with a thin roster and only cheap actions affordable', () => {
    const s = createInitialState(1);
    const r = rival(s);
    r.cash = 450; // >= RECRUIT_COST(300), < op cheapest(500); expand(250) ok; heat 0
    r.heat = 0;
    r.gangsters = [];
    const cands = rivalCandidates(s, r);
    const recruit = cands.find((c) => c.command.type === 'recruitGangster');
    expect(recruit?.base).toBe(AI_RECRUIT_BASE); // 0 gangsters
    // op not affordable; bribe not valid; expand present
    expect(cands.some((c) => c.command.type === 'establishOperation')).toBe(false);
    expect(cands.some((c) => c.command.type === 'expandControl')).toBe(true);
  });

  it('scores operation when the roster is already staffed', () => {
    const s = createInitialState(1);
    const r = rival(s);
    r.cash = 2000;
    r.heat = 0;
    r.gangsters = [gangster('g1'), gangster('g2'), gangster('g3')];
    const cands = rivalCandidates(s, r);
    const recruitBase = cands.find((c) => c.command.type === 'recruitGangster')!.base;
    const opBase = cands.find((c) => c.command.type === 'establishOperation')!.base;
    expect(recruitBase).toBe(AI_RECRUIT_BASE - 3 * AI_RECRUIT_PER_GANGSTER); // 15
    expect(opBase).toBe(AI_OP_BASE); // 0 ops -> 45, clearly above recruit 15
  });

  it('offers a bribe only when heat is above the threshold', () => {
    const s = createInitialState(1);
    const r = rival(s);
    r.cash = 2000;
    r.heat = 80;
    const cands = rivalCandidates(s, r);
    const bribe = cands.find((c) => c.command.type === 'bribe');
    expect(bribe?.base).toBe(80);
  });

  it('returns no candidates when nothing is affordable and heat is low', () => {
    const s = createInitialState(1);
    const r = rival(s);
    r.cash = EXPAND_COST - 1; // below the cheapest action
    r.heat = 0;
    expect(rivalCandidates(s, r)).toHaveLength(0);
  });
});

describe('chooseRivalAction — picks the dominant action', () => {
  it('chooses bribe when heat is very high', () => {
    const s = createInitialState(1);
    const r = rival(s);
    r.cash = 2000;
    r.heat = 90; // base 90, dwarfs others + jitter(<=8)
    const cmd = chooseRivalAction(s, r, new Rng(s.rngState));
    expect(cmd?.type).toBe('bribe');
  });

  it('chooses recruit with empty roster and only cheap actions', () => {
    const s = createInitialState(1);
    const r = rival(s);
    r.cash = 450;
    r.heat = 0;
    r.gangsters = [];
    const cmd = chooseRivalAction(s, r, new Rng(s.rngState));
    expect(cmd?.type).toBe('recruitGangster'); // 60 vs expand 40 (+holding) -> gap > jitter
  });

  it('chooses the only affordable action (expand) when funds are tight', () => {
    const s = createInitialState(1);
    const r = rival(s);
    r.cash = EXPAND_COST; // only expand affordable
    r.heat = 0;
    r.gangsters = [gangster('g1')];
    const cmd = chooseRivalAction(s, r, new Rng(s.rngState));
    expect(cmd?.type).toBe('expandControl');
  });

  it('returns null when no action is available', () => {
    const s = createInitialState(1);
    const r = rival(s);
    r.cash = 0;
    r.heat = 0;
    expect(chooseRivalAction(s, r, new Rng(s.rngState))).toBeNull();
  });
});

describe('resolveRivalAI — applies actions and stays deterministic', () => {
  it('a rival actually acts: recruiting reduces cash and grows the roster', () => {
    const s = createInitialState(1);
    const r = rival(s);
    r.cash = 450;
    r.heat = 0;
    r.gangsters = [];
    resolveRivalAI(s);
    // recruit chosen -> roster grew and cash dropped
    expect(r.gangsters.length).toBe(1);
    expect(r.cash).toBeLessThan(450);
  });

  it('draws from the shared RNG (advances the cursor)', () => {
    const s = createInitialState(1);
    s.rivals.forEach((rv) => (rv.cash = 2000));
    const cursor = s.rngState;
    resolveRivalAI(s);
    expect(s.rngState).not.toBe(cursor);
  });

  it('is deterministic: same seed yields a deeply equal state', () => {
    const build = (seed: number) => {
      const s = createInitialState(seed);
      s.rivals.forEach((rv) => (rv.cash = 2000));
      resolveRivalAI(s);
      return s;
    };
    expect(build(9)).toEqual(build(9));
  });

  it('skips dead rivals', () => {
    const s = createInitialState(1);
    s.rivals[0].alive = false;
    s.rivals[0].cash = 2000;
    const before = s.rivals[0].gangsters.length;
    resolveRivalAI(s);
    expect(s.rivals[0].gangsters.length).toBe(before); // untouched
  });
});
