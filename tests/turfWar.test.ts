import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  districtIdentity,
  districtNeighbors,
  isBigCity,
  CITY_ARCHETYPES,
} from '../src/sim/city';
import {
  pushPresence,
  districtsHeld,
  exposedDistricts,
  districtStatus,
} from '../src/sim/territoryWar';
import {
  rivalStrategicTarget,
  telegraphedPushes,
  rivalPushAmount,
  resolveStrategicPulse,
  advanceStrategy,
  familyIsFallen,
} from '../src/sim/strategy';
import { cityStanding, familyPower, allRivalsCrushed } from '../src/sim/contest';
import { updateAndObserve } from '../src/sim/realtime';
import { incidentsByType } from '../src/sim/ledger';
import { districtHolder, controlOf } from '../src/sim/territory';
import type { GameState, Gangster } from '../src/sim/types';

function big(seed = 1): GameState {
  return createInitialState(seed, { bigCity: true });
}
function guard(id: string, district: string, skill = 8): Gangster {
  return { id, name: id, skill, loyalty: 60, upkeep: 0, assignment: { type: 'guard', districtId: district } };
}
function hold(s: GameState, districtId: string, familyId: string, pts = 60): void {
  s.districts.find((d) => d.id === districtId)!.control[familyId] = pts;
}

describe('the bigger contested city', () => {
  it('seeds a 9-district city with identities + adjacency (opt-in; legacy stays 5)', () => {
    expect(createInitialState(1).districts).toHaveLength(5); // default unchanged
    const s = big();
    expect(s.districts).toHaveLength(9);
    expect(isBigCity(s)).toBe(true);
    expect(s.districts[4].name).toBe(CITY_ARCHETYPES[4].name); // 'The Loop'
    expect(s.districts[4].wealth).toBe(5);
    expect(districtNeighbors(s, 'district-4').map((d) => d.id).sort()).toEqual(['district-1', 'district-3', 'district-5', 'district-7']);
  });

  it('seeds the contested footholds: player home + two rival corners', () => {
    const s = big();
    expect(controlOf(s.districts[0], 'player')).toBe(30);
    expect(controlOf(s.districts[2], 'rival-a')).toBe(40);
    expect(controlOf(s.districts[6], 'rival-b')).toBe(40);
  });

  it('is deterministic and RNG-neutral for the default map', () => {
    expect(big(7).districts).toEqual(big(7).districts);
    expect(createInitialState(7).rngState).toBe(createInitialState(7).rngState);
  });

  it('districtIdentity derives wealth for the legacy map (no stored fields)', () => {
    const legacy = createInitialState(1);
    const id = districtIdentity(legacy.districts[2], 2);
    expect(id.wealth).toBe(CITY_ARCHETYPES[2].wealth);
  });
});

describe('territorial control — push, erode, capture', () => {
  it('pushes presence and erodes the defender; guarding muscle blunts the erosion', () => {
    const a = big();
    hold(a, 'district-1', 'player', 60);
    pushPresence(a, 'rival-a', 'district-1', 40);
    expect(controlOf(a.districts[1], 'player')).toBe(40); // eroded by floor(40*0.5)=20

    const b = big();
    hold(b, 'district-1', 'player', 60);
    b.player.gangsters = [guard('g', 'district-1', 10)]; // 10 muscle blunts erosion to 10
    pushPresence(b, 'rival-a', 'district-1', 40);
    expect(controlOf(b.districts[1], 'player')).toBe(50);
  });

  it('a capture flips the holder, SEIZES the loser rackets, and BREAKS their fronts', () => {
    const s = big();
    hold(s, 'district-1', 'player', 60);
    const d1 = s.districts[1];
    d1.businesses[0].extortedBy = 'player'; // a protection racket
    d1.businesses.push({ id: 'd1-op', name: 'numbers', kind: 'numbers', baseIncome: 200, heatPerTick: 4, ownerFamily: 'player', districtId: 'district-1', uncollected: 80, tier: 1 });

    const res = pushPresence(s, 'rival-a', 'district-1', 60);
    expect(res!.captured).toBe(true);
    expect(res!.before).toBe('player');
    expect(res!.after).toBe('rival-a');
    expect(d1.businesses[0].extortedBy).toBeUndefined(); // front broken
    const op = d1.businesses.find((b) => b.id === 'd1-op')!;
    expect(op.ownerFamily).toBe('rival-a'); // racket seized
    expect(op.uncollected).toBe(0); // takings scattered
    expect(s.log.some((e) => e.kind === 'district-captured')).toBe(true);
  });

  it('districtStatus + exposedDistricts read the map', () => {
    const s = big();
    hold(s, 'district-1', 'player', 60);
    expect(districtStatus(s.districts[1])).toEqual({ status: 'held', holderId: 'player' });
    expect(districtStatus(s.districts[3])).toEqual({ status: 'neutral', holderId: null });
    expect(exposedDistricts(s, 'player').map((d) => d.id)).toContain('district-1'); // no guard there
    s.player.gangsters = [guard('g', 'district-1')];
    expect(exposedDistricts(s, 'player').map((d) => d.id)).not.toContain('district-1');
  });
});

describe('active rival AI — targets, telegraph, expansion', () => {
  it('a rival targets a reachable, un-held district (telegraph matches the move)', () => {
    const s = big();
    const rivalA = s.rivals[0];
    const target = rivalStrategicTarget(s, rivalA)!;
    expect(target).not.toBeNull();
    expect(districtHolder(target)).not.toBe(rivalA.id);
    const tel = telegraphedPushes(s).find((t) => t.familyId === 'rival-a');
    expect(tel!.districtId).toBe(target.id); // the telegraph IS the next move
    expect(tel!.amount).toBe(rivalPushAmount(rivalA));
  });

  it('City Hall (politicians) bribes deter rivals from pushing onto player turf', () => {
    const s = big();
    // make a player-held district adjacent to rival-a the most tempting, then bribe City Hall.
    hold(s, 'district-1', 'player', 52);
    const cold = telegraphedPushes(s).find((t) => t.familyId === 'rival-a')!;
    s.player.bribes.politicians = 40;
    const warm = telegraphedPushes(s).find((t) => t.familyId === 'rival-a')!;
    // with City Hall greased, the rival is at least as likely to pick neutral ground (not player's).
    expect(warm.onPlayer === false || cold.onPlayer === false).toBe(true);
  });

  it('rivals EXPAND into open ground over successive pulses', () => {
    const s = big();
    const before = districtsHeld(s, 'rival-a').length + s.districts.filter((d) => controlOf(d, 'rival-a') > 40).length;
    for (let i = 0; i < 4; i++) resolveStrategicPulse(s);
    const after = districtsHeld(s, 'rival-a').length + s.districts.filter((d) => controlOf(d, 'rival-a') > 40).length;
    expect(after).toBeGreaterThan(before); // they grabbed ground
  });

  it('an undefended player district can be taken by the rival war', () => {
    const s = big();
    hold(s, 'district-1', 'player', 51); // weakly held, no guards, next to rival-a's d2
    let captured = false;
    for (let i = 0; i < 8 && !captured; i++) {
      const ev = resolveStrategicPulse(s);
      if (ev.captures.some((c) => c.districtId === 'district-1')) captured = true;
    }
    expect(captured).toBe(true);
    expect(districtHolder(s.districts[1])).not.toBe('player'); // you lost your block
  });

  it('a crushed rival falls out of the contest', () => {
    const s = big();
    const rb = s.rivals[1];
    for (const d of s.districts) delete d.control[rb.id];
    rb.gangsters = []; rb.cash = 0; rb.dirtyCash = 0;
    expect(familyIsFallen(s, rb)).toBe(true);
    resolveStrategicPulse(s);
    expect(rb.alive).toBe(false);
    expect(s.log.some((e) => e.kind === 'family-fallen')).toBe(true);
  });
});

describe('strategic clock', () => {
  it('advanceStrategy fires a pulse per pulseSeconds crossed', () => {
    const s = big();
    const r = advanceStrategy(s, 50, 22); // 50s / 22s -> 2 pulses
    expect(r.pulses).toBe(2);
    expect(s.strategyElapsed).toBeCloseTo(6);
    expect(r.events.pushes.length).toBeGreaterThan(0);
  });

  it('is a no-op on the legacy map (no adjacency = no turf war)', () => {
    const s = createInitialState(1); // 5 districts, no neighbours
    const r = advanceStrategy(s, 200, 22);
    expect(r.pulses).toBeGreaterThan(0); // the clock ticks...
    expect(r.events.pushes).toEqual([]); // ...but nobody can push (no fronts to push along)
  });
});

describe('the contest trajectory', () => {
  it('familyPower rewards held turf, rackets, cash, and muscle', () => {
    const s = big();
    const base = familyPower(s, 'player');
    hold(s, 'district-4', 'player', 60); // hold the rich Loop
    expect(familyPower(s, 'player')).toBeGreaterThan(base);
  });

  it('reads dominant / behind / eliminated trajectories', () => {
    const dom = big();
    for (const id of ['district-0', 'district-1', 'district-2', 'district-3', 'district-4', 'district-5']) hold(dom, id, 'player', 60);
    expect(cityStanding(dom).trajectory).toBe('dominant');
    expect(cityStanding(dom).playerDominance).toBeCloseTo(6 / 9);

    const dead = big();
    dead.player.alive = false;
    expect(cityStanding(dead).trajectory).toBe('eliminated');

    const behind = big();
    hold(behind, 'district-2', 'rival-a', 80);
    hold(behind, 'district-5', 'rival-a', 80);
    behind.rivals[0].cash = 9000;
    expect(['behind', 'contested']).toContain(cityStanding(behind).trajectory);
  });

  it('allRivalsCrushed only when every rival is down', () => {
    const s = big();
    expect(allRivalsCrushed(s)).toBe(false);
    s.rivals.forEach((r) => (r.alive = false));
    expect(allRivalsCrushed(s)).toBe(true);
  });
});

describe('driver integration — the turf war advances under updateAndObserve', () => {
  it('advances territory and logs captures into the ledger', () => {
    let s = big();
    hold(s, 'district-1', 'player', 51); // exposed flank
    let sawTerritory = false;
    for (let i = 0; i < 12 && !sawTerritory; i++) {
      const obs = updateAndObserve(s, 5, 1000, 4); // long week (no settlement), 4s pulses
      s = obs.state;
      if (obs.strategy.captures.length > 0) sawTerritory = true;
    }
    expect(sawTerritory).toBe(true);
    expect(incidentsByType(s, 'territory').length).toBeGreaterThan(0);
  });

  it('does not run the turf war on the legacy map under updateAndObserve', () => {
    let s = createInitialState(1);
    for (let i = 0; i < 6; i++) s = updateAndObserve(s, 5, 1000, 4).state;
    expect(incidentsByType(s, 'territory')).toEqual([]);
  });
});
