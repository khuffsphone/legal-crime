// AUDIO PRELOAD GUARD — the registration must (a) queue every clip via the loader, (b) NEVER throw, and (c)
// skip a clip that fails to queue instead of aborting the whole preload (a missing/404 file must not take the
// rest of the library down with it). Tested with a stub loader — no Phaser.
import { describe, it, expect } from 'vitest';
import { registerAudioPreload, type AudioLoaderLike, type AudioClipRef } from '../src/scenes/audioPreload';

const CLIPS: AudioClipRef[] = [
  { key: 'a', file: 'a.m4a' },
  { key: 'missing', file: 'missing.wav' },
  { key: 'b', file: 'b.wav' },
];

/** A stub loader that records calls; `failKey` throws when that key is queued (a "missing"/unqueueable file). */
function stubLoader(failKey?: string) {
  const audioCalls: { key: string; urls: string[] }[] = [];
  const handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
  const loader: AudioLoaderLike = {
    audio(key, urls) {
      if (key === failKey) throw new Error('simulated 404 / bad path');
      audioCalls.push({ key, urls });
    },
    on(event, cb) { (handlers[event] ??= []).push(cb); },
  };
  return { loader, audioCalls, handlers };
}

describe('registerAudioPreload — guarded registration', () => {
  it('queues every clip under the audio/ path and returns the keys', () => {
    const { loader, audioCalls } = stubLoader();
    const keys = registerAudioPreload(loader, CLIPS);
    expect(keys).toEqual(['a', 'missing', 'b']);
    expect(audioCalls.map((c) => c.key)).toEqual(['a', 'missing', 'b']);
    expect(audioCalls[0].urls).toEqual(['audio/a.m4a']);
  });

  it('attaches a loaderror handler so async 404s are swallowed (never thrown)', () => {
    const { loader, handlers } = stubLoader();
    registerAudioPreload(loader, CLIPS);
    expect(handlers['loaderror']?.length).toBe(1);
    // invoking it must not throw (it quietly ignores the failed clip)
    expect(() => handlers['loaderror'][0]('sfx_hit_fists')).not.toThrow();
  });

  it('SKIPS a clip that fails to queue without throwing, and still registers the rest', () => {
    const { loader, audioCalls } = stubLoader('missing');
    let keys: string[] = [];
    expect(() => { keys = registerAudioPreload(loader, CLIPS); }).not.toThrow();
    expect(keys).toEqual(['a', 'b']); // the throwing clip is dropped, the rest survive
    expect(audioCalls.map((c) => c.key)).toEqual(['a', 'b']);
  });

  it('tolerates a loader with no usable .on (still queues, never throws)', () => {
    const audioCalls: string[] = [];
    const loader = {
      audio(key: string) { audioCalls.push(key); },
      on() { throw new Error('no event support'); },
    } as unknown as AudioLoaderLike;
    expect(() => registerAudioPreload(loader, CLIPS)).not.toThrow();
    expect(audioCalls).toEqual(['a', 'missing', 'b']);
  });

  it('an empty library is a no-op', () => {
    const { loader } = stubLoader();
    expect(registerAudioPreload(loader, [])).toEqual([]);
  });
});
