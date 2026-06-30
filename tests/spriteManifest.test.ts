// Pure tests for the emitted unit sprite-sheet manifest — STATE/DATA only, never pixels. Loads the REAL
// committed placeholder manifest so a bad Blender render fails CI (not the eye).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  validateManifest, frameIndexFor, animKey, FRAME_NAME_PATTERN, type UnitSpriteManifest,
} from '../src/scenes/render/spriteManifest';

const MANIFEST_PATH = join(process.cwd(), 'public', 'assets', 'sprites', 'units', 'thug_manifest.json');
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as UnitSpriteManifest;

describe('thug sprite manifest — the committed render output', () => {
  it('the manifest + every action sheet it lists exist on disk (idle is always the core)', () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
    expect(manifest.actions.idle).toBeTruthy(); // CORE clip the ingest requires
    for (const action of Object.keys(manifest.actions)) {
      expect(existsSync(join(process.cwd(), 'public', 'assets', 'sprites', 'units', `thug_${action}.png`))).toBe(true);
    }
  });

  it('validateManifest reports NO problems (8 rows, in-bounds rects, names, anchors, grid alignment)', () => {
    expect(validateManifest(manifest)).toEqual([]);
  });

  it('camera is locked to the 2:1 dimetric tile projection (60° from top, Z=45°, 128×64)', () => {
    expect(manifest.camera.mode).toBe('dimetric2to1');
    expect(manifest.camera.cameraXDeg).toBeCloseTo(60, 3);
    expect(manifest.camera.cameraZDeg).toBe(45);
    expect(manifest.camera.tileW).toBe(128);
    expect(manifest.camera.tileH).toBe(64);
  });

  it('foot-anchor convention is (0.5, 1.0) at the unit level and on every frame', () => {
    expect(manifest.anchor).toEqual({ anchorX: 0.5, anchorY: 1.0 });
    for (const a of Object.values(manifest.actions)) {
      for (const f of a.frames) expect([f.anchorX, f.anchorY]).toEqual([0.5, 1.0]);
    }
  });

  it('action frame counts + fps + loop match the spec (idle 6/6/loop, walk 10/10/loop, attack 8/12/once)', () => {
    expect(manifest.actions.idle).toMatchObject({ cols: 6, rows: 8, playbackFps: 6, loop: true });
    expect(manifest.actions.walk).toMatchObject({ cols: 10, rows: 8, playbackFps: 10, loop: true });
    expect(manifest.actions.attack).toMatchObject({ cols: 8, rows: 8, playbackFps: 12, loop: false });
    // the real Meshy render also ships run + hurt (looping); assert their loop flag when present.
    if (manifest.actions.run) expect(manifest.actions.run).toMatchObject({ rows: 8, loop: true });
    if (manifest.actions.hurt) expect(manifest.actions.hurt).toMatchObject({ rows: 8, loop: true });
    // looping clips drop the terminal duplicate; the non-looping attack keeps its final frame.
    for (const a of Object.values(manifest.actions)) expect(a.frames.length).toBe(a.rows * a.cols);
  });

  it('the placeholder flag matches its action set (placeholder→idle/walk/attack; real render→+run+hurt)', () => {
    const names = Object.keys(manifest.actions).sort();
    if (manifest.placeholder) {
      expect(names).toEqual(['attack', 'idle', 'walk']); // throwaway primitive stand-in — NOT shipped art
    } else {
      // the real Meshy render ships the full clip set the ingest knows
      for (const a of ['idle', 'walk', 'run', 'hurt', 'attack']) expect(names).toContain(a);
    }
  });

  // A manifest validates GEOMETRY, not POSE — so a contaminated render (every slot driven by the same baked
  // clip) can read 100% clean. These checks close that gap from metadata: a real render records the source FBX
  // + resolved clip per slot, and we require each slot to come from a DISTINCT file and a DISTINCT clip.
  // NB we do NOT reject a 'baselayer' sourceAction: Meshy names a per-clip export's real action
  // '<Clip>|baselayer' (e.g. 'walking_man|baselayer'), so the token is the real clip here, not an artefact.
  // The byte-identical-sheet abort in the renderer is the pose-level gate; this is the committed-artefact gate.
  it('a real render maps each slot to a distinct source file AND a distinct clip', () => {
    if (manifest.placeholder) return; // placeholder has no source provenance — nothing to check
    const actions = Object.values(manifest.actions);
    const files = actions.map((a) => a.sourceFile);
    const clips = actions.map((a) => a.sourceAction);
    expect(files.every((f) => typeof f === 'string' && f.length > 0)).toBe(true); // provenance recorded
    expect(clips.every((c) => typeof c === 'string' && c.length > 0)).toBe(true);
    expect(new Set(files).size).toBe(files.length); // no FBX feeds two slots (clip→file mis-map)
    expect(new Set(clips).size).toBe(clips.length); // no clip drives two slots (the contamination signature)
    for (const a of actions) expect(a.sourceFile).not.toMatch(/merged/i); // never the merged-takes FBX
  });
});

describe('manifest helpers — pure', () => {
  it('FRAME_NAME_PATTERN accepts the emitted names and rejects malformed ones', () => {
    expect(FRAME_NAME_PATTERN.test('thug_walk_dir7_f09')).toBe(true);
    expect(FRAME_NAME_PATTERN.test('thug_idle_dir0_f00')).toBe(true);
    expect(FRAME_NAME_PATTERN.test('thug_walk_dir8_f00')).toBe(false); // dir out of 0..7
    expect(FRAME_NAME_PATTERN.test('thug_walk_f00')).toBe(false);
  });

  it('frameIndexFor is row-major (row=direction, col=frame)', () => {
    const walk = manifest.actions.walk;
    expect(frameIndexFor(walk, 0, 0)).toBe(0);
    expect(frameIndexFor(walk, 1, 0)).toBe(walk.cols); // second row starts at cols
    expect(frameIndexFor(walk, 7, 9)).toBe(7 * walk.cols + 9);
  });

  it('animKey is stable and unit:action:dir shaped', () => {
    expect(animKey('thug', 'walk', 3)).toBe('thug:walk:3');
  });

  it('a corrupted manifest is caught by validateManifest', () => {
    const bad = JSON.parse(JSON.stringify(manifest)) as UnitSpriteManifest;
    bad.actions.idle.frames[0].anchorY = 0.5; // break the foot anchor
    bad.actions.idle.frames[1].x = 999999; // push a rect out of bounds
    const problems = validateManifest(bad);
    expect(problems.length).toBeGreaterThan(0);
  });
});
