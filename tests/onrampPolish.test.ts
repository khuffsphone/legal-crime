import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  startCollectorRun,
  buildMapLayout,
  depositCollector,
  processCollectorArrivals,
  dispatchThreat,
} from '../src/sim/mapEconomy';
import { hostileEnforcerNear } from '../src/sim/gamefeel';
import { spawnCollector, spawnEnforcer } from '../src/sim/movement';
import { ROUTE_DANGER_RADIUS } from '../src/sim/constants';
import type { GameState } from '../src/sim/types';

function seeded(take = 320, freeRuns = 0): GameState {
  const s = createInitialState(1, { tutorialFreeRuns: freeRuns });
  const front = s.districts[0].businesses[0];
  front.extortedBy = 'player';
  front.uncollected = take;
  return s;
}

describe('protected run banks the FULL amount — the ✓ SAFE promise is exact', () => {
  it('deposits every carried dollar with no skim and no RNG draw', () => {
    const s = createInitialState(1);
    const c = spawnCollector('c', 0, 0, 'player', 320);
    c.protectedRun = true;
    c.originDistrictId = 'district-0';
    const rngBefore = s.rngState;
    const banked = depositCollector(s, c);
    expect(banked).toBe(320); // full — matches what the tag promised
    expect(s.player.dirtyCash).toBe(320);
    expect(s.rngState).toBe(rngBefore); // protected path draws no RNG
  });

  it('an UNprotected run still skims (the contrast that motivated the fix)', () => {
    const s = createInitialState(1);
    const c = spawnCollector('c', 0, 0, 'player', 320);
    c.originDistrictId = 'district-0'; // not protected
    const banked = depositCollector(s, c);
    expect(banked).toBeLessThan(320); // a skim is taken
    expect(banked).toBeGreaterThan(0);
  });

  it('the first dispatched (protected) run banks its full take end-to-end', () => {
    const s = seeded(320, 1);
    const layout = buildMapLayout(s);
    const c = startCollectorRun(s, layout, 'player', 'district-0').unit!;
    expect(c.protectedRun).toBe(true);
    expect(c.carrying).toBe(320);
    c.pos = { ...layout.hqTiles['player'] };
    c.path = [];
    const deps = processCollectorArrivals(s, layout);
    expect(deps[0].banked).toBe(320); // exactly what ✓ SAFE showed
  });
});

describe('hostileEnforcerNear — pre-dispatch threat detection', () => {
  it('finds a hostile enforcer within radius of a point, ignores friends/far/non-enforcers', () => {
    const s = createInitialState(1);
    s.units.push(
      spawnEnforcer('enemy', 5, 5, 'rival-a'),
      spawnEnforcer('friend', 5, 5, 'player'),
      spawnCollector('rivalCollector', 5, 5, 'rival-a', 100),
    );
    expect(hostileEnforcerNear(s, 'player', { gx: 6, gy: 5 }, 2)?.id).toBe('enemy');
    expect(hostileEnforcerNear(s, 'player', { gx: 12, gy: 12 }, 2)).toBeNull(); // too far
    // a rival's own collector is not an enforcer; a friendly enforcer isn't hostile
    expect(hostileEnforcerNear(s, 'rival-a', { gx: 6, gy: 5 }, 2)?.id).not.toBe('rivalCollector');
  });
});

describe('dispatchThreat — the run-2 ramp telegraph', () => {
  it('is HOT when a rival enforcer prowls near the source / HQ, CLEAR otherwise', () => {
    const s = seeded(300, 0); // takings waiting at the district-0 front
    const layout = buildMapLayout(s);
    const source = layout.businessTiles[s.districts[0].businesses[0].id];

    // no enemy yet -> clear
    expect(dispatchThreat(s, layout, 'player').hot).toBe(false);

    // park a rival enforcer right on the source tile -> hot, names the enemy
    s.units.push(spawnEnforcer('gun', source.gx, source.gy, 'rival-a'));
    const hot = dispatchThreat(s, layout, 'player');
    expect(hot.hot).toBe(true);
    expect(hot.enemyId).toBe('gun');

    // move it well beyond the route-danger radius -> clear again
    const gun = s.units.find((u) => u.id === 'gun')!;
    gun.pos = { gx: source.gx + ROUTE_DANGER_RADIUS + 2, gy: source.gy };
    expect(dispatchThreat(s, layout, 'player').hot).toBe(false);
  });

  it('is CLEAR when there is nothing to collect (no source endpoints to threaten)', () => {
    const s = createInitialState(1); // no takings
    const layout = buildMapLayout(s);
    s.units.push(spawnEnforcer('gun', layout.hqTiles['player'].gx + 10, layout.hqTiles['player'].gy, 'rival-a'));
    expect(dispatchThreat(s, layout, 'player').hot).toBe(false);
  });

  it('flags an enforcer prowling the HQ even before a run starts', () => {
    const s = seeded(300, 0);
    const layout = buildMapLayout(s);
    const hq = layout.hqTiles['player'];
    s.units.push(spawnEnforcer('gun', hq.gx, hq.gy, 'rival-a'));
    expect(dispatchThreat(s, layout, 'player').hot).toBe(true);
  });
});
