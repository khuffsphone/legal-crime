// RIVAL STRATEGY (lane A) — the four new behaviours at the STATE level (pure, no Phaser): rivals TARGET,
// DEFEND, ALLOCATE BRIBERY, and RETREAT UNDER HEAT. Plus the ai.ts integration: the overlay must surface the
// right EXISTING commands (expandControl retargeted, setBribe) without breaking the base AI contract.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  rivalPosture, postureDamp, districtToDefend, districtToAttack, bribeAllocation, canAffordBribe,
  RIVAL_STRATEGY_TUNING,
} from '../src/sim/rivalStrategy';
import { rivalCandidates, chooseRivalAction } from '../src/sim/ai';
import { Rng } from '../src/sim/rng';
import type { Family } from '../src/sim/types';

const T = RIVAL_STRATEGY_TUNING;
const rivalA = (s: ReturnType<typeof createInitialState>): Family => s.rivals.find((r) => r.id === 'rival-a')!;

// ── POSTURE — retreat under heat / federal pressure ──────────────────────────────────────────────────────
describe('rivalPosture — retreat under heat', () => {
  it('EXPANDs when cool and clean', () => {
    const s = createInitialState(1); const r = rivalA(s);
    r.heat = 0; r.dirtyCash = 0; r.fedWarningLevel = 0; r.bustArmed = false;
    expect(rivalPosture(r, T)).toBe('expand');
  });

  it('CONSOLIDATEs at moderate heat', () => {
    const s = createInitialState(1); const r = rivalA(s);
    r.heat = T.consolidateHeat; r.dirtyCash = 0; r.bustArmed = false;
    expect(rivalPosture(r, T)).toBe('consolidate');
  });

  it('RETREATs at high heat', () => {
    const s = createInitialState(1); const r = rivalA(s);
    r.heat = T.retreatHeat; r.dirtyCash = 0; r.bustArmed = false;
    expect(rivalPosture(r, T)).toBe('retreat');
  });

  it('RETREATs when a federal bust is armed, even while cool', () => {
    const s = createInitialState(1); const r = rivalA(s);
    r.heat = 0; r.dirtyCash = 0; r.bustArmed = true;
    expect(rivalPosture(r, T)).toBe('retreat');
  });

  it('postureDamp: offensive scores shrink off-posture, untouched while expanding', () => {
    expect(postureDamp('expand', T)).toBe(1);
    expect(postureDamp('consolidate', T)).toBe(T.consolidateDamp);
    expect(postureDamp('retreat', T)).toBe(T.retreatDamp);
    expect(T.retreatDamp).toBeLessThan(T.consolidateDamp); // retreat damps harder than consolidate
  });
});

// ── DEFEND — shore up a threatened hold ──────────────────────────────────────────────────────────────────
describe('districtToDefend — a threatened lead', () => {
  it('flags a district we lead where a challenger is within the gap', () => {
    const s = createInitialState(1); const d = s.districts[0];
    d.control = { 'rival-a': 40, 'rival-b': 35 }; // gap 5 ≤ defendGap
    expect(districtToDefend(s, 'rival-a', T)?.districtId).toBe(d.id);
  });

  it('ignores a comfortably-held district (challenger far below)', () => {
    const s = createInitialState(1); const d = s.districts[0];
    d.control = { 'rival-a': 40, 'rival-b': 5 }; // gap 35 > defendGap
    // (no other district seeds a rival-a lead in this fresh state)
    for (const x of s.districts) if (x !== d) x.control = {};
    expect(districtToDefend(s, 'rival-a', T)).toBeUndefined();
  });

  it('does not treat a district we are LOSING as a defend (challenger ahead)', () => {
    const s = createInitialState(1); const d = s.districts[0];
    for (const x of s.districts) x.control = {};
    d.control = { 'rival-a': 20, 'rival-b': 40 }; // we're behind here
    expect(districtToDefend(s, 'rival-a', T)).toBeUndefined();
  });
});

// ── TARGET — pick a district to push into ────────────────────────────────────────────────────────────────
describe('districtToAttack — targeting', () => {
  it('targets an uncontested district (a free push)', () => {
    const s = createInitialState(1);
    for (const x of s.districts) x.control = {};
    s.districts[3].control = { 'rival-a': 10 }; // only us, leader 0 → beatable
    expect(districtToAttack(s, 'rival-a', T)?.districtId).toBe(s.districts[3].id);
  });

  it('skips a district led far beyond our foothold (no hopeless attacks)', () => {
    const s = createInitialState(1);
    for (const x of s.districts) x.control = { 'rival-b': 60 }; // whole board strongly enemy-led (not beatable)
    s.districts[3].control = { 'rival-b': 60, 'rival-a': 5 }; // 5 < 60*0.6 → still not beatable
    expect(districtToAttack(s, 'rival-a', T)).toBeUndefined();
  });

  it('does not target a district we already hold', () => {
    const s = createInitialState(1);
    for (const x of s.districts) x.control = { 'rival-b': 60 }; // rest of board not beatable
    s.districts[3].control = { 'rival-a': 60 }; // we hold it (≥ CONTROL_HOLD) → must be skipped
    expect(districtToAttack(s, 'rival-a', T)).toBeUndefined();
  });
});

// ── ALLOCATE BRIBERY — channel by telegraphed federal tier ───────────────────────────────────────────────
describe('bribeAllocation — four-channel allocation under federal pressure', () => {
  const mk = (over: Partial<Family>): Family => {
    const s = createInitialState(1); const r = rivalA(s);
    r.bribes = { police: 0, judges: 0, politicians: 0, feds: 0 };
    Object.assign(r, over);
    return r;
  };
  it('no federal warning → no extra channel bribe (police stays the flat heat retainer)', () => {
    expect(bribeAllocation(mk({ fedWarningLevel: 0, bustArmed: false }), T)).toBeUndefined();
  });
  it('tier 1 (asking questions) → politicians (faster heat decay)', () => {
    expect(bribeAllocation(mk({ fedWarningLevel: 1 }), T)?.channel).toBe('politicians');
  });
  it('tier 2 (agents near fronts) → judges (survive a bust)', () => {
    expect(bribeAllocation(mk({ fedWarningLevel: 2 }), T)?.channel).toBe('judges');
  });
  it('tier 3 / bust armed → feds (shield the federal shock)', () => {
    expect(bribeAllocation(mk({ fedWarningLevel: 3 }), T)?.channel).toBe('feds');
    expect(bribeAllocation(mk({ fedWarningLevel: 0, bustArmed: true }), T)?.channel).toBe('feds');
  });
  it('steps the channel up from its current allocation, costing the delta', () => {
    const plan = bribeAllocation(mk({ fedWarningLevel: 2, bribes: { police: 0, judges: 10, politicians: 0, feds: 0 } }), T)!;
    expect(plan.amount).toBe(10 + T.bribeStep);
    expect(plan.delta).toBe(T.bribeStep);
    expect(canAffordBribe({ ...mk({}), cash: T.bribeStep }, plan)).toBe(true);
    expect(canAffordBribe({ ...mk({}), cash: T.bribeStep - 1 }, plan)).toBe(false);
  });
});

// ── INTEGRATION — ai.ts surfaces the right EXISTING commands ─────────────────────────────────────────────
describe('ai.ts integration — strategy drives real commands', () => {
  it('DEFEND: the expand candidate retargets the threatened hold with a defend bonus, and wins', () => {
    const s = createInitialState(1); const r = rivalA(s);
    r.cash = 2000; r.heat = 0; r.fedWarningLevel = 0;
    for (const x of s.districts) x.control = {};
    s.districts[0].control = { 'rival-a': 40, 'rival-b': 35 }; // threatened lead (gap 5)
    const cands = rivalCandidates(s, r);
    const expand = cands.find((c) => c.command.type === 'expandControl')!;
    expect(expand.command.type === 'expandControl' && expand.command.districtId).toBe(s.districts[0].id);
    expect(expand.base).toBe(30 + 10 + 30); // AI_EXPAND_BASE + needsHolding(<50) + AI_DEFEND_BONUS
    expect(chooseRivalAction(s, r, new Rng(s.rngState))?.type).toBe('expandControl');
  });

  it('BRIBERY: under an armed federal bust the rival emits a setBribe to feds, and it dominates', () => {
    const s = createInitialState(1); const r = rivalA(s);
    r.cash = 2000; r.heat = 0; r.fedWarningLevel = 3; r.bribes = { police: 0, judges: 0, politicians: 0, feds: 0 };
    const cands = rivalCandidates(s, r);
    const sb = cands.find((c) => c.command.type === 'setBribe');
    expect(sb).toBeDefined();
    expect(sb!.command.type === 'setBribe' && sb!.command.channel).toBe('feds');
    const cmd = chooseRivalAction(s, r, new Rng(s.rngState));
    expect(cmd?.type).toBe('setBribe');
  });

  it('RETREAT: high heat damps the offensive expand score (vs the same board when cool)', () => {
    const cool = createInitialState(1); const rc = rivalA(cool);
    rc.cash = 2000; rc.heat = 0; rc.fedWarningLevel = 0;
    const hot = createInitialState(1); const rh = rivalA(hot);
    rh.cash = 2000; rh.heat = T.retreatHeat; rh.fedWarningLevel = 0; // retreat posture
    const expandCool = rivalCandidates(cool, rc).find((c) => c.command.type === 'expandControl')!.base;
    const expandHot = rivalCandidates(hot, rh).find((c) => c.command.type === 'expandControl')!.base;
    expect(expandHot).toBeLessThan(expandCool); // offensive bet damped while retreating
    expect(expandHot).toBeCloseTo(expandCool * T.retreatDamp, 5);
  });

  it('the base AI contract is intact: a fresh cool rival still expands/recruits, never setBribe', () => {
    const s = createInitialState(1); const r = rivalA(s);
    r.cash = 2000; r.heat = 0; r.fedWarningLevel = 0;
    const cands = rivalCandidates(s, r);
    expect(cands.some((c) => c.command.type === 'setBribe')).toBe(false); // no federal warning → no channel bribe
    expect(cands.some((c) => c.command.type === 'expandControl')).toBe(true);
  });
});
