import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInitialState } from '../src/sim/state';
import {
  advanceRoutes,
  createCollectionRoute,
  ensureBusinessCollector,
} from '../src/sim/routes';
import {
  buildMapLayout,
  businessTileOf,
  navGridForLayout,
  rushCollection,
} from '../src/sim/mapEconomy';
import type { GameState } from '../src/sim/types';

/** The first converted front after IsoScene's opening back-pay seed. */
function openingTake(freeRuns = 1): GameState {
  const state = createInitialState(1, { tutorialFreeRuns: freeRuns });
  const front = state.districts[0].businesses[0];
  front.extortedBy = state.player.id;
  front.uncollected = 320;
  return state;
}

describe('FP-01 opening collection race', () => {
  it('leaves first-shakedown back-pay available for the protected [C] rush', () => {
    const state = openingTake();
    const front = state.districts[0].businesses[0];
    const layout = buildMapLayout(state);
    const grid = navGridForLayout(layout);
    const fixed = ensureBusinessCollector(state, layout, state.player.id, front.id, grid)!.unit;

    // Deterministically place the autonomous collector at its stop: this is the exact frame that used
    // to drain the $320 before a player could press [C].
    fixed.pos = { ...businessTileOf(layout, front.id)! };
    fixed.path = [];
    advanceRoutes(state, layout, grid);

    expect(front.uncollected).toBe(320);
    expect(fixed.carrying).toBe(0);
    expect(fixed.routePhase).toBe('toStop');
    expect(state.tutorialFreeRuns).toBe(1);

    const rushed = rushCollection(state, layout, state.player.id, grid);
    expect(rushed.ok).toBe(true);
    if (!rushed.ok) return;
    expect(rushed.carrying).toBe(320);
    expect(rushed.unit.protectedRun).toBe(true);
    expect(front.uncollected).toBe(0);
    expect(state.tutorialFreeRuns).toBe(0);
  });

  it('resumes the fixed route immediately after the protected rush is spent', () => {
    const state = openingTake();
    const front = state.districts[0].businesses[0];
    const layout = buildMapLayout(state);
    const grid = navGridForLayout(layout);
    const fixed = ensureBusinessCollector(state, layout, state.player.id, front.id, grid)!.unit;
    fixed.pos = { ...businessTileOf(layout, front.id)! };
    fixed.path = [];

    advanceRoutes(state, layout, grid); // waits for the tutorial rush
    expect(rushCollection(state, layout, state.player.id, grid).ok).toBe(true);
    front.uncollected = 90; // a later accrual waiting when the fixed route gets its next frame
    advanceRoutes(state, layout, grid);

    expect(front.uncollected).toBe(0);
    expect(fixed.carrying).toBe(90);
    expect(fixed.routePhase).toBe('toBank');
  });

  it('preserves normal fixed-route collection when no tutorial run remains', () => {
    const state = openingTake(0);
    const front = state.districts[0].businesses[0];
    const layout = buildMapLayout(state);
    const grid = navGridForLayout(layout);
    const fixed = ensureBusinessCollector(state, layout, state.player.id, front.id, grid)!.unit;
    fixed.pos = { ...businessTileOf(layout, front.id)! };
    fixed.path = [];

    advanceRoutes(state, layout, grid);

    expect(front.uncollected).toBe(0);
    expect(fixed.carrying).toBe(320);
    expect(fixed.routePhase).toBe('toBank');
  });

  it('does not freeze a deliberate multi-stop route during onboarding', () => {
    const state = openingTake();
    const front = state.districts[0].businesses[0];
    const layout = buildMapLayout(state);
    const grid = navGridForLayout(layout);
    const deliberate = createCollectionRoute(state, layout, state.player.id, grid)!.unit;
    deliberate.pos = { ...businessTileOf(layout, front.id)! };
    deliberate.path = [];

    advanceRoutes(state, layout, grid);

    expect(front.uncollected).toBe(0);
    expect(deliberate.carrying).toBe(320);
  });

  it('releases the one-time collection gate when the player skips the tutorial', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'scenes', 'IsoScene.ts'), 'utf8');
    const skip = source.slice(source.indexOf('  private skipTutorial('), source.indexOf('// ── the city', source.indexOf('  private skipTutorial(')));
    expect(skip).toContain('this.state.tutorialFreeRuns = 0');
    expect(skip).toMatch(/collections now run automatically/i);
  });
});
