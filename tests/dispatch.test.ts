// RTS-29.1 — the muscle-dispatch seam (the [E]-extort blocker). These exercise the scene dispatch
// path that the 11 pure-sim reshape tests never touched: faction/role MUST be read from the VIEW
// projection, not from raw sim units (muscle carries no factionId/role).
import { describe, it, expect } from 'vitest';
import { pickIdleMuscle, pickSelectedMuscle, type MuscleCandidate } from '../src/scenes/dispatch';

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

describe('pickSelectedMuscle — RTS-35b.1: selection is AUTHORITATIVE for an embodied order', () => {
  const views: MuscleCandidate[] = [
    { id: 'muscle-A', faction: 'player', isCollector: false, idle: true },
    { id: 'muscle-B', faction: 'player', isCollector: false, idle: true },
  ];

  it('THE FIX: with thug A selected it picks A — never an arbitrary free thug (B)', () => {
    // A is selected; B is also free. The order MUST go to A (the player's pick), not B.
    expect(pickSelectedMuscle(views, ['muscle-A'])?.id).toBe('muscle-A');
    expect(pickSelectedMuscle(views, ['muscle-B'])?.id).toBe('muscle-B');
  });

  it('a BUSY selected thug is still chosen (re-task, never a silent hand-off to another thug)', () => {
    // muscle-A is mid-walk/mid-shakedown (idle:false) yet selected → still returned; the caller re-tasks it.
    const busyA: MuscleCandidate[] = [
      { id: 'muscle-A', faction: 'player', isCollector: false, idle: false },
      { id: 'muscle-B', faction: 'player', isCollector: false, idle: true },
    ];
    expect(pickSelectedMuscle(busyA, ['muscle-A'])?.id).toBe('muscle-A'); // NOT reassigned to the free B
  });

  it('NO selection → undefined (require a selection; the order is rejected with a prompt)', () => {
    expect(pickSelectedMuscle(views, [])).toBeUndefined();
  });

  it('never honors a selected collector or rival as the actor', () => {
    const mixed: MuscleCandidate[] = [
      { id: 'collector-x', faction: 'player', isCollector: true, idle: true },
      { id: 'rival-1', faction: 'rival', isCollector: false, idle: true },
      { id: 'muscle-A', faction: 'player', isCollector: false, idle: true },
    ];
    expect(pickSelectedMuscle(mixed, ['collector-x'])).toBeUndefined(); // a selected collector isn't muscle
    expect(pickSelectedMuscle(mixed, ['rival-1'])).toBeUndefined();     // a rival is never the player's actor
    expect(pickSelectedMuscle(mixed, ['collector-x', 'muscle-A'])?.id).toBe('muscle-A'); // the real thug in the box
  });
});
