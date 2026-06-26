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

// ── RTS-31 — the MUSIC CONDUCTOR (one bed at a time) ───────────────────────────────────────────
// The AudioManager owns the Phaser sound objects, but the DECISION of which beds to STOP on each
// phase change lives here so it's testable Phaser-free. THE INVARIANT: after any phase change at
// most ONE bed remains live. The old setPhase only retired the single previous bed, so a rapid
// skip-week phase flip (A→B→A faster than the crossfade) piled up orphan instances — 3 beds at once.

/** A live music bed the manager is currently playing. `id` is a per-instance token (two instances of
 * the SAME bed are distinct — that is exactly the orphan case the conductor must collapse). */
export interface BedInstance { id: number; bed: string; }

/** What the conductor decides for a phase change: the bed to START (null ⇒ none/unchanged) and EVERY
 * live instance to STOP. */
export interface ConductorDecision { start: string | null; stop: BedInstance[]; }

/**
 * Pure music conductor: given every currently-live bed instance and the new phase, decide which beds
 * to STOP and whether to START the target — guaranteeing AT MOST ONE bed is live afterward. If the
 * sole live bed is already the target, it's a no-op (no restart, no orphan). Otherwise EVERY live
 * instance is retired and the target started fresh, so rapid transitions can never stack. `isLoaded`
 * lets the manager say a bed's clip isn't present (then we silence all and start nothing).
 */
export function conductBeds(
  live: BedInstance[],
  phase: MusicPhase,
  isLoaded: (bed: string) => boolean = () => true,
): ConductorDecision {
  const bed = musicBedForPhase(phase);
  if (!isLoaded(bed)) return { start: null, stop: [...live] }; // clip missing → silence, start nothing
  if (live.length === 1 && live[0].bed === bed) return { start: null, stop: [] }; // already settled
  return { start: bed, stop: [...live] }; // retire everything, start the target clean
}

// ── AUDIO PASS — SINK-LEVEL BED DWELL (transitions rare) ───────────────────────────────────────
// conductBeds guarantees ≤1 bed PER change, but nothing stopped the caller REQUESTING changes every
// frame. In play the game phase oscillates (CONTEST↔FIRST BLOOD as districtsHeld crosses 2; the endgame
// DECAPITATE floor) and those resolve to DIFFERENT bed clips, so setPhase thrashed — stacked crossfades +
// a scratchy loop-restart. holdBed is the SINGLE dwell at the sink: a different-clip change is HELD until a
// minimum interval has elapsed since the last actual switch, so the score picks ONE bed and holds it. This
// GATES the existing conductBeds path (it does not bypass the crossfade lock).

/** Minimum time a bed clip must play before another bed can START (transitions rare). Longer than the
 * conductor's intensity dwell (4s) + the crossfade (≤0.9s) so even an oscillating phase can't rattle. */
export const BED_MIN_INTERVAL_MS = 6000;

/** The live bed clip + when it last switched. '' bed ⇒ nothing playing yet (the first start is never held). */
export interface BedHold { bed: string; sinceMs: number; }

/**
 * Decide whether the live bed CLIP may switch to `target` now. HELD (no change) when the target equals the
 * current bed (idempotent) OR — unless `force` — when fewer than `minIntervalMs` have elapsed since the last
 * switch. The first bed and forced switches (terminal TITLE/GAMEOVER, init) always apply. Pure — the single
 * source of "transitions rare", independent of how often the caller requests a phase.
 */
export function holdBed(
  cur: BedHold, target: string, nowMs: number, minIntervalMs: number = BED_MIN_INTERVAL_MS, force = false,
): { hold: BedHold; changed: boolean } {
  if (target === cur.bed) return { hold: cur, changed: false };                                   // already on it
  if (!force && cur.bed !== '' && nowMs - cur.sinceMs < minIntervalMs) return { hold: cur, changed: false }; // too soon → hold
  return { hold: { bed: target, sinceMs: nowMs }, changed: true };                                // switch
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

// ── RTS-34 — orphan-clip wiring (free juice) ─────────────────────────────────────────────────────
/** Route the previously-UNWIRED clips that shipped in public/audio/ onto sensible EXISTING beats:
 *  `door` (a door slam) → a LOCKOUT (the Bureau's forced entry on a rival); `typewriter` → LAUNDERING
 *  (cooking the books on the adding machine). NOTE: the `warning` teletype is intentionally LEFT
 *  unwired — its thematic home is the federal ladder, which already rings the dedicated NOTICE/WATCH/
 *  RAID cues (RTS-30e), so wiring it anywhere else would just double a cue. Pure. */
export function orphanCueKey(beat: 'lockout' | 'launder'): string {
  return beat === 'lockout' ? 'door' : 'typewriter';
}
