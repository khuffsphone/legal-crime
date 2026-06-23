import { describe, it, expect } from 'vitest';
import {
  buildMapLayout,
  businessTileOf,
  hqTileOf,
  businessAtTile,
  hasFootholdForExtort,
  startCollectorRun,
  rushCollection,
  rushCollectorInFlight,
  depositCollector,
  processCollectorArrivals,
  extortAtTile,
  laidOutBusinessIds,
} from '../src/sim/mapEconomy';
import { createInitialState } from '../src/sim/state';
import { collectionSafety, collectionFraction } from '../src/sim/collection';
import { Rng } from '../src/sim/rng';
import { spawnEnforcer, unitDestination } from '../src/sim/movement';
import { update } from '../src/sim/realtime';
import { allBusinesses } from '../src/sim/economy';
import type { GameState } from '../src/sim/types';

/** A world where the player extorts the first front in district-0, with takings piled up. */
function seeded(take = 300): GameState {
  const s = createInitialState(1);
  const front = s.districts[0].businesses[0];
  front.extortedBy = 'player';
  front.uncollected = take;
  return s;
}

describe('buildMapLayout', () => {
  it('gives every business a tile and every family an HQ', () => {
    const s = createInitialState(1);
    const layout = buildMapLayout(s);
    for (const b of allBusinesses(s)) {
      expect(businessTileOf(layout, b.id)).toBeDefined();
    }
    expect(hqTileOf(layout, 'player')).toEqual({ gx: 15, gy: 15 });
    expect(hqTileOf(layout, 'rival-a')).toEqual({ gx: 15, gy: 0 });
    expect(hqTileOf(layout, 'rival-b')).toEqual({ gx: 0, gy: 15 });
    expect(laidOutBusinessIds(layout)).toHaveLength(allBusinesses(s).length);
  });

  it('resolves a tile back to the business that occupies it', () => {
    const s = createInitialState(1);
    const layout = buildMapLayout(s);
    const front = s.districts[0].businesses[0];
    const tile = businessTileOf(layout, front.id)!;
    expect(businessAtTile(layout, tile)).toBe(front.id);
    expect(businessAtTile(layout, { gx: 0, gy: 0 })).toBeUndefined(); // empty ground
  });

  it('is deterministic for the same seed', () => {
    expect(buildMapLayout(createInitialState(7))).toEqual(buildMapLayout(createInitialState(7)));
  });
});

describe('hasFootholdForExtort — control gates map actions', () => {
  it('allows action where the family holds enough control, blocks where it does not', () => {
    const s = createInitialState(1);
    expect(hasFootholdForExtort(s, 'player', 'district-0')).toBe(true); // player control 30 >= 20
    expect(hasFootholdForExtort(s, 'player', 'district-2')).toBe(false); // rival-a turf
    expect(hasFootholdForExtort(s, 'player', 'nope')).toBe(false);
  });
});

describe('startCollectorRun — collector spawns at a business and paths to HQ', () => {
  it('spawns at the business tile carrying the take and heads for the family HQ', () => {
    const s = seeded(300);
    const layout = buildMapLayout(s);
    const front = s.districts[0].businesses[0];
    const startTile = businessTileOf(layout, front.id)!;

    const run = startCollectorRun(s, layout, 'player', 'district-0');
    expect(run.carrying).toBe(300);
    const c = run.unit!;
    expect(c.pos).toEqual(startTile); // spawned AT the business
    expect(c.factionId).toBe('player');
    expect(c.role).toBe('collector');
    expect(c.originDistrictId).toBe('district-0');
    expect(unitDestination(c)).toEqual({ gx: 15, gy: 15 }); // routed to HQ
    expect(front.uncollected).toBe(0); // take is now in transit, not on the books
    expect(s.units).toContain(c);
  });

  it('returns null when there is nothing to collect', () => {
    const s = createInitialState(1); // no takings accrued
    const layout = buildMapLayout(s);
    expect(startCollectorRun(s, layout, 'player', 'district-0')).toEqual({ unit: null, carrying: 0 });
  });

  it('is deterministic', () => {
    const a = seeded(420);
    const b = seeded(420);
    const ra = startCollectorRun(a, buildMapLayout(a), 'player', 'district-0');
    const rb = startCollectorRun(b, buildMapLayout(b), 'player', 'district-0');
    expect(ra.carrying).toBe(rb.carrying);
    expect(ra.unit!.pos).toEqual(rb.unit!.pos);
    expect(ra.unit!.path).toEqual(rb.unit!.path);
  });
});

describe('RTS-30d-fix — rushCollection EXPEDITES the autonomous flow (no second money path)', () => {
  it('rushes the accrued take home via the existing collector machinery (take goes in transit)', () => {
    const s = seeded(300);
    const layout = buildMapLayout(s);
    const front = s.districts[0].businesses[0];

    const out = rushCollection(s, layout, 'player');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.carrying).toBe(300);
    expect(out.districtId).toBe('district-0');
    expect(out.unit.role).toBe('collector');
    expect(unitDestination(out.unit)).toEqual({ gx: 15, gy: 15 }); // routed to HQ — the SAME path startCollectorRun uses
    expect(front.uncollected).toBe(0); // drained the SAME accrual — not a parallel take
    expect(s.units).toContain(out.unit);
  });

  it('rushes the district with the LARGEST waiting take first', () => {
    const s = createInitialState(1);
    s.districts[0].businesses[0].extortedBy = 'player';
    s.districts[0].businesses[0].uncollected = 100;
    const d1 = s.districts[1];
    d1.businesses[0].extortedBy = 'player';
    d1.businesses[0].uncollected = 900; // the bigger take
    const out = rushCollection(s, buildMapLayout(s), 'player');
    expect(out.ok).toBe(true);
    if (out.ok) { expect(out.districtId).toBe(d1.id); expect(out.carrying).toBe(900); }
  });

  it('is a no-op with reason "nothing" when no takings have accrued', () => {
    const s = createInitialState(1); // nothing extorted yet
    expect(rushCollection(s, buildMapLayout(s), 'player')).toEqual({ ok: false, reason: 'nothing' });
  });

  it('is a no-op with reason "in-flight" when a rushed collector is already on its way', () => {
    const s = seeded(300);
    const layout = buildMapLayout(s);
    const first = rushCollection(s, layout, 'player');
    expect(first.ok).toBe(true);
    expect(rushCollectorInFlight(s, 'player')).toBe(true);
    // even with fresh takings, a second rush refuses until the first banks.
    s.districts[1].businesses[0].extortedBy = 'player';
    s.districts[1].businesses[0].uncollected = 500;
    expect(rushCollection(s, layout, 'player')).toEqual({ ok: false, reason: 'in-flight' });
  });

  it('a perpetual ROUTE collector (routeId set) does NOT block a rush — only a dispatched rush does', () => {
    const s = seeded(300);
    const layout = buildMapLayout(s);
    // simulate an autonomous per-front route collector carrying a take on its rounds.
    s.units.push({ ...startCollectorRun(seeded(300), buildMapLayout(seeded(300)), 'player', 'district-0').unit!, routeId: 'route-x' });
    expect(rushCollectorInFlight(s, 'player')).toBe(false); // route collectors are autonomous, not a manual rush
    expect(rushCollection(s, layout, 'player').ok).toBe(true);
  });
});

describe('depositCollector / processCollectorArrivals — reaching HQ deposits (existing rules)', () => {
  it('banks the take at HQ using the exact existing collection skim', () => {
    const s = seeded(300);
    const layout = buildMapLayout(s);
    const run = startCollectorRun(s, layout, 'player', 'district-0');
    const c = run.unit!;

    // Teleport the collector to its HQ (movement itself is covered by RTS-2 tests).
    c.pos = { ...layout.hqTiles['player'] };
    c.path = [];

    // Predict the deposit with the SAME existing rules + the SAME RNG cursor.
    const d0 = s.districts[0];
    const safety = collectionSafety(d0.policePresence, s.player.heat, 0);
    const roll = new Rng(s.rngState).nextFloat();
    const expected = Math.floor(300 * collectionFraction(safety, roll));

    const events = processCollectorArrivals(s, layout);
    expect(events).toEqual([{ collectorId: c.id, familyId: 'player', banked: expected }]);
    expect(expected).toBeGreaterThan(0);
    expect(s.player.cash).toBe(3500 + expected); // STARTING_CASH (RTS-21: 3500) + banked
    expect(s.player.dirtyCash).toBe(expected); // banked as dirty money
    expect(c.carrying).toBe(0);
  });

  it('does not deposit a collector that has not reached its HQ', () => {
    const s = seeded(300);
    const layout = buildMapLayout(s);
    const c = startCollectorRun(s, layout, 'player', 'district-0').unit!;
    // Still at the business tile, mid-route.
    expect(processCollectorArrivals(s, layout)).toEqual([]);
    expect(c.carrying).toBe(300);
    expect(s.player.dirtyCash).toBe(0);
  });

  it('depositCollector with no source district banks the full take (no skim)', () => {
    const s = createInitialState(1);
    const run = startCollectorRun(seededInto(s, 200), buildMapLayout(s), 'player', 'district-0').unit!;
    delete run.originDistrictId; // simulate a take with no district context
    const banked = depositCollector(s, run);
    expect(banked).toBe(200); // full credit, no skim
    expect(s.player.dirtyCash).toBe(200);
    expect(run.carrying).toBe(0);
  });
});

/** Arrange takings on an existing state and return it (for composing fixtures). */
function seededInto(s: GameState, take: number): GameState {
  const front = s.districts[0].businesses[0];
  front.extortedBy = 'player';
  front.uncollected = take;
  return s;
}

describe('intercept-able in transit — robbed runs bank nothing (RTS-4 × RTS-5)', () => {
  it('a rival enforcer on the route steals the take; the collector deposits nothing', () => {
    const s = seeded(300);
    const layout = buildMapLayout(s);
    const c = startCollectorRun(s, layout, 'player', 'district-0').unit!;
    // Park a rival enforcer right on the collector's spawn tile.
    s.units.push(spawnEnforcer('gun', c.pos.gx, c.pos.gy, 'rival-a'));
    const rivalA = s.rivals.find((r) => r.id === 'rival-a')!;

    const res = update(s, 0.01); // movement is tiny; interception resolves on contact
    expect(res.interceptions).toHaveLength(1);
    expect(rivalA.dirtyCash).toBe(300); // attacker banks the bag
    expect(c.carrying).toBe(0);

    // Even if it now reaches HQ, there is nothing to deposit.
    c.pos = { ...layout.hqTiles['player'] };
    c.path = [];
    expect(processCollectorArrivals(s, layout)).toEqual([]);
    expect(s.player.dirtyCash).toBe(0);
  });
});

describe('extortAtTile — extortion targets a building, gated by control', () => {
  it('targets the building under the click and dispatches the existing extort command', () => {
    const s = createInitialState(1);
    const layout = buildMapLayout(s);
    const front = s.districts[0].businesses[0];
    const tile = businessTileOf(layout, front.id)!;

    const res = extortAtTile(s, layout, 'player', tile);
    expect(res).toEqual({ businessId: front.id, targeted: true });
    expect(s.log.some((e) => e.kind.startsWith('extort'))).toBe(true);
  });

  it('does nothing on empty ground', () => {
    const s = createInitialState(1);
    const layout = buildMapLayout(s);
    expect(extortAtTile(s, layout, 'player', { gx: 0, gy: 0 })).toEqual({ targeted: false });
  });

  it('control gates the action: extorting where the family lacks control is blocked', () => {
    const s = createInitialState(1);
    const layout = buildMapLayout(s);
    const farFront = s.districts[2].businesses[0]; // rival-a turf, player has no control
    const tile = businessTileOf(layout, farFront.id)!;

    const res = extortAtTile(s, layout, 'player', tile);
    expect(res.targeted).toBe(true); // it DID target the right building...
    expect(farFront.extortedBy).toBeUndefined(); // ...but control gating blocked the takeover
    expect(s.log.some((e) => e.kind === 'extort-blocked')).toBe(true);
  });
});
