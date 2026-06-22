// RTS-26 — the procedural-art feature flag, parsed pure (no Phaser, no DOM) so it can be unit-tested.
// `?art=lean` (aka basic/off/0) selects the pre-rts26 "shapes" draw path; anything else (the default)
// selects the elevated "gangster figures" rich path. Lets the rich art be A/B'd and a perf problem
// isolated fast.

export type ArtMode = 'rich' | 'lean';

const LEAN = new Set(['lean', 'basic', 'off', '0', 'false']);

/** Parse the art mode from a URL query string (e.g. location.search). Rich is the default. */
export function parseArtMode(search: string): ArtMode {
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(search).get('art');
  } catch {
    raw = null;
  }
  return raw !== null && LEAN.has(raw.toLowerCase()) ? 'lean' : 'rich';
}
