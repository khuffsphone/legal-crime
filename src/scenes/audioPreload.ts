// AUDIO PRELOAD GUARD (pure, Phaser-free, unit-tested). Registering the clip library on Phaser's loader is
// otherwise fragile: a not-yet-dropped WAV 404s and the loader hands the (non-audio) response body to the Web
// Audio decoder, which logs "Unable to decode audio data" — ~18 console errors per session in the UAT. This
// module isolates the REGISTRATION so it is (a) hardened — one bad clip can never abort the whole preload —
// and (b) testable with a stub loader, no Phaser. The async 404/decode noise is silenced two ways: a quiet
// `loaderror` handler here, and — the reliable belt-and-braces — tiny silent placeholder WAVs shipped at the
// not-yet-real paths so the fetch succeeds and the decode is valid. Keys stay wired, so real assets light up
// the moment they replace the placeholders.

/** The minimal slice of Phaser's LoaderPlugin this module needs (so it can be stubbed in tests). */
export interface AudioLoaderLike {
  audio(key: string, urls: string[]): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
}

/** A clip to register: its cache key and its filename under public/audio/. */
export interface AudioClipRef {
  key: string;
  file: string;
}

/**
 * Register every clip on the loader, GUARDED: each `load.audio` call is wrapped so a clip that throws while
 * being queued (a malformed path, a loader quirk) is skipped QUIETLY instead of aborting the rest of the
 * preload, and a `loaderror` handler swallows async 404s so a missing file never surfaces as an uncaught
 * error. Returns the keys successfully queued. Pure aside from the loader calls; never throws.
 */
export function registerAudioPreload(loader: AudioLoaderLike, clips: readonly AudioClipRef[]): string[] {
  // Async failures (a 404 for a not-yet-dropped clip) arrive here — quietly ignored, never thrown.
  try {
    loader.on('loaderror', () => { /* expected for not-yet-dropped clips — skip quietly */ });
  } catch { /* a loader without .on is still usable for queuing below */ }

  const registered: string[] = [];
  for (const c of clips) {
    try {
      loader.audio(c.key, [`audio/${c.file}`]);
      registered.push(c.key);
    } catch {
      /* one clip failing to queue must never abort the whole preload */
    }
  }
  return registered;
}
