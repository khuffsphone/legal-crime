// ENV KIT PHASE 1 — batch-wide invariants: EVERY rendered kit manifest obeys the fixed-scale ruling
// (docs/env-kit/DECISION_KIT_RENDER_SCALE.md), the batch job is well-formed, and the kit is exactly the
// 28 pieces the index documents. A piece rendered at a drifted density, a wrong anchor, or an
// off-canon band height fails here before K ever has to eyeball it.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  FLOOR_GROUND, FLOOR_UPPER, DOOR_RESIDENTIAL, DOOR_COMMERCIAL,
  STOREFRONT_BULKHEAD, STOREFRONT_GLASS, STOREFRONT_TRANSOM, STOREFRONT_SIGN_BAND,
  CORNICE_DEFAULT, CORNICE_LARGE, PARAPET_DEFAULT, PARAPET_TALL, V_SNAP, BAY_RUN_PX,
} from '../src/scenes/env/facadeKit';

const ENV_DIR = 'public/assets/sprites/env';
const DENSITY = 64 * Math.SQRT2;

const manifestFiles = readdirSync(ENV_DIR).filter((f) => f.endsWith('_manifest.json')).sort();
const manifests = manifestFiles.map((f) => ({
  file: f,
  m: JSON.parse(readFileSync(join(ENV_DIR, f), 'utf8')),
}));
const batch = JSON.parse(readFileSync('tools/blender/render_jobs/kit_batch_phase1.json', 'utf8'));

describe('env-kit batch — every manifest obeys the fixed-scale ruling', () => {
  it('the kit is exactly 28 pieces (27 batch + the K-approved proof), with matching sheets', () => {
    expect(manifests.length).toBe(28);
    expect(batch.pieces.length).toBe(27);
    const batchIds = batch.pieces.map((p: { pieceId: string }) => p.pieceId);
    expect(new Set(batchIds).size).toBe(27);
    expect(batchIds).not.toContain('storefront_low_2bay'); // the proof's approved bytes never re-batch
    const sheets = new Set(readdirSync(ENV_DIR).filter((f) => f.endsWith('.png')));
    for (const { m } of manifests) expect(sheets.has(m.image), `sheet for ${m.pieceId}`).toBe(true);
  });

  it('every manifest: canon density, anchor (0.5,1.0), character camera, snapped bands', () => {
    for (const { file, m } of manifests) {
      expect(m.pxPerBu, file).toBeCloseTo(DENSITY, 3);
      expect(m.canvas / m.orthoScale, file).toBeCloseTo(DENSITY, 3);
      expect(m.vPxPerBu, file).toBeCloseTo(DENSITY * Math.sin(Math.PI / 3), 2);
      expect(m.anchor, file).toEqual({ anchorX: 0.5, anchorY: 1.0 });
      expect(m.camera, file).toMatchObject({ mode: 'dimetric2to1', cameraXDeg: 60, cameraZDeg: 45 });
      expect(m.canvas % 4, file).toBe(0);
      for (const b of m.bandsPx ?? []) expect(b.hPx % V_SNAP, `${file} band ${b.role}`).toBe(0);
    }
  });

  it('frontage pieces carry a base edge spanning exactly ±64/±32 screen px per tile', () => {
    for (const { file, m } of manifests) {
      if (!m.frontageTiles || !m.baseEdgePx) continue;
      const { left, right } = m.baseEdgePx;
      expect(Math.abs(right.xPx - left.xPx), file).toBeCloseTo(m.frontageTiles * BAY_RUN_PX, 1);
      expect(Math.abs(right.yPx - left.yPx), file).toBeCloseTo(m.frontageTiles * (BAY_RUN_PX / 2), 1);
    }
  });

  it('band heights are EXACTLY the corrected facadeKit constants', () => {
    const canon: Record<string, number[]> = {
      signHost: [STOREFRONT_SIGN_BAND],
      transom: [STOREFRONT_TRANSOM],
      glass: [STOREFRONT_GLASS],
      bulkhead: [STOREFRONT_BULKHEAD],
      brickUpper: [FLOOR_UPPER],
      doorCommercial: [DOOR_COMMERCIAL],
      doorResidential: [DOOR_RESIDENTIAL],
      cornice: [CORNICE_DEFAULT, CORNICE_LARGE],
      parapet: [PARAPET_DEFAULT, PARAPET_TALL],
      fasciaSign: [48, 64],   // painted board / blade panel (research §4 sizes)
      serviceDoor: [96],      // loading door (research #16)
    };
    for (const { file, m } of manifests) {
      for (const b of m.bandsPx ?? []) {
        expect(canon[b.role], `${file}: unknown band role ${b.role}`).toBeDefined();
        expect(canon[b.role], `${file}: ${b.role} ${b.hPx}px off-canon`).toContain(b.hPx);
      }
    }
    // the ground-floor storefronts must stack to exactly FLOOR_GROUND
    for (const { file, m } of manifests) {
      if (!String(m.pieceId).startsWith('storefront_')) continue;
      const sum = m.bandsPx.reduce((s: number, b: { hPx: number }) => s + b.hPx, 0);
      expect(sum, file).toBe(FLOOR_GROUND);
    }
  });

  it('batch job locks the character camera, RAW output, and known builders only', () => {
    expect(batch.camera).toMatchObject({ tileW: 128, tileH: 64, cameraMode: 'dimetric2to1', cameraZDeg: 45 });
    expect(batch.output).toMatchObject({ renderEngine: 'BLENDER_EEVEE', pngCompression: 100 });
    const builders = new Set(['storefront_low', 'facade_body', 'window_module', 'door_module', 'cap',
      'sign', 'awning', 'loading_door', 'fire_escape', 'roof_clutter', 'overlay']);
    for (const p of batch.pieces) expect(builders.has(p.geometry.builder), p.pieceId).toBe(true);
  });
});
