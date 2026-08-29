import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { AudioManager } from '../src/scenes/audio';

interface FakeSound {
  isPlaying: boolean;
  play: () => boolean;
  once: () => FakeSound;
  destroy: () => void;
}

function harness() {
  let locked = false;
  let shouldStart = false;
  let addCalls = 0;
  let destroys = 0;
  const scene = {
    time: { now: 1000 },
    sound: {
      get locked() { return locked; },
      add: () => {
        addCalls += 1;
        const sound: FakeSound = {
          isPlaying: false,
          play: () => { sound.isPlaying = shouldStart; return shouldStart; },
          once: () => sound,
          destroy: () => { destroys += 1; },
        };
        return sound;
      },
      play: () => shouldStart,
    },
    tweens: { add: () => undefined, killTweensOf: () => undefined },
  } as unknown as Phaser.Scene;
  const manager = new AudioManager(scene);
  const internals = manager as unknown as {
    loaded: Set<string>;
    lastPlayed: Map<string, number>;
    lastVoIndex: number;
    voActive?: FakeSound;
  };
  internals.loaded.add('vo_tip_extort');
  return {
    manager,
    internals,
    setLocked: (value: boolean) => { locked = value; },
    setShouldStart: (value: boolean) => { shouldStart = value; },
    counts: () => ({ addCalls, destroys }),
  };
}

describe('FP-01 tutorial voice admission', () => {
  it('does not consume a take when Phaser rejects playback, then admits a retry', () => {
    const h = harness();
    h.setShouldStart(false);
    expect(h.manager.tip('extort')).toBe(false);
    expect(h.internals.lastVoIndex).toBe(-1);
    expect(h.internals.lastPlayed.has('vo_tip_extort')).toBe(false);
    expect(h.internals.voActive).toBeUndefined();
    expect(h.counts()).toEqual({ addCalls: 1, destroys: 1 });

    h.setShouldStart(true);
    expect(h.manager.tip('extort')).toBe(true);
    expect(h.internals.lastVoIndex).toBe(0);
    expect(h.internals.lastPlayed.get('vo_tip_extort')).toBe(1000);
    expect(h.internals.voActive?.isPlaying).toBe(true);
  });

  it('does not allocate a sound while the browser audio context is locked', () => {
    const h = harness();
    h.setLocked(true);
    h.setShouldStart(true);
    expect(h.manager.tip('extort')).toBe(false);
    expect(h.counts().addCalls).toBe(0);
  });
});
