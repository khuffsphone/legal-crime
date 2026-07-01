// Guards the REAL-render job config (tools/blender/render_jobs/thug_gangster.json) against the ingest
// contract — so a malformed job fails CI here, before anyone spends a Blender render on it. No Blender, no
// pixels: pure JSON-shape + cross-checks against the camera lock and the sprite ingest's action set.
// This job is now the FULL 5-clip TEXTURED-GLB render (supersedes the flat-grey FBX pass + the walk pilot).
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { THUG_SPRITE_CONFIG } from '../src/scenes/render/unitSpriteLoader';

const job = JSON.parse(
  readFileSync(new URL('../tools/blender/render_jobs/thug_gangster.json', import.meta.url), 'utf8'),
) as {
  unitName: string; source: string; inPlace: boolean; outputDir: string;
  camera: { tileW: number; tileH: number; cameraMode: string; directions: number; dirStepDeg: number };
  actions: {
    name: string; glb: string; actionName: string;
    sourceFrameStart: number; sourceFrameEnd: number;
    outputFrameCount: number; playbackFps: number; loop: boolean;
  }[];
  framing: { frameCanvasW: number; anchorX: number; anchorY: number };
  shader: { keepSourceMaterial: boolean };
  output: { viewTransform: string };
};

describe('thug_gangster render job — full 5-clip textured-GLB pass', () => {
  it('is a GLB source that keeps the embedded PBR material + true-colour view transform', () => {
    expect(job.source).toBe('glb');                       // import_scene.gltf (FBX dropped the texture -> grey)
    expect(job.inPlace).toBe(true);                       // clips travel; strip locomotion per-frame
    expect(job.shader.keepSourceMaterial).toBe(true);     // no flat-grey toon override
    expect(job.output.viewTransform).toBe('Standard');    // true colour, not EEVEE AgX
    expect(job.unitName).toBe(THUG_SPRITE_CONFIG.unitName); // 'thug'
  });

  it('renders all 5 clips, each from its own GLB with a pinned action + explicit frame range', () => {
    const names = job.actions.map((a) => a.name);
    expect(new Set(names)).toEqual(new Set(['idle', 'walk', 'run', 'hurt', 'attack']));
    expect(new Set(names).size).toBe(names.length); // no dupes
    for (const a of job.actions) {
      expect(a.glb).toMatch(/^assets\/raw\/thug_glb\/.+\.glb$/i); // gitignored GLB input path
      expect(a.actionName.length).toBeGreaterThan(0);             // pin the exact take, not auto-pick
      expect(a.outputFrameCount).toBeGreaterThan(0);
      expect(a.playbackFps).toBeGreaterThan(0);
      expect(a.sourceFrameEnd).toBeGreaterThan(a.sourceFrameStart); // valid range
      expect(a.loop).toBe(a.name !== 'attack');                  // loco/idle/hurt loop; attack plays once
    }
    for (const n of names) expect(THUG_SPRITE_CONFIG.actions).toContain(n); // ingest knows each
  });

  it('renders each clip from its ACTUAL action range — attack (Punch_Combo_4) starts at frame 45, not 0', () => {
    const attack = job.actions.find((a) => a.name === 'attack')!;
    expect(attack.actionName).toBe('Punch_Combo_4');
    expect(attack.sourceFrameStart).toBe(45); // the frame-range gotcha — a 0-based render = empty/wrong frames
    expect(attack.sourceFrameEnd).toBe(136);
  });

  it('keeps the camera lock + cell/anchor the ingest depends on (so #51 dirOffset still applies)', () => {
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
    expect(`${job.outputDir}/`).toContain(THUG_SPRITE_CONFIG.baseUrl);
  });
});
