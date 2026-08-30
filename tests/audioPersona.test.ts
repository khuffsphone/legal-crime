import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

let AudioManagerClass: new (...args: never[]) => object;

beforeAll(async () => {
  ({ AudioManager: AudioManagerClass } = await import('../src/scenes/audio'));
});

function manager(play = true) {
  const audio = Object.create(AudioManagerClass.prototype) as Record<string, any>;
  Object.assign(audio, {
    loaded: new Set(['vo_confirm_1', 'vo_confirm_2', 'vo_confirm_3']),
    lastConfirmIndex: new Map(),
    play: vi.fn(() => play),
  });
  return audio;
}

describe('named confirmation routing', () => {
  it('rotates Sal and Vito independently through their provisional take sets', () => {
    const audio = manager();
    audio.confirm('sal');
    audio.confirm('sal');
    audio.confirm('vito');
    audio.confirm('vito');
    expect(audio.play.mock.calls.map(([key]: [string]) => key)).toEqual([
      'vo_confirm_1', 'vo_confirm_3', 'vo_confirm_2', 'vo_confirm_3',
    ]);
  });

  it('does not advance a persona cursor when the one-VO gate drops the bark', () => {
    const audio = manager(false);
    audio.confirm('sal');
    audio.confirm('sal');
    expect(audio.play.mock.calls.map(([key]: [string]) => key)).toEqual(['vo_confirm_1', 'vo_confirm_1']);
  });

  it('lets an order interrupt a low-priority selection bark', () => {
    const active = { isPlaying: true, stop: vi.fn(), destroy: vi.fn() };
    const killTweensOf = vi.fn();
    const audio = manager();
    Object.assign(audio, {
      scene: { time: { now: 1000 }, tweens: { killTweensOf } },
      voActive: active,
      voActiveKind: 'selection',
      voUntil: 5000,
    });

    audio.confirm('sal', 'order');
    expect(killTweensOf).toHaveBeenCalledWith(active);
    expect(active.stop).toHaveBeenCalledOnce();
    expect(active.destroy).toHaveBeenCalledOnce();
    expect(audio.play).toHaveBeenCalledWith('vo_confirm_1');
  });

  it('tears down every owned sound exactly once across scene shutdown/destroy', () => {
    const sound = () => ({ stop: vi.fn(), destroy: vi.fn() });
    const bed = sound();
    const ambience = sound();
    const voice = sound();
    const atmosphere = sound();
    const urgent = sound();
    const retiringAtmosphere = sound();
    const killTweensOf = vi.fn();
    const audio = Object.create(AudioManagerClass.prototype) as Record<string, any>;
    Object.assign(audio, {
      destroyed: false,
      scene: { tweens: { killTweensOf } },
      musicSound: bed,
      ambienceSound: ambience,
      voActive: voice,
      voUntil: 100,
      liveBeds: [{ id: 1, bed: 'music', snd: bed }],
      retiringBeds: [bed],
      activeUrgentVoices: new Set([urgent]),
      activeSoftVoices: [],
      atmoVoices: new Map([['district', { snd: atmosphere, key: 'ambience' }]]),
      retiringAtmoVoices: [retiringAtmosphere],
    });

    audio.destroy();
    audio.destroy();
    for (const snd of [bed, ambience, voice, atmosphere, urgent, retiringAtmosphere]) {
      expect(snd.stop).toHaveBeenCalledOnce();
      expect(snd.destroy).toHaveBeenCalledOnce();
    }
    expect(killTweensOf).toHaveBeenCalledTimes(6);
  });

  it('cannot recreate beds after scene teardown, including a delayed unlock callback', () => {
    const add = vi.fn();
    const audio = Object.create(AudioManagerClass.prototype) as Record<string, any>;
    Object.assign(audio, { destroyed: true, scene: { sound: { add } } });

    audio.startBeds();
    expect(add).not.toHaveBeenCalled();
  });
});
