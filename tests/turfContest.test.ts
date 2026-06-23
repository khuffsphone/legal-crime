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
import { resolveStrategicPulse } from '../src/sim/strategy';
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

  // RTS-30c-1.1 UPDATED (premise changed): the invader has the INITIATIVE, so an EVEN match no longer
  // parks at a dead 0 — it slowly falls to the rival. To hold you must OUT-muster them (player > rival).
  it('INVADER INITIATIVE: an even match still trends to the invader (never a dead 0); out-mustering holds', () => {
    const sEven = big();
    const a = setupBorder(sEven);
    activateContests(sEven);
    resolveContestStep(sEven, new Map([[a.playerDid, { rival: 2, player: 2 }]]));
    expect(contestOf(sEven, a.playerDid)!.pressure).toBeGreaterThan(0); // an even match drifts up, not 0

    const sHold = big();
    const b = setupBorder(sHold);
    activateContests(sHold);
    // player out-musters the invader → pressure must go DOWN (you can hold the line by sending MORE)
    resolveContestStep(sHold, new Map([[b.playerDid, { rival: 2, player: 4 }]]));
    expect(contestOf(sHold, b.playerDid)!.pressure).toBeLessThan(0);
  });

  // ⭐ THE STUCK-STATE FIX: a contest must always reach a resolution — it can never hang at 0 while the
  // war drags on. Under a sustained even match (which used to park at 0), the invader's initiative drives
  // it to FLIP/"lost" within a bounded number of pulses.
  it('ALWAYS RESOLVES: a sustained even match reaches a resolution (never hangs at 0)', () => {
    const s = big();
    const { playerDid } = setupBorder(s);
    activateContests(s);
    const presence = new Map([[playerDid, { rival: 2, player: 2 }]]);
    let resolved = false;
    for (let i = 0; i < 40 && !resolved; i++) {
      const r = resolveContestStep(s, presence);
      if (r.outcomes.some((o) => o.ended) || !districtContested(s, playerDid)) resolved = true;
    }
    expect(resolved).toBe(true); // the contest ended — no parked-enforcers-forever limbo
  });
});

describe('turf war — ONE visible authority (the background capture is suspended in contested districts)', () => {
  it('a contested district does NOT lose blocks to the background strategic pulse — only the visible meter flips them', () => {
    const s = big();
    const { playerDid, invader } = setupBorder(s);
    s.rivalWakeWeek = 0; s.tick = 5; // rivals awake so the background pulse actually runs
    activateContests(s);
    expect(districtContested(s, playerDid)).toBe(true);
    const before = familyShare(s.districts[0], s.player.id);
    // run the BACKGROUND strategic-capture pulse many times — it must NOT touch the contested district
    for (let i = 0; i < 20; i++) resolveStrategicPulse(s);
    expect(familyShare(s.districts[0], s.player.id)).toBe(before); // hold % unchanged by the hidden pulse
    expect(s.districts[0].businesses.every((b) => businessEarner(b) !== invader)).toBe(true); // no off-board flip
    // the VISIBLE meter, by contrast, DOES flip a block (it is the one authority)
    let flipped = false;
    const presence = new Map([[playerDid, { rival: 3, player: 0 }]]);
    for (let i = 0; i < 8 && !flipped; i++) flipped = resolveContestStep(s, presence).outcomes.some((o) => o.flipped);
    expect(flipped).toBe(true);
    expect(familyShare(s.districts[0], s.player.id)).toBeLessThan(before); // the meter moved the truth
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
