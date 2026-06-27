// Lane L — RUN STATS. The per-run counters accumulated through a match and surfaced at endgame to enrich
// Lane E's victory newspaper. Pure & seeded; /src/sim stays Phaser-free (adapter.test.ts enforces it) and
// tick()/applyCommand() are untouched — observeRun only READS state. The EVENT records accumulate discrete
// inflows; the STATE observes are monotonic + idempotent (a max/latest-value, never a blind increment).

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { eliminateFamily } from '../src/sim/endgame';
import {
  createRunStats,
  ensureRunStats,
  recordFundsBanked,
  recordIncomeEarned,
  recordBribePaid,
  recordRacketRun,
  observeRun,
  runStatsSummary,
} from '../src/sim/runStats';
import type { GameState } from '../src/sim/types';

function big(seed = 1): GameState { return createInitialState(seed, { startingCrew: true, bigCity: true }); }
function hold(s: GameState, id: string, fid: string, pts = 60): void { s.districts.find((d) => d.id === id)!.control[fid] = pts; }

describe('createRunStats — a fresh, zeroed tally', () => {
  it('starts every counter at zero, with all four bribe channels present', () => {
    const st = createRunStats();
    expect(st.fundsBanked).toBe(0);
    expect(st.incomeEarned).toBe(0);
    expect(st.districtsPeak).toBe(0);
    expect(st.districtsFinal).toBe(0);
    expect(st.rivalsDefeated).toBe(0);
    expect(st.bribesTotal).toBe(0);
    expect(st.federalHeatPeak).toBe(0);
    expect(st.weeksSurvived).toBe(0);
    expect(st.racketsRun).toBe(0);
    expect(st.bribesByChannel).toEqual({ police: 0, judges: 0, politicians: 0, feds: 0 });
  });
});

describe('ensureRunStats — additive, default-absent attachment', () => {
  it('createInitialState carries NO tally until the scene asks for one', () => {
    expect(big().runStats).toBeUndefined();
  });

  it('lazily attaches a tally to the state and returns the SAME object on repeat calls', () => {
    const s = big();
    const a = ensureRunStats(s);
    expect(s.runStats).toBe(a);
    const b = ensureRunStats(s);
    expect(b).toBe(a); // never replaces an existing tally
  });
});

describe('EVENT records — discrete inflows accumulate, non-positive amounts are ignored', () => {
  it('recordFundsBanked sums positive deposits and ignores zero / negative', () => {
    const st = createRunStats();
    recordFundsBanked(st, 400);
    recordFundsBanked(st, 250);
    recordFundsBanked(st, 0);
    recordFundsBanked(st, -100);
    expect(st.fundsBanked).toBe(650);
  });

  it('recordIncomeEarned books gross weekly income, ignoring non-positive', () => {
    const st = createRunStats();
    recordIncomeEarned(st, 1200);
    recordIncomeEarned(st, 800);
    recordIncomeEarned(st, -5);
    expect(st.incomeEarned).toBe(2000);
  });

  it('recordBribePaid tracks per-channel and the grand total', () => {
    const st = createRunStats();
    recordBribePaid(st, 'police', 10);
    recordBribePaid(st, 'police', 10);
    recordBribePaid(st, 'judges', 30);
    recordBribePaid(st, 'feds', 0); // ignored
    expect(st.bribesByChannel.police).toBe(20);
    expect(st.bribesByChannel.judges).toBe(30);
    expect(st.bribesByChannel.feds).toBe(0);
    expect(st.bribesTotal).toBe(50);
  });

  it('recordRacketRun counts rackets brought online (default +1)', () => {
    const st = createRunStats();
    recordRacketRun(st);
    recordRacketRun(st);
    recordRacketRun(st, 3);
    recordRacketRun(st, 0); // ignored
    expect(st.racketsRun).toBe(5);
  });
});

describe('observeRun — monotonic, idempotent state sampling', () => {
  it('captures turf PEAK while tracking the FINAL hold as it changes', () => {
    const s = big();
    const st = ensureRunStats(s);
    hold(s, 'district-0', 'player'); hold(s, 'district-1', 'player'); hold(s, 'district-3', 'player');
    observeRun(st, s);
    expect(st.districtsPeak).toBe(3);
    expect(st.districtsFinal).toBe(3);
    // lose two blocks — PEAK holds, FINAL drops.
    s.districts.find((d) => d.id === 'district-1')!.control.player = 0;
    s.districts.find((d) => d.id === 'district-3')!.control.player = 0;
    observeRun(st, s);
    expect(st.districtsPeak).toBe(3);
    expect(st.districtsFinal).toBe(1);
  });

  it('counts rivals defeated (any cause) and never decreases', () => {
    const s = big();
    const st = ensureRunStats(s);
    observeRun(st, s);
    expect(st.rivalsDefeated).toBe(0);
    eliminateFamily(s, s.rivals[0], 'test');
    observeRun(st, s);
    expect(st.rivalsDefeated).toBe(1);
    observeRun(st, s); // idempotent — re-observing the same board does not double-count
    expect(st.rivalsDefeated).toBe(1);
  });

  it('tracks the federal-heat PEAK and weeks survived as a high-water mark', () => {
    const s = big();
    const st = ensureRunStats(s);
    s.player.heat = 60;
    s.tick = 4;
    observeRun(st, s);
    const peakAfterFirst = st.federalHeatPeak;
    expect(peakAfterFirst).toBeGreaterThan(0);
    expect(st.weeksSurvived).toBe(4);
    // heat cools and we advance — the PEAK stays, weeks climb.
    s.player.heat = 0;
    s.tick = 9;
    observeRun(st, s);
    expect(st.federalHeatPeak).toBe(peakAfterFirst);
    expect(st.weeksSurvived).toBe(9);
  });
});

describe('runStatsSummary — the newspaper block', () => {
  it('returns eight order-stable, non-empty tokens reflecting the tally', () => {
    const st = createRunStats();
    recordFundsBanked(st, 12450);
    recordIncomeEarned(st, 30200);
    recordBribePaid(st, 'police', 340);
    recordRacketRun(st, 7);
    st.districtsPeak = 6;
    st.rivalsDefeated = 2;
    st.federalHeatPeak = 82;
    st.weeksSurvived = 14;
    const lines = runStatsSummary(st);
    expect(lines).toHaveLength(8);
    for (const l of lines) expect(l.length).toBeGreaterThan(2);
    expect(lines[0]).toBe('FUNDS $12,450');   // thousands separator, whole dollars
    expect(lines[1]).toBe('INCOME $30,200');
    expect(lines[2]).toBe('PEAK 6 BLOCKS');
    expect(lines[3]).toBe('RIVALS 2 DOWN');
    expect(lines[4]).toBe('RACKETS 7');
    expect(lines[5]).toBe('TOP HEAT 82');
    expect(lines[6]).toBe('GREASED $340');
    expect(lines[7]).toBe('14 WEEKS');
  });

  it('singularises a one-block / one-week run', () => {
    const st = createRunStats();
    st.districtsPeak = 1;
    st.weeksSurvived = 1;
    const lines = runStatsSummary(st);
    expect(lines[2]).toBe('PEAK 1 BLOCK');
    expect(lines[7]).toBe('1 WEEK');
  });
});
