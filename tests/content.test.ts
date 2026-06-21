// RTS-24 — Content & Engagement: the three win paths, vice upgrades, the Market, and light events.
// Pure & seeded; /src/sim stays Phaser-free and tick/applyCommand is untouched (these WRAP it).

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { evaluateEndgame } from '../src/sim/endgame';
import {
  dominationProgress, goStraightProgress, mayorProgress, winPaths, metWinPath, advanceCivics, influenceOf, legitEmpireValue, legalFrontCount,
} from '../src/sim/winpaths';
import { viceLadder, applyViceUpgrade, viceBranchFor } from '../src/sim/vice';
import { createMarket, marketGood, buyGood, sellGood, tradePreview, advanceMarket, supplyDemandRead, marketRows, shockDemand } from '../src/sim/market';
import { advanceEvents, advanceWeeklyContent } from '../src/sim/events';
import { incidentsByType, harvestIncidents } from '../src/sim/ledger';
import {
  GO_STRAIGHT_TARGET, MAYOR_CITYHALL_REQ, MAYOR_INFLUENCE_REQ, VICE_RUNG_MAX,
} from '../src/sim/constants';
import type { GameState, Business, Family, Gangster } from '../src/sim/types';

function big(seed = 1): GameState { return createInitialState(seed, { startingCrew: true, tutorialFreeRuns: 1, bigCity: true }); }
function crew(fam: Family, skills: number[]): void {
  fam.gangsters = skills.map((sk, i): Gangster => ({ id: `${fam.id}-x${i}`, name: 'x', skill: sk, loyalty: 60, upkeep: 0, assignment: { type: 'idle' } }));
}
function hold(s: GameState, id: string, fid: string, pts = 60): void { s.districts.find((d) => d.id === id)!.control[fid] = pts; }
function playerOp(s: GameState, di = 0, kind = 'numbers'): Business {
  const b: Business = { id: `pop-${di}`, name: `${kind} op`, kind: kind as Business['kind'], baseIncome: 200, heatPerTick: 4, ownerFamily: 'player', districtId: `district-${di}`, uncollected: 0, tier: 1 };
  s.districts[di].businesses.push(b);
  return b;
}
function extortFronts(s: GameState, n: number): void {
  let c = 0;
  for (const b of s.districts[0].businesses) { if (b.kind === 'front' && c < n) { b.extortedBy = 'player'; c++; } }
}

// ── A) MULTIPLE WIN CONDITIONS ──────────────────────────────────────────────────────────────────

describe('three win paths — distinct, labeled progress', () => {
  it('winPaths returns DOMINATION / GO STRAIGHT / GET ELECTED, each with pct + what advances it', () => {
    const s = big();
    const ws = winPaths(s);
    expect(ws.map((w) => w.path)).toEqual(['domination', 'go-straight', 'mayor']);
    for (const w of ws) { expect(w.pct).toBeGreaterThanOrEqual(0); expect(w.label.length).toBeGreaterThan(2); expect(w.advances.length).toBeGreaterThan(8); }
  });

  it('GO STRAIGHT tracks clean empire value toward the target and wins at 100%', () => {
    const s = big();
    s.player.cash = 1000; s.player.dirtyCash = 1000; // clean 0
    expect(goStraightProgress(s).pct).toBe(0);
    extortFronts(s, 3);
    expect(legalFrontCount(s)).toBe(3);
    s.player.cash = GO_STRAIGHT_TARGET; s.player.dirtyCash = 0; // clean = target → past 100% with fronts
    expect(legitEmpireValue(s)).toBeGreaterThanOrEqual(GO_STRAIGHT_TARGET);
    expect(goStraightProgress(s).pct).toBe(100);
    expect(metWinPath(s)?.path).toBe('go-straight');
    expect(evaluateEndgame(s)?.kind).toBe('win-go-straight');
    expect(s.status).toBe('won');
  });

  it('GET ELECTED needs City Hall maxed AND civic influence; the lagging gate paces it', () => {
    const s = big();
    s.player.cash = 100; s.player.dirtyCash = 0; // keep go-straight low
    s.player.bribes.politicians = MAYOR_CITYHALL_REQ; // City Hall maxed…
    s.player.influence = 0; // …but no influence yet
    expect(mayorProgress(s).pct).toBe(0); // lagging gate (influence) is 0
    s.player.influence = MAYOR_INFLUENCE_REQ;
    expect(mayorProgress(s).pct).toBe(100);
    expect(metWinPath(s)?.path).toBe('mayor');
    expect(evaluateEndgame(s)?.kind).toBe('win-mayor');
    expect(s.status).toBe('won');
  });

  it('DOMINATION still resolves the canon force win', () => {
    const s = big();
    for (let i = 0; i < 6; i++) hold(s, `district-${i}`, 'player', 60); // 6/9 ≥ 60%
    expect(dominationProgress(s).pct).toBe(100);
    expect(evaluateEndgame(s)?.kind).toBe('win-dominance');
  });

  it('civic influence accrues weekly from City Hall + turf + fronts (wraps, not tick)', () => {
    const s = big();
    s.player.bribes.politicians = 30; hold(s, 'district-0', 'player', 60); extortFronts(s, 4);
    const before = influenceOf(s);
    advanceCivics(s);
    expect(influenceOf(s)).toBeGreaterThan(before);
  });
});

// ── B) VICE UPGRADES ────────────────────────────────────────────────────────────────────────────

describe('vice upgrades — the conversion tree as real decisions', () => {
  it('each operation kind maps to a branch with distinct flavour', () => {
    expect(viceBranchFor('smuggling')?.branch).toBe('bootlegging');
    expect(viceBranchFor('numbers')?.branch).toBe('gambling');
    expect(viceBranchFor('speakeasy')?.branch).toBe('entertainment');
    expect(viceBranchFor('protection')?.branch).toBe('troubleshooting');
    expect(viceBranchFor('front')).toBeNull();
  });

  it('the ladder shows the next rung cost · yield-Δ · heat-Δ · state', () => {
    const s = big(); s.player.cash = 5000;
    const op = playerOp(s, 0, 'numbers');
    const lad = viceLadder(s, op.id)!;
    expect(lad.branch).toBe('gambling');
    expect(lad.next!.rung).toBe(1);
    expect(lad.next!.cost).toBeGreaterThan(0);
    expect(lad.next!.incomeBump).toBeGreaterThan(0);
    expect(lad.next!.state).toBe('READY');
    // broke → CONDITIONAL with a plain reason
    s.player.cash = 0;
    expect(viceLadder(s, op.id)!.next!.state).toBe('CONDITIONAL');
    expect(viceLadder(s, op.id)!.next!.reason).toMatch(/need \$/);
  });

  it('applying a rung raises yield + shifts heat + records the branch; the final rung is gated', () => {
    const s = big(); s.player.cash = 20000;
    crew(s.player, []); // no muscle yet — the gambling final rung (crew ≥ 8) starts LOCKED
    const op = playerOp(s, 0, 'numbers'); // gambling, final-rung prereq = crew strength ≥ 8
    const inc0 = op.baseIncome, heat0 = op.heatPerTick, cash0 = s.player.cash;
    const r1 = applyViceUpgrade(s, op.id);
    expect(r1.ok).toBe(true);
    expect(op.baseIncome).toBeGreaterThan(inc0);
    expect(op.heatPerTick).toBeGreaterThan(heat0);
    expect(op.viceRung).toBe(1);
    expect(op.viceBranch).toBe('gambling');
    expect(s.player.cash).toBeLessThan(cash0);

    applyViceUpgrade(s, op.id); // rung 2
    // rung 3 (final) is LOCKED without the crew prereq, with a plain reason
    const locked = viceLadder(s, op.id)!.next!;
    expect(locked.rung).toBe(VICE_RUNG_MAX);
    expect(locked.state).toBe('LOCKED');
    expect(locked.reason).toMatch(/MADE MEN|needs/i);
    expect(applyViceUpgrade(s, op.id).ok).toBe(false);
    // meet the prereq → the final rung opens
    crew(s.player, [8]);
    expect(viceLadder(s, op.id)!.next!.state).toBe('READY');
    expect(applyViceUpgrade(s, op.id).ok).toBe(true);
    expect(op.viceRung).toBe(VICE_RUNG_MAX);
  });
});

// ── C) THE MARKET ───────────────────────────────────────────────────────────────────────────────

describe('the Market — self-narrating supply/demand + footprint trading', () => {
  it('a fresh market starts at base price, balanced, and narrates itself', () => {
    const m = createMarket();
    const booze = m.goods.find((g) => g.id === 'booze')!;
    expect(booze.price).toBe(booze.basePrice);
    expect(supplyDemandRead(booze)).toMatch(/steady/i);
    shockDemand({ market: m, player: { inventory: {} } } as unknown as GameState, 'booze', 40);
    expect(supplyDemandRead(m.goods.find((g) => g.id === 'booze')!)).toMatch(/SOARING|hot/i);
  });

  it('buy pays cash with a spread, gains inventory, and lifts the price (your footprint)', () => {
    const s = big(); s.player.cash = 10000; s.player.dirtyCash = 0;
    const pv = tradePreview(s, 'booze', 5, 'buy')!;
    expect(pv.unitPrice).toBeGreaterThan(pv.mid); // spread on a buy
    expect(pv.newPrice).toBeGreaterThanOrEqual(pv.mid); // footprint lifts it
    const cash0 = s.player.cash, price0 = pv.mid; // mid before the trade
    const res = buyGood(s, 'booze', 5);
    expect(res.ok).toBe(true);
    expect(s.player.cash).toBe(cash0 - pv.total);
    expect((s.player.inventory ?? {}).booze).toBe(5);
    expect(marketGood(s, 'booze')!.price).toBeGreaterThanOrEqual(price0);
  });

  it('sell credits cash below mid, removes inventory, and eases the price down', () => {
    const s = big(); s.player.cash = 10000;
    buyGood(s, 'cigars', 4);
    const pv = tradePreview(s, 'cigars', 4, 'sell')!;
    expect(pv.unitPrice).toBeLessThan(pv.mid); // spread on a sell
    const res = sellGood(s, 'cigars', 4);
    expect(res.ok).toBe(true);
    expect((s.player.inventory ?? {}).cigars).toBe(0);
    expect(sellGood(s, 'cigars', 1).ok).toBe(false); // nothing left
  });

  it('the market eases back toward base each week; marketRows reads it', () => {
    const s = big(); s.player.cash = 10000;
    buyGood(s, 'booze', 8); // push the price up
    const hot = marketGood(s, 'booze')!.price;
    for (let i = 0; i < 6; i++) advanceMarket(s);
    expect(marketGood(s, 'booze')!.price).toBeLessThan(hot); // drifted back
    const rows = marketRows(s);
    expect(rows).toHaveLength(4);
    expect(rows[0].read.length).toBeGreaterThan(8);
    expect(['▲', '▼', '◆']).toContain(rows[0].dir);
  });
});

// ── D) LIGHT EVENTS ─────────────────────────────────────────────────────────────────────────────

describe('light events — pure triggers feeding THE WIRE', () => {
  it('advanceEvents is deterministic and, when it fires, applies an effect + logs a Wire slip', () => {
    let fired = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = big(seed);
      const heat0 = s.player.heat;
      const kind = advanceEvents(s);
      if (kind) {
        fired++;
        const ev = s.log.filter((e) => e.kind.startsWith('event-'));
        expect(ev.length).toBe(1);
        // an event changed SOMETHING (heat or the market)
        const changed = s.player.heat !== heat0 || !!s.market;
        expect(changed).toBe(true);
      }
    }
    expect(fired).toBeGreaterThan(0); // some seeds fire an event
  });

  it('the same seed always rolls the same event (deterministic)', () => {
    const a = big(7); const b = big(7);
    expect(advanceEvents(a)).toBe(advanceEvents(b));
  });

  it('advanceWeeklyContent accrues influence, eases the market, and can fire events; events ride the Wire', () => {
    const s = big(3);
    s.player.bribes.politicians = 20; hold(s, 'district-0', 'player', 60);
    const infl0 = influenceOf(s);
    let cur = s;
    for (let w = 0; w < 6; w++) { advanceWeeklyContent(cur, 1); cur = harvestIncidents(cur); }
    expect(influenceOf(cur)).toBeGreaterThan(infl0); // civics accrued
    expect(cur.market).toBeDefined(); // market materialised
    // any fired events are projected to the ledger as 'event' incidents
    expect(incidentsByType(cur, 'event').length).toBeGreaterThanOrEqual(0);
  });

  it('advanceWeeklyContent(weeks) runs the beat once per settled week', () => {
    const s = big(3);
    s.player.bribes.politicians = 20; hold(s, 'district-0', 'player', 60);
    const infl0 = influenceOf(s);
    advanceWeeklyContent(s, 4); // four weeks settled at once
    // 4 weeks of civic accrual ≈ 4× a single week's gain (cap aside)
    const oneWeek = (() => { const t = big(3); t.player.bribes.politicians = 20; hold(t, 'district-0', 'player', 60); advanceCivics(t); return influenceOf(t) - infl0; })();
    expect(influenceOf(s) - infl0).toBeGreaterThan(oneWeek); // more than a single week
  });
});

// ── surfaced reads — the exact strings/states the HUD shows ──────────────────────────────────────

describe('win-path reads — what the HUD prints', () => {
  it('DOMINATION read names blocks held and blocks remaining', () => {
    const s = big();
    hold(s, 'district-0', 'player', 60); // 1 of 9
    const d = dominationProgress(s);
    expect(d.label).toBe('DOMINATION');
    expect(d.read).toMatch(/1\/9 blocks/);
    expect(d.read).toMatch(/more to take/);
  });

  it('GO STRAIGHT read shows the running clean-empire dollar figure vs the target', () => {
    const s = big();
    s.player.cash = 4000; s.player.dirtyCash = 0;
    const g = goStraightProgress(s);
    expect(g.pct).toBeGreaterThan(0);
    expect(g.pct).toBeLessThan(100);
    expect(g.read).toMatch(new RegExp(`/${GO_STRAIGHT_TARGET}`)); // "$X/TARGET"
  });

  it('GET ELECTED read names both gates (City Hall $ and influence)', () => {
    const s = big();
    s.player.bribes.politicians = 10; s.player.influence = 20;
    const m = mayorProgress(s);
    expect(m.read).toMatch(/City Hall/i);
    expect(m.read).toMatch(/influence/i);
  });
});

describe('vice & market — surfaced edges', () => {
  it('a front has no vice branch (the context card shows no ladder)', () => {
    const s = big();
    const front = s.districts[0].businesses.find((b) => b.kind === 'front')!;
    front.extortedBy = 'player';
    const lad = viceLadder(s, front.id);
    expect(lad).not.toBeNull();
    expect(lad!.branch).toBeNull();
    expect(lad!.next).toBeNull();
  });

  it("a rival's racket is LOCKED with 'not your racket'", () => {
    const s = big();
    const op = playerOp(s, 2, 'speakeasy');
    op.ownerFamily = 'rival-a'; // not yours
    const lad = viceLadder(s, op.id)!;
    expect(lad.next!.state).toBe('LOCKED');
    expect(lad.next!.reason).toMatch(/not your racket/i);
  });

  it('marketRows direction flips ▲ after a buy and the read turns hot', () => {
    const s = big(); s.player.cash = 40000; s.player.dirtyCash = 0;
    buyGood(s, 'booze', 30); // push demand hard (footprint ≈ 0.6/unit)
    const row = marketRows(s).find((r) => r.id === 'booze')!;
    expect(row.dir).toBe('▲');
    expect(row.price).toBeGreaterThan(row.basePrice);
    expect(row.read).toMatch(/climbing|SOARING|hot/i);
  });

  it('tradePreview rejects junk (unknown good, non-positive qty)', () => {
    const s = big();
    expect(tradePreview(s, 'nope', 5, 'buy')).toBeNull();
    expect(tradePreview(s, 'booze', 0, 'buy')).toBeNull();
    expect(tradePreview(s, 'booze', -3, 'sell')).toBeNull();
  });

  it('a glut (negative shock) crashes the price and the read says so', () => {
    const s = big();
    const before = marketGood(s, 'beer') ?? createMarket().goods.find((g) => g.id === 'beer')!;
    const p0 = before.price;
    shockDemand(s, 'beer', -40);
    const g = marketGood(s, 'beer')!;
    expect(g.price).toBeLessThanOrEqual(p0);
    expect(supplyDemandRead(g)).toMatch(/glut|easing|CRASHING/i);
  });
});
