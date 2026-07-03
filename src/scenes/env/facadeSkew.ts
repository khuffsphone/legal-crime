// facadeSkew.ts — Environment Modular Kit, Phase 2 (PURE, Phaser-free). Skew a flat FacadePlan (a straight-on
// elevation, measured px) onto the iso building's LIT wall parallelogram so it becomes the actual on-screen
// storefront. The character-render pipeline is ground truth (2:1 dimetric, 128×64 tile); this maps the plan's
// proportions onto the wall face the game already extrudes.
//
// CONFLICT (a) RESOLVED here: drawIsoBuilding draws the footprint INSET to hw=54 (a 108px diamond), NOT the
// nominal 128. This module maps onto the REAL wall run (hw, hh from the drawn footprint) + the drawn height h,
// so walls never float off their bases regardless of the nominal tile width.
// CONFLICT (b) IS this module: composeLowTierFacade() is a FLAT plan; projectToWall skews it onto the screen
// diagonal (the lit wall's bottom edge runs +hw,−hh per the frontage; the wall rises straight up by h).

import type { FacadePlan } from './facadeKit';

export interface Pt { x: number; y: number; }

/** The lit (front-right) wall face of an iso building drawn by drawIsoBuilding: bottom edge runs from
 * bBottom=(cx, cy+hh) to bRight=(cx+hw, cy); the wall rises straight up (screen −y) by `h`. */
export interface WallFace { cx: number; cy: number; hw: number; hh: number; h: number; }

/**
 * Map a facade fraction to a screen point on the lit wall.
 * `fx` 0..1 = left→right along the frontage (bBottom→bRight). `fyTop` 0..1 = roofline top→ground (matches the
 * plan's yTopPx/heightPx, where 0 is the very top and heightPx is the ground). Pure.
 */
export function projectToWall(w: WallFace, fx: number, fyTop: number): Pt {
  const baseX = w.cx + fx * w.hw;          // along the bottom edge bBottom→bRight
  const baseY = (w.cy + w.hh) - fx * w.hh; // …which drops by hh across the frontage (the iso skew)
  return { x: baseX, y: baseY - w.h * (1 - fyTop) }; // ground (fyTop=1) sits on the edge; roof (0) is −h up
}

export interface BandQuad { role: string; label: string; storey: number; pts: [Pt, Pt, Pt, Pt]; }

/** Every horizontal facade band as a screen quad on the lit wall (top-left, top-right, bottom-right, bottom-left). */
export function skewBands(plan: FacadePlan, w: WallFace): BandQuad[] {
  const H = Math.max(1e-6, plan.heightPx);
  return plan.bands.map((b) => {
    const t0 = b.yTopPx / H;
    const t1 = (b.yTopPx + b.hPx) / H;
    return {
      role: b.role, label: b.label, storey: b.storey,
      pts: [projectToWall(w, 0, t0), projectToWall(w, 1, t0), projectToWall(w, 1, t1), projectToWall(w, 0, t1)],
    };
  });
}

export interface OpeningQuad { role: string; bayIndex: number; pts: [Pt, Pt, Pt, Pt]; }

/** Every opening (window / glass pane / door / sign board) as a screen quad on the lit wall. */
export function skewOpenings(plan: FacadePlan, w: WallFace): OpeningQuad[] {
  const H = Math.max(1e-6, plan.heightPx);
  const W = Math.max(1e-6, plan.widthPx);
  return plan.openings.map((o) => {
    const fx0 = o.xPx / W;
    const fx1 = (o.xPx + o.wPx) / W;
    const tBot = o.yBottomPx / H;
    const tTop = (o.yBottomPx - o.hPx) / H;
    return {
      role: o.role, bayIndex: o.bayIndex,
      pts: [projectToWall(w, fx0, tTop), projectToWall(w, fx1, tTop), projectToWall(w, fx1, tBot), projectToWall(w, fx0, tBot)],
    };
  });
}
