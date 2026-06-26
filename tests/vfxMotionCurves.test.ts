// POLISH-PASS v2 · PACKAGE 2 — VFX motion-curve math (no pixels). Locks the attack-decay envelope, the
// ≤120ms muzzle cap, the danger-colour discipline (#FF5A2C standard; #E11D1D only on an active-danger
// frame), and the smoke-only-on-lingering-damage rule.
import { describe, it, expect } from 'vitest';
import {
  vfxEnvelope, muzzleFlashCurve, cashSparkleCurve, dustCurve, smokeCurve, impactRingCurve,
  dangerColor, smokeAllowed, MUZZLE_FLASH_MS, DANGER_MUZZLE, DANGER_ACTIVE,
} from '../src/scenes/vfx/vfxMotionCurves';

describe('vfxEnvelope — a crisp attack then a soft decay', () => {
  it('is zero at both ends and positive in between', () => {
    expect(vfxEnvelope(0)).toBe(0);
    expect(vfxEnvelope(1)).toBe(0);
    expect(vfxEnvelope(0.5)).toBeGreaterThan(0);
  });
  it('ATTACKS up to the attack point then DECAYS monotonically', () => {
    const attack = 0.15;
    expect(vfxEnvelope(attack)).toBeCloseTo(1, 6);      // peak at the attack point
    // rising before the peak
    expect(vfxEnvelope(0.05)).toBeLessThan(vfxEnvelope(0.1));
    // falling after the peak
    let prev = vfxEnvelope(attack);
    for (let t = 0.2; t <= 0.95; t += 0.05) { const v = vfxEnvelope(t); expect(v).toBeLessThanOrEqual(prev + 1e-9); prev = v; }
  });
  it('clamps out-of-range input', () => {
    expect(vfxEnvelope(-1)).toBe(0);
    expect(vfxEnvelope(2)).toBe(0);
  });
});

describe('muzzleFlashCurve — a ≤120ms snap', () => {
  it('caps at 120ms (the punch-and-clear fix)', () => {
    expect(MUZZLE_FLASH_MS).toBe(120);
    expect(muzzleFlashCurve(120)).toBe(0);
    expect(muzzleFlashCurve(200)).toBe(0);
    expect(muzzleFlashCurve(0)).toBe(0);
  });
  it('is bright early and gone late', () => {
    expect(muzzleFlashCurve(10)).toBeGreaterThan(0);
    expect(muzzleFlashCurve(10)).toBeGreaterThan(muzzleFlashCurve(100));
  });
});

describe('the expanding beats — alpha fades while scale grows', () => {
  it('dust + impact-ring + smoke expand as they fade', () => {
    for (const curve of [dustCurve, impactRingCurve, smokeCurve]) {
      expect(curve(0.8).scale).toBeGreaterThan(curve(0.1).scale); // grows over time
      expect(curve(0.95).alpha).toBeLessThanOrEqual(curve(0.5).alpha + 1e-9); // fading out by the end
    }
  });
  it('cash sparkle pops bright then fades', () => {
    expect(cashSparkleCurve(0.05).alpha).toBeGreaterThan(cashSparkleCurve(0.9).alpha);
  });
});

describe('danger-colour discipline — #FF5A2C standard, #E11D1D only on an active-danger frame', () => {
  it('a resting/decaying frame uses the standard muzzle colour', () => {
    expect(dangerColor(false)).toBe(DANGER_MUZZLE);
    expect(DANGER_MUZZLE).toBe('#FF5A2C');
  });
  it('a LIVE hit frame escalates to the hotter red', () => {
    expect(dangerColor(true)).toBe(DANGER_ACTIVE);
    expect(DANGER_ACTIVE).toBe('#E11D1D');
  });
});

describe('smoke rides ONLY lingering-damage beats', () => {
  it('a demolish (dust) and a downed body (kill) linger → smoke allowed', () => {
    expect(smokeAllowed('dust')).toBe(true);
    expect(smokeAllowed('kill')).toBe(true);
  });
  it('a clean muzzle / shatter / sparkle / sabotage never smokes', () => {
    expect(smokeAllowed('muzzle')).toBe(false);
    expect(smokeAllowed('shatter')).toBe(false);
    expect(smokeAllowed('sparkle')).toBe(false);
    expect(smokeAllowed('sabotage')).toBe(false);
  });
});
