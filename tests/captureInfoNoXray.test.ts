import { describe, expect, it } from 'vitest';
import { captureInfoIntent, metaFor, type InfoIntent } from '../src/scenes/info/infoEvents';
import { initLog, latestUnreadPositional, pushLog, type LogStore } from '../src/scenes/info/logStore';

interface InformationSurface {
  log: LogStore;
  alerts: Array<{ gx: number; gy: number }>;
  pings: Array<{ gx: number; gy: number }>;
}

const emptySurface = (): InformationSurface => ({ log: initLog(), alerts: [], pings: [] });

/** Phaser-free equivalent of recordInfoEvent: enough to prove a null intent cannot leak into any channel. */
function applyIntent(surface: InformationSurface, intent: InfoIntent | null): InformationSurface {
  if (!intent) return surface;
  const log = pushLog(surface.log, { ...intent, t: 1000 });
  const meta = metaFor(intent.kind);
  const located = intent.gx !== undefined && intent.gy !== undefined;
  return {
    log,
    alerts: meta.alert && located ? [...surface.alerts, { gx: intent.gx!, gy: intent.gy! }] : surface.alerts,
    pings: meta.ping && located ? [...surface.pings, { gx: intent.gx!, gy: intent.gy! }] : surface.pings,
  };
}

const district = { name: 'SECRET HEIGHTS', gx: 70, gy: 71 };

describe('captureInfoIntent — strict strategic NO-X-RAY', () => {
  it.each([
    { before: null, after: 'rival-a' },
    { before: 'rival-a', after: 'rival-b' },
    { before: 'rival-a', after: null },
  ])('a hidden non-player capture $before → $after is identical to no event', (capture) => {
    const initial = emptySurface();
    const intent = captureInfoIntent(capture, 'player', district, false);
    expect(intent).toBeNull();
    const observed = applyIntent(initial, intent);
    expect(observed).toEqual(emptySurface());
    expect(latestUnreadPositional(observed.log)).toBeUndefined();
  });

  it('the same third-party capture surfaces after scouting (gate is not vacuous)', () => {
    const intent = captureInfoIntent(
      { before: 'rival-a', after: 'rival-b' },
      'player', district, true,
    );
    expect(intent).toEqual({
      kind: 'district.captured',
      message: 'SECRET HEIGHTS changed hands',
      gx: 70,
      gy: 71,
    });
    const observed = applyIntent(emptySurface(), intent);
    expect(observed.log.entries[0]).toMatchObject({ kind: 'district.captured', gx: 70, gy: 71 });
    expect(observed.pings).toEqual([{ gx: 70, gy: 71 }]);
    expect(observed.alerts).toEqual([]);
    expect(latestUnreadPositional(observed.log)).toMatchObject({ gx: 70, gy: 71 });
  });

  it('losing the player\'s own district stays knowable even when its centroid is fogged', () => {
    const intent = captureInfoIntent(
      { before: 'player', after: 'rival-a' },
      'player', district, false,
    );
    expect(intent).toMatchObject({
      kind: 'district.lost',
      message: 'SECRET HEIGHTS LOST to a rival',
      gx: 70,
      gy: 71,
    });
    const observed = applyIntent(emptySurface(), intent);
    expect(observed.log.entries).toHaveLength(1);
    expect(observed.alerts).toEqual([{ gx: 70, gy: 71 }]);
    expect(observed.pings).toEqual([{ gx: 70, gy: 71 }]);
  });

  it('the player taking a district also stays knowable without relying on the fog centroid', () => {
    expect(captureInfoIntent(
      { before: 'rival-a', after: 'player' },
      'player', district, false,
    )).toEqual({
      kind: 'district.captured',
      message: 'SECRET HEIGHTS captured',
      gx: 70,
      gy: 71,
    });
  });

  it('a known event without layout coordinates logs without inventing a ping, arrow, or jump target', () => {
    const intent = captureInfoIntent(
      { before: null, after: 'rival-a' },
      'player', { name: 'SECRET HEIGHTS' }, true,
    );
    const observed = applyIntent(emptySurface(), intent);
    expect(observed.log.entries[0]).toMatchObject({ message: 'SECRET HEIGHTS changed hands' });
    expect(observed.alerts).toEqual([]);
    expect(observed.pings).toEqual([]);
    expect(latestUnreadPositional(observed.log)).toBeUndefined();
  });
});
