// SPRITE SPIKE (BRASSMERE) — the flag + skin-decision logic at the pure level (no Phaser). Guarantees:
// the flag toggles sprite-vs-procedural; the skin only applies to a rigged thug with a loaded texture (so
// the procedural figure is the fallback in every other case); and the decision never depends on
// faction/reveal — the scene's existing occlusion/fog pass owns NO-X-RAY, which the skin does not bypass.
import { describe, it, expect } from 'vitest';
import {
  parseSpritesFlag, usesThugSprite, SPRITES_DEFAULT,
  SPRITE_THUG_KEY, SPRITE_THUG_PATH, SPRITE_THUG_SCALE, SPRITE_THUG_ORIGIN_Y, SPRITE_THUG_NATIVE_H,
} from '../src/scenes/spriteSkin';

describe('parseSpritesFlag — the reversible feature flag', () => {
  it('defaults to OFF when the flag is absent (production visuals unchanged)', () => {
    expect(SPRITES_DEFAULT).toBe(false);
    expect(parseSpritesFlag('')).toBe(false);
    expect(parseSpritesFlag('?reveal=1&art=rich')).toBe(false);
  });

  it('turns ON for ?sprites and the affirmative spellings', () => {
    expect(parseSpritesFlag('?sprites')).toBe(true);
    expect(parseSpritesFlag('?sprites=on')).toBe(true);
    expect(parseSpritesFlag('?sprites=1')).toBe(true);
    expect(parseSpritesFlag('?sprites=true')).toBe(true);
    expect(parseSpritesFlag('?sprites=YES')).toBe(true); // case-insensitive
    expect(parseSpritesFlag('?reveal=1&sprites=on')).toBe(true); // alongside other flags
  });

  it('turns OFF for the negative spellings, and falls back to default on garbage', () => {
    expect(parseSpritesFlag('?sprites=off')).toBe(false);
    expect(parseSpritesFlag('?sprites=0')).toBe(false);
    expect(parseSpritesFlag('?sprites=false')).toBe(false);
    expect(parseSpritesFlag('?sprites=banana')).toBe(SPRITES_DEFAULT); // unrecognised → safe default
  });
});

describe('usesThugSprite — the per-unit skin decision (sprite vs procedural fallback)', () => {
  it('uses the sprite ONLY when flag on AND a rigged thug AND the texture loaded', () => {
    expect(usesThugSprite(true, true, true)).toBe(true);
  });

  it('falls back to the procedural figure in every other case', () => {
    expect(usesThugSprite(false, true, true)).toBe(false);  // flag off → procedural
    expect(usesThugSprite(true, false, true)).toBe(false);  // not a rigged thug (enforcer/collector) → baked
    expect(usesThugSprite(true, true, false)).toBe(false);  // texture missing/failed → procedural (no decode hole)
    expect(usesThugSprite(false, false, false)).toBe(false);
  });

  it('is faction- and reveal-agnostic by construction (NO-X-RAY lives in the occlusion/fog pass)', () => {
    // The decision takes only (flagOn, isRiggedThug, textureLoaded) — there is no faction or reveal input,
    // so the skin cannot bypass the scene's reveal gating: a rival sprite is gated exactly like the figure.
    expect(usesThugSprite.length).toBe(3);
  });
});

describe('sprite config — sane, on-tile constants', () => {
  it('exposes a distinct key + public path and a positive on-screen scale', () => {
    expect(SPRITE_THUG_KEY).toBe('lcr_sprite_thug'); // distinct from BootScene's manifest keys
    expect(SPRITE_THUG_PATH).toBe('sprites/thug.png');
    expect(SPRITE_THUG_SCALE).toBeGreaterThan(0);
    expect(SPRITE_THUG_SCALE).toBeLessThan(1);
    expect(SPRITE_THUG_NATIVE_H).toBeGreaterThan(0);
  });

  it('foot anchor sits near the bottom (feet on the tile)', () => {
    expect(SPRITE_THUG_ORIGIN_Y).toBeGreaterThan(0.9);
    expect(SPRITE_THUG_ORIGIN_Y).toBeLessThanOrEqual(1);
  });
});
