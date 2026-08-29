// RTS-27 — pure (Phaser-free, DOM-free) audio MAPPING + take-rotation. The "which clip / which bed /
// which take" decisions live here so they're unit-tested; the Phaser AudioManager (audio.ts) just
// plays what these return. Keeps the audio law ("only needs-you rings", "rotate VO") verifiable.

export type MusicPhase = 'TITLE' | 'ESTABLISH' | 'FIRST BLOOD' | 'CONTEST' | 'DECAPITATE' | 'GAMEOVER';
export type AudioBus = 'sfx' | 'vo' | 'music' | 'ambience';
export type ConfirmPersona = 'sal' | 'vito' | 'crew';
export type ConfirmIntent = 'selection' | 'order';

/** Provisional identity routing over the three shipped generic confirmation takes. Sal and Vito start
 * on different clips, but this is variation routing—not a substitute for their final cast VO packs. */
export function confirmationTakesForPersona(persona: ConfirmPersona): string[] {
  if (persona === 'sal') return ['vo_confirm_1', 'vo_confirm_3'];
  if (persona === 'vito') return ['vo_confirm_2', 'vo_confirm_3'];
  return ['vo_confirm_1', 'vo_confirm_2', 'vo_confirm_3'];
}

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

// ── SOFT-SFX / VO GOVERNOR (pure decisions) ──────────────────────────────────────────────────────
// The urgent governor (audio.ts) already holds urgent cues to one-at-a-time + ducks the beds. But the
// NON-URGENT sfx (cashdrop, extort, the four grease cues, wire_routine, door, typewriter) and VO were
// ungoverned — only a 70ms same-clip debounce — so a multi-racket extort sweep + cash drops + a grease +
// a door all fired at once, full volume, over un-ducked beds (the muddiness). These pure functions decide,
// Phaser-free, (1) which soft voices are admitted under a concurrency CAP, dropping the lowest-priority
// rather than stacking, and (2) when enough soft cues land in a short window to warrant a light bed duck.
// The AudioManager owns the Phaser sound objects + the active-voice bookkeeping; it only ASKS these.

/** Max concurrent NON-URGENT sfx voices. Past this, the lowest-priority cue is dropped (never stacked). */
export const SOFT_SFX_MAX = 3;

/** Per-clip priority for the soft cap: wire/info-critical > cash/extort/grease > door/typewriter texture.
 * When the cap is full the LOWEST priority loses (the incoming cue if it ties or is weaker — no thrash). */
export const SOFT_SFX_PRIORITY: Record<string, number> = {
  wire_routine: 3, // the Wire's routine tick — info-critical, stays audible over chatter
  extort: 2, cashpickup: 2, cashdrop: 2, // a racket folds / cash gathered / cash banked
  grease_beat: 2, grease_bench: 2, grease_cityhall: 2, grease_bureau: 2, // a channel greased
  sfx_down_body: 3, // a visible unit-down must survive incidental movement texture
  sfx_step_pavement: 0, sfx_step_gravel: 0, // texture — always the first voices shed under pressure
  door: 1, typewriter: 1, // texture — a slammed door, the adding machine
};
/** Priority for a soft cue not in the table (treated as economy-tier feedback). */
export const SOFT_SFX_DEFAULT_PRIORITY = 2;

/** A soft cue's drop-priority (higher = more important; survives the cap longer). Pure. */
export function softSfxPriority(key: string): number {
  return SOFT_SFX_PRIORITY[key] ?? SOFT_SFX_DEFAULT_PRIORITY;
}

/** A currently-sounding soft voice the manager is tracking. `startedMs` breaks priority ties (oldest loses). */
export interface SoftVoice { key: string; startedMs: number; }

/** The cap decision for one incoming soft cue: play it? and if so, does an active voice get evicted first? */
export interface SoftAdmission { admit: boolean; evict: SoftVoice | null; }

/**
 * Decide whether an incoming NON-URGENT sfx may sound, given the voices already playing and the cap.
 * Under the cap it's always admitted. AT the cap we compare priorities: if the incoming cue outranks the
 * WEAKEST active voice (lowest priority, oldest on a tie), that voice is evicted and the incoming admitted;
 * otherwise the incoming is dropped (a tie keeps the one already playing — no churn). Pure & deterministic.
 */
export function admitSoftSfx(
  active: SoftVoice[],
  incomingKey: string,
  max: number = SOFT_SFX_MAX,
): SoftAdmission {
  if (active.length < max) return { admit: true, evict: null };
  const incomingP = softSfxPriority(incomingKey);
  let weakest = active[0];
  for (const v of active) {
    const p = softSfxPriority(v.key);
    const wp = softSfxPriority(weakest.key);
    if (p < wp || (p === wp && v.startedMs < weakest.startedMs)) weakest = v;
  }
  if (softSfxPriority(weakest.key) < incomingP) return { admit: true, evict: weakest };
  return { admit: false, evict: null }; // incoming no more important than the weakest → don't stack
}

/** A burst of soft cues this many within the window ducks the beds briefly. */
export const SOFT_BURST_WINDOW_MS = 400;
export const SOFT_BURST_THRESHOLD = 3;

/**
 * Whether enough soft cues landed inside the window to read as a BURST (so the manager should briefly duck
 * the beds under it, the way an urgent cue already does). `starts` is the recent soft-cue start times
 * (the just-fired one included); counts those within `windowMs` of `nowMs`. Pure.
 */
export function softBurstActive(
  starts: number[],
  nowMs: number,
  windowMs: number = SOFT_BURST_WINDOW_MS,
  threshold: number = SOFT_BURST_THRESHOLD,
): boolean {
  let n = 0;
  for (const t of starts) if (nowMs - t < windowMs) n++;
  return n >= threshold;
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
