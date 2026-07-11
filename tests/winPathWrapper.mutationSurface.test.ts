// PLAYER SPINE — Ticket 3 MUTATION SURFACE. These assertions DIE if the win-path wrapper is stubbed to a
// no-op / constant: they prove the wrapper reads LIVE sim progress (not a cached snapshot) and that the
// click-through routing is wired. If someone deletes the wrapper's selector calls or hardcodes its output,
// at least one of these fails — the wiring cannot silently vanish.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { mayorProgress } from '../src/sim';
import { winPathCards } from '../src/scenes/ui/winPathWrapper';

const SEED = 4242;

describe('win-path wrapper — mutation surface (wiring cannot be no-opped)', () => {
  it('pct tracks LIVE state — a constant/cached stub cannot satisfy both a baseline and a mutated state', () => {
    const s = createInitialState(SEED);
    const baselineMayor = winPathCards(s).find((c) => c.path === 'mayor')!;
    expect(baselineMayor.pct).toBe(mayorProgress(s).pct);

    // Move the mayor path forward (City Hall greasing + civic influence are its inputs).
    s.player.bribes.politicians = (s.player.bribes.politicians ?? 0) + 5000;
    s.player.influence = (s.player.influence ?? 0) + 500;

    const movedMayor = winPathCards(s).find((c) => c.path === 'mayor')!;
    // (a) still equals the live selector, and (b) actually MOVED — a constant stub fails one of these.
    expect(movedMayor.pct).toBe(mayorProgress(s).pct);
    expect(movedMayor.pct).not.toBe(baselineMayor.pct);
  });

  it('always emits exactly three cards with non-empty labels + real screen routes', () => {
    const cards = winPathCards(createInitialState(SEED));
    expect(cards).toHaveLength(3);
    for (const c of cards) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.screenId.length).toBeGreaterThan(0); // click-through wired
      expect(typeof c.pct).toBe('number');
    }
    // Routes are distinct per path — a stub returning one shared card would collapse this.
    expect(new Set(cards.map((c) => c.screenId)).size).toBe(3);
  });
});
