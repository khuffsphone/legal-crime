// RTS-31 — EARN THE WIN. The regression the green suite missed: a player who does NOTHING used to
// WIN, because the rival AIs ran their heat up and busted themselves (federal raid-bust) until none
// were left → "last family standing". These tests EXERCISE a fully-idle 40× skip-week playthrough
// (the same skip-week math the scene uses) and assert the player can no longer win by inaction — and
// in fact trends to LOSS as the rivals grow into a threat instead of self-destructing.

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { updateAndObserve } from '../src/sim/realtime';
import { districtsHeld } from '../src/sim/territoryWar';
import { skipWeekDt } from '../src/scenes/playability';
import { RIVAL_DORMANT_WEEKS } from '../src/sim/constants';

const WEEK = 55; // SCENE_WEEK_SECONDS
const PULSE = 10; // SCENE_PULSE_SECONDS

/** Drive a fully-idle game forward `weeks` weeks by SKIP-WEEK (one settlement each), issuing zero
 * player commands — exactly the "do nothing but fast-forward" run the beta teardown won by. */
function idleRun(weeks: number) {
  let s = createInitialState(1, { startingCrew: true, tutorialFreeRuns: 1, bigCity: true });
  s.rivalWakeWeek = RIVAL_DORMANT_WEEKS;
  let resolvedKind: string | null = null;
  let lossWeek = -1;
  for (let w = 0; w < weeks; w++) {
    const dt = skipWeekDt(s.weekElapsed ?? 0, WEEK);
    const obs = updateAndObserve(s, dt, WEEK, PULSE);
    s = obs.state;
    if (obs.endgame) { resolvedKind = obs.endgame.kind; lossWeek = s.tick; break; }
  }
  return { s, resolvedKind, lossWeek };
}

describe('RTS-31 idle playthrough — doing nothing must NOT win', () => {
  it('a 40× skip-week idle run is never crowned (and is resolved a LOSS)', () => {
    const { s, resolvedKind } = idleRun(40);
    expect(s.status).not.toBe('won');
    expect(resolvedKind ?? '').not.toMatch(/^win/);
    // it should actually RESOLVE as a loss (rivals take the city / raze the HQ), not drift forever.
    expect(s.status).toBe('lost');
  });

  it('rivals GROW into a threat — they do NOT self-destruct in a federal bust on the fast clock', () => {
    const { s } = idleRun(40);
    const selfBusts = s.log.filter((l) => l.kind === 'raid-bust' && l.message.includes('Family') || l.kind === 'raid-bust').length;
    expect(selfBusts).toBe(0); // the old free-win engine (rivals busting themselves) is gone
    // and a rival has expanded to the dominance that buries the idle player.
    const topRivalHeld = Math.max(...s.rivals.map((r) => districtsHeld(s, r.id).length));
    expect(topRivalHeld).toBeGreaterThanOrEqual(Math.ceil(s.districts.length * 0.6));
  });

  it('the idle player is pressed: HQ takes unprovoked strikes as the rivals out-grow them', () => {
    const { s } = idleRun(40);
    expect(s.player.hqIntegrity ?? 100).toBeLessThan(100); // they came for you even though you never hit them
  });

  it('RTS-33: the idle loss is on a HUMANE runway — still lost, but well past the old ~wk9 execution', () => {
    const { s, lossWeek } = idleRun(40);
    expect(s.status).toBe('lost');      // ⚠ the win-by-inaction exploit stays closed — idling STILL loses
    expect(lossWeek).toBeGreaterThan(12); // …but a fumbling learner gets real room (was ~wk9 / ~8 min)
  });
});
