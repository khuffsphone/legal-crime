import { describe, it, expect } from 'vitest';
import {
  recordIncident,
  harvestIncidents,
  isLedgerKind,
  recentIncidents,
  incidentsByType,
  lastIncident,
  incidentCount,
  INCIDENT_CAP,
} from '../src/sim/ledger';
import { updateAndObserve } from '../src/sim/realtime';
import { createInitialState } from '../src/sim/state';
import {
  startCollectorRun,
  buildMapLayout,
  processCollectorArrivals,
} from '../src/sim/mapEconomy';
import { spawnEnforcer } from '../src/sim/movement';
import { FED_WARN_TIER_3 } from '../src/sim/constants';
import type { GameState } from '../src/sim/types';

function seeded(take = 300): GameState {
  const s = createInitialState(1);
  const front = s.districts[0].businesses[0];
  front.extortedBy = 'player';
  front.uncollected = take;
  return s;
}

describe('recordIncident — pure append with monotonic seq', () => {
  it('appends a correct record and does NOT mutate the original state', () => {
    const s0 = createInitialState(1);
    const s1 = recordIncident(s0, { type: 'deposit', severity: 'gain', summary: 'Banked $100', data: { banked: 100 } });

    expect(s0.incidents).toEqual([]); // original untouched (pure)
    expect(s0.incidentSeq).toBe(0);
    expect(s1.incidents).toHaveLength(1);
    expect(s1.incidents[0]).toEqual({ seq: 0, week: 0, type: 'deposit', severity: 'gain', summary: 'Banked $100', data: { banked: 100 } });
    expect(s1.incidentSeq).toBe(1);
  });

  it('keeps sequence numbers monotonic across many records', () => {
    let s = createInitialState(1);
    for (let i = 0; i < 5; i++) s = recordIncident(s, { type: 'settlement', severity: 'info', summary: `w${i}` });
    expect(s.incidents.map((r) => r.seq)).toEqual([0, 1, 2, 3, 4]);
    expect(s.incidentSeq).toBe(5);
    expect(lastIncident(s)?.summary).toBe('w4');
  });

  it('uses state.tick as the default week and honors an explicit week', () => {
    const s0 = createInitialState(1);
    s0.tick = 7;
    expect(recordIncident(s0, { type: 'shock', severity: 'warning', summary: 'x' }).incidents[0].week).toBe(7);
    expect(recordIncident(s0, { type: 'shock', severity: 'warning', summary: 'x', week: 3 }).incidents[0].week).toBe(3);
  });
});

describe('incident cap — bounded memory, stable identity', () => {
  it('keeps only the last INCIDENT_CAP records but seq keeps climbing', () => {
    let s = createInitialState(1);
    const total = INCIDENT_CAP + 25;
    for (let i = 0; i < total; i++) s = recordIncident(s, { type: 'settlement', severity: 'info', summary: `#${i}` });
    expect(s.incidents).toHaveLength(INCIDENT_CAP);
    expect(s.incidentSeq).toBe(total); // monotonic counter unaffected by the cap
    // Oldest dropped: the first retained record is #25 with seq 25.
    expect(s.incidents[0].seq).toBe(total - INCIDENT_CAP);
    expect(lastIncident(s)?.seq).toBe(total - 1);
  });
});

describe('selectors', () => {
  it('recentIncidents returns the last N newest-first; incidentsByType filters; counts', () => {
    let s = createInitialState(1);
    s = recordIncident(s, { type: 'deposit', severity: 'gain', summary: 'a' });
    s = recordIncident(s, { type: 'robbery', severity: 'danger', summary: 'b' });
    s = recordIncident(s, { type: 'deposit', severity: 'gain', summary: 'c' });

    expect(recentIncidents(s, 2).map((r) => r.summary)).toEqual(['c', 'b']); // newest first
    expect(recentIncidents(s, 0)).toEqual([]);
    expect(incidentsByType(s, 'deposit').map((r) => r.summary)).toEqual(['a', 'c']);
    expect(incidentCount(s)).toBe(3);
    expect(incidentCount(s, 'robbery')).toBe(1);
  });

  it('lastIncident is undefined on a fresh state', () => {
    expect(lastIncident(createInitialState(1))).toBeUndefined();
  });
});

describe('harvestIncidents — projects the existing log, idempotently', () => {
  it('projects only curated kinds and advances the cursor (no re-projection)', () => {
    const s0 = createInitialState(1);
    s0.log.push({ tick: 0, kind: 'collector-dispatched', message: 'sent', data: { carrying: 300 } });
    s0.log.push({ tick: 0, kind: 'economy', message: 'noise', data: {} }); // NOT curated -> ignored
    s0.log.push({ tick: 1, kind: 'interception', message: 'robbed!', data: { amount: 300 } });

    const s1 = harvestIncidents(s0);
    expect(s1.incidents.map((r) => r.type)).toEqual(['collector_run', 'robbery']);
    expect(s1.incidents[1]).toMatchObject({ type: 'robbery', severity: 'danger', summary: 'robbed!', week: 1 });
    expect(s1.incidentLogCursor).toBe(3);
    expect(s0.incidents).toEqual([]); // pure

    // Harvesting again projects nothing new.
    const s2 = harvestIncidents(s1);
    expect(s2.incidents).toHaveLength(2);
    expect(s2.incidentLogCursor).toBe(3);
  });

  it('isLedgerKind flags curated vs ignored kinds', () => {
    expect(isLedgerKind('interception')).toBe(true);
    expect(isLedgerKind('collector-deposit')).toBe(true);
    expect(isLedgerKind('economy')).toBe(false);
  });
});

describe('updateAndObserve — real events produce the expected records', () => {
  it('records a robbery with the stolen amount when a collector is ambushed in transit', () => {
    const s = seeded(300);
    const layout = buildMapLayout(s);
    const c = startCollectorRun(s, layout, 'player', 'district-0').unit!;
    s.units.push(spawnEnforcer('gun', c.pos.gx, c.pos.gy, 'rival-a'));

    const { result, state } = updateAndObserve(s, 0.01, 1000);
    expect(result.interceptions).toHaveLength(1);
    const robbery = incidentsByType(state, 'robbery');
    expect(robbery).toHaveLength(1);
    expect(robbery[0].severity).toBe('danger');
    expect(robbery[0].data).toMatchObject({ amount: 300, attackerFaction: 'rival-a' });
    // The dispatch was also captured.
    expect(incidentCount(state, 'collector_run')).toBe(1);
  });

  it('records a deposit when a collector banks at HQ', () => {
    const s = seeded(300);
    const layout = buildMapLayout(s);
    const c = startCollectorRun(s, layout, 'player', 'district-0').unit!;
    c.pos = { ...layout.hqTiles['player'] };
    c.path = [];
    processCollectorArrivals(s, layout); // logs 'collector-deposit'

    const after = harvestIncidents(s);
    const deposits = incidentsByType(after, 'deposit');
    expect(deposits).toHaveLength(1);
    expect(deposits[0].severity).toBe('gain');
  });

  it('records a weekly settlement summary with player deltas when a week fires', () => {
    const s = seeded(0);
    let cur = s;
    let fired = 0;
    for (let i = 0; i < 3 && fired === 0; i++) {
      const obs = updateAndObserve(cur, 1, 1); // 1s weeks -> fires immediately
      cur = obs.state;
      fired += obs.result.weeksFired;
    }
    expect(fired).toBeGreaterThanOrEqual(1);
    const settlements = incidentsByType(cur, 'settlement');
    expect(settlements.length).toBeGreaterThanOrEqual(1);
    expect(settlements[0].summary).toMatch(/Week \d+ settled/);
    expect(settlements[0].data).toHaveProperty('exposureDelta');
  });

  it('records a federal warning when the player crosses the imminent tier under the driver', () => {
    const s = createInitialState(1);
    s.player.heat = FED_WARN_TIER_3 + 5; // exposure into the imminent band
    s.player.dirtyCash = 1000;
    s.player.cash = 1000;
    const obs = updateAndObserve(s, 1, 1); // fire a week -> resolveFederalWarnings logs 'fed-warning'
    expect(obs.result.weeksFired).toBeGreaterThanOrEqual(1);
    const warnings = incidentsByType(obs.state, 'federal_warning');
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].severity).toBe('warning');
  });

  it('is deterministic under fixed dt + seed', () => {
    const run = () => {
      let cur = seeded(0);
      for (let i = 0; i < 4; i++) cur = updateAndObserve(cur, 1, 1).state;
      return cur.incidents;
    };
    expect(run()).toEqual(run());
  });
});
