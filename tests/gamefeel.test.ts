import { describe, it, expect } from 'vitest';
import {
  collectorCarryView,
  carryingCollectors,
  isThreatTo,
  threatLevelForDistance,
  collectorThreat,
  threatenedCollectors,
  anyCollectorInDanger,
} from '../src/sim/gamefeel';
import { spawnCollector, spawnEnforcer, spawnUnit, type MovableUnit } from '../src/sim/movement';
import { createInitialState } from '../src/sim/state';
import { INTERCEPT_RADIUS, DANGER_RADIUS } from '../src/sim/constants';
import type { GameState } from '../src/sim/types';

function stateWith(units: MovableUnit[]): GameState {
  const s = createInitialState(1);
  s.units.push(...units);
  return s;
}

describe('collectorCarryView — what is walking across the map', () => {
  it('reports the carried amount and vulnerability for a carrying collector', () => {
    const v = collectorCarryView(spawnCollector('c', 0, 0, 'player', 450));
    expect(v).toEqual({ id: 'c', carrying: 450, vulnerable: true });
  });

  it('an empty collector carries 0 and is not vulnerable', () => {
    const v = collectorCarryView(spawnCollector('c', 0, 0, 'player', 0));
    expect(v).toEqual({ id: 'c', carrying: 0, vulnerable: false });
  });

  it('a non-collector never reads as carrying or vulnerable', () => {
    expect(collectorCarryView(spawnEnforcer('e', 0, 0, 'player'))).toEqual({ id: 'e', carrying: 0, vulnerable: false });
    expect(collectorCarryView(spawnUnit('n', 0, 0))).toEqual({ id: 'n', carrying: 0, vulnerable: false });
  });

  it('carryingCollectors lists only collectors with a take', () => {
    const s = stateWith([
      spawnCollector('full', 1, 1, 'player', 200),
      spawnCollector('empty', 2, 2, 'player', 0),
      spawnEnforcer('gun', 3, 3, 'rival-a'),
    ]);
    expect(carryingCollectors(s).map((v) => v.id)).toEqual(['full']);
    expect(carryingCollectors(s)[0].carrying).toBe(200);
  });
});

describe('threatLevelForDistance — the danger bands', () => {
  it('classifies ambush / threatened / safe by radius', () => {
    expect(threatLevelForDistance(INTERCEPT_RADIUS - 0.01)).toBe('ambush');
    expect(threatLevelForDistance(INTERCEPT_RADIUS)).toBe('ambush'); // inclusive
    expect(threatLevelForDistance((INTERCEPT_RADIUS + DANGER_RADIUS) / 2)).toBe('threatened');
    expect(threatLevelForDistance(DANGER_RADIUS)).toBe('threatened'); // inclusive
    expect(threatLevelForDistance(DANGER_RADIUS + 0.01)).toBe('safe');
  });
});

describe('isThreatTo — only hostile enforcers threaten', () => {
  it('a hostile enforcer threatens; a friendly enforcer or neutral does not', () => {
    const collector = spawnCollector('c', 0, 0, 'player', 100);
    expect(isThreatTo(spawnEnforcer('e', 0, 0, 'rival-a'), collector)).toBe(true);
    expect(isThreatTo(spawnEnforcer('f', 0, 0, 'player'), collector)).toBe(false); // same faction
    expect(isThreatTo(spawnUnit('n', 0, 0), collector)).toBe(false); // neutral, no role
    expect(isThreatTo(spawnCollector('c2', 0, 0, 'rival-a', 50), collector)).toBe(false); // not an enforcer
  });
});

describe('collectorThreat — nearest hostile + level for one collector', () => {
  it('flags a collector with a hostile enforcer in the danger band', () => {
    const collector = spawnCollector('c', 5, 5, 'player', 300);
    const near = spawnEnforcer('near', 6.5, 5, 'rival-a'); // 1.5 tiles away => threatened
    const t = collectorThreat(collector, [collector, near]);
    expect(t.collectorId).toBe('c');
    expect(t.carrying).toBe(300);
    expect(t.nearestEnemyId).toBe('near');
    expect(t.distance).toBeCloseTo(1.5);
    expect(t.level).toBe('threatened');
  });

  it('reports ambush level when the enforcer is within INTERCEPT_RADIUS', () => {
    const collector = spawnCollector('c', 5, 5, 'player', 300);
    const onTop = spawnEnforcer('onTop', 5.3, 5, 'rival-a'); // 0.3 => ambush
    expect(collectorThreat(collector, [collector, onTop]).level).toBe('ambush');
  });

  it('is safe when the only enemy is beyond DANGER_RADIUS, and picks the NEAREST of several', () => {
    const collector = spawnCollector('c', 5, 5, 'player', 300);
    const far = spawnEnforcer('far', 5 + DANGER_RADIUS + 1, 5, 'rival-a');
    expect(collectorThreat(collector, [collector, far]).level).toBe('safe');

    const a = spawnEnforcer('a', 8, 5, 'rival-a'); // 3 away
    const b = spawnEnforcer('b', 6.5, 5, 'rival-a'); // 1.5 away (nearer)
    const t = collectorThreat(collector, [collector, a, b]);
    expect(t.nearestEnemyId).toBe('b');
    expect(t.level).toBe('threatened');
  });

  it('an empty collector is always safe (nothing at stake)', () => {
    const empty = spawnCollector('c', 5, 5, 'player', 0);
    const near = spawnEnforcer('near', 5.2, 5, 'rival-a');
    expect(collectorThreat(empty, [empty, near])).toEqual({
      collectorId: 'c', carrying: 0, nearestEnemyId: null, distance: Infinity, level: 'safe',
    });
  });
});

describe('threatenedCollectors — the proximity-warning selector', () => {
  it('flags exactly the carrying collectors that have an enemy in range', () => {
    const inDanger = spawnCollector('danger', 5, 5, 'player', 300);
    const safeFar = spawnCollector('safe', 0, 0, 'player', 300); // no enemy near
    const empty = spawnCollector('empty', 5, 5, 'player', 0); // carrying nothing
    const gun = spawnEnforcer('gun', 6, 5, 'rival-a'); // 1 tile from 'danger'
    const s = stateWith([inDanger, safeFar, empty, gun]);

    const flagged = threatenedCollectors(s);
    expect(flagged.map((t) => t.collectorId)).toEqual(['danger']);
    expect(flagged[0].nearestEnemyId).toBe('gun');
    expect(anyCollectorInDanger(s)).toBe(true);
  });

  it('returns nothing when no carrying collector has an enemy near', () => {
    const s = stateWith([
      spawnCollector('c', 0, 0, 'player', 300),
      spawnEnforcer('gun', 15, 15, 'rival-a'), // far away
    ]);
    expect(threatenedCollectors(s)).toEqual([]);
    expect(anyCollectorInDanger(s)).toBe(false);
  });

  it('is deterministic for identical positions', () => {
    const build = () => stateWith([
      spawnCollector('c', 5, 5, 'player', 300),
      spawnEnforcer('gun', 6, 5, 'rival-a'),
    ]);
    expect(threatenedCollectors(build())).toEqual(threatenedCollectors(build()));
  });
});
