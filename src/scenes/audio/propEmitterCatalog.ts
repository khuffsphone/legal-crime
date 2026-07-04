// propEmitterCatalog.ts — AUDIO E-H, Ticket G1: the pure positional PROP-EMITTER catalog. Phaser-free,
// sim-free. Binds the audio treatment of EVERY streetscape prop family (all 28, explicit — no implicit
// silence) to the merged #62 vocabulary (PropFamilyId / PlacementZoneId — the single source of truth).
// Scene-level audio presentation only: nothing here reads or writes /src/sim.
//
// G.2 treatments: 4 ANCHOR LOOP families (mono positional seamless loops), 11 RHYTHM one-shot families
// (NEAR-zoom only), 13 SILENT (12 filler + police_call_box — no police chatter: a call-box voice would
// falsely imply police-raid activity). QUARTER prop styling falls back to TENEMENT via
// districtBedCatalog.emitterStyleDistrict (beds do NOT — QUARTER keeps its own bed).
//
// R1 (rider): the LIVE map today is dressed by worldgen.scatterProps' 7 legacy PropKinds, not by
// streetscape Ticket-4 placements (which don't exist yet). The legacy adapter below maps those kinds
// onto the taxonomy families so G is audible pre-T4; the full 28-family roster activates automatically
// when T4 placement records arrive (they already speak PropFamilyId).

import type { PropKind, PropPlacement } from '../../sim';
import type { DistrictArchetype } from '../art/districtIdentity';
import type { PlacementZoneId, StreetscapeDistrict } from '../env/streetscapeTypes';
import type { PropFamilyId } from '../env/streetscapeTaxonomy';
import { FAMILY_IDS } from '../env/streetscapeTaxonomy';

/** QUARTER → TENEMENT fallback (E.1) — ONLY for systems bound to the StreetscapeDistrict set (this
 * catalog's district styling / preferDistrict). Every other archetype maps to itself; the compile-time
 * return type guarantees the result is a member of the 8-value streetscape set. District BEDS never
 * route through this — QUARTER keeps its own bed pair (districtBedCatalog). */
export function emitterStyleDistrict(archetype: DistrictArchetype): StreetscapeDistrict {
  return archetype === 'QUARTER' ? 'TENEMENT' : archetype;
}

export type EmitterKind = 'anchorLoop' | 'rhythmOneShot' | 'silent';

export interface AnchorLoopTreatment {
  kind: 'anchorLoop';
  clipKey: string;
  /** zones this emitter treatment expects (from the spec's G.2 table). */
  zones: readonly PlacementZoneId[];
  /** per-screen cap for THIS family (G.4: street_tree 2, every other anchor 1). */
  maxPerScreen: number;
  /** anchor ranking tier (G.4 rule 3): fountain > news_stand > statue_monument > street_tree. */
  rank: number;
}

export interface RhythmOneShotTreatment {
  kind: 'rhythmOneShot';
  clipKey: string;
  zones: readonly PlacementZoneId[];
  /** district whose block-faces this family prefers (rank bonus only — never exclusive). */
  preferDistrict?: 'MARKET';
}

export interface SilentTreatment {
  kind: 'silent';
  /** why the family is silent in MVP (catalogued, no playback command). */
  reason: string;
}

export type EmitterTreatment = AnchorLoopTreatment | RhythmOneShotTreatment | SilentTreatment;

const silent = (reason: string): SilentTreatment => ({ kind: 'silent', reason });

/** The complete 28-family treatment table (G.2 — every family EXPLICIT). */
export const PROP_EMITTERS: Readonly<Record<PropFamilyId, EmitterTreatment>> = {
  // ── anchor loops (4) — mono positional seamless loops, 20-45 s ─────────────────────────────────
  fountain: { kind: 'anchorLoop', clipKey: 'prop_fountain_loop', zones: ['park_plaza'], maxPerScreen: 1, rank: 0 },
  news_stand: { kind: 'anchorLoop', clipKey: 'prop_news_stand_loop', zones: ['furniture_band', 'storefront_frontage'], maxPerScreen: 1, rank: 1 },
  statue_monument: { kind: 'anchorLoop', clipKey: 'prop_statue_monument_loop', zones: ['park_plaza'], maxPerScreen: 1, rank: 2 },
  street_tree: { kind: 'anchorLoop', clipKey: 'prop_street_tree_loop', zones: ['furniture_band', 'residential_frontage', 'park_plaza'], maxPerScreen: 2, rank: 3 },
  // ── rhythm one-shots (11) — NEAR zoom only ─────────────────────────────────────────────────────
  street_lamp: { kind: 'rhythmOneShot', clipKey: 'prop_street_lamp_tick', zones: ['curb', 'sidewalk_through', 'furniture_band'] },
  utility_pole: { kind: 'rhythmOneShot', clipKey: 'prop_utility_pole_buzz', zones: ['curb', 'alley_service', 'industrial_apron'] },
  bench: { kind: 'rhythmOneShot', clipKey: 'prop_bench_creak', zones: ['furniture_band', 'park_plaza'] },
  produce_stall: { kind: 'rhythmOneShot', clipKey: 'prop_produce_stall_rustle', zones: ['storefront_frontage', 'furniture_band'], preferDistrict: 'MARKET' },
  awning: { kind: 'rhythmOneShot', clipKey: 'prop_awning_flap', zones: ['storefront_frontage'] },
  hedge_shrub: { kind: 'rhythmOneShot', clipKey: 'prop_hedge_shrub_rustle', zones: ['residential_frontage', 'park_plaza'] },
  parked_car: { kind: 'rhythmOneShot', clipKey: 'prop_parked_car_settle', zones: ['road', 'curb'] }, // settle foley — NO engine loop
  traffic_signal: { kind: 'rhythmOneShot', clipKey: 'prop_traffic_signal_relay', zones: ['road', 'curb'] }, // relay click only — not traffic simulation
  vendor_cart: { kind: 'rhythmOneShot', clipKey: 'prop_vendor_cart_clatter', zones: ['storefront_frontage', 'furniture_band', 'park_plaza'] }, // non-verbal
  blade_sign: { kind: 'rhythmOneShot', clipKey: 'prop_blade_sign_creak', zones: ['storefront_frontage'] },
  delivery_truck: { kind: 'rhythmOneShot', clipKey: 'prop_delivery_truck_settle', zones: ['road', 'curb', 'industrial_apron', 'storefront_frontage'] }, // NO idling loop
  // ── silent in MVP (13) — catalogued; NO playback command may ever be produced for these ────────
  police_call_box: silent('no police chatter — a call-box voice would falsely imply police-raid activity'),
  fire_hydrant: silent('filler'),
  mailbox: silent('filler'),
  trash_can: silent('filler'),
  bollard: silent('filler'),
  sandwich_board: silent('filler'),
  planter: silent('filler'),
  crate_stack: silent('filler'),
  barrel_drum: silent('filler'),
  pallet_stack: silent('filler'),
  manhole_cover: silent('filler'),
  sewer_grate: silent('filler'),
  puddle_stain: silent('filler'),
};

/** All 15 prop clip keys (4 anchor loops + 11 rhythm one-shots) — the F.3/F2 manifest-parity list. */
export const PROP_CLIP_KEYS: readonly string[] = FAMILY_IDS
  .map((id) => PROP_EMITTERS[id])
  .filter((t): t is AnchorLoopTreatment | RhythmOneShotTreatment => t.kind !== 'silent')
  .map((t) => t.clipKey);

/** Treatment lookup (undefined for a non-taxonomy id — an unknown family emits nothing). Pure. */
export function emitterTreatment(family: string): EmitterTreatment | undefined {
  return (PROP_EMITTERS as Record<string, EmitterTreatment>)[family];
}

// ── R1: the legacy scatterProps adapter (pre-streetscape-T4 audibility) ──────────────────────────
/** worldgen PropKind → taxonomy family. hydrant/mailbox/fence stay silent by design: hydrant + mailbox
 * are SILENT filler families anyway, and 'fence' has no taxonomy family at all. */
export const LEGACY_PROP_FAMILY: Readonly<Record<PropKind, PropFamilyId | null>> = {
  lamppost: 'street_lamp',
  tree: 'street_tree',
  car: 'parked_car',
  bench: 'bench',
  hydrant: null,
  mailbox: null,
  fence: null,
};

/** A concrete prop instance the G2 planner can consider — the tile is the spatial source. */
export interface EmitterSource {
  /** stable pooling identity (G.7): prop instance id when available, else family+tile. */
  id: string;
  family: PropFamilyId;
  gx: number;
  gy: number;
}

/** Adapt the live map's legacy scatter placements into emitter sources. Deterministic ids
 * (`legacy:<family>:<gx>,<gy>`) so the G.7 pooling identity is stable across re-plans. */
export function legacyEmitterSources(placements: readonly PropPlacement[]): EmitterSource[] {
  const out: EmitterSource[] = [];
  for (const p of placements) {
    const family = LEGACY_PROP_FAMILY[p.kind];
    if (family === null || family === undefined) continue;
    out.push({ id: `legacy:${family}:${p.gx},${p.gy}`, family, gx: p.gx, gy: p.gy });
  }
  return out;
}
