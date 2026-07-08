// STATUS UI — Phase 0, Ticket 1: registry validity. Pure metadata guard — no rendering, no sim. Asserts
// the spec §7 shape: 25 screens, unique IDs, valid nav groups + mvpStatus + risk enums, priority coverage,
// the §7 group/priority/mvp cross-checks, and the §8 top-10 build set. A malformed registry fails CI here.
import { describe, it, expect } from 'vitest';
import {
  STATUS_SCREENS, NAV_GROUPS, MVP_STATUSES, RISK_LEVELS, TOP_10_SCREEN_IDS,
  statusScreenById, statusScreensByGroup, topTenScreens, mvpStatusScreens,
} from '../src/scenes/ui/statusScreenRegistry';

describe('status-screen registry — Ticket 1 shape', () => {
  it('has exactly the 25 screens from spec §7', () => {
    expect(STATUS_SCREENS).toHaveLength(25);
  });

  it('every ID is unique', () => {
    const ids = STATUS_SCREENS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every navGroup is one of the 7 spec §3 groups', () => {
    for (const s of STATUS_SCREENS) {
      expect(NAV_GROUPS, `${s.id} navGroup`).toContain(s.navGroup);
    }
  });

  it('every mvpStatus is a valid enum value', () => {
    for (const s of STATUS_SCREENS) expect(MVP_STATUSES, `${s.id} mvpStatus`).toContain(s.mvpStatus);
  });

  it('every riskLevel is a valid enum value', () => {
    for (const s of STATUS_SCREENS) expect(RISK_LEVELS, `${s.id} riskLevel`).toContain(s.riskLevel);
  });

  it('priorities are the contiguous 1..25 with no gaps or dupes (spec §7 ordering)', () => {
    const priorities = STATUS_SCREENS.map((s) => s.priority).sort((a, b) => a - b);
    expect(priorities).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it('every entry carries the full §9 field set with the right types', () => {
    for (const s of STATUS_SCREENS) {
      expect(typeof s.id).toBe('string');
      expect(s.id.length).toBeGreaterThan(0);
      expect(typeof s.title).toBe('string');
      expect(s.title.length).toBeGreaterThan(0);
      expect(Array.isArray(s.dataSources)).toBe(true);
      expect(s.dataSources.length, `${s.id} has data sources`).toBeGreaterThan(0);
      expect(Array.isArray(s.defaultFilters)).toBe(true);
      expect(typeof s.jumpToMapSupport).toBe('boolean');
      expect(typeof s.debugOnly).toBe('boolean');
      if (s.hotkey !== undefined) expect(typeof s.hotkey).toBe('string');
    }
  });
});

describe('status-screen registry — spec §7 cross-checks', () => {
  const expected: Record<string, { group: string; priority: number; mvp: string }> = {
    commandDashboard: { group: 'Command', priority: 1, mvp: 'yes' },
    heatBeatMeter: { group: 'Law', priority: 2, mvp: 'yes' },
    federalLadder: { group: 'Law', priority: 3, mvp: 'yes' },
    thugRoster: { group: 'Crew', priority: 4, mvp: 'yes' },
    controlMap: { group: 'City', priority: 5, mvp: 'yes' },
    districtDossier: { group: 'City', priority: 6, mvp: 'yes' },
    racketOperations: { group: 'Rackets', priority: 7, mvp: 'yes' },
    frontsExtortion: { group: 'Rackets', priority: 8, mvp: 'yes' },
    moneyLedger: { group: 'Money', priority: 9, mvp: 'yes' },
    dirtyCashLaundering: { group: 'Money', priority: 10, mvp: 'yes' },
    briberyChannels: { group: 'Law', priority: 11, mvp: 'yes' },
    beatCopStreetLaw: { group: 'Law', priority: 12, mvp: 'placeholder' },
    incidentLedger: { group: 'Command', priority: 13, mvp: 'yes' },
    alertsInbox: { group: 'Command', priority: 14, mvp: 'yes' },
    collectionRoutes: { group: 'Money', priority: 15, mvp: 'useful' },
    rivalFamilies: { group: 'War', priority: 16, mvp: 'yes' },
    warConflict: { group: 'War', priority: 17, mvp: 'useful' },
    recruitment: { group: 'Crew', priority: 18, mvp: 'useful' },
    weaponsSpecialists: { group: 'Crew', priority: 19, mvp: 'later' },
    marketSupply: { group: 'Money', priority: 20, mvp: 'optional' },
    civicInfluence: { group: 'City', priority: 21, mvp: 'later' },
    environmentalAtmosphere: { group: 'City', priority: 22, mvp: 'debug' },
    newspaperPublicReputation: { group: 'Command', priority: 23, mvp: 'later' },
    objectivesCampaign: { group: 'Command', priority: 24, mvp: 'yes' },
    settingsOverlays: { group: 'City', priority: 25, mvp: 'yes' },
  };

  it('every screen matches its §7 group / priority / mvpStatus row', () => {
    expect(Object.keys(expected)).toHaveLength(25);
    for (const [id, e] of Object.entries(expected)) {
      const s = statusScreenById(id);
      expect(s, `${id} exists`).toBeTruthy();
      expect(s!.navGroup).toBe(e.group);
      expect(s!.priority).toBe(e.priority);
      expect(s!.mvpStatus).toBe(e.mvp);
    }
  });

  it('only environmentalAtmosphere is debugOnly (spec §7 "Debug")', () => {
    const debugScreens = STATUS_SCREENS.filter((s) => s.debugOnly).map((s) => s.id);
    expect(debugScreens).toEqual(['environmentalAtmosphere']);
  });
});

describe('status-screen registry — helpers + §8 top-10', () => {
  it('statusScreenById resolves and misses correctly', () => {
    expect(statusScreenById('federalLadder')?.title).toBe('Federal Ladder');
    expect(statusScreenById('nope')).toBeUndefined();
  });

  it('statusScreensByGroup returns each group in priority order', () => {
    const law = statusScreensByGroup('Law').map((s) => s.id);
    expect(law).toEqual(['heatBeatMeter', 'federalLadder', 'briberyChannels', 'beatCopStreetLaw']);
    // every screen is reachable via exactly one group
    const viaGroups = NAV_GROUPS.flatMap((g) => statusScreensByGroup(g));
    expect(viaGroups).toHaveLength(25);
  });

  it('the §8 top-10 build set is exactly ten known screens in ranked order', () => {
    expect(TOP_10_SCREEN_IDS).toHaveLength(10);
    expect(new Set(TOP_10_SCREEN_IDS).size).toBe(10);
    expect(topTenScreens().map((s) => s.id)).toEqual(TOP_10_SCREEN_IDS); // all resolve, order preserved
    expect(TOP_10_SCREEN_IDS[0]).toBe('commandDashboard'); // rank 1 per §8
  });

  it("mvpStatusScreens is the broader 'yes' set (a superset of the top-10)", () => {
    const yesIds = mvpStatusScreens().map((s) => s.id);
    expect(yesIds.length).toBeGreaterThanOrEqual(10);
    // every top-10 screen flagged 'yes' is in the yes set; districtDossier/etc are yes too
    for (const id of TOP_10_SCREEN_IDS) {
      if (statusScreenById(id)!.mvpStatus === 'yes') expect(yesIds).toContain(id);
    }
  });
});
