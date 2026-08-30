import { describe, expect, it } from 'vitest';
import { collectionPillLabel, collectionStatusView, compactCollectionCash } from '../src/sim/collectionStatus';
import { buildMapLayout, businessTileOf, hqTileOf, rushCollection } from '../src/sim/mapEconomy';
import { ensureBusinessCollector } from '../src/sim/routes';
import { createInitialState } from '../src/sim/state';

describe('FP-01 collection status — automatic routes versus optional rush', () => {
  it('says automatic collection has not started before the first front folds', () => {
    const state = createInitialState(1);
    expect(collectionStatusView(state, state.player.id)).toEqual({
      automaticCollectors: 0,
      automaticOutbound: 0,
      automaticReturning: 0,
      cashWaiting: 0,
      rushableNow: 0,
      cashInTransit: 0,
      rushInFlight: false,
      tutorialFirstTakeWaiting: false,
      rushState: 'nothing-due',
      rushLabel: 'AUTO — NOTHING DUE',
    });
  });

  it('shows the tutorial take waiting while its fixed collector remains automatic', () => {
    const state = createInitialState(2, { tutorialFreeRuns: 1 });
    const front = state.districts[0].businesses[0];
    front.extortedBy = state.player.id;
    front.uncollected = 180;
    const layout = buildMapLayout(state);
    ensureBusinessCollector(state, layout, state.player.id, front.id);

    expect(collectionStatusView(state, state.player.id)).toMatchObject({
      automaticCollectors: 1,
      automaticOutbound: 1,
      automaticReturning: 0,
      cashWaiting: 180,
      rushableNow: 180,
      cashInTransit: 0,
      tutorialFirstTakeWaiting: true,
      rushState: 'ready',
      rushLabel: 'RUSH $180 NOW',
    });
  });

  it('reports an automatic collector returning with the take', () => {
    const state = createInitialState(3, { tutorialFreeRuns: 0 });
    const front = state.districts[0].businesses[0];
    front.extortedBy = state.player.id;
    const layout = buildMapLayout(state);
    const collector = ensureBusinessCollector(state, layout, state.player.id, front.id)!.unit;
    collector.pos = { ...businessTileOf(layout, front.id)! };
    collector.path = [{ ...hqTileOf(layout, state.player.id)! }];
    collector.routePhase = 'toBank';
    collector.carrying = 240;

    expect(collectionStatusView(state, state.player.id)).toMatchObject({
      automaticCollectors: 1,
      automaticOutbound: 0,
      automaticReturning: 1,
      cashWaiting: 0,
      rushableNow: 0,
      cashInTransit: 240,
      rushInFlight: false,
      rushState: 'nothing-due',
      rushLabel: 'AUTO — NOTHING DUE',
    });
  });

  it('distinguishes one optional rush from the continuing automatic route', () => {
    const state = createInitialState(4, { tutorialFreeRuns: 0 });
    const front = state.districts[0].businesses[0];
    front.extortedBy = state.player.id;
    front.uncollected = 300;
    const layout = buildMapLayout(state);
    ensureBusinessCollector(state, layout, state.player.id, front.id);
    expect(rushCollection(state, layout, state.player.id).ok).toBe(true);

    expect(collectionStatusView(state, state.player.id)).toMatchObject({
      automaticCollectors: 1,
      cashWaiting: 0,
      rushableNow: 0,
      cashInTransit: 300,
      rushInFlight: true,
      rushState: 'in-flight',
      rushLabel: 'RUSH IN FLIGHT',
    });
  });

  it('keeps citywide WAIT truthful while promising only the largest district rush', () => {
    const state = createInitialState(6, { tutorialFreeRuns: 0 });
    const first = state.districts[0].businesses[0];
    const second = state.districts[1].businesses[0];
    first.extortedBy = state.player.id;
    first.uncollected = 100;
    second.extortedBy = state.player.id;
    second.uncollected = 350;

    const status = collectionStatusView(state, state.player.id);
    expect(status.cashWaiting).toBe(450);
    expect(status.rushableNow).toBe(350);
    expect(status.rushLabel).toBe('RUSH $350 NOW');
  });

  it('is a pure read', () => {
    const state = createInitialState(5);
    const before = JSON.stringify(state);
    collectionStatusView(state, state.player.id);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('keeps every legacy pill state inside its fixed-width copy budget', () => {
    const base = collectionStatusView(createInitialState(7), 'player');
    const samples = [
      base,
      { ...base, automaticCollectors: 1, cashWaiting: 180, rushableNow: 180, rushState: 'ready' as const },
      { ...base, automaticCollectors: 3, cashWaiting: 180, rushableNow: 180, cashInTransit: 240, rushState: 'ready' as const },
      { ...base, automaticCollectors: 2, cashInTransit: 300, rushInFlight: true, rushState: 'in-flight' as const },
      { ...base, automaticCollectors: 4, cashInTransit: 240 },
      { ...base, automaticCollectors: 12, cashWaiting: 25_000, rushableNow: 20_000, cashInTransit: 25_000, rushState: 'ready' as const },
    ];
    for (const sample of samples) expect(collectionPillLabel(sample).length).toBeLessThanOrEqual(37);
  });

  it('compacts strategic-scale cash without hiding exact small amounts', () => {
    expect(compactCollectionCash(999)).toBe('999');
    expect(compactCollectionCash(1_000)).toBe('1k');
    expect(compactCollectionCash(25_000)).toBe('25k');
    expect(compactCollectionCash(1_250)).toBe('1.3k');
    expect(compactCollectionCash(2_000_000)).toBe('2m');
  });
});
