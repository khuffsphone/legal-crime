import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { districtHolder, spawnEnforcer, type GameState } from '../src/sim';
import {
  districtKnownToPlayer,
  fogSafeCityRows,
  fogSafeCitySummary,
  fogSafeCompass,
  fogSafeDistrictControl,
  fogSafeHudPhase,
  fogSafeRivalRows,
  fogSafeVictoryRows,
  knownOffenseTargets,
  playerCityLine,
  rivalCurrentlyObservable,
  rivalKnownToPlayer,
  type CityKnowledgeVisibility,
} from '../src/scenes/info/cityKnowledge';
import type { ControlStatus } from '../src/scenes/info/minimapMath';

const SECRET_A = 'SECRET MORETTI INTEL';
const SECRET_B = 'SECRET KOWALSKI INTEL';
const HIDDEN_A = 'district-2';
const HIDDEN_B = 'district-6';

function state(): GameState {
  const s = createInitialState(41, { bigCity: true, startingCrew: true });
  s.rivals[0].name = SECRET_A;
  s.rivals[1].name = SECRET_B;
  return s;
}

function vis(over: Partial<CityKnowledgeVisibility> = {}): CityKnowledgeVisibility {
  return {
    districtScouted: () => false,
    unitVisible: () => false,
    hqVisible: () => false,
    businessVisible: () => false,
    ...over,
  };
}

function rivalCapture(s: GameState, districtId: string, rivalId: string): void {
  const district = s.districts.find((d) => d.id === districtId)!;
  district.control = { [rivalId]: 100 };
  // The City roster derives its RIVAL row from business earners, while strategic standings/minimap derive
  // control from districtHolder. Set both truths so this fixture exercises every historic leak surface.
  for (const business of district.businesses) business.extortedBy = rivalId;
}

function projection(s: GameState, visibility: CityKnowledgeVisibility) {
  const rows = fogSafeCityRows(s, visibility.districtScouted, visibility.omniscient);
  const minimap = s.districts.map((district) => {
    const holder = districtHolder(district);
    const actual: ControlStatus = holder === s.player.id ? 'player' : holder ? 'rival' : 'neutral';
    const known = visibility.omniscient
      || districtKnownToPlayer(s, district.id, visibility.districtScouted);
    return { id: district.id, status: fogSafeDistrictControl(actual, !!known) };
  });
  return {
    rows,
    summary: fogSafeCitySummary(rows),
    minimap,
    rivals: fogSafeRivalRows(s, visibility),
    cityLine: playerCityLine(s),
    victory: fogSafeVictoryRows(s),
    phase: fogSafeHudPhase(s),
    compass: fogSafeCompass(s),
    targets: knownOffenseTargets(s, visibility),
  };
}

describe('strict NO-X-RAY — hidden strategic state is observationally equivalent to empty fog', () => {
  it('a hidden rival capture changes no City, rival, victory, compass, or offense projection', () => {
    const quiet = state();
    const captured = structuredClone(quiet);
    rivalCapture(captured, HIDDEN_A, 'rival-a');
    captured.rivals[0].hqIntegrity = 19;
    captured.rivals[0].lockoutTicks = 4;

    expect(projection(captured, vis())).toEqual(projection(quiet, vis()));
  });

  it('the same capture changes the projection after the district is scouted (the gate is not vacuous)', () => {
    const quiet = state();
    const captured = structuredClone(quiet);
    rivalCapture(captured, HIDDEN_A, 'rival-a');
    const eyes = vis({ districtScouted: (id) => id === HIDDEN_A });

    expect(projection(captured, eyes)).not.toEqual(projection(quiet, eyes));
    const row = fogSafeCityRows(captured, eyes.districtScouted).find((r) => r.id === HIDDEN_A)!;
    expect(row).toMatchObject({ known: true, status: 'RIVAL' });
  });

  it('sealed rival rows contain no hidden family name, exact holdings, HQ health, or weakest-target read', () => {
    const s = state();
    rivalCapture(s, HIDDEN_A, 'rival-a');
    rivalCapture(s, HIDDEN_B, 'rival-b');
    s.rivals[0].hqIntegrity = 19;
    s.rivals[1].hqIntegrity = 73;

    const text = JSON.stringify(fogSafeRivalRows(s, vis()));
    expect(text).not.toContain(SECRET_A);
    expect(text).not.toContain(SECRET_B);
    expect(text).not.toMatch(/HQ\s+(19|73)%/);
    expect(text).not.toMatch(/\b[12]\s+blk\b/);
    expect(text.toLowerCase()).not.toContain('weakest');
    expect(fogSafeRivalRows(s, vis()).every((row) => row.name === 'Unknown outfit' && !row.exact)).toBe(true);
  });
});

describe('district knowledge and minimap control', () => {
  it('a district becomes knowable only through scouting or a direct player stake', () => {
    const s = state();
    expect(districtKnownToPlayer(s, HIDDEN_A, () => false)).toBe(false);
    expect(districtKnownToPlayer(s, HIDDEN_A, (id) => id === HIDDEN_A)).toBe(true);

    s.districts.find((d) => d.id === HIDDEN_A)!.control.player = 1;
    expect(districtKnownToPlayer(s, HIDDEN_A, () => false)).toBe(true);

    delete s.districts.find((d) => d.id === HIDDEN_A)!.control.player;
    s.districts.find((d) => d.id === HIDDEN_A)!.businesses[0].extortedBy = 'player';
    expect(districtKnownToPlayer(s, HIDDEN_A, () => false)).toBe(true);

    s.districts.find((d) => d.id === HIDDEN_A)!.businesses[0].extortedBy = undefined;
    s.contests = [{ districtId: HIDDEN_A, invaderId: 'rival-a', pressure: 0, muscleIds: [] }];
    expect(districtKnownToPlayer(s, HIDDEN_A, () => false)).toBe(true);
    expect(districtKnownToPlayer(s, 'does-not-exist', () => true)).toBe(false);
  });

  it.each<ControlStatus>(['neutral', 'rival', 'contested', 'player'])(
    'an unscouted %s district collapses to the same neutral/fog minimap status',
    (actual) => expect(fogSafeDistrictControl(actual, false)).toBe('neutral'),
  );

  it.each<ControlStatus>(['neutral', 'rival', 'contested', 'player'])(
    'a known %s district preserves its real minimap status',
    (actual) => expect(fogSafeDistrictControl(actual, true)).toBe(actual),
  );

  it('sealed City rows expose map geography but no rival status, business count, or summary count', () => {
    const s = state();
    rivalCapture(s, HIDDEN_A, 'rival-a');
    const rows = fogSafeCityRows(s, () => false);
    const hidden = rows.find((r) => r.id === HIDDEN_A)!;
    expect(hidden).toEqual({
      id: HIDDEN_A,
      name: s.districts.find((d) => d.id === HIDDEN_A)!.name,
      known: false,
      status: 'UNKNOWN',
      bizHeld: null,
      bizTotal: null,
      tag: 'unscouted',
      pip: '?',
    });
    const summary = fogSafeCitySummary(rows);
    expect(summary.rivalKnown).toBe(0);
    expect(summary.unknown).toBeGreaterThan(0);
  });
});

describe('fog-safe rival projections and offense targets', () => {
  it('partial scouting reports only a lower-bound known holding, never the hidden citywide total or HQ', () => {
    const s = state();
    rivalCapture(s, HIDDEN_A, 'rival-a');
    rivalCapture(s, 'district-3', 'rival-a');
    s.rivals[0].hqIntegrity = 19;
    const eyes = vis({ districtScouted: (id) => id === HIDDEN_A });

    const row = fogSafeRivalRows(s, eyes).find((r) => r.familyId === 'rival-a')!;
    expect(row.name).toBe(SECRET_A);
    expect(row.knownHeld).toBe(1);
    expect(row.exact).toBe(false);
    expect(row.line).toContain('≥1 scouted blk');
    expect(row.line).not.toContain('2 blk');
    expect(row.line).not.toContain('HQ 19%');
  });

  it('legitimate contact sources reveal a rival; sealed live state does not', () => {
    const s = state();
    const unit = spawnEnforcer('rival-eye-test', 70, 71, 'rival-a');
    s.units.push(unit);

    expect(rivalKnownToPlayer(s, 'rival-a', vis())).toBe(false);
    expect(rivalKnownToPlayer(s, 'rival-a', vis({ unitVisible: (p) => p === unit.pos }))).toBe(true);
    expect(rivalKnownToPlayer(s, 'rival-a', vis({ hqVisible: (id) => id === 'rival-a' }))).toBe(true);
    expect(rivalKnownToPlayer(s, 'rival-a', vis({ dossierSubjects: new Set(['rival-a']) }))).toBe(true);
    expect(rivalCurrentlyObservable(s, 'rival-a', vis({ dossierSubjects: new Set(['rival-a']) }))).toBe(false);

    rivalCapture(s, HIDDEN_A, 'rival-a');
    expect(rivalKnownToPlayer(s, 'rival-a', vis({ districtScouted: (id) => id === HIDDEN_A }))).toBe(true);
  });

  it('hidden rival holdings and rackets cannot arm RAID, SABOTAGE, ASSASSINATE, or LOCKOUT targeting', () => {
    const s = state();
    rivalCapture(s, HIDDEN_A, 'rival-a');
    const secretBusiness = s.districts.find((d) => d.id === HIDDEN_A)!.businesses[0];

    expect(knownOffenseTargets(s, vis())).toEqual({
      raidDistrictId: null,
      sabotageBusinessId: null,
      rivalId: null,
    });

    const eyes = vis({
      districtScouted: (id) => id === HIDDEN_A,
      businessVisible: (id) => id === secretBusiness.id,
    });
    expect(knownOffenseTargets(s, eyes)).toEqual({
      raidDistrictId: HIDDEN_A,
      sabotageBusinessId: secretBusiness.id,
      rivalId: 'rival-a',
    });
  });

  it('an aged dossier identifies a rival but cannot arm live actions or disclose an off-screen death', () => {
    const s = state();
    rivalCapture(s, HIDDEN_A, 'rival-a');
    const dossier = vis({ dossierSubjects: new Set(['rival-a']) });
    expect(knownOffenseTargets(s, dossier)).toEqual({
      raidDistrictId: null,
      sabotageBusinessId: null,
      rivalId: null,
    });
    const dead = structuredClone(s);
    dead.rivals[0].alive = false;
    expect(projection(dead, dossier)).toEqual(projection(s, dossier));
  });
});
