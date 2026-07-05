// NO-X-RAY — extort must respect fog (canon: the sim never acts on an unrevealed tile). Covers BOTH extort
// paths: the command-layer applyExtort (option-a reveal assertion on the command) and the embodied
// canIssueMoveAndShakedown eligibility gate (option-b isVisible closure). Mutation-verified: an unrevealed
// front collapses to the EXACT result of a nonexistent target; a revealed front is bit-identical to today.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { applyCommand } from '../src/sim/commands';
import { canIssueMoveAndShakedown } from '../src/sim/extortionEmbodied';
import type { GameState } from '../src/sim/types';
import type { MovableUnit } from '../src/sim/movement';

/** A district-0 front the player can definitely convert (control 100 ⇒ the success roll is guaranteed). */
function revealedFront(): { s: GameState; frontId: string } {
  const s = createInitialState(1);
  const front = s.districts[0].businesses.find((b) => b.kind === 'front')!;
  s.districts[0].control.player = 100; // guarantee success so a PROCEEDING extort is deterministic
  return { s, frontId: front.id };
}

/** A reachable un-paying front + a player thug standing on it (mirrors the embodied suite's fixture). */
function embodied(): { s: GameState; frontId: string; tile: { gx: number; gy: number } } {
  const s = createInitialState(1, { bigCity: true });
  const front = s.districts[0].businesses.find((b) => b.kind === 'front' && b.extortedBy === undefined)!;
  const tile = { gx: 5, gy: 5 };
  const thug: MovableUnit = { id: 'p', pos: { gx: 5, gy: 5 }, path: [], speed: 1, factionId: s.player.id, role: 'enforcer' };
  s.units = [thug];
  return { s, frontId: front.id, tile };
}

describe('NO-X-RAY — applyExtort (command layer) respects fog', () => {
  it('MUTATION fog-check-deleted: an unrevealed front (issuedFromRevealed:false) is rejected IDENTICALLY to a nonexistent target', () => {
    const { s, frontId } = revealedFront();
    const rngBefore = s.rngState;
    const out = applyCommand(s, { type: 'extort', familyId: 'player', businessId: frontId, issuedFromRevealed: false });
    const biz = out.districts[0].businesses.find((b) => b.id === frontId)!;
    expect(biz.extortedBy).toBeUndefined();        // NOT converted — the fogged front never folds
    expect(out.rngState).toBe(rngBefore);          // no RNG drawn (rejected before the roll — cursor untouched)
    const last = out.log[out.log.length - 1];
    expect(last.kind).toBe('extort-invalid');      // same kind a nonexistent target logs
    expect(last.message).toContain('not found');   // collapsed to the nonexistent-target message
    expect(last.data).not.toHaveProperty('issuedFromRevealed'); // the reveal seam never leaks into the log
    expect(last.data).toEqual({ type: 'extort', familyId: 'player', businessId: frontId }); // == a plain command
  });

  it('a genuinely nonexistent target produces the SAME rejection (the collapse target)', () => {
    const { s } = revealedFront();
    const out = applyCommand(s, { type: 'extort', familyId: 'player', businessId: 'no-such-front' });
    const last = out.log[out.log.length - 1];
    expect(last.kind).toBe('extort-invalid');
    expect(last.message).toContain('not found');
  });

  it('NUMBERS-FROZEN: a revealed front (issuedFromRevealed:true) extorts BIT-IDENTICALLY to a flagless command', () => {
    const a = revealedFront();
    const b = revealedFront();
    const withFlag = applyCommand(a.s, { type: 'extort', familyId: 'player', businessId: a.frontId, issuedFromRevealed: true });
    const flagless = applyCommand(b.s, { type: 'extort', familyId: 'player', businessId: b.frontId }); // == today
    expect(withFlag.districts[0].businesses.find((x) => x.id === a.frontId)!.extortedBy).toBe('player'); // proceeds
    expect(flagless.districts[0].businesses.find((x) => x.id === b.frontId)!.extortedBy).toBe('player');
    expect(withFlag.rngState).toBe(flagless.rngState);                                    // identical RNG cursor
    expect(withFlag.log[withFlag.log.length - 1]).toEqual(flagless.log[flagless.log.length - 1]); // identical log entry
  });
});

describe('NO-X-RAY — canIssueMoveAndShakedown (embodied) respects fog', () => {
  it('MUTATION fog-check-deleted: a fogged front tile collapses to the "no such block" of a NONEXISTENT front', () => {
    const { s, frontId, tile } = embodied();
    const fogged = canIssueMoveAndShakedown(s, 'p', frontId, tile, () => false);
    const nonexistent = canIssueMoveAndShakedown(s, 'p', 'no-such-front', tile, () => true);
    expect(fogged).toEqual({ ok: false, reason: 'no such block' }); // ordering can't confirm the fogged front exists
    expect(fogged).toEqual(nonexistent);                            // indistinguishable from a nonexistent target
  });

  it('NUMBERS-FROZEN: a revealed tile (explicit / default / no-tile) gates IDENTICALLY to today', () => {
    const { s, frontId, tile } = embodied();
    const revealed = canIssueMoveAndShakedown(s, 'p', frontId, tile, () => true);
    const deflt = canIssueMoveAndShakedown(s, 'p', frontId, tile);   // default isVisible ⇒ visible
    const noTile = canIssueMoveAndShakedown(s, 'p', frontId);        // preview-style call (no tile) — byte-identical
    expect(revealed).toEqual({ ok: true, reason: 'ready' });
    expect(deflt).toEqual(revealed);
    expect(noTile).toEqual(revealed);
  });
});
