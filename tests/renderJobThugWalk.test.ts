// Guards the PILOT colour-render job (tools/blender/render_jobs/thug_walk.json) against the ingest contract —
// so a malformed pilot fails CI here, before anyone spends a Blender render on it. This job proves the
// textured-GLB path (source:"glb" -> import_scene.gltf, keepSourceMaterial -> no flat-grey toon override)
// on ONE clip (walk) before the full 5-clip set is wired. It MUST stay drop-in compatible with the grey
// render: same camera lock, same cell/anchors, same output dir, so #51's dirOffset + the loader apply unchanged.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { THUG_SPRITE_CONFIG } from '../src/scenes/render/unitSpriteLoader';

const job = JSON.parse(
  readFileSync(new URL('../tools/blender/render_jobs/thug_walk.json', import.meta.url), 'utf8'),
) as {
  unitName: string; source: string; inPlace: boolean; outputDir: string;
  camera: { tileW: number; tileH: number; cameraMode: string; directions: number; dirStepDeg: number };
  actions: { name: string; glb?: string; file?: string; fbx?: string; actionName?: string;
             outputFrameCount: number; playbackFps: number; loop: boolean }[];
  framing: { frameCanvasW: number; anchorX: number; anchorY: number };
  shader: { keepSourceMaterial: boolean; maxTextureSize: number };
  output: { renderEngine: string; viewTransform: string };
};

describe('thug_walk render job — PILOT textured-GLB colour pass', () => {
  it('is a glb source with the In-Place root-strip on (locomotion travels; must be centred)', () => {
    expect(job.source).toBe('glb');
    expect(job.inPlace).toBe(true);
    expect(job.unitName).toBe(THUG_SPRITE_CONFIG.unitName); // 'thug'
  });

  it('keeps the GLB PBR material (no toon override) and downscales the oversized texture', () => {
    expect(job.shader.keepSourceMaterial).toBe(true); // KEEP Material_1 — the whole point of the GLB pass
    expect(job.shader.maxTextureSize).toBeGreaterThan(0);
    expect(job.shader.maxTextureSize).toBeLessThanOrEqual(4096); // 4096² native -> downscaled (1024) for a sprite
    expect(job.output.viewTransform).toBe('Standard'); // true colour, not AgX/Filmic tone-mapping
  });

  it('renders exactly the walk clip from the textured GLB input', () => {
    expect(job.actions).toHaveLength(1); // PILOT: one clip only
    const walk = job.actions[0];
    expect(walk.name).toBe('walk');
    expect(THUG_SPRITE_CONFIG.actions).toContain('walk'); // an action the ingest knows how to load
    const modelPath = walk.glb ?? walk.file ?? walk.fbx ?? '';
    expect(modelPath).toMatch(/^assets\/raw\/thug_glb\/.+\.glb$/i); // gitignored GLB input, never shipped
    expect(walk.actionName).toBe('walking_man'); // the clean single action inside the GLB
    expect(walk.outputFrameCount).toBeGreaterThan(0);
    expect(walk.playbackFps).toBeGreaterThan(0);
    expect(walk.loop).toBe(true); // locomotion loops
  });

  it('keeps the #48 camera lock + cell/anchor IDENTICAL to the grey render (drop-in for the loader)', () => {
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
