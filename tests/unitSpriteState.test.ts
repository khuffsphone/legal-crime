// Pure tests for the ?sprites flag + animation-state logic. No Phaser.
import { describe, it, expect } from 'vitest';
import {
  spritesRequested, spriteScaleParam, actionForState, spriteDisplayScale,
} from '../src/scenes/render/unitSpriteState';

describe('spritesRequested — OPT-IN (default OFF, procedural stays authoritative)', () => {
  it('OFF when the flag is absent or empty search', () => {
    expect(spritesRequested('')).toBe(false);
    expect(spritesRequested('?fx=1')).toBe(false);
    expect(spritesRequested('?life=high&art=rich')).toBe(false);
  });
  it('ON for the bare flag and truthy values', () => {
    expect(spritesRequested('?sprites')).toBe(true);
    expect(spritesRequested('?sprites=1')).toBe(true);
    expect(spritesRequested('?sprites=on')).toBe(true);
    expect(spritesRequested('?sprites=true')).toBe(true);
    expect(spritesRequested('?sprites=yes')).toBe(true);
  });
  it('OFF for explicit falsy values', () => {
    for (const v of ['0', 'off', 'false', 'no']) expect(spritesRequested(`?sprites=${v}`)).toBe(false);
  });
  it('total on a malformed search (never throws)', () => {
    expect(spritesRequested('%')).toBe(false);
  });
});

describe('spriteScaleParam — clamped display-scale knob', () => {
  it('defaults to 1 when absent or invalid', () => {
    expect(spriteScaleParam('')).toBe(1);
    expect(spriteScaleParam('?spritescale=abc')).toBe(1);
    expect(spriteScaleParam('?spritescale=-2')).toBe(1);
  });
  it('passes through and clamps to [0.25, 6]', () => {
    expect(spriteScaleParam('?spritescale=2')).toBe(2);
    expect(spriteScaleParam('?spritescale=100')).toBe(6);
    expect(spriteScaleParam('?spritescale=0.01')).toBe(0.25);
  });
});

describe('actionForState — attack wins, else move→walk, else idle', () => {
  it('attack overrides everything (one-shot)', () => {
    expect(actionForState({ attacking: true, moving: true, loco: 2 })).toBe('attack');
    expect(actionForState({ attacking: true, moving: false, loco: 0 })).toBe('attack');
  });
  it('moving (or loco ramping) reads as walk; run folds into walk for the 3-clip placeholder', () => {
    expect(actionForState({ attacking: false, moving: true, loco: 0 })).toBe('walk');
    expect(actionForState({ attacking: false, moving: false, loco: 0.6 })).toBe('walk');
    expect(actionForState({ attacking: false, moving: false, loco: 2 })).toBe('walk');
  });
  it('still + settled reads as idle', () => {
    expect(actionForState({ attacking: false, moving: false, loco: 0 })).toBe('idle');
    expect(actionForState({ attacking: false, moving: false, loco: 0.49 })).toBe('idle');
  });
});

describe('spriteDisplayScale — map rendered figure px to the game figure height', () => {
  it('scales the manifest figure height onto FIGURE_PX and applies the multiplier', () => {
    expect(spriteDisplayScale(240, 56)).toBeCloseTo(56 / 240, 6);
    expect(spriteDisplayScale(240, 56, 2)).toBeCloseTo((56 / 240) * 2, 6);
  });
  it('falls back to the multiplier on a degenerate figure height', () => {
    expect(spriteDisplayScale(0, 56, 1.5)).toBe(1.5);
  });
});
