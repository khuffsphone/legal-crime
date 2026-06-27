// CITY VISUAL DEPTH (Lane C) — the pure art-decision model (state/math, never pixels). District identity is
// stable + deterministic + well-spread, building variety is deterministic + bounded, and every accent obeys
// the colour law: warm noir tones only — NEVER green or red (those carry cash/rival/danger meaning).
import { describe, it, expect } from 'vitest';
import {
  districtIdentityFor, DISTRICT_ACCENTS, RESERVED_COLOURS,
  buildingVariantFor, facadeAccentFor, hashKey, BUILDING_VARIANTS,
  type LandmarkKind,
} from '../src/scenes/art/districtIdentity';

const LANDMARKS: LandmarkKind[] = ['fountain', 'statue', 'clocktower', 'obelisk'];

describe('district identity — stable, deterministic, well-spread', () => {
  it('is deterministic: same ordinal → identical identity', () => {
    expect(districtIdentityFor(3)).toEqual(districtIdentityFor(3));
    expect(districtIdentityFor(3)).toEqual(districtIdentityFor(3 + 0)); // no hidden state
  });
  it('neighbouring districts differ in archetype, accent AND landmark (no twin neighbours)', () => {
    for (let i = 0; i < 9; i++) {
      const a = districtIdentityFor(i);
      const b = districtIdentityFor(i + 1);
      expect(a.archetype).not.toBe(b.archetype);
      expect(a.accent).not.toBe(b.accent);
      expect(a.landmark).not.toBe(b.landmark);
    }
  });
  it('landmark is always one of the four civic kinds', () => {
    for (let i = 0; i < 20; i++) expect(LANDMARKS).toContain(districtIdentityFor(i).landmark);
  });
  it('negative / huge ordinals wrap safely to a valid identity', () => {
    for (const i of [-1, -7, 999, 100000]) {
      const id = districtIdentityFor(i);
      expect(DISTRICT_ACCENTS).toContain(id.accent);
      expect(LANDMARKS).toContain(id.landmark);
    }
  });
});

describe('colour law — accents are warm noir only, never green/red', () => {
  it('no accent is a reserved state colour (blood/danger/muzzle/cash-green)', () => {
    for (const a of DISTRICT_ACCENTS) expect(RESERVED_COLOURS).not.toContain(a);
  });
  it('every accent has a warm bias (red channel ≥ blue channel) — no cool green/blue identity tints', () => {
    for (const a of DISTRICT_ACCENTS) {
      const r = (a >> 16) & 0xff, g = (a >> 8) & 0xff, b = a & 0xff;
      expect(r).toBeGreaterThanOrEqual(b); // warm
      expect(g).toBeLessThanOrEqual(r); // never a green-dominant tone
    }
  });
});

describe('building variety — deterministic + bounded, facade accents stay in family', () => {
  it('hashKey is stable + non-negative', () => {
    expect(hashKey('biz-1')).toBe(hashKey('biz-1'));
    expect(hashKey('biz-1')).not.toBe(hashKey('biz-2'));
    expect(hashKey('biz-1')).toBeGreaterThanOrEqual(0);
  });
  it('buildingVariantFor is in [0, BUILDING_VARIANTS) and wraps negatives', () => {
    for (const s of [0, 1, 7, 4096, -3, -10]) {
      const v = buildingVariantFor(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(BUILDING_VARIANTS);
    }
  });
  it('facadeAccentFor is a deterministic warm tint of the district accent (never green-dominant)', () => {
    const accent = districtIdentityFor(0).accent;
    const tint = facadeAccentFor(accent, 2);
    expect(facadeAccentFor(accent, 2)).toBe(tint); // deterministic
    const r = (tint >> 16) & 0xff, g = (tint >> 8) & 0xff, b = tint & 0xff;
    expect(r).toBeGreaterThanOrEqual(b); // stays warm
    expect(g).toBeLessThanOrEqual(r);
    // the four variants of one accent are not all identical (real variety)
    const variants = new Set([0, 1, 2, 3].map((v) => facadeAccentFor(accent, v)));
    expect(variants.size).toBeGreaterThan(1);
  });
});
