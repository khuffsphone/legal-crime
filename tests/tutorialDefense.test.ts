import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  startCollectorRun,
  buildMapLayout,
  processCollectorArrivals,
} from '../src/sim/mapEconomy';
import { canIntercept, resolveInterceptions } from '../src/sim/interception';
import { spawnCollector, spawnEnforcer } from '../src/sim/movement';
import { realtimeHudView, familyHudView } from '../src/sim/hud';
import { STARTING_CREW_UPKEEP } from '../src/sim/constants';
import {
  nextRunIsProtected,
  carryingRunIsProtected,
  firstObjective,
} from '../src/sim/onboarding';
import type { GameState } from '../src/sim/types';

function seeded(take = 300, freeRuns = 0): GameState {
  const s = createInitialState(1, { tutorialFreeRuns: freeRuns });
  const front = s.districts[0].businesses[0];
  front.extortedBy = 'player';
  front.uncollected = take;
  return s;
}

describe('tutorialFreeRuns — the first-paycheck safety net', () => {
  it('defaults to 0 and is set by the option', () => {
    expect(createInitialState(1).tutorialFreeRuns).toBe(0);
    expect(createInitialState(1, { tutorialFreeRuns: 2 }).tutorialFreeRuns).toBe(2);
  });

  it('does not perturb the seeded RNG cursor', () => {
    expect(createInitialState(7, { tutorialFreeRuns: 3 }).rngState).toBe(createInitialState(7).rngState);
  });

  it('startCollectorRun marks a protected run and spends one free-run', () => {
    const s = seeded(300, 1);
    const run = startCollectorRun(s, buildMapLayout(s), 'player', 'district-0');
    expect(run.unit!.protectedRun).toBe(true);
    expect(s.tutorialFreeRuns).toBe(0); // spent

    // A subsequent run (no free-runs left) is NOT protected.
    s.districts[0].businesses[0].extortedBy = 'player';
    s.districts[0].businesses[0].uncollected = 200;
    const run2 = startCollectorRun(s, buildMapLayout(s), 'player', 'district-0');
    expect(run2.unit!.protectedRun).toBeFalsy();
  });

  it('a protected carrying collector cannot be intercepted', () => {
    const collector = spawnCollector('c', 5, 5, 'player', 300);
    collector.protectedRun = true;
    const enforcer = spawnEnforcer('e', 5.1, 5, 'rival-a');
    expect(canIntercept(enforcer, collector)).toBe(false);

    // ...and the same setup WITHOUT protection does intercept.
    const collector2 = spawnCollector('c2', 5, 5, 'player', 300);
    expect(canIntercept(enforcer, collector2)).toBe(true);
  });

  it('resolveInterceptions leaves a protected run untouched even point-blank', () => {
    const s = createInitialState(1, { tutorialFreeRuns: 1 });
    const collector = spawnCollector('c', 5, 5, 'player', 300);
    collector.protectedRun = true;
    s.units.push(collector, spawnEnforcer('e', 5, 5, 'rival-a'));
    const events = resolveInterceptions(s);
    expect(events).toEqual([]);
    expect(collector.carrying).toBe(300); // not robbed
  });

  it('the first dispatched run survives to bank even with an enemy on top of it', () => {
    const s = seeded(300, 1);
    const layout = buildMapLayout(s);
    const c = startCollectorRun(s, layout, 'player', 'district-0').unit!;
    s.units.push(spawnEnforcer('gun', c.pos.gx, c.pos.gy, 'rival-a'));
    expect(resolveInterceptions(s)).toEqual([]); // protected — no robbery
    c.pos = { ...layout.hqTiles['player'] };
    c.path = [];
    const deps = processCollectorArrivals(s, layout);
    expect(deps[0].banked).toBeGreaterThan(0); // the first paycheck lands
  });
});

describe('uncollected & upkeep on the HUD (cash legibility)', () => {
  it('surfaces the uncollected pile and the weekly upkeep bleed', () => {
    const s = seeded(450, 0);
    // give the player a crew so upkeep is non-zero
    const crew = createInitialState(1, { startingCrew: true });
    s.player.gangsters = crew.player.gangsters;
    const hud = realtimeHudView(s);
    expect(hud.player.uncollected).toBe(450);
    // RTS-13: the tutorial crew works cheap (STARTING_CREW_UPKEEP) so the early bleed is gentle.
    expect(hud.player.weeklyUpkeep).toBe(2 * STARTING_CREW_UPKEEP); // 30, not 60
  });

  it('familyHudView defaults uncollected to 0 when not supplied', () => {
    const v = familyHudView(createInitialState(1).player);
    expect(v.uncollected).toBe(0);
    expect(v.weeklyUpkeep).toBe(0);
  });
});

describe('onboarding teaches defense and first-run safety', () => {
  it('nextRunIsProtected / carryingRunIsProtected track the tutorial state', () => {
    const s = createInitialState(1, { tutorialFreeRuns: 1 });
    expect(nextRunIsProtected(s)).toBe(true);
    const c = spawnCollector('c', 5, 5, 'player', 100);
    c.protectedRun = true;
    s.units.push(c);
    expect(carryingRunIsProtected(s, 'player')).toBe(true);
  });

  it('the collect objective promises a SAFE first run while a free-run remains', () => {
    const s = seeded(300, 1);
    const o = firstObjective(s);
    expect(o.step).toBe('collect');
    expect(o.detail).toMatch(/SAFE/);
  });

  it('the protect objective reads SAFE PASSAGE for a protected carrying collector', () => {
    const s = createInitialState(1, { tutorialFreeRuns: 0 });
    s.districts[0].businesses[0].extortedBy = 'player';
    const c = spawnCollector('c', 5, 5, 'player', 300);
    c.protectedRun = true;
    s.units.push(c);
    const o = firstObjective(s);
    expect(o.step).toBe('protect');
    expect(o.title).toMatch(/SAFE PASSAGE/);
  });

  it('an unprotected carrying collector reads the normal protect warning', () => {
    const s = createInitialState(1);
    s.districts[0].businesses[0].extortedBy = 'player';
    s.units.push(spawnCollector('c', 5, 5, 'player', 300));
    const o = firstObjective(s);
    expect(o.step).toBe('protect');
    expect(o.title).toBe('WALK THE TAKE TO HQ');
  });

  it('RTS-33: the first post-earn objective teaches GREASE (points at [G]) instead of dead-ending', () => {
    const s = createInitialState(1);
    s.districts[0].businesses[0].extortedBy = 'player';
    const o = firstObjective(s);
    expect(o.step).toBe('grease');
    expect(o.detail).toMatch(/\[G\]/);
    expect(o.done).toBe(false); // there is always a next goal now
  });
});
