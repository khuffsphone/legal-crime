// districtBedCatalog.ts — AUDIO E-H, Ticket E1: the pure district ambience-bed CATALOG. Phaser-free,
// sim-free. District beds are non-event ambience loops keyed to the ART DistrictArchetype set (all 9,
// index-keyed via layout.districtOfTile at the resolver). They communicate NO hidden unit activity and
// create NO positional information (spec E.1). MVP: exactly TWO layers per archetype — base + color; a
// third layer (weather/time/tension) is a LATER, separate clip-registration ticket by design (E.2).
//
// QUARTER rule (E.1): QUARTER has its OWN bed pair. The TENEMENT fallback applies ONLY where a system
// depends on the StreetscapeDistrict set (which drops QUARTER) — i.e. prop-emitter district styling —
// never to the beds themselves.

import type { DistrictArchetype } from '../art/districtIdentity';

/** The two MVP bed layers. NO third layer ships in E-H (spec E.2). */
export type BedLayer = 'base' | 'color';
export const BED_LAYERS: readonly BedLayer[] = ['base', 'color'];

export interface DistrictBed {
  archetype: DistrictArchetype;
  /** seamless stereo loop, 60-90 s, broad low tone, no semantic speech (F.3). */
  base: string;
  /** seamless stereo loop, 45-75 s, sparse identity detail, no event-like stingers (F.3). */
  color: string;
  /** design intent line (E.1 binding table) — for the mixer's production queue, not runtime. */
  intent: string;
}

/** The 9 archetype beds — keys are the F.3 manifest contract (bed_<archetype>_{base,color}). */
export const DISTRICT_BEDS: Readonly<Record<DistrictArchetype, DistrictBed>> = {
  FINANCIAL: {
    archetype: 'FINANCIAL', base: 'bed_financial_base', color: 'bed_financial_color',
    intent: 'Formal commercial pressure — low indoor street wash, distant paper/cash/office motion.',
  },
  DOCKS: {
    archetype: 'DOCKS', base: 'bed_docks_base', color: 'bed_docks_color',
    intent: 'Waterfront labor — water, hull/rope/chain, muted dock activity.',
  },
  TENEMENT: {
    archetype: 'TENEMENT', base: 'bed_tenement_base', color: 'bed_tenement_color',
    intent: 'Dense residential — room tone, pipes, close voices as non-semantic texture.',
  },
  CIVIC: {
    archetype: 'CIVIC', base: 'bed_civic_base', color: 'bed_civic_color',
    intent: 'Stone/plaza/institutional — open plaza air, distant civic bell/footsteps.',
  },
  MARKET: {
    archetype: 'MARKET', base: 'bed_market_base', color: 'bed_market_color',
    intent: 'Busy storefront commerce — crowd wash, awnings, carts, produce handling.',
  },
  THEATRE: {
    archetype: 'THEATRE', base: 'bed_theatre_base', color: 'bed_theatre_color',
    intent: 'Entertainment district — marquee/electric hum, crowd spill, muffled music texture.',
  },
  INDUSTRIAL: {
    archetype: 'INDUSTRIAL', base: 'bed_industrial_base', color: 'bed_industrial_color',
    intent: 'Machinery/yard — low mechanical bed, metal/steam accents.',
  },
  QUARTER: {
    archetype: 'QUARTER', base: 'bed_quarter_base', color: 'bed_quarter_color',
    intent: 'Mixed old-quarter street life — interior spill, balconies, mixed residential/commercial texture.',
  },
  RIVERSIDE: {
    archetype: 'RIVERSIDE', base: 'bed_riverside_base', color: 'bed_riverside_color',
    intent: 'River edge — water, bank air, distant boats/shore activity.',
  },
};

export const DISTRICT_BED_ARCHETYPES = Object.keys(DISTRICT_BEDS) as DistrictArchetype[];

/** All 18 bed clip keys (9 base + 9 color), in archetype order — the F.3/F2 manifest-parity list. */
export const ALL_BED_KEYS: readonly string[] = DISTRICT_BED_ARCHETYPES.flatMap(
  (a) => [DISTRICT_BEDS[a].base, DISTRICT_BEDS[a].color],
);

/** The bed pair for an archetype (undefined for an unknown string id). Pure. */
export function bedFor(archetype: string): DistrictBed | undefined {
  return (DISTRICT_BEDS as Record<string, DistrictBed>)[archetype];
}

// NB the QUARTER→TENEMENT fallback for STREETSCAPE-bound styling lives in propEmitterCatalog
// (emitterStyleDistrict) — it is an emitter concern; beds never route through it (QUARTER keeps
// bed_quarter_base/color above).

// ── E.6 volume law (dB, applied before the H duck offsets) ───────────────────────────────────────
/** Layer trims relative to the bed bus. */
export const BED_LAYER_TRIM_DB: Readonly<Record<BedLayer, number>> = { base: -18, color: -24 };

/** audioZoom = current camera pixels-per-tile / default gameplay pixels-per-tile (R2: pinned to the
 * real cam.zoom by the H3 adapter — Phaser zoom 1 IS the default pixels-per-tile). */
export function bedZoomTrimDb(audioZoom: number): number {
  if (audioZoom < 0.65) return 0;     // FAR — beds carry the atmosphere while emitters are off
  if (audioZoom <= 1.15) return -1.5; // MID — normal gameplay mix
  return -3;                          // NEAR — beds step back for emitters and one-shots
}

// ── E.3/E.5 resolver + crossfade constants (consumed by the E2 planner) ──────────────────────────
export const BED_SAMPLE_INTERVAL_MS = 250;   // 4 Hz camera sample cadence
export const BED_HYSTERESIS_MS = 750;        // winner must hold this long before a crossfade
export const BED_XFADE_MS = 2800;            // district-to-district equal-power crossfade
export const BED_FADE_IN_MS = 1500;          // initial fade-in (nothing playing before)
export const BED_FADE_OUT_MS = 1500;         // fade-out to silence (no district, no previous)
export const BED_HOLD_PENALTY_DB = -6;       // hold-previous level when the sample is fully unrevealed
export const MAX_ACTIVE_BED_DISTRICTS = 2;   // only during a crossfade
export const MAX_BED_LAYERS_PER_DISTRICT = 2;
export const MAX_BED_LOOPS = 4;              // 2 districts × 2 layers, crossfade worst-case
