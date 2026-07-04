// Citizen Life P0 (T1) — the PURE citizen-role data model. Phaser-free by law (scene-adjacent, env/-pattern:
// presentation-only, never /src/sim). This owns the bounded citizen ROLE set, their SPEED bands, debug MARKER
// letters, MVP priority, and the ART-DistrictArchetype COMPOSITION + DENSITY tables that make FINANCIAL feel
// unlike MARKET unlike INDUSTRIAL. Every composition column sums to exactly 100. Keyed on the ART
// DistrictArchetype vocabulary ONLY (never the sim CITY_ARCHETYPES lowercase names) — the three district
// vocabularies are parallel + ordinal-linked, not semantically equal (recon §11 flag 1).
//
// GOVERNING LAW (spec §1.2/§13): citizens are ambient presentation. No collision, no selection, no economy,
// no heat/federal/GameState writes, no hidden-intel. This module is data + pure helpers only.

import type { DistrictArchetype } from '../art/districtIdentity';

/** The bounded citizen role set — the composition buckets the district tables weight (spec §2 taxonomy,
 * §5.2 composition). "worker" folds working-men/women (a visual man/woman variant is a later sprite concern,
 * not a composition role). 13 roles → 13 debug letters. */
export type CitizenRole =
  | 'worker'
  | 'officeClerk'
  | 'dockworker'
  | 'deliveryWorker'
  | 'factoryWorker'
  | 'shopkeeper'
  | 'streetVendor'
  | 'domesticWorker'
  | 'chauffeur'
  | 'churchgoer'
  | 'entertainer'
  | 'child'
  | 'vagrant';

/** Stable role ordering — the deterministic iteration order for CDF role selection (planner reads this so a
 * given roll always resolves to the same role). Never reorder without updating the determinism tests. */
export const CITIZEN_ROLES: readonly CitizenRole[] = [
  'worker', 'officeClerk', 'dockworker', 'deliveryWorker', 'factoryWorker',
  'shopkeeper', 'streetVendor', 'domesticWorker', 'chauffeur', 'churchgoer',
  'entertainer', 'child', 'vagrant',
] as const;

/** The AmbientLife-side behaviour states a citizen can occupy (spec §6.2). MVP renders spawn/walk/loiter/
 * windowShop/queue/react/panic/despawn; crossStreet/enter/exit are DEFER/MVP-lite (documented, not wired). */
export type CitizenState =
  | 'spawn' | 'walk' | 'loiter' | 'windowShop' | 'queue'
  | 'crossStreet' | 'enterBuilding' | 'exitBuilding'
  | 'react' | 'panic' | 'despawn';

/** MVP shipping priority per role (spec §2.2 table). Marker prototype renders every role; this gates the
 * later sprite/GLB asset production order (spec §10.8 / §13.2), not the prototype. */
export type RolePriority = 'MVP' | 'MVP-lite' | 'Later';

export const ROLE_PRIORITY: Record<CitizenRole, RolePriority> = {
  worker: 'MVP',
  officeClerk: 'MVP',
  dockworker: 'MVP',
  deliveryWorker: 'MVP',
  factoryWorker: 'MVP',
  domesticWorker: 'MVP',
  shopkeeper: 'MVP-lite',
  streetVendor: 'MVP-lite',
  vagrant: 'MVP-lite',
  child: 'Later',
  entertainer: 'Later',
  churchgoer: 'Later',
  chauffeur: 'Later',
};

/** Per-role walk speed band in tiles/second [min, max] (spec §2.2). Calm ambient pace — all subordinate to
 * the crew stroll; the existing PED_SPEED 0.42 sits mid-band. streetVendor floors near 0 (prop-bound). */
export const ROLE_SPEED: Record<CitizenRole, readonly [number, number]> = {
  worker: [0.36, 0.46],
  officeClerk: [0.44, 0.50],
  dockworker: [0.32, 0.40],
  deliveryWorker: [0.46, 0.58],
  factoryWorker: [0.38, 0.44],
  shopkeeper: [0.24, 0.36],
  streetVendor: [0.00, 0.22],
  domesticWorker: [0.38, 0.46],
  chauffeur: [0.34, 0.42],
  churchgoer: [0.32, 0.40],
  entertainer: [0.36, 0.46],
  child: [0.48, 0.56],
  vagrant: [0.18, 0.28],
} as const;

/** DEBUG-ONLY occupation letter per role (spec §11.3). Rendered only behind ?citizens=1 + the debug subflag;
 * NEVER production UI. Distinct per role for readable district-mix debugging. */
export const ROLE_LETTER: Record<CitizenRole, string> = {
  worker: 'W',
  officeClerk: 'C',
  dockworker: 'D',
  deliveryWorker: 'Y',
  factoryWorker: 'F',
  shopkeeper: 'S',
  streetVendor: 'V',
  domesticWorker: 'M',
  chauffeur: 'H',
  churchgoer: 'G',
  entertainer: 'E',
  child: 'N',
  vagrant: 'R',
} as const;

/** A district's citizen composition — role → percentage. Partial: an unlisted role is 0% for that district.
 * INVARIANT (T1 acceptance): every district's listed weights sum to exactly 100. */
export type Composition = Partial<Record<CitizenRole, number>>;

/**
 * Citizen role composition per ART DistrictArchetype (spec §5.2). Percentages are stylised for readability
 * and DELIBERATELY distinct across districts (MARKET = vendor/shopkeeper heavy, INDUSTRIAL = factory heavy,
 * FINANCIAL = clerk heavy) so the three districts read socially different (spec §11.5 acceptance).
 *
 * Keyed on the ART DistrictArchetype union ONLY. Using a sim CITY_ARCHETYPES name here is a spec violation
 * (recon §11 flag 1) and is caught by the T1 mutation test. Each column verified to sum to 100.
 */
export const DISTRICT_COMPOSITION: Record<DistrictArchetype, Composition> = {
  // 35+15+10+10+10+5+5+5+5 = 100
  FINANCIAL: {
    officeClerk: 35, worker: 15, chauffeur: 10, shopkeeper: 10, domesticWorker: 10,
    churchgoer: 5, streetVendor: 5, child: 5, vagrant: 5,
  },
  // 40+15+15+10+5+5+5+5 = 100
  DOCKS: {
    dockworker: 40, deliveryWorker: 15, worker: 15, vagrant: 10, factoryWorker: 5,
    chauffeur: 5, streetVendor: 5, child: 5,
  },
  // 25+20+20+10+10+5+5+5 = 100
  TENEMENT: {
    worker: 25, domesticWorker: 20, child: 20, shopkeeper: 10, streetVendor: 10,
    churchgoer: 5, vagrant: 5, deliveryWorker: 5,
  },
  // 25+15+15+10+10+10+5+5+5 = 100
  CIVIC: {
    officeClerk: 25, worker: 15, churchgoer: 15, shopkeeper: 10, domesticWorker: 10,
    chauffeur: 10, child: 5, streetVendor: 5, vagrant: 5,
  },
  // 25+20+15+15+10+5+5+3+2 = 100
  MARKET: {
    streetVendor: 25, shopkeeper: 20, worker: 15, deliveryWorker: 15, child: 10,
    domesticWorker: 5, officeClerk: 5, entertainer: 3, vagrant: 2,
  },
  // 25+15+10+10+10+10+10+5+5 = 100
  THEATRE: {
    entertainer: 25, officeClerk: 15, chauffeur: 10, streetVendor: 10, worker: 10,
    shopkeeper: 10, vagrant: 10, deliveryWorker: 5, child: 5,
  },
  // 40+20+15+10+10+5 = 100
  INDUSTRIAL: {
    factoryWorker: 40, deliveryWorker: 20, dockworker: 15, officeClerk: 10, vagrant: 10, child: 5,
  },
  // 20+15+15+15+10+10+5+5+5 = 100
  QUARTER: {
    worker: 20, shopkeeper: 15, domesticWorker: 15, child: 15, churchgoer: 10,
    streetVendor: 10, entertainer: 5, officeClerk: 5, vagrant: 5,
  },
  // 20+15+15+10+10+10+5+5+5+5 = 100
  RIVERSIDE: {
    worker: 20, officeClerk: 15, churchgoer: 15, domesticWorker: 10, chauffeur: 10,
    child: 10, streetVendor: 5, vagrant: 5, entertainer: 5, deliveryWorker: 5,
  },
};

/** Base spawn-density multiplier per ART DistrictArchetype (spec §4.6) — a SPAWN-WEIGHT modifier, never a
 * persistent citizen model. MARKET busiest, DOCKS/RIVERSIDE calmest. */
export const DISTRICT_DENSITY: Record<DistrictArchetype, number> = {
  FINANCIAL: 1.20,
  DOCKS: 0.80,
  TENEMENT: 1.05,
  CIVIC: 1.10,
  MARKET: 1.35,
  THEATRE: 1.30,
  INDUSTRIAL: 0.90,
  QUARTER: 1.15,
  RIVERSIDE: 0.85,
};

/** Node-weight clamp bounds applied to a district-density × local-modifier product before normalisation
 * (spec §4.6). Keeps any one node from starving/dominating the spawn distribution. */
export const DENSITY_CLAMP_MIN = 0.45;
export const DENSITY_CLAMP_MAX = 1.50;

/** Sum of a composition column (should be 100 for every district). Pure. */
export function compositionSum(comp: Composition): number {
  let total = 0;
  for (const role of CITIZEN_ROLES) total += comp[role] ?? 0;
  return total;
}

/** Clamp a role's raw speed band to a single deterministic speed for a citizen, given a 0..1 roll. Pure. */
export function speedForRole(role: CitizenRole, roll01: number): number {
  const [lo, hi] = ROLE_SPEED[role];
  const t = roll01 < 0 ? 0 : roll01 > 1 ? 1 : roll01;
  return lo + (hi - lo) * t;
}

/** The smallest speed an ambient citizen actually MOVES at (tiles/s). streetVendor's band floors at 0, and a
 * perfectly-frozen agent never reaches its target tile — so its advanceNode/pause/despawn re-roll would never
 * fire and it would pin a pool slot until it drifts offscreen. This floor keeps every citizen creeping (a
 * vendor at 0.05 t/s reads as near-stationary loitering), so the wander/cull loop always makes progress. */
export const MIN_CITIZEN_MOVE_SPEED = 0.05;

/** The MOVEMENT speed for a citizen: the band speed, floored so no marker is ever perfectly frozen. Pure. */
export function movementSpeedForRole(role: CitizenRole, roll01: number): number {
  const s = speedForRole(role, roll01);
  return s < MIN_CITIZEN_MOVE_SPEED ? MIN_CITIZEN_MOVE_SPEED : s;
}
