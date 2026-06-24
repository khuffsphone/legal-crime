// RTS-27 — pure (Phaser-free, DOM-free) audio MAPPING + take-rotation. The "which clip / which bed /
// which take" decisions live here so they're unit-tested; the Phaser AudioManager (audio.ts) just
// plays what these return. Keeps the audio law ("only needs-you rings", "rotate VO") verifiable.

export type MusicPhase = 'TITLE' | 'ESTABLISH' | 'FIRST BLOOD' | 'CONTEST' | 'DECAPITATE' | 'GAMEOVER';
export type AudioBus = 'sfx' | 'vo' | 'music' | 'ambience';

/** The looping MUSIC BED for a match phase (the adaptive state-machine target). FIRST BLOOD and
 * CONTEST share the conflict bed; DECAPITATE is the war bed; TITLE/GAMEOVER their own. */
export function musicBedForPhase(phase: MusicPhase): string {
  switch (phase) {
    case 'ESTABLISH': return 'music_establish';
    case 'FIRST BLOOD':
    case 'CONTEST': return 'music_contest';
    case 'DECAPITATE': return 'music_war';
    case 'GAMEOVER': return 'music_gameover';
    case 'TITLE':
    default: return 'music_theme';
  }
}

/** The one-shot phase-transition STING key for a phase banner. */
export function stingForPhase(phase: MusicPhase): string {
  return `sting_${phase.toLowerCase().replace(/ /g, '_')}`;
}

/** Which Wire ring a slip earns by severity — needs-you (danger/warning) RINGS (📞 crisis), routine
 * slips get a soft tick. Mirrors the visual NEEDS-YOU priority (progressive disclosure for the ears). */
export function wireCueForSeverity(severity: string): 'crisis' | 'routine' {
  return severity === 'danger' || severity === 'warning' ? 'crisis' : 'routine';
}

/** Whether a Wire slip should make ANY sound (routine info/gain slips stay silent unless a tick clip
 * exists; needs-you always rings). */
export function wireShouldRing(severity: string): boolean {
  return wireCueForSeverity(severity) === 'crisis';
}

/** Per-channel grease level-up cue (distinct: whistle / gavel / wax-stamp / phone receiver). */
export function greaseCueKey(channel: string): string {
  switch (channel) {
    case 'police': return 'grease_beat'; // a cop's whistle (The Beat)
    case 'judges': return 'grease_bench'; // a gavel (The Bench)
    case 'politicians': return 'grease_cityhall'; // a wax stamp (City Hall)
    case 'feds': return 'grease_bureau'; // a phone receiver (The Bureau)
    default: return 'grease_beat';
  }
}

/** Federal threshold cue by tier — RTS-30e-audio: the user shipped DISTINCT 50/70/85 clips, so each
 * rung rings its own cue (NOTICE 50 / WATCH 70 / RAID 85) instead of the old warning/siren pair. */
export function federalCueKey(tier: number): string {
  if (tier >= 3) return 'federal_raid'; // RAID @ 85
  if (tier >= 2) return 'federal_watch'; // WATCH @ 70
  return 'federal_notice'; // NOTICE @ 50
}

/** The SFX for an offensive verb (tommy-gun for a raid/ambush; the single pistol report for a hit). */
export function combatCueKey(kind: 'raid' | 'ambush' | 'attack' | 'assassinate' | 'sabotage' | 'lockout'): string {
  switch (kind) {
    case 'assassinate': return 'pistol';
    case 'sabotage': return 'pistol';
    case 'lockout': return 'siren';
    default: return 'tommygun'; // raid / ambush / attack
  }
}

/** Round-robin take index (rotate VO so repeats don't grate). Pure — no immediate repeat. */
export function nextTakeIndex(lastIndex: number, count: number): number {
  if (count <= 0) return 0;
  return (lastIndex + 1) % count;
}

/** Pick the next VO take from a list, given the last index used. Returns null for an empty list. */
export function pickTake(takes: string[], lastIndex: number): { key: string; index: number } | null {
  if (takes.length === 0) return null;
  const index = nextTakeIndex(lastIndex, takes.length);
  return { key: takes[index], index };
}

/** Clamp a 0..1 volume (settings hygiene). */
export function clampVolume(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Cycle a bus volume down one notch (100 → 75 → 50 → 25 → 0 → 100) for the settings surface. */
export function cycleVolume(v: number): number {
  const step = Math.round(v * 4) / 4; // snap to quarters
  const next = step - 0.25;
  return next < -0.001 ? 1 : clampVolume(next);
}
