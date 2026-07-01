// spriteManifest.ts — PURE types + validation + frame-index math for the emitted unit sprite-sheet manifest
// (tools/blender/render_iso_unit.py writes it). No Phaser. The Phaser loader/animator consume these; the
// tests validate the REAL emitted JSON against validateManifest() so a bad render fails CI, never pixels.

import { DIR_COUNT } from './unitFacingQuantize';

export interface FrameRect {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  anchorX: number;
  anchorY: number;
  dirIndex: number;
  action: string;
  frameIndex: number;
}

export interface ActionManifest {
  action: string;
  image: string;
  frameW: number;
  frameH: number;
  rows: number;
  cols: number;
  playbackFps: number;
  loop: boolean;
  /** Traceability for a real (fbx) render: the source FBX basename + the resolved clip action that drove this
   * slot. Lets a reviewer (or CI) confirm each slot came from a DISTINCT clip — catching a baked-baselayer
   * hijack or a clip→file mis-map from metadata alone. Absent on the primitive blockout placeholder. */
  sourceFile?: string;
  sourceAction?: string;
  /** The shared locked scale, mirrored per action (identical for every clip — the bbox pre-pass unions all
   * clips into ONE ortho_scale/figurePxH). Present on the multi-clip GLB render; a test asserts they're all
   * equal so a per-clip resize regression fails. Absent on older single-scale-at-top-level manifests. */
  figurePxH?: number;
  orthoScale?: number;
  frames: FrameRect[];
}

export interface UnitSpriteManifest {
  unitName: string;
  placeholder?: boolean;
  camera: { mode: string; cameraXDeg: number; cameraZDeg: number; tileW: number; tileH: number; orthoScale?: number };
  anchor: { anchorX: number; anchorY: number };
  directions: number;
  dirStartDeg: number;
  dirStepDeg: number;
  modelForwardDeg: number;
  figurePxH: number;
  figurePxW: number;
  frameCanvas: number;
  pad: number;
  actions: Record<string, ActionManifest>;
}

/** Frame names look like `thug_walk_dir7_f09` — lowercase unit, action, dir0..7, zero-padded frame. */
export const FRAME_NAME_PATTERN = /^[a-z0-9]+_[a-z]+_dir[0-7]_f\d{2,}$/;

/** Phaser-spritesheet frame index (row-major: row=direction, col=frame) for a uniform-cell sheet. */
export function frameIndexFor(action: ActionManifest, dirIndex: number, frameIndex: number): number {
  return dirIndex * action.cols + frameIndex;
}

/** Stable animation key for a unit/action/direction (e.g. `thug:walk:3`). */
export function animKey(unitName: string, action: string, dirIndex: number): string {
  return `${unitName}:${action}:${dirIndex}`;
}

/**
 * Validate a manifest's STATE/DATA (never pixels): 8 rows, every rect inside its sheet, names well-formed,
 * anchors exactly (0.5,1.0), cols == frame count per row, uniform cell == frameW/H. Returns a list of human
 * problems (empty == valid). Used by the test that loads the real emitted manifest.
 */
export function validateManifest(m: UnitSpriteManifest): string[] {
  const problems: string[] = [];
  if (m.directions !== DIR_COUNT) problems.push(`directions ${m.directions} != ${DIR_COUNT}`);
  if (m.anchor.anchorX !== 0.5 || m.anchor.anchorY !== 1.0) problems.push(`unit anchor not (0.5,1.0): ${JSON.stringify(m.anchor)}`);

  for (const [key, a] of Object.entries(m.actions)) {
    if (a.action !== key) problems.push(`action key '${key}' != action.action '${a.action}'`);
    if (a.rows !== DIR_COUNT) problems.push(`${key}: rows ${a.rows} != ${DIR_COUNT}`);
    const sheetW = a.cols * a.frameW;
    const sheetH = a.rows * a.frameH;
    // exactly cols frames per direction row
    const perDir = new Map<number, number>();
    for (const f of a.frames) {
      if (!FRAME_NAME_PATTERN.test(f.name)) problems.push(`${key}: bad frame name '${f.name}'`);
      if (f.anchorX !== 0.5 || f.anchorY !== 1.0) problems.push(`${key}: frame '${f.name}' anchor not (0.5,1.0)`);
      if (f.w !== a.frameW || f.h !== a.frameH) problems.push(`${key}: frame '${f.name}' size ${f.w}x${f.h} != cell ${a.frameW}x${a.frameH}`);
      if (f.x < 0 || f.y < 0 || f.x + f.w > sheetW || f.y + f.h > sheetH) {
        problems.push(`${key}: frame '${f.name}' rect out of bounds (sheet ${sheetW}x${sheetH})`);
      }
      if (f.dirIndex < 0 || f.dirIndex >= DIR_COUNT) problems.push(`${key}: frame '${f.name}' dirIndex ${f.dirIndex} out of range`);
      if (f.x !== f.frameIndex * a.frameW || f.y !== f.dirIndex * a.frameH) {
        problems.push(`${key}: frame '${f.name}' rect (${f.x},${f.y}) != grid (col ${f.frameIndex}, row ${f.dirIndex})`);
      }
      perDir.set(f.dirIndex, (perDir.get(f.dirIndex) ?? 0) + 1);
    }
    for (let d = 0; d < DIR_COUNT; d++) {
      if ((perDir.get(d) ?? 0) !== a.cols) problems.push(`${key}: dir ${d} has ${perDir.get(d) ?? 0} frames, expected cols=${a.cols}`);
    }
    if (a.frames.length !== a.rows * a.cols) problems.push(`${key}: ${a.frames.length} frames != rows*cols ${a.rows * a.cols}`);
  }
  return problems;
}
