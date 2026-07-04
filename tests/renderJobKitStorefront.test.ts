// ENV KIT PHASE 1 — guards the kit proof piece: the job locks the character camera + RAW output, and
// the EMITTED manifest obeys the render-scale ruling (docs/env-kit/DECISION_KIT_RENDER_SCALE.md):
// fixed density canvas/ortho = 64·√2 px/BU, anchor (0.5, 1.0), and band heights that are EXACTLY the
// corrected facadeKit.ts constants — the mechanical tie between the Blender output and the TS canon.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  FLOOR_GROUND, STOREFRONT_BULKHEAD, STOREFRONT_GLASS, STOREFRONT_TRANSOM, STOREFRONT_SIGN_BAND,
  V_SNAP, BAY_RUN_PX,
} from '../src/scenes/env/facadeKit';

const job = JSON.parse(readFileSync('tools/blender/render_jobs/kit_storefront_low.json', 'utf8'));
const manifest = JSON.parse(readFileSync('public/assets/sprites/env/kit_storefront_low_2bay_manifest.json', 'utf8'));

const DENSITY = 64 * Math.SQRT2; // 90.5097 px per Blender unit — the ruling's invariant

describe('env-kit proof piece — job + manifest obey the fixed-scale ruling', () => {
  it('job locks the character camera and RAW PNG output', () => {
    expect(job.camera).toMatchObject({ tileW: 128, tileH: 64, cameraMode: 'dimetric2to1', cameraZDeg: 45 });
    expect(job.output.renderEngine).toBe('BLENDER_EEVEE');
    expect(job.output.pngCompression).toBe(100); // lossless — pngquant is banned for kit sheets
    expect(job.geometry).toMatchObject({ builder: 'storefront_low', frontageTiles: 2 });
  });

  it('manifest holds the tile-calibrated density, not a per-piece auto-fit', () => {
    expect(manifest.pxPerBu).toBeCloseTo(DENSITY, 3);
    expect(manifest.canvas / manifest.orthoScale).toBeCloseTo(DENSITY, 3);
    expect(manifest.vPxPerBu).toBeCloseTo(DENSITY * Math.sin(Math.PI / 3), 2); // 78.3846 vertical px/BU
    expect(manifest.anchor).toEqual({ anchorX: 0.5, anchorY: 1.0 });
    expect(manifest.camera).toMatchObject({ mode: 'dimetric2to1', cameraXDeg: 60, cameraZDeg: 45 });
  });

  it('band stack is EXACTLY the corrected facadeKit constants and sums to FLOOR_GROUND', () => {
    const byRole = Object.fromEntries(manifest.bandsPx.map((b: { role: string; hPx: number }) => [b.role, b.hPx]));
    expect(byRole).toEqual({
      signHost: STOREFRONT_SIGN_BAND, // 36
      transom: STOREFRONT_TRANSOM,    // 20
      glass: STOREFRONT_GLASS,        // 56
      bulkhead: STOREFRONT_BULKHEAD,  // 20
    });
    const sum = manifest.bandsPx.reduce((s: number, b: { hPx: number }) => s + b.hPx, 0);
    expect(sum).toBe(FLOOR_GROUND); // 132
    for (const b of manifest.bandsPx) expect(b.hPx % V_SNAP).toBe(0);
  });

  it('base edge spans the frontage diamond: +64 screen-x / +32 screen-y per frontage tile', () => {
    const { left, right } = manifest.baseEdgePx;
    expect(right.xPx - left.xPx).toBeCloseTo(manifest.frontageTiles * BAY_RUN_PX, 1);      // 128
    expect(right.yPx - left.yPx).toBeCloseTo(manifest.frontageTiles * (BAY_RUN_PX / 2), 1); // 64
    expect(manifest.bayRunPx).toBe(BAY_RUN_PX);
  });
});
