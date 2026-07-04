// atmosphereCoordinator.ts — AUDIO E-H, Ticket H2: the pure COORDINATOR. One step() fuses the E bed
// resolver, the F event mapper, the G emitter planner and the H governance policy into ONE ordered
// intent list (ducks → event one-shots by priority → bed intents → emitter intents). Pure & Phaser-free;
// deterministic given the same state + frame (the rhythm scheduler is seeded at state creation; no
// Date.now, no Math.random anywhere in E-H). /src/sim is type-only (erased) — never touched.
//
// The (deferred) H3 scene adapter owns the ONLY AudioManager calls: it feeds this step from the
// post-updateAndObserve ObserveResult surface + processCollectorArrivals, injects the single
// isAudioFeedbackEligible closure, and translates intents to manager calls AFTER F2 registration.
// Any emitted key absent from the F.3 manifest is REJECTED + flagged here — it can never reach playback.

import type { DepositEvent, EmbodiedExtortionEvent, GameEvent, GridPos, InterceptionEvent } from '../../sim';
import type { DistrictArchetype } from '../art/districtIdentity';
import { isAtmosphereClipKey } from './atmosphereClipManifest';
import type { AtmosphereIntent, PlayOneShotIntent } from './atmosphereIntents';
import {
  BED_SAMPLE_INTERVAL_MS,
} from './districtBedCatalog';
import {
  createBedResolverState, planBedIntents, sampleBedDistrict, stepBedResolver,
  type BedResolverState, type BedVoice,
} from './districtBedResolver';
import {
  combatDuckTriggered, mapCollectorBeats, mapExtortionEvents, mapInterceptions, mapLogEvents,
  type EventCueIntent,
} from './eventCueMapper';
import {
  admitCue, createRateLimiterState, duckFor, orderCues, type RateLimiterState,
} from './mixGovernance';
import {
  createEmitterPlannerState, planEmitters, type EmitterEligibility, type EmitterPlannerState,
} from './propEmitterPlanner';
import type { EmitterSource } from './propEmitterCatalog';

/** G.4: candidate refresh cadence for the emitter planner (the bed sample runs at 4 Hz — E.3). */
export const EMITTER_PLAN_INTERVAL_MS = 500;

export interface AtmosphereState {
  resolver: BedResolverState;
  bedVoices: BedVoice[];
  emitters: EmitterPlannerState;
  rate: RateLimiterState;
  lastBedSampleMs: number;
  lastEmitterPlanMs: number;
}

export function createAtmosphereState(seed: number): AtmosphereState {
  return {
    resolver: createBedResolverState(),
    bedVoices: [],
    emitters: createEmitterPlannerState(seed),
    rate: createRateLimiterState(),
    lastBedSampleMs: -1e12,
    lastEmitterPlanMs: -1e12,
  };
}

export interface AtmosphereObservation {
  /** the NEW state.log slice since the caller's cursor. */
  logEvents?: readonly GameEvent[];
  extortion?: readonly EmbodiedExtortionEvent[];
  interceptions?: readonly InterceptionEvent[];
  /** this frame's combat beat count — the H.2 ducking side-chain (E-H never replays combat SFX). */
  combatEventCount?: number;
  /** optional front→tile resolver: extortion cues become positional ONLY through this. */
  tileOfFront?: (frontId: string) => GridPos | undefined;
}

export interface AtmosphereFrame {
  nowMs: number;
  camera: { centerTile: GridPos; audioZoom: number };
  /** district id at an EXPLORED tile, null for unexplored/out-of-bounds (bed resolution — E.4). */
  districtAt: (gx: number, gy: number) => string | null;
  /** ART archetype for emitter STYLING (preferDistrict); never a reveal channel. Optional. */
  styleDistrictAt?: (gx: number, gy: number) => DistrictArchetype | null;
  /** the single H3 eligibility closure (revealed via the render's fog; onScreen via the camera). */
  eligibility: (gx: number, gy: number) => EmitterEligibility;
  observation?: AtmosphereObservation;
  /** collector beats — from processCollectorArrivals (NEVER the wrapper's arrivedUnitIds). */
  collectorDeposits?: readonly DepositEvent[];
  collectorArrivals?: readonly { collectorId: string; familyId: string }[];
  emitterSources?: readonly EmitterSource[];
  playerFamilyId: string;
}

export interface RejectedCue {
  key: string;
  reason: 'unknown-key' | 'tileless-positional' | 'duplicate' | 'rate';
  source: string;
}

export interface AtmosphereStep {
  state: AtmosphereState;
  /** ordered: ducks → event one-shots (priority desc) → bed intents → emitter intents. */
  intents: AtmosphereIntent[];
  /** what governance refused and why (?debugaudio surface). */
  rejected: RejectedCue[];
}

/** The H2 admission gate as a pure, independently-testable stage: manifest membership → positional
 * integrity → H.4 duplicate/rate governance. An unknown key or a tileless "positional" cue can NEVER
 * pass — they are rejected and flagged, not silently dropped. */
export function gateEventCues(
  cues: readonly EventCueIntent[],
  rate: RateLimiterState,
  nowMs: number,
): { admitted: EventCueIntent[]; rejected: RejectedCue[]; rate: RateLimiterState } {
  const admitted: EventCueIntent[] = [];
  const rejected: RejectedCue[] = [];
  for (const cue of cues) {
    if (!isAtmosphereClipKey(cue.key)) {
      rejected.push({ key: cue.key, reason: 'unknown-key', source: cue.source });
      continue; // an unknown key may NEVER reach playback
    }
    if (cue.positional && !cue.tile) {
      rejected.push({ key: cue.key, reason: 'tileless-positional', source: cue.source });
      continue; // defensive — F1 makes this structurally impossible
    }
    const decision = admitCue(rate, { key: cue.key, dedupeKey: cue.dedupeKey }, nowMs);
    rate = decision.state;
    if (decision.verdict === 'admit') admitted.push(cue);
    else rejected.push({ key: cue.key, reason: decision.verdict === 'drop-duplicate' ? 'duplicate' : 'rate', source: cue.source });
  }
  return { admitted, rejected, rate };
}

/** One coordinator step. Call every frame; the bed sample (4 Hz) and emitter plan (2 Hz) self-cadence
 * off nowMs. Pure — returns a new state; same state + frame ⇒ identical output. */
export function stepAtmosphere(state: AtmosphereState, frame: AtmosphereFrame): AtmosphereStep {
  const intents: AtmosphereIntent[] = [];
  const obs = frame.observation ?? {};

  // ── F: map this frame's verified events to cue intents ────────────────────────────────────────
  const mapped: EventCueIntent[] = [
    ...mapLogEvents(obs.logEvents ?? []),
    ...mapExtortionEvents(obs.extortion ?? [], obs.tileOfFront),
    ...mapInterceptions(obs.interceptions ?? [], frame.playerFamilyId),
    ...mapCollectorBeats(frame.collectorDeposits ?? [], frame.playerFamilyId, frame.collectorArrivals ?? []),
  ];

  // ── H: manifest gate → duplicate/rate gate → priority order ───────────────────────────────────
  const gate = gateEventCues(mapped, state.rate, frame.nowMs);
  const rate = gate.rate;
  const admitted = gate.admitted;
  const rejected = gate.rejected;

  // ducks first (H.2): the combat side-chain + each admitted ducking trigger.
  if (combatDuckTriggered(obs.combatEventCount ?? 0)) {
    const d = duckFor('combat');
    if (d) intents.push(d);
  }
  for (const cue of admitted) {
    const d = duckFor(cue.key);
    if (d) intents.push(d);
  }

  // event one-shots, highest priority first (stable within a rank).
  for (const cue of orderCues(admitted)) {
    const oneShot: PlayOneShotIntent = {
      op: 'playOneShot', bus: 'oneshots', key: cue.key, priority: cue.priority,
      positional: cue.positional, ...(cue.tile ? { tile: cue.tile } : {}),
      gain: 1, source: cue.source,
    };
    intents.push(oneShot);
  }

  // ── E: district beds (4 Hz sample cadence; explored-weighted; hysteresis in the resolver) ──────
  let resolver = state.resolver;
  let bedVoices = state.bedVoices;
  let lastBedSampleMs = state.lastBedSampleMs;
  if (frame.nowMs - state.lastBedSampleMs >= BED_SAMPLE_INTERVAL_MS) {
    lastBedSampleMs = frame.nowMs;
    const sample = sampleBedDistrict(frame.camera.centerTile, frame.districtAt);
    resolver = stepBedResolver(resolver, sample, frame.nowMs);
    const plan = planBedIntents(bedVoices, resolver.current, frame.camera.audioZoom, resolver.holdPenalty);
    bedVoices = plan.voices;
    intents.push(...plan.intents);
  }

  // ── G: positional prop emitters (2 Hz candidate cadence; seeded rhythm scheduler) ──────────────
  let emitters = state.emitters;
  let lastEmitterPlanMs = state.lastEmitterPlanMs;
  if (frame.nowMs - state.lastEmitterPlanMs >= EMITTER_PLAN_INTERVAL_MS) {
    lastEmitterPlanMs = frame.nowMs;
    const plan = planEmitters(emitters, {
      sources: frame.emitterSources ?? [],
      nowMs: frame.nowMs,
      audioZoom: frame.camera.audioZoom,
      screenCenter: frame.camera.centerTile,
      eligibility: frame.eligibility,
      ...(frame.styleDistrictAt ? { districtAt: frame.styleDistrictAt } : {}),
    });
    emitters = plan.state;
    intents.push(...plan.intents);
  }

  return {
    state: { resolver, bedVoices, emitters, rate, lastBedSampleMs, lastEmitterPlanMs },
    intents,
    rejected,
  };
}
