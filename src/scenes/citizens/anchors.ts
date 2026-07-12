// anchors.ts — Citizen Layer DELTA (2026-07-09 spec refresh): REAL PROP ANCHORS + zone discipline +
// prop-overlap rules. Pure, Phaser-free (the ./citizens discipline). This module answers three questions
// for AmbientLife:
//   1. WHICH placed props exist, as citizen-facing anchors? (delta 2 — derived from the scene's ACTUAL
//      prop placements; today that is the legacy scatterProps 7-kind set via LEGACY_PROP_FAMILY below;
//      when streetscape T4 placement merges, its StreetscapePlacement rows feed the same CitizenAnchor
//      shape — familyId/gx/gy — with no change here.)
//   2. WHERE may a citizen STAND? (delta 6 — never directly on a filler prop anchor; queue/loiter spots
//      favor diagonally adjacent positions; the prop wins any 56px competition — the citizen's offset
//      moves or the pause/spawn is skipped.)
//   3. WHAT sub-tile band does a paused citizen occupy? (delta 1 — walking stays in the sidewalk_through
//      centre; loiter/windowShop/queue shift into the furniture-band / frontage side, so prop-heavy
//      bands read as loiter space, never through-path.)
//
// VOCABULARY: anchor family ids are the merged PR#62 PropFamilyId strings (streetscapeTaxonomy). Typed as
// string here (not the PropFamilyId union) so this module never imports env/ modules — the citizen layer
// reads placements, it does not depend on the streetscape data spine (keeps the lane file-disjoint).

import type { PropKind, PropPlacement } from '../../sim';
import type { CitizenRole } from './roles';
import type { PauseContext } from './states';

/** One placed prop, as the citizen layer sees it. Matches StreetscapePlacement's (familyId,gx,gy) subset. */
export interface CitizenAnchor {
  family: string;
  gx: number;
  gy: number;
}

/** Legacy scatterProps kind → PR#62 family id (the citizen twin of the audio lane's R1 adapter — but
 * PHYSICAL: hydrant/mailbox map to their families here because citizens must not stand on them, even
 * though they are inaudible). fence has no #62 family → dropped (null). */
export const LEGACY_PROP_FAMILY: Readonly<Record<PropKind, string | null>> = {
  lamppost: 'street_lamp',
  tree: 'street_tree',
  hydrant: 'fire_hydrant',
  mailbox: 'mailbox',
  bench: 'bench',
  car: 'parked_car',
  fence: null,
};

/** Project the legacy scatter into citizen anchors (drops kinds with no family). Pure. */
export function anchorsFromLegacyProps(props: readonly PropPlacement[]): CitizenAnchor[] {
  const out: CitizenAnchor[] = [];
  for (const p of props) {
    const family = LEGACY_PROP_FAMILY[p.kind];
    if (family) out.push({ family, gx: p.gx, gy: p.gy });
  }
  return out;
}

// ── delta 2: anchor USES per spec §3 ───────────────────────────────────────────────────────────────
/** A street-vendor ACTOR requires one of these placed props — no free-floating vendor pretending to be a
 * cart. NOTE: neither family is derivable from the legacy 7-kind scatter, so until streetscape T4
 * placement merges, ZERO vendor actors spawn — that is the delta working, not a bug. */
export const VENDOR_ANCHOR_FAMILIES: ReadonlySet<string> = new Set(['vendor_cart', 'produce_stall']);

/** Families whose presence makes an adjacent tile a QUEUE context (spec §3: gather points). */
export const QUEUE_ANCHOR_FAMILIES: ReadonlySet<string> = new Set(['vendor_cart', 'produce_stall', 'news_stand']);

/** Families citizens LOITER beside (sit / lean / linger — spec §3). crate_stack is deliberately in BOTH
 * this set and AVOID_STAND_FAMILIES: you loiter NEXT TO a crate stack (diagonal), never ON it (delta 6). */
export const LOITER_ANCHOR_FAMILIES: ReadonlySet<string> = new Set([
  'bench', 'fountain', 'street_lamp', 'parked_car', 'crate_stack',
]);

/** delta 6 — the filler anchors a citizen must never STAND directly on (the prop wins the tile). */
export const AVOID_STAND_FAMILIES: ReadonlySet<string> = new Set([
  'fire_hydrant', 'mailbox', 'trash_can', 'bollard', 'crate_stack',
  'barrel_drum', 'pallet_stack', 'manhole_cover', 'sewer_grate', 'puddle_stain',
]);

// ── the tile index (O(1) lookups in the AmbientLife hot path) ──────────────────────────────────────
export type AnchorIndex = ReadonlyMap<string, CitizenAnchor>;

const key = (gx: number, gy: number): string => `${gx},${gy}`;

/** Index anchors by tile. Last write wins on a shared tile (placement already enforces ≤1 solid/tile). */
export function buildAnchorIndex(anchors: readonly CitizenAnchor[]): AnchorIndex {
  const m = new Map<string, CitizenAnchor>();
  for (const a of anchors) m.set(key(Math.round(a.gx), Math.round(a.gy)), a);
  return m;
}

/** The anchor occupying a tile, if any. Pure. */
export function anchorAt(index: AnchorIndex, gx: number, gy: number): CitizenAnchor | undefined {
  return index.get(key(gx, gy));
}

/** Whether any index entry satisfies a family predicate within the 8-neighbourhood + centre of (gx,gy). */
function nearAnchor(index: AnchorIndex, gx: number, gy: number, families: ReadonlySet<string>): CitizenAnchor | undefined {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const a = index.get(key(gx + dx, gy + dy));
      if (a && families.has(a.family)) return a;
    }
  }
  return undefined;
}

/** A queue/gather anchor adjacent to (gx,gy) — flips the pause context to 'anchor' (delta 2). Pure. */
export function nearQueueAnchor(index: AnchorIndex, gx: number, gy: number): CitizenAnchor | undefined {
  return nearAnchor(index, gx, gy, QUEUE_ANCHOR_FAMILIES);
}

/** A loiter anchor adjacent to (gx,gy) (spec §3 sit/lean/linger). Pure. */
export function nearLoiterAnchor(index: AnchorIndex, gx: number, gy: number): CitizenAnchor | undefined {
  return nearAnchor(index, gx, gy, LOITER_ANCHOR_FAMILIES);
}

/** delta 6 — is STANDING at (gx,gy) blocked by a filler prop anchor on that exact tile? Pure. */
export function isStandBlocked(index: AnchorIndex, gx: number, gy: number): boolean {
  const a = index.get(key(gx, gy));
  return !!a && AVOID_STAND_FAMILIES.has(a.family);
}

// ── delta 2: the vendor spawn gate ─────────────────────────────────────────────────────────────────
/** The deterministic fallback when a vendor rolls with no cart to stand at. */
export const VENDOR_FALLBACK_ROLE: CitizenRole = 'worker';

/**
 * delta 2 — resolve a rolled role against the REAL anchors at the spawn tile: 'streetVendor' requires a
 * vendor_cart/produce_stall in the spawn tile's 8-neighbourhood (the vendor works AT the cart); with no
 * such prop the roll demotes to VENDOR_FALLBACK_ROLE. Every other role passes through. Pure & total.
 */
export function resolveSpawnRole(role: CitizenRole, index: AnchorIndex, gx: number, gy: number): CitizenRole {
  if (role !== 'streetVendor') return role;
  return nearAnchor(index, gx, gy, VENDOR_ANCHOR_FAMILIES) ? 'streetVendor' : VENDOR_FALLBACK_ROLE;
}

// ── delta 1: sub-tile band offsets (screen px) ─────────────────────────────────────────────────────
// Walking citizens render at the tile centre — the sidewalk_through read. A PAUSED citizen shifts into
// the band its context implies: frontage → building side, generic/apron → furniture-band curb side,
// plaza → edge-biased. Candidate lists (not single points) so neighbours don't stack; picked by a
// deterministic roll. Magnitudes stay small (≤16px against the 46px marker) — a read, not a teleport.
export const WALK_RENDER_OFFSET: Readonly<{ dx: number; dy: number }> = { dx: 0, dy: 0 };

const BAND_OFFSETS: Readonly<Record<PauseContext, ReadonlyArray<{ dx: number; dy: number }>>> = {
  generic: [{ dx: -10, dy: 5 }, { dx: 10, dy: 5 }, { dx: 0, dy: 8 }],
  frontage: [{ dx: -8, dy: -6 }, { dx: 8, dy: -6 }, { dx: 0, dy: -9 }],
  anchor: [{ dx: -12, dy: 6 }, { dx: 12, dy: 6 }],       // beside the stand — resolveStandSpot may override
  plaza: [{ dx: -14, dy: 6 }, { dx: 14, dy: 6 }, { dx: -10, dy: -8 }, { dx: 10, dy: -8 }],
  apron: [{ dx: -10, dy: 4 }, { dx: 10, dy: 4 }],
};

/** delta 1 — the band offset for a paused citizen in a context, picked deterministically by roll. Pure. */
export function bandOffsetPx(ctx: PauseContext, roll01: number): { dx: number; dy: number } {
  const c = BAND_OFFSETS[ctx];
  const t = roll01 < 0 ? 0 : roll01 >= 1 ? 0.999999 : roll01;
  const pick = c[(t * c.length) | 0];
  return { dx: pick.dx, dy: pick.dy };
}

// ── delta 6: the stand-spot resolver (diagonal-favoring) ───────────────────────────────────────────
// The four diagonal neighbours as HALF-tile screen offsets (2:1 dimetric: tile (dx,dy) → screen
// ((dx−dy)·64, (dx+dy)·32); half of it keeps the citizen visually beside the prop, on its own corner).
const DIAG_TILE: ReadonlyArray<readonly [number, number]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const DIAG_OFFSET_PX: ReadonlyArray<{ dx: number; dy: number }> = DIAG_TILE.map(([dx, dy]) => ({
  dx: ((dx - dy) * 64) / 2,
  dy: ((dx + dy) * 32) / 2,
}));

/**
 * delta 6 — where may a citizen actually stand for a pause rolled at (gx,gy)?
 *  • tile free of filler anchors → the context band offset (delta 1).
 *  • tile blocked → try the four DIAGONAL neighbours (roll-rotated, deterministic); the first whose tile
 *    carries no blocking anchor wins, rendered as a half-tile offset toward it.
 *  • everything blocked → null: the pause is SKIPPED (the prop wins — "moves or doesn't spawn").
 * Pure & total.
 */
export function resolveStandSpot(
  index: AnchorIndex, gx: number, gy: number, ctx: PauseContext, roll01: number,
): { dx: number; dy: number } | null {
  if (!isStandBlocked(index, gx, gy)) return bandOffsetPx(ctx, roll01);
  const t = roll01 < 0 ? 0 : roll01 >= 1 ? 0.999999 : roll01;
  const start = (t * DIAG_TILE.length) | 0;
  for (let i = 0; i < DIAG_TILE.length; i++) {
    const d = (start + i) % DIAG_TILE.length;
    const [tdx, tdy] = DIAG_TILE[d];
    if (!isStandBlocked(index, gx + tdx, gy + tdy)) return DIAG_OFFSET_PX[d];
  }
  return null;
}
