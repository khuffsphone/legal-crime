// COMBAT READABILITY — health-bar view math + downed-body persistence (state/math only, no pixels).
// ⭐ a damaged unit reports the health value the bar shows; ⭐ a downed unit persists as a body before
// cleanup (not instant-deleted).
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { spawnUnit, spawnEnforcer, type MovableUnit } from '../src/sim/movement';
import { update } from '../src/sim/realtime';
import { THUG_MAX_HEALTH } from '../src/sim/constants';
import { healthFraction, isDamaged, shouldShowHealthBar, isCritical, showTargetReticle } from '../src/scenes/combatReadout';
import {
  recordDownedBody, advanceDownedBodies, downedBodyDecay, DOWNED_BODY_PERSIST_SECONDS, type DownedBody,
} from '../src/sim/downedBodies';
import type { CombatEvent } from '../src/sim/combat';

describe('health-bar view — the bar shows the unit\'s real health (lazy field read safely)', () => {
  it('a fresh unit (no health field) reads as FULL and shows no bar out of combat', () => {
    const u = spawnUnit('p', 5, 5);
    expect(u.health).toBeUndefined();              // lazy — absent until first hit
    expect(healthFraction(u)).toBe(1);
    expect(isDamaged(u)).toBe(false);
    expect(shouldShowHealthBar(u, false)).toBe(false); // hidden at full + out of combat (restraint)
  });
  it('⭐ a DAMAGED unit reports the exact health the bar fills to', () => {
    const u: MovableUnit = { ...spawnUnit('p', 5, 5), health: 40 };
    expect(healthFraction(u)).toBeCloseTo(40 / THUG_MAX_HEALTH, 6); // bar fill == health/max == 0.4
    expect(healthFraction(u) * THUG_MAX_HEALTH).toBe(u.health);     // the bar reflects the real value
    expect(isDamaged(u)).toBe(true);
    expect(shouldShowHealthBar(u, false)).toBe(true);              // damaged → shown even out of combat
    expect(isCritical(u)).toBe(false);
  });
  it('a full-health unit shows the bar ONLY while in combat (the readability cue)', () => {
    const u = spawnUnit('p', 5, 5);
    expect(shouldShowHealthBar(u, true)).toBe(true);
    expect(shouldShowHealthBar(u, false)).toBe(false);
  });
  it('a near-dead unit reads as critical; a downed unit never shows a bar', () => {
    expect(isCritical({ ...spawnUnit('p', 5, 5), health: 20 })).toBe(true);
    expect(shouldShowHealthBar({ ...spawnUnit('p', 5, 5), health: 0, downed: true }, true)).toBe(false);
  });
  it('clamps a weird health value', () => {
    expect(healthFraction({ ...spawnUnit('p', 5, 5), health: 999 })).toBe(1);
    expect(healthFraction({ ...spawnUnit('p', 5, 5), health: -50 })).toBe(0);
  });
});

const DOWN_EV: CombatEvent = { kind: 'down', attackerId: 'a', unitId: 'r', faction: 'rival-a', gx: 6, gy: 5 };

describe('downed-body persistence — a body, not an instant delete', () => {
  it('records a body from a down beat (and dedupes / ignores non-down)', () => {
    let bodies: DownedBody[] = [];
    bodies = recordDownedBody(bodies, DOWN_EV);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ id: 'r', factionId: 'rival-a', gx: 6, gy: 5, ageSec: 0 });
    bodies = recordDownedBody(bodies, DOWN_EV);          // same unit downs once
    expect(bodies).toHaveLength(1);
    bodies = recordDownedBody(bodies, { ...DOWN_EV, kind: 'hit' }); // a hit is not a body
    expect(bodies).toHaveLength(1);
  });
  it('ages then CULLS the body after the persist window (and fades over it)', () => {
    let bodies = recordDownedBody([], DOWN_EV);
    expect(downedBodyDecay(bodies[0])).toBe(0);
    // age to just under the window — still present, decaying toward 1
    bodies = advanceDownedBodies(bodies, DOWNED_BODY_PERSIST_SECONDS - 0.5);
    expect(bodies).toHaveLength(1);
    expect(downedBodyDecay(bodies[0])).toBeGreaterThan(0.8);
    // age past the window — culled
    bodies = advanceDownedBodies(bodies, 1);
    expect(bodies).toHaveLength(0);
  });
});

describe('⭐ end-to-end: a downed unit PERSISTS as a body before cleanup (not instant-deleted)', () => {
  it('through the real-time wrapper: down → body lingers in state → culled after the window', () => {
    const s = createInitialState(1, { bigCity: true });
    // a tough player thug next to a rival so the rival downs first and persists as a body
    const thug: MovableUnit = { ...spawnUnit('p', 5, 5), factionId: s.player.id, health: THUG_MAX_HEALTH };
    const rival = spawnEnforcer('r', 6, 5, 'rival-a');
    s.units = [thug, rival];

    // step until the rival is downed + removed from play (the 35a instant-delete still happens)…
    let downedSeen = false;
    for (let i = 0; i < 400 && !downedSeen; i++) {
      const res = update(s, 0.1, 1e9);
      if (res.combat.some((e) => e.kind === 'down')) downedSeen = true;
    }
    expect(downedSeen).toBe(true);
    expect(s.units.some((u) => u.id === 'r')).toBe(false);          // the live unit IS gone from the fight…
    // …BUT it persists as a desaturated BODY (the fix — not an instant disappear).
    expect(s.downedBodies?.some((b) => b.id === 'r')).toBe(true);

    // keep time running past the persist window → the body is cleaned up.
    for (let i = 0; i < Math.ceil(DOWNED_BODY_PERSIST_SECONDS / 0.1) + 2; i++) update(s, 0.1, 1e9);
    expect(s.downedBodies?.some((b) => b.id === 'r') ?? false).toBe(false);
  });
});

describe('⭐ target reticle — NO-X-RAY (only a visible target is ever marked)', () => {
  const living = { downed: false };
  const dead = { downed: true };

  it('marks a living target ONLY when it is visible (revealed + on-screen)', () => {
    expect(showTargetReticle(living, true)).toBe(true);
    expect(showTargetReticle(living, false)).toBe(false); // fog-hidden / off-screen → NEVER marked (NO-X-RAY)
  });

  it('never marks a downed target, even if visible', () => {
    expect(showTargetReticle(dead, true)).toBe(false);
  });

  it('never marks a non-existent target', () => {
    expect(showTargetReticle(null, true)).toBe(false);
    expect(showTargetReticle(undefined, true)).toBe(false);
  });
});
