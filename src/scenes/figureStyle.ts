// PROCEDURAL FIGURE STYLE (BRASSMERE figure guide, 2026-06-28) — the PURE (Phaser-free) model behind the
// upgraded iconic noir figures. Owns the testable DECISIONS the guide specifies: per-archetype silhouette +
// height config, the noir cel palette, line-width clamps, and figurePlan() — the render-state plan a figure
// resolves to (including the NO-X-RAY "hidden rival → draw NOTHING" rule and the faction-on-plate-not-body
// rule). The Phaser renderer (figureDraw2.ts) consumes a plan; this file is what the tests assert against.
//
// CANON: figure body is NEVER recoloured to rival-red or danger; faction identity lives on the base PLATE.
// Heights clamp 48..72 by archetype. Vector-only (no raster). Grounded values are from the brain palette;
// the exact ratios/line widths/tone steps are the guide's code-ready seeds (tunable, not canon).

export type FigureArchetype = 'thug' | 'gunner' | 'collector' | 'boss' | 'civilian' | 'police' | 'rival';
export type FigureFaction = 'player' | 'rival' | 'neutral';

// ── palette ──────────────────────────────────────────────────────────────────────────────────────
/** Noir figure-body values (all in the soot/sepia range — never a faction or danger colour). */
export const FIG2_BODY = {
  ink: 0x14110f,        // outer outline
  occlusion: 0x16130f,  // deepest contact occlusion
  coatShadow: 0x26211c, // charcoal coat shadow
  clothDark: 0x3a3027,  // dark cloth mid
  clothMid: 0x5b5145,   // warm cloth mid
  litSepia: 0x8f8068,   // NW-lit plane
  bone: 0xe8e2d4,       // tiny shirt/hand highlight only
  warmRim: 0xe8c87a,    // optional low-alpha rim (NOT identity)
} as const;

/** The noir cel tones the body fills with — there is no faction/danger colour in this set (tested). */
export const BODY_TONES: readonly number[] = [
  FIG2_BODY.occlusion, FIG2_BODY.coatShadow, FIG2_BODY.clothDark, FIG2_BODY.clothMid, FIG2_BODY.litSepia,
];

/** Downed body tones — desaturated near-neutral greys; never rival-red, never a saturated identity accent. */
export const DOWNED_TONES: readonly number[] = [0x1b1916, 0x2a2723, 0x39352f, 0x47423b];

/** Faction/state PLATE colours (the ONLY place faction reads). Body never uses these as fill. */
export const PLATE = { player: 0xb8862b, playerHi: 0xe3c36a, rival: 0x9e1b1b, downed: 0x4a443c } as const;

/** Danger colours — MOTION/VFX only, never part of an idle figure or its plate identity (tested absent). */
export const DANGER = { core: 0xe11d1d, muzzle: 0xff5a2c } as const;

// ── line widths (clamped to guide ranges) ─────────────────────────────────────────────────────────
export const OUTER_OUTLINE_PX = 2;
export const OUTER_OUTLINE_RANGE: readonly [number, number] = [1.5, 3];
export const INNER_LINE_PX = 1;
export const INNER_LINE_RANGE: readonly [number, number] = [0.75, 1.25];

// ── grounding seeds ────────────────────────────────────────────────────────────────────────────────
export const CONTACT_SHADOW = { wPx: 34, hPx: 10, wRange: [28, 44] as const, hRange: [8, 14] as const, fill: FIG2_BODY.ink, alphaRange: [0.22, 0.35] as const };
export const BASE_PLATE = { wPx: 44, hPx: 16, strokePx: 2, fillAlpha: 0.12, strokeAlpha: 0.9 };

/** The hard global figure-height clamp, regardless of archetype. */
export const GLOBAL_HEIGHT_CLAMP: readonly [number, number] = [48, 72];

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

// ── per-archetype silhouette config ─────────────────────────────────────────────────────────────────
export interface ArchetypeStyle {
  heightSeed: number;
  heightRange: readonly [number, number];
  /** widths as a fraction of figure height H (the guide's width ratios). */
  shoulderHWRatio: number;
  hatBrimHWRatio: number;
  coatHemHWRatio: number;
  stanceHWRatio: number;
  prop: 'fistsOrBat' | 'tommy' | 'satchel' | 'cane' | 'baton' | 'none';
  /** whether this archetype carries a faction base plate (civilians do not). */
  hasPlate: boolean;
}

/** The seven archetype silhouettes (thug/gunner/collector/boss/civilian/police/rival). Distinction is hat,
 * shoulder mass, coat hem, stance, prop — same anchor + scale system. Police/civilian are style-ready
 * entries (may not be live unit kinds yet); rival shares the body and reads via its red PLATE only. */
export const ARCHETYPES: Record<FigureArchetype, ArchetypeStyle> = {
  thug: { heightSeed: 58, heightRange: [56, 64], shoulderHWRatio: 0.24, hatBrimHWRatio: 0.30, coatHemHWRatio: 0.27, stanceHWRatio: 0.17, prop: 'fistsOrBat', hasPlate: true },
  gunner: { heightSeed: 60, heightRange: [56, 64], shoulderHWRatio: 0.25, hatBrimHWRatio: 0.29, coatHemHWRatio: 0.27, stanceHWRatio: 0.17, prop: 'tommy', hasPlate: true },
  collector: { heightSeed: 53, heightRange: [48, 56], shoulderHWRatio: 0.20, hatBrimHWRatio: 0.24, coatHemHWRatio: 0.22, stanceHWRatio: 0.15, prop: 'satchel', hasPlate: true },
  boss: { heightSeed: 64, heightRange: [60, 72], shoulderHWRatio: 0.26, hatBrimHWRatio: 0.32, coatHemHWRatio: 0.30, stanceHWRatio: 0.17, prop: 'cane', hasPlate: true },
  civilian: { heightSeed: 51, heightRange: [48, 56], shoulderHWRatio: 0.18, hatBrimHWRatio: 0.20, coatHemHWRatio: 0.20, stanceHWRatio: 0.14, prop: 'none', hasPlate: false },
  police: { heightSeed: 58, heightRange: [56, 62], shoulderHWRatio: 0.24, hatBrimHWRatio: 0.26, coatHemHWRatio: 0.26, stanceHWRatio: 0.16, prop: 'baton', hasPlate: true },
  rival: { heightSeed: 58, heightRange: [56, 64], shoulderHWRatio: 0.24, hatBrimHWRatio: 0.30, coatHemHWRatio: 0.27, stanceHWRatio: 0.17, prop: 'fistsOrBat', hasPlate: true },
};

/** The canonical figure height for an archetype, clamped to its range then the hard 48..72 global clamp. */
export function figureHeightFor(archetype: FigureArchetype, override?: number): number {
  const a = ARCHETYPES[archetype];
  const base = override ?? a.heightSeed;
  const inArchetype = clamp(base, a.heightRange[0], a.heightRange[1]);
  return clamp(inArchetype, GLOBAL_HEIGHT_CLAMP[0], GLOBAL_HEIGHT_CLAMP[1]);
}

/** Clamp a line width to the guide's outer/inner range — the renderer must never stroke outside these. */
export function clampLineWidth(px: number, kind: 'outer' | 'inner'): number {
  const r = kind === 'outer' ? OUTER_OUTLINE_RANGE : INNER_LINE_RANGE;
  return clamp(px, r[0], r[1]);
}

// ── ?figscale — the DEV A/B render knob (separate from the archetype height clamp) ──────────────────
/** The renderer's native drawn height (pose space); ?figscale scales the whole figure around this. */
export const FIG2_REFERENCE_PX = 56;
/** ?figscale is K's eyeball knob — it may exceed the 48..72 canon clamp (the guide asks to test ~80). */
export const FIGSCALE_RANGE: readonly [number, number] = [40, 96];

/** Parse `?figscale=N` to a render height (clamped to the dev range); default = the thug seed (58). Pure. */
export function parseFigScale(search: string): number {
  const m = /[?&]figscale=([0-9]+(?:\.[0-9]+)?)/i.exec(search || '');
  const seed = ARCHETYPES.thug.heightSeed;
  if (!m) return seed;
  const v = Number(m[1]);
  return Number.isFinite(v) ? clamp(v, FIGSCALE_RANGE[0], FIGSCALE_RANGE[1]) : seed;
}

// ── the render-state plan ────────────────────────────────────────────────────────────────────────
export interface FigurePlan {
  /** false ⇒ render NOTHING (a hidden, un-revealed rival — NO-X-RAY). */
  draw: boolean;
  /** vector-only invariant — the renderer never uses a raster texture. */
  raster: false;
  archetype: FigureArchetype;
  height: number;
  /** the noir cel tones the body fills with (downed ⇒ desaturated greys). */
  bodyTones: readonly number[];
  outline: number;
  /** the hatband colour — NOIR, never faction (faction is the plate). */
  hatband: number;
  /** faction/state plate colour, or null (civilian / no plate / not drawn). */
  plate: number | null;
  downed: boolean;
  lineWidths: { outer: number; inner: number };
  /** ground-up draw order: shadow BELOW plate BELOW body (never inverted). */
  depthOrder: { shadow: number; plate: number; body: number };
  /** figures live in the WORLD camera — never the fixed HUD camera, never scrollFactor 0. */
  hudCamera: false;
}

export interface FigurePlanOpts {
  archetype: FigureArchetype;
  faction: FigureFaction;
  /** the existing fog/reveal predicate result for this unit's tile. */
  revealed: boolean;
  downed?: boolean;
  heightOverride?: number;
}

const NO_DRAW: Omit<FigurePlan, 'archetype'> = {
  draw: false, raster: false, height: 0, bodyTones: [], outline: FIG2_BODY.ink,
  hatband: FIG2_BODY.coatShadow, plate: null, downed: false,
  lineWidths: { outer: OUTER_OUTLINE_PX, inner: INNER_LINE_PX },
  depthOrder: { shadow: -2, plate: -1, body: 0 }, hudCamera: false,
};

/**
 * Resolve a figure's render-state plan. NO-X-RAY: a rival on an un-revealed tile draws NOTHING (no body,
 * plate, shadow, or hover). Otherwise the body uses noir cel tones only (desaturated when downed), the
 * hatband stays noir, and FACTION reads solely from the plate (player brass / rival red / downed grey;
 * civilian has none). Danger colours never appear. Pure.
 */
export function figurePlan(opts: FigurePlanOpts): FigurePlan {
  if (opts.faction === 'rival' && !opts.revealed) return { ...NO_DRAW, archetype: opts.archetype };
  const a = ARCHETYPES[opts.archetype];
  const downed = !!opts.downed;
  const plate = !a.hasPlate ? null
    : downed ? PLATE.downed
      : opts.faction === 'player' ? PLATE.player
        : opts.faction === 'rival' ? PLATE.rival
          : null; // neutral ⇒ no faction plate
  return {
    draw: true,
    raster: false,
    archetype: opts.archetype,
    height: figureHeightFor(opts.archetype, opts.heightOverride),
    bodyTones: downed ? DOWNED_TONES : BODY_TONES,
    outline: FIG2_BODY.ink,
    hatband: FIG2_BODY.coatShadow, // noir — faction is the plate, never the body
    plate,
    downed,
    lineWidths: { outer: OUTER_OUTLINE_PX, inner: INNER_LINE_PX },
    depthOrder: { shadow: -2, plate: -1, body: 0 },
    hudCamera: false,
  };
}
