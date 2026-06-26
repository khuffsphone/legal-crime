// POLISH-PASS v2 · PACKAGE 1 — noir lighting math (state/math only; no pixels). Locks the lamp falloff
// (the RTS-34 faint-lamp fix: peak 0.31, not ~0.15), the wet-sheen profile, and the district-control
// ownership window tints (CANON: district holder, never per-building; rival cooled + subtle, never alarm).
import { describe, it, expect } from 'vitest';
import {
  lampFalloff, wetSheenAlpha, ownershipWindowTint,
  LAMP_SEED_ALPHA, WET_SHEEN_SEED_ALPHA, RIVAL_WINDOW_MAX_ALPHA, PLAYER_WINDOW_MAX_ALPHA, NIGHT_ONLY,
} from '../src/scenes/noirLightingMath';

describe('lampFalloff — a real warm pool, not a faint smudge', () => {
  it('peaks at the seed alpha 0.31 dead-centre (the RTS-34 ~0.15 fix)', () => {
    expect(LAMP_SEED_ALPHA).toBe(0.31);
    expect(LAMP_SEED_ALPHA).toBeGreaterThan(0.15);
    expect(lampFalloff(0, 100)).toBeCloseTo(0.31, 6);
  });
  it('falls off monotonically to zero at/over the radius', () => {
    let prev = lampFalloff(0, 100);
    for (let d = 10; d <= 100; d += 10) {
      const a = lampFalloff(d, 100);
      expect(a).toBeLessThanOrEqual(prev + 1e-9);
      prev = a;
    }
    expect(lampFalloff(100, 100)).toBeCloseTo(0, 6);
    expect(lampFalloff(140, 100)).toBe(0);            // clamped past the radius
  });
  it('is robust: a non-positive radius is dark, never NaN', () => {
    expect(lampFalloff(5, 0)).toBe(0);
    expect(lampFalloff(5, -10)).toBe(0);
    expect(Number.isFinite(lampFalloff(50, 100))).toBe(true);
  });
});

describe('wetSheenAlpha — a damp sheen, fainter than the lamp it mirrors', () => {
  it('peaks at the (gentler) sheen seed and is never brighter than the lamp pool', () => {
    expect(wetSheenAlpha(0, 100)).toBeCloseTo(WET_SHEEN_SEED_ALPHA, 6);
    expect(WET_SHEEN_SEED_ALPHA).toBeLessThan(LAMP_SEED_ALPHA);
    expect(wetSheenAlpha(0, 100)).toBeLessThan(lampFalloff(0, 100));
  });
  it('falls off monotonically and clamps past the radius', () => {
    let prev = wetSheenAlpha(0, 100);
    for (let d = 10; d <= 110; d += 10) { const a = wetSheenAlpha(d, 100); expect(a).toBeLessThanOrEqual(prev + 1e-9); prev = a; }
    expect(wetSheenAlpha(120, 100)).toBe(0);
  });
});

describe('ownershipWindowTint — DISTRICT control only; rival cooled + subtle, never alarm', () => {
  it('a neutral/contested district (no holder) gets NO ownership tint (default warm windows)', () => {
    expect(ownershipWindowTint(undefined, 'player')).toBeNull();
  });
  it('the player\'s district glows brass-warm (capped)', () => {
    const t = ownershipWindowTint('player', 'player')!;
    expect(t.color).toBe('#E3C36A');
    expect(t.alpha).toBeLessThanOrEqual(PLAYER_WINDOW_MAX_ALPHA);
  });
  it('a rival\'s district glows the STATIC rival #9E1B1B, COOLED + subtle — never a bright danger-red', () => {
    const t = ownershipWindowTint('rival-a', 'player')!;
    expect(t.color).toBe('#9E1B1B');                       // static rival identity, not motion-danger
    expect(t.color).not.toBe('#E11D1D');
    expect(t.color).not.toBe('#FF5A2C');
    expect(t.alpha).toBeLessThanOrEqual(RIVAL_WINDOW_MAX_ALPHA);
    expect(t.alpha).toBeLessThanOrEqual(ownershipWindowTint('player', 'player')!.alpha); // dimmer than the player's
  });
});

describe('fixed-night noir', () => {
  it('day→night cycle is OFF (a single fixed-night mood)', () => {
    expect(NIGHT_ONLY).toBe(true);
  });
});
