// CITY VISUAL DEPTH (Lane C) — the PURE (Phaser-free) art-decision model. Gives each district a stable
// IDENTITY (a noir archetype + a warm accent + a civic LANDMARK kind) and each building a deterministic
// facade VARIANT, so the city reads as distinct neighbourhoods instead of one uniform soot field. This owns
// only the testable DECISIONS — the cityArt render layer paints what these return. Canon discipline: every
// accent is a warm noir tone (brass / stone / amber / bone family) — NEVER green or red, which stay reserved
// for cash-in-motion, rival identity, and danger. Deterministic + stable so the look never flickers frame to
// frame, and so two Code sessions building the same map agree.

/** The civic landmark that anchors a district's plaza. All stone/brass — no greenery (keeps the colour law
 * unambiguous: green/red are never decoration). */
export type LandmarkKind = 'fountain' | 'statue' | 'clocktower' | 'obelisk';

/** A district's noir archetype — flavour only (drives the accent/landmark spread, never a sim rule). */
export type DistrictArchetype =
  | 'FINANCIAL' | 'DOCKS' | 'TENEMENT' | 'CIVIC' | 'MARKET'
  | 'THEATRE' | 'INDUSTRIAL' | 'QUARTER' | 'RIVERSIDE';

export interface DistrictIdentity {
  archetype: DistrictArchetype;
  /** A warm noir accent (brass/stone/amber/bone family) used for the landmark + a faint facade course. */
  accent: number;
  landmark: LandmarkKind;
}

// The spread tables. Three coprime-ish lengths (9 / 8 / 4) so consecutive districts differ in archetype,
// accent AND landmark — the city never paints two identical neighbours in a row.
const ARCHETYPES: readonly DistrictArchetype[] = [
  'FINANCIAL', 'DOCKS', 'TENEMENT', 'CIVIC', 'MARKET', 'THEATRE', 'INDUSTRIAL', 'QUARTER', 'RIVERSIDE',
];

/** Warm noir accents — brass / stone / amber / bone ONLY. No 0x9e1b1b blood, no 0xe11d1d danger, no
 * 0x4e8b5a cash-green: those carry meaning and are never decoration (docs/VISUAL_DIRECTION colour law). */
export const DISTRICT_ACCENTS: readonly number[] = [
  0xb8862b, // brass
  0xe3c36a, // brass highlight
  0x7c5c1d, // brass dim
  0x6b5344, // warm mortar stone
  0x9a8f80, // cool fog stone
  0xf2c879, // gas-lamp amber
  0xc9a883, // sandstone / skin
  0xe8e2d4, // bone
];

const LANDMARKS: readonly LandmarkKind[] = ['fountain', 'statue', 'clocktower', 'obelisk'];

/** Colours the accent list must never contain (state/identity colours — green/red). Exported so the test
 * can assert the discipline directly. */
export const RESERVED_COLOURS: readonly number[] = [0x9e1b1b, 0x5e1414, 0xe11d1d, 0xff5a2c, 0x4e8b5a];

/**
 * The stable identity for the district at ordinal `index` (its position in the map's district list). Pure +
 * total: same index → same identity, always, and the three spread tables' differing lengths guarantee
 * neighbours differ. Negative/huge indices wrap safely.
 */
export function districtIdentityFor(index: number): DistrictIdentity {
  const wrap = (len: number) => ((Math.trunc(index) % len) + len) % len;
  return {
    archetype: ARCHETYPES[wrap(ARCHETYPES.length)],
    accent: DISTRICT_ACCENTS[wrap(DISTRICT_ACCENTS.length)],
    landmark: LANDMARKS[wrap(LANDMARKS.length)],
  };
}

/** How many distinct building facade variants the renderer can paint. */
export const BUILDING_VARIANTS = 4;

/** A stable, non-negative hash of a string id (e.g. a business id) for seeding per-building variety. Pure. */
export function hashKey(s: string): number {
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

/** The facade variant (0..BUILDING_VARIANTS-1) for a building seed — deterministic, bounded. Pure. */
export function buildingVariantFor(seed: number): number {
  const n = Math.trunc(seed);
  return ((n % BUILDING_VARIANTS) + BUILDING_VARIANTS) % BUILDING_VARIANTS;
}

/** Clamp a byte channel to 0..255. */
function clampByte(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : Math.round(n);
}

/**
 * A per-building facade ACCENT: the district accent nudged lighter/darker by the building's variant, so
 * adjacent storefronts on the same block read with slight individual variety while staying in the district's
 * family. Pure RGB math — a tint of a warm accent stays warm (never crosses into green/red). The renderer
 * paints this as a faint course BELOW the cornice, never as the identity trim itself.
 */
export function facadeAccentFor(accent: number, variant: number): number {
  const v = buildingVariantFor(variant);
  // four subtle brightness steps centred on the accent: −12%, −4%, +4%, +12%
  const factor = [0.88, 0.96, 1.04, 1.12][v];
  const r = clampByte(((accent >> 16) & 0xff) * factor);
  const g = clampByte(((accent >> 8) & 0xff) * factor);
  const b = clampByte((accent & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}
