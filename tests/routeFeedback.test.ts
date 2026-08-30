import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { advanceRoutes, ensureBusinessCollector } from '../src/sim/routes';
import { buildMapLayout, businessTileOf, hqTileOf, navGridForLayout } from '../src/sim/mapEconomy';

describe('FP-01 automated route feedback events', () => {
  it('reports the real pickup and deposit without creating a second money path', () => {
    const state = createInitialState(1, { tutorialFreeRuns: 0 });
    const front = state.districts[0].businesses[0];
    front.extortedBy = state.player.id;
    front.uncollected = 180;
    const layout = buildMapLayout(state);
    const grid = navGridForLayout(layout);
    const collector = ensureBusinessCollector(state, layout, state.player.id, front.id, grid)!.unit;

    collector.pos = { ...businessTileOf(layout, front.id)! };
    collector.path = [];
    const pickup = advanceRoutes(state, layout, grid);
    expect(pickup).toEqual([{
      kind: 'pickup', collectorId: collector.id, familyId: state.player.id,
      amount: 180, businessId: front.id,
    }]);
    expect(collector.carrying).toBe(180);

    collector.pos = { ...hqTileOf(layout, state.player.id)! };
    collector.path = [];
    const cashBefore = state.player.cash;
    const deposit = advanceRoutes(state, layout, grid);
    expect(deposit).toEqual([expect.objectContaining({
      kind: 'deposit', collectorId: collector.id, familyId: state.player.id,
    })]);
    const banked = deposit[0].amount;
    expect(banked).toBeGreaterThan(0);
    expect(state.player.cash).toBe(cashBefore + banked);
    expect(collector.carrying).toBe(0);
  });

  it('repairs an orphaned saved route and sends its idle collector back out from HQ', () => {
    const state = createInitialState(2, { tutorialFreeRuns: 0 });
    const front = state.districts[0].businesses[0];
    front.extortedBy = state.player.id;
    const layout = buildMapLayout(state);
    const grid = navGridForLayout(layout);
    const collector = ensureBusinessCollector(state, layout, state.player.id, front.id, grid)!.unit;
    state.routes = [];
    collector.pos = { ...hqTileOf(layout, state.player.id)! };
    collector.path = [];

    expect(ensureBusinessCollector(state, layout, state.player.id, front.id, grid)).toBeNull();
    expect(state.routes).toEqual([{ id: collector.routeId, familyId: state.player.id, stops: [front.id] }]);
    expect(collector.path.at(-1)).toEqual(businessTileOf(layout, front.id));
  });

  it('never treats an idle collector at HQ as if it reached its storefront', () => {
    const state = createInitialState(3, { tutorialFreeRuns: 0 });
    const front = state.districts[0].businesses[0];
    front.extortedBy = state.player.id;
    front.uncollected = 120;
    const layout = buildMapLayout(state);
    const grid = navGridForLayout(layout);
    const collector = ensureBusinessCollector(state, layout, state.player.id, front.id, grid)!.unit;
    collector.pos = { ...hqTileOf(layout, state.player.id)! };
    collector.path = [];

    expect(advanceRoutes(state, layout, grid)).toEqual([]);
    expect(front.uncollected).toBe(120);
    expect(collector.carrying).toBe(0);
    expect(collector.path.at(-1)).toEqual(businessTileOf(layout, front.id));
  });
});
