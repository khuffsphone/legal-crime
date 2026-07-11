// PLAYER SPINE — Ticket 3. The win-path presentation wrapper mirrors the EXISTING selectors faithfully
// (label/pct/read/tooltip), routes each path to its detail screen, and honestly marks the early-depth mayor
// path. Pure — winpaths.ts is untouched.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { dominationProgress, goStraightProgress, mayorProgress } from '../src/sim';
import { winPathCards } from '../src/scenes/ui/winPathWrapper';

const SEED = 777;

describe('win-path wrapper — faithful presentation over the pure selectors', () => {
  it('returns all THREE paths, in display order, never hiding one', () => {
    const cards = winPathCards(createInitialState(SEED));
    expect(cards.map((c) => c.path)).toEqual(['domination', 'go-straight', 'mayor']);
  });

  it('copies each selector field verbatim (label / pct / read / tooltip)', () => {
    const s = createInitialState(SEED);
    const [dom, straight, mayor] = winPathCards(s);
    for (const [card, sel] of [
      [dom, dominationProgress(s)],
      [straight, goStraightProgress(s)],
      [mayor, mayorProgress(s)],
    ] as const) {
      expect(card.label).toBe(sel.label);
      expect(card.pct).toBe(sel.pct);
      expect(card.read).toBe(sel.read);
      expect(card.tooltip).toBe(sel.advances); // the source-breakdown tooltip
    }
  });

  it('routes each path to a real detail screen (click-through)', () => {
    const [dom, straight, mayor] = winPathCards(createInitialState(SEED));
    expect(dom.screenId).toBe('controlMap');
    expect(straight.screenId).toBe('moneyLedger');
    expect(mayor.screenId).toBe('civicInfluence');
  });

  it('marks the mayor (Political Capture) path honestly as early-depth, and ONLY that path', () => {
    const [dom, straight, mayor] = winPathCards(createInitialState(SEED));
    expect(mayor.note).toBeTruthy();
    expect(mayor.note).toMatch(/early-depth/i);
    expect(dom.note).toBeUndefined();
    expect(straight.note).toBeUndefined();
  });

  it('flags complete when a path reaches 100%', () => {
    const s = createInitialState(SEED);
    // Drive GO STRAIGHT well past target via clean cash so its selector reads 100%.
    s.player.cash = 10_000_000;
    s.player.dirtyCash = 0;
    const straight = winPathCards(s).find((c) => c.path === 'go-straight')!;
    expect(goStraightProgress(s).pct).toBe(100);
    expect(straight.complete).toBe(true);
  });
});
