// POLISH-PASS v2 · PACKAGE 4 — ISO OCCLUSION (pure math; Phaser-free). Units that slip BEHIND a taller
// building dim→hide; but a unit the player cares about (fighting / mid-shakedown / selected / hovered) keeps
// a faction-rimmed X-RAY silhouette so it stays findable. This module owns only the screen-space hull test
// + the display/rim decision; the renderer reads a unit's screen pos + the building hulls and applies it.
//
// CANON HELD: building height affects ONLY this occlusion hull + the silhouette + draw-depth — NEVER the
// unit's anchor / footprint / pathing / sim position (all untouched). NEVER x-ray a FOG-HIDDEN unit: the
// silhouette only preserves the read of an ALREADY-visible unit (a shrouded rival stays shrouded). Rims use
// faction colours (brass player / static rival #9E1B1B); a downed body is desaturated, never rival-red. The
// projector is fixed (no camera rotation), so a simple painter-depth + screen-AABB hull is enough.

/** A building's screen-space silhouette (derived from drawIsoBuilding's footprint + scaled height). */
export interface BuildingHull {
  /** Footprint centre x (screen px). */
  cx: number;
  /** Footprint base y — the bottom of the silhouette (screen px). */
  footY: number;
  /** Roof-top y — the top of the silhouette; taller building ⇒ smaller (higher) roofY (screen px). */
  roofY: number;
  /** Footprint half-width (screen px). */
  halfW: number;
  /** Painter-order depth = depthValue(gx,gy); a LARGER depth is NEARER the camera. */
  depth: number;
}

/** Whether a single building hull occludes a unit. Occluded ⇔ the building is NEARER (greater painter
 * depth) AND the unit's foot point falls inside the building's screen silhouette. Pure. */
export function occludedBy(unitScreenX: number, unitScreenY: number, unitDepth: number, hull: BuildingHull): boolean {
  if (hull.depth <= unitDepth) return false;                                   // behind/level → can't cover
  if (unitScreenX < hull.cx - hull.halfW || unitScreenX > hull.cx + hull.halfW) return false;
  if (unitScreenY < hull.roofY || unitScreenY > hull.footY) return false;
  return true;
}

/** Whether ANY building hull occludes the unit. Pure. */
export function isOccluded(unitScreenX: number, unitScreenY: number, unitDepth: number, hulls: readonly BuildingHull[]): boolean {
  for (const h of hulls) if (occludedBy(unitScreenX, unitScreenY, unitDepth, h)) return true;
  return false;
}

export interface UnitVisFlags {
  fighting: boolean;
  shakedown: boolean;
  selected: boolean;
  hovered: boolean;
}

/** A unit the player MUST keep sight of even behind a building: fighting OR a shakedown in progress OR
 * selected OR hovered. Such a unit gets the x-ray silhouette instead of hiding. Pure. */
export function criticalVisualState(f: UnitVisFlags): boolean {
  return f.fighting || f.shakedown || f.selected || f.hovered;
}

export type OcclusionDisplay = 'normal' | 'hidden' | 'xray';

/**
 * How an occluded unit should display. Not occluded → normal. Occluded + CRITICAL + REVEALED → the x-ray
 * silhouette (stay findable). Occluded otherwise → hidden. ⭐ A FOG-HIDDEN unit is NEVER x-rayed (a shrouded
 * rival stays shrouded) — the silhouette only preserves an already-visible unit's read. Pure.
 */
export function occlusionDisplay(occluded: boolean, critical: boolean, revealed: boolean): OcclusionDisplay {
  if (!occluded) return 'normal';
  if (critical && revealed) return 'xray';
  return 'hidden';
}

/** The ghost alpha for the dim→hide transition AND the faint x-ray body (a bright faction RIM is drawn on
 * top of it so the unit stays findable). The renderer eases the sprite toward the target alpha. */
export const OCCLUDED_DIM_ALPHA = 0.22;

/** The target sprite alpha for a display state — the renderer lerps toward it. `normal` full, `hidden`
 * fades out (dim→hide), `xray` keeps a faint ghost body under its bright faction rim. Pure. */
export function occlusionTargetAlpha(display: OcclusionDisplay): number {
  return display === 'normal' ? 1 : display === 'hidden' ? 0 : OCCLUDED_DIM_ALPHA;
}

/**
 * The X-RAY rim colour for a critical occluded unit. Faction colours preserve the read: brass-highlight for
 * the player, the STATIC rival identity #9E1B1B for a rival (never a motion danger-red). A DOWNED body is
 * desaturated — never rival-red. Pure.
 */
export function xRayRim(faction: 'player' | 'rival', downed: boolean): string {
  if (downed) return '#6B6358';                       // desaturated bone-grey, never rival-red
  return faction === 'player' ? '#E3C36A' : '#9E1B1B';
}
