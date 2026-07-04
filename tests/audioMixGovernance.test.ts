// AUDIO E-H — Ticket H1 (mix governance): the 4 conceptual buses (R3 gain-groups), the H.2 ducking
// matrix, the H.3 steal policy, and the H.4 master rate caps. Mutation-table driven.
import { describe, it, expect } from 'vitest';
import {
  ATMOSPHERE_BUSES, BUS_TO_AUDIO_BUS, BUS_BUDGETS, CUE_PRIORITY, COMBAT_ONESHOT_PRIORITY,
  DISTRICT_BED_PRIORITY, PROP_ANCHOR_PRIORITY, PROP_RHYTHM_PRIORITY, cuePriority, dbToGain,
} from '../src/scenes/audio/atmosphereIntents';
import {
  ABSOLUTE_STARTS_PER_SEC, DUCK_MATRIX, admitCue, chooseSteal, combineDucks, createRateLimiterState,
  duckFor, orderCues, type ActiveVoice,
} from '../src/scenes/audio/mixGovernance';

describe('H1 — buses (R3) + priorities (mutation table)', () => {
  it('exactly 4 conceptual buses, each mapped onto a REAL AudioManager bus (gain-group policy)', () => {
    expect(ATMOSPHERE_BUSES).toEqual(['music', 'beds', 'emitters', 'oneshots']);
    expect(BUS_TO_AUDIO_BUS).toEqual({ music: 'music', beds: 'ambience', emitters: 'sfx', oneshots: 'sfx' });
    expect(BUS_BUDGETS).toEqual({ beds: 4, emitters: 8, oneshots: 6 });
  });

  it('MUTATION beds-outrank-event-one-shots: the H.3 ladder holds top to bottom', () => {
    expect(cuePriority('federal_raid')).toBe(100);
    expect(cuePriority('federal_armed')).toBe(98);
    expect(cuePriority('federal_watch')).toBe(96);
    expect(cuePriority('federal_notice')).toBe(95);
    expect(cuePriority('police_raid_bust')).toBe(90);
    expect(COMBAT_ONESHOT_PRIORITY).toBe(85);
    expect(cuePriority('federal_cooldown')).toBe(80);
    expect(cuePriority('interception_collector_robbed')).toBe(75);
    expect(cuePriority('extortion_sabotage_sabotaged')).toBe(70);
    expect(cuePriority('collector_deposit')).toBe(58);
    expect(cuePriority('collector_arrival')).toBe(55);
    expect(cuePriority('player_offense_raid')).toBe(45);
    expect(PROP_RHYTHM_PRIORITY).toBe(35);
    expect(PROP_ANCHOR_PRIORITY).toBe(25);
    expect(DISTRICT_BED_PRIORITY).toBe(15);
    // every event key outranks every prop/bed class — beds can never outrank an event one-shot
    const minEvent = Math.min(...Object.values(CUE_PRIORITY));
    expect(minEvent).toBeGreaterThan(PROP_RHYTHM_PRIORITY);
    expect(cuePriority('prop_bench_creak')).toBe(PROP_RHYTHM_PRIORITY);
    expect(cuePriority('prop_fountain_loop')).toBe(PROP_ANCHOR_PRIORITY);
    expect(cuePriority('bed_docks_base')).toBe(DISTRICT_BED_PRIORITY);
  });
});

describe('H1 — ducking matrix (mutation table)', () => {
  it('MUTATION combat-duck-removed: combat ducks the beds (−6) — REQUIRED', () => {
    expect(DUCK_MATRIX.combat.targetsDb).toEqual({ music: 0, beds: -6, emitters: -3, oneshots: 0 });
    expect(DUCK_MATRIX.combat.attackMs).toBe(30);
    expect(DUCK_MATRIX.combat.holdMs).toBe(250);
    expect(DUCK_MATRIX.combat.releaseMs).toBe(1100);
  });

  it('MUTATION federal-ducks-beds-only: the federal_raid duck hits ALL groups (strongest in the game)', () => {
    expect(DUCK_MATRIX.federal_raid.targetsDb).toEqual({ music: -4, beds: -10, emitters: -10, oneshots: -5 });
    expect(DUCK_MATRIX.federal_raid.releaseMs).toBe(1800);
    expect(DUCK_MATRIX.federal_notice.targetsDb.music).toBe(-2); // not just beds — music too
    expect(DUCK_MATRIX.federal_watch.targetsDb).toEqual({ music: -3, beds: -8, emitters: -8, oneshots: -4 });
  });

  it('police trio duck lighter than federal; collector beats are the gentlest; player raid not police-coded', () => {
    for (const k of ['police_raid_cash', 'police_raid_operation', 'police_raid_bust']) {
      expect(DUCK_MATRIX[k].targetsDb).toEqual({ music: -2, beds: -5, emitters: -5, oneshots: -2 });
    }
    expect(DUCK_MATRIX.collector_deposit.targetsDb).toEqual({ music: 0, beds: -2, emitters: -3, oneshots: 0 });
    expect(DUCK_MATRIX.player_offense_raid.targetsDb).toEqual({ music: 0, beds: -4, emitters: -4, oneshots: -1 });
    expect(duckFor('prop_bench_creak')).toBeNull(); // props never duck anything
    expect(duckFor('combat')?.op).toBe('duck');
  });

  it('combineDucks takes the DEEPEST offset per group, never the sum', () => {
    const a = duckFor('combat')!;
    const b = duckFor('federal_raid')!;
    expect(combineDucks([a, b])).toEqual({ music: -4, beds: -10, emitters: -10, oneshots: -5 });
    expect(combineDucks([a, a])).toEqual({ music: 0, beds: -6, emitters: -3, oneshots: 0 }); // idempotent, not −12
    expect(dbToGain(-6)).toBeCloseTo(0.5012, 3);
  });
});

describe('H1 — steal policy (mutation table)', () => {
  const voice = (key: string, priority: number, over: Partial<ActiveVoice> = {}): ActiveVoice =>
    ({ key, priority, kind: 'oneShot', positional: false, startedMs: 0, ...over });

  it('MUTATION prop-rhythm-steals-federal: an active federal warning is NEVER stolen', () => {
    const active = [voice('federal_watch', 96), voice('prop_bench_creak', 35)];
    const victim = chooseSteal(active, { priority: 100 });
    expect(victim?.key).toBe('prop_bench_creak'); // even a federal_raid incomer takes the prop, not the warning
    const onlyFederal = [voice('federal_notice', 95)];
    expect(chooseSteal(onlyFederal, { priority: 100 })).toBeNull(); // nothing stealable ⇒ drop the incomer
  });

  it('steals lowest priority first; ties: positional→farthest, non-positional→oldest; never steals upward', () => {
    const active = [
      voice('collector_arrival', 55, { startedMs: 100 }),
      voice('prop_vendor_cart_clatter', 35, { positional: true, distPx: 100, startedMs: 50 }),
      voice('prop_bench_creak', 35, { positional: true, distPx: 500, startedMs: 60 }),
    ];
    expect(chooseSteal(active, { priority: 90 })?.key).toBe('prop_bench_creak'); // lowest rank, farthest
    const olds = [voice('door_a', 40, { startedMs: 10 }), voice('door_b', 40, { startedMs: 5 })];
    expect(chooseSteal(olds, { priority: 60 })?.key).toBe('door_b'); // oldest non-positional
    expect(chooseSteal(olds, { priority: 40 })).toBeNull(); // equal priority is NOT stealable
  });
});

describe('H1 — H.4 master rate caps (mutation table)', () => {
  it('MUTATION duplicate-cooldowns-disabled: event 1 s / police 1.5 s / prop 8 s / federal same-tier 2 s', () => {
    let s = createRateLimiterState();
    const at = (key: string, t: number) => { const d = admitCue(s, { key }, t); s = d.state; return d.verdict; };
    expect(at('collector_deposit', 0)).toBe('admit');
    expect(at('collector_deposit', 900)).toBe('drop-duplicate');   // inside 1 s
    expect(at('collector_deposit', 1001)).toBe('admit');
    expect(at('police_raid_bust', 2000)).toBe('admit');
    expect(at('police_raid_bust', 3400)).toBe('drop-duplicate');   // inside 1.5 s
    expect(at('police_raid_bust', 3501)).toBe('admit');
    expect(at('prop_bench_creak', 4000)).toBe('admit');
    expect(at('prop_bench_creak', 11_000)).toBe('drop-duplicate'); // inside 8 s
    expect(at('prop_bench_creak', 12_001)).toBe('admit');
    expect(at('federal_watch', 20_000)).toBe('admit');
    expect(at('federal_watch', 21_500)).toBe('drop-duplicate');    // same tier inside 2 s
    expect(at('federal_watch', 22_001)).toBe('admit');
  });

  it('MUTATION federal-crossing-dropped: a federal tier crossing bypasses EVERY rate cap', () => {
    let s = createRateLimiterState();
    // saturate the absolute 10/s window
    for (let i = 0; i < ABSOLUTE_STARTS_PER_SEC; i++) {
      const d = admitCue(s, { key: `extortion_shakedown_converted`, dedupeKey: `k${i}` }, 1000 + i);
      s = d.state;
    }
    const blocked = admitCue(s, { key: 'collector_deposit' }, 1020);
    expect(blocked.verdict).toBe('drop-rate'); // a normal cue IS rate-dropped
    const federal = admitCue(blocked.state, { key: 'federal_raid' }, 1020);
    expect(federal.verdict).toBe('admit');     // the crossing is NEVER dropped
  });

  it('prop starts cap at 4/s (non-critical atmosphere) independently of the event budget', () => {
    let s = createRateLimiterState();
    for (let i = 0; i < 4; i++) {
      const d = admitCue(s, { key: 'prop_street_lamp_tick', dedupeKey: `p${i}` }, 1000 + i);
      s = d.state;
      expect(d.verdict).toBe('admit');
    }
    const fifth = admitCue(s, { key: 'prop_awning_flap', dedupeKey: 'p5' }, 1010);
    expect(fifth.verdict).toBe('drop-rate');
    const event = admitCue(fifth.state, { key: 'collector_deposit' }, 1011);
    expect(event.verdict).toBe('admit'); // the event budget is separate
  });

  it('orderCues plays highest priority first, stable within a rank', () => {
    const cues = [
      { key: 'collector_arrival', priority: 55 },
      { key: 'federal_raid', priority: 100 },
      { key: 'player_offense_raid', priority: 45 },
      { key: 'police_raid_cash', priority: 90 },
    ];
    expect(orderCues(cues).map((c) => c.key)).toEqual(['federal_raid', 'police_raid_cash', 'collector_arrival', 'player_offense_raid']);
  });
});
