// Lane E — WIN-PATH VARIETY. The four telegraphed victory conditions + the end-of-match report the
// victory newspaper prints. Pure & seeded; /src/sim stays Phaser-free and tick/applyCommand is
// untouched (these only READ state). Conditions agree with the canon evaluateEndgame resolution.

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { evaluateEndgame, eliminateFamily } from '../src/sim/endgame';
import {
  victoryConditions, victoryStage, leadingVictory, imminentVictory, victoryReport,
  lastStandingCondition, dominanceCondition,
} from '../src/sim/victory';
import {
  GO_STRAIGHT_TARGET, MAYOR_CITYHALL_REQ, MAYOR_INFLUENCE_REQ, TURF_DOMINANCE,
} from '../src/sim/constants';
import type { GameState } from '../src/sim/types';

function big(seed = 1): GameState { return createInitialState(seed, { startingCrew: true, tutorialFreeRuns: 1, bigCity: true }); }
function hold(s: GameState, id: string, fid: string, pts = 60): void { s.districts.find((d) => d.id === id)!.control[fid] = pts; }
function extortFronts(s: GameState, n: number): void {
  let c = 0;
  for (const b of s.districts[0].businesses) { if (b.kind === 'front' && c < n) { b.extortedBy = 'player'; c++; } }
}

describe('the four telegraphed victory conditions', () => {
  it('exposes exactly four conditions in a stable order, each with pct + label + advances', () => {
    const ids = victoryConditions(big()).map((c) => c.id);
    expect(ids).toEqual(['last-standing', 'dominance', 'go-straight', 'mayor']);
    for (const c of victoryConditions(big())) {
      expect(c.pct).toBeGreaterThanOrEqual(0);
      expect(c.pct).toBeLessThanOrEqual(100);
      expect(c.label.length).toBeGreaterThan(2);
      expect(c.advances.length).toBeGreaterThan(8);
      expect(c.read.length).toBeGreaterThan(4);
    }
  });

  it('each condition resolves to the matching canon EndKind (the paper agrees with the sim)', () => {
    expect(victoryConditions(big()).map((c) => c.endKind))
      .toEqual(['win-last-standing', 'win-dominance', 'win-go-straight', 'win-mayor']);
  });

  it('victoryStage telegraphs dormant → building → closing → imminent → won by band', () => {
    expect(victoryStage(0)).toBe('dormant');
    expect(victoryStage(1)).toBe('building');
    expect(victoryStage(49)).toBe('building');
    expect(victoryStage(50)).toBe('closing');
    expect(victoryStage(79)).toBe('closing');
    expect(victoryStage(80)).toBe('imminent');
    expect(victoryStage(99)).toBe('imminent');
    expect(victoryStage(100)).toBe('won');
  });
});

describe('LAST STANDING and DOMINANCE telegraph the two force-win triggers separately', () => {
  it('LAST STANDING tracks the share of rivals eliminated and wins when the board clears', () => {
    const s = big();
    expect(lastStandingCondition(s).pct).toBe(0);
    const live = s.rivals.filter((r) => r.alive);
    eliminateFamily(s, live[0], 'test');
    expect(lastStandingCondition(s).pct).toBe(Math.round((1 / s.rivals.length) * 100));
    for (const r of s.rivals) if (r.alive) eliminateFamily(s, r, 'test');
    expect(lastStandingCondition(s).pct).toBe(100);
    expect(lastStandingCondition(s).stage).toBe('won');
  });

  it('DOMINANCE tracks held blocks toward the threshold, separate from last-standing', () => {
    const s = big();
    expect(dominanceCondition(s).pct).toBe(0);
    const need = Math.ceil(TURF_DOMINANCE * s.districts.length); // 6 of 9
    for (let i = 0; i < need; i++) hold(s, `district-${i}`, 'player', 60);
    expect(dominanceCondition(s).pct).toBe(100);
    // dominance is full but every rival is still alive → last-standing is still 0.
    expect(lastStandingCondition(s).pct).toBe(0);
  });
});

describe('leading + imminent telegraph', () => {
  it('leadingVictory names the closest condition', () => {
    const s = big();
    s.player.cash = GO_STRAIGHT_TARGET; s.player.dirtyCash = 0; // clean = target → go-straight 100%
    expect(leadingVictory(s).id).toBe('go-straight');
  });

  it('imminentVictory fires only on the brink (≥80%, <100%), else null', () => {
    const s = big();
    expect(imminentVictory(s)).toBeNull();
    const total = s.districts.length;
    const need = Math.ceil(TURF_DOMINANCE * total); // full dominance = 6
    for (let i = 0; i < need - 1; i++) hold(s, `district-${i}`, 'player', 60); // 5/9 → 83% of threshold
    const im = imminentVictory(s);
    expect(im?.id).toBe('dominance');
    expect(im!.stage).toBe('imminent');
    hold(s, `district-${need - 1}`, 'player', 60); // tip to 100% → no longer "imminent"
    expect(imminentVictory(s)).toBeNull();
  });
});

describe('victoryReport — the newspaper model', () => {
  it('mid-match: no result, names the race and ranks the closest path first', () => {
    const s = big();
    hold(s, 'district-0', 'player', 60); hold(s, 'district-1', 'player', 60);
    const r = victoryReport(s);
    expect(r.outcome).toBe('playing');
    expect(r.won).toBe(false);
    expect(r.kind).toBeNull();
    expect(r.standing).toHaveLength(4);
    // sorted closest-first
    for (let i = 1; i < r.standing.length; i++) expect(r.standing[i - 1].pct).toBeGreaterThanOrEqual(r.standing[i].pct);
    expect(r.standing[0].id).toBe('dominance');
    expect(r.kicker).toContain('DOMINANCE');
  });

  it('a DOMINANCE win: headline + kicker come from the achieved condition, kind from the log', () => {
    const s = big();
    for (let i = 0; i < Math.ceil(TURF_DOMINANCE * s.districts.length); i++) hold(s, `district-${i}`, 'player', 60);
    expect(evaluateEndgame(s)?.kind).toBe('win-dominance');
    const r = victoryReport(s);
    expect(r.won).toBe(true);
    expect(r.kind).toBe('win-dominance');
    expect(r.achievedId).toBe('dominance');
    expect(r.headline).toBe('THE CITY IS YOURS');
    expect(r.week).toBe(s.tick);
    expect(r.byTheNumbers.length).toBeGreaterThanOrEqual(4);
  });

  it('a GO STRAIGHT win names that path and surfaces a runner-up that is not the winner', () => {
    const s = big();
    extortFronts(s, 3);
    s.player.cash = GO_STRAIGHT_TARGET; s.player.dirtyCash = 0;
    // also give a little dominance so a real runner-up exists
    hold(s, 'district-0', 'player', 60);
    expect(evaluateEndgame(s)?.kind).toBe('win-go-straight');
    const r = victoryReport(s);
    expect(r.achievedId).toBe('go-straight');
    expect(r.headline).toBe('YOU WENT STRAIGHT');
    expect(r.runnerUp?.id).not.toBe('go-straight');
  });

  it('a MAYOR win is reported with the City Hall masthead', () => {
    const s = big();
    s.player.cash = 100; s.player.dirtyCash = 0;
    s.player.bribes.politicians = MAYOR_CITYHALL_REQ;
    s.player.influence = MAYOR_INFLUENCE_REQ;
    expect(evaluateEndgame(s)?.kind).toBe('win-mayor');
    const r = victoryReport(s);
    expect(r.achievedId).toBe('mayor');
    expect(r.headline).toBe('MR. MAYOR');
  });

  it('an HQ loss reports a defeat masthead and a runner-up from the nearest path', () => {
    const s = big();
    hold(s, 'district-0', 'player', 60); // some progress to rank
    s.player.hqIntegrity = 0;
    expect(evaluateEndgame(s)?.status).toBe('lost');
    const r = victoryReport(s);
    expect(r.won).toBe(false);
    expect(r.outcome).toBe('lost');
    expect(r.kind).toBe('lose-hq');
    expect(r.headline).toBe('THE CITY TOOK YOU');
    expect(r.achievedId).toBeNull();
    expect(r.dek.length).toBeGreaterThan(4);
  });
});
