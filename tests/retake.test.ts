// RTS-35d — RETAKING RIVAL-HELD FRONTS through the combat/extortion layer. A rival-held front is LOCKED
// while a rival GUARDS it; clear the guard (35a combat) and the 35b shakedown muscles it back, flipping
// ownership rival→player through the EXISTING conversion path (recordExtortVisit) — no new ownership
// mechanic. These lock: the eligibility gate (guarded → not retakeable; cleared → retakeable), the
// spatial guard, the ownership FLIP on a completed retake, and a guard returning mid-shakedown failing it.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  canIssueMoveAndShakedown, createMoveAndShakedownAct, advanceEmbodiedExtortion,
  isRivalHeldFront, frontGuard, isRetakeableFront,
} from '../src/sim/extortionEmbodied';
import { extortProgress } from '../src/sim/extortion';
import { RETAKE_GUARD_RADIUS } from '../src/sim/constants';
import type { MovableUnit } from '../src/sim/movement';
import type { GameState } from '../src/sim/types';

const FRONT_TILE = { gx: 5, gy: 5 };

/** A RIVAL-HELD front + a player thug standing on it. `guardAt` optionally drops a rival guard near the
 * front. Returns the ids + the rival family that holds the block. */
function rivalHeld(opts: { guardAt?: { gx: number; gy: number } } = {}): {
  s: GameState; thug: MovableUnit; frontId: string; rivalId: string;
} {
  const s = createInitialState(1, { bigCity: true });
  const front = s.districts[0].businesses.find((b) => b.kind === 'front')!;
  const rivalId = s.rivals[0].id;
  front.extortedBy = rivalId;          // the rival HOLDS this front (the retake candidate)
  front.extortVisits = 0;
  const thug: MovableUnit = { id: 'p', pos: { ...FRONT_TILE }, path: [], speed: 1, factionId: s.player.id, role: 'enforcer' };
  s.units = [thug];
  if (opts.guardAt) s.units.push({ id: 'rival-guard', pos: { ...opts.guardAt }, path: [], speed: 1, factionId: rivalId, role: 'enforcer' });
  return { s, thug, frontId: front.id, rivalId };
}

describe('isRivalHeldFront — the retake candidate', () => {
  it('true only for a front held by a NON-player family', () => {
    const { s, frontId } = rivalHeld();
    expect(isRivalHeldFront(s, frontId)).toBe(true);
  });
  it('false for an un-taken front and for one the player already runs', () => {
    const s = createInitialState(1, { bigCity: true });
    const front = s.districts[0].businesses.find((b) => b.kind === 'front')!;
    expect(isRivalHeldFront(s, front.id)).toBe(false);   // un-taken
    front.extortedBy = s.player.id;
    expect(isRivalHeldFront(s, front.id)).toBe(false);   // yours
  });
});

describe('frontGuard — the spatial guard (reuses the 35a combatant definition)', () => {
  it('a rival within RETAKE_GUARD_RADIUS guards the front; one outside does not', () => {
    const near = rivalHeld({ guardAt: { gx: 5 + RETAKE_GUARD_RADIUS - 0.5, gy: 5 } });
    expect(frontGuard(near.s, FRONT_TILE)?.id).toBe('rival-guard');
    const far = rivalHeld({ guardAt: { gx: 5 + RETAKE_GUARD_RADIUS + 1.5, gy: 5 } });
    expect(frontGuard(far.s, FRONT_TILE)).toBeUndefined();
  });
  it('a DOWNED rival is not a guard, and the player\'s own thug never guards', () => {
    const { s } = rivalHeld({ guardAt: { gx: 5, gy: 5 } });
    expect(frontGuard(s, FRONT_TILE)?.id).toBe('rival-guard'); // alive rival guards
    s.units.find((u) => u.id === 'rival-guard')!.downed = true;
    expect(frontGuard(s, FRONT_TILE)).toBeUndefined();         // downed → no guard
  });
});

describe('the eligibility gate — guarded blocks the retake, cleared opens it', () => {
  it('EXERCISE: a guarded rival-held front is NOT retakeable; the gate says clear the guard first', () => {
    const { s, frontId } = rivalHeld({ guardAt: { gx: 5, gy: 5 } });
    expect(extortProgress(s, frontId)?.extortable).toBe(false); // rival-held → not the plain 35b case
    expect(isRetakeableFront(s, frontId, FRONT_TILE)).toBe(false);
    const gate = canIssueMoveAndShakedown(s, 'p', frontId, FRONT_TILE);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/guard/i);
  });

  it('EXERCISE: CLEAR the guard → the front becomes retakeable + the order is legal', () => {
    const { s, frontId } = rivalHeld({ guardAt: { gx: 5, gy: 5 } });
    s.units = s.units.filter((u) => u.id !== 'rival-guard'); // the guard is cleared (downed/driven off)
    expect(isRetakeableFront(s, frontId, FRONT_TILE)).toBe(true);
    expect(canIssueMoveAndShakedown(s, 'p', frontId, FRONT_TILE).ok).toBe(true);
  });

  it('without the front tile, a rival-held front stays rejected (back-compat: the un-taken-only 35b gate)', () => {
    const { s, frontId } = rivalHeld();
    expect(canIssueMoveAndShakedown(s, 'p', frontId).ok).toBe(false); // no tile → can't check the guard
  });
});

describe('the ownership FLIP — a completed retake muscles the block back to the player', () => {
  it('EXERCISE: shake down a guard-cleared rival front → extortedBy flips rival→player, retook once', () => {
    const { s, frontId, rivalId } = rivalHeld(); // no guard
    expect(isRivalHeldFront(s, frontId)).toBe(true);
    s.extortionActs = [createMoveAndShakedownAct(s, 'p', frontId, s.player.id, FRONT_TILE)];
    let retookEvents = 0, convertedEvents = 0;
    for (let i = 0; i < 400 && s.districts[0].businesses.find((b) => b.id === frontId)!.extortedBy !== s.player.id; i++) {
      const evs = advanceEmbodiedExtortion(s, 0.1);
      retookEvents += evs.filter((e) => e.retook).length;
      convertedEvents += evs.filter((e) => e.converted).length;
    }
    const front = s.districts[0].businesses.find((b) => b.id === frontId)!;
    expect(front.extortedBy).toBe(s.player.id);   // flipped rival→player (the EXISTING path set it)
    expect(front.extortedBy).not.toBe(rivalId);
    expect(retookEvents).toBe(1);                 // the retake beat fired exactly once
    expect(convertedEvents).toBe(1);
    expect(s.extortionActs?.length ?? 0).toBe(0); // the resolved act was dropped
  });

  it('a guard WALKING BACK mid-shakedown fails the retake (the block is contested again — no flip)', () => {
    const { s, frontId, rivalId } = rivalHeld(); // start clear
    s.extortionActs = [createMoveAndShakedownAct(s, 'p', frontId, s.player.id, FRONT_TILE)];
    // run a few ticks into the shakedown, then a rival guard returns just OUTSIDE engage range but within
    // the guard radius — targetValid falls false → the act hard-fails, no conversion.
    for (let i = 0; i < 8; i++) advanceEmbodiedExtortion(s, 0.1);
    s.units.push({ id: 'rival-back', pos: { gx: 5 + RETAKE_GUARD_RADIUS - 0.5, gy: 5 }, path: [], speed: 1, factionId: rivalId, role: 'enforcer' });
    let failed = false;
    for (let i = 0; i < 20 && (s.extortionActs?.length ?? 0) > 0; i++) {
      const evs = advanceEmbodiedExtortion(s, 0.1);
      if (evs.some((e) => e.failed)) failed = true;
    }
    expect(failed).toBe(true);
    expect(s.districts[0].businesses.find((b) => b.id === frontId)!.extortedBy).toBe(rivalId); // still the rival's
  });
});
