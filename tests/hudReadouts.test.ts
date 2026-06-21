// RTS-23 — pure HUD readouts: the 4-stage match-phase header, offense previews (effect +
// retaliation), and win/loss proximity. Seeded + deterministic; /src/sim stays Phaser-free and
// tick/applyCommand is untouched (these only READ state).

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { hudPhase, offensePreview } from '../src/sim/pacing';
import { victoryProximity } from '../src/sim/endgame';
import { districtsHeld } from '../src/sim/territoryWar';
import { ASSASSINATE_HQ_DAMAGE, LOCKOUT_DURATION, RAID_FORCE, TURF_DOMINANCE, HQ_MAX } from '../src/sim/constants';
import type { GameState, Family, Gangster } from '../src/sim/types';

function big(seed = 1): GameState { return createInitialState(seed, { startingCrew: true, tutorialFreeRuns: 1, bigCity: true }); }
function crew(fam: Family, skills: number[]): void {
  fam.gangsters = skills.map((sk, i): Gangster => ({ id: `${fam.id}-x${i}`, name: 'x', skill: sk, loyalty: 60, upkeep: 0, assignment: { type: 'guard', districtId: 'district-0' } }));
}
function hold(s: GameState, id: string, fid: string, pts = 60): void { s.districts.find((d) => d.id === id)!.control[fid] = pts; }

describe('the 4-stage match-phase header', () => {
  it('reads ESTABLISH → FIRST BLOOD → CONTEST → DECAPITATE as the outfit grows', () => {
    const s = big();
    expect(hudPhase(s).phase).toBe('ESTABLISH'); // holds nothing yet

    hold(s, 'district-0', 'player', 60); // one secured block
    expect(hudPhase(s).phase).toBe('FIRST BLOOD');

    hold(s, 'district-1', 'player', 60); // a second block → a real turf war
    expect(hudPhase(s).phase).toBe('CONTEST');

    crew(s.player, [6, 6, 4]); // strength 16 ≥ 12 → you can decapitate
    expect(hudPhase(s).phase).toBe('DECAPITATE');
  });

  it('every stage carries a plain-English read', () => {
    const s = big();
    expect(hudPhase(s).read.length).toBeGreaterThan(8);
    expect(hudPhase(s).read).toMatch(/extort/i);
  });
});

describe('offense previews — cost/effect/heat/retaliation before commit', () => {
  it('each verb states its EFFECT and RETALIATION, grounded in the tuned constants', () => {
    const raid = offensePreview('raid');
    expect(raid.effect).toContain(`${RAID_FORCE}`); // "shove ~14 control…"
    expect(raid.retaliation).toMatch(/enrage|push/i);

    const hit = offensePreview('assassinate');
    expect(hit.effect).toContain(`${ASSASSINATE_HQ_DAMAGE}`); // "−40 HQ…"
    expect(hit.retaliation).toMatch(/HQ|enrage/i);

    const lock = offensePreview('lockout');
    expect(lock.effect).toContain(`${LOCKOUT_DURATION}`); // "freeze + bleed … 4 weeks"

    const sab = offensePreview('sabotage');
    expect(sab.effect).toMatch(/racket|earn/i);
  });
});

describe('win/loss proximity — how close is anyone', () => {
  it('a fresh game: nobody holds the city; player win% low, lose% 0', () => {
    const s = big();
    const v = victoryProximity(s);
    expect(v.playerWinPct).toBe(0);
    expect(v.playerLosePct).toBe(0);
    expect(v.total).toBe(9);
    expect(v.read).toMatch(/no one holds|establish/i);
  });

  it('player nearing dominance reads a high win%, and names the player as leader', () => {
    const s = big();
    const need = Math.ceil(TURF_DOMINANCE * s.districts.length); // 6 of 9
    for (let i = 0; i < need; i++) hold(s, `district-${i}`, 'player', 60);
    expect(districtsHeld(s, 'player').length).toBe(need);
    const v = victoryProximity(s);
    expect(v.playerWinPct).toBe(100); // at the dominance threshold
    expect(v.leaderId).toBe('player');
  });

  it('a battered player HQ reads rising lose%; a leading rival is flagged as the threat', () => {
    const s = big();
    s.player.hqIntegrity = HQ_MAX / 2; // half razed
    expect(victoryProximity(s).playerLosePct).toBe(50);

    hold(s, 'district-2', 'rival-a', 60); hold(s, 'district-5', 'rival-a', 60);
    const v = victoryProximity(s);
    expect(v.leaderId).toBe('rival-a');
    expect(v.read).toMatch(/lead|taking the city/i);
  });
});
