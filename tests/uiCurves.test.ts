// POLISH-PASS v2 · PACKAGE 5 (UI half) — the new fx.ts shapers (no pixels). These REFINE the shipped
// systems: cashRollRate varies the EXISTING rollToward's rate (no 2nd cash system), crisisPulse drives the
// Wire danger throb, panelReveal eases the inspector open/close.
import { describe, it, expect } from 'vitest';
import { cashRollRate, crisisPulse, panelReveal, rollToward } from '../src/scenes/fx';

describe('cashRollRate — a bigger gap spins faster (feeds the EXISTING rollToward)', () => {
  it('grows with the gap and is capped', () => {
    expect(cashRollRate(0)).toBeCloseTo(6, 6);            // base rate for no gap
    expect(cashRollRate(1000)).toBeGreaterThan(cashRollRate(10));
    expect(cashRollRate(10_000_000)).toBeLessThanOrEqual(16); // clamped
    expect(cashRollRate(-5000)).toBe(cashRollRate(5000));  // symmetric in magnitude
  });
  it('still lands exactly when fed to rollToward (no 2nd cash system)', () => {
    let shown = 0;
    const target = 4200;
    for (let i = 0; i < 600 && shown !== target; i++) shown = rollToward(shown, target, 16, cashRollRate(target - shown));
    expect(shown).toBe(target);
  });
});

describe('crisisPulse — a smooth danger throb', () => {
  it('stays within 0..1 and actually moves (a live alert)', () => {
    let min = Infinity, max = -Infinity;
    for (let t = 0; t <= 900; t += 30) { const v = crisisPulse(t, 900); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); min = Math.min(min, v); max = Math.max(max, v); }
    expect(max - min).toBeGreaterThan(0.5); // it breathes
  });
  it('is robust to a non-positive period', () => {
    expect(crisisPulse(100, 0)).toBe(0);
  });
});

describe('panelReveal — inspector expand/collapse easing', () => {
  it('closed is invisible, open is full, mid is between', () => {
    expect(panelReveal(0)).toEqual({ scale: 0.92, alpha: 0 });
    expect(panelReveal(1)).toEqual({ scale: 1, alpha: 1 });
    const mid = panelReveal(0.5);
    expect(mid.alpha).toBeGreaterThan(0);
    expect(mid.alpha).toBeLessThan(1);
    expect(mid.scale).toBeGreaterThan(0.92);
    expect(mid.scale).toBeLessThan(1);
  });
  it('clamps out-of-range progress', () => {
    expect(panelReveal(-1).alpha).toBe(0);
    expect(panelReveal(2).alpha).toBe(1);
  });
});
