// BEAT-COP P1 — ENGAGE (headless auto-resolve). The laws under test:
//   1. CONSUMES combatResolve (no re-implemented damage) — resolveCopEngagement is byte-for-byte a
//      resolveEngagement over the synthesized law fighter + the suspects. (mutation-verified: if it computed
//      any damage of its own, the equivalence assertion diverges.)
//   2. CAP-BOUNDARY — the hard caps flow through: even the cop's swing needs ≥3 hits to down a fresh thug
//      (no one-shot), inherited from combatTuning via the resolver.
//   3. PURITY / NUMBERS-FROZEN — resolveCopEngagement mutates NOTHING: not the state, its units, the cop, or
//      state.rngState; and the law fighter never leaks into state.units (cops are never MovableUnits).
//   4. OUTCOMES + EDGES — the cop wins a fair 1v1, can be downed when outnumbered, sweeps the whole crew,
//      only touches the hunted family, and degrades gracefully on a stale/empty target set.

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { spawnEnforcer, spawnCollector, type MovableUnit } from '../src/sim/movement';
import { resolveEngagement } from '../src/sim/combatResolve';
import { isCombatant } from '../src/sim/combat';
import { MAX_HIT_DAMAGE } from '../src/sim/combatTuning';
import { THUG_MAX_HEALTH } from '../src/sim/constants';
import { update } from '../src/sim/realtime';
import { COP_PATROL_SPEED, type BeatCop } from '../src/sim/beatCops';
import {
  resolveCopEngagement, lawCombatant, LAW_FACTION_ID, COP_WEAPON, COP_SKILL,
} from '../src/sim/copBehaviorEngage';
import type { GameState } from '../src/sim/types';

const json = (x: unknown): string => JSON.stringify(x);

function thug(id: string, factionId: string, gx: number, gy: number): MovableUnit {
  return spawnEnforcer(id, gx, gy, factionId, 2.5); // a plain fighter: skill 0, no weapon
}

function withUnits(...units: MovableUnit[]): GameState {
  const s = createInitialState(1, { bigCity: true });
  s.units = units;
  return s;
}

function mkCop(gx: number, gy: number, over: Partial<BeatCop> = {}): BeatCop {
  const base: BeatCop = {
    id: 'cop-0', pos: { gx, gy }, path: [], speed: COP_PATROL_SPEED, homeDistrictId: 'district-0',
    mode: 'engage', headingDir: -1, suspicion: 100, loiterSec: 0,
  };
  return { ...base, ...over };
}

describe('copBehaviorEngage — synthesis of the law fighter', () => {
  it('lawCombatant stands the cop up as a LAW-family enforcer at its position, with the cop loadout', () => {
    const cop = mkCop(7, 9);
    const law = lawCombatant(cop);
    expect(law.id).toBe('law:cop-0');           // prefixed ⇒ can never collide with a real unit id
    expect(law.factionId).toBe(LAW_FACTION_ID);
    expect(law.pos).toEqual({ gx: 7, gy: 9 });
    expect(law.weapon).toBe(COP_WEAPON);
    expect(law.skill).toBe(COP_SKILL);
    expect(isCombatant(law)).toBe(true);
  });

  it('the law family id is distinct from the player and every rival', () => {
    const s = createInitialState(1, { bigCity: true });
    const families = [s.player.id, ...s.rivals.map((r) => r.id)];
    expect(families).not.toContain(LAW_FACTION_ID);
  });
});

describe('copBehaviorEngage — CONSUMES resolveEngagement (no re-implemented damage)', () => {
  it('is byte-identical to a hand-built resolveEngagement over the same law fighter + suspect', () => {
    const s = withUnits(thug('p1', 'player', 5.4, 5));
    const cop = mkCop(5, 5, { focusUnitId: 'p1' });
    const r = resolveCopEngagement(s, cop);

    // the equivalent fight, assembled by hand: the same law unit leads the same roster
    const law = lawCombatant(cop);
    const scratch: GameState = { ...s, units: [law, s.units.find((u) => u.id === 'p1')!] };
    const direct = resolveEngagement(scratch, [law.id, 'p1']);

    expect(json(r.report)).toBe(json(direct)); // same rule, same numbers — nothing re-implemented
    expect(r.lawUnitId).toBe(law.id);
  });
});

describe('copBehaviorEngage — cap-boundary (the hard caps flow through)', () => {
  it('the cop cannot one-shot: a downed suspect took ≥3 hits (inherited MAX_HIT_DAMAGE clamp)', () => {
    const s = withUnits(thug('p1', 'player', 5.3, 5));
    const cop = mkCop(5, 5, { focusUnitId: 'p1' });
    const r = resolveCopEngagement(s, cop);
    expect(r.suspectsDowned).toEqual(['p1']);
    const hitsOnP1 = r.report.tickLog.filter((b) => b.targetId === 'p1').length; // 'hit' beats + the final 'down'
    expect(hitsOnP1).toBeGreaterThanOrEqual(3);
    expect(Math.ceil(THUG_MAX_HEALTH / MAX_HIT_DAMAGE)).toBe(3); // the cap value is what forces ≥3
  });
});

describe('copBehaviorEngage — outcomes + edges', () => {
  it('decisive: the cop downs a lone fresh thug and holds the field', () => {
    const s = withUnits(thug('p1', 'player', 5.4, 5));
    const cop = mkCop(5, 5, { focusUnitId: 'p1' });
    const r = resolveCopEngagement(s, cop);
    expect(r.resolved).toBe(true);
    expect(r.outcome).toEqual({ kind: 'decisive', victorFactionId: LAW_FACTION_ID });
    expect(r.suspectsDowned).toEqual(['p1']);
    expect(r.copDowned).toBe(false);
  });

  it('a lone cop CAN be downed when a crew swarms it — it is a real combatant, not invincible', () => {
    // four fresh thugs pressed onto the cop out-damage a single officer before it can drop them one by one
    const s = withUnits(
      thug('p1', 'player', 5, 6), thug('p2', 'player', 6, 5),
      thug('p3', 'player', 5, 4), thug('p4', 'player', 4, 5),
    );
    const cop = mkCop(5, 5, { focusUnitId: 'p1' });
    const r = resolveCopEngagement(s, cop);
    expect(r.copDowned).toBe(true);
    expect(r.outcome).toEqual({ kind: 'decisive', victorFactionId: 'player' });
  });

  it('sweeps the whole crew at the scene into the fight, not just the focus', () => {
    const s = withUnits(thug('p1', 'player', 5.4, 5), thug('p2', 'player', 5, 5.4));
    const cop = mkCop(5, 5, { focusUnitId: 'p1' });
    const r = resolveCopEngagement(s, cop);
    // both suspects were hauled into the confrontation (whoever ultimately wins) — the sweep, not the outcome
    const involved = new Set<string>([...r.report.casualties, ...r.report.survivors]);
    expect(involved.has('p1')).toBe(true);
    expect(involved.has('p2')).toBe(true);
  });

  it('only the HUNTED family is swept — a nearby rival is never the cop\'s suspect', () => {
    const s = withUnits(thug('p1', 'player', 5.4, 5), thug('r1', 'rival-a', 5, 5.4));
    const cop = mkCop(5, 5, { focusUnitId: 'p1' });
    const r = resolveCopEngagement(s, cop);
    // the fight is law vs p1 only; r1 (a rival) is never a participant, casualty, or perturbed in the real state
    expect(r.suspectsDowned).toEqual(['p1']);
    expect(r.report.casualties).not.toContain('r1');
    const involved = new Set<string>([...r.report.casualties, ...r.report.survivors]);
    expect(involved.has('r1')).toBe(false);
    expect(s.units.find((u) => u.id === 'r1')!.downed).toBeUndefined(); // pure — bystander untouched
  });

  it('a downed / missing focus leaves nothing to resolve (graceful degenerate)', () => {
    const downed = { ...thug('p1', 'player', 5.3, 5), downed: true, health: 0 };
    const s = withUnits(downed);
    const r = resolveCopEngagement(s, mkCop(5, 5, { focusUnitId: 'p1' }));
    expect(r.resolved).toBe(false);        // no live suspect
    expect(r.suspectsDowned).toEqual([]);
    expect(r.copDowned).toBe(false);
    // a focus id that isn't in play at all
    const r2 = resolveCopEngagement(withUnits(), mkCop(5, 5, { focusUnitId: 'ghost' }));
    expect(r2.resolved).toBe(false);
  });

  it('a collector at the scene is never a suspect (robbed via interception, never an arrest target)', () => {
    const s = withUnits(spawnCollector('c1', 5.3, 5, 'player', 200));
    const r = resolveCopEngagement(s, mkCop(5, 5, { focusUnitId: 'c1' }));
    expect(r.resolved).toBe(false);
    expect(r.suspectsDowned).toEqual([]);
  });
});

describe('copBehaviorEngage — PURITY / numbers-frozen', () => {
  it('mutates nothing — state, its units, the cop, and state.rngState are byte-identical after', () => {
    const s = withUnits(thug('p1', 'player', 5.4, 5), thug('p2', 'player', 5, 5.4), thug('r1', 'rival-a', 9, 9));
    const cop = mkCop(5, 5, { focusUnitId: 'p1' });
    const stateBefore = json(s);
    const copBefore = json(cop);
    const cursorBefore = s.rngState;
    const r = resolveCopEngagement(s, cop, { resolve: { initiativeJitter: true } }); // even the jitter path is pure
    expect(r.suspectsDowned.length).toBeGreaterThan(0); // it actually resolved a fight
    expect(json(s)).toBe(stateBefore);      // whole state tree unchanged
    expect(json(cop)).toBe(copBefore);      // the cop is read, never written
    expect(s.rngState).toBe(cursorBefore);  // shared cursor never touched
    // the synthesized law fighter never leaked into the live roster
    expect(s.units.some((u) => u.factionId === LAW_FACTION_ID)).toBe(false);
    expect(s.units.map((u) => u.id)).toEqual(['p1', 'p2', 'r1']);
  });

  it('same seed: a game runs byte-identical whether or not resolveCopEngagement is also called between frames', () => {
    const mk = (): GameState => {
      const g = createInitialState(7, { bigCity: true, startingCrew: true });
      g.units = [thug('p1', 'player', 5, 5), thug('r1', 'rival-a', 5.4, 5)];
      return g;
    };
    const withResolver = mk();
    const without = mk();
    const cop = mkCop(5.2, 5, { focusUnitId: 'p1' });
    for (let i = 0; i < 20; i++) {
      resolveCopEngagement(withResolver, cop); // a headless resolve between frames must not perturb the game
      update(withResolver, 0.5, 2);
      update(without, 0.5, 2);
    }
    expect(withResolver.rngState).toBe(without.rngState);
    expect(json(withResolver)).toBe(json(without));
  });

  it('deterministic per seed: identical inputs ⇒ identical result', () => {
    const mk = (): [GameState, BeatCop] => [withUnits(thug('p1', 'player', 5.4, 5), thug('p2', 'player', 5, 5.4)), mkCop(5, 5, { focusUnitId: 'p1' })];
    const [sa, ca] = mk(); const [sb, cb] = mk();
    expect(json(resolveCopEngagement(sa, ca))).toBe(json(resolveCopEngagement(sb, cb)));
  });
});
