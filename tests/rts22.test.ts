// RTS-22 — the new pure systems: the EXTORT/ATTACK interaction + temp-shutdown, AUTOMATED
// collection routes (still interceptable), and the extort-first rival re-anchor. Seeded +
// deterministic; the sim stays Phaser-free and tick/applyCommand core math is untouched.

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import { businessActions, resolveAttack, earningBusinesses } from '../src/sim/interdiction';
import { businessAccrual, isShutDown } from '../src/sim/economy';
import { accrueUncollected, uncollectedOf } from '../src/sim/collection';
import { createCollectionRoute, advanceRoutes, routeStops, routeStatus, routeCollectorOf } from '../src/sim/routes';
import { buildMapLayout, navGridForLayout } from '../src/sim/mapEconomy';
import { advanceUnits } from '../src/sim/movement';
import { resolveInterceptions } from '../src/sim/interception';
import { spawnEnforcer } from '../src/sim/movement';
import { targetScore, rivalStrategicTarget, expansionRamp } from '../src/sim/strategy';
import { ATTACK_SHUTDOWN_WEEKS, ATTACK_HEAT } from '../src/sim/constants';
import type { GameState, Business } from '../src/sim/types';

function big(seed = 1): GameState { return createInitialState(seed, { startingCrew: true, tutorialFreeRuns: 1, bigCity: true }); }
function rivalOp(s: GameState, di: number, owner = 'rival-a'): Business {
  const b: Business = { id: `rop-${di}`, name: 'still', kind: 'smuggling', baseIncome: 600, heatPerTick: 10, ownerFamily: owner, districtId: `district-${di}`, uncollected: 300, tier: 1 };
  s.districts[di].businesses.push(b);
  return b;
}
/** Mark the player as extorting the first N fronts of district-0, each with pending takings. */
function extortHome(s: GameState, n: number, each = 100): Business[] {
  const out: Business[] = [];
  for (const b of s.districts[0].businesses) {
    if (b.kind !== 'front' || out.length >= n) continue;
    b.extortedBy = 'player'; b.uncollected = each; out.push(b);
  }
  return out;
}

describe('extortion breadth — many cheap fronts to shake down', () => {
  it('the big city seeds a neighbourhood of fronts per district (RTS-22 breadth)', () => {
    const s = big();
    for (const d of s.districts) {
      const fronts = d.businesses.filter((b) => b.kind === 'front').length;
      expect(fronts).toBeGreaterThanOrEqual(4); // a neighbourhood, not 2
    }
  });
});

describe('the EXTORT / ATTACK interaction', () => {
  it('on an un-extorted front you hold control of, EXTORT is offered; ATTACK shuts a rival racket', () => {
    const s = big();
    const homeFront = s.districts[0].businesses.find((b) => b.kind === 'front')!;
    const a = businessActions(s, homeFront.id, 'player')!;
    expect(a.extort.ok).toBe(true); // control 30 ≥ gate, not yet yours
    expect(a.attack.ok).toBe(true); // a producing front that isn't yours yet → can shut it

    homeFront.extortedBy = 'player';
    const b = businessActions(s, homeFront.id, 'player')!;
    expect(b.extort.ok).toBe(false); // already yours
    expect(b.attack.ok).toBe(false); // don't hit your own
    expect(b.attack.reason).toBe("don't hit your own");

    const op = rivalOp(s, 2);
    const c = businessActions(s, op.id, 'player')!;
    expect(c.attack.ok).toBe(true);
    expect(c.earner).toBe('rival-a');
  });

  it('ATTACK temporarily SHUTS DOWN a business: no production for N weeks, then it recovers', () => {
    const s = big();
    const op = rivalOp(s, 2); // rival racket, normally accrues 600/wk
    expect(businessAccrual(op)).toBe(600);
    const heat0 = s.player.heat;

    const res = resolveAttack(s, op.id, 'player');
    expect(res.ok).toBe(true);
    expect(res.weeks).toBe(ATTACK_SHUTDOWN_WEEKS);
    expect(isShutDown(op)).toBe(true);
    expect(op.uncollected).toBe(0); // pending takings scattered
    expect(s.player.heat).toBe(heat0 + ATTACK_HEAT); // a thug job draws heat
    expect(businessAccrual(op)).toBe(0); // produces NOTHING while shut

    // accrual decrements the shutdown each settlement; it produces 0 until it recovers.
    for (let i = 0; i < ATTACK_SHUTDOWN_WEEKS; i++) { expect(businessAccrual(op)).toBe(0); accrueUncollected(s); }
    expect(isShutDown(op)).toBe(false);
    expect(businessAccrual(op)).toBe(600); // back in business
  });

  it('the temp-shutdown does not touch tick settlement (a shut business simply accrues 0)', () => {
    const s = big();
    const front = extortHome(s, 1, 0)[0]; // a player front, fresh
    resolveAttack(s, front.id, 'rival-a'); // a rival shuts the player's front
    const before = uncollectedOf(front);
    tick(s); // full settlement
    expect(uncollectedOf(front)).toBe(before); // nothing accrued while shut
  });
});

describe('automated collection routes — the economy plays itself', () => {
  function stepUntilBanked(s: GameState, layout: ReturnType<typeof buildMapLayout>, grid: ReturnType<typeof navGridForLayout>, cap = 400): number {
    const cash0 = s.player.cash;
    for (let i = 0; i < cap; i++) {
      advanceUnits(s.units, 0.5);
      advanceRoutes(s, layout, grid);
      if (s.player.cash > cash0) return i;
    }
    return -1;
  }

  it('a route gathers the protected fronts and BANKS the take at HQ, then loops', () => {
    const s = big();
    const fronts = extortHome(s, 3, 120); // 3 protected fronts, 120 each waiting
    const layout = buildMapLayout(s);
    const grid = navGridForLayout(layout);

    expect(routeStops(s, layout, 'player').length).toBeGreaterThanOrEqual(3);
    const setup = createCollectionRoute(s, layout, 'player', grid)!;
    expect(setup).not.toBeNull();
    expect(setup.route.stops.length).toBe(fronts.length);
    expect(routeCollectorOf(s, 'player')).toBeDefined();

    const cash0 = s.player.cash;
    const banked = stepUntilBanked(s, layout, grid);
    expect(banked).toBeGreaterThanOrEqual(0); // it reached HQ and deposited
    expect(s.player.cash).toBeGreaterThan(cash0); // money banked itself
    for (const f of fronts) expect(uncollectedOf(f)).toBe(0); // the stops were picked clean
    // it loops — the collector keeps running the route (still assigned, alive).
    expect(routeCollectorOf(s, 'player')).toBeDefined();
    expect(routeStatus(s, 'player').active).toBe(true);
  });

  it('a route collector carrying cash is STILL interceptable mid-route (the signature bottleneck)', () => {
    const s = big();
    extortHome(s, 3, 200);
    const layout = buildMapLayout(s);
    const grid = navGridForLayout(layout);
    const col = createCollectionRoute(s, layout, 'player', grid)!.unit;

    // run the route until the collector is carrying a take (heading to bank).
    let carrying = false;
    for (let i = 0; i < 400 && !carrying; i++) {
      advanceUnits(s.units, 0.5);
      advanceRoutes(s, layout, grid);
      if ((col.carrying ?? 0) > 0) carrying = true;
    }
    expect(carrying).toBe(true);

    // drop a hostile enforcer on it and resolve interception — the take is robbed.
    const robbed = col.carrying ?? 0;
    s.units.push(spawnEnforcer('mugger', Math.round(col.pos.gx), Math.round(col.pos.gy), 'rival-a'));
    const evs = resolveInterceptions(s);
    expect(evs.length).toBeGreaterThan(0);
    expect(evs.some((e) => e.collectorId === col.id)).toBe(true);
    expect(col.carrying ?? 0).toBe(0); // guarding the route still matters
    expect(robbed).toBeGreaterThan(0);
  });

  it('routes are opt-in — no routes means advanceRoutes is a no-op (prior behaviour intact)', () => {
    const s = big();
    const layout = buildMapLayout(s);
    const before = JSON.stringify(s.units);
    advanceRoutes(s, layout); // no state.routes
    expect(JSON.stringify(s.units)).toBe(before);
    expect(s.routes ?? []).toEqual([]);
  });
});

describe('extort-first re-anchor — rivals build, war comes later', () => {
  it('EARLY, a rival prefers neutral ground over an undefended player block; in the WAR phase it covets it', () => {
    const s = big();
    const playerBlock = s.districts[1]; playerBlock.control.player = 51; // undefended, weakly held
    const neutral = s.districts[3]; // open ground, similar wealth tier

    // week 0: appetite for the player's turf is near-zero — neutral scores higher.
    s.tick = 0;
    expect(expansionRamp(0)).toBeLessThan(0.2);
    expect(targetScore(s, s.rivals[0], playerBlock)).toBeLessThan(targetScore(s, s.rivals[0], neutral) + 1);

    // war phase: the undefended player block becomes the juicy target (RTS-33: full force ~wk21, not wk8).
    s.tick = 22;
    expect(targetScore(s, s.rivals[0], playerBlock)).toBeGreaterThan(targetScore(s, s.rivals[0], s.districts[3]));
  });

  it('a fresh rival does not target the player early (it expands its own economy)', () => {
    const s = big();
    s.districts[1].control.player = 51; // a tempting undefended player block next to rival-a
    s.tick = 0;
    const target = rivalStrategicTarget(s, s.rivals[0]);
    expect(target).not.toBeNull();
    expect(target!.id).not.toBe('district-1'); // leaves the player alone early
  });
});

describe('earningBusinesses read', () => {
  it('lists exactly the businesses a family earns from', () => {
    const s = big();
    const fronts = extortHome(s, 2, 50);
    const op = rivalOp(s, 2);
    expect(earningBusinesses(s, 'player').map((b) => b.id).sort()).toEqual(fronts.map((b) => b.id).sort());
    expect(earningBusinesses(s, 'rival-a').map((b) => b.id)).toContain(op.id);
  });
});
