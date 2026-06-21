// RTS-19 — the balance & economy pass. Asserts the TUNED behaviour of a normal, un-armed match:
// the economy→offense pacing/gating order, the rebalanced raid (softens, doesn't steamroll), the
// shared crew cooldown, a worthy-but-not-tyrannical rival arc, the federal clock as real pressure,
// and the legibility helpers. All seeded + deterministic; the sim stays pure.

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { updateAndObserve } from '../src/sim/realtime';
import {
  canRaid, canSabotage, canAssassinate, canLockout, resolveRaid,
} from '../src/sim/offense';
import { offenseReadout, matchPhase, playerWeeklyNet } from '../src/sim/pacing';
import { districtsHeld } from '../src/sim/territoryWar';
import { districtHolder, controlOf } from '../src/sim/territory';
import { federalExposure, fedWarningTier } from '../src/sim/federal';
import {
  RAID_FORCE, ASSASSINATE_HQ_DAMAGE, OFFENSE_COOLDOWN_SECONDS, LOCKOUT_BUREAU_REQ,
  WEEK_DURATION_SECONDS, STRATEGY_PULSE_SECONDS, FED_WARN_TIER_1,
} from '../src/sim/constants';
import type { GameState, Family, Gangster, Business } from '../src/sim/types';

function big(seed = 1): GameState { return createInitialState(seed, { startingCrew: true, tutorialFreeRuns: 1, bigCity: true }); }
function bare(seed = 1): GameState { return createInitialState(seed, { bigCity: true }); }
function crew(fam: Family, skills: number[]): void {
  fam.gangsters = skills.map((sk, i): Gangster => ({ id: `${fam.id}-x${i}`, name: 'x', skill: sk, loyalty: 60, upkeep: 0, assignment: { type: 'idle' } }));
}
function hold(s: GameState, id: string, fid: string, pts = 60): void { s.districts.find((d) => d.id === id)!.control[fid] = pts; }
function rivalRacket(s: GameState, districtIdx: number, owner = 'rival-a'): Business {
  const b: Business = { id: `rop-${districtIdx}`, name: 'still', kind: 'smuggling', baseIncome: 600, heatPerTick: 10, ownerFamily: owner, districtId: `district-${districtIdx}`, uncollected: 200, tier: 1 };
  s.districts[districtIdx].businesses.push(b);
  return b;
}
/** Advance `weeks` full weeks of the wrapper (1 settlement + ~5 strategic pulses each). */
function runWeeks(s: GameState, weeks: number): GameState {
  let cur = s;
  for (let w = 0; w < weeks; w++) {
    cur = updateAndObserve(cur, WEEK_DURATION_SECONDS, WEEK_DURATION_SECONDS, STRATEGY_PULSE_SECONDS).state;
  }
  return cur;
}

describe('the tuned constants are the new values (RTS-19)', () => {
  it('a raid shoves less, a hit razes less, and there is a real crew cooldown', () => {
    expect(RAID_FORCE).toBe(14); // was 22 — a single raid no longer flips + seizes a block
    expect(ASSASSINATE_HQ_DAMAGE).toBe(40); // was 45 — still ~3 hits to topple a Don
    expect(OFFENSE_COOLDOWN_SECONDS).toBeGreaterThan(0); // hits can't be chained instantly
  });
});

describe('economy → offense pacing: the unlock ladder', () => {
  it('a fresh outfit cannot raid (no secured base), assassinate (no muscle), or lockout (no Bureau)', () => {
    const s = big();
    expect(districtsHeld(s, 'player')).toHaveLength(0);
    const r = Object.fromEntries(offenseReadout(s).map((o) => [o.key, o]));
    expect(r.raid.available).toBe(false);
    expect(r.raid.reason).toBe('secure a home block first');
    expect(r.assassinate.available).toBe(false);
    expect(r.lockout.available).toBe(false);
  });

  it('sabotage is the FIRST offensive tool — unlocks the moment a rival has a racket to wreck', () => {
    const s = big(); s.player.cash = 3000;
    expect(canSabotage(s, 'nope').ok).toBe(false); // nothing to hit yet
    const racket = rivalRacket(s, 2);
    expect(canSabotage(s, racket.id).ok).toBe(true); // cheap, 1 crew, a rival racket exists
  });

  it('raid unlocks once you SECURE a home block; the held base is the gate', () => {
    const s = big(); s.player.cash = 3000; rivalRacket(s, 2);
    expect(canRaid(s, 'district-2').ok).toBe(false); // holds nothing yet
    hold(s, 'district-0', 'player', 55); // 30 → 55: the home corner is now HELD
    expect(districtsHeld(s, 'player')).toHaveLength(1);
    expect(canRaid(s, 'district-2').ok).toBe(true);
  });

  it('lockout waits on The Bureau (feds ≥ req); assassination waits on real muscle (strength ≥ 12)', () => {
    const s = big(); s.player.cash = 5000; hold(s, 'district-0', 'player', 55);
    expect(canLockout(s, 'rival-a').ok).toBe(false);
    s.player.bribes.feds = LOCKOUT_BUREAU_REQ; // greased The Bureau
    expect(canLockout(s, 'rival-a').ok).toBe(true);

    crew(s.player, [4, 4]); // strength 8 < 12
    expect(canAssassinate(s, 'rival-a').ok).toBe(false);
    crew(s.player, [6, 6, 4]); // strength 16 ≥ 12 — the decapitating blow is now in reach
    expect(canAssassinate(s, 'rival-a').ok).toBe(true);
  });
});

describe('the shared crew cooldown gates the steamroll', () => {
  it('after one raid, the next offence is refused until the crew regroups, then frees up', () => {
    const s = big(); s.player.cash = 5000; crew(s.player, [5, 5]); hold(s, 'district-0', 'player', 55);
    const res = resolveRaid(s, 'district-2');
    expect(res.ok).toBe(true);
    expect(s.offenseCooldown).toBe(OFFENSE_COOLDOWN_SECONDS);
    // a second raid is blocked while hot...
    expect(canRaid(s, 'district-2').ok).toBe(false);
    // ...and the wrapper bleeds it down over real time.
    const after = updateAndObserve(s, OFFENSE_COOLDOWN_SECONDS + 1, 10_000, 10_000).state;
    expect(after.offenseCooldown).toBe(0);
    expect(canRaid(after, 'district-2').ok).toBe(true);
  });
});

describe('the rebalanced raid: a campaign, not a button', () => {
  it('repeated raids on a guarded-less block eventually TAKE it, but no single raid does', () => {
    const s = bare(); s.player.cash = 20_000; crew(s.player, [5, 5, 5, 5, 5, 5]); hold(s, 'district-0', 'player', 55);
    hold(s, 'district-2', 'rival-a', 52);
    const racket = rivalRacket(s, 2);
    let seized = false;
    let raids = 0;
    let effectiveRaids = 0;
    for (let i = 0; i < 20 && !seized; i++) {
      s.offenseCooldown = 0; // simulate waiting out the cooldown between jobs
      const res = resolveRaid(s, 'district-2');
      raids++;
      if (res.ok && !res.repelled) effectiveRaids++;
      if (res.captured) seized = true;
    }
    expect(effectiveRaids).toBeGreaterThan(1); // it took MORE than one landed raid to flip the block
    expect(raids).toBeGreaterThan(1); // it took MORE than one raid to flip the block
    expect(seized).toBe(true); // ...but sustained pressure does take it
    expect(districtHolder(s.districts[2])).toBe('player');
    expect(racket.ownerFamily).toBe('player'); // only on the genuine takeover are rackets seized
  });
});

describe('the difficulty arc: rivals are a worthy opponent, not a turn-1 tyrant', () => {
  it('left alone, rivals EXPAND across the city but do not wipe an idle player early', () => {
    let s = big();
    const footprint0 = s.districts.filter((d) => controlOf(d, 'rival-a') > 0 || controlOf(d, 'rival-b') > 0).length;
    s = runWeeks(s, 6);
    const footprintN = s.districts.filter((d) => controlOf(d, 'rival-a') > 0 || controlOf(d, 'rival-b') > 0).length;
    const rivalHeld = districtsHeld(s, 'rival-a').length + districtsHeld(s, 'rival-b').length;
    expect(footprintN).toBeGreaterThan(footprint0); // they pressed outward (worthy)
    expect(rivalHeld).toBeGreaterThanOrEqual(1); // they secured ground
    expect(s.player.alive).toBe(true); // ...but an idle player still has room (not steamrolled)
    expect(s.player.gangsters.length).toBeGreaterThanOrEqual(2); // crew intact
  });
});

describe('the federal clock is real late-game pressure', () => {
  it('a hot, dirty, aggressive outfit climbs the exposure ladder into a warning tier', () => {
    const s = big();
    // an aggressive late-game posture: a fat dirty hoard + accumulated heat from rackets & raids.
    s.player.cash = 8000; s.player.dirtyCash = 6000; s.player.heat = 40;
    expect(federalExposure(s.player)).toBeGreaterThanOrEqual(FED_WARN_TIER_1);
    expect(fedWarningTier(federalExposure(s.player))).toBeGreaterThanOrEqual(1);
    // The Bureau buys exposure relief — the channel that holds the Feds back.
    const before = federalExposure(s.player);
    s.player.bribes.feds = 30;
    expect(federalExposure(s.player)).toBeLessThan(before);
  });
});

describe('legibility: the player can plan', () => {
  it('matchPhase reads establish → contest → endgame as the outfit grows', () => {
    const s = big();
    expect(matchPhase(s).phase).toBe('establish'); // holds nothing yet
    hold(s, 'district-0', 'player', 55);
    expect(matchPhase(s).phase).toBe('contest'); // a held block, modest crew, no rival battered
    crew(s.player, [6, 6, 4]); // strength 16 ≥ 12 — you can decapitate
    expect(matchPhase(s).phase).toBe('endgame');
  });

  it('offenseReadout surfaces cost + heat + availability for every action', () => {
    const s = big(); s.player.cash = 5000; hold(s, 'district-0', 'player', 55); rivalRacket(s, 2);
    const rows = offenseReadout(s);
    expect(rows.map((r) => r.key)).toEqual(['sabotage', 'raid', 'lockout', 'assassinate']);
    for (const r of rows) {
      expect(r.cost).toBeGreaterThan(0);
      expect(typeof r.available).toBe('boolean');
      expect(r.reason.length).toBeGreaterThan(0);
    }
    // The Bench cuts the DISPLAYED raid heat (legible mitigation).
    const heat0 = offenseReadout(s).find((r) => r.key === 'raid')!.heat;
    s.player.bribes.judges = 20;
    expect(offenseReadout(s).find((r) => r.key === 'raid')!.heat).toBeLessThan(heat0);
  });

  it('playerWeeklyNet reflects income minus the upkeep + bribe bleed', () => {
    const s = big();
    const net0 = playerWeeklyNet(s);
    s.player.bribes.police = 200; s.player.bribeLevel = 200; // a heavy retainer bleeds the net
    expect(playerWeeklyNet(s)).toBeLessThan(net0);
  });
});
