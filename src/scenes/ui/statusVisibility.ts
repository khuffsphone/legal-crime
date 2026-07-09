// STATUS UI — Phase 1: the NO-X-RAY FUNNEL. Every fog-sensitive read a screen body makes routes through
// THIS interface — the single seam that binds the Brassmere visibility registry (isRevealed / copMarkerVisible
// / pickVisibleUnit + IsoScene.visibleBusinessAt / visibleFrontId / isVisibleTile). Builders depend on the
// interface, not on IsoScene, so they stay pure + unit-testable; IsoScene provides the live implementation
// (binding this.fog, this.debugRevealAll, and its layout id→tile lookups). A hidden entity's method returns
// false and the builder emits an `unknown` row — the underlying rival/cop/unscouted record is never read.
//
// Pure — Phaser-free. Do NOT let a builder bypass this and read state.rivals[] / businesses[].owner /
// beatCops[].pos directly for a fog-sensitive field; that is an X-ray leak.

import type { GridPos, BeatCop } from '../../sim';

export interface StatusVisibility {
  /** THE base fog predicate: isRevealed(fog, gx, gy) OR revealAll-active (fog.ts:18 + debugRevealAll). */
  revealed(gx: number, gy: number): boolean;
  /** Tile form — the isVisibleTile equivalent (rounds + revealed). */
  tileVisible(pos: GridPos): boolean;
  /** A business/front is readable only when its tile is revealed — mirrors IsoScene.visibleBusinessAt /
   * visibleFrontId (returns the id only if revealed). Hidden ⇒ false ⇒ render "unknown", not the record. */
  businessVisible(bizId: string): boolean;
  /** A beat-cop marker is drawable — copMarkerVisible(fog, cop, revealAll). Never render an unrevealed cop. */
  copVisible(cop: BeatCop): boolean;
  /** A unit at pos is visible — the pickVisibleUnit / IsVisible predicate (for any non-player unit). */
  unitVisible(pos: GridPos): boolean;
  /** A district's detail is scouted: the player controls/holds it, OR a representative tile is revealed.
   * Uncontrolled + unrevealed ⇒ false ⇒ no omniscient read of rival share / wealth / rackets. */
  districtScouted(districtId: string): boolean;
}

/** Test double — everything visible (the ?reveal / debug board). Fog-sensitive fields render in full. */
export const fullyVisible: StatusVisibility = {
  revealed: () => true,
  tileVisible: () => true,
  businessVisible: () => true,
  copVisible: () => true,
  unitVisible: () => true,
  districtScouted: () => true,
};

/** Test double — nothing visible (a fresh, unscouted board). Every fog-sensitive field MUST mask to
 * `unknown`; a builder that still leaks a rival/cop/unscouted value under `sealed` has an X-ray bug. */
export const sealed: StatusVisibility = {
  revealed: () => false,
  tileVisible: () => false,
  businessVisible: () => false,
  copVisible: () => false,
  unitVisible: () => false,
  districtScouted: () => false,
};

/** Build a partial visibility for finer tests: only the named businesses / districts (and, optionally,
 * tiles / units / cops) are visible; everything else is fogged. */
export function visibilityOf(opts: {
  businesses?: readonly string[];
  districts?: readonly string[];
  tiles?: (pos: GridPos) => boolean;
  units?: (pos: GridPos) => boolean;
  cops?: (cop: BeatCop) => boolean;
}): StatusVisibility {
  const biz = new Set(opts.businesses ?? []);
  const dist = new Set(opts.districts ?? []);
  const tileFn = opts.tiles ?? (() => false);
  return {
    revealed: (gx, gy) => tileFn({ gx, gy }),
    tileVisible: (pos) => tileFn(pos),
    businessVisible: (id) => biz.has(id),
    copVisible: opts.cops ?? (() => false),
    unitVisible: opts.units ?? (() => false),
    districtScouted: (id) => dist.has(id),
  };
}
