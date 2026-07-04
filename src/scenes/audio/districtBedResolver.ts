// districtBedResolver.ts — AUDIO E-H, Ticket E2: the pure camera→district BED RESOLVER + crossfade
// PLANNER. Phaser-free, sim-free; emits INTENTS only (atmosphereIntents) — zero AudioManager calls.
//
// E.3/E.4 law: the active district resolves from the camera center by EXPLORED-TILE weighting — a tile
// may only influence the resolution if the scene's fog says it is revealed (grow-only, explored-forever;
// the caller composes `districtAt` from layout.districtOfTile + the SAME fog closure the render uses,
// with debugRevealAll centralized there). Panning over unrevealed tiles must NEVER switch beds (that
// would leak art/layout through audio). No explored tiles in the sample ⇒ HOLD the previous district at
// -6 dB. No previous and nothing explored ⇒ silence until the first explored district resolves.

import type { GridPos } from '../../sim';
import {
  BED_FADE_IN_MS, BED_FADE_OUT_MS, BED_HOLD_PENALTY_DB, BED_HYSTERESIS_MS, BED_LAYER_TRIM_DB,
  BED_XFADE_MS, MAX_BED_LOOPS, bedFor, bedZoomTrimDb, type BedLayer,
} from './districtBedCatalog';
import { dbToGain, type AtmosphereIntent } from './atmosphereIntents';

// ── E.3 the 5×5 weighted camera sample ───────────────────────────────────────────────────────────
/** Sample-window weights: center 4, the 8-neighbour ring 2, the outer 16-ring 1. */
function ringWeight(dx: number, dy: number): number {
  const r = Math.max(Math.abs(dx), Math.abs(dy));
  return r === 0 ? 4 : r === 1 ? 2 : 1;
}

export interface BedSample {
  /** highest-weighted EXPLORED district, or null when no explored tile fell in the window. */
  winner: string | null;
  /** how many of the 25 sampled tiles were explored (0 ⇒ hold-previous / silence). */
  exploredCount: number;
}

/**
 * Weigh the 5×5 window centred on the camera focal tile. `districtAt` must return the district id for
 * EXPLORED tiles only and null for unexplored/out-of-bounds — unrevealed tiles thus carry zero weight
 * and can never select a district. Ties break lexicographically (deterministic). Pure.
 */
export function sampleBedDistrict(center: GridPos, districtAt: (gx: number, gy: number) => string | null): BedSample {
  const cx = Math.round(center.gx), cy = Math.round(center.gy);
  const weights = new Map<string, number>();
  let exploredCount = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const d = districtAt(cx + dx, cy + dy);
      if (d === null || d === undefined || d === '') continue;
      exploredCount++;
      weights.set(d, (weights.get(d) ?? 0) + ringWeight(dx, dy));
    }
  }
  let winner: string | null = null;
  let best = -1;
  for (const [d, w] of weights) {
    if (w > best || (w === best && winner !== null && d < winner)) { winner = d; best = w; }
  }
  return { winner, exploredCount };
}

// ── E.3 hysteresis resolver (750 ms stable winner before a crossfade) ────────────────────────────
export interface BedResolverState {
  /** the district whose bed is (intended) live; null ⇒ nothing resolved yet. */
  current: string | null;
  /** true while the latest sample had NO explored tiles — the hold-previous -6 dB penalty. */
  holdPenalty: boolean;
  candidate: string | null;
  candidateSinceMs: number;
}

export function createBedResolverState(): BedResolverState {
  return { current: null, holdPenalty: false, candidate: null, candidateSinceMs: 0 };
}

/**
 * Advance the resolver with one 4 Hz sample. A DIFFERENT winner must stay stable BED_HYSTERESIS_MS
 * before it becomes current (applies to the first resolve too — deterministic everywhere). An
 * all-unrevealed sample holds the previous district with the penalty flag and resets any candidate.
 * Pure — returns a new state.
 */
export function stepBedResolver(state: BedResolverState, sample: BedSample, nowMs: number): BedResolverState {
  if (sample.exploredCount === 0 || sample.winner === null) {
    // nothing explored in view: hold previous at reduced level; a candidate cannot ripen unseen.
    return { ...state, holdPenalty: state.current !== null, candidate: null, candidateSinceMs: 0 };
  }
  if (sample.winner === state.current) {
    return { ...state, holdPenalty: false, candidate: null, candidateSinceMs: 0 };
  }
  if (sample.winner !== state.candidate) {
    // a new challenger starts its stability clock.
    return { ...state, holdPenalty: false, candidate: sample.winner, candidateSinceMs: nowMs };
  }
  if (nowMs - state.candidateSinceMs >= BED_HYSTERESIS_MS) {
    return { current: sample.winner, holdPenalty: false, candidate: null, candidateSinceMs: 0 };
  }
  return { ...state, holdPenalty: false };
}

// ── E.5 crossfade planner (intents only; never restarts a same-district loop) ─────────────────────
/** A bed loop voice the planner intends live. voiceId is stable per (district, layer, GENERATION):
 * within one residency of a district, re-plans reuse the exact voice (setLoop re-trims only, no
 * restart); when a district RETURNS after being faded out (A→B→A border oscillation inside the 2.8 s
 * crossfade), the generation stamp mints a FRESH id, so the new playLoop can never collide with its own
 * still-fading predecessor (an adapter honoring "same id ⇒ never restart" would otherwise skip the play
 * and the bed would fade to permanent silence). `lastGain` suppresses no-op setLoop churn so a re-trim
 * intent is only emitted when the target actually moved — an adapter never receives a reason to stomp an
 * in-flight fade with an identical target. */
export interface BedVoice {
  voiceId: string;
  district: string;
  layer: BedLayer;
  key: string;
  lastGain: number;
}

export function bedVoiceId(district: string, layer: BedLayer, generation: number): string {
  return `bed:${district}:${layer}#${generation}`;
}

function bedGain(layer: BedLayer, audioZoom: number, holdPenalty: boolean): number {
  const db = BED_LAYER_TRIM_DB[layer] + bedZoomTrimDb(audioZoom) + (holdPenalty ? BED_HOLD_PENALTY_DB : 0);
  return dbToGain(db);
}

export interface BedPlan {
  voices: BedVoice[];
  intents: AtmosphereIntent[];
}

/**
 * Plan the bed intents for the resolver's current district. `active` is the voice set from the previous
 * plan (thread it through); `generation` is a caller-held monotonic counter stamped onto NEW voices (the
 * coordinator bumps it per district start) so a returning district never reuses a fading voice id.
 * Behaviour:
 * - same district           → setLoop re-trims ONLY when the target gain moved (zoom / hold penalty);
 *                             an unchanged frame emits nothing — no restart, no fade-stomping churn.
 * - district changed        → stopLoop the old pair + playLoop the new pair, both at the 2.8 s
 *                             equal-power crossfade (≤ MAX_BED_LOOPS voices audible during the fade;
 *                             an adapter receiving playLoop for a KEY that still has a fading tail
 *                             hard-cuts that tail first — the shipped conductor's crossfade-lock rule).
 * - first district          → playLoop with the 1.5 s fade-in.
 * - resolved null (never resolved / lost with no previous) → stopLoop everything at the 1.5 s fade-out.
 * Pure & total.
 */
export function planBedIntents(
  active: readonly BedVoice[],
  resolved: string | null,
  audioZoom: number,
  holdPenalty: boolean,
  generation: number,
): BedPlan {
  const intents: AtmosphereIntent[] = [];

  if (resolved === null) {
    for (const v of active) intents.push({ op: 'stopLoop', bus: 'beds', voiceId: v.voiceId, fadeOutMs: BED_FADE_OUT_MS });
    return { voices: [], intents };
  }

  const bed = bedFor(resolved);
  if (!bed) {
    // an unknown district id must not start unknown clip keys; retire anything live.
    for (const v of active) intents.push({ op: 'stopLoop', bus: 'beds', voiceId: v.voiceId, fadeOutMs: BED_FADE_OUT_MS });
    return { voices: [], intents };
  }

  const keep = active.filter((v) => v.district === resolved);
  const retire = active.filter((v) => v.district !== resolved);
  const crossfading = retire.length > 0;

  for (const v of retire) {
    intents.push({ op: 'stopLoop', bus: 'beds', voiceId: v.voiceId, fadeOutMs: crossfading ? BED_XFADE_MS : BED_FADE_OUT_MS });
  }

  const voices: BedVoice[] = [];
  const layers: readonly { layer: BedLayer; key: string }[] = [
    { layer: 'base', key: bed.base },
    { layer: 'color', key: bed.color },
  ];
  for (const { layer, key } of layers) {
    const gain = bedGain(layer, audioZoom, holdPenalty);
    const existing = keep.find((v) => v.layer === layer);
    if (existing) {
      if (gain === existing.lastGain) {
        voices.push(existing); // nothing moved — emit NOTHING (never hand the adapter a fade-stomper)
      } else {
        const updated: BedVoice = { ...existing, lastGain: gain };
        voices.push(updated);
        intents.push({ op: 'setLoop', bus: 'beds', voiceId: existing.voiceId, gain }); // re-trim, never restart
      }
    } else {
      const voice: BedVoice = { voiceId: bedVoiceId(resolved, layer, generation), district: resolved, layer, key, lastGain: gain };
      voices.push(voice);
      intents.push({
        op: 'playLoop', bus: 'beds', key, voiceId: voice.voiceId, gain,
        fadeInMs: crossfading ? BED_XFADE_MS : BED_FADE_IN_MS,
        ...(crossfading ? { equalPower: true } : {}),
      });
    }
  }

  // E.5 budget: target voices (2) + retiring tails (≤2) may never exceed MAX_BED_LOOPS audible loops.
  const audible = voices.length + retire.length;
  if (audible > MAX_BED_LOOPS) {
    // defensive — structurally unreachable (2 layers × 2 districts); trim the plan loudly rather than exceed.
    throw new Error(`bed plan exceeds the ${MAX_BED_LOOPS}-loop budget (${audible})`);
  }
  return { voices, intents };
}
