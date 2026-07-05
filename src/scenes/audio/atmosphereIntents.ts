// atmosphereIntents.ts — AUDIO E-H: the shared INTENT vocabulary + mix constants every E-H module speaks.
// Pure, Phaser-free, sim-free. E (bed resolver), F (event mapper), G (emitter planner) each emit these
// intents; H (governance + coordinator) orders them; ONLY the scene adapter (H3, deferred) and the F2
// registration module ever touch the AudioManager. Nothing here plays audio.
//
// R3 (validated): the E-H spec's four buses are CONCEPTUAL GROUPS, not new Phaser buses. The live
// AudioManager has settings buses 'sfx' | 'vo' | 'music' | 'ambience' (audio.ts AudioSettings). Mapping:
//   music    -> 'music'    (the existing conductor lane — E-H never redesigns it)
//   beds     -> 'ambience' (district beds are ambience-class loops)
//   emitters -> 'sfx'      (positional prop voices — a GAIN GROUP inside the sfx bus)
//   oneshots -> 'sfx'      (E-H event one-shots — a second gain group inside sfx)
// Group trims are applied per-voice via volScale at the adapter; no AudioManager bus surgery.

import type { AudioBus } from '../audioMap';
import type { GridPos } from '../../sim';

/** The E-H conceptual mix groups (H.1). */
export type AtmosphereBus = 'music' | 'beds' | 'emitters' | 'oneshots';

export const ATMOSPHERE_BUSES: readonly AtmosphereBus[] = ['music', 'beds', 'emitters', 'oneshots'];

/** R3 gain-group mapping: conceptual group -> the REAL AudioManager settings bus it rides. */
export const BUS_TO_AUDIO_BUS: Readonly<Record<AtmosphereBus, AudioBus>> = {
  music: 'music',
  beds: 'ambience',
  emitters: 'sfx',
  oneshots: 'sfx',
};

/** Per-group voice budgets (H.1): beds 4 loops, emitters 8 voices, E-H one-shots 6 (+ the existing
 * combat reserve, which E-H does not touch). */
export const BUS_BUDGETS: Readonly<Record<Exclude<AtmosphereBus, 'music'>, number>> = {
  beds: 4,
  emitters: 8,
  oneshots: 6,
};

/** dB -> linear gain (voltage/amplitude convention: -6 dB ≈ 0.5). */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

// ── H.3 priority table (100 = most important; never invent new numbers per-call-site) ───────────
export const CUE_PRIORITY: Readonly<Record<string, number>> = {
  federal_raid: 100,
  federal_armed: 98,
  federal_watch: 96,
  federal_notice: 95,
  police_raid_cash: 90,
  police_raid_operation: 90,
  police_raid_bust: 90,
  // 85 = existing combat one-shots (owned by the shipped combat path; listed for steal ordering only)
  federal_cooldown: 80,
  interception_collector_robbed: 75,
  extortion_sabotage_sabotaged: 70,
  extortion_shakedown_converted: 65,
  extortion_shakedown_retook: 65,
  extortion_shakedown_sabotaged: 65,
  extortion_sabotage_converted: 65,
  extortion_sabotage_retook: 65,
  extortion_shakedown_failed: 60,
  extortion_sabotage_failed: 60,
  collector_deposit: 58,
  collector_arrival: 55,
  player_offense_raid: 45,
};

/** Priority of the existing combat one-shots in the steal ordering (H.3) — E-H never plays these. */
export const COMBAT_ONESHOT_PRIORITY = 85;
/** Class priorities for non-event voices (H.3). */
export const PROP_RHYTHM_PRIORITY = 35;
export const PROP_ANCHOR_PRIORITY = 25;
export const DISTRICT_BED_PRIORITY = 15;

/** Priority for a cue key: the H.3 table, else the class floors. Pure. */
export function cuePriority(key: string): number {
  const p = CUE_PRIORITY[key];
  if (p !== undefined) return p;
  if (key.startsWith('prop_')) return key.endsWith('_loop') ? PROP_ANCHOR_PRIORITY : PROP_RHYTHM_PRIORITY;
  if (key.startsWith('bed_')) return DISTRICT_BED_PRIORITY;
  return 0;
}

// ── the intents (declarative; the H3 scene adapter translates to AudioManager calls) ─────────────
export interface PlayLoopIntent {
  op: 'playLoop';
  bus: AtmosphereBus;
  key: string;
  /** stable voice identity (bed layer id / emitter pool id) so re-plans NEVER restart a live loop. */
  voiceId: string;
  /** linear gain 0..1 (all dB trims already applied). */
  gain: number;
  fadeInMs: number;
  /** equal-power crossfade curve requested (bed district swaps). */
  equalPower?: boolean;
  pan?: number;
}

export interface StopLoopIntent {
  op: 'stopLoop';
  bus: AtmosphereBus;
  voiceId: string;
  fadeOutMs: number;
}

export interface SetLoopIntent {
  op: 'setLoop';
  bus: AtmosphereBus;
  voiceId: string;
  /** new target gain (zoom/duck/attenuation re-trim) — applied WITHOUT restarting the loop. */
  gain: number;
  pan?: number;
}

export interface PlayOneShotIntent {
  op: 'playOneShot';
  bus: AtmosphereBus;
  key: string;
  priority: number;
  positional: boolean;
  tile?: GridPos;
  gain: number;
  pan?: number;
  /** provenance for diagnostics (?debugaudio). */
  source: string;
}

export interface DuckIntent {
  op: 'duck';
  /** dB offsets per group (0 = untouched) + envelope. */
  targetsDb: Readonly<Record<AtmosphereBus, number>>;
  attackMs: number;
  holdMs: number;
  releaseMs: number;
  trigger: string;
}

export type AtmosphereIntent = PlayLoopIntent | StopLoopIntent | SetLoopIntent | PlayOneShotIntent | DuckIntent;
