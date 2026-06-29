// Guards the REAL-render job config (tools/blender/render_jobs/thug_gangster.json) against the ingest
// contract — so a malformed job fails CI here, before anyone spends a Blender render on it. No Blender, no
// pixels: pure JSON-shape + cross-checks against the camera lock and the sprite ingest's action set.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { THUG_SPRITE_CONFIG } from '../src/scenes/render/unitSpriteLoader';

const job = JSON.parse(
  readFileSync(new URL('../tools/blender/render_jobs/thug_gangster.json', import.meta.url), 'utf8'),
) as {
  unitName: string; source: string; inPlace: boolean; outputDir: string;
  camera: { tileW: number; tileH: number; cameraMode: string; directions: number; dirStepDeg: number };
  actions: { name: string; fbx: string; outputFrameCount: number; playbackFps: number; loop: boolean }[];
  framing: { frameCanvasW: number; anchorX: number; anchorY: number };
};

describe('thug_gangster render job — real Mixamo FBX pass', () => {
  it('is an fbx source with the In-Place safeguard on', () => {
    expect(job.source).toBe('fbx');
    expect(job.inPlace).toBe(true);
    expect(job.unitName).toBe(THUG_SPRITE_CONFIG.unitName); // 'thug'
  });

  it('renders idle+walk(+run+hurt); every clip names an FBX input + loops; idle (the core) is present', () => {
    const names = job.actions.map((a) => a.name);
    expect(names).toContain('idle');                 // CORE clip the ingest requires
    expect(names).toContain('walk');
    expect(new Set(names).size).toBe(names.length);  // no dupes
    for (const a of job.actions) {
      expect(a.fbx).toMatch(/^assets\/raw\/thug\/.+\.fbx$/i); // gitignored input path
      expect(a.outputFrameCount).toBeGreaterThan(0);
      expect(a.playbackFps).toBeGreaterThan(0);
      expect(a.loop).toBe(true); // all four clips this pass are loops (attack arrives later, non-loop)
    }
    // every rendered action is one the ingest knows how to load
    for (const n of names) expect(THUG_SPRITE_CONFIG.actions).toContain(n);
  });

  it('keeps the #48 camera lock + cell/anchor the ingest depends on', () => {
    expect(job.camera.tileW).toBe(128);
    expect(job.camera.tileH).toBe(64);
    expect(job.camera.cameraMode).toBe('dimetric2to1'); // 2:1 -> 60deg from top-down (exact)
    expect(job.camera.directions).toBe(8);
    expect(job.camera.dirStepDeg).toBe(45);
    expect(job.framing.frameCanvasW).toBe(THUG_SPRITE_CONFIG.cell); // 256 — must match the loader cell
    expect(job.framing.anchorX).toBe(0.5);
    expect(job.framing.anchorY).toBe(1.0); // foot anchor bottom-centre
  });

  it('outputs to the dir the ingest loads sheets from', () => {
    // ingest baseUrl 'assets/sprites/units/' <- job outputDir 'public/assets/sprites/units'
    expect(`${job.outputDir}/`).toContain(THUG_SPRITE_CONFIG.baseUrl);
  });
});
