// audioFlags.ts — AUDIO ATMOSPHERE lane: the pure query-flag parsers for the NEW atmosphere layer.
// Phaser-free, DOM-free. The dispatch's constraint is that everything this lane builds sits behind
// ?audio / ?ambience / ?sfx (+ debug flags), OFF BY DEFAULT — these parsers are the single source of
// that opt-in. Nothing in Tickets A–D plays audio; the deferred playback ticket (F) consumes these.
// Pattern mirrors the established query-flag idiom (unitSpriteState.spritesRequested / fog.revealAllRequested):
// pure + total — absent, malformed, or falsy ⇒ OFF.
//
// NB these gate the NEW atmosphere layer only. The game's existing audio (music beds, combat hit SFX,
// VO) keeps its current settings-store behaviour — this lane neither reads nor changes it.

const TRUTHY = new Set(['', '1', 'on', 'true', 'yes']);
const FALSY = new Set(['0', 'off', 'false', 'no']);

/** Parse one opt-in flag from a query string: ON for `?flag`, `?flag=1|on|true|yes` (any other
 * non-falsy value also opts in); OFF when absent, malformed, or `=0|off|false|no`. Pure & total. */
function flagRequested(search: string, name: string): boolean {
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(search).get(name);
  } catch {
    return false;
  }
  if (raw === null) return false;
  const v = raw.toLowerCase();
  if (FALSY.has(v)) return false;
  return TRUTHY.has(v) || true; // any other non-falsy value still opts in
}

/** ?audio — master opt-in for the WHOLE new atmosphere layer (beds + mapped cues). Default OFF. */
export function atmosphereAudioRequested(search: string): boolean {
  return flagRequested(search, 'audio');
}

/** ?ambience — opt-in for the district ambience-bed sublayer (needs ?audio too at integration time).
 * Default OFF. */
export function ambienceRequested(search: string): boolean {
  return flagRequested(search, 'ambience');
}

/** ?sfx — opt-in for the mapped event-cue sublayer (needs ?audio too at integration time). Default OFF. */
export function sfxCuesRequested(search: string): boolean {
  return flagRequested(search, 'sfx');
}

/** ?debugaudio — verbose cue-decision logging for tuning (what mapped, what the gate/queue dropped and
 * why). Default OFF. */
export function debugAudioRequested(search: string): boolean {
  return flagRequested(search, 'debugaudio');
}
