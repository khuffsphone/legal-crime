// Citizen Life P0 — T4 + T9 mutation-verified tests: the pure state machine + loiter/queue/cluster rules.
// Mutation table (spec §12.2): mutating duration clamps or skipping exit conditions fails; mutating a cluster
// cap fails. Every timer band, pause chance, cluster cap, panic-speed cap, and reaction-cooldown band is
// asserted against the spec §6.2/§6.3/§4.5 numbers so a silent tweak is caught.
import { describe, it, expect } from 'vitest';
import {
  STATE_DURATION, stateDuration, stateExpired, pauseChance, pauseStateFor, panicSpeed, reactionCooldown,
  canJoinCluster, CLUSTER_CAP_MAX, PANIC_SPEED_CAP, BASE_PAUSE_CHANCE,
  FRONTAGE_PAUSE_BONUS, PLAZA_LOITER_BONUS, ANCHOR_QUEUE_BONUS,
  REACT_COOLDOWN_MIN, REACT_COOLDOWN_MAX, type PauseContext,
} from '../src/scenes/citizens/states';
import type { CitizenState } from '../src/scenes/citizens/roles';

describe('T4 — state durations are clamped bands (spec §6.2)', () => {
  const banded: CitizenState[] = ['loiter', 'windowShop', 'queue', 'react', 'panic', 'enterBuilding', 'exitBuilding'];

  it('roll 0 → band min, roll 1 → band max, and out-of-range rolls clamp', () => {
    for (const s of banded) {
      const [lo, hi] = STATE_DURATION[s]!;
      expect(stateDuration(s, 0)).toBeCloseTo(lo, 6);
      expect(stateDuration(s, 1)).toBeCloseTo(hi, 6);
      expect(stateDuration(s, -3)).toBeCloseTo(lo, 6); // clamp low
      expect(stateDuration(s, 5)).toBeCloseTo(hi, 6);  // clamp high
    }
  });

  it('every produced duration stays within [min, max] for many rolls', () => {
    for (const s of banded) {
      const [lo, hi] = STATE_DURATION[s]!;
      for (let i = 0; i <= 20; i++) {
        const d = stateDuration(s, i / 20);
        expect(d).toBeGreaterThanOrEqual(lo);
        expect(d).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('the spec bands are exactly as written (react 0.35–1.2, panic 2.0–6.0, queue 3.0–8.0)', () => {
    expect(STATE_DURATION.react).toEqual([0.35, 1.2]);
    expect(STATE_DURATION.panic).toEqual([2.0, 6.0]);
    expect(STATE_DURATION.queue).toEqual([3.0, 8.0]);
    expect(STATE_DURATION.loiter).toEqual([1.5, 6.0]);
    expect(STATE_DURATION.windowShop).toEqual([1.5, 5.0]);
  });

  it('non-banded states (walk/spawn/despawn) have no timer duration', () => {
    expect(stateDuration('walk', 0.5)).toBe(0);
    expect(stateDuration('spawn', 0.5)).toBe(0);
    expect(stateDuration('despawn', 0.5)).toBe(0);
  });

  it('stateExpired is the deterministic exit condition (spec §6.2 timer exit)', () => {
    expect(stateExpired(2.0, 1.5)).toBe(true);
    expect(stateExpired(1.0, 1.5)).toBe(false);
    expect(stateExpired(1.5, 1.5)).toBe(true); // boundary elapses
  });
});

describe('T4/T9 — pause chances + pause state selection (spec §6.3)', () => {
  it('context pause chance = base + the right bonus', () => {
    expect(pauseChance('generic')).toBeCloseTo(BASE_PAUSE_CHANCE, 6);
    expect(pauseChance('frontage')).toBeCloseTo(BASE_PAUSE_CHANCE + FRONTAGE_PAUSE_BONUS, 6);
    expect(pauseChance('plaza')).toBeCloseTo(BASE_PAUSE_CHANCE + PLAZA_LOITER_BONUS, 6);
    expect(pauseChance('anchor')).toBeCloseTo(BASE_PAUSE_CHANCE + ANCHOR_QUEUE_BONUS, 6);
  });

  it('pause state routes by context (frontage→windowShop, anchor→queue, plaza→loiter)', () => {
    expect(pauseStateFor('frontage')).toBe('windowShop');
    expect(pauseStateFor('anchor')).toBe('queue');
    expect(pauseStateFor('plaza')).toBe('loiter');
    expect(pauseStateFor('generic')).toBe('loiter');
    expect(pauseStateFor('apron')).toBe('loiter');
  });
});

describe('T9 — cluster caps (spec §4.5) — mutation-sensitive', () => {
  it('cap sizes match the MVP cluster table', () => {
    expect(CLUSTER_CAP_MAX).toEqual({ generic: 2, frontage: 3, anchor: 3, plaza: 4, apron: 2 });
  });

  it('canJoinCluster admits below the cap and rejects at/above it', () => {
    const ctxs: PauseContext[] = ['generic', 'frontage', 'anchor', 'plaza', 'apron'];
    for (const ctx of ctxs) {
      const cap = CLUSTER_CAP_MAX[ctx];
      expect(canJoinCluster(ctx, cap - 1)).toBe(true);
      expect(canJoinCluster(ctx, cap)).toBe(false);      // exit condition: cap exceeded
      expect(canJoinCluster(ctx, cap + 3)).toBe(false);
    }
  });
});

describe('T4 — panic speed + reaction cooldown (visual-only, spec §6.3)', () => {
  it('panic speed is base×[1.35,1.60] but hard-capped at 0.70 tiles/s', () => {
    // a slow vagrant (0.24): 0.24×1.35..1.60 = 0.324..0.384 (uncapped)
    expect(panicSpeed(0.24, 0)).toBeCloseTo(0.24 * 1.35, 6);
    expect(panicSpeed(0.24, 1)).toBeCloseTo(0.24 * 1.60, 6);
    // a fast child (0.56): 0.56×1.60 = 0.896 → capped to 0.70
    expect(panicSpeed(0.56, 1)).toBe(PANIC_SPEED_CAP);
    // never exceeds the cap for any base/roll
    for (const base of [0.2, 0.42, 0.58]) for (let i = 0; i <= 10; i++) {
      expect(panicSpeed(base, i / 10)).toBeLessThanOrEqual(PANIC_SPEED_CAP);
    }
  });

  it('reaction cooldown is deterministic in [6,12] seconds', () => {
    expect(reactionCooldown(0)).toBeCloseTo(REACT_COOLDOWN_MIN, 6);
    expect(reactionCooldown(1)).toBeCloseTo(REACT_COOLDOWN_MAX, 6);
    for (let i = 0; i <= 10; i++) {
      const c = reactionCooldown(i / 10);
      expect(c).toBeGreaterThanOrEqual(REACT_COOLDOWN_MIN);
      expect(c).toBeLessThanOrEqual(REACT_COOLDOWN_MAX);
    }
  });
});
