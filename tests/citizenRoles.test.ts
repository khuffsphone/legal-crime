// Citizen Life P0 — T1 mutation-verified tests: the pure role/composition data model. Proves every ART
// district composition sums to 100, the tables are keyed on the ART DistrictArchetype vocabulary (NEVER the
// sim CITY_ARCHETYPES lowercase names — recon §11 flag 1), speed bands are sane, and debug letters are
// distinct. The mutation table (spec §12.2 T1): a district sum ≠ 100 fails; an ART key replaced by a sim key
// fails; a Phaser import fails the pure-import (this file loads in the vitest node env — no Phaser possible).
import { describe, it, expect } from 'vitest';
import {
  CITIZEN_ROLES, DISTRICT_COMPOSITION, DISTRICT_DENSITY, ROLE_SPEED, ROLE_LETTER, ROLE_PRIORITY,
  compositionSum, speedForRole, type CitizenRole,
} from '../src/scenes/citizens/roles';

const ART_ARCHETYPES = [
  'FINANCIAL', 'DOCKS', 'TENEMENT', 'CIVIC', 'MARKET', 'THEATRE', 'INDUSTRIAL', 'QUARTER', 'RIVERSIDE',
] as const;

// The sim CITY_ARCHETYPES lowercase names (src/sim/city.ts) — citizen tables must NEVER key on these.
const SIM_ARCHETYPE_NAMES = [
  'docks', 'oldtown', 'heights', 'riverside', 'downtown', 'stockyards', 'southside', 'levee', 'uptown',
];

describe('T1 — composition tables sum to exactly 100 per ART district (×9)', () => {
  it('every one of the 9 ART districts sums to 100', () => {
    for (const arch of ART_ARCHETYPES) {
      expect(compositionSum(DISTRICT_COMPOSITION[arch])).toBe(100);
    }
  });

  it('there are exactly 9 composition columns and 9 density weights', () => {
    expect(Object.keys(DISTRICT_COMPOSITION).sort()).toEqual([...ART_ARCHETYPES].sort());
    expect(Object.keys(DISTRICT_DENSITY).sort()).toEqual([...ART_ARCHETYPES].sort());
  });

  it('MUTATION: a hand-broken column that does not sum to 100 is detectable', () => {
    const broken = { ...DISTRICT_COMPOSITION.MARKET, worker: (DISTRICT_COMPOSITION.MARKET.worker ?? 0) + 1 };
    expect(compositionSum(broken)).not.toBe(100); // the guard that the real tables pass
  });
});

describe('T1 — tables key on ART DistrictArchetype, never the sim vocabulary', () => {
  it('composition keys are the 9 ART archetypes (all UPPERCASE), none are sim CITY_ARCHETYPES names', () => {
    const keys = Object.keys(DISTRICT_COMPOSITION);
    expect(keys.sort()).toEqual([...ART_ARCHETYPES].sort());
    for (const k of keys) {
      // ART keys are UPPERCASE; a sim key ('docks') would be lowercase and fail this + the set-equality above.
      expect(k).toBe(k.toUpperCase());
      expect(SIM_ARCHETYPE_NAMES).not.toContain(k);
    }
  });

  it('every composition role is a known CitizenRole (no typos leaking a bogus bucket)', () => {
    for (const arch of ART_ARCHETYPES) {
      for (const role of Object.keys(DISTRICT_COMPOSITION[arch])) {
        expect(CITIZEN_ROLES).toContain(role as CitizenRole);
      }
    }
  });
});

describe('T1 — role metadata is complete + sane', () => {
  it('13 roles, each with a speed band, a distinct debug letter, and a priority', () => {
    expect(CITIZEN_ROLES.length).toBe(13);
    expect(new Set(CITIZEN_ROLES).size).toBe(13);
    const letters = CITIZEN_ROLES.map((r) => ROLE_LETTER[r]);
    expect(new Set(letters).size).toBe(13); // distinct debug letters
    for (const r of CITIZEN_ROLES) {
      const [lo, hi] = ROLE_SPEED[r];
      expect(lo).toBeLessThanOrEqual(hi);
      expect(lo).toBeGreaterThanOrEqual(0);
      expect(hi).toBeLessThanOrEqual(0.70); // all calmer than the fastest ambient cap
      expect(['MVP', 'MVP-lite', 'Later']).toContain(ROLE_PRIORITY[r]);
    }
  });

  it('speedForRole interpolates within the band and clamps the roll', () => {
    expect(speedForRole('worker', 0)).toBe(ROLE_SPEED.worker[0]);
    expect(speedForRole('worker', 1)).toBe(ROLE_SPEED.worker[1]);
    expect(speedForRole('worker', -5)).toBe(ROLE_SPEED.worker[0]);
    expect(speedForRole('worker', 9)).toBe(ROLE_SPEED.worker[1]);
    const mid = speedForRole('officeClerk', 0.5);
    expect(mid).toBeGreaterThan(ROLE_SPEED.officeClerk[0]);
    expect(mid).toBeLessThan(ROLE_SPEED.officeClerk[1]);
  });

  it('density weights are all present and in the plausible band', () => {
    for (const arch of ART_ARCHETYPES) {
      expect(DISTRICT_DENSITY[arch]).toBeGreaterThan(0.5);
      expect(DISTRICT_DENSITY[arch]).toBeLessThan(1.6);
    }
    // MARKET busiest, DOCKS calmest (spec intent)
    expect(DISTRICT_DENSITY.MARKET).toBeGreaterThan(DISTRICT_DENSITY.FINANCIAL);
    expect(DISTRICT_DENSITY.DOCKS).toBeLessThan(DISTRICT_DENSITY.TENEMENT);
  });
});
