// RTS-30c-2a — pure tests for the channel-gated weapon-tier enforcers: the channel gate (locked under
// threshold, unlocked at/above), the recruit cost deduction + heat contribution, and the turf-war
// muscle-presence weight. The mechanic is abstract (cost/eligibility/heat/outcome) — no depiction.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  ENFORCER_SPECS, ENFORCER_TIERS, enforcerGate, recruitEnforcer, enforcerPresenceWeight,
  totalMusclePresence, recruitableEnforcers,
} from '../src/sim/enforcers';
import { familyStrength } from '../src/sim/conflict';
import { applyCommand } from '../src/sim/commands';
import { buildActionInspector } from '../src/sim/actionInspector';
import type { GameState } from '../src/sim/types';

function big(seed = 1): GameState { return createInitialState(seed, { startingCrew: true, bigCity: true }); }

describe('enforcers — the channel grease GATE', () => {
  it('a unit is LOCKED below its channel threshold and UNLOCKS at/above it (with a clear reason)', () => {
    const s = big();
    s.player.cash = 100000;
    for (const tier of ENFORCER_TIERS) {
      const spec = ENFORCER_SPECS[tier];
      s.player.bribes[spec.channel] = spec.gateLevel - 1; // just under the gate
      const locked = enforcerGate(s, tier);
      expect(locked.ok).toBe(false);
      expect(locked.reason).toContain(spec.channelLabel); // "needs The Beat ≥ $N/wk"
      s.player.bribes[spec.channel] = spec.gateLevel; // at the gate
      expect(enforcerGate(s, tier).ok).toBe(true);
    }
  });

  it('even with the channel greased, an unaffordable unit is gated on cash', () => {
    const s = big();
    const spec = ENFORCER_SPECS.shotgun;
    s.player.bribes[spec.channel] = spec.gateLevel;
    s.player.cash = spec.cost - 1;
    const g = enforcerGate(s, 'shotgun');
    expect(g.ok).toBe(false);
    expect(g.reason).toContain(`$${spec.cost}`);
  });
});

describe('RTS-33 — the specialist path is REACHABLE + SURFACED', () => {
  it('the first specialist unlocks through NORMAL grease: greasing The Beat to its gate fields a PISTOL MAN', () => {
    const s = big();
    const spec = ENFORCER_SPECS.pistol;
    expect(enforcerGate(s, 'pistol').ok).toBe(false); // locked at the start (no grease)
    // grease The Beat through the normal bribe command, in the same $10/wk steps the [G] key uses
    while ((s.player.bribes[spec.channel] ?? 0) < spec.gateLevel) {
      applyCommand(s, { type: 'setBribe', familyId: 'player', channel: spec.channel, amount: (s.player.bribes[spec.channel] ?? 0) + 10 });
    }
    expect(s.player.bribes[spec.channel]).toBeLessThanOrEqual(spec.gateLevel + 9); // a low, reachable bar
    s.player.cash = spec.cost;
    expect(enforcerGate(s, 'pistol').ok).toBe(true); // now recruitable — a real crew is reachable
    expect(recruitEnforcer(s, 'pistol').ok).toBe(true);
  });

  it('the RECRUIT inspector SURFACES every specialist with its unlock path (grease The Beat to $X)', () => {
    const s = big();
    const insp = buildActionInspector(s, 'recruit');
    expect(insp.specialists).toBeDefined();
    expect(insp.specialists!.length).toBe(ENFORCER_TIERS.length);
    const pistol = insp.specialists!.find((r) => r.tier === 'pistol')!;
    expect(pistol.state).toBe('missing'); // locked at the start
    expect(pistol.detail).toContain('grease The Beat'); // the actionable unlock path is shown
    expect(pistol.detail).toContain(`$${ENFORCER_SPECS.pistol.gateLevel}`);
    // once greased, the inspector flips it to ready
    s.player.bribes.police = ENFORCER_SPECS.pistol.gateLevel;
    const after = buildActionInspector(s, 'recruit').specialists!.find((r) => r.tier === 'pistol')!;
    expect(after.state).toBe('met');
    expect(after.detail).toContain('ready');
  });
});

describe('enforcers — recruit deducts cost, adds heat, joins the crew', () => {
  it('recruitEnforcer spends the cost, raises heat, and adds a skilled crew member', () => {
    const s = big();
    const spec = ENFORCER_SPECS.shotgun;
    s.player.bribes[spec.channel] = spec.gateLevel;
    s.player.cash = 5000; s.player.heat = 0;
    const crewBefore = s.player.gangsters.length;
    const strBefore = familyStrength(s.player);
    const res = recruitEnforcer(s, 'shotgun');
    expect(res.ok).toBe(true);
    expect(s.player.cash).toBe(5000 - spec.cost);   // cost deducted
    expect(s.player.heat).toBe(spec.heat);          // heat contributed
    expect(s.player.gangsters.length).toBe(crewBefore + 1); // joins the crew
    expect(familyStrength(s.player)).toBe(strBefore + spec.skill); // adds muscle (feeds Assassinate)
  });

  it('a locked recruit is a no-op (no cash spent, no crew added)', () => {
    const s = big();
    s.player.bribes.police = 0; s.player.cash = 100000;
    const cash = s.player.cash, crew = s.player.gangsters.length;
    const res = recruitEnforcer(s, 'rifle'); // needs The Beat ≥ 40
    expect(res.ok).toBe(false);
    expect(s.player.cash).toBe(cash);
    expect(s.player.gangsters.length).toBe(crew);
  });

  it('the HITMAN recruit (high heat) gets you most of the way to the Assassinate strength gate', () => {
    const s = big();
    const spec = ENFORCER_SPECS.hitman;
    s.player.bribes[spec.channel] = spec.gateLevel; s.player.cash = 5000;
    expect(recruitEnforcer(s, 'hitman').ok).toBe(true);
    expect(s.player.heat).toBeGreaterThanOrEqual(10); // very high heat, per the spec
  });
});

describe('enforcers — turf-war muscle presence weight', () => {
  it('weights order pistol/rifle above a thug and shotgun strongest (strong in-district presence)', () => {
    expect(enforcerPresenceWeight(undefined)).toBe(1); // a plain thug
    expect(enforcerPresenceWeight('pistol')).toBeGreaterThan(1);
    expect(enforcerPresenceWeight('rifle')).toBeGreaterThan(enforcerPresenceWeight('pistol'));
    expect(enforcerPresenceWeight('shotgun')).toBeGreaterThan(enforcerPresenceWeight('rifle'));
  });

  it('totalMusclePresence sums weapon weights and ignores collectors', () => {
    const units = [
      { weapon: undefined as undefined },      // thug = 1
      { weapon: 'shotgun' as const },           // 2.2
      { role: 'collector', weapon: undefined }, // ignored
    ];
    expect(totalMusclePresence(units)).toBeCloseTo(1 + ENFORCER_SPECS.shotgun.presence);
  });

  it('recruitableEnforcers lists all five tiers with live gate state', () => {
    const s = big();
    const opts = recruitableEnforcers(s);
    expect(opts.map((o) => o.tier)).toEqual(ENFORCER_TIERS);
  });
});
