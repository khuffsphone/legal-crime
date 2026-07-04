// AUDIO E-H — Ticket F1 (the verified event→cue mapper). Mutation-table driven: each test names the
// mutation that must fail. Bound to the LIVE sim shapes (GameEvent / EmbodiedExtortionEvent /
// InterceptionEvent / DepositEvent).
import { describe, it, expect } from 'vitest';
import type { DepositEvent, EmbodiedExtortionEvent, GameEvent, InterceptionEvent } from '../src/sim';
import { federalCueKey } from '../src/scenes/audioMap';
import {
  combatDuckTriggered, extortionOutcome, mapCollectorBeats, mapExtortionEvents, mapInterceptions, mapLogEvents,
} from '../src/scenes/audio/eventCueMapper';

const log = (kind: string, data?: Record<string, unknown>): GameEvent => ({ tick: 1, kind, message: 'm', ...(data ? { data } : {}) });
const PLAYER = 'player';

describe('F1 — log events (mutation table)', () => {
  it("MUTATION raid-mapped-to-police: plain 'raid' is the PLAYER's op → player_offense_raid, never police", () => {
    const cues = mapLogEvents([log('raid')]);
    expect(cues).toHaveLength(1);
    expect(cues[0].key).toBe('player_offense_raid');
    expect(cues[0].key.startsWith('police_')).toBe(false);
    expect(cues[0].priority).toBe(45);
  });

  it('MUTATION raid-cash-mapped-to-player-offense: the police trio comes ONLY from raid-cash/-operation/-bust', () => {
    expect(mapLogEvents([log('raid-cash')])[0].key).toBe('police_raid_cash');
    expect(mapLogEvents([log('raid-operation')])[0].key).toBe('police_raid_operation');
    expect(mapLogEvents([log('raid-bust')])[0].key).toBe('police_raid_bust');
    for (const k of ['raid-cash', 'raid-operation', 'raid-bust']) {
      const [cue] = mapLogEvents([log(k)]);
      expect(cue.key).not.toBe('player_offense_raid');
      expect(cue.priority).toBe(90);
    }
  });

  it('MUTATION hardcoded-federal-keys: tiers route through audioMap.federalCueKey (identity per tier)', () => {
    for (const tier of [1, 2, 3]) {
      const [cue] = mapLogEvents([log('fed-warning', { tier })]);
      expect(cue.key).toBe(federalCueKey(tier)); // the SHIPPED mapping is the source of truth
    }
    expect(mapLogEvents([log('fed-warning', { tier: 3 })])[0].priority).toBe(100);
    expect(mapLogEvents([log('fed-warning', { tier: 2 })])[0].priority).toBe(96);
    expect(mapLogEvents([log('fed-warning', { tier: 1 })])[0].priority).toBe(95);
  });

  it('fed-cooldown and fed-armed are explicit keys at their H.3 priorities', () => {
    expect(mapLogEvents([log('fed-cooldown')])[0]).toMatchObject({ key: 'federal_cooldown', priority: 80 });
    expect(mapLogEvents([log('fed-armed')])[0]).toMatchObject({ key: 'federal_armed', priority: 98 });
  });

  it("player_offense_raid is positional ONLY when the log event carries an explicit tile", () => {
    expect(mapLogEvents([log('raid')])[0].positional).toBe(false);
    const [tiled] = mapLogEvents([log('raid', { gx: 4, gy: 7 })]);
    expect(tiled.positional).toBe(true);
    expect(tiled.tile).toEqual({ gx: 4, gy: 7 });
    const [malformed] = mapLogEvents([log('raid', { gx: 'x', gy: 7 })]); // non-numeric ⇒ not a tile
    expect(malformed.positional).toBe(false);
  });

  it('unrelated log kinds are silent in F (combat/economy owned elsewhere)', () => {
    expect(mapLogEvents([log('interception'), log('extort-success'), log('mutiny'), log('hq-struck')])).toEqual([]);
  });
});

describe('F1 — extortion outcomes (mutation table)', () => {
  const ev = (kind: 'shakedown' | 'sabotage', flags: Partial<EmbodiedExtortionEvent>): EmbodiedExtortionEvent => ({
    actId: 'a', thugId: 't', frontId: 'front-9', kind, state: 'resolve', prevState: 'shakedown', progress: 1,
    converted: false, retook: false, sabotaged: false, failed: false, ...flags,
  });

  it('MUTATION extortion-outcome-dropped: all 8 kind × outcome combinations map exhaustively', () => {
    const expectPriority: Record<string, number> = {
      extortion_shakedown_converted: 65, extortion_shakedown_retook: 65,
      extortion_shakedown_sabotaged: 65, extortion_shakedown_failed: 60,
      extortion_sabotage_converted: 65, extortion_sabotage_retook: 65,
      extortion_sabotage_sabotaged: 70, extortion_sabotage_failed: 60,
    };
    for (const kind of ['shakedown', 'sabotage'] as const) {
      for (const outcome of ['converted', 'retook', 'sabotaged', 'failed'] as const) {
        const [cue] = mapExtortionEvents([ev(kind, { [outcome]: true })]);
        expect(cue.key).toBe(`extortion_${kind}_${outcome}`);
        expect(cue.priority).toBe(expectPriority[cue.key]);
      }
    }
    expect(extortionOutcome(ev('shakedown', {}))).toBeNull(); // in-progress churn stays silent
    expect(mapExtortionEvents([ev('shakedown', {})])).toEqual([]);
  });

  it('MUTATION tileless-positional-cue: positional ONLY via a supplied front→tile resolver', () => {
    const converted = ev('shakedown', { converted: true });
    const [bare] = mapExtortionEvents([converted]);
    expect(bare.positional).toBe(false);
    expect(bare.tile).toBeUndefined();
    const [tiled] = mapExtortionEvents([converted], () => ({ gx: 3, gy: 5 }));
    expect(tiled.positional).toBe(true);
    expect(tiled.tile).toEqual({ gx: 3, gy: 5 });
    const [unresolved] = mapExtortionEvents([converted], () => undefined); // resolver misses ⇒ non-positional
    expect(unresolved.positional).toBe(false);
  });
});

describe('F1 — interceptions + collector beats (mutation table)', () => {
  const robbery = (victim: string): InterceptionEvent =>
    ({ attackerId: 'e', collectorId: 'c', attackerFaction: 'rival-1', victimFaction: victim, amount: 50 });
  const deposit = (familyId: string, banked = 120): DepositEvent => ({ collectorId: 'c1', familyId, banked });

  it('MUTATION fake-interception-tile: interception_collector_robbed is NEVER positional (the event has no tile)', () => {
    const [cue] = mapInterceptions([robbery(PLAYER)], PLAYER);
    expect(cue.key).toBe('interception_collector_robbed');
    expect(cue.positional).toBe(false);
    expect(cue.tile).toBeUndefined();
    expect(cue.priority).toBe(75);
    expect(mapInterceptions([robbery('rival-2')], PLAYER)).toEqual([]); // rival-vs-rival stays silent
  });

  it('MUTATION arrivedUnitIds-used: collector beats come ONLY from processCollectorArrivals deposits', () => {
    // the API accepts DepositEvent[] — there is no arrivedUnitIds input at all (structural), and the
    // deposit maps to the deposit key at priority 58; rival deposits are silent (NO-X-RAY precedent).
    const cues = mapCollectorBeats([deposit(PLAYER), deposit('rival-1')], PLAYER);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ key: 'collector_deposit', priority: 58, positional: false });
    expect(mapCollectorBeats([deposit(PLAYER, 0)], PLAYER)).toEqual([]); // nothing banked ⇒ no beat
    // an explicit arrival beat (future scene source) maps at 55; never synthesized from anywhere else
    const arr = mapCollectorBeats([], PLAYER, [{ collectorId: 'c', familyId: PLAYER }]);
    expect(arr[0]).toMatchObject({ key: 'collector_arrival', priority: 55 });
  });

  it('combat is a DUCKING side-chain only — F1 exposes the trigger, never a combat cue', () => {
    expect(combatDuckTriggered(0)).toBe(false);
    expect(combatDuckTriggered(3)).toBe(true);
  });
});
