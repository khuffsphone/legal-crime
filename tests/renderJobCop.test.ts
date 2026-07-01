// Guards the cop render job (tools/blender/render_jobs/cop.json) against the render contract — so a malformed
// job fails CI before a Blender render is spent. No Blender, no pixels: pure JSON shape + camera-lock + the
// locked shared scale. The cop is a PARTIAL 3-clip set (walk/run/attack; idle/hurt deferred) and is NOT wired
// into gameplay yet, so this validates the job directly (no loader config to cross-check).
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const job = JSON.parse(
  readFileSync(new URL('../tools/blender/render_jobs/cop.json', import.meta.url), 'utf8'),
) as {
  unitName: string; source: string; inPlace: boolean; outputDir: string;
  camera: { tileW: number; tileH: number; cameraMode: string; directions: number; dirStepDeg: number };
  actions: { name: string; glb: string; outputFrameCount: number; playbackFps: number; loop: boolean }[];
  framing: { frameCanvasW: number; anchorX: number; anchorY: number };
  shader: { keepSourceMaterial: boolean };
  output: { viewTransform: string; fixedOrthoScale: number };
};

describe('cop render job — Track B partial 3-clip GLB pass', () => {
  it('is a GLB source that keeps the embedded material + true colour (reuses the thug pipeline)', () => {
    expect(job.unitName).toBe('cop');
    expect(job.source).toBe('glb');
    expect(job.inPlace).toBe(true);
    expect(job.shader.keepSourceMaterial).toBe(true);
    expect(job.output.viewTransform).toBe('Standard');
  });

  it('renders exactly the 3 clips we have — walk/run/attack (no idle, no hurt this pass)', () => {
    const names = job.actions.map((a) => a.name);
    expect(new Set(names)).toEqual(new Set(['walk', 'run', 'attack']));
    expect(names.length).toBe(3); // partial set — idle/hurt are a deferred Meshy follow-up
    for (const a of job.actions) {
      expect(a.glb).toMatch(/^assets\/raw\/cop_glb\/.+\.glb$/i); // gitignored GLB input path
      expect(a.outputFrameCount).toBeGreaterThan(0);
      expect(a.playbackFps).toBeGreaterThan(0);
      expect(a.loop).toBe(a.name !== 'attack'); // walk/run loop; attack plays once
    }
  });

  it('LOCKS the shared kit scale — fixedOrthoScale 2.8284 (matches props/kit at 8 px/ft)', () => {
    expect(job.output.fixedOrthoScale).toBeCloseTo(2.8284, 4); // √2·256/128 = 64√2 px per tile-unit density
  });

  it('keeps the camera lock + cell/anchor the loader schema depends on', () => {
    expect(job.camera.tileW).toBe(128);
    expect(job.camera.tileH).toBe(64);
    expect(job.camera.cameraMode).toBe('dimetric2to1');
    expect(job.camera.directions).toBe(8);
    expect(job.camera.dirStepDeg).toBe(45);
    expect(job.framing.frameCanvasW).toBe(256);
    expect(job.framing.anchorX).toBe(0.5);
    expect(job.framing.anchorY).toBe(1.0);
  });

  it('outputs to the sprite units dir the ingest loads from', () => {
    expect(job.outputDir).toContain('assets/sprites/units');
  });
});
