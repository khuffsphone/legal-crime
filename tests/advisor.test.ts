// Lane — THE CONSIGLIERE. Pure advisor: (player-knowable snapshot, recent WIRE events) -> ranked suggestions.
// Pure & deterministic; /src/sim stays Phaser-free (adapter.test.ts enforces it). The cardinal test is
// ⭐ NO-X-RAY: a suggestion's location is only ever copied from a player-knowable input — never a hidden
// rival's position. Suggestions rank by urgency (critical → warning → opportunity → info), score breaking ties.

import { describe, it, expect } from 'vitest';
import {
  adviseRun, topSuggestion, topSuggestions, rankScore, ADVISOR_RECENT_MS,
  type AdvisorSnapshot, type AdvisorEvent,
} from '../src/sim/advisor';
import { FED_DIRTY_DANGER } from '../src/sim/constants';

const NOW = 100_000;

/** A calm baseline snapshot that on its own produces NO suggestions. */
function baseSnap(over: Partial<AdvisorSnapshot> = {}): AdvisorSnapshot {
  return {
    tick: 8,
    cleanCash: 2500,
    dirtyCash: 0,
    netPerWeek: 120,
    federalExposure: 0,
    federalTier: 0,
    districtsHeld: 2,
    districtsTotal: 9,
    crewTotal: 3,
    crewIdle: 0,
    topWinPathPct: 20,
    greaseTotal: 25,
    ...over,
  };
}

function ev(kind: string, over: Partial<AdvisorEvent> = {}): AdvisorEvent {
  return { kind, tier: 'warning', t: NOW, ...over };
}

describe('adviseRun — a calm board says nothing', () => {
  it('returns no suggestions when nothing is wrong and nothing is on offer', () => {
    expect(adviseRun(baseSnap(), [], NOW)).toEqual([]);
  });
});

describe('individual suggestions fire from player-knowable signals', () => {
  it('federal WATCH tier → "heat is climbing" warning', () => {
    const s = adviseRun(baseSnap({ federalTier: 2 }), [], NOW);
    expect(s.map((x) => x.id)).toContain('heat-watch');
    expect(s.find((x) => x.id === 'heat-watch')!.urgency).toBe('warning');
  });

  it('federal RAID tier → imminent-bust critical', () => {
    const s = adviseRun(baseSnap({ federalTier: 3, federalExposure: 90 }), [], NOW);
    const heat = s.find((x) => x.id === 'heat-raid');
    expect(heat?.urgency).toBe('critical');
  });

  it('a dirty hoard over the danger line → launder warning', () => {
    const s = adviseRun(baseSnap({ dirtyCash: FED_DIRTY_DANGER + 1 }), [], NOW);
    expect(s.map((x) => x.id)).toContain('launder');
  });

  it('an un-shaken front + idle muscle → an extort opportunity that points at it', () => {
    const s = adviseRun(baseSnap({ crewIdle: 2, extortTarget: { name: 'The Levee Speakeasy', gx: 4, gy: 5 } }), [], NOW);
    const op = s.find((x) => x.id === 'extort-idle');
    expect(op).toBeDefined();
    expect(op!.urgency).toBe('opportunity');
    expect(op!.text).toContain('The Levee Speakeasy');
    expect([op!.gx, op!.gy]).toEqual([4, 5]);
  });

  it('no foothold → an info nudge to establish one', () => {
    const s = adviseRun(baseSnap({ districtsHeld: 0 }), [], NOW);
    const foothold = s.find((x) => x.id === 'foothold');
    expect(foothold?.urgency).toBe('info');
  });

  it('a recent HQ-attack WIRE event → a critical defend suggestion located at the player HQ', () => {
    const s = adviseRun(baseSnap(), [ev('hq.attack', { tier: 'critical', gx: 6, gy: 7 })], NOW);
    const hq = s.find((x) => x.id === 'hq-attack');
    expect(hq?.urgency).toBe('critical');
    expect([hq!.gx, hq!.gy]).toEqual([6, 7]);
  });
});

describe('recency window — stale WIRE beats are ignored', () => {
  it('an HQ-attack older than the recency window does not advise', () => {
    const stale = ev('hq.attack', { tier: 'critical', gx: 6, gy: 7, t: NOW - ADVISOR_RECENT_MS - 1 });
    expect(adviseRun(baseSnap(), [stale], NOW).some((x) => x.id === 'hq-attack')).toBe(false);
    const fresh = ev('hq.attack', { tier: 'critical', gx: 6, gy: 7, t: NOW - 1 });
    expect(adviseRun(baseSnap(), [fresh], NOW).some((x) => x.id === 'hq-attack')).toBe(true);
  });
});

describe('suggestions rank by urgency (critical → warning → opportunity → info)', () => {
  it('orders every band correctly with score as the tiebreak', () => {
    const snap = baseSnap({
      federalTier: 3, federalExposure: 90, // heat-raid (critical)
      dirtyCash: FED_DIRTY_DANGER + 1,     // launder (warning)
      crewIdle: 1, extortTarget: { name: 'Cigar Shop', gx: 2, gy: 3 }, // extort-idle (opportunity)
      districtsHeld: 0,                    // foothold (info)
    });
    const events = [
      ev('hq.attack', { tier: 'critical', gx: 8, gy: 9 }),    // critical, score 95
      ev('collector.robbed', { tier: 'warning', gx: 1, gy: 1 }), // warning, score 55
    ];
    const s = adviseRun(snap, events, NOW);

    // strictly descending absolute rank
    for (let i = 1; i < s.length; i++) expect(rankScore(s[i - 1])).toBeGreaterThanOrEqual(rankScore(s[i]));

    // band order: all criticals precede all warnings precede opportunities precede info
    const order = { critical: 0, warning: 1, opportunity: 2, info: 3 } as const;
    for (let i = 1; i < s.length; i++) expect(order[s[i].urgency]).toBeGreaterThanOrEqual(order[s[i - 1].urgency]);

    // the single most urgent is the HQ attack (highest critical score)
    expect(s[0].id).toBe('hq-attack');
    // within criticals, hq-attack (95) outranks heat-raid (70)
    const crit = s.filter((x) => x.urgency === 'critical').map((x) => x.id);
    expect(crit).toEqual(['hq-attack', 'heat-raid']);

    expect(topSuggestion(snap, events, NOW)!.id).toBe('hq-attack');
    expect(topSuggestions(snap, events, NOW, 2).map((x) => x.id)).toEqual(['hq-attack', 'heat-raid']);
  });
});

describe('⭐ NO-X-RAY — no suggestion can expose a hidden rival position', () => {
  it('every located suggestion echoes ONLY a player-knowable input coord (never a secret rival tile)', () => {
    const SECRET_RIVAL = { gx: 99, gy: 99 }; // a hidden rival's tile — deliberately NOT fed to the advisor
    // Player-knowable inputs: WIRE rows about the player's OWN assets / a telegraphed strike + a turf extort target.
    const events: AdvisorEvent[] = [
      ev('hq.attack', { tier: 'critical', gx: 6, gy: 7 }),
      ev('district.lost', { tier: 'critical', gx: 1, gy: 2 }),
      ev('collector.robbed', { tier: 'warning', gx: 3, gy: 4 }),
      ev('rival.telegraph', { tier: 'warning', gx: 7, gy: 8 }),
      // non-positional kinds carry NO location and must never produce a positioned suggestion
      ev('rival.fallen', { tier: 'info' }),
      ev('federal.threshold', { tier: 'critical' }),
      ev('bribe.landed', { tier: 'info' }),
    ];
    const snap = baseSnap({ crewIdle: 1, extortTarget: { name: 'Garage', gx: 5, gy: 6 } });

    const allowed = new Set(['6,7', '1,2', '3,4', '7,8', '5,6']); // the only player-knowable coords supplied
    const s = adviseRun(snap, events, NOW);
    expect(s.length).toBeGreaterThan(0);

    for (const sug of s) {
      if (sug.gx !== undefined || sug.gy !== undefined) {
        const key = `${sug.gx},${sug.gy}`;
        expect(allowed.has(key)).toBe(true);            // only ever a supplied, player-knowable coord
        expect(key).not.toBe(`${SECRET_RIVAL.gx},${SECRET_RIVAL.gy}`); // never the hidden rival's tile
      }
    }
    // the advisor was never even given the secret tile, so it cannot appear anywhere
    expect(JSON.stringify(s)).not.toContain('99');
  });
});
