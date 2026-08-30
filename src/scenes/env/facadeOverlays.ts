// Runtime state layer for the Phase-1 facade kit. The supplied PNGs remain the approved source art,
// but their 128×64 positive-slope plane cannot align to the smaller negative-slope live wall. These
// pure primitives reproduce the authored motifs through the existing wall projector instead.

import { projectToWall, type Pt, type WallFace } from './facadeSkew';

export type FacadeOverlayState = 'boarded' | 'wealth' | 'fortified';

export const FACADE_OVERLAY_ART_REFS: Readonly<Record<FacadeOverlayState, string>> = {
  boarded: '/assets/sprites/env/kit_overlay_damage_boarded.png',
  wealth: '/assets/sprites/env/kit_overlay_wealth_trim.png',
  fortified: '/assets/sprites/env/kit_overlay_fortified_bars.png',
};

export interface FacadeOverlayFacts {
  supportedHost: boolean;
  shutDown: boolean;
  playerFortified: boolean;
  /** Vice rung 3 is the authored growth-state-4 security treatment. */
  viceRung: number;
  districtWealth: number;
}

/** One treatment only: closure beats security, which beats prosperity. */
export function facadeOverlayStateFor(facts: FacadeOverlayFacts): FacadeOverlayState | null {
  if (!facts.supportedHost) return null;
  if (facts.shutDown) return 'boarded';
  if (facts.playerFortified || facts.viceRung >= 3) return 'fortified';
  if (facts.viceRung >= 1 || facts.districtWealth >= 4) return 'wealth';
  return null;
}

/** Prosperity/security detail stands down at strategy zoom; closure boards remain a critical state read. */
export function facadeOverlayVisible(state: FacadeOverlayState | null, revealed: boolean, zoom: number, enabled: boolean): boolean {
  return enabled && revealed && state !== null && (state === 'boarded' || zoom >= 0.45);
}

export interface FacadeOverlayRect {
  points: [Pt, Pt, Pt, Pt];
  color: number;
  alpha: number;
}

export interface FacadeOverlayStroke {
  from: Pt;
  to: Pt;
  width: number;
  color: number;
  alpha: number;
}

export interface FacadeOverlayPlan {
  rects: FacadeOverlayRect[];
  strokes: FacadeOverlayStroke[];
}

// Mirrors tools/blender/render_iso_kit.py. Scenery stays neutral—never faction brass/red/green.
const C = {
  brickDark: 0x4a3d33,
  stoneTrim: 0x9a8f80,
  glassDim: 0x332d26,
  signBoard: 0x8f8068,
  plank: 0x57493a,
  iron: 0x221e19,
  metal: 0x3d3a35,
  canvas: 0x5c5346,
  sandbag: 0x6e6353,
} as const;

const COMPOSED_LOW_TIER_HEIGHT = 288;

/** Blender authored x in 0..2 tiles and z in 0..288 px; wall uses frontage/roof fractions. */
export function projectOverlayPoint(wall: WallFace, xTiles: number, zPx: number): Pt {
  return projectToWall(wall, xTiles / 2, 1 - zPx / COMPOSED_LOW_TIER_HEIGHT);
}

function rect(wall: WallFace, x0: number, x1: number, z0: number, z1: number, color: number, alpha = 1): FacadeOverlayRect {
  return {
    points: [
      projectOverlayPoint(wall, x0, z1), projectOverlayPoint(wall, x1, z1),
      projectOverlayPoint(wall, x1, z0), projectOverlayPoint(wall, x0, z0),
    ],
    color,
    alpha,
  };
}

function stroke(wall: WallFace, x0: number, z0: number, x1: number, z1: number, width: number, color: number, alpha = 1): FacadeOverlayStroke {
  return {
    from: projectOverlayPoint(wall, x0, z0),
    to: projectOverlayPoint(wall, x1, z1),
    width,
    color,
    alpha,
  };
}

/** The source-art motifs, exaggerated only in stroke thickness so they survive the resting zoom. */
export function facadeOverlayPlan(state: FacadeOverlayState, wall: WallFace): FacadeOverlayPlan {
  if (state === 'boarded') {
    const strokes: FacadeOverlayStroke[] = [];
    for (const bay of [0, 1]) {
      strokes.push(stroke(wall, bay + 0.12, 24, bay + 0.88, 72, 4, C.plank));
      strokes.push(stroke(wall, bay + 0.12, 72, bay + 0.88, 24, 4, C.plank));
    }
    return {
      rects: [
        rect(wall, 0.10, 1.90, 22, 74, C.glassDim, 0.92),
        rect(wall, 1.45, 1.85, 101, 125, C.brickDark, 0.95),
      ],
      strokes,
    };
  }

  if (state === 'wealth') {
    return {
      rects: [
        rect(wall, 0.08, 1.92, 78, 94, C.signBoard, 0.92),
        rect(wall, 0, 2, 128, 132, C.stoneTrim),
        rect(wall, 0.06, 1.94, 68, 76, C.canvas, 0.95),
        rect(wall, 0.48, 0.52, 122, 130, C.stoneTrim),
        rect(wall, 1.48, 1.52, 122, 130, C.stoneTrim),
      ],
      strokes: [],
    };
  }

  const rects: FacadeOverlayRect[] = [];
  for (const bay of [0, 1]) {
    for (let i = 0; i < 5; i++) {
      const x = bay + 0.14 + i * 0.15;
      rects.push(rect(wall, x, x + 0.035, 22, 74, C.iron));
    }
  }
  rects.push(rect(wall, 0.22, 0.78, 0, 76, C.metal));
  for (let i = 0; i < 4; i++) {
    const x = 0.90 + i * 0.26;
    rects.push(rect(wall, x, x + 0.24, 0, 12, C.sandbag));
  }
  return { rects, strokes: [] };
}
