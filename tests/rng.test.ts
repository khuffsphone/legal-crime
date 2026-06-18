import { describe, it, expect } from 'vitest';
import { Rng, mulberry32, seedToCursor } from '../src/sim/rng';

describe('mulberry32', () => {
  it('produces a deterministic value+state from a given cursor', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    expect(a.value).toBe(b.value);
    expect(a.state).toBe(b.state);
  });

  it('returns floats in [0, 1)', () => {
    let cursor = seedToCursor(7);
    for (let i = 0; i < 1000; i++) {
      const step = mulberry32(cursor);
      expect(step.value).toBeGreaterThanOrEqual(0);
      expect(step.value).toBeLessThan(1);
      cursor = step.state;
    }
  });
});

describe('Rng determinism', () => {
  it('same seed yields identical sequences', () => {
    const a = new Rng(seedToCursor(42));
    const b = new Rng(seedToCursor(42));
    const seqA = Array.from({ length: 20 }, () => a.nextFloat());
    const seqB = Array.from({ length: 20 }, () => b.nextFloat());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds yield different sequences', () => {
    const a = new Rng(seedToCursor(1));
    const b = new Rng(seedToCursor(2));
    const seqA = Array.from({ length: 20 }, () => a.nextFloat());
    const seqB = Array.from({ length: 20 }, () => b.nextFloat());
    expect(seqA).not.toEqual(seqB);
  });

  it('cursor can be serialized and resumed without altering the stream', () => {
    const a = new Rng(seedToCursor(99));
    const first = Array.from({ length: 5 }, () => a.nextFloat());
    const savedCursor = a.state;

    // Resume a fresh Rng from the saved cursor.
    const b = new Rng(savedCursor);
    const resumed = Array.from({ length: 5 }, () => b.nextFloat());

    // Continue the original; it must match the resumed stream exactly.
    const continued = Array.from({ length: 5 }, () => a.nextFloat());
    expect(resumed).toEqual(continued);
    expect(first).not.toEqual(resumed);
  });
});

describe('Rng helpers', () => {
  it('nextInt stays within inclusive bounds', () => {
    const rng = new Rng(seedToCursor(3));
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = rng.nextInt(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    // Over 500 draws all four values should appear.
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it('nextInt throws when max < min', () => {
    const rng = new Rng(seedToCursor(1));
    expect(() => rng.nextInt(5, 1)).toThrow();
  });

  it('chance(0) is always false and chance(1) is always true', () => {
    const rng = new Rng(seedToCursor(8));
    for (let i = 0; i < 50; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });

  it('chance(p) approximates p over many draws', () => {
    const rng = new Rng(seedToCursor(123));
    let hits = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) if (rng.chance(0.3)) hits++;
    const ratio = hits / n;
    expect(ratio).toBeGreaterThan(0.27);
    expect(ratio).toBeLessThan(0.33);
  });

  it('pick throws on an empty array and returns members otherwise', () => {
    const rng = new Rng(seedToCursor(5));
    expect(() => rng.pick([])).toThrow();
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 50; i++) {
      expect(items).toContain(rng.pick(items));
    }
  });
});
