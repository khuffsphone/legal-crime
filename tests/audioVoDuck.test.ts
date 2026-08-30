import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { AudioManager } from '../src/scenes/audio';

interface FakeSound {
  isPlaying: boolean;
  volume: number;
  play: () => boolean;
  once: (event: string, callback: () => void) => FakeSound;
  stop: () => void;
  destroy: () => void;
  complete: () => void;
}

function sound(volume = 1): FakeSound {
  let completion: (() => void) | undefined;
  const value: FakeSound = {
    isPlaying: false,
    volume,
    play: () => { value.isPlaying = true; return true; },
    once: (event, callback) => { if (event === 'complete') completion = callback; return value; },
    stop: () => { value.isPlaying = false; },
    destroy: vi.fn(),
    complete: () => { value.isPlaying = false; completion?.(); },
  };
  return value;
}

function harness() {
  const voice = sound();
  const music = sound(0.5);
  const ambience = sound(0.4);
  music.isPlaying = true;
  ambience.isPlaying = true;
  const tweenAdds: Array<Record<string, unknown>> = [];
  const clock = { now: 1000 };
  const watchdogs: Array<{ delay: number; callback: () => void; remove: ReturnType<typeof vi.fn> }> = [];
  const scene = {
    time: {
      ...clock,
      get now() { return clock.now; },
      delayedCall: (delay: number, callback: () => void) => {
        const timer = { delay, callback, remove: vi.fn() };
        watchdogs.push(timer);
        return timer;
      },
    },
    sound: { locked: false, add: () => voice },
    tweens: {
      killTweensOf: vi.fn(),
      add: (config: Record<string, unknown>) => { tweenAdds.push(config); return config; },
    },
  } as unknown as Phaser.Scene;
  const manager = new AudioManager(scene);
  Object.assign(manager as unknown as Record<string, unknown>, {
    loaded: new Set(['vo_tip_extort']),
    musicSound: music,
    ambienceSound: ambience,
    currentBed: 'music_establish',
  });
  return { manager, voice, music, ambience, tweenAdds, clock, watchdogs };
}

describe('VO-duration bed ducking', () => {
  it('holds both beds for the admitted voice and releases when that voice completes', () => {
    const h = harness();
    expect(h.manager.play('vo_tip_extort')).toBe(true);
    expect(h.music.volume).toBeLessThan(0.5);
    expect(h.ambience.volume).toBeLessThan(0.4);
    expect(h.tweenAdds).toEqual([]); // release belongs to the real VO completion, not an 8 s guess
    expect(h.watchdogs[0].delay).toBe(8000);

    h.clock.now = 5000;
    h.voice.complete();
    const releases = h.tweenAdds.slice(-2);
    expect(releases.every((t) => t.delay === undefined && t.duration === 400)).toBe(true);
    expect(h.voice.destroy).toHaveBeenCalledOnce();
    h.manager.destroy();
    expect(h.voice.destroy).toHaveBeenCalledOnce();
  });

  it('does not lift a longer transient duck when VO finishes', () => {
    const h = harness();
    expect(h.manager.play('vo_tip_extort')).toBe(true);
    h.clock.now = 2000;
    h.manager.duck(7000); // combat/federal hold through t=9000
    expect(h.tweenAdds).toEqual([]); // live VO still owns the release
    h.clock.now = 3000;
    h.voice.complete();
    expect(h.tweenAdds.slice(-2).map((t) => t.delay)).toEqual([6000, 6000]);
    expect(h.music.volume).toBeLessThan(0.5);
    expect(h.ambience.volume).toBeLessThan(0.4);
  });

  it('rebuilds pending restores so mute and volume changes cannot be overwritten', () => {
    const h = harness();
    h.manager.duck(7000);
    expect(h.tweenAdds.slice(-2).every((t) => t.delay === 7000)).toBe(true);

    h.manager.setMusicVolume(0.2);
    const musicRestore = h.tweenAdds.filter((t) => t.targets === h.music).at(-1)!;
    expect(musicRestore.volume).toBeCloseTo(0.112); // master .8 × music .2 × clip .7
    expect(h.music.volume).toBeCloseTo(0.0504); // restore target remains ducked meanwhile

    h.manager.toggleMute();
    expect(h.music.volume).toBe(0);
    expect(h.ambience.volume).toBe(0);
    expect(h.tweenAdds.slice(-2).every((t) => t.volume === 0)).toBe(true);
  });

  it('cancels a stale release fade before applying a setting after the hold expires', () => {
    const h = harness();
    h.manager.duck(7000);
    const scene = (h.manager as unknown as { scene: { tweens: { killTweensOf: ReturnType<typeof vi.fn> } } }).scene;
    const killsBefore = scene.tweens.killTweensOf.mock.calls.length;

    h.clock.now = 9000; // the scheduled 400 ms release may now be in progress
    h.manager.setMusicVolume(0.2);
    expect(scene.tweens.killTweensOf.mock.calls.length).toBe(killsBefore + 2);
    expect(h.music.volume).toBeCloseTo(0.112);

    h.manager.toggleMute();
    expect(h.music.volume).toBe(0);
    expect(h.ambience.volume).toBe(0);
  });
});
