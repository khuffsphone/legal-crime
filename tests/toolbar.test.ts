// RTS-30b-ui — pure tests for the clickable-toolbar UI-state helpers. The chip state per CORE verb is a
// function of GameState (+ scene context flags); the green gate must catch a mis-stated button.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { canCollect, canReinvest, coreVerbState, type CoreVerbContext } from '../src/sim/toolbar';
import { recordExtortVisit, extortProgress } from '../src/sim/extortion';
import { accrueUncollected } from '../src/sim/collection';
import type { GameState } from '../src/sim/types';

function big(seed = 1): GameState { return createInitialState(seed, { startingCrew: true, bigCity: true }); }
function firstFront(s: GameState): string {
  for (const d of s.districts) for (const b of d.businesses) if (b.kind === 'front') return b.id;
  throw new Error('no front');
}
const NO_CTX: CoreVerbContext = { idleThug: false, extortTarget: false, viceCtx: false, viceAfford: false };

describe('toolbar core-verb states — pure READY/CONDITIONAL/LOCKED', () => {
  it('KREW is always READY (it just toggles the roster)', () => {
    expect(coreVerbState('krew', big(), NO_CTX)).toBe('READY');
  });

  it('COLLECT is LOCKED with nothing pending, READY once a front pays + accrues', () => {
    const s = big();
    expect(canCollect(s)).toBe(false);
    expect(coreVerbState('collect', s, NO_CTX)).toBe('LOCKED');
    // convert a front + accrue its takings
    const id = firstFront(s);
    const needed = extortProgress(s, id)!.needed;
    for (let i = 0; i < needed; i++) recordExtortVisit(s, 'player', id);
    for (let i = 0; i < 5; i++) accrueUncollected(s); // let takings build over a few ticks
    expect(canCollect(s)).toBe(true);
    expect(coreVerbState('collect', s, NO_CTX)).toBe('READY');
  });

  it('REINVEST is READY only with enough clean cash to open a racket', () => {
    const s = big();
    s.player.cash = 0;
    expect(canReinvest(s)).toBe(false);
    expect(coreVerbState('reinvest', s, NO_CTX)).toBe('CONDITIONAL');
    s.player.cash = 100000;
    expect(canReinvest(s)).toBe(true);
    expect(coreVerbState('reinvest', s, NO_CTX)).toBe('READY');
  });

  it('GREASE is READY with cash, CONDITIONAL when broke', () => {
    const s = big();
    s.player.cash = 500;
    expect(coreVerbState('grease', s, NO_CTX)).toBe('READY');
    s.player.cash = 0;
    expect(coreVerbState('grease', s, NO_CTX)).toBe('CONDITIONAL');
  });

  it('EXTORT reflects target + idle-thug context (LOCKED → CONDITIONAL → READY)', () => {
    const s = big();
    expect(coreVerbState('extort', s, NO_CTX)).toBe('LOCKED'); // no target
    expect(coreVerbState('extort', s, { ...NO_CTX, extortTarget: true })).toBe('CONDITIONAL'); // target, no thug
    expect(coreVerbState('extort', s, { ...NO_CTX, extortTarget: true, idleThug: true })).toBe('READY');
  });

  it('VICE reflects the hovered-racket context (LOCKED → CONDITIONAL → READY)', () => {
    const s = big();
    expect(coreVerbState('vice', s, NO_CTX)).toBe('LOCKED'); // no racket in context
    expect(coreVerbState('vice', s, { ...NO_CTX, viceCtx: true })).toBe('CONDITIONAL'); // can't afford
    expect(coreVerbState('vice', s, { ...NO_CTX, viceCtx: true, viceAfford: true })).toBe('READY');
  });
});
