// RTS-20 — player verbs. The un-armed UAT found the player structurally stuck in ESTABLISH: no
// keybound EXPAND or RECRUIT meant RTS-19's gates ("secure a home block first" / "need 12 muscle")
// could never be cleared, so RAID and ASSASSINATE stayed locked forever. These tests prove the
// player-driven paths now CLEAR those gates, using the existing (AI-tested) sim commands.

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { applyCommand } from '../src/sim/commands';
import { canRaid, canAssassinate } from '../src/sim/offense';
import { buildReadout, expandTargetDistrictId, matchPhase } from '../src/sim/pacing';
import { districtsHeld } from '../src/sim/territoryWar';
import { controlOf } from '../src/sim/territory';
import { familyStrength } from '../src/sim/conflict';
import { CONTROL_HOLD, EXPAND_COST, RECRUIT_COST, ASSASSINATE_MIN_STRENGTH } from '../src/sim/constants';
import type { GameState } from '../src/sim/types';

function big(seed = 1): GameState { return createInitialState(seed, { startingCrew: true, tutorialFreeRuns: 1, bigCity: true }); }

describe('[5] EXPAND clears the RAID gate', () => {
  it('expandControl raises the home block 30→HOLD, leaving ESTABLISH and unlocking RAID', () => {
    const s = big();
    s.player.cash = 5000;
    // before: holds nothing, RAID is gated on a secured base, the match reads ESTABLISH.
    expect(districtsHeld(s, 'player')).toHaveLength(0);
    expect(canRaid(s, 'district-2').reason).toBe('secure a home block first');
    expect(matchPhase(s).phase).toBe('establish');

    // the build board points EXPAND at the home corner (district-0).
    expect(expandTargetDistrictId(s)).toBe('district-0');
    expect(controlOf(s.districts[0], 'player')).toBe(30);

    // drive expandControl (the player verb) until the block is HELD.
    let guard = 0;
    while (districtsHeld(s, 'player').length === 0 && guard++ < 8) {
      const before = s.player.cash;
      applyCommand(s, { type: 'expandControl', familyId: 'player', districtId: 'district-0' });
      expect(s.player.cash).toBe(before - EXPAND_COST); // real cost
    }
    expect(controlOf(s.districts[0], 'player')).toBeGreaterThanOrEqual(CONTROL_HOLD);
    expect(districtsHeld(s, 'player').map((d) => d.id)).toContain('district-0');

    // now RAID is unlocked (held base + crew + cash + a rival in district-2), and we left ESTABLISH.
    expect(canRaid(s, 'district-2').ok).toBe(true);
    expect(matchPhase(s).phase).not.toBe('establish');
  });

  it('the build board shows EXPAND with its cost + what it unlocks, and updates once secured', () => {
    const s = big(); s.player.cash = 5000;
    const expand0 = buildReadout(s).find((b) => b.key === 'expand')!;
    expect(expand0.cost).toBe(EXPAND_COST);
    expect(expand0.affordable).toBe(true);
    expect(expand0.effect).toMatch(/HOLD/); // names the goal that unlocks RAID
    // secure the block, then the effect is no longer the founding "secure → HOLD" line.
    s.districts[0].control.player = 60;
    expect(buildReadout(s).find((b) => b.key === 'expand')!.effect).not.toMatch(/unlocks RAID/);
  });
});

describe('[6] RECRUIT clears the ASSASSINATE gate', () => {
  it('recruitGangster adds muscle until strength ≥ 12 unlocks the hit', () => {
    const s = big();
    s.player.cash = 20000;
    s.districts[0].control.player = 60; // hold a base so we are out of ESTABLISH
    const crew0 = s.player.gangsters.length;
    expect(canAssassinate(s, 'rival-a').reason).toContain(`${ASSASSINATE_MIN_STRENGTH} muscle`);

    let guard = 0;
    while (familyStrength(s.player) < ASSASSINATE_MIN_STRENGTH && guard++ < 20) {
      const before = s.player.cash;
      applyCommand(s, { type: 'recruitGangster', familyId: 'player' });
      expect(s.player.cash).toBe(before - RECRUIT_COST); // real cost
    }
    expect(s.player.gangsters.length).toBeGreaterThan(crew0); // muscle was added
    expect(familyStrength(s.player)).toBeGreaterThanOrEqual(ASSASSINATE_MIN_STRENGTH);
    expect(canAssassinate(s, 'rival-a').ok).toBe(true); // the decapitating blow is now in reach
  });

  it('the build board reads muscle progress toward the hit', () => {
    const s = big();
    const recruit = buildReadout(s).find((b) => b.key === 'recruit')!;
    expect(recruit.cost).toBe(RECRUIT_COST);
    expect(recruit.effect).toMatch(new RegExp(`${ASSASSINATE_MIN_STRENGTH}`)); // shows X/12
    // a hit-ready outfit reads as such.
    s.player.gangsters.push({ id: 'big', name: 'Tank', skill: 12, loyalty: 80, upkeep: 0, assignment: { type: 'idle' } });
    expect(buildReadout(s).find((b) => b.key === 'recruit')!.effect).toMatch(/hit-ready/);
  });
});

describe('the full ramp: a player can now leave ESTABLISH under their own power', () => {
  it('expand → HOLD → recruit → muscle takes the outfit establish → contest → endgame', () => {
    const s = big(); s.player.cash = 30000;
    expect(matchPhase(s).phase).toBe('establish');
    // expand to hold the home block
    for (let i = 0; i < 4 && districtsHeld(s, 'player').length === 0; i++) {
      applyCommand(s, { type: 'expandControl', familyId: 'player', districtId: 'district-0' });
    }
    expect(matchPhase(s).phase).toBe('contest'); // a held block, modest crew
    // recruit to hit-ready muscle
    for (let i = 0; i < 20 && familyStrength(s.player) < ASSASSINATE_MIN_STRENGTH; i++) {
      applyCommand(s, { type: 'recruitGangster', familyId: 'player' });
    }
    expect(matchPhase(s).phase).toBe('endgame'); // muscle ≥ 12 → you can decapitate
  });
});
