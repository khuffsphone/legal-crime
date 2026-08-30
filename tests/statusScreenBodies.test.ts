// STATUS UI — Phase 1: the NO-X-RAY gate for the top-10 screen bodies. Mutation-verified BOTH directions:
// under `sealed` visibility every fog-sensitive field masks to `unknown` (no rival name / cop position /
// unscouted-district detail / located rival incident leaks); under `fullyVisible` the same fields surface.
// SAFE screens (own money / crew / federal ladder) stay fully readable under `sealed` (no over-gating).
// Plus a purity check (builders never mutate state) and a source-scan guard against raw fog reads.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInitialState } from '../src/sim/state';
import { effectiveDecay, raidChance } from '../src/sim/law';
import type { GameState, Business, BeatCop, IncidentRecord } from '../src/sim';
import { fullyVisible, sealed } from '../src/scenes/ui/statusVisibility';
import { buildScreenView } from '../src/scenes/ui/statusScreenBodies';
import type { ScreenView } from '../src/scenes/ui/screenView';

// Distinctive markers so a leak is unambiguous in the serialized view.
const RIVAL_DEN = 'RIVALDEN_SECRET';
const RIVAL_FRONT = 'RIVALFRONT_SECRET';
const RIVAL_INCIDENT = 'RIVALTERRITORY_SECRET';
const RIVAL_BUST = 'RIVALBUST_SECRET';
const RIVAL_SHOCK = 'RIVALSHOCK_SECRET';
const MY_BUST = 'MYBUST_KNOWN';
const MY_DEN = 'MYDEN_OWNED';
const MY_FRONT = 'MYFRONT_OWNED';
const COP_LOC = '55,55';

function fixture(): { state: GameState; rivalDistrictId: string } {
  const s = createInitialState(7, { bigCity: true, startingCrew: true });
  const p = s.player.id;
  const rival = s.rivals[0];
  const dOwn = s.districts[0];
  const dRival = s.districts[s.districts.length - 1];
  // Player HOLDS dOwn (own turf ⇒ scouted); rival holds dRival (unscouted for the player under sealed).
  dOwn.control = { [p]: 100 };
  dRival.control = { [rival.id]: 100 };
  const mk = (over: Partial<Business> & { id: string; name: string; districtId: string }): Business => ({
    kind: 'front', baseIncome: 100, heatPerTick: 1, ...over,
  });
  dOwn.businesses.push(mk({ id: 'b_myfront', name: MY_FRONT, districtId: dOwn.id, kind: 'front', extortedBy: p, uncollected: 50 }));
  dOwn.businesses.push(mk({ id: 'b_myden', name: MY_DEN, districtId: dOwn.id, kind: 'speakeasy', ownerFamily: p, tier: 2 }));
  dRival.businesses.push(mk({ id: 'b_rivalden', name: RIVAL_DEN, districtId: dRival.id, kind: 'speakeasy', ownerFamily: rival.id, tier: 3 }));
  dRival.businesses.push(mk({ id: 'b_rivalfront', name: RIVAL_FRONT, districtId: dRival.id, kind: 'front', extortedBy: rival.id }));
  // A beat cop parked on a specific tile.
  const cop: BeatCop = { id: 'cop-0', pos: { gx: 55, gy: 55 }, path: [], speed: 1.2, homeDistrictId: dRival.id, mode: 'patrol', headingDir: -1, suspicion: 0, loiterSec: 0 };
  s.beatCops = [cop];
  // Incidents: a player-global settlement (always known) + a rival territory grab at the unscouted district.
  const settlement: IncidentRecord = { seq: 1, week: 1, type: 'settlement', severity: 'info', summary: 'weekly settlement', data: { heatDelta: 2, cleanDelta: 300 } };
  const rivalGrab: IncidentRecord = { seq: 2, week: 1, type: 'territory', severity: 'warning', summary: `${RIVAL_INCIDENT} captured a block`, data: { districtId: dRival.id, newHolder: rival.id } };
  // rival-scoped incidents whose TYPE ('bust'/'shock') the sim also emits per-family — must NOT leak via a
  // type allowlist. A player-involved bust (familyId = player) MUST still show.
  const rivalBust: IncidentRecord = { seq: 3, week: 1, type: 'bust', severity: 'danger', summary: `${RIVAL_BUST} boss busted (heat 92)`, data: { familyId: rival.id } };
  const rivalShock: IncidentRecord = { seq: 4, week: 1, type: 'shock', severity: 'warning', summary: `${RIVAL_SHOCK} raid shut a den`, data: { ownerFamily: rival.id } };
  const myBust: IncidentRecord = { seq: 5, week: 1, type: 'bust', severity: 'danger', summary: `${MY_BUST} our boss was busted`, data: { familyId: s.player.id } };
  s.incidents = [settlement, rivalGrab, rivalBust, rivalShock, myBust];
  return { state: s, rivalDistrictId: dRival.id };
}

const json = (v: ScreenView | null): string => JSON.stringify(v);
const build = (id: string, s: GameState, vis: typeof sealed, args = {}): ScreenView => {
  const v = buildScreenView(id, s, vis, args);
  expect(v, `screen ${id} builds`).not.toBeNull();
  return v!;
};

describe('status bodies — NO-X-RAY: fog-sensitive fields mask under `sealed`', () => {
  it('racketOperations hides a rival racket under sealed, shows it under fullyVisible', () => {
    const { state } = fixture();
    const hidden = json(build('racketOperations', state, sealed));
    expect(hidden).toContain(MY_DEN);          // own op always visible
    expect(hidden).not.toContain(RIVAL_DEN);   // rival op masked behind one generic rumor
    expect(hidden).toContain('Unconfirmed activity');
    expect(hidden).not.toMatch(/OPERATIONS \(\d+\)/); // no all-city hidden operation count
    const shown = json(build('racketOperations', state, fullyVisible));
    expect(shown).toContain(RIVAL_DEN);        // scouted ⇒ surfaced (gate works both ways)
  });

  it('frontsExtortion hides a rival-held front under sealed, shows it under fullyVisible', () => {
    const { state } = fixture();
    const hidden = json(build('frontsExtortion', state, sealed));
    expect(hidden).toContain(MY_FRONT);        // own extorted front always visible
    expect(hidden).not.toContain(RIVAL_FRONT); // rival-held front masked
    expect(hidden).toContain('Unconfirmed activity');
    expect(json(build('frontsExtortion', state, fullyVisible))).toContain(RIVAL_FRONT);
  });

  it('controlMap masks an unscouted district + hides cop positions under sealed', () => {
    const { state, rivalDistrictId } = fixture();
    const view = build('controlMap', state, sealed);
    const districtRows = view.sections.find((s) => s.heading === 'DISTRICTS')!.rows;
    const rivalRow = districtRows.find((r) => 'label' in r && r.label === state.districts.find((d) => d.id === rivalDistrictId)!.name)!;
    expect(rivalRow.kind).toBe('unknown');     // unscouted ⇒ unknown row, no owner/pct
    expect(json(view)).not.toContain(COP_LOC); // no cop position leaked
    // fullyVisible: the cop position surfaces (copMarkerVisible gate opens)
    expect(json(build('controlMap', state, fullyVisible))).toContain(COP_LOC);
  });

  it('incidentLedger masks a located rival-territory incident under sealed', () => {
    const { state } = fixture();
    const hidden = json(build('incidentLedger', state, sealed));
    expect(hidden).toContain('weekly settlement');      // player-global incident always shown
    expect(hidden).not.toContain(RIVAL_INCIDENT);       // rival grab at an unscouted block masked
    expect(hidden).toContain('another part of town');
    expect(hidden).not.toMatch(/territory · week/);     // rumor discloses neither hidden type nor week
    expect(json(build('incidentLedger', state, fullyVisible))).toContain(RIVAL_INCIDENT);
  });

  it('the incident TYPE allowlist cannot leak a rival-scoped bust/shock (per-family types are gated)', () => {
    const { state } = fixture();
    const hidden = json(build('incidentLedger', state, sealed));
    expect(hidden).not.toContain(RIVAL_BUST);   // type 'bust' fires for rivals too — must mask
    expect(hidden).not.toContain(RIVAL_SHOCK);  // type 'shock' (audit/speakeasy-raid) names rivals — must mask
    expect(hidden).toContain(MY_BUST);          // the player's OWN bust (familyId = player) still shows
    expect(hidden).toContain('weekly settlement'); // own settlement always shown
  });

  it('one or many hidden incidents produce exactly one identical generic rumor', () => {
    const a = fixture().state;
    const b = fixture().state;
    const rivalId = b.rivals[0].id;
    for (let i = 0; i < 7; i++) {
      b.incidents.push({
        seq: 100 + i,
        week: 900 + i,
        type: i % 2 === 0 ? 'shock' : 'bust',
        severity: 'danger',
        summary: `HIDDEN_EXTRA_${i}`,
        data: { familyId: rivalId },
      });
    }
    const va = build('incidentLedger', a, sealed);
    const vb = build('incidentLedger', b, sealed);
    expect(vb).toEqual(va);
    const rumors = vb.sections.flatMap((section) => section.rows).filter((row) => row.kind === 'unknown');
    expect(rumors).toHaveLength(1);
    expect(json(vb)).not.toMatch(/HIDDEN_EXTRA|90\d/);
  });

  it('hidden business cardinality is not observable in operations or fronts', () => {
    const a = fixture().state;
    const b = fixture().state;
    const district = b.districts[b.districts.length - 1];
    const rivalId = b.rivals[0].id;
    for (let i = 0; i < 5; i++) {
      district.businesses.push({
        id: `hidden-op-${i}`, name: `HIDDEN_OP_${i}`, districtId: district.id,
        kind: 'speakeasy', baseIncome: 100, heatPerTick: 1, ownerFamily: rivalId,
      });
      district.businesses.push({
        id: `hidden-front-${i}`, name: `HIDDEN_FRONT_${i}`, districtId: district.id,
        kind: 'front', baseIncome: 100, heatPerTick: 1, extortedBy: rivalId,
      });
    }
    for (const screen of ['racketOperations', 'frontsExtortion']) {
      const va = build(screen, a, sealed);
      const vb = build(screen, b, sealed);
      expect(vb, `${screen} leaked hidden cardinality`).toEqual(va);
      const rumors = vb.sections.flatMap((section) => section.rows).filter((row) => row.kind === 'unknown');
      expect(rumors).toHaveLength(1);
      expect(json(vb)).not.toMatch(/HIDDEN_OP|HIDDEN_FRONT/);
    }
  });

  it('districtDossier of an unscouted rival district is fully masked under sealed', () => {
    const { state, rivalDistrictId } = fixture();
    const hidden = json(build('districtDossier', state, sealed, { districtId: rivalDistrictId }));
    expect(hidden).not.toContain(RIVAL_DEN);            // no businesses/detail leak
    expect(hidden).toContain('unscouted');
    expect(json(build('districtDossier', state, fullyVisible, { districtId: rivalDistrictId }))).toContain(RIVAL_DEN);
  });

  it('heatBeatMeter hides unscouted district police presence under sealed', () => {
    const { state, rivalDistrictId } = fixture();
    const view = build('heatBeatMeter', state, sealed);
    const dName = state.districts.find((d) => d.id === rivalDistrictId)!.name;
    const rivalRow = view.sections.flatMap((s) => s.rows).find((r) => 'label' in r && r.label === dName)!;
    expect(rivalRow.kind).toBe('unknown'); // police presence of an unscouted district is masked
  });
});

describe('status bodies — SAFE screens stay readable under `sealed` (no over-gating)', () => {
  it('moneyLedger surfaces own cash/income under sealed (own money is not fogged)', () => {
    const { state } = fixture();
    const v = json(build('moneyLedger', state, sealed));
    expect(v).toContain('Clean cash');
    expect(v).toContain('Laundering capacity');
    expect(build('moneyLedger', state, sealed).sections.length).toBeGreaterThan(0);
  });

  it('federalLadder surfaces own exposure/thresholds under sealed', () => {
    const { state } = fixture();
    const v = json(build('federalLadder', state, sealed));
    expect(v).toContain('Federal exposure');
    expect(v).toMatch(/CLEAR|NOTICE|WATCH|RAID/);
  });

  it('Heat / Beat uses The Beat for raid odds and City Hall for cooling, not the total retainer', () => {
    const { state } = fixture();
    state.player.heat = 80;
    state.player.bribes = { police: 10, judges: 50, politicians: 40, feds: 30 };
    state.player.bribeLevel = 130;
    const rows = build('heatBeatMeter', state, sealed).sections.flatMap((section) => section.rows);
    const raid = rows.find((row) => 'label' in row && row.label === 'Raid risk');
    const decay = rows.find((row) => 'label' in row && row.label === 'Weekly decay');
    expect(raid && 'value' in raid ? raid.value : null).toBe(`${Math.round(raidChance(80, 10) * 100)}%`);
    expect(decay && 'value' in decay ? decay.value : null).toBe(`−${Math.round(effectiveDecay(40))}`);
  });

  it('thugRoster lists own crew (unit rows) under sealed', () => {
    const { state } = fixture();
    const view = build('thugRoster', state, sealed);
    const unitRows = view.sections.flatMap((s) => s.rows).filter((r) => r.kind === 'unit');
    expect(unitRows.length).toBeGreaterThan(0); // startingCrew ⇒ own roster, never fogged
  });

  it('commandDashboard surfaces own summary under sealed', () => {
    const { state } = fixture();
    const v = json(build('commandDashboard', state, sealed));
    expect(v).toContain('Clean cash');
    expect(v).toContain('Control');
  });
});

describe('status bodies — purity + all-10 coverage', () => {
  it('building every top-10 screen never mutates state', () => {
    const { state } = fixture();
    const before = JSON.stringify(state);
    const ids = ['commandDashboard', 'controlMap', 'moneyLedger', 'heatBeatMeter', 'federalLadder',
      'thugRoster', 'racketOperations', 'frontsExtortion', 'incidentLedger', 'districtDossier'];
    for (const id of ids) { build(id, state, sealed); build(id, state, fullyVisible); }
    expect(JSON.stringify(state)).toBe(before);
  });

  it('every top-10 id builds a non-null view; an unknown id returns null', () => {
    const { state } = fixture();
    for (const id of ['commandDashboard', 'controlMap', 'moneyLedger', 'heatBeatMeter', 'federalLadder',
      'thugRoster', 'racketOperations', 'frontsExtortion', 'incidentLedger', 'districtDossier']) {
      expect(buildScreenView(id, state, sealed)).not.toBeNull();
    }
    expect(buildScreenView('notAScreen', state, sealed)).toBeNull();
  });

  it('deterministic: same state + vis ⇒ deep-equal view', () => {
    const { state } = fixture();
    expect(build('controlMap', state, sealed)).toEqual(build('controlMap', state, sealed));
  });
});

describe('status bodies — NO-X-RAY source guard', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'scenes', 'ui', 'statusScreenBodies.ts'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // strip comments

  it('never reads the raw rival list or raw ownership fields to surface a value', () => {
    expect(code, 'reads raw state.rivals').not.toMatch(/\.rivals\b/);
    expect(code, 'reads raw .ownerFamily').not.toMatch(/\.ownerFamily\b/);
    expect(code, 'reads raw .extortedBy').not.toMatch(/\.extortedBy\b/);
  });

  it('every raw beatCops access is gated by vis.copVisible in the same statement', () => {
    for (const line of code.split('\n')) {
      if (line.includes('.beatCops')) expect(line, `ungated cop read: ${line.trim()}`).toContain('vis.copVisible');
    }
  });

  it('imports the visibility funnel and exercises all four fog gates', () => {
    expect(code).toMatch(/from '\.\/statusVisibility'/);
    for (const gate of ['vis.businessVisible', 'vis.copVisible', 'vis.districtScouted']) {
      expect(code, `missing gate ${gate}`).toContain(gate);
    }
  });
});
