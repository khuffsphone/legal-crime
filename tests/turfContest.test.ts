// RTS-30c-1 — pure tests for the turf-war CORE: border activation, the presence-based contest
// (hold-% shift + flip threshold), attack/defend, and the per-district collector-vulnerability flag.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { districtNeighbors } from '../src/sim/city';
import {
  borderContestTargets, desiredContestCount, activateContests, resolveContestStep,
  districtContested, collectorVulnerableInDistrict, familyShare, contestOf,
} from '../src/sim/turfWar';
import { districtStatusOf } from '../src/sim/districtStatus';
import { businessEarner } from '../src/sim/economy';
import type { GameState } from '../src/sim/types';

function big(seed = 1): GameState { return createInitialState(seed, { startingCrew: true, bigCity: true }); }

/** Give the player a real stake in d0 and a rival foothold in a neighbour (a contestable border). */
function setupBorder(s: GameState): { playerDid: string; invader: string; neighborDid: string } {
  const d0 = s.districts[0];
  for (const b of d0.businesses) if (b.kind === 'front') b.extortedBy = s.player.id; // player holds d0
  const nbr = districtNeighbors(s, d0.id)[0];
  const invader = s.rivals[0].id;
  const nb = nbr.businesses.find((b) => b.kind !== 'front') ?? nbr.businesses[0];
  if (nb.kind === 'front') nb.extortedBy = invader; else nb.ownerFamily = invader; // rival foothold next door
  return { playerDid: d0.id, invader, neighborDid: nbr.id };
}

describe('turf war — border activation + escalation', () => {
  it('a contest opens on a player-stake district bordering a rival foothold', () => {
    const s = big();
    const { playerDid, invader } = setupBorder(s);
    const targets = borderContestTargets(s);
    expect(targets.some((t) => t.districtId === playerDid && t.invaderId === invader)).toBe(true);
    const created = activateContests(s);
    expect(created.length).toBeGreaterThanOrEqual(1);
    expect(districtContested(s, playerDid)).toBe(true);
    expect(contestOf(s, playerDid)!.invaderId).toBe(invader);
  });

  it('escalates gradually with the weeks awake (1 → CONTEST_MAX), dormant before the wake', () => {
    const s = big();
    s.rivalWakeWeek = 3;
    s.tick = 1; expect(desiredContestCount(s)).toBe(0); // dormant
    s.tick = 3; expect(desiredContestCount(s)).toBe(1);
    s.tick = 6; expect(desiredContestCount(s)).toBe(2);
    s.tick = 99; expect(desiredContestCount(s)).toBe(3); // capped at CONTEST_MAX
  });
});

describe('turf war — the presence-based contest (hold-% shift + flip)', () => {
  it('MORE RIVAL MUSCLE erodes your hold: pressure climbs, then a player business FLIPS to the invader', () => {
    const s = big();
    const { playerDid, invader } = setupBorder(s);
    activateContests(s);
    const before = familyShare(s.districts[0], s.player.id);
    expect(before).toBeGreaterThan(0);
    const presence = new Map([[playerDid, { rival: 3, player: 0 }]]); // invader out-musters you 3-0
    let flippedEver = false;
    for (let i = 0; i < 6; i++) { const r = resolveContestStep(s, presence); if (r.outcomes.some((o) => o.flipped)) flippedEver = true; }
    expect(flippedEver).toBe(true);
    const after = familyShare(s.districts[0], s.player.id);
    expect(after).toBeLessThan(before); // your hold % dropped — the inspectable truth
    expect(s.districts[0].businesses.some((b) => businessEarner(b) === invader)).toBe(true);
  });

  it('DEFEND: out-mustering the invader drives pressure down and REPELS them (contest ends "held")', () => {
    const s = big();
    const { playerDid } = setupBorder(s);
    activateContests(s);
    const presence = new Map([[playerDid, { rival: 0, player: 3 }]]); // you flood the block with muscle
    let endedHeld = false;
    for (let i = 0; i < 6 && !endedHeld; i++) {
      const r = resolveContestStep(s, presence);
      if (r.outcomes.some((o) => o.ended === 'held')) endedHeld = true;
    }
    expect(endedHeld).toBe(true);
    expect(districtContested(s, playerDid)).toBe(false); // the war is over — you held
  });

  it('a stalemate (equal muscle) neither flips nor ends — the player can hold the line', () => {
    const s = big();
    const { playerDid } = setupBorder(s);
    activateContests(s);
    const presence = new Map([[playerDid, { rival: 2, player: 2 }]]);
    for (let i = 0; i < 8; i++) resolveContestStep(s, presence);
    expect(districtContested(s, playerDid)).toBe(true); // still contested, no flip
    expect(contestOf(s, playerDid)!.pressure).toBe(0);
  });
});

describe('turf war — per-district collector vulnerability + CONTESTED status', () => {
  it('collectors are robbable ONLY in a contested district; uncontested stays safe', () => {
    const s = big();
    const { playerDid, neighborDid } = setupBorder(s);
    activateContests(s);
    expect(collectorVulnerableInDistrict(s, playerDid)).toBe(true);   // war zone
    expect(collectorVulnerableInDistrict(s, neighborDid)).toBe(false); // not contested → safe
    expect(collectorVulnerableInDistrict(s, undefined)).toBe(false);
  });

  it('districtStatusOf reads CONTESTED while a contest is active (and not otherwise)', () => {
    const s = big();
    const { playerDid } = setupBorder(s);
    expect(districtStatusOf(s, playerDid)!.status).not.toBe('CONTESTED'); // before the war
    activateContests(s);
    expect(districtStatusOf(s, playerDid)!.status).toBe('CONTESTED');
  });
});
