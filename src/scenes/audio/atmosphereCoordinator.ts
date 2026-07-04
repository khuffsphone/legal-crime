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
import { shouldEmitFeedback } from '../weaponFeedback';
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
  /** monotonic bed voice-generation counter — bumped whenever a district's pair (re)starts. */
  bedGeneration: number;
  emitters: EmitterPlannerState;
  rate: RateLimiterState;
  lastBedSampleMs: number;
  lastEmitterPlanMs: number;
}

export function createAtmosphereState(seed: number): AtmosphereState {
  return {
    resolver: createBedResolverState(),
    bedVoices: [],
    bedGeneration: 0,
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
  /** The ART **DistrictArchetype** at an EXPLORED tile; null for unexplored/out-of-bounds (E.4 —
   * unexplored tiles must carry zero weight). ⚠ CONTRACT (recon-verified): `layout.districtOfTile`
   * stores sim district INSTANCE ids ('district-0'…), NOT archetypes — the bed catalog is keyed by
   * archetype, so an id would silently resolve zero beds. The H3 adapter must compose the same
   * translation the render already uses:
   *   isRevealed(fog, gx, gy)
   *     ? districtIdentityFor(state.districts.findIndex(d => d.id === districtOfTile(layout, gx, gy))).archetype
   *     : null
   * (IsoScene:1073 precedent; memoize per district id — it is static per match.) */
  districtAt: (gx: number, gy: number) => DistrictArchetype | null;
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
  /** Force an emitter re-plan THIS frame regardless of the 2 Hz cadence — the adapter sets it on a
   * zoom-LOD crossing, a camera move ≥0.5 tile, or an eligibility flip (the planner's own contract),
   * so a fast zoom-out stops emitters immediately instead of up to 500 ms late. */
  forceEmitterPlan?: boolean;
  /** Force a bed sample THIS frame regardless of the 4 Hz cadence (e.g. a teleport/fly-to). */
  forceBedSample?: boolean;
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

const NO_CUES: readonly EventCueIntent[] = [];
const NO_EVENTS: readonly GameEvent[] = [];
const NO_REJECTED: RejectedCue[] = [];

/** One coordinator step. Call every frame; the bed sample (4 Hz) and emitter plan (2 Hz) self-cadence
 * off nowMs (frame.forceBedSample / forceEmitterPlan override the cadence for zoom-LOD crossings,
 * big camera moves, and eligibility flips). Pure — returns a new state; same state + frame ⇒
 * identical output. */
export function stepAtmosphere(state: AtmosphereState, frame: AtmosphereFrame): AtmosphereStep {
  const intents: AtmosphereIntent[] = [];
  const obs = frame.observation ?? {};

  // ── F: map this frame's verified events to cue intents ────────────────────────────────────────
  const logEvents = obs.logEvents ?? NO_EVENTS;
  const hasEvents = (obs.logEvents?.length ?? 0) > 0 || (obs.extortion?.length ?? 0) > 0
    || (obs.interceptions?.length ?? 0) > 0 || (frame.collectorDeposits?.length ?? 0) > 0
    || (frame.collectorArrivals?.length ?? 0) > 0;
  const mapped: readonly EventCueIntent[] = hasEvents
    ? [
      ...mapLogEvents(logEvents),
      ...mapExtortionEvents(obs.extortion ?? [], obs.tileOfFront),
      ...mapInterceptions(obs.interceptions ?? [], frame.playerFamilyId),
      ...mapCollectorBeats(frame.collectorDeposits ?? [], frame.playerFamilyId, frame.collectorArrivals ?? []),
    ]
    : NO_CUES; // the overwhelmingly common empty frame skips the whole gate/order pipeline

  // ── H: PRIORITY order FIRST, then the manifest/duplicate/rate gate — admission consumes the H.4
  // budgets in priority order, so a burst can never spend the last slot on a priority-45 player
  // stinger while rate-dropping a priority-90 police cue that mapped later in the same frame. ──────
  let rate = state.rate;
  let admitted: readonly EventCueIntent[] = NO_CUES;
  let rejected: RejectedCue[] = NO_REJECTED;
  if (mapped.length > 0) {
    const gate = gateEventCues(orderCues(mapped), rate, frame.nowMs);
    rate = gate.rate;
    rejected = gate.rejected;
    // NO-X-RAY for tile-carrying EVENT cues (spec F.1: "gate shouldEmitFeedback if tiled"): a tiled cue
    // whose tile fails the eligibility closure DOWNGRADES to non-positional — the player still hears
    // their own outcome (these cues are all player-caused), but no pan/position can leak an unseen tile.
    admitted = gate.admitted.map((cue) => {
      if (!cue.positional || !cue.tile) return cue;
      const e = frame.eligibility(cue.tile.gx, cue.tile.gy);
      if (shouldEmitFeedback(e.revealed, e.onScreen)) return cue;
      const { tile: _tile, ...rest } = cue;
      return { ...rest, positional: false };
    });

    // ducks first (H.2): the combat side-chain + each admitted ducking trigger.
    if (combatDuckTriggered(obs.combatEventCount ?? 0)) {
      const d = duckFor('combat');
      if (d) intents.push(d);
    }
    for (const cue of admitted) {
      const d = duckFor(cue.key);
      if (d) intents.push(d);
    }
    // event one-shots — already in priority order (admission ran on the ordered list).
    for (const cue of admitted) {
      const oneShot: PlayOneShotIntent = {
        op: 'playOneShot', bus: 'oneshots', key: cue.key, priority: cue.priority,
        positional: cue.positional, ...(cue.tile ? { tile: cue.tile } : {}),
        gain: 1, source: cue.source,
      };
      intents.push(oneShot);
    }
  } else if (combatDuckTriggered(obs.combatEventCount ?? 0)) {
    const d = duckFor('combat');
    if (d) intents.push(d);
  }

  // ── E: district beds (4 Hz sample cadence; explored-weighted; hysteresis in the resolver) ──────
  let resolver = state.resolver;
  let bedVoices = state.bedVoices;
  let bedGeneration = state.bedGeneration;
  let lastBedSampleMs = state.lastBedSampleMs;
  if (frame.forceBedSample || frame.nowMs - state.lastBedSampleMs >= BED_SAMPLE_INTERVAL_MS) {
    lastBedSampleMs = frame.nowMs;
    const sample = sampleBedDistrict(frame.camera.centerTile, frame.districtAt);
    resolver = stepBedResolver(resolver, sample, frame.nowMs);
    // a district (re)start mints a fresh voice generation, so a returning district can never collide
    // with its own still-fading tail (the A→B→A border-oscillation case).
    if (resolver.current !== null && !bedVoices.some((v) => v.district === resolver.current)) bedGeneration++;
    const plan = planBedIntents(bedVoices, resolver.current, frame.camera.audioZoom, resolver.holdPenalty, bedGeneration);
    bedVoices = plan.voices;
    intents.push(...plan.intents);
  }

  // ── G: positional prop emitters (2 Hz candidate cadence; seeded rhythm scheduler) ──────────────
  let emitters = state.emitters;
  let lastEmitterPlanMs = state.lastEmitterPlanMs;
  if (frame.forceEmitterPlan || frame.nowMs - state.lastEmitterPlanMs >= EMITTER_PLAN_INTERVAL_MS) {
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
    state: { resolver, bedVoices, bedGeneration, emitters, rate, lastBedSampleMs, lastEmitterPlanMs },
    intents,
    rejected,
  };
}
