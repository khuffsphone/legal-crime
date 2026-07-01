// Pure tests for the iso sprite-sheet facing → row math. No Phaser, no pixels.
import { describe, it, expect } from 'vitest';
import {
  facingDegToDirIndex, facingToDirIndex, FACING_TO_DIR, DIR_COUNT, DIR_STEP_DEG, THUG_FACING_OFFSET,
} from '../src/scenes/render/unitFacingQuantize';
import { facingFromVector } from '../src/sim/inspect';
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

// ── facing-vs-TRAVEL guard (the moonwalk regression) ─────────────────────────────────────────────────────
// The old tests above assert dirIndex N → row N — which CANNOT catch a uniform 180° facing flip, because the
// rows still map 1:1, they just *depict* the wrong way. This guard ties the selected row to the direction the
// figure must VISUALLY FACE for a given travel vector, pinned to the proven-correct procedural reference
// (the rig consumes the same facingFromVector()/unitFacing() and never moonwalks).
//
// GROUND TRUTH baked into the sheets (K. eyeball-confirmed, uniform across all 8): the Mixamo gangster FBX
// forward axis is -Y and the rows were baked with modelForwardDeg=0, so each row visually depicts the 180°
// ANTIPODE of its FACING_TO_DIR label. If the render is ever redone with modelForwardDeg:180, drop both this
// antipode model AND THUG_FACING_OFFSET back to 0 together.
describe('facing-vs-travel — thug sprite must face its travel direction (moonwalk guard)', () => {
  const ANTIPODE: Readonly<Record<Facing, Facing>> = {
    N: 'S', S: 'N', E: 'W', W: 'E', NE: 'SW', SW: 'NE', NW: 'SE', SE: 'NW',
  };
  const FACING_OF_ROW: Record<number, Facing> = {};
  for (const f of ALL_FACINGS) FACING_OF_ROW[FACING_TO_DIR[f]] = f;
  // What baked row R actually depicts, given the -Y/modelForwardDeg=0 flip = antipode of the row's label.
  const depictedFacingOfRow = (row: number): Facing => ANTIPODE[FACING_OF_ROW[row]];

  // One unit travel vector per octant in grid space (+x=E, +y=S).
  const TRAVEL: ReadonlyArray<[number, number]> = [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
  ];

  const facesTravel = (dirOffset: number): boolean =>
    TRAVEL.every(([dx, dy]) => {
      const travel = facingFromVector(dx, dy)!;            // procedural-correct facing for this vector
      const row = facingToDirIndex(travel, dirOffset);     // sprite picks this row
      return depictedFacingOfRow(row) === travel;          // …and it must visually face the travel direction
    });

  it('GREEN at THUG_FACING_OFFSET (=4): every travel octant renders the figure facing forward', () => {
    expect(THUG_FACING_OFFSET).toBe(4);
    for (const [dx, dy] of TRAVEL) {
      const travel = facingFromVector(dx, dy)!;
      const row = facingToDirIndex(travel, THUG_FACING_OFFSET);
      expect(depictedFacingOfRow(row)).toBe(travel);
    }
    expect(facesTravel(THUG_FACING_OFFSET)).toBe(true);
  });

  it('RED at dirOffset 0: the uncorrected bake moonwalks (every octant faces its antipode)', () => {
    // Proves the guard actually catches the bug — it must FAIL at 0 and PASS at 4, never both.
    expect(facesTravel(0)).toBe(false);
    for (const [dx, dy] of TRAVEL) {
      const travel = facingFromVector(dx, dy)!;
      const row = facingToDirIndex(travel, 0);
      expect(depictedFacingOfRow(row)).toBe(ANTIPODE[travel]); // uniform 180° reversal
    }
  });
});
