// INFO-FEEDBACK — MINIMAP math (pure; Phaser-free). World↔minimap projection, district-control colours
// (REUSING the existing SPEC palette — no new colour constants), the camera click-target, and ⚠ the
// FOG-OF-WAR rival exclusion (CANON RULING #5): a rival blip appears ONLY for a currently-visible/known
// rival — never an x-ray of fog-hidden rivals. The renderer draws what these return.

import { SPEC } from '../visualSpec';

export interface MiniRect { x: number; y: number; w: number; h: number; }

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** A world tile (gx,gy) → a point inside the minimap rect. Pure. */
export function worldToMinimap(gx: number, gy: number, rect: MiniRect, worldSize: number): { x: number; y: number } {
  const fx = worldSize > 0 ? clamp01(gx / worldSize) : 0;
  const fy = worldSize > 0 ? clamp01(gy / worldSize) : 0;
  return { x: rect.x + fx * rect.w, y: rect.y + fy * rect.h };
}

/** A minimap click (screen px) → the world tile to centre the camera on. Clamped into the world. Pure. */
export function minimapToWorld(px: number, py: number, rect: MiniRect, worldSize: number): { gx: number; gy: number } {
  const fx = rect.w > 0 ? clamp01((px - rect.x) / rect.w) : 0;
  const fy = rect.h > 0 ? clamp01((py - rect.y) / rect.h) : 0;
  return { gx: Math.round(fx * worldSize), gy: Math.round(fy * worldSize) };
}

/** Whether a minimap point is inside the minimap rect (so a stray click elsewhere is ignored). Pure. */
export function isInMinimap(px: number, py: number, rect: MiniRect): boolean {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

export type ControlStatus = 'player' | 'rival' | 'neutral' | 'contested';

/** District-control fill colour, REUSING the SPEC palette: player brass, rival STATIC #9E1B1B, neutral
 * soot-gray (fog), contested amber (windowLit). No new colour constants. Pure. */
export function districtControlColor(status: ControlStatus): string {
  switch (status) {
    case 'player': return SPEC.brass;     // #b8862b
    case 'rival': return SPEC.rival;       // #9e1b1b — static identity
    case 'contested': return SPEC.windowLit; // #e8c87a — amber
    case 'neutral':
    default: return SPEC.fog;              // soot-gray
  }
}

export interface MiniUnit {
  gx: number;
  gy: number;
  faction: 'player' | 'rival';
  /** collector blips render distinctly from muscle. */
  isCollector?: boolean;
}

/** Player blips — always shown (your own units are known). Pure. */
export function minimapPlayerBlips(units: readonly MiniUnit[]): MiniUnit[] {
  return units.filter((u) => u.faction === 'player');
}

/**
 * ⚠ CANON RULING #5 — rival blips for VISIBLE/KNOWN rivals ONLY. A rival whose tile is NOT currently revealed
 * is fog-hidden and MUST NOT appear (revealing it would be a fog-of-war x-ray). `isRevealed` is the scene's
 * fog predicate. Pure.
 */
export function minimapRivalBlips(units: readonly MiniUnit[], isRevealed: (gx: number, gy: number) => boolean): MiniUnit[] {
  return units.filter((u) => u.faction === 'rival' && isRevealed(Math.round(u.gx), Math.round(u.gy)));
}
