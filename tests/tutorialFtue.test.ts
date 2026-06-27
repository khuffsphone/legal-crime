import { describe, it, expect } from 'vitest';
import {
  tutorialCard,
  tutorialComplete,
  TUTORIAL_STEPS,
  INITIAL_TUTORIAL_PROGRESS,
} from '../src/sim/onboarding';
import { createInitialState } from '../src/sim/state';
import { spawnCollector } from '../src/sim/movement';
import type { GameState } from '../src/sim/types';

// Lane B — the FTUE coach card is a PURE derivation of the live earn-loop step, advancing the moment
// the player actually performs each beat. These tests pin that mapping at the state level (no Phaser).

/** A state earning at the home front (income established) with optional pending takings. */
function earning(uncollected = 0): GameState {
  const s = createInitialState(1);
  const front = s.districts[0].businesses[0];
  front.extortedBy = 'player';
  front.uncollected = uncollected;
  return s;
}

describe('tutorialCard — the four-beat core-loop spine', () => {
  it('a fresh game opens on EXTORT, step 1 of 4, spotlighting the home front', () => {
    const s = createInitialState(1);
    const card = tutorialCard(s);
    expect(card).not.toBeNull();
    expect(card!.step).toBe('extort');
    expect(card!.index).toBe(1);
    expect(card!.total).toBe(4);
    expect(card!.targetBusinessId).toBe(s.districts[0].businesses[0].id);
    expect(card!.action).toMatch(/\[E\]/);
  });

  it('once earning with takings waiting, it advances to COLLECT (step 2)', () => {
    const card = tutorialCard(earning(200));
    expect(card!.step).toBe('collect');
    expect(card!.index).toBe(2);
    expect(card!.targetBusinessId).toBeNull();
    expect(card!.action).toMatch(/\[C\]/);
  });

  it('a collector carrying cash flips the card to PROTECT (step 3)', () => {
    const s = earning();
    s.units.push(spawnCollector('c', 5, 5, 'player', 300));
    const card = tutorialCard(s);
    expect(card!.step).toBe('protect');
    expect(card!.index).toBe(3);
  });

  it('earning with nothing pending teaches the final loop beat GROW (step 4)', () => {
    const card = tutorialCard(earning()); // income, no takings, no collector → the grease beat
    expect(card!.step).toBe('grow');
    expect(card!.index).toBe(4);
    expect(card!.action).toMatch(/\[G\]/);
  });

  it('every card carries a one-line teach and a concrete action', () => {
    // walk every beat and assert the copy is populated (no empty cards reach the overlay)
    const states: GameState[] = [createInitialState(1), earning(200), earning()];
    for (const s of states) {
      const card = tutorialCard(s)!;
      expect(card.title.length).toBeGreaterThan(0);
      expect(card.body.length).toBeGreaterThan(0);
      expect(card.action.length).toBeGreaterThan(0);
      expect(TUTORIAL_STEPS).toContain(card.step);
    }
  });
});

describe('tutorialCard — graduation & skip', () => {
  it('retires (returns null) once the player greases — past the earn loop', () => {
    const s = earning();
    s.player.bribes.police = 10; // greased a channel → firstObjective moves on to HOLD
    expect(tutorialCard(s)).toBeNull();
    expect(tutorialComplete(s)).toBe(true);
  });

  it('SKIP retires the card immediately, at any beat', () => {
    const s = createInitialState(1); // would otherwise show EXTORT
    expect(tutorialCard(s, { skipped: true })).toBeNull();
    // but skipping is NOT completion — the loop still has lessons left
    expect(tutorialComplete(s)).toBe(false);
  });

  it('defaults to NOT skipped (the un-dismissed presentation cursor)', () => {
    expect(INITIAL_TUTORIAL_PROGRESS.skipped).toBe(false);
    expect(tutorialCard(createInitialState(1), INITIAL_TUTORIAL_PROGRESS)).not.toBeNull();
  });

  it('tutorialComplete is false while any loop beat remains', () => {
    expect(tutorialComplete(createInitialState(1))).toBe(false); // extort
    expect(tutorialComplete(earning(200))).toBe(false); // collect
    expect(tutorialComplete(earning())).toBe(false); // grow
  });
});

describe('tutorialCard — the index is monotonic across the loop', () => {
  it('extort→collect→protect→grow read 1,2,3,4 in order', () => {
    const extort = tutorialCard(createInitialState(1))!;
    const collect = tutorialCard(earning(200))!;
    const protectState = earning();
    protectState.units.push(spawnCollector('c', 5, 5, 'player', 300));
    const protect = tutorialCard(protectState)!;
    const grow = tutorialCard(earning())!;
    expect([extort.index, collect.index, protect.index, grow.index]).toEqual([1, 2, 3, 4]);
  });
});
