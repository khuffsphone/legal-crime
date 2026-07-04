// Citizen Life P0 (T7) — the PURE LOD / cap-enforcement helpers. Phaser-free. Citizens ARE the upgraded ped
// side of AmbientLife (spec §4.1): the active citizen cap EQUALS caps.peds, and the same FAR/MID/CLOSE zoom
// behaviour, cull margin, and ≤3/frame top-up apply. These constants MIRROR ambientLife.ts (FAR_ZOOM 0.45,
// MID_ZOOM 0.8, CULL_MARGIN 160, OFFSCREEN_RETIRE 2) so the citizen layer never diverges from the ped layer
// it lives inside. Owning them here makes the cap/LOD rules mutation-testable (spec T7).

import type { Liveliness } from '../../sim';

/** Zoom thresholds — identical to AmbientLife's FAR_ZOOM / MID_ZOOM (recon §5). */
export const FAR_ZOOM = 0.45;
export const MID_ZOOM = 0.8;
/** Viewport cull margin (world px) and offscreen-retire seconds — identical to AmbientLife (spec §4.3). */
export const CULL_MARGIN = 160;
export const OFFSCREEN_RETIRE = 2.0;
/** Hard per-frame top-up ceiling (spec §4.3). */
export const TOP_UP_MAX = 3;

export type ZoomBand = 'far' | 'mid' | 'close';

/** The LOD band for a camera zoom (spec §4.2). FAR < 0.45 ≤ MID < 0.8 ≤ CLOSE. Pure. */
export function zoomBand(zoom: number): ZoomBand {
  if (zoom < FAR_ZOOM) return 'far';
  if (zoom < MID_ZOOM) return 'mid';
  return 'close';
}

/** The active citizen cap for a base cap (= caps.peds) at a zoom (spec §4.1/§4.2): FAR = 0 (all culled),
 * MID = half (floored), CLOSE = full. Pure. The FAR=0 rule is load-bearing — the T7 mutation test flips it. */
export function citizenCapForZoom(baseCap: number, zoom: number): number {
  const band = zoomBand(zoom);
  if (band === 'far') return 0;
  if (band === 'mid') return baseCap >> 1;
  return baseCap;
}

/** Per-frame top-up budget (spec §4.3): 1/frame while the deficit is small (≤6) and the camera is steady;
 * up to TOP_UP_MAX after a camera jump or a large deficit. Never exceeds TOP_UP_MAX. Pure. */
export function topUpBudget(deficit: number, cameraJumped = false): number {
  if (deficit <= 0) return 0;
  if (deficit <= 6 && !cameraJumped) return 1;
  return deficit < TOP_UP_MAX ? deficit : TOP_UP_MAX;
}

/** Per-district visible SOFT caps (spec §4.4) — stop one district consuming the whole global cap when the
 * camera straddles a boundary. Indexed by liveliness × zoom band. FAR is always 0. */
export const PER_DISTRICT_VISIBLE_CAP: Record<Liveliness, Record<ZoomBand, number>> = {
  low: { close: 5, mid: 2, far: 0 },
  med: { close: 8, mid: 4, far: 0 },
  high: { close: 12, mid: 6, far: 0 },
};

/** The soft per-district visible cap for a liveliness + zoom (spec §4.4). Pure. */
export function perDistrictVisibleCap(liveliness: Liveliness, zoom: number): number {
  return PER_DISTRICT_VISIBLE_CAP[liveliness][zoomBand(zoom)];
}

/** The soft cap may stretch up to +25% when only ONE district is visible, to avoid an empty screen — but the
 * GLOBAL cap always wins (spec §4.4). Returns the effective per-district ceiling. Pure. */
export function softDistrictCeiling(baseSoftCap: number, onlyDistrictVisible: boolean): number {
  return onlyDistrictVisible ? Math.ceil(baseSoftCap * 1.25) : baseSoftCap;
}
