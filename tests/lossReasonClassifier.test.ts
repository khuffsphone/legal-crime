// PLAYER SPINE — Ticket 4. The loss classifier dresses the sim-decided LossReason in ending copy. It reads
// state.lossReason (set by tick / evaluateEndgame) — it never re-derives death.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import type { LossReason } from '../src/sim';
import { classifyLoss, classifyEndState } from '../src/scenes/ui/lossReasonClassifier';

const SEED = 9;
const REASONS: LossReason[] = ['bankrupt', 'dead', 'busted'];

describe('loss-reason classifier — headline + tone per reason', () => {
  it('maps every LossReason to non-empty category / headline / subhead / tone', () => {
    for (const r of REASONS) {
      const c = classifyLoss(r);
      expect(c.reason).toBe(r);
      expect(c.category.length).toBeGreaterThan(0);
      expect(c.headline.length).toBeGreaterThan(0);
      expect(c.subhead.length).toBeGreaterThan(0);
      expect(['blood', 'law', 'money']).toContain(c.tone);
    }
  });

  it('gives each reason a distinct headline + tone (endings read differently)', () => {
    const headlines = REASONS.map((r) => classifyLoss(r).headline);
    const tones = REASONS.map((r) => classifyLoss(r).tone);
    expect(new Set(headlines).size).toBe(REASONS.length);
    expect(new Set(tones).size).toBe(REASONS.length);
  });

  it("classifyEndState returns null while the game is still playing", () => {
    const s = createInitialState(SEED);
    expect(s.status).toBe('playing');
    expect(classifyEndState(s)).toBeNull();
  });

  it('classifyEndState reads the sim-stamped state.lossReason on a lost game', () => {
    const s = createInitialState(SEED);
    s.status = 'lost';
    s.lossReason = 'busted';
    expect(classifyEndState(s)?.category).toBe('BUSTED');
  });

  it('classifyEndState falls back to the canonical "dead" when a lost game has no reason stamped', () => {
    const s = createInitialState(SEED);
    s.status = 'lost';
    s.lossReason = undefined;
    expect(classifyEndState(s)?.reason).toBe('dead');
  });
});
