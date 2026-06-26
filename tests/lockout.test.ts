// BUG FIX — the [4] LOCKOUT verb. The Bureau channel advertised "unlocks lockout" but the press read as a
// dead button: canLockout gates on MORE than the Bureau bribe (a clear offense cooldown + a living rival +
// $800 cash), and a successful lockout had no felt beat. These lock the GATE so the displayed affordance
// and the real eligibility agree — lockout is eligible exactly when the Bureau + cash + a rival are there,
// and the effect (a rival pinned) actually lands.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { canLockout, resolveLockout, weakestRival } from '../src/sim';
import { LOCKOUT_BUREAU_REQ, LOCKOUT_COST, LOCKOUT_DURATION } from '../src/sim/constants';

/** A board with a living rival + the player armed for a lockout (Bureau met, cash met, cooldown clear). */
function armed(): ReturnType<typeof createInitialState> {
  const s = createInitialState(1, { bigCity: true });
  s.player.bribes.feds = LOCKOUT_BUREAU_REQ;   // The Bureau at the unlock threshold
  s.player.cash = LOCKOUT_COST + 100;          // can pay the dime
  s.offenseCooldown = 0;                       // crew not regrouping
  return s;
}

describe('canLockout — the gate the [4] press actually checks', () => {
  it('ELIGIBLE when the Bureau + cash + a living rival are all there', () => {
    const s = armed();
    const w = weakestRival(s)!;
    expect(w).toBeTruthy();
    expect(canLockout(s, w.familyId).ok).toBe(true);
  });

  it('INELIGIBLE — Bureau under the threshold (the displayed "unlock" is the necessary condition)', () => {
    const s = armed();
    s.player.bribes.feds = LOCKOUT_BUREAU_REQ - 1;
    const g = canLockout(s, weakestRival(s)!.familyId);
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/Bureau/i);
  });

  it('INELIGIBLE — not enough cash for the dime (the cost the UI now surfaces)', () => {
    const s = armed();
    s.player.cash = LOCKOUT_COST - 1;
    const g = canLockout(s, weakestRival(s)!.familyId);
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(new RegExp(`\\$${LOCKOUT_COST}`));
  });

  it('INELIGIBLE — the crew is regrouping (the shared offense cooldown)', () => {
    const s = armed();
    s.offenseCooldown = 5;
    const g = canLockout(s, weakestRival(s)!.familyId);
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/regroup/i);
  });

  it('INELIGIBLE — no valid (living) rival target', () => {
    const s = armed();
    const rivalId = weakestRival(s)!.familyId;
    for (const r of s.rivals) r.alive = false; // all rivals eliminated
    expect(canLockout(s, rivalId).ok).toBe(false);
    expect(weakestRival(s)).toBeNull();         // the scene's "no rival to lock down" branch
  });
});

describe('resolveLockout — the effect actually lands (not a cut/dormant mechanic)', () => {
  it('an eligible lockout PINS the rival for LOCKOUT_DURATION and charges the cost', () => {
    const s = armed();
    const w = weakestRival(s)!;
    const cashBefore = s.player.cash;
    const res = resolveLockout(s, w.familyId);
    expect(res.ok).toBe(true);
    const rival = s.rivals.find((r) => r.id === w.familyId)!;
    expect(rival.lockoutTicks).toBe(LOCKOUT_DURATION); // the rival is pinned
    expect(s.player.cash).toBe(cashBefore - LOCKOUT_COST);
  });

  it('an INELIGIBLE lockout is a no-op (no pin, no charge) — the gate holds', () => {
    const s = armed();
    s.player.cash = LOCKOUT_COST - 1; // can't afford
    const w = weakestRival(s)!;
    const cashBefore = s.player.cash;
    const res = resolveLockout(s, w.familyId);
    expect(res.ok).toBe(false);
    const rival = s.rivals.find((r) => r.id === w.familyId)!;
    expect(rival.lockoutTicks ?? 0).toBe(0);
    expect(s.player.cash).toBe(cashBefore);
  });
});
