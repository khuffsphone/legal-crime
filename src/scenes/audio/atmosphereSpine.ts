// atmosphereSpine.ts — AUDIO ATMOSPHERE lane, Ticket A: the pure METADATA SPINE for the environmental
// atmosphere / SFX cause-effect layer. Phaser-free, DOM-free, sim-free (type-only imports). This module
// DECIDES nothing at runtime — it is the vocabulary the mapper (Ticket B), the no-x-ray gate (Ticket C),
// and the priority/cooldown queue (Ticket D) share: event categories, priorities 1–5, spatial classes,
// the district ambience-bed key list, and the MVP cue-key list with complete metadata.
//
// Grounded in the LIVE repo (Phase-1 recon), not the spec's assumptions:
// - Clip-key naming follows the shipped catalog (audioMap.ts / audioPreload.ts): music_*, ambience_*,
//   sfx_hit_*, sfx_step_*, sting_*, vo_*, plus the mapper-emitted keys audioMap already names
//   (federal_notice/watch/raid via federalCueKey, tommygun/pistol/siren via combatCueKey, grease_* via
//   greaseCueKey, wire crisis/routine via wireCueForSeverity).
// - District bed keys derive from the CANONICAL district archetypes (src/scenes/art/districtIdentity.ts)
//   so the later bed selector (Ticket E — DEFERRED until the sprite branch merges) can key beds off the
//   district identity the render already uses.
// NOTHING here plays audio; playback integration is Ticket F (deferred). All of it sits behind the
// ?audio/?ambience/?sfx opt-in flags (audioFlags.ts), OFF by default.

import type { DistrictArchetype } from '../art/districtIdentity';

// ── event categories ────────────────────────────────────────────────────────────────────────────
/** Coarse cause buckets for atmosphere/SFX cues — used for per-category cooldown defaults (Ticket D)
 * and mix grouping (deferred playback ticket). */
export type AudioEventCategory =
  | 'combat'     // hits, downs, weapon reports
  | 'economy'    // extortion, collection, laundering, grease
  | 'federal'    // the Bureau ladder (NOTICE 50 / WATCH 70 / RAID 85) + busts/raids
  | 'crew'       // mutiny, desertion, the Wire
  | 'territory'  // turf captures, HQ strikes
  | 'phase'      // narrative phase stings + win/lose
  | 'ui'         // interface chrome ticks
  | 'ambient';   // beds (city + district) — looped, not cue-shaped

export const AUDIO_EVENT_CATEGORIES: readonly AudioEventCategory[] = [
  'combat', 'economy', 'federal', 'crew', 'territory', 'phase', 'ui', 'ambient',
];

// ── priority ────────────────────────────────────────────────────────────────────────────────────
/** Cue priority: 1 = critical (never load-shed — endgame stings, RAID, mutiny, sirens) … 5 = pure
 * texture (shed first). Ticket D preserves priority 1 unconditionally and sheds low-priority local
 * cues first under load. */
export type AudioPriority = 1 | 2 | 3 | 4 | 5;

// ── spatial classes ─────────────────────────────────────────────────────────────────────────────
/** How a cue relates to world space — this drives the NO-X-RAY gate (Ticket C):
 * - 'local'  : tied to a world tile (carries pos). MUST pass the render's own reveal predicate
 *              (fog `isRevealed` via the scene's injected IsVisible) + on-screen — else it could leak
 *              a hidden actor's position through sound. Suppressed when hidden.
 * - 'global' : player-facing, no position (own actions, own crew, endgame). Bypasses the gate — it
 *              carries no tile so it cannot leak one.
 * - 'hud'    : interface chrome (federal ladder, the Wire, UI ticks). Bypasses the gate. */
export type SpatialClass = 'local' | 'global' | 'hud';

// ── district ambience beds ──────────────────────────────────────────────────────────────────────
/** The base city ambience bed that already ships (audioPreload catalog). */
export const AMBIENT_BED_BASE = 'ambience_city';

/** ⚠ SUPERSEDED (A-D era): the approved E-H spec locked the district-bed contract to TWO layers per
 * archetype under `bed_<archetype>_{base,color}` — districtBedCatalog.DISTRICT_BEDS + the F.3 manifest
 * (atmosphereClipManifest) are the ONLY bed-key contract. Do NOT produce assets against the
 * `ambience_*` names below; kept solely so the A-D tests stay meaningful until that lane retires at H3. */
export const DISTRICT_BED_KEYS: Readonly<Record<DistrictArchetype, string>> = {
  FINANCIAL: 'ambience_financial',
  DOCKS: 'ambience_docks',
  TENEMENT: 'ambience_tenement',
  CIVIC: 'ambience_civic',
  MARKET: 'ambience_market',
  THEATRE: 'ambience_theatre',
  INDUSTRIAL: 'ambience_industrial',
  QUARTER: 'ambience_quarter',
  RIVERSIDE: 'ambience_riverside',
};

// ── the MVP cue vocabulary ──────────────────────────────────────────────────────────────────────
/** Every one-shot cue key the MVP atmosphere layer knows. Existing keys (the six sfx_hit weapons) are
 * the shipped contract keys (weaponFeedback.WEAPON_HIT_SFX); the federal, tommygun, pistol, siren,
 * grease and wire keys are what audioMap's helpers already emit; the sting keys are the shipped sting
 * clips; extort, cashdrop, door, typewriter, mutiny, ui_tick and sfx_down_thud are named by the
 * audio-redesign synthesis spec (§3). */
export type MvpCueKey =
  // combat — per-weapon hit reports (positional) + the downed thud (positional)
  | 'sfx_hit_fists' | 'sfx_hit_pistol' | 'sfx_hit_shotgun' | 'sfx_hit_rifle'
  | 'sfx_hit_hitman' | 'sfx_hit_demolitions' | 'sfx_down_thud'
  // combat — player-issued verbs / alarms (non-positional)
  | 'tommygun' | 'pistol' | 'siren'
  // economy
  | 'extort' | 'cashdrop' | 'door' | 'typewriter'
  | 'grease_beat' | 'grease_bench' | 'grease_cityhall' | 'grease_bureau'
  // federal ladder (NOTICE 50 / WATCH 70 / RAID 85 — hudText.FEDERAL_LADDER)
  | 'federal_notice' | 'federal_watch' | 'federal_raid'
  // crew / wire
  | 'mutiny' | 'wire_crisis' | 'wire_routine'
  // phase / endgame stings
  | 'sting_establish' | 'sting_first_blood' | 'sting_contest' | 'sting_decapitate'
  | 'sting_win' | 'sting_lose'
  // ui
  | 'ui_tick';

export interface AudioCueMeta {
  category: AudioEventCategory;
  priority: AudioPriority;
  spatial: SpatialClass;
}

/** Complete metadata for every MVP cue key — the Ticket-A deliverable the tests assert is total. */
export const CUE_META: Readonly<Record<MvpCueKey, AudioCueMeta>> = {
  // combat hits — LOCAL (tile-tied; the no-x-ray gate applies). Texture-priority: a firefight is a
  // crackle, not a klaxon (redesign spec: hit reports must NOT act like urgent cues).
  sfx_hit_fists: { category: 'combat', priority: 3, spatial: 'local' },
  sfx_hit_pistol: { category: 'combat', priority: 3, spatial: 'local' },
  sfx_hit_shotgun: { category: 'combat', priority: 3, spatial: 'local' },
  sfx_hit_rifle: { category: 'combat', priority: 3, spatial: 'local' },
  sfx_hit_hitman: { category: 'combat', priority: 3, spatial: 'local' },
  sfx_hit_demolitions: { category: 'combat', priority: 3, spatial: 'local' },
  // a unit going DOWN is a real result — one rung above hit texture, still local/gated.
  sfx_down_thud: { category: 'combat', priority: 2, spatial: 'local' },
  // player-ISSUED offensive verbs — the player caused them, so they are player-facing (no tile leak).
  tommygun: { category: 'combat', priority: 2, spatial: 'global' },
  pistol: { category: 'combat', priority: 2, spatial: 'global' },
  siren: { category: 'federal', priority: 1, spatial: 'global' }, // raid/lockout klaxon — critical
  // economy — the player's own actions land these; global (own-action, no reveal needed).
  extort: { category: 'economy', priority: 3, spatial: 'global' },
  cashdrop: { category: 'economy', priority: 4, spatial: 'global' },
  door: { category: 'economy', priority: 4, spatial: 'global' },
  typewriter: { category: 'economy', priority: 4, spatial: 'global' },
  grease_beat: { category: 'economy', priority: 3, spatial: 'global' },
  grease_bench: { category: 'economy', priority: 3, spatial: 'global' },
  grease_cityhall: { category: 'economy', priority: 3, spatial: 'global' },
  grease_bureau: { category: 'economy', priority: 3, spatial: 'global' },
  // federal ladder — the player's OWN exposure: interface-facing, never positional.
  federal_notice: { category: 'federal', priority: 3, spatial: 'hud' },
  federal_watch: { category: 'federal', priority: 2, spatial: 'hud' },
  federal_raid: { category: 'federal', priority: 1, spatial: 'hud' },
  // crew / wire — own-crew events.
  mutiny: { category: 'crew', priority: 1, spatial: 'global' },
  wire_crisis: { category: 'crew', priority: 2, spatial: 'hud' },
  wire_routine: { category: 'crew', priority: 4, spatial: 'hud' },
  // phase stings — global narrative beats (already governed upstream by the sting governor).
  sting_establish: { category: 'phase', priority: 2, spatial: 'global' },
  sting_first_blood: { category: 'phase', priority: 2, spatial: 'global' },
  sting_contest: { category: 'phase', priority: 2, spatial: 'global' },
  sting_decapitate: { category: 'phase', priority: 2, spatial: 'global' },
  sting_win: { category: 'phase', priority: 1, spatial: 'global' },
  sting_lose: { category: 'phase', priority: 1, spatial: 'global' },
  // ui
  ui_tick: { category: 'ui', priority: 5, spatial: 'hud' },
};

/** All MVP cue keys (declaration order). */
export const MVP_CUE_KEYS = Object.keys(CUE_META) as MvpCueKey[];

/** Metadata for a cue key; undefined for a key outside the MVP vocabulary. Pure. */
export function cueMeta(key: string): AudioCueMeta | undefined {
  return (CUE_META as Record<string, AudioCueMeta>)[key];
}

/** True when the key is in the MVP vocabulary. Pure. */
export function isMvpCueKey(key: string): key is MvpCueKey {
  return key in CUE_META;
}
