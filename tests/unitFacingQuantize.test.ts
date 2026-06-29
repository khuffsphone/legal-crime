// Pure tests for the iso sprite-sheet facing → row math. No Phaser, no pixels.
import { describe, it, expect } from 'vitest';
import {
  facingDegToDirIndex, facingToDirIndex, FACING_TO_DIR, DIR_COUNT, DIR_STEP_DEG,
} from '../src/scenes/render/unitFacingQuantize';
import type { Facing } from '../src/sim/inspect';

const ALL_FACINGS: Facing[] = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

describe('facingDegToDirIndex — generic even-bucket quantizer', () => {
  it('every real degree maps into 0..7', () => {
    for (let d = -720; d <= 720; d += 1) {
      const i = facingDegToDirIndex(d);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(DIR_COUNT);
      expect(Number.isInteger(i)).toBe(true);
    }
  });
  it('snaps each on-axis heading to its own row and wraps cleanly', () => {
    for (let k = 0; k < DIR_COUNT; k++) {
      expect(facingDegToDirIndex(k * DIR_STEP_DEG)).toBe(k);
      expect(facingDegToDirIndex(k * DIR_STEP_DEG + 360)).toBe(k); // +1 turn
      expect(facingDegToDirIndex(k * DIR_STEP_DEG - 360)).toBe(k); // -1 turn
    }
    expect(facingDegToDirIndex(359)).toBe(0); // rounds up across the wrap
  });
});

describe('FACING_TO_DIR — exact grid-facing → sprite row (derived from the iso projection)', () => {
  it('is a bijection onto 0..7 (each direction has exactly one distinct row)', () => {
    const rows = ALL_FACINGS.map((f) => FACING_TO_DIR[f]);
    expect(new Set(rows).size).toBe(DIR_COUNT);
    expect([...rows].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
  it('matches the locked mapping (N up-right = row 0, clockwise through the yaw order)', () => {
    expect(FACING_TO_DIR).toEqual({ N: 0, NW: 1, W: 2, SW: 3, S: 4, SE: 5, E: 6, NE: 7 });
  });
});

describe('facingToDirIndex — runtime lookup with calibration offset', () => {
  it('returns the table row at offset 0', () => {
    for (const f of ALL_FACINGS) expect(facingToDirIndex(f)).toBe(FACING_TO_DIR[f]);
  });
  it('a dirOffset rotates the rows modulo 8 (and stays in range)', () => {
    for (const f of ALL_FACINGS) {
      expect(facingToDirIndex(f, 3)).toBe((FACING_TO_DIR[f] + 3) % 8);
      const neg = facingToDirIndex(f, -1);
      expect(neg).toBeGreaterThanOrEqual(0);
      expect(neg).toBeLessThan(8);
      expect(neg).toBe((FACING_TO_DIR[f] + 7) % 8);
    }
  });
});
