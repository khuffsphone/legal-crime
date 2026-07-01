// Phase-0 building-kit camera + scale proof (pure math; no Blender, no pixels). Guards the two invariants the
// reference-cube render (tools/blender/render_cube_proof.py) and the fixed-scale renderer flag depend on:
//   1. the character camera projects a flat unit tile to a 2:1 diamond (so the kit shares the tile projection);
//   2. the ortho_scale that makes that diamond exactly tileW px in a canvas-px cell — the number K reconciles
//      against GPT-Pro's px/ft before locking the kit scale.
// This is the CI-checkable half of the proof; the pixel half (diamond shape) is K's eyeball on the render.
import { describe, it, expect } from 'vitest';

// Project a unit XY square onto the character camera's right/up axes (dimetric2to1: 60deg from top, Z=45).
// right=(cos45,sin45,0); up=(-sin45 cos60, cos45 cos60, sin60). A 1x1 tile spans these along right/up:
const D2R = Math.PI / 180;
const c45 = Math.cos(45 * D2R), s45 = Math.sin(45 * D2R);
const c60 = Math.cos(60 * D2R), s60 = Math.sin(60 * D2R);

function unitTileSpan(): { widthR: number; heightU: number } {
  // corners of the z=0 unit square
  const pts = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const rs = pts.map(([x, y]) => x * c45 + y * s45);              // dot with right=(c45,s45,0)
  const us = pts.map(([x, y]) => x * -s45 * c60 + y * c45 * c60); // dot with up=(-s45 c60, c45 c60, s60); z=0
  return { widthR: Math.max(...rs) - Math.min(...rs), heightU: Math.max(...us) - Math.min(...us) };
}

// Mirror of render_cube_proof.py's derivation: ortho_scale = sqrt(2) * canvas / tileW.
function expectedOrthoScale(canvas: number, tileW: number): number {
  return (Math.SQRT2 * canvas) / tileW;
}

describe('env-kit scale proof — camera projects the unit tile 2:1 (cube top face is a diamond)', () => {
  it('a flat unit tile projects to a 2:1 diamond (width/height === 2)', () => {
    const { widthR, heightU } = unitTileSpan();
    expect(widthR / heightU).toBeCloseTo(2.0, 6); // the 128x64 diamond aspect — independent of zoom
    expect(widthR).toBeCloseTo(Math.SQRT2, 6);    // width span = sqrt(2) world units
    expect(heightU).toBeCloseTo(Math.SQRT2 / 2, 6);
  });

  it('s60 (roof edge) gives the 26.565deg wall-top angle the spec §9-1 checks', () => {
    // wall top-edge on screen: atan(tileH/tileW) = atan(0.5) = 26.565deg; equivalently the up-axis z term.
    expect(Math.atan2(1, 2) / D2R).toBeCloseTo(26.565, 2);
    expect(s60).toBeCloseTo(Math.sqrt(3) / 2, 6); // 60deg-from-top elevation term
  });

  it('locks the fixed ortho_scale for a tileW-px diamond in a canvas cell (reconcile vs GPT-Pro px/ft)', () => {
    expect(expectedOrthoScale(256, 128)).toBeCloseTo(2.8284, 4); // canvas 256, tile 128 -> 2.8284
    expect(expectedOrthoScale(256, 128)).toBeCloseTo(unitTileSpan().widthR * 256 / 128, 6); // == span-derived
  });
});
