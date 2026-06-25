// RTS-35b — pure tests for EMBODIED EXTORTION (CANON REV c): the move-and-shakedown state machine. The
// CONVERSION/eligibility/economy are unchanged (the wrapper invokes the existing recordExtortVisit) — these
// lock the DELIVERY: the positional gate (no convert from a distance), progress only while present,
// convert once on completion, and the interrupt/absence/fail branches.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  tickEmbodiedExtortionAct, createMoveAndShakedownAct, canIssueMoveAndShakedown, isAtFront,
  frontInteractionPoint, advanceEmbodiedExtortion, applyCommandWithEmbodiedExtortion,
  type ExtortionTickInput,
} from '../src/sim/extortionEmbodied';
import { extortProgress } from '../src/sim/extortion';
import { EXTORT_AT_FRONT_RADIUS, EXTORT_INTERRUPT_GRACE_SECONDS } from '../src/sim/constants';
import type { MovableUnit } from '../src/sim/movement';
import type { GameState } from '../src/sim/types';

/** A reachable un-paying front + a player thug standing on it. Returns the ids + interaction point. */
function setup(): { s: GameState; thug: MovableUnit; frontId: string; interaction: { gx: number; gy: number } } {
  const s = createInitialState(1, { bigCity: true });
  // the first un-shaken front in district-0
  const front = s.districts[0].businesses.find((b) => b.kind === 'front' && b.extortedBy === undefined)!;
  const interaction = { gx: 5, gy: 5 };
  const thug: MovableUnit = { id: 'p', pos: { gx: 5, gy: 5 }, path: [], speed: 1, factionId: s.player.id, role: 'enforcer' };
  s.units = [thug];
  return { s, thug, frontId: front.id, interaction };
}

const PRESENT: ExtortionTickInput = { present: true, attacked: false, targetValid: true, thugAlive: true, cancelled: false };
const ABSENT: ExtortionTickInput = { ...PRESENT, present: false };

describe('the positional gate — no extorting from a distance', () => {
  it('isAtFront is true only within the radius', () => {
    expect(isAtFront({ gx: 5, gy: 5 }, { gx: 5, gy: 5 })).toBe(true);
    expect(isAtFront({ gx: 5 + EXTORT_AT_FRONT_RADIUS + 0.5, gy: 5 }, { gx: 5, gy: 5 })).toBe(false);
  });
  it('an act ordered from AFAR never converts while the thug is absent — it sits in approach', () => {
    const { s, frontId, interaction } = setup();
    const act = createMoveAndShakedownAct(s, 'p', frontId, s.player.id, interaction);
    let convert = false;
    for (let i = 0; i < 30; i++) { const r = tickEmbodiedExtortionAct(act, ABSENT, 0.1); if (r.convert) convert = true; }
    expect(convert).toBe(false);
    expect(act.state).toBe('approach'); // never engaged → never shook down → never converted
    expect(act.progress).toBe(0);
  });
});

describe('the shakedown — progress advances ONLY while present; converts ONCE on completion', () => {
  it('walks the act approach → engage → shakedown → resolve, raising convert exactly once', () => {
    const { s, frontId, interaction } = setup();
    const act = createMoveAndShakedownAct(s, 'p', frontId, s.player.id, interaction);
    let converts = 0;
    const states: string[] = [];
    for (let i = 0; i < 200 && act.state !== 'resolve' && act.state !== 'failed'; i++) {
      const r = tickEmbodiedExtortionAct(act, PRESENT, 0.1);
      if (r.transitioned) states.push(act.state);
      if (r.convert) converts++;
    }
    expect(states).toEqual(['engage', 'shakedown', 'resolve']);
    expect(converts).toBe(1);                 // convert raised EXACTLY once
    expect(act.state).toBe('resolve');
    // ticking a resolved act never re-raises convert
    expect(tickEmbodiedExtortionAct(act, PRESENT, 0.1).convert).toBe(false);
  });

  it('progress freezes while the thug is absent and resumes when it returns (a brief absence PAUSES)', () => {
    const { s, frontId, interaction } = setup();
    const act = createMoveAndShakedownAct(s, 'p', frontId, s.player.id, interaction);
    // drive into shakedown + part-way
    for (let i = 0; i < 5; i++) tickEmbodiedExtortionAct(act, PRESENT, 0.2);
    expect(act.state).toBe('shakedown');
    const mid = act.progress; expect(mid).toBeGreaterThan(0);
    tickEmbodiedExtortionAct(act, ABSENT, 0.3);            // brief absence
    expect(act.progress).toBe(mid);                        // FROZEN — no progress while away
    expect(act.state).toBe('shakedown');
    tickEmbodiedExtortionAct(act, PRESENT, 0.2);
    expect(act.progress).toBeGreaterThan(mid);             // resumes when present again
  });
});

describe('the fail branches — no conversion', () => {
  it('a LONG absence fails without converting', () => {
    const { s, frontId, interaction } = setup();
    const act = createMoveAndShakedownAct(s, 'p', frontId, s.player.id, interaction);
    for (let i = 0; i < 5; i++) tickEmbodiedExtortionAct(act, PRESENT, 0.2); // into shakedown
    let convert = false;
    for (let i = 0; i < 30 && act.state !== 'failed'; i++) { const r = tickEmbodiedExtortionAct(act, ABSENT, 0.2); if (r.convert) convert = true; }
    expect(act.state).toBe('failed');
    expect(convert).toBe(false);
  });

  it('DOWNED / invalid-target / cancel each FAIL without converting (from any active state)', () => {
    for (const bad of [
      { thugAlive: false }, { targetValid: false }, { cancelled: true },
    ]) {
      const { s, frontId, interaction } = setup();
      const act = createMoveAndShakedownAct(s, 'p', frontId, s.player.id, interaction);
      for (let i = 0; i < 5; i++) tickEmbodiedExtortionAct(act, PRESENT, 0.2); // into shakedown
      const r = tickEmbodiedExtortionAct(act, { ...PRESENT, ...bad }, 0.1);
      expect(act.state).toBe('failed');
      expect(r.convert).toBe(false);
    }
  });
});

describe('the interrupt branch — attack resets, recovers within grace', () => {
  it('an attack knocks the act to interrupted (progress reset) and resumes when the fight clears', () => {
    const { s, frontId, interaction } = setup();
    const act = createMoveAndShakedownAct(s, 'p', frontId, s.player.id, interaction);
    for (let i = 0; i < 6; i++) tickEmbodiedExtortionAct(act, PRESENT, 0.2);
    expect(act.state).toBe('shakedown');
    expect(act.progress).toBeGreaterThan(0);
    tickEmbodiedExtortionAct(act, { ...PRESENT, attacked: true }, 0.1); // jumped!
    expect(act.state).toBe('interrupted');
    expect(act.progress).toBe(0);                          // HARD interrupt → full reset (ratio 0)
    // the fight clears within grace → re-engages (back toward the shakedown)
    const r = tickEmbodiedExtortionAct(act, PRESENT, 0.1);
    expect(['engage', 'shakedown']).toContain(act.state);
    expect(r.transitioned).toBe(true);
  });

  it('an attack that outlasts the grace window FAILS the act', () => {
    const { s, frontId, interaction } = setup();
    const act = createMoveAndShakedownAct(s, 'p', frontId, s.player.id, interaction);
    for (let i = 0; i < 6; i++) tickEmbodiedExtortionAct(act, PRESENT, 0.2);
    tickEmbodiedExtortionAct(act, { ...PRESENT, attacked: true }, 0.1); // → interrupted
    let convert = false;
    for (let t = 0; t < EXTORT_INTERRUPT_GRACE_SECONDS + 1 && act.state !== 'failed'; t += 0.2) {
      const r = tickEmbodiedExtortionAct(act, { ...PRESENT, attacked: true }, 0.2);
      if (r.convert) convert = true;
    }
    expect(act.state).toBe('failed');
    expect(convert).toBe(false);
  });
});

describe('the command model — eligibility unchanged', () => {
  it('canIssueMoveAndShakedown gates on a live thug + an eligible un-paying front', () => {
    const { s, frontId } = setup();
    expect(canIssueMoveAndShakedown(s, 'p', frontId).ok).toBe(true);
    expect(canIssueMoveAndShakedown(s, 'nope', frontId).ok).toBe(false); // no such thug
    s.districts[0].businesses.find((b) => b.id === frontId)!.extortedBy = s.player.id; // now paying
    expect(canIssueMoveAndShakedown(s, 'p', frontId).ok).toBe(false);    // not extortable
  });

  it('applyCommandWithEmbodiedExtortion routes a shakedown order to an act + delegates others to applyCommand', () => {
    const { s, frontId, interaction } = setup();
    let delegated = 0;
    const apply = () => { delegated++; };
    const act = applyCommandWithEmbodiedExtortion(s, { type: 'moveAndShakedown', familyId: s.player.id, thugId: 'p', frontId }, apply, interaction);
    expect(act).not.toBeNull();
    expect(s.extortionActs?.length).toBe(1);
    expect(delegated).toBe(0);                              // the shakedown order did NOT touch applyCommand
    applyCommandWithEmbodiedExtortion(s, { type: 'somethingElse' }, apply);
    expect(delegated).toBe(1);                              // other commands delegate to the UNCHANGED applyCommand
  });
});

describe('the WRAPPER invokes the EXISTING conversion (recordExtortVisit) on resolve', () => {
  it('a completed shakedown converts the front to PAYING — once', () => {
    const { s, frontId, interaction } = setup();
    s.extortionActs = [createMoveAndShakedownAct(s, 'p', frontId, s.player.id, interaction)];
    let convertedEvents = 0;
    for (let i = 0; i < 200 && extortProgress(s, frontId)?.extortable; i++) {
      const evs = advanceEmbodiedExtortion(s, 0.1);
      convertedEvents += evs.filter((e) => e.converted).length;
    }
    expect(extortProgress(s, frontId)?.converted).toBe(true); // the EXISTING path set extortedBy
    expect(convertedEvents).toBe(1);
    expect(s.extortionActs?.length ?? 0).toBe(0);             // the resolved act was dropped
    expect(frontInteractionPoint({ gx: 3, gy: 4 })).toEqual({ gx: 3, gy: 4 }); // the seed = building center
  });
});
