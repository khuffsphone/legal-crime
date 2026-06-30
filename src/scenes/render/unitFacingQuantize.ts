// unitFacingQuantize.ts — PURE facing → sprite-row math for the iso unit sprite-sheet ingest (RTS sprite
// pipeline). No Phaser. The sheets render 8 directions as even 45° MODEL-yaw steps; this maps a unit's
// in-game facing to the matching row.
//
// DERIVATION (grounded against the live projection, not eyeballed): src/sim/inspect.ts defines Facing in
// GRID space (+x=E, +y=S); src/sim/iso.ts projects grid→screen as x=(gx−gy)·64, y=(gx+gy)·32. The Blender
// render yaws the model about world-Z in 45° steps with forward=+Y, camera azimuth Z=45°. Projecting both
// the 8 grid directions and the 8 model-yaw directions to screen, they line up EXACTLY 1:1, giving the
// table below. (The screen ANGLES are unevenly spaced because the dimetric projection is anisotropic — so
// we map by identity table, not by an even-degree bucket. The generic facingDegToDirIndex is kept for the
// spec/tests and for a future model whose forward axis differs, via dirOffset.)

import type { Facing } from '../../sim/inspect';

export const DIR_COUNT = 8;
export const DIR_START_DEG = 0;
export const DIR_STEP_DEG = 45;

/**
 * Generic Schmitt-free quantizer: snap a heading in degrees to the nearest of `dirCount` evenly-spaced
 * direction rows. `facingDegToDirIndex(deg) = round(normalize(deg − start)/step) % count`. Pure; covers
 * all real degrees (negative, >360) and always returns 0..count−1.
 */
export function facingDegToDirIndex(
  facingDeg: number,
  dirStartDeg: number = DIR_START_DEG,
  dirStepDeg: number = DIR_STEP_DEG,
  dirCount: number = DIR_COUNT,
): number {
  const rel = facingDeg - dirStartDeg;
  const step = 360 / dirCount; // even spacing; dirStepDeg kept for API symmetry / docs
  void dirStepDeg;
  const idx = Math.round(rel / step);
  return ((idx % dirCount) + dirCount) % dirCount;
}

/**
 * Exact grid-facing → sprite row, derived from the iso projection (see header). N is screen up-right
 * (dir0); going clockwise through the rendered yaw order.
 */
export const FACING_TO_DIR: Readonly<Record<Facing, number>> = {
  N: 0,
  NW: 1,
  W: 2,
  SW: 3,
  S: 4,
  SE: 5,
  E: 6,
  NE: 7,
};

/**
 * The sprite row for a unit's grid facing. `dirOffset` (0..7) is a runtime calibration knob — bump it if a
 * future model's forward axis differs from this placeholder's (+Y); default 0 is correct for the blockout.
 */
export function facingToDirIndex(facing: Facing, dirOffset: number = 0): number {
  return ((FACING_TO_DIR[facing] + dirOffset) % DIR_COUNT + DIR_COUNT) % DIR_COUNT;
}

/**
 * Runtime facing calibration for the THUG sprite sheets. The real Mixamo gangster FBX forward axis is **-Y**,
 * and the rows were baked with `modelForwardDeg=0` (uncompensated — see render_jobs/thug_gangster.json), so
 * every row visually depicts the **180° antipode** of its FACING_TO_DIR label → the figure moonwalks (faces
 * opposite its travel) in all 8 directions. FACING_TO_DIR is a clean 45° rotational sequence, so rotating the
 * row selection by 4 octants (= 180°) cancels the flip uniformly and the figure faces its travel direction.
 * (Durable alternative, decided separately: re-render with `modelForwardDeg:180` and reset this to 0.)
 */
export const THUG_FACING_OFFSET = 4;
