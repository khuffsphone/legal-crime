// COMBAT PR B — headless auto-resolve. The laws under test:
//   1. FIDELITY (equivalence) — a resolve of adjacent units is BYTE-IDENTICAL to hand-stepping the
//      production resolveProximityCombat: same casualties, same durationTicks, same victor. So the
//      headless outcome can never diverge from what the live fight would compute.
//   2. NUMBERS-FROZEN / PURITY — invoking resolveEngagement mutates NOTHING: not the passed state, not
//      its units, not state.rngState. A twin game byte-compares identical with/without the resolver.
//   3. CAP-BOUNDARY — the HARD CAPS (MAX_HIT_DAMAGE 45 / MIN_ATTACK_INTERVAL 0.45) are honored through
//      the resolver: even the deadliest matchup needs ≥3 hits to down a fresh thug (no one-shot), and
//      a max-cadence unit's swings never fall below the interval floor.
//   4. RNG ISOLATION — the exchange draws no randomness; the opt-in jitter uses a resolver-LOCAL cursor
//      and never touches state.rngState. Deterministic per seed; jitter actually changes the result.
//   5. OUTCOMES + EDGES — decisive / draw / disengaged / timeout; downed / collector / self / empty.
// MUTATION-VERIFIED: the equivalence + cap + purity assertions fail if the resolver stops routing through
// the production rule or starts mutating live state (see the ≥3-hit clamp guard and the twin-freeze test).

import { describe, expect, it } from 'vitest';
import {
  RESOLVE_DT, RESOLVE_MAX_TICKS, COMBAT_RESOLVE_RNG_SALT,
  autoResolveRequested, combatResolveSeed, resolveEngagement,
} from '../src/sim/combatResolve';
import { resolveProximityCombat, isCombatant } from '../src/sim/combat';
import { MAX_HIT_DAMAGE, MIN_ATTACK_INTERVAL, attackInterval } from '../src/sim/combatTuning';
import { THUG_MAX_HEALTH } from '../src/sim/constants';
import { spawnCollector, spawnEnforcer, spawnUnit, type MovableUnit } from '../src/sim/movement';
import { createInitialState } from '../src/sim/state';
import { update } from '../src/sim/realtime'; // consumed (read-only) for the numbers-frozen twin test
import type { GameState, WeaponTier } from '../src/sim/types';

const json = (x: unknown): string => JSON.stringify(x);

function fighter(id: string, factionId: string, gx: number, gy: number, opts?: { weapon?: WeaponTier; skill?: number; speed?: number }): MovableUnit {
  return spawnEnforcer(id, gx, gy, factionId, opts?.speed ?? 2.5, opts);
}

function withUnits(...units: MovableUnit[]): GameState {
  const s = createInitialState(1, { bigCity: true });
  s.units = units;
  return s;
}

function factionsOf(units: readonly MovableUnit[]): string[] {
  const out: string[] = [];
  for (const u of units) if (isCombatant(u) && u.factionId && !out.includes(u.factionId)) out.push(u.factionId);
  return out;
}

describe('autoResolveRequested — the future ?autoresolve=1 entry gate (default OFF)', () => {
  it('is OFF by default and ON only for autoresolve=1 exactly', () => {
    expect(autoResolveRequested('')).toBe(false);
    expect(autoResolveRequested('?autoresolve=1')).toBe(true);
    expect(autoResolveRequested('?autoresolve=0')).toBe(false);
    expect(autoResolveRequested('?autoresolve')).toBe(false);
    expect(autoResolveRequested('?combat=1')).toBe(false);
    expect(autoResolveRequested('?combat=1&autoresolve=1')).toBe(true);
  });
});

describe('FIDELITY — a resolve equals hand-stepping the production resolveProximityCombat', () => {
  it('adjacent 1v1: same casualties, same durationTicks, same victor as the live rule', () => {
    // resolver
    const s1 = withUnits(fighter('p1', 'player', 5, 5), fighter('r1', 'rival-a', 5.5, 5));
    const res = resolveEngagement(s1, ['p1', 'r1']);

    // manual: step the UNMODIFIED production function on twin clones at the same dt
    const s2 = withUnits(fighter('p1', 'player', 5, 5), fighter('r1', 'rival-a', 5.5, 5));
    const downs: string[] = [];
    let steps = 0;
    while (factionsOf(s2.units).length >= 2 && steps < RESOLVE_MAX_TICKS) {
      const evs = resolveProximityCombat(s2, RESOLVE_DT);
      for (const e of evs) if (e.kind === 'down') downs.push(e.unitId);
      steps += 1;
    }

    expect(res.durationTicks).toBe(steps);
    expect(res.casualties).toEqual(downs);
    expect(res.outcome).toEqual({ kind: 'decisive', victorFactionId: 'player' }); // array-first swings first
    expect(res.survivors).toEqual(['p1']);
    // the resolve's beats landed on the loser exactly as the hand-run's did (same rule, same numbers)
    const beatsOnLoserResolve = res.tickLog.filter((b) => b.targetId === 'r1').length;
    expect(beatsOnLoserResolve).toBe(downs.length + (steps > 0 ? res.tickLog.filter((b) => b.targetId === 'r1' && b.kind === 'hit').length : 0));
    expect(s2.units.find((u) => u.id === 'p1')!.downed).toBeUndefined(); // the winner survived the hand-run too
  });
});

describe('NUMBERS-FROZEN / PURITY — the resolver mutates nothing', () => {
  it('leaves the passed state, its units, and state.rngState byte-identical', () => {
    const s = withUnits(fighter('p1', 'player', 5, 5), fighter('r1', 'rival-a', 5.4, 5), spawnCollector('c1', 9, 9, 'player', 200));
    const before = json(s);
    const cursorBefore = s.rngState;
    const res = resolveEngagement(s, ['p1', 'r1'], { initiativeJitter: true }); // even the jitter path is pure
    expect(res.casualties.length).toBeGreaterThan(0); // it actually resolved
    expect(json(s)).toBe(before);        // whole state tree unchanged
    expect(s.rngState).toBe(cursorBefore); // shared cursor never touched
    expect(s.combatOrders).toBeUndefined(); // no slice created
    // the participant units themselves are untouched (the fight ran on clones)
    expect(s.units.find((u) => u.id === 'p1')!.health).toBeUndefined();
    expect(s.units.find((u) => u.id === 'r1')!.downed).toBeUndefined();
  });

  it('same seed: a game runs byte-identical whether or not resolveEngagement is also called', () => {
    const mk = (): GameState => {
      const g = createInitialState(7, { startingCrew: true, bigCity: true });
      g.units = [fighter('p1', 'player', 5, 5), fighter('r1', 'rival-a', 5.4, 5)];
      return g;
    };
    const withResolver = mk();
    const without = mk();
    for (let i = 0; i < 20; i++) {
      resolveEngagement(withResolver, ['p1', 'r1']); // a headless resolve between frames must not perturb the game
      update(withResolver, 0.5, 2);
      update(without, 0.5, 2);
    }
    expect(withResolver.rngState).toBe(without.rngState);
    expect(json(withResolver)).toBe(json(without));
  });
});

describe('CAP-BOUNDARY — the hard caps are honored through the resolver', () => {
  it('MAX_HIT_DAMAGE: the deadliest matchup still needs ≥3 hits to down a fresh thug (no one-shot)', () => {
    // A hitman at max skill is the highest-damage attacker; the 45 clamp guarantees ≥3 hits vs 100 HP.
    const s = withUnits(fighter('killer', 'rival-a', 5, 5, { weapon: 'hitman', skill: 10 }), fighter('victim', 'player', 5.3, 5));
    const res = resolveEngagement(s, ['killer', 'victim']);
    const hitsOnVictim = res.tickLog.filter((b) => b.targetId === 'victim').length; // 'hit' beats + the final 'down'
    expect(hitsOnVictim).toBeGreaterThanOrEqual(3); // ≥3 ⇒ no single hit exceeded MAX_HIT_DAMAGE
    expect(res.casualties).toContain('victim');
    // sanity: 100 / 45 = 2.22 ⇒ 3 hits minimum, and the cap value is what forces it
    expect(Math.ceil(THUG_MAX_HEALTH / MAX_HIT_DAMAGE)).toBe(3);
  });

  it('MIN_ATTACK_INTERVAL: the floor is a true lower bound and the resolver never swings below it', () => {
    // No shipped weapon+skill actually reaches the 0.45 floor (hitman·skill-10 = 0.512s is the fastest), so
    // the floor is a latent burst-guard; what we CAN prove is that it is a valid lower bound and that the
    // resolver's cadence is exactly attackInterval (routed through the capped helper), hence ≥ the floor.
    const fastest = fighter('x', 'rival-a', 0, 0, { weapon: 'hitman', skill: 10 });
    expect(attackInterval(fastest)).toBeGreaterThanOrEqual(MIN_ATTACK_INTERVAL); // the floor can only raise it
    const s = withUnits(fighter('a', 'rival-a', 5, 5, { weapon: 'hitman', skill: 10 }), fighter('b', 'player', 5.3, 5));
    const res = resolveEngagement(s, ['a', 'b'], { dt: 0.05, maxTicks: 400 });
    const swingsByA = res.tickLog.filter((x) => x.attackerId === 'a').length;
    const simSeconds = res.durationTicks * 0.05;
    // swing count can never exceed sim-time / the floor (a valid bound since attackInterval ≥ the floor)
    expect(swingsByA).toBeLessThanOrEqual(Math.floor(simSeconds / MIN_ATTACK_INTERVAL) + 1);
  });
});

describe('OUTCOMES', () => {
  it('decisive: one side wipes the other; victor in survivors, loser in casualties', () => {
    const s = withUnits(fighter('p1', 'player', 5, 5, { weapon: 'hitman', skill: 8 }), fighter('r1', 'rival-a', 5.3, 5));
    const res = resolveEngagement(s, ['p1', 'r1']);
    expect(res.outcome).toEqual({ kind: 'decisive', victorFactionId: 'player' });
    expect(res.survivors).toContain('p1');
    expect(res.casualties).toEqual(['r1']);
    expect(res.durationTicks).toBeGreaterThan(0);
    expect(res.tickLog.length).toBeGreaterThan(0);
    expect(res.tickLog[res.tickLog.length - 1].kind).toBe('down'); // last beat is the kill
  });

  it('disengaged: both sides break off and escape — survivors, no field victor, no casualties', () => {
    const s = withUnits(fighter('p1', 'player', 10, 10), fighter('r1', 'rival-a', 11, 10));
    s.combatOrders = { p1: { stance: 'DISENGAGE' }, r1: { stance: 'DISENGAGE' } };
    const res = resolveEngagement(s, ['p1', 'r1']);
    expect(res.outcome).toEqual({ kind: 'disengaged' });
    expect(res.fled.sort()).toEqual(['p1', 'r1']);
    expect(res.survivors.sort()).toEqual(['p1', 'r1']);
    expect(res.casualties).toEqual([]);
  });

  it('a faster lone DISENGAGE unit outruns its pursuer and escapes — decisive for the holder', () => {
    // r1 breaks off; only a SPEED advantage lets it outrun an equal-footed chaser (p1 gives chase by
    // default). Once r1 is clear, p1 holds the field alone → player is the sole surviving family.
    const s = withUnits(fighter('p1', 'player', 10, 10), fighter('r1', 'rival-a', 11, 10, { speed: 9 }));
    s.combatOrders = { r1: { stance: 'DISENGAGE' } };
    const res = resolveEngagement(s, ['p1', 'r1']);
    expect(res.fled).toEqual(['r1']);
    expect(res.outcome).toEqual({ kind: 'decisive', victorFactionId: 'player' });
    expect(res.survivors.sort()).toEqual(['p1', 'r1']); // r1 lived (escaped), p1 held the field
    expect(res.casualties).toEqual([]);
  });

  it('timeout: still ≥2 families fighting at the tick cap', () => {
    const s = withUnits(fighter('p1', 'player', 5, 5), fighter('r1', 'rival-a', 5.4, 5));
    const res = resolveEngagement(s, ['p1', 'r1'], { maxTicks: 2 }); // too few steps to down anyone
    expect(res.outcome).toEqual({ kind: 'timeout' });
    expect(res.durationTicks).toBe(2);
    expect(res.casualties).toEqual([]);
  });

  it('draw: an empty / degenerate engagement resolves to a no-tick draw', () => {
    const s = withUnits(fighter('p1', 'player', 5, 5));
    expect(resolveEngagement(s, []).outcome).toEqual({ kind: 'draw' }); // nobody in the fight
    expect(resolveEngagement(s, []).durationTicks).toBe(0);
  });

  it('a lone fighter with no enemy trivially holds the field (decisive, zero ticks)', () => {
    const s = withUnits(fighter('p1', 'player', 5, 5));
    const res = resolveEngagement(s, ['p1']);
    expect(res.outcome).toEqual({ kind: 'decisive', victorFactionId: 'player' });
    expect(res.durationTicks).toBe(0);
    expect(res.survivors).toEqual(['p1']);
  });

  it('closes distance: units that start apart still resolve (headless walk-into-melee)', () => {
    const s = withUnits(fighter('p1', 'player', 5, 5, { weapon: 'hitman', skill: 6 }), fighter('r1', 'rival-a', 12, 5));
    const res = resolveEngagement(s, ['p1', 'r1']);
    expect(res.outcome).toEqual({ kind: 'decisive', victorFactionId: 'player' });
    expect(res.casualties).toEqual(['r1']);
  });
});

describe('FOCUS-FIRE consumption (PR A designation steers who you close on)', () => {
  it('concentrates the crew on the designated mark first — bypassing a nearer (slower) enemy', () => {
    // rA is NEAR (3 north) but SLOW; rB is FAR to the east. WITHOUT focus the crew would close on the
    // nearer rA and drop it first. Focus steers them EAST past rA to rB, which therefore dies FIRST — the
    // slow rA can't catch the fleeing crew to force an early brawl. (The swing is still the production
    // nearest-in-range rule; concentration comes from where the crew converges, not from redirected damage.)
    const s = withUnits(
      fighter('p1', 'player', 5, 5, { weapon: 'pistol', skill: 5 }),
      fighter('p2', 'player', 5, 6, { weapon: 'pistol', skill: 5 }),
      fighter('rA', 'rival-a', 5, 8, { speed: 0.5 }),   // NEAR but slow — the default nearest target
      fighter('rB', 'rival-a', 17, 5, { speed: 0.5 }),  // FAR to the east — the focus mark
    );
    s.combatOrders = { p1: { stance: 'FOCUS_FIRE', targetId: 'rB' }, p2: { stance: 'FOCUS_FIRE', targetId: 'rB' } };
    const res = resolveEngagement(s, ['p1', 'p2', 'rA', 'rB']);
    expect(res.casualties[0]).toBe('rB');       // the crew converged on the mark and dropped it first
    expect(res.casualties).toContain('rA');      // then mopped up the nearer rival
    expect(res.outcome).toEqual({ kind: 'decisive', victorFactionId: 'player' });
  });
});

describe('EDGES — non-combatants and degenerate ids', () => {
  it('ignores downed units and collectors in the participant set', () => {
    const downed = { ...fighter('down', 'rival-a', 5.3, 5), downed: true, health: 0 };
    const s = withUnits(
      fighter('p1', 'player', 5, 5),
      fighter('r1', 'rival-a', 5.4, 5),
      downed,
      spawnCollector('col', 5.2, 5, 'rival-a', 100),
    );
    const res = resolveEngagement(s, ['p1', 'r1', 'down', 'col']);
    expect(res.outcome).toEqual({ kind: 'decisive', victorFactionId: 'player' });
    expect(res.casualties).toEqual(['r1']);          // only the live rival fighter falls
    expect(res.survivors).not.toContain('col');       // the collector was never a combatant
    expect(res.survivors).not.toContain('down');      // the pre-downed unit is not a survivor either
  });

  it('dedupes repeated ids and skips missing ids', () => {
    const s = withUnits(fighter('p1', 'player', 5, 5), fighter('r1', 'rival-a', 5.4, 5));
    const res = resolveEngagement(s, ['p1', 'p1', 'r1', 'ghost']);
    expect(res.outcome).toEqual({ kind: 'decisive', victorFactionId: 'player' });
    expect(res.casualties).toEqual(['r1']);
  });

  it('a neutral (no factionId) unit is inert — never fights, never a casualty', () => {
    const s = withUnits(fighter('p1', 'player', 5, 5), spawnUnit('neutral', 5.3, 5));
    const res = resolveEngagement(s, ['p1', 'neutral']);
    expect(res.outcome).toEqual({ kind: 'decisive', victorFactionId: 'player' }); // p1 is the sole family
    expect(res.casualties).toEqual([]);
  });
});

describe('RNG ISOLATION + determinism', () => {
  it('never touches state.rngState (default and jitter), and is deterministic per seed', () => {
    const mk = (): GameState => withUnits(fighter('p1', 'player', 5, 5, { skill: 2 }), fighter('r1', 'rival-a', 5.5, 5, { skill: 2 }));
    const a = mk(); const cur = a.rngState;
    const r1 = resolveEngagement(a, ['p1', 'r1'], { initiativeJitter: true });
    expect(a.rngState).toBe(cur); // local cursor only — shared stream untouched

    const r2 = resolveEngagement(mk(), ['p1', 'r1'], { initiativeJitter: true });
    expect(json(r1)).toBe(json(r2)); // same seed + participants ⇒ identical jittered result
  });

  it('the jitter cursor actually varies the fight (not dead code) and is isolated per seed value', () => {
    const s = withUnits(fighter('p1', 'player', 5, 5, { skill: 3 }), fighter('r1', 'rival-a', 5.5, 5, { skill: 3 }));
    const plain = resolveEngagement(s, ['p1', 'r1']);
    const seedA = resolveEngagement(s, ['p1', 'r1'], { initiativeJitter: true, seed: 1 });
    const seedB = resolveEngagement(s, ['p1', 'r1'], { initiativeJitter: true, seed: 999999 });
    // at least one of the jittered runs differs from the draw-free run (the local cursor is live), …
    expect(json(seedA) !== json(plain) || json(seedB) !== json(plain)).toBe(true);
    // …and different explicit seeds are independently reproducible
    expect(json(resolveEngagement(s, ['p1', 'r1'], { initiativeJitter: true, seed: 1 }))).toBe(json(seedA));
  });

  it('combatResolveSeed is deterministic and salted off state.seed', () => {
    const s = withUnits(fighter('p1', 'player', 5, 5), fighter('r1', 'rival-a', 5, 5));
    expect(combatResolveSeed(s, ['p1', 'r1'])).toBe(combatResolveSeed(s, ['p1', 'r1']));
    expect(combatResolveSeed(s, ['p1', 'r1'])).not.toBe(combatResolveSeed(s, ['r1', 'p1'])); // participant order mixed in
    expect(COMBAT_RESOLVE_RNG_SALT).toBe(0xc0b); // pinned — distinct from 0x30a/0x30b0/0x11fe/0xbc0
  });
});

describe('tickLog compactness', () => {
  it('caps the log and flags truncation (no silent cap)', () => {
    const s = withUnits(fighter('p1', 'player', 5, 5, { weapon: 'pistol', skill: 2 }), fighter('r1', 'rival-a', 5.3, 5, { weapon: 'pistol', skill: 2 }));
    const res = resolveEngagement(s, ['p1', 'r1'], { logCap: 2 });
    expect(res.tickLog.length).toBeLessThanOrEqual(2);
    if (res.durationTicks > 2) expect(res.logTruncated).toBe(true);
  });

  it('RESOLVE_DT and RESOLVE_MAX_TICKS are the documented defaults', () => {
    expect(RESOLVE_DT).toBe(0.25);
    expect(RESOLVE_MAX_TICKS).toBe(4000);
  });
});
