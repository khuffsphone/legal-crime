// Citizen Life P0 — T10 mutation-verified tests: the pure visible-crime reaction model. Mutation table
// (spec §12.2): mutating the event-visibility check or adding a heat write fails. NO-X-RAY (spec §7.2/§9.4):
// a hidden event drives NO reaction. The function is pure — it returns a reaction descriptor and CANNOT
// write heat/federal/economy/incidents (there is no state argument to touch), which is the structural
// guarantee this suite pins.
import { describe, it, expect } from 'vitest';
import { reactionFor, REACTION_MATRIX, type CitizenEvent } from '../src/scenes/citizens/reactions';

const at = (kind: CitizenEvent['kind'], gx: number, gy: number, visible = true): CitizenEvent => ({ kind, gx, gy, visible });

describe('T10 — visible in-range events trigger a reaction', () => {
  it('a visible combat event within radius yields pause or panic (never none)', () => {
    // citizen at origin, combat 2 tiles away (radius 5) → in range
    const r = reactionFor([at('combat', 2, 0)], 0, 0, 0.5);
    expect(r.kind === 'pause' || r.kind === 'panic').toBe(true);
    expect(r.eventKind).toBe('combat');
    expect(r.sourceGx).toBe(2);
  });

  it('panic-vs-pause follows the roll against the event band (combat 0.35–0.60)', () => {
    expect(reactionFor([at('combat', 1, 0)], 0, 0, 0.0).kind).toBe('panic'); // roll < panicChance
    expect(reactionFor([at('combat', 1, 0)], 0, 0, 0.99).kind).toBe('pause'); // roll ≥ panicChance
  });
});

describe('T10 — NO-X-RAY: hidden + out-of-range events never react (spec §7.2/§9.4)', () => {
  it('MUTATION: a hidden event (visible:false) yields NONE — the visibility check is load-bearing', () => {
    const r = reactionFor([at('combat', 1, 0, /* visible */ false)], 0, 0, 0.5);
    expect(r.kind).toBe('none');
    expect(r.eventKind).toBeNull();
  });

  it('an event beyond its trigger radius yields none', () => {
    // shakedown radius 3.5; place it 6 tiles away
    expect(reactionFor([at('shakedown', 6, 0)], 0, 0, 0.5).kind).toBe('none');
  });

  it('no events → none', () => {
    expect(reactionFor([], 0, 0, 0.5).kind).toBe('none');
  });
});

describe('T10 — overlap priority (spec §7.4)', () => {
  it('combat (priority 1) wins over a co-located shakedown (priority 3)', () => {
    const r = reactionFor([at('shakedown', 1, 0), at('combat', 1, 0)], 0, 0, 0.5);
    expect(r.eventKind).toBe('combat');
  });

  it('sabotage (2) wins over shakedown (3) but loses to downedBody (1)', () => {
    expect(reactionFor([at('shakedown', 1, 0), at('sabotage', 1, 0)], 0, 0, 0.5).eventKind).toBe('sabotage');
    expect(reactionFor([at('sabotage', 1, 0), at('downedBody', 1, 0)], 0, 0, 0.5).eventKind).toBe('downedBody');
  });
});

describe('T10 — purity: the reaction call mutates nothing', () => {
  it('does not mutate the events array or its members (no hidden state write)', () => {
    const events = Object.freeze([Object.freeze(at('combat', 1, 0))]) as readonly CitizenEvent[];
    // if reactionFor tried to write to the events (e.g. tag a witness flag), this would throw
    expect(() => reactionFor(events, 0, 0, 0.5)).not.toThrow();
  });

  it('the matrix has an entry for every event kind with a positive radius + priority', () => {
    for (const kind of Object.keys(REACTION_MATRIX) as (keyof typeof REACTION_MATRIX)[]) {
      const spec = REACTION_MATRIX[kind];
      expect(spec.radius).toBeGreaterThan(0);
      expect(spec.priority).toBeGreaterThanOrEqual(1);
      expect(spec.panicMin).toBeLessThanOrEqual(spec.panicMax);
    }
  });
});
