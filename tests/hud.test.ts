import { describe, it, expect } from 'vitest';
import {
  formatCountdown,
  familyHudView,
  realtimeHudView,
  topFederalWarning,
  anyMutinyPrimed,
} from '../src/sim/hud';
import { createInitialState } from '../src/sim/state';
import { update } from '../src/sim/realtime';
import { advanceClock } from '../src/sim/clock';
import { triggerShock, incomeShockMultiplier } from '../src/sim/shocks';
import { federalExposure, fedWarningTier } from '../src/sim/federal';
import { mutinyConditionMet } from '../src/sim/gangsters';
import {
  WEEK_DURATION_SECONDS,
  FED_WARN_TIER_1,
  FED_WARN_TIER_2,
  FED_WARN_TIER_3,
  FED_ARM_DELAY,
  DESERT_LOYALTY,
} from '../src/sim/constants';
import type { Gangster } from '../src/sim/types';

function gangster(id: string, loyalty: number): Gangster {
  return { id, name: id, skill: 3, loyalty, upkeep: 30, assignment: { type: 'idle' } };
}

describe('formatCountdown', () => {
  it('formats seconds as M:SS and clamps negatives', () => {
    expect(formatCountdown(90)).toBe('1:30');
    expect(formatCountdown(5)).toBe('0:05');
    expect(formatCountdown(125)).toBe('2:05');
    expect(formatCountdown(-3)).toBe('0:00');
  });
});

describe('week countdown reflects WEEK_DURATION_SECONDS', () => {
  it('counts down from the full duration and tracks progress as time accrues', () => {
    const s = createInitialState(1);
    let hud = realtimeHudView(s);
    expect(hud.secondsUntilNextWeek).toBe(WEEK_DURATION_SECONDS);
    expect(hud.weekProgress).toBe(0);
    expect(hud.weekCountdownLabel).toBe('2:00'); // 120s default

    advanceClock(s, 30); // 30s into the week
    hud = realtimeHudView(s);
    expect(hud.secondsUntilNextWeek).toBe(WEEK_DURATION_SECONDS - 30);
    expect(hud.weekProgress).toBeCloseTo(30 / WEEK_DURATION_SECONDS);
    expect(hud.weekCountdownLabel).toBe('1:30');
  });

  it('honors a configured (short) week duration', () => {
    const s = createInitialState(1);
    advanceClock(s, 4, 10); // 4s into a 10s week
    const hud = realtimeHudView(s, 10);
    expect(hud.secondsUntilNextWeek).toBe(6);
    expect(hud.weekProgress).toBeCloseTo(0.4);
  });
});

describe('federal warning ladder surfaces (50/70/85)', () => {
  it('reports the tier and message for each exposure band', () => {
    const s = createInitialState(1);
    // heat alone drives exposure here (no dirty hoard, no relief).
    s.player.heat = FED_WARN_TIER_1;
    expect(familyHudView(s.player).federalTier).toBe(1);
    s.player.heat = FED_WARN_TIER_2;
    expect(familyHudView(s.player).federalTier).toBe(2);
    s.player.heat = FED_WARN_TIER_3;
    const v = familyHudView(s.player);
    expect(v.federalTier).toBe(3);
    expect(v.federalExposure).toBeGreaterThanOrEqual(FED_WARN_TIER_3);
    expect(v.federalMessage).toMatch(/imminent/i);
    expect(topFederalWarning(s)).toEqual({ tier: 3, message: v.federalMessage });
  });

  it('is clear (tier 0, null banner) when exposure is low', () => {
    const s = createInitialState(1);
    expect(familyHudView(s.player).federalTier).toBe(0);
    expect(familyHudView(s.player).federalMessage).toBe('');
    expect(topFederalWarning(s)).toBeNull();
  });
});

describe('federal logic stays green UNDER THE REAL-TIME DRIVER', () => {
  it('a hot, dirty player arms a bust as weeks settle via update(), and the HUD shows it', () => {
    const s = createInitialState(1);
    s.player.heat = 95;
    s.player.dirtyCash = 9000;
    s.player.cash = 9000;
    // Exposure should already be at the imminent band.
    expect(fedWarningTier(federalExposure(s.player))).toBe(3);

    // Drive several short weeks; resolveFederalWarnings runs inside each economic tick.
    for (let i = 0; i < FED_ARM_DELAY + 2; i++) update(s, 1, 1);

    const hud = realtimeHudView(s, 1);
    expect(hud.player.federalTier).toBe(3);
    expect(hud.player.bustArmed).toBe(true); // the existing arming logic fired under the driver
    expect(s.log.some((e) => e.kind === 'fed-warning' || e.kind === 'fed-armed')).toBe(true);
  });
});

describe('mutiny risk surfaces and stays green under the driver', () => {
  it('counts at-risk crew and flags an imminent mutiny', () => {
    const s = createInitialState(1);
    s.player.gangsters = [
      gangster('a', DESERT_LOYALTY - 5),
      gangster('b', DESERT_LOYALTY - 5),
      gangster('c', DESERT_LOYALTY - 5),
    ];
    const v = familyHudView(s.player);
    expect(v.mutinyRisk).toBe(3);
    expect(v.mutinyImminent).toBe(true);
    expect(mutinyConditionMet(s.player)).toBe(true); // HUD matches the existing predicate
    expect(anyMutinyPrimed(s)).toBe(true);
  });

  it('a loyal crew shows no mutiny risk', () => {
    const s = createInitialState(1);
    s.player.gangsters = [gangster('a', 90), gangster('b', 90)];
    const v = familyHudView(s.player);
    expect(v.mutinyRisk).toBe(0);
    expect(v.mutinyImminent).toBe(false);
  });
});

describe('shocks surface and resolve under the driver', () => {
  it('an active boom shows in the HUD and ages out as weeks settle', () => {
    const s = createInitialState(1);
    s.shocksEnabled = true;
    triggerShock(s, 'boom');
    expect(incomeShockMultiplier(s)).toBeGreaterThan(1); // boom is in effect

    let hud = realtimeHudView(s);
    expect(hud.shocks.some((sh) => sh.kind === 'boom')).toBe(true);
    const boomTtl = hud.shocks.find((sh) => sh.kind === 'boom')!.ticksRemaining;

    update(s, 1, 1); // one week settles -> resolveShocks ages the boom
    hud = realtimeHudView(s);
    const after = hud.shocks.find((sh) => sh.kind === 'boom');
    expect(after === undefined || after.ticksRemaining < boomTtl).toBe(true);
  });
});

describe('realtimeHudView — full snapshot shape', () => {
  it('includes the week, the player, every rival, and never mutates state', () => {
    const s = createInitialState(1);
    const before = JSON.stringify(s);
    const hud = realtimeHudView(s);
    expect(hud.week).toBe(0);
    expect(hud.player.familyId).toBe('player');
    expect(hud.rivals.map((r) => r.familyId)).toEqual(['rival-a', 'rival-b']);
    expect(hud.status).toBe('playing');
    expect(JSON.stringify(s)).toBe(before); // pure read
  });
});
