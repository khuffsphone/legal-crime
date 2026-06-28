// SPRITE SPIKE (thug) — the flag/scale/plate decisions, pure (no Phaser). Covers: the flag toggles sprite vs
// procedural; the procedural fallback when the flag is off OR the texture failed to load; the scale knob
// changes the rendered size; player/rival plate tint is correct; downed desaturates (never rival-red).
import { describe, it, expect } from 'vitest';
import {
  parseSpriteFlags, thugRenderMode, spriteDisplayHeight, spriteScaleFactor, spritePlateColor,
  FIGURE_TARGET_H, THUG_SPRITE_NATIVE_H, SPRITE_SCALE_MAX, SPRITE_SCALE_MIN,
  PLATE_PLAYER, PLATE_RIVAL, PLATE_DOWNED,
} from '../src/scenes/spriteFlags';

describe('parseSpriteFlags — default OFF, opt-in via ?sprites', () => {
  it('is OFF with no query / explicit off values', () => {
    expect(parseSpriteFlags('').thugSprite).toBe(false);
    expect(parseSpriteFlags('?foo=1').thugSprite).toBe(false);
    for (const v of ['off', '0', 'false', 'no']) expect(parseSpriteFlags(`?sprites=${v}`).thugSprite).toBe(false);
  });
  it('is ON when ?sprites is present / truthy', () => {
    expect(parseSpriteFlags('?sprites').thugSprite).toBe(true);
    expect(parseSpriteFlags('?sprites=on').thugSprite).toBe(true);
    expect(parseSpriteFlags('?sprites=1').thugSprite).toBe(true);
  });
  it('?spritescale sets the scale (default 1, clamped)', () => {
    expect(parseSpriteFlags('?sprites').scale).toBe(1);
    expect(parseSpriteFlags('?sprites&spritescale=2').scale).toBe(2);
    expect(parseSpriteFlags('?spritescale=99').scale).toBe(SPRITE_SCALE_MAX);   // clamp high
    expect(parseSpriteFlags('?spritescale=0').scale).toBe(1);                   // non-positive → default
    expect(parseSpriteFlags('?spritescale=-3').scale).toBe(1);
    expect(parseSpriteFlags('?spritescale=0.1').scale).toBe(SPRITE_SCALE_MIN);  // clamp low
  });
});

describe('thugRenderMode — flag toggles sprite vs procedural; fallback is safe', () => {
  it('sprite only when flag ON and texture ready', () => {
    expect(thugRenderMode({ thugSprite: true, scale: 1 }, true)).toBe('sprite');
  });
  it('procedural when flag OFF (default) even if the texture is ready', () => {
    expect(thugRenderMode({ thugSprite: false, scale: 1 }, true)).toBe('procedural');
  });
  it('procedural fallback when the texture failed to load, even with the flag ON', () => {
    expect(thugRenderMode({ thugSprite: true, scale: 1 }, false)).toBe('procedural');
  });
});

describe('scale — the knob changes the rendered size, matched by default', () => {
  it('matched height equals the figure target at scale 1; grows with the knob', () => {
    expect(spriteDisplayHeight(1)).toBe(FIGURE_TARGET_H);
    expect(spriteDisplayHeight(2)).toBe(FIGURE_TARGET_H * 2);
    expect(spriteDisplayHeight(2)).toBeGreaterThan(spriteDisplayHeight(1));
  });
  it('scale factor maps native height to the display height', () => {
    expect(spriteScaleFactor(THUG_SPRITE_NATIVE_H, FIGURE_TARGET_H)).toBeCloseTo(FIGURE_TARGET_H / THUG_SPRITE_NATIVE_H, 6);
    // a 2x knob renders ~twice as tall on screen.
    expect(spriteScaleFactor(THUG_SPRITE_NATIVE_H, spriteDisplayHeight(2)))
      .toBeCloseTo(2 * spriteScaleFactor(THUG_SPRITE_NATIVE_H, spriteDisplayHeight(1)), 6);
  });
});

describe('spritePlateColor — friend/foe on the plate; downed desaturates (canon)', () => {
  it('player → brass, rival → static blood-red', () => {
    expect(spritePlateColor('player', false)).toBe(PLATE_PLAYER);
    expect(spritePlateColor('rival', false)).toBe(PLATE_RIVAL);
    expect(PLATE_PLAYER).toBe(0xb8862b);
    expect(PLATE_RIVAL).toBe(0x9e1b1b);
  });
  it('downed → desaturated gray, NEVER rival-red (even for a rival)', () => {
    expect(spritePlateColor('rival', true)).toBe(PLATE_DOWNED);
    expect(spritePlateColor('player', true)).toBe(PLATE_DOWNED);
    expect(spritePlateColor('rival', true)).not.toBe(PLATE_RIVAL);
    expect(PLATE_DOWNED).toBe(0x6a6660);
  });
});
