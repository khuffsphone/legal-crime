// Guards the FULL 5-clip COLOUR render job (tools/blender/render_jobs/thug_glb.json) against the ingest
// contract — so a malformed job fails CI here, before anyone spends a 5-clip Blender render on it. This is
// the textured-GLB set that supersedes the grey FBX render: source:"glb" -> import_scene.gltf, keepSourceMaterial
// (no flat-grey toon override), and — the load-bearing item — sharedScale:true with all 5 clips in ONE job so
// the bbox pre-pass unions them into ONE figure scale (no resize-on-action). Camera/framing/anchors/dirs stay
// IDENTICAL to the grey render so THUG_FACING_OFFSET (#51) and the loader apply unchanged.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { THUG_SPRITE_CONFIG } from '../src/scenes/render/unitSpriteLoader';

const job = JSON.parse(
  readFileSync(new URL('../tools/blender/render_jobs/thug_glb.json', import.meta.url), 'utf8'),
) as {
  unitName: string; source: string; inPlace: boolean; sharedScale: boolean; outputDir: string;
  camera: { tileW: number; tileH: number; cameraMode: string; directions: number; dirStepDeg: number; modelForwardDeg: number };
  actions: { name: string; glb?: string; file?: string; fbx?: string; actionName?: string;
             sourceFrameStart?: number; sourceFrameEnd?: number;
             outputFrameCount: number; playbackFps: number; loop: boolean }[];
  framing: { frameCanvasW: number; anchorX: number; anchorY: number };
  shader: { keepSourceMaterial: boolean; maxTextureSize: number };
  output: { renderEngine: string; viewTransform: string };
};

describe('thug_glb render job — full 5-clip textured-GLB colour pass', () => {
  it('is a glb source with In-Place root-strip AND sharedScale on', () => {
    expect(job.source).toBe('glb');
    expect(job.inPlace).toBe(true);
    expect(job.sharedScale).toBe(true); // ★ all clips in ONE job -> one unioned scale (no resize-on-action)
    expect(job.unitName).toBe(THUG_SPRITE_CONFIG.unitName); // 'thug'
  });

  it('keeps each GLB PBR material (no toon override) + downscales the oversized texture + true-colour view', () => {
    expect(job.shader.keepSourceMaterial).toBe(true);
    expect(job.shader.maxTextureSize).toBeGreaterThan(0);
    expect(job.shader.maxTextureSize).toBeLessThanOrEqual(4096); // 4096² native -> downscaled for a sprite
    expect(job.output.viewTransform).toBe('Standard'); // true colour, not AgX/Filmic tone-mapping
  });

  it('renders all 5 clips in ONE job (the shared-scale precondition), each a distinct GLB the ingest knows', () => {
    const names = job.actions.map((a) => a.name);
    expect(new Set(names)).toEqual(new Set(['idle', 'walk', 'run', 'hurt', 'attack']));
    expect(names.length).toBe(5); // no dupes; ONE job so the bbox pre-pass unions all 5 into one scale
    const paths = job.actions.map((a) => a.glb ?? a.file ?? a.fbx ?? '');
    expect(new Set(paths).size).toBe(paths.length); // each clip its own GLB (distinct source per slot)
    for (const a of job.actions) {
      const p = a.glb ?? a.file ?? a.fbx ?? '';
      expect(p).toMatch(/^assets\/raw\/thug_glb\/.+\.glb$/i); // gitignored GLB inputs, never shipped
      for (const n of names) expect(THUG_SPRITE_CONFIG.actions).toContain(n); // every action is loadable
      expect(a.outputFrameCount).toBeGreaterThan(0);
      expect(a.playbackFps).toBeGreaterThan(0);
    }
  });

  it('frame counts + loop flags match the grey render (keeps spriteManifest.test cols/loop locks green)', () => {
    const byName = Object.fromEntries(job.actions.map((a) => [a.name, a]));
    expect(byName.idle).toMatchObject({ outputFrameCount: 6, playbackFps: 6, loop: true });
    expect(byName.walk).toMatchObject({ outputFrameCount: 10, playbackFps: 10, loop: true });
    expect(byName.run).toMatchObject({ outputFrameCount: 10, loop: true });
    expect(byName.hurt).toMatchObject({ outputFrameCount: 10, loop: true });
    expect(byName.attack).toMatchObject({ outputFrameCount: 8, playbackFps: 12, loop: false }); // plays once
  });

  it('gives confirmed action names for idle/walk/run; lets hurt/attack auto-select (no guessed names)', () => {
    const byName = Object.fromEntries(job.actions.map((a) => [a.name, a]));
    expect(byName.idle.actionName).toBe('Long_Breathe_and_Look_Around');
    expect(byName.walk.actionName).toBe('walking_man');
    expect(byName.run.actionName).toBe('running');
    // hurt (Gunshot_Reaction) + attack (Punch_Combo_4): single-action GLBs, so no actionName is asserted —
    // the importer auto-selects the one action and its real name flows into the manifest from action.name.
    expect(byName.hurt.actionName).toBeUndefined();
    expect(byName.attack.actionName).toBeUndefined();
  });

  it('keeps the #48 camera lock + cell/anchor IDENTICAL to the grey render (drop-in for the loader)', () => {
    expect(job.camera.tileW).toBe(128);
    expect(job.camera.tileH).toBe(64);
    expect(job.camera.cameraMode).toBe('dimetric2to1'); // 2:1 -> 60deg from top-down (exact)
    expect(job.camera.directions).toBe(8);
    expect(job.camera.dirStepDeg).toBe(45);
    expect(job.camera.modelForwardDeg).toBe(0); // like grey -> THUG_FACING_OFFSET (+4) still applies
    expect(job.framing.frameCanvasW).toBe(THUG_SPRITE_CONFIG.cell); // 256 — must match the loader cell
    expect(job.framing.anchorX).toBe(0.5);
    expect(job.framing.anchorY).toBe(1.0); // foot anchor bottom-centre
  });

  it('outputs to the dir the ingest loads sheets from', () => {
    // ingest baseUrl 'assets/sprites/units/' <- job outputDir 'public/assets/sprites/units'
    expect(`${job.outputDir}/`).toContain(THUG_SPRITE_CONFIG.baseUrl);
  });
});
