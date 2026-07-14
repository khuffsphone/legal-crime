// RIVAL ARCHETYPE tuning hooks — the four additive, default-safe per-rival knobs that give each rival a
// distinct AI "personality" (rivalArchetype.ts), asserted at the LOGIC level (pure, no Phaser):
//   1. per-rival aggression constants (AGGRO_ON_ATTACK / AGGRO_DECAY / AGGRO_HQ_STRIKE),
//   2. the fixed federal bribe-channel ladder → a per-rival WEIGHTED table,
//   3. a per-candidate score MULTIPLIER over ai.ts's base scores,
//   4. a `familyArchetype` name → a RIVAL_ARCHETYPES preset bundle.
// Every hook is proven TWICE: (a) BYTE-IDENTICAL baseline — an untuned rival resolves to the exact prior
// value / behaviour; (b) MUTATION — setting an override changes the resolved value AND the AI behaviour that
// consumes it (through the real offense / strategy-pulse / rivalCandidates code, not just the resolver).
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  AGGRO_ON_ATTACK, AGGRO_DECAY, AGGRO_HQ_STRIKE,
} from '../src/sim/constants';
import {
  aggroOnAttackFor, aggroDecayFor, aggroHqStrikeFor,
  chooseBribeChannel, bribePressureTier,
  candidateBiasFor, RIVAL_ARCHETYPES, DEFAULT_BRIBE_WEIGHTS, BRIBE_CHANNEL_UNLOCK_TIER,
} from '../src/sim/rivalArchetype';
import { bribeAllocation } from '../src/sim/rivalStrategy';
import { resolveStrategicPulse } from '../src/sim/strategy';
import { resolveLockout } from '../src/sim/offense';
import { rivalCandidates, chooseRivalAction } from '../src/sim/ai';
import { Rng } from '../src/sim/rng';
import type { Family, Gangster, RivalCandidateKind } from '../src/sim/types';

const rivalA = (s: ReturnType<typeof createInitialState>): Family => s.rivals.find((r) => r.id === 'rival-a')!;
const ALL_KINDS: RivalCandidateKind[] =
  ['collect', 'bribe', 'recruitGangster', 'establishOperation', 'expandControl', 'setBribe'];
const gang = (id: string, skill: number): Gangster =>
  ({ id, name: id, skill, loyalty: 70, upkeep: 0, assignment: { type: 'idle' } });

// ── (a) BYTE-IDENTICAL BASELINE — an untuned rival resolves to exactly the prior globals/ladder/×1 ──────────
describe('baseline is byte-identical — no override, no archetype', () => {
  it('the aggro resolvers return the global constants for a plain rival', () => {
    const r = rivalA(createInitialState(1));
    expect(aggroOnAttackFor(r)).toBe(AGGRO_ON_ATTACK); // 40
    expect(aggroDecayFor(r)).toBe(AGGRO_DECAY);         // 8
    expect(aggroHqStrikeFor(r)).toBe(AGGRO_HQ_STRIKE);  // 60
  });

  it('chooseBribeChannel reproduces the fixed ladder exactly (the historical if/else)', () => {
    const mk = (over: Partial<Family>): Family => {
      const r = rivalA(createInitialState(1));
      r.bribes = { police: 0, judges: 0, politicians: 0, feds: 0 };
      Object.assign(r, over);
      return r;
    };
    expect(chooseBribeChannel(mk({ fedWarningLevel: 0, bustArmed: false }))).toBeUndefined();
    expect(chooseBribeChannel(mk({ fedWarningLevel: 1 }))).toBe('politicians');
    expect(chooseBribeChannel(mk({ fedWarningLevel: 2 }))).toBe('judges');
    expect(chooseBribeChannel(mk({ fedWarningLevel: 3 }))).toBe('feds');
    expect(chooseBribeChannel(mk({ fedWarningLevel: 0, bustArmed: true }))).toBe('feds');
    // police is never a candidate — it is the flat heat retainer, handled in ai.ts.
    expect(BRIBE_CHANNEL_UNLOCK_TIER.police).toBeUndefined();
    // the default weights are what make the ladder emerge (highest-weighted UNLOCKED channel per tier).
    expect(DEFAULT_BRIBE_WEIGHTS).toEqual({ politicians: 1, judges: 2, feds: 3 });
  });

  it('candidateBiasFor is ×1 for every candidate kind on a plain rival', () => {
    const r = rivalA(createInitialState(1));
    for (const k of ALL_KINDS) expect(candidateBiasFor(r, k)).toBe(1);
    expect(candidateBiasFor(r, 'someUnknownKind')).toBe(1); // unknown kinds resolve to ×1 too
  });

  it('bribePressureTier mirrors the ladder gate (0 = no pressure, 3 = bust armed / imminent)', () => {
    const mk = (over: Partial<Family>): Family => Object.assign(rivalA(createInitialState(1)), over);
    expect(bribePressureTier(mk({ fedWarningLevel: 0, bustArmed: false }))).toBe(0);
    expect(bribePressureTier(mk({ fedWarningLevel: 1 }))).toBe(1);
    expect(bribePressureTier(mk({ fedWarningLevel: 2 }))).toBe(2);
    expect(bribePressureTier(mk({ fedWarningLevel: 3 }))).toBe(3);
    expect(bribePressureTier(mk({ fedWarningLevel: 0, bustArmed: true }))).toBe(3);
  });
});

// ── HOOK 1 — per-rival aggression constants ────────────────────────────────────────────────────────────────
describe('HOOK 1 — per-rival aggro constants (override ?? archetype ?? global)', () => {
  it('a direct aggroTuning override changes each resolver', () => {
    const r = rivalA(createInitialState(1));
    r.aggroTuning = { onAttack: 100, decay: 30, hqStrike: 500 };
    expect(aggroOnAttackFor(r)).toBe(100);
    expect(aggroDecayFor(r)).toBe(30);
    expect(aggroHqStrikeFor(r)).toBe(500);
  });

  it('an archetype preset supplies the values, and a direct field overrides the preset', () => {
    const r = rivalA(createInitialState(1));
    r.familyArchetype = 'vengeful'; // { onAttack: 60, decay: 5, hqStrike: 45 }
    expect(aggroOnAttackFor(r)).toBe(RIVAL_ARCHETYPES.vengeful.aggroTuning!.onAttack);
    expect(aggroDecayFor(r)).toBe(RIVAL_ARCHETYPES.vengeful.aggroTuning!.decay);
    r.aggroTuning = { onAttack: 999 }; // direct field beats the preset; unset fields still fall to the preset
    expect(aggroOnAttackFor(r)).toBe(999);
    expect(aggroDecayFor(r)).toBe(RIVAL_ARCHETYPES.vengeful.aggroTuning!.decay); // 5, from the preset
  });

  it('BEHAVIOUR (decay): the strategic pulse sheds the RESOLVED aggro per rival', () => {
    const base = createInitialState(1); const rb = rivalA(base); rb.aggro = 100;
    resolveStrategicPulse(base);
    expect(rb.aggro).toBe(100 - AGGRO_DECAY); // baseline: 92

    const tuned = createInitialState(1); const rt = rivalA(tuned);
    rt.aggro = 100; rt.aggroTuning = { decay: 30 };
    resolveStrategicPulse(tuned);
    expect(rt.aggro).toBe(70); // override sheds 30, not 8 — a real AI-behaviour change
  });

  it('BEHAVIOUR (HQ strike): the resolved threshold flips whether a strong, enraged rival strikes your HQ', () => {
    const mkStrong = (over: Partial<Family>) => {
      const s = createInitialState(1); const r = rivalA(s);
      r.gangsters = [gang('m1', 8), gang('m2', 8)]; // strength 16 ≥ ASSASSINATE_MIN_STRENGTH (12)
      r.aggro = 100; // after the pulse's own decay → 92, well above the baseline 60 threshold
      Object.assign(r, over);
      return { s, strikes: resolveStrategicPulse(s).hqStrikes };
    };
    expect(mkStrong({}).strikes).toContain('rival-a');                                 // baseline 60 → strikes
    expect(mkStrong({ aggroTuning: { hqStrike: 500 } }).strikes).not.toContain('rival-a'); // 92 < 500 → no strike
  });

  it('BEHAVIOUR (onAttack): a real offensive action raises aggro by the RESOLVED onAttack', () => {
    const mkHit = (over: Partial<Family>) => {
      const s = createInitialState(1);
      s.player.cash = 2000; s.player.bribes.feds = 20; // afford + Bureau requirement for a lockout
      const r = rivalA(s); Object.assign(r, over);
      const res = resolveLockout(s, 'rival-a');
      expect(res.ok).toBe(true);
      return r.aggro;
    };
    expect(mkHit({})).toBe(AGGRO_ON_ATTACK / 2);                       // baseline: 20
    expect(mkHit({ aggroTuning: { onAttack: 100 } })).toBe(50);        // override: 100 / 2
  });
});

// ── HOOK 2 — per-rival bribe-channel WEIGHTED table ────────────────────────────────────────────────────────
describe('HOOK 2 — per-rival bribe channel weights replace the fixed ladder', () => {
  const atTier3 = (over: Partial<Family>): Family => {
    const r = rivalA(createInitialState(1));
    r.bribes = { police: 0, judges: 0, politicians: 0, feds: 0 };
    r.fedWarningLevel = 3;
    Object.assign(r, over);
    return r;
  };

  it('a direct weight table flips the chosen channel at a tier (tier 3: feds → politicians)', () => {
    expect(chooseBribeChannel(atTier3({}))).toBe('feds'); // baseline
    expect(chooseBribeChannel(atTier3({ bribeChannelWeights: { politicians: 100 } }))).toBe('politicians');
  });

  it('the escalation gate still holds — a weight cannot buy a channel the tier has not unlocked', () => {
    // heavy feds weight, but only tier 1 pressure → feds is still locked (needs tier 3); politicians wins.
    const r = atTier3({ fedWarningLevel: 1, bribeChannelWeights: { feds: 100 } });
    expect(chooseBribeChannel(r)).toBe('politicians');
  });

  it('an archetype preset reweights the choice (cautious prefers JUDGES even at tier 3)', () => {
    // cautious carries judges:4 → at tier 3 (politicians1/judges4/feds3) judges outscores feds.
    expect(chooseBribeChannel(atTier3({ familyArchetype: 'cautious' }))).toBe('judges');
    // a direct table still beats the preset.
    expect(chooseBribeChannel(atTier3({ familyArchetype: 'cautious', bribeChannelWeights: { feds: 99 } }))).toBe('feds');
  });

  it('BEHAVIOUR: bribeAllocation + the AI surface the reweighted channel (setBribe to politicians, not feds)', () => {
    const s = createInitialState(1); const r = rivalA(s);
    r.cash = 2000; r.heat = 0; r.fedWarningLevel = 3;
    r.bribes = { police: 0, judges: 0, politicians: 0, feds: 0 };
    r.bribeChannelWeights = { politicians: 100 };
    expect(bribeAllocation(r)?.channel).toBe('politicians'); // was 'feds' in the baseline ladder
    const sb = rivalCandidates(s, r).find((c) => c.command.type === 'setBribe');
    expect(sb && sb.command.type === 'setBribe' && sb.command.channel).toBe('politicians');
  });
});

// ── HOOK 3 — per-candidate score MULTIPLIER ────────────────────────────────────────────────────────────────
describe('HOOK 3 — per-candidate score multiplier over the AI base scores', () => {
  it('candidateBiasFor resolves a direct table, an archetype preset, and stays in sync with every kind', () => {
    const r = rivalA(createInitialState(1));
    r.candidateBias = { expandControl: 3, collect: 0.5 };
    expect(candidateBiasFor(r, 'expandControl')).toBe(3);
    expect(candidateBiasFor(r, 'collect')).toBe(0.5);
    expect(candidateBiasFor(r, 'recruitGangster')).toBe(1); // unset kind ⇒ ×1
    // every declared candidate kind is addressable through the bias table (guards drift vs ai.ts).
    for (const k of ALL_KINDS) {
      const r2 = rivalA(createInitialState(1));
      r2.candidateBias = { [k]: 7 };
      expect(candidateBiasFor(r2, k)).toBe(7);
    }
  });

  it('BEHAVIOUR: the multiplier scales a candidate base score in rivalCandidates', () => {
    const plain = createInitialState(1); const rp = rivalA(plain);
    rp.cash = 2000; rp.heat = 0; rp.fedWarningLevel = 0;
    const baseExpand = rivalCandidates(plain, rp).find((c) => c.command.type === 'expandControl')!.base;

    const biased = createInitialState(1); const rbi = rivalA(biased);
    rbi.cash = 2000; rbi.heat = 0; rbi.fedWarningLevel = 0;
    rbi.candidateBias = { expandControl: 4 };
    const biasedExpand = rivalCandidates(biased, rbi).find((c) => c.command.type === 'expandControl')!.base;
    expect(biasedExpand).toBeCloseTo(baseExpand * 4, 5);
  });

  it('BEHAVIOUR: a dominating bias makes chooseRivalAction pick that kind deterministically', () => {
    const s = createInitialState(1); const r = rivalA(s);
    r.cash = 2000; r.heat = 0; r.fedWarningLevel = 0;
    r.candidateBias = { expandControl: 1000 }; // base blown far past any other candidate + jitter
    expect(chooseRivalAction(s, r, new Rng(s.rngState))?.type).toBe('expandControl');
  });

  it('an archetype preset biases the AI too (kingpin favours expansion)', () => {
    const plain = createInitialState(1); const rp = rivalA(plain);
    rp.cash = 2000; rp.heat = 0; rp.fedWarningLevel = 0;
    const baseExpand = rivalCandidates(plain, rp).find((c) => c.command.type === 'expandControl')!.base;

    const king = createInitialState(1); const rk = rivalA(king);
    rk.cash = 2000; rk.heat = 0; rk.fedWarningLevel = 0; rk.familyArchetype = 'kingpin';
    const kingExpand = rivalCandidates(king, rk).find((c) => c.command.type === 'expandControl')!.base;
    expect(kingExpand).toBeCloseTo(baseExpand * RIVAL_ARCHETYPES.kingpin.candidateBias!.expandControl!, 5);
  });
});

// ── HOOK 4 — familyArchetype field + registry (distinct from District.archetype) ───────────────────────────
describe('HOOK 4 — familyArchetype names a RIVAL_ARCHETYPES preset (not the district flavour field)', () => {
  it('the registry ships the documented presets, each a partial override bundle', () => {
    for (const key of ['vengeful', 'cautious', 'kingpin']) expect(RIVAL_ARCHETYPES[key]).toBeTruthy();
  });

  it('an unknown familyArchetype falls through to the global baseline (no throw)', () => {
    const r = rivalA(createInitialState(1));
    r.familyArchetype = 'no-such-archetype';
    expect(aggroOnAttackFor(r)).toBe(AGGRO_ON_ATTACK);
    expect(candidateBiasFor(r, 'expandControl')).toBe(1);
  });

  it('Family.familyArchetype is independent of District.archetype (different taxonomy, no coupling)', () => {
    const s = createInitialState(1); const r = rivalA(s);
    r.familyArchetype = 'vengeful';
    // setting the rival personality touches no district's neighbourhood-archetype flavour field.
    for (const d of s.districts) expect(d.archetype).not.toBe('vengeful');
  });
});
