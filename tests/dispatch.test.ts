// RTS-29.1 — the muscle-dispatch seam (the [E]-extort blocker). These exercise the scene dispatch
// path that the 11 pure-sim reshape tests never touched: faction/role MUST be read from the VIEW
// projection, not from raw sim units (muscle carries no factionId/role).
import { describe, it, expect } from 'vitest';
import { pickIdleMuscle, type MuscleCandidate } from '../src/scenes/dispatch';

const none = new Set<string>();

describe('pickIdleMuscle — dispatch resolves faction from the VIEW layer', () => {
  it('REGRESSION: two idle player thugs (no sim factionId) ARE selectable — picks the first', () => {
    // models the fresh start: muscle units whose faction lives ONLY on the UnitView projection.
    const views: MuscleCandidate[] = [
      { id: 'muscle-1', faction: 'player', isCollector: false, idle: true },
      { id: 'muscle-2', faction: 'player', isCollector: false, idle: true },
    ];
    expect(pickIdleMuscle(views, none)?.id).toBe('muscle-1');
  });

  it('never picks a collector or a rival', () => {
    const views: MuscleCandidate[] = [
      { id: 'collector-booze', faction: 'player', isCollector: true, idle: true },
      { id: 'rival-gun', faction: 'rival', isCollector: false, idle: true },
      { id: 'muscle-1', faction: 'player', isCollector: false, idle: true },
    ];
    expect(pickIdleMuscle(views, none)?.id).toBe('muscle-1');
  });

  it('skips a busy thug (mid-walk) and an already-tasked one', () => {
    const views: MuscleCandidate[] = [
      { id: 'muscle-1', faction: 'player', isCollector: false, idle: false }, // walking
      { id: 'muscle-2', faction: 'player', isCollector: false, idle: true }, // already leaning on a front
      { id: 'muscle-3', faction: 'player', isCollector: false, idle: true }, // free
    ];
    expect(pickIdleMuscle(views, new Set(['muscle-2']))?.id).toBe('muscle-3');
  });

  it('returns undefined when no free player muscle exists (the honest "no free muscle")', () => {
    const views: MuscleCandidate[] = [
      { id: 'muscle-1', faction: 'player', isCollector: false, idle: false },
      { id: 'collector-x', faction: 'player', isCollector: true, idle: true },
      { id: 'rival-1', faction: 'rival', isCollector: false, idle: true },
    ];
    expect(pickIdleMuscle(views, none)).toBeUndefined();
    expect(pickIdleMuscle([], none)).toBeUndefined();
  });
});
