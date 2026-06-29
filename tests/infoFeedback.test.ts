// INFO-FEEDBACK — state/math tests (never pixels) for the event adapter, the log store, the edge-alert
// geometry, and the minimap math — encoding the 6 canon rulings.
import { describe, it, expect } from 'vitest';
import {
  EVENT_TAXONOMY, metaFor, combatEventKind, extortionEventKind, captureEventKind,
} from '../src/scenes/info/infoEvents';
import {
  initLog, pushLog, MAX_LOG, COMBAT_THROTTLE_MS, latestUnreadPositional, markRead, unreadCount,
} from '../src/scenes/info/logStore';
import { edgeAlertMarker } from '../src/scenes/info/edgeAlerts';
import {
  worldToMinimap, minimapToWorld, isInMinimap, cameraViewportRect, districtControlColor, minimapRivalBlips, minimapPlayerBlips,
  type MiniUnit, type MiniRect,
} from '../src/scenes/info/minimapMath';
import { SPEC } from '../src/scenes/visualSpec';

describe('event adapter — a sim event maps to the right taxonomy entry', () => {
  it('a front conversion → front.converted (a positional ping, no dedupe)', () => {
    const k = extortionEventKind({ converted: true, retook: false, failed: false });
    expect(k).toBe('front.converted');
    expect(metaFor(k!).positional).toBe(true);
    expect(metaFor(k!).dedupe).toBe(false);
    expect(metaFor(k!).ping).toBe(true);
  });
  it('a collector robbery → collector.robbed + creates an ALERT and a PING', () => {
    const m = metaFor('collector.robbed');
    expect(m.alert).toBe(true);
    expect(m.ping).toBe(true);
    expect(m.dedupe).toBe(false); // a state change never dedupes (#4)
  });
  it('a combat DOWN is a state change (unit.down, no dedupe); a HIT is a throttled beat (combat.hit)', () => {
    expect(combatEventKind('down')).toBe('unit.down');
    expect(metaFor('unit.down').dedupe).toBe(false);
    expect(combatEventKind('hit')).toBe('combat.hit');
    expect(metaFor('combat.hit').dedupe).toBe(true);   // #4 — combat beats throttle
    expect(metaFor('combat.hit').alert).toBe(false);
    expect(metaFor('combat.hit').ping).toBe(false);
  });
  it('captures map to district.lost / district.captured', () => {
    expect(captureEventKind(true)).toBe('district.lost');
    expect(captureEventKind(false)).toBe('district.captured');
  });
  it('⚠ #3 — FEDERAL is global: logged + critical, but NO directional alert and NO ping', () => {
    const m = metaFor('federal.threshold');
    expect(m.tier).toBe('critical');
    expect(m.positional).toBe(false);
    expect(m.alert).toBe(false); // no edge arrow
    expect(m.ping).toBe(false);  // no minimap ping
  });
  it('every taxonomy entry is internally consistent (non-positional ⇒ no alert/ping)', () => {
    for (const meta of Object.values(EVENT_TAXONOMY)) {
      if (!meta.positional) { expect(meta.alert).toBe(false); expect(meta.ping).toBe(false); }
    }
  });
});

describe('the log store — state changes never dedupe; combat beats throttle (#4)', () => {
  it('two distinct state changes both append (never deduped)', () => {
    let s = initLog();
    s = pushLog(s, { kind: 'front.converted', message: 'a', t: 0 });
    s = pushLog(s, { kind: 'collector.robbed', message: 'b', t: 10 });
    expect(s.entries).toHaveLength(2);
  });
  it('rapid combat hits COALESCE into one row with a count', () => {
    let s = initLog();
    s = pushLog(s, { kind: 'combat.hit', message: 'swing', t: 0 });
    s = pushLog(s, { kind: 'combat.hit', message: 'swing', t: 200 });
    s = pushLog(s, { kind: 'combat.hit', message: 'swing', t: 400 });
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0].count).toBe(3);
  });
  it('a combat hit past the throttle window starts a NEW row', () => {
    let s = initLog();
    s = pushLog(s, { kind: 'combat.hit', message: 'x', t: 0 });
    s = pushLog(s, { kind: 'combat.hit', message: 'x', t: COMBAT_THROTTLE_MS + 1 });
    expect(s.entries).toHaveLength(2);
  });
  it('a state change between combat beats breaks the coalesce chain', () => {
    let s = initLog();
    s = pushLog(s, { kind: 'combat.hit', message: 'x', t: 0 });
    s = pushLog(s, { kind: 'unit.down', message: 'down', t: 100, gx: 5, gy: 5 });
    s = pushLog(s, { kind: 'combat.hit', message: 'x', t: 150 });
    expect(s.entries).toHaveLength(3); // the down is between → the second hit can't merge into the first
  });
  it('caps at MAX_LOG, retaining CRITICAL events longer than info', () => {
    let s = initLog();
    s = pushLog(s, { kind: 'hq.attack', message: 'CRITICAL', t: 0, gx: 1, gy: 1 }); // critical, oldest
    for (let i = 0; i < MAX_LOG + 50; i++) s = pushLog(s, { kind: 'district.captured', message: `n${i}`, t: 1000 + i, gx: 2, gy: 2 });
    expect(s.entries.length).toBeLessThanOrEqual(MAX_LOG);
    expect(s.entries.some((e) => e.kind === 'hq.attack')).toBe(true); // the critical event survived the cap
  });
  it('unread tracking + jump-to-latest-positional + mark-read', () => {
    let s = initLog();
    s = pushLog(s, { kind: 'federal.threshold', message: 'fed', t: 0 });           // unread, non-positional
    s = pushLog(s, { kind: 'unit.down', message: 'down', t: 1, gx: 7, gy: 8 });     // unread, positional (newest)
    const j = latestUnreadPositional(s)!;
    expect(j.gx).toBe(7);
    expect(unreadCount(s)).toBe(2);
    s = markRead(s, j.id);
    expect(s.entries.find((e) => e.id === j.id)!.unread).toBe(false);
  });
});

describe('edge alerts — clamp to the viewport + point toward the event', () => {
  const W = 800, H = 600, M = 28;
  it('an on-screen event needs no edge marker', () => {
    const m = edgeAlertMarker(400, 300, W, H, M);
    expect(m.onScreen).toBe(true);
    expect(m.x).toBe(400); expect(m.y).toBe(300);
  });
  it('an off-screen event clamps inside the inset viewport and points at it', () => {
    const m = edgeAlertMarker(2000, 300, W, H, M); // far to the RIGHT
    expect(m.onScreen).toBe(false);
    expect(m.x).toBeLessThanOrEqual(W - M + 1e-6);
    expect(m.x).toBeGreaterThanOrEqual(M - 1e-6);
    expect(m.y).toBeGreaterThanOrEqual(M - 1e-6);
    expect(m.y).toBeLessThanOrEqual(H - M + 1e-6);
    expect(Math.cos(m.angleRad)).toBeGreaterThan(0); // arrow points right, toward the event
    // an event far UP-LEFT points up-left
    const ul = edgeAlertMarker(-500, -500, W, H, M);
    expect(Math.cos(ul.angleRad)).toBeLessThan(0);
    expect(Math.sin(ul.angleRad)).toBeLessThan(0);
  });
});

describe('minimap — projection, control colours, click target, ⚠ fog exclusion (#5)', () => {
  const rect: MiniRect = { x: 10, y: 10, w: 192, h: 192 };
  const SIZE = 96;
  it('world→minimap and minimap→world are consistent + clamped', () => {
    const p = worldToMinimap(48, 48, rect, SIZE);
    expect(p.x).toBeCloseTo(rect.x + rect.w / 2, 6);
    expect(p.y).toBeCloseTo(rect.y + rect.h / 2, 6);
    const back = minimapToWorld(p.x, p.y, rect, SIZE);
    expect(back).toEqual({ gx: 48, gy: 48 });
    // a click outside the rect is rejected, a corner click clamps into the world
    expect(isInMinimap(5, 5, rect)).toBe(false);
    expect(minimapToWorld(rect.x - 50, rect.y - 50, rect, SIZE)).toEqual({ gx: 0, gy: 0 });
  });
  it('district control → the right palette colours (player brass / rival static / contested amber / neutral)', () => {
    expect(districtControlColor('player')).toBe(SPEC.brass);
    expect(districtControlColor('rival')).toBe(SPEC.rival);   // #9e1b1b static identity
    expect(districtControlColor('rival')).not.toBe(SPEC.danger); // not a motion-danger red
    expect(districtControlColor('contested')).toBe(SPEC.windowLit); // amber
    expect(districtControlColor('neutral')).toBe(SPEC.fog);
  });
  it('player blips always show; ⚠ a FOG-HIDDEN rival produces NO blip (ruling #5)', () => {
    const units: MiniUnit[] = [
      { gx: 5, gy: 5, faction: 'player' },
      { gx: 9, gy: 9, faction: 'rival' },   // on a REVEALED tile → shows
      { gx: 80, gy: 80, faction: 'rival' }, // on a FOG-HIDDEN tile → MUST NOT show
    ];
    const revealed = (gx: number, gy: number) => gx < 50 && gy < 50; // only the near corner is revealed
    expect(minimapPlayerBlips(units)).toHaveLength(1);
    const rivals = minimapRivalBlips(units, revealed);
    expect(rivals).toHaveLength(1);                 // the hidden rival is excluded
    expect(rivals[0]).toMatchObject({ gx: 9, gy: 9 });
    expect(rivals.some((r) => r.gx === 80)).toBe(false); // ⚠ no x-ray of the fog-hidden rival
  });
});

describe('minimap — B5: the camera POV box is a RECTANGLE (not a degenerate line) and tracks pan/zoom', () => {
  const rect: MiniRect = { x: 10, y: 10, w: 192, h: 192 };
  const SIZE = 96;
  // the iso screen-rect projects to a DIAMOND in grid space; these are its four corners (gx,gy).
  const diamond = [{ gx: 40, gy: 20 }, { gx: 60, gy: 40 }, { gx: 40, gy: 60 }, { gx: 20, gy: 40 }];

  it('bounds ALL FOUR corners → a real box with positive width AND height', () => {
    const box = cameraViewportRect(diamond, rect, SIZE);
    expect(box.w).toBeGreaterThan(0);
    expect(box.h).toBeGreaterThan(0);
    // matches the min/max corner projection (gx 20..60, gy 20..60)
    const a = worldToMinimap(20, 20, rect, SIZE), b = worldToMinimap(60, 60, rect, SIZE);
    expect(box).toMatchObject({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y });
  });

  it('the OLD two-corner method collapsed to a near-line — the new box does not', () => {
    // two opposite diamond corners share a near-equal projected span on one axis → ~0 height (the bug).
    const twoCorner = cameraViewportRect([{ gx: 40, gy: 20 }, { gx: 40, gy: 60 }], rect, SIZE);
    expect(twoCorner.w).toBe(0); // degenerate — exactly the line we fixed
    const full = cameraViewportRect(diamond, rect, SIZE);
    expect(full.w).toBeGreaterThan(0);
    expect(full.h).toBeGreaterThan(0);
  });

  it('updates on PAN (translate) and ZOOM (scale) of the visible quad', () => {
    const base = cameraViewportRect(diamond, rect, SIZE);
    const panned = cameraViewportRect(diamond.map((c) => ({ gx: c.gx + 10, gy: c.gy + 5 })), rect, SIZE);
    expect(panned.x).toBeGreaterThan(base.x); // box moved with the camera
    expect(panned.y).toBeGreaterThan(base.y);
    expect(panned.w).toBeCloseTo(base.w, 6);  // same size, just shifted
    const zoomedOut = cameraViewportRect([{ gx: 30, gy: 10 }, { gx: 70, gy: 40 }, { gx: 30, gy: 70 }, { gx: 10, gy: 40 }], rect, SIZE);
    expect(zoomedOut.w).toBeGreaterThan(base.w); // a wider view → a bigger box
    expect(zoomedOut.h).toBeGreaterThan(base.h);
  });
});
