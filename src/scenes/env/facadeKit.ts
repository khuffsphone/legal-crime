// facadeKit.ts — Environment Modular Kit, Phase 1 (LOW-TIER slice). PURE, Phaser-free tile-calibrated
// facade math: the corrected canon pixel constants baked in as HARD targets, the low-tier piece set, and a
// deterministic composer that stacks pieces into a facade PLAN (exact pixel bands, 4px-snapped, no seams).
//
// RENDER-MODE DECISION (Task 1, see docs/env-kit/PHASE1_RENDER_MODE.md): buildings are drawn as PROCEDURAL
// ISO VOLUMES today (src/scenes/cityArt.ts drawIsoBuilding: two extruded walls + roof; drawFacade paints the
// lit wall). So the kit is TILE-CALIBRATED FIXED-SCALE PROCEDURAL VECTOR — NOT the character Blender atlas
// (8-dir/uniform-cell/animated/frame-to-fit is structurally wrong for static, variable-size buildings), and
// NOT frame-to-fit. This module is the reusable PLAN engine; a renderer paints the plan (flat elevation
// preview here; skew onto the iso lit-wall is Phase 2). Vertical px map 1:1 to the game's extrusion height;
// frontage maps to the wall's screen-diagonal run (see CONFLICT note at the bottom).

// ── tile projection (confirmed canon: src/sim/iso.ts) ─────────────────────────────────────────────
export const TILE_W = 128;
export const TILE_H = 64;
/** Screen-x run per tile of street FRONTAGE (gridToScreen: +1 tile ⇒ +64px x). A bay ≈ 1 tile. */
export const BAY_RUN_PX = TILE_W / 2; // 64

// ── corrected character/scale canon (source of truth = 56px thug, NOT the pre-correction 46–50) ────
export const FIGURE_PX = 56;      // standing character height (matches src/scenes/gait.ts FIGURE_PX)
export const PX_PER_FT = 9.3;     // corrected from the pre-correction 8 (56px ÷ ~6ft)
export const V_SNAP = 4;          // vertical snap grid (corrected from 8)

// ── corrected floor / opening / roofline pixel heights (all multiples of V_SNAP) ───────────────────
export const FLOOR_GROUND = 132;
export const FLOOR_UPPER = 116;
export const FLOOR_SERVICE = 76;
export const DOOR_RESIDENTIAL = 68;
export const DOOR_COMMERCIAL = 76;
export const STOREFRONT_BULKHEAD = 20;
export const STOREFRONT_GLASS = 56;
export const STOREFRONT_TRANSOM = 20;
export const CORNICE_DEFAULT = 28;
export const CORNICE_LARGE = 40;
export const PARAPET_DEFAULT = 40;
export const PARAPET_TALL = 56;
/** Fascia sign band. NOT in the corrected constant set — kept at the doc's un-corrected 20–32 band midpoint;
 * flagged for a future correction pass. The 36px HOST band (below) frames the 28px board with a 4px reveal. */
export const FASCIA_SIGN = 28;

/** The ground-floor storefront zone stacks to exactly FLOOR_GROUND: bulkhead + glass + transom + sign band. */
export const STOREFRONT_SIGN_BAND = FLOOR_GROUND - (STOREFRONT_BULKHEAD + STOREFRONT_GLASS + STOREFRONT_TRANSOM); // 36

// ── low-tier lot canon (doc §3.1) ──────────────────────────────────────────────────────────────────
export const LOW_TIER = {
  footprintTiles: [2, 3] as const, // 2 wide × 3 deep
  floors: [1, 2] as const,
  frontageTiles: [2, 3] as const,
  /** Building total height range with the DEFAULT CORNICE (doc: low 160–276px). */
  heightRangePx: [160, 276] as const,
} as const;

// ── piece set (the Phase-1 MVP: the 7 low-tier pieces) ─────────────────────────────────────────────
export type PieceRole =
  | 'brickUpper'        // 1 upper floor of brick + window rhythm
  | 'storefrontGlass'   // narrow glass storefront (ground floor)
  | 'storefrontBar'     // opaque / bar storefront (ground floor)
  | 'doorCommercial'
  | 'doorResidential'
  | 'parapet'           // plain parapet cap
  | 'fasciaSign';       // fascia sign board

/** Nominal height (px) of each MVP piece. Storefronts are a full ground floor; the door/sign are openings. */
export const PIECE_HEIGHT_PX: Readonly<Record<PieceRole, number>> = {
  brickUpper: FLOOR_UPPER,
  storefrontGlass: FLOOR_GROUND,
  storefrontBar: FLOOR_GROUND,
  doorCommercial: DOOR_COMMERCIAL,
  doorResidential: DOOR_RESIDENTIAL,
  parapet: PARAPET_DEFAULT,
  fasciaSign: FASCIA_SIGN,
};

// ── the facade PLAN (the tested output; renderer-agnostic) ─────────────────────────────────────────
/** A full-width horizontal band in the vertical stack (measured from the FOOT baseline, yTopPx downward on
 * screen — i.e. yTopPx=0 is the roofline top, yTopPx=heightPx is the ground). */
export interface FacadeBand {
  role: PieceRole | 'bulkhead' | 'glass' | 'transom' | 'signHost';
  /** top edge of the band, px from the roofline (0 = very top). */
  yTopPx: number;
  hPx: number;
  /** which storey this belongs to (0 = ground). */
  storey: number;
  label: string;
}

/** A positioned OPENING (door/window) — not part of the vertical sum; overlays a band at a bay column. */
export interface FacadeOpening {
  role: 'doorCommercial' | 'doorResidential' | 'window' | 'glass';
  bayIndex: number;
  wPx: number;
  hPx: number;
  /** left edge px from the facade's left. */
  xPx: number;
  /** bottom edge px from the roofline top (yBottomPx = heightPx ⇒ sits on the ground). */
  yBottomPx: number;
}

export interface FacadePlan {
  tier: 'low';
  floors: number;
  frontageTiles: number;
  storefront: 'glass' | 'bar';
  roof: 'parapet';
  widthPx: number;
  heightPx: number;
  bands: FacadeBand[];
  openings: FacadeOpening[];
}

export interface LowTierOptions {
  floors?: 1 | 2;
  frontageTiles?: 2 | 3;
  storefront?: 'glass' | 'bar';
  /** ground-floor entry door type; default commercial. */
  door?: 'commercial' | 'residential';
}

const snap = (n: number): number => Math.round(n / V_SNAP) * V_SNAP;

/**
 * Compose a LOW-TIER (2×3) building facade from the MVP pieces into a deterministic, tile-calibrated plan.
 * Stack (roof→ground): [parapet] → [brickUpper × (floors−1)] → [ground storefront: signHost / transom /
 * glass / bulkhead]. Widths are frontageTiles × BAY_RUN_PX. Pure & total; throws on out-of-tier input.
 */
export function composeLowTierFacade(opts: LowTierOptions = {}): FacadePlan {
  const floors = opts.floors ?? 2;
  const frontageTiles = opts.frontageTiles ?? 2;
  const storefront = opts.storefront ?? 'glass';
  const door = opts.door ?? 'commercial';
  if (floors !== 1 && floors !== 2) throw new Error(`low-tier floors must be 1 or 2 (got ${floors})`);
  if (frontageTiles !== 2 && frontageTiles !== 3) throw new Error(`low-tier frontage must be 2 or 3 tiles (got ${frontageTiles})`);

  const widthPx = frontageTiles * BAY_RUN_PX;
  const bays = frontageTiles;
  const bands: FacadeBand[] = [];
  const openings: FacadeOpening[] = [];

  // heights top→bottom: parapet, then (floors-1) upper floors, then the ground storefront.
  const upperFloors = floors - 1;
  const heightPx = PARAPET_DEFAULT + upperFloors * FLOOR_UPPER + FLOOR_GROUND;

  let y = 0; // px from roofline top
  // 1) parapet cap (roof termination)
  bands.push({ role: 'parapet', yTopPx: y, hPx: PARAPET_DEFAULT, storey: floors, label: 'plain parapet cap' });
  y += PARAPET_DEFAULT;

  // 2) upper brick floors (top storey first)
  for (let u = 0; u < upperFloors; u++) {
    const storey = floors - 1 - u;
    bands.push({ role: 'brickUpper', yTopPx: y, hPx: FLOOR_UPPER, storey, label: `brick upper facade (storey ${storey})` });
    // window rhythm: one double-hung window per bay, centred in the floor
    const winW = 20, winH = 40;
    const bandTop = y;
    for (let b = 0; b < bays; b++) {
      openings.push({
        role: 'window', bayIndex: b, wPx: winW, hPx: winH,
        xPx: Math.round((b + 0.5) * BAY_RUN_PX - winW / 2),
        yBottomPx: bandTop + Math.round((FLOOR_UPPER + winH) / 2),
      });
    }
    y += FLOOR_UPPER;
  }

  // 3) ground storefront (sign band / transom / display / bulkhead), summing to FLOOR_GROUND
  bands.push({ role: 'signHost', yTopPx: y, hPx: STOREFRONT_SIGN_BAND, storey: 0, label: 'fascia sign band' });
  // the fascia sign board (28) centred in the 36 host band
  openings.push({
    role: 'window', bayIndex: -1, wPx: widthPx - 8, hPx: FASCIA_SIGN,
    xPx: 4, yBottomPx: y + Math.round((STOREFRONT_SIGN_BAND + FASCIA_SIGN) / 2),
  });
  y += STOREFRONT_SIGN_BAND;

  bands.push({ role: 'transom', yTopPx: y, hPx: STOREFRONT_TRANSOM, storey: 0, label: 'transom band' });
  y += STOREFRONT_TRANSOM;

  const glassRole: FacadeBand['role'] = storefront === 'glass' ? 'glass' : 'storefrontBar';
  bands.push({ role: glassRole, yTopPx: y, hPx: STOREFRONT_GLASS, storey: 0, label: storefront === 'glass' ? 'display glass' : 'opaque/bar front' });
  // glass panes per bay (glass front only)
  if (storefront === 'glass') {
    for (let b = 0; b < bays; b++) {
      openings.push({ role: 'glass', bayIndex: b, wPx: BAY_RUN_PX - 12, hPx: STOREFRONT_GLASS - 6, xPx: b * BAY_RUN_PX + 6, yBottomPx: y + STOREFRONT_GLASS - 3 });
    }
  }
  y += STOREFRONT_GLASS;

  bands.push({ role: 'brickUpper', yTopPx: y, hPx: STOREFRONT_BULKHEAD, storey: 0, label: 'bulkhead' });
  // relabel the bulkhead cleanly
  bands[bands.length - 1] = { role: 'brickUpper', yTopPx: y, hPx: STOREFRONT_BULKHEAD, storey: 0, label: 'storefront bulkhead' };
  y += STOREFRONT_BULKHEAD;

  // 4) entry door — leftmost bay, standing on the ground, rising from the bulkhead through the display
  const doorRole = door === 'commercial' ? 'doorCommercial' : 'doorResidential';
  const doorH = door === 'commercial' ? DOOR_COMMERCIAL : DOOR_RESIDENTIAL;
  const doorW = snap(BAY_RUN_PX * 0.55);
  openings.push({ role: doorRole, bayIndex: 0, wPx: doorW, hPx: doorH, xPx: Math.round(BAY_RUN_PX / 2 - doorW / 2), yBottomPx: heightPx });

  return { tier: 'low', floors, frontageTiles, storefront, roof: 'parapet', widthPx, heightPx, bands, openings };
}

/** Does a standing character of `figurePx` clear a door of `role`? (doc §9.3 readability check.) */
export function doorClears(role: 'doorCommercial' | 'doorResidential', figurePx: number = FIGURE_PX): boolean {
  return (role === 'doorCommercial' ? DOOR_COMMERCIAL : DOOR_RESIDENTIAL) >= figurePx;
}
