import { describe, it, expect } from 'vitest';
import {
  facingFromVector,
  unitFacing,
  facesRight,
  inspectUnit,
  inspectBusiness,
  inspectDistrict,
} from '../src/sim/inspect';
import { spawnCollector, spawnEnforcer, setUnitPath } from '../src/sim/movement';
import { createInitialState } from '../src/sim/state';
import { startCollectorRun, buildMapLayout } from '../src/sim/mapEconomy';
import type { GameState } from '../src/sim/types';

describe('facingFromVector — 8-way compass (+x=E, +y=S)', () => {
  it('snaps the cardinal and diagonal directions', () => {
    expect(facingFromVector(1, 0)).toBe('E');
    expect(facingFromVector(0, 1)).toBe('S');
    expect(facingFromVector(-1, 0)).toBe('W');
    expect(facingFromVector(0, -1)).toBe('N');
    expect(facingFromVector(1, 1)).toBe('SE');
    expect(facingFromVector(-1, 1)).toBe('SW');
    expect(facingFromVector(-1, -1)).toBe('NW');
    expect(facingFromVector(1, -1)).toBe('NE');
  });

  it('returns null for a zero vector', () => {
    expect(facingFromVector(0, 0)).toBeNull();
    expect(facingFromVector(1e-12, -1e-12)).toBeNull();
  });

  it('facesRight is true for the eastward facings only', () => {
    expect(['E', 'NE', 'SE'].map(facesRight as (f: string) => boolean)).toEqual([true, true, true]);
    expect(['W', 'NW', 'SW', 'N', 'S'].map(facesRight as (f: string) => boolean)).toEqual([false, false, false, false, false]);
  });
});

describe('unitFacing — heads toward the next waypoint, default S when idle', () => {
  it('faces the next waypoint and defaults to S with no path', () => {
    const u = spawnCollector('c', 5, 5, 'player', 100);
    expect(unitFacing(u)).toBe('S'); // idle
    setUnitPath(u, [{ gx: 8, gy: 5 }]); // due east
    expect(unitFacing(u)).toBe('E');
    setUnitPath(u, [{ gx: 5, gy: 2 }]); // due north
    expect(unitFacing(u)).toBe('N');
  });
});

describe('inspectUnit — the unit tooltip model', () => {
  it('describes a carrying player collector with owner, cash, and threat', () => {
    const s = createInitialState(1);
    const c = spawnCollector('c', 5, 5, 'player', 250);
    setUnitPath(c, [{ gx: 9, gy: 5 }]);
    s.units.push(c, spawnEnforcer('gun', 5.4, 5, 'rival-a')); // hostile within ambush range
    const v = inspectUnit(s, 'c')!;
    expect(v.kind).toBe('Collector');
    expect(v.ownerName).toBe('Player Family');
    expect(v.carrying).toBe(250);
    expect(v.vulnerable).toBe(true);
    expect(v.threat).toBe('ambush');
    expect(v.facing).toBe('E');
  });

  it('labels an enforcer and returns null for an unknown id', () => {
    const s = createInitialState(1);
    s.units.push(spawnEnforcer('e', 0, 0, 'rival-a'));
    expect(inspectUnit(s, 'e')!.kind).toBe('Enforcer');
    expect(inspectUnit(s, 'e')!.ownerName).toBe('The Moretti Family');
    expect(inspectUnit(s, 'ghost')).toBeNull();
  });
});

describe('inspectBusiness — the building tooltip model', () => {
  function extorted(): GameState {
    const s = createInitialState(1);
    const front = s.districts[0].businesses[0];
    front.extortedBy = 'player';
    front.uncollected = 120;
    return s;
  }

  it('flags the paying-protection state and reports earner + income + takings', () => {
    const s = extorted();
    const front = s.districts[0].businesses[0];
    const v = inspectBusiness(s, front.id)!;
    expect(v.kind).toBe('front');
    expect(v.payingProtection).toBe(true);
    expect(v.earnerName).toBe('Player Family');
    expect(v.income).toBeGreaterThan(0);
    expect(v.uncollected).toBe(120);
    expect(v.districtName).toBe('Dockside');
  });

  it('an un-extorted front is not paying protection and has no earner', () => {
    const s = createInitialState(1);
    const front = s.districts[1].businesses[0];
    const v = inspectBusiness(s, front.id)!;
    expect(v.payingProtection).toBe(false);
    expect(v.earnerName).toBeNull();
    expect(inspectBusiness(s, 'nope')).toBeNull();
  });
});

describe('inspectDistrict — the district tooltip model', () => {
  it('reports holder, police presence, and player control', () => {
    const s = createInitialState(1);
    const v = inspectDistrict(s, 'district-0')!;
    expect(v.name).toBe('Dockside');
    expect(v.playerControl).toBe(30);
    expect(v.policePresence).toBeGreaterThanOrEqual(0);
    expect(v.businessCount).toBeGreaterThanOrEqual(2);
    expect(inspectDistrict(s, 'nope')).toBeNull();
  });
});

describe('integration — a dispatched collector inspects correctly', () => {
  it('carries the gathered take and faces toward HQ', () => {
    const s = createInitialState(1);
    const front = s.districts[0].businesses[0];
    front.extortedBy = 'player';
    front.uncollected = 300;
    const layout = buildMapLayout(s);
    const run = startCollectorRun(s, layout, 'player', 'district-0');
    const v = inspectUnit(s, run.unit!.id)!;
    expect(v.kind).toBe('Collector');
    expect(v.carrying).toBe(300);
    expect(v.vulnerable).toBe(true);
  });
});
