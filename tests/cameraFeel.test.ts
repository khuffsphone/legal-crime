// POLISH-PASS v2 · PACKAGE 3 — camera-feel math (no pixels). Locks the severity-banded hit-stop with its
// no-stacking lockout, the decaying-sine one-impulse nudge (clamped), and the focus easing through the
// caller's existing zoom stops.
import { describe, it, expect } from 'vitest';
import {
  HIT_STOP_MS, HIT_STOP_LOCKOUT_MS, NUDGE_MAX_PX,
  initHitStop, requestHitStop, worldFrozen,
  initNudge, requestNudge, nudgeOffset, screenNudge,
  focusEase, nearestZoomStop, cameraFeelForBeat,
  type BeatSeverity,
} from '../src/scenes/cameraFeel';

const ORDER: BeatSeverity[] = ['normalHit', 'kill', 'demolition', 'federalRaid', 'winLoss'];

describe('hit-stop — severity-banded, freezes WORLD time briefly', () => {
  it('durations are banded and ascending with severity', () => {
    for (let i = 1; i < ORDER.length; i++) {
      expect(HIT_STOP_MS[ORDER[i]]).toBeGreaterThan(HIT_STOP_MS[ORDER[i - 1]]);
    }
  });
  it('a request freezes world time for exactly its band, then thaws', () => {
    let s = initHitStop();
    s = requestHitStop(s, 'kill', 1000);
    expect(worldFrozen(s, 1000)).toBe(true);
    expect(worldFrozen(s, 1000 + HIT_STOP_MS.kill - 1)).toBe(true);
    expect(worldFrozen(s, 1000 + HIT_STOP_MS.kill)).toBe(false); // thawed at the band edge
  });
});

describe('hit-stop — NO stacking + lockout', () => {
  it('a second request inside the lockout is DROPPED (the window is not extended or summed)', () => {
    let s = initHitStop();
    s = requestHitStop(s, 'normalHit', 0);
    const until = s.until;
    // another hit mid-freeze (within lockout) must NOT push the freeze out
    s = requestHitStop(s, 'winLoss', 10);
    expect(s.until).toBe(until);                 // unchanged — no stacking
    expect(worldFrozen(s, until)).toBe(false);   // still thaws on schedule
  });
  it('after the lockout clears, a new request fires again', () => {
    let s = initHitStop();
    s = requestHitStop(s, 'normalHit', 0);
    const after = HIT_STOP_MS.normalHit + HIT_STOP_LOCKOUT_MS;
    s = requestHitStop(s, 'normalHit', after);   // lockout has cleared
    expect(worldFrozen(s, after)).toBe(true);
  });
});

describe('screen-nudge — decaying sine, one impulse, clamped', () => {
  it('is zero before/at the start and after it ends, and decays over its life', () => {
    expect(screenNudge(-5, 5, 200)).toBe(0);
    expect(screenNudge(0, 5, 200)).toBe(0);      // sin(0) = 0
    expect(screenNudge(200, 5, 200)).toBe(0);    // ended
    expect(screenNudge(500, 5, 200)).toBe(0);
    // envelope decays: a later peak is no larger than an earlier one of the same impulse
    const early = Math.abs(screenNudge(20, 6, 320));
    const late = Math.abs(screenNudge(260, 6, 320));
    expect(late).toBeLessThanOrEqual(early + 1e-9);
  });
  it('never exceeds the clamp, even with a huge amplitude', () => {
    for (let e = 0; e <= 300; e += 7) {
      const v = Math.abs(screenNudge(e, 9999, 300));
      expect(v).toBeLessThanOrEqual(NUDGE_MAX_PX + 1e-9);
    }
  });
  it('a new request REPLACES the impulse (one-impulse, not summed)', () => {
    let n = initNudge();
    n = requestNudge(n, 'demolition', 100); // amp 5
    n = requestNudge(n, 'normalHit', 110);  // amp 1.5 — REPLACES, does not add
    expect(n.amp).toBe(1.5);
    expect(n.start).toBe(110);
    const off = nudgeOffset(n, 110);
    expect(Math.abs(off.dx)).toBeLessThanOrEqual(NUDGE_MAX_PX);
  });
});

describe('focus easing — through the existing zoom stops (reused, not duplicated)', () => {
  it('eases toward the target; factor 1 lands, factor 0 holds', () => {
    expect(focusEase(0.6, 1.0, 1)).toBeCloseTo(1.0, 6);
    expect(focusEase(0.6, 1.0, 0)).toBeCloseTo(0.6, 6);
    const mid = focusEase(0.6, 1.0, 0.22);
    expect(mid).toBeGreaterThan(0.6);
    expect(mid).toBeLessThan(1.0);
  });
  it('converges toward the target over repeated steps', () => {
    let z = 0.35;
    for (let i = 0; i < 60; i++) z = focusEase(z, 1.0, 0.22);
    expect(z).toBeCloseTo(1.0, 3);
  });
  it('nearestZoomStop snaps to the closest of the CALLER\'s stops', () => {
    const STOPS = [1.0, 0.6, 0.35] as const; // the existing ZOOM_STOPS, passed in
    expect(nearestZoomStop(0.95, STOPS)).toBe(1.0);
    expect(nearestZoomStop(0.55, STOPS)).toBe(0.6);
    expect(nearestZoomStop(0.30, STOPS)).toBe(0.35);
  });
});

describe('beat → feel mapping', () => {
  it('maps a severity to its hit-stop + nudge profile', () => {
    const f = cameraFeelForBeat('demolition');
    expect(f.hitStopMs).toBe(HIT_STOP_MS.demolition);
    expect(f.nudgeAmp).toBeGreaterThan(0);
    expect(f.nudgeMs).toBeGreaterThan(0);
  });
});
