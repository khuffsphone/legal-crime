// EMBODIMENT CONSISTENCY — the building-ATTACK is now POSITIONAL like the 35b shakedown: a thug must WALK to
// the racket and spend TIME in proximity before it shuts down. No instant-at-range effect. The shutdown
// itself is the EXISTING resolveAttack (shutdownTicks), applied on resolve — not duplicated. Also locks the
// playtest retake fix: the WRAPPER (the path the scene uses) now creates the retake act once the guard clears.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  canIssueMoveAndSabotage, createMoveAndSabotageAct, applyCommandWithEmbodiedExtortion,
  advanceEmbodiedExtortion, canIssueMoveAndShakedown,
} from '../src/sim/extortionEmbodied';
import { isShutDown } from '../src/sim/economy';
import { ATTACK_SHUTDOWN_WEEKS } from '../src/sim/constants';
import type { GameState, Business } from '../src/sim/types';
import type { MovableUnit } from '../src/sim/movement';

/** A rival-earning racket + a player thug. `thugAt` places the thug (default ON the racket tile). */
function rivalRacket(thugAt: { gx: number; gy: number } = { gx: 5, gy: 5 }): {
  s: GameState; biz: Business; thug: MovableUnit; tile: { gx: number; gy: number };
} {
  const s = createInitialState(1, { bigCity: true });
  // pick a business and hand it to a rival so it is a valid ATTACK target; give the player crew.
  const rivalId = s.rivals[0].id;
  const d = s.districts[0];
  const op = d.businesses.find((b) => b.kind !== 'front') ?? d.businesses[0];
  op.ownerFamily = rivalId; op.extortedBy = undefined; op.shutdownTicks = 0;
  s.player.gangsters.push({ id: 'g1', name: 'Thug', skill: 1, loyalty: 70, upkeep: 10, assignment: { type: 'idle' } });
  const tile = { gx: 5, gy: 5 };
  const thug: MovableUnit = { id: 'p', pos: { ...thugAt }, path: [], speed: 1, factionId: s.player.id, role: 'enforcer' };
  s.units = [thug];
  return { s, biz: op, thug, tile };
}

describe('embodied building-ATTACK — proximity + time, NO instant-at-range effect', () => {
  it('a sabotage act does NOT shut the business down until the thug ARRIVES and dwells', () => {
    const { s, biz, tile } = rivalRacket({ gx: 40, gy: 40 }); // thug far away
    s.extortionActs = [createMoveAndSabotageAct('p', biz.id, s.player.id, tile)];
    // run real time while the thug is NOT present — the racket must stay UP the whole time (no range effect).
    let everSabotaged = false;
    for (let i = 0; i < 60; i++) {
      const evs = advanceEmbodiedExtortion(s, 0.1);
      if (evs.some((e) => e.sabotaged)) everSabotaged = true;
    }
    expect(everSabotaged).toBe(false);
    expect(isShutDown(biz)).toBe(false); // never shut from across the map
  });

  it('once the thug is AT the racket, the dwell elapses and the EXISTING shutdown applies exactly once', () => {
    const { s, biz, tile } = rivalRacket({ gx: 5, gy: 5 }); // thug already on the racket
    s.extortionActs = [createMoveAndSabotageAct('p', biz.id, s.player.id, tile)];
    let sabotagedEvents = 0;
    for (let i = 0; i < 400 && !isShutDown(biz); i++) {
      sabotagedEvents += advanceEmbodiedExtortion(s, 0.1).filter((e) => e.sabotaged).length;
    }
    expect(isShutDown(biz)).toBe(true);
    expect(biz.shutdownTicks).toBe(ATTACK_SHUTDOWN_WEEKS); // the EXISTING effect, not a new one
    expect(sabotagedEvents).toBe(1);                       // fired exactly once
    expect(s.extortionActs?.length ?? 0).toBe(0);          // the resolved act was dropped
  });

  it('the gate refuses a non-rival / already-shut target and an order with no thug', () => {
    const { s, biz, tile } = rivalRacket();
    expect(canIssueMoveAndSabotage(s, 'p', biz.id, s.player.id).ok).toBe(true);
    expect(canIssueMoveAndSabotage(s, 'nobody', biz.id, s.player.id).ok).toBe(false); // no such thug
    biz.shutdownTicks = ATTACK_SHUTDOWN_WEEKS; // already shut
    expect(canIssueMoveAndSabotage(s, 'p', biz.id, s.player.id).ok).toBe(false);
    // the WRAPPER refuses to create an act when the gate fails (no instant effect either).
    const act = applyCommandWithEmbodiedExtortion(s, { type: 'moveAndSabotage', familyId: s.player.id, thugId: 'p', businessId: biz.id }, (x) => x, tile);
    expect(act).toBeNull();
  });

  it('the WRAPPER creates the sabotage act (the path the scene uses) and tags its kind', () => {
    const { s, biz, tile } = rivalRacket();
    const act = applyCommandWithEmbodiedExtortion(s, { type: 'moveAndSabotage', familyId: s.player.id, thugId: 'p', businessId: biz.id }, (x) => x, tile);
    expect(act).not.toBeNull();
    expect(act?.kind).toBe('sabotage');
    expect(act?.frontId).toBe(biz.id);
    expect(act?.state).toBe('approach'); // walks first — not resolved at range
    expect(isShutDown(biz)).toBe(false);  // creating the order does NOT apply the effect
  });
});

describe('playtest retake fix — the WRAPPER honours the tile-gated 35d retake', () => {
  it('a guard-cleared rival-held front: the wrapper CREATES the shakedown act (given the interaction tile)', () => {
    const s = createInitialState(1, { bigCity: true });
    const front = s.districts[0].businesses.find((b) => b.kind === 'front')!;
    front.extortedBy = s.rivals[0].id; front.extortVisits = 0; // rival-held, no guard nearby
    const tile = { gx: 5, gy: 5 };
    s.units = [{ id: 'p', pos: { ...tile }, path: [], speed: 1, factionId: s.player.id, role: 'enforcer' }];
    // the gate (with the tile) says go; the WRAPPER must now actually create the act (the bug: it returned null).
    expect(canIssueMoveAndShakedown(s, 'p', front.id, tile).ok).toBe(true);
    const act = applyCommandWithEmbodiedExtortion(s, { type: 'moveAndShakedown', familyId: s.player.id, thugId: 'p', frontId: front.id }, (x) => x, tile);
    expect(act).not.toBeNull();
    expect(act?.frontId).toBe(front.id);
    expect(act?.kind ?? 'shakedown').toBe('shakedown');
  });
});
