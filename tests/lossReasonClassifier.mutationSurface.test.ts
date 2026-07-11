// PLAYER SPINE — Ticket 4 MUTATION SURFACE. These assertions DIE if the loss classifier is stubbed to a
// no-op / constant: they prove (a) the three reasons produce DISTINCT copy (a constant stub collapses them)
// and (b) classifyEndState actually reads state.lossReason rather than returning a fixed value. If the
// mapping is deleted or hardcoded, at least one fails.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import type { LossReason } from '../src/sim';
import { classifyLoss, classifyEndState } from '../src/scenes/ui/lossReasonClassifier';

const SEED = 3131;
const REASONS: LossReason[] = ['bankrupt', 'dead', 'busted'];

describe('loss-reason classifier — mutation surface (mapping cannot be no-opped)', () => {
  it('the three reasons map to three DISTINCT (category, headline, tone) triples', () => {
    const keys = REASONS.map((r) => {
      const c = classifyLoss(r);
      return `${c.category}|${c.headline}|${c.tone}`;
    });
    expect(new Set(keys).size).toBe(REASONS.length); // a constant stub yields 1, failing here
  });

  it('classifyEndState changes with the stamped reason — it is not a fixed value', () => {
    const s = createInitialState(SEED);
    s.status = 'lost';

    s.lossReason = 'bankrupt';
    const bankrupt = classifyEndState(s);
    s.lossReason = 'dead';
    const dead = classifyEndState(s);
    s.lossReason = 'busted';
    const busted = classifyEndState(s);

    expect(bankrupt?.category).toBe('BANKRUPT');
    expect(dead?.category).toBe('DEAD');
    expect(busted?.category).toBe('BUSTED');
    // All three distinct — a stub ignoring state.lossReason cannot pass all three.
    expect(new Set([bankrupt?.category, dead?.category, busted?.category]).size).toBe(3);
  });
});
