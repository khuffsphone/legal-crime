// POLISH-PASS v2 · PACKAGE 5 (audio half) — the CONDUCTOR INTENSITY function + hysteresis bed selection
// (pure math; Phaser-free). It blends EXISTING exposed signals into a 0..1 intensity and picks an in-match
// music bed with hysteresis, so the score swells with the action instead of thrashing.
//
// CANON HELD: the chosen phase is REQUESTED through the EXISTING RTS-31 conductBeds path (AudioManager
// .setPhase → conductBeds) — this module never starts/stops a bed itself, never bypasses the crossfade lock,
// and never breaks the ≤1-bed guarantee. The beds it picks (ESTABLISH/CONTEST/DECAPITATE) are EXISTING
// MusicPhase values. Inputs are mapped from already-exposed state; any input that isn't cleanly available
// should be passed as 0 (weight it out) — see the wiring note. It reads game STATE, never Phaser visuals.

import type { MusicPhase } from '../audioMap';
import type { HudPhase } from '../../sim/pacing';

export interface ConductorInputs {
  /** 0..1 — collector/unit threat (0 safe → 1 ambush). From threatenedCollectors levels. */
  threat: number;
  /** 0..3 — the federal ladder rungs (50/70/85 → NOTICE/WATCH/RAID). From realtimeHudView.player.federalTier. */
  federalTier: number;
  /** 0..1 — active unit-vs-unit combat heat this beat (from the RTS-35a combat signal). */
  activeCombat: number;
  /** 0..1 — progress through the current week (weekElapsed / SCENE_WEEK_SECONDS); a gentle build. */
  weekPacing: number;
}

export interface ConductorWeights {
  threat: number;
  federal: number;
  combat: number;
  week: number;
}

/** Default mix: threat / federal / combat carry the swell; week pacing is a light underpinning. All four
 * inputs are cleanly available from existing state, so none are zeroed. */
export const DEFAULT_WEIGHTS: ConductorWeights = { threat: 0.3, federal: 0.3, combat: 0.3, week: 0.1 };

// intensity bucket thresholds (ESTABLISH < T_LOW ≤ CONTEST < T_HIGH ≤ DECAPITATE).
export const T_LOW = 0.34;
export const T_HIGH = 0.67;
/** Dead-band around the thresholds — intensity must cross by this margin to switch (no edge chatter). */
export const HYSTERESIS_BAND = 0.08;
/** Minimum time on a bed before another switch is allowed (a second guard against thrash). */
export const MIN_DWELL_MS = 4000;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Blend the inputs into a single 0..1 intensity (a weighted, normalized mix). Each input is clamped to its
 * range first (federalTier/3 → 0..1). A zero-sum weight set returns 0. Pure.
 */
export function conductorIntensity(inputs: ConductorInputs, weights: ConductorWeights = DEFAULT_WEIGHTS): number {
  const threat = clamp01(inputs.threat);
  const federal = clamp01(inputs.federalTier / 3);
  const combat = clamp01(inputs.activeCombat);
  const week = clamp01(inputs.weekPacing);
  const sum = weights.threat + weights.federal + weights.combat + weights.week;
  if (sum <= 0) return 0;
  const raw = threat * weights.threat + federal * weights.federal + combat * weights.combat + week * weights.week;
  return clamp01(raw / sum);
}

/** The in-match bed bucket for an intensity (no hysteresis — the raw mapping). Pure. */
export function bedForIntensity(intensity: number): MusicPhase {
  const i = clamp01(intensity);
  if (i < T_LOW) return 'ESTABLISH';
  if (i < T_HIGH) return 'CONTEST';
  return 'DECAPITATE';
}

export interface ConductorState {
  /** The currently-REQUESTED in-match bed phase. */
  phase: MusicPhase;
  /** When we last switched (absolute ms). */
  sinceMs: number;
}

export function initConductor(phase: MusicPhase = 'ESTABLISH'): ConductorState {
  return { phase, sinceMs: Number.NEGATIVE_INFINITY };
}

const ORDER: ReadonlyArray<MusicPhase> = ['ESTABLISH', 'CONTEST', 'DECAPITATE'];

/**
 * Decide the bed with HYSTERESIS: only switch when the intensity has crossed a threshold by the dead-band
 * margin AND we've dwelt at least `minDwellMs` on the current bed. Returns the (possibly unchanged) state —
 * the wiring requests `result.phase` through AudioManager.setPhase (the EXISTING conductBeds path) only when
 * it changes. Pure.
 */
export function conductWithHysteresis(
  s: ConductorState,
  intensity: number,
  nowMs: number,
  minDwellMs: number = MIN_DWELL_MS,
  band: number = HYSTERESIS_BAND,
): ConductorState {
  const i = clamp01(intensity);
  let desired: MusicPhase = s.phase;
  if (s.phase === 'ESTABLISH') {
    if (i > T_HIGH + band) desired = 'DECAPITATE';
    else if (i > T_LOW + band) desired = 'CONTEST';
  } else if (s.phase === 'CONTEST') {
    if (i > T_HIGH + band) desired = 'DECAPITATE';
    else if (i < T_LOW - band) desired = 'ESTABLISH';
  } else { // DECAPITATE
    if (i < T_LOW - band) desired = 'ESTABLISH';
    else if (i < T_HIGH - band) desired = 'CONTEST';
  }
  if (desired === s.phase) return s;
  if (nowMs - s.sinceMs < minDwellMs) return s; // dwell guard — block rapid flips
  return { phase: desired, sinceMs: nowMs };
}

/** Whether `phase` is an INTENSITY-DRIVEN in-match bed (vs a terminal TITLE/GAMEOVER the scene drives
 * directly). The wiring uses intensity for these and bypasses it for TITLE/GAMEOVER/FIRST BLOOD. Pure. */
export function isIntensityBed(phase: MusicPhase): boolean {
  return ORDER.includes(phase);
}

// ── SOURCE-PHASE STING GOVERNOR — the CONDUCTOR half of the anti-thrash pass ─────────────────────────
// The narrative `hudPhase` (ESTABLISH → FIRST BLOOD → CONTEST → DECAPITATE) is a DISCRETE signal derived
// from matchPhase + districtsHeld, and it can OSCILLATE fast (e.g. districtsHeld flicking 1↔2 flips
// FIRST BLOOD↔CONTEST every beat). A raw "fire a sting whenever phase !== lastPhase" re-triggers and
// cross-fades a phase sting on every flicker = thrash. (The intensity-driven BED above already has its own
// hysteresis; the soft-SFX governor caps concurrent voices. This is the missing STING half.)
//
// This governor is the discrete-signal mirror of conductWithHysteresis: it applies TIME-DOMAIN HYSTERESIS
// (a candidate phase must HOLD continuously for a min dwell before it's committed — the Schmitt equivalent
// for a categorical signal; a flicker back to the old value resets the dwell clock so oscillation collapses
// to ONE stable state) and a Schmitt-style MARGIN (de-escalations to a calmer stage must hold LONGER than
// escalations — the score heats up promptly but drops out of a tense stage reluctantly). It also DEBOUNCES
// the sting so one can't re-fire within a min interval. Pure; no Phaser, no audio, builds no SFX key.
//
// WIRING (the playtest-gated half — NOT in this PR): in IsoScene.detectHudBeats, replace the raw
//   `if (this.lastPhase && this.lastPhase !== phase) this.audio?.play(this.audio.stingForPhaseKey(phase))`
// with a held PhaseStingState: `const r = governPhaseSting(this.phaseSting, phase, this.time.now);
// this.phaseSting = r.state; if (r.sting) this.audio?.play(this.audio.stingForPhaseKey(r.sting));`
// — the scene still owns the SFX-key mapping (stingForPhaseKey) and the play() call.

/** A new phase must HOLD continuously for this long before its sting is allowed (the dwell). */
export const STING_PHASE_DWELL_MS = 1000;
/** Schmitt MARGIN — a DE-escalation (dropping to a lower-rank/calmer phase) must hold this much LONGER
 * than an escalation before it commits, so the score doesn't drop out of a tense stage on a flicker. */
export const STING_DEESCALATION_MARGIN_MS = 1500;
/** Debounce — a phase sting can't re-fire within this interval of the previous one. */
export const MIN_STING_INTERVAL_MS = 2500;

/** Escalation order for the Schmitt margin (calmer → hotter). */
const PHASE_RANK: Readonly<Record<HudPhase, number>> = {
  ESTABLISH: 0,
  'FIRST BLOOD': 1,
  CONTEST: 2,
  DECAPITATE: 3,
};

export interface PhaseStingState {
  /** The phase we've STABLY accepted (the last one whose sting was considered). */
  committed: HudPhase;
  /** The most recently OBSERVED phase, still serving out its dwell. */
  candidate: HudPhase;
  /** When `candidate` was first observed (absolute ms) — the dwell clock. */
  candidateSinceMs: number;
  /** When a sting last fired (absolute ms) — the debounce anchor. */
  lastStingMs: number;
}

export interface PhaseStingResult {
  /** The (possibly unchanged) state to carry to the next call. */
  state: PhaseStingState;
  /** The phase whose sting should fire NOW (already hysteretic + debounced), or null to stay silent. */
  sting: HudPhase | null;
}

/** Seed the governor on the first observed phase WITHOUT firing a sting (mirrors the scene's `lastPhase`
 * seed). `lastStingMs` is −∞ so the first genuine, settled phase change can sting immediately. */
export function initPhaseSting(
  phase: HudPhase = 'ESTABLISH',
  nowMs: number = Number.NEGATIVE_INFINITY,
): PhaseStingState {
  return { committed: phase, candidate: phase, candidateSinceMs: nowMs, lastStingMs: Number.NEGATIVE_INFINITY };
}

/**
 * Fold one observed `hudPhase` into the governor. Returns the next state and whether a sting should fire.
 * Pure & deterministic — `nowMs` is the only clock.
 *
 *  1. A change in the observed phase RESTARTS the dwell clock — so a phase must hold CONTINUOUSLY to commit;
 *     an oscillating input never serves out its dwell and collapses to the committed state (no thrash).
 *  2. The candidate commits only once it has held for the required dwell: `dwellMs`, plus
 *     `deescalationMarginMs` extra when it's a de-escalation (Schmitt asymmetry — calmer stages are
 *     reluctant; hotter stages are prompt).
 *  3. On commit, the sting fires only if one hasn't fired within `minStingIntervalMs` (debounce). If it's
 *     debounced, the phase still commits (state advances) but the sting is suppressed.
 */
export function governPhaseSting(
  s: PhaseStingState,
  observed: HudPhase,
  nowMs: number,
  dwellMs: number = STING_PHASE_DWELL_MS,
  deescalationMarginMs: number = STING_DEESCALATION_MARGIN_MS,
  minStingIntervalMs: number = MIN_STING_INTERVAL_MS,
): PhaseStingResult {
  // 1. (re)start the dwell clock whenever the observed phase changes.
  let candidate = s.candidate;
  let candidateSinceMs = s.candidateSinceMs;
  if (observed !== candidate) {
    candidate = observed;
    candidateSinceMs = nowMs;
  }

  // 2. Already settled here → nothing to commit, nothing to sting.
  if (candidate === s.committed) {
    return { state: { ...s, candidate, candidateSinceMs }, sting: null };
  }

  // 3. Hysteresis: require the candidate to HOLD for the dwell (+ margin for a de-escalation).
  const deescalating = PHASE_RANK[candidate] < PHASE_RANK[s.committed];
  const required = dwellMs + (deescalating ? deescalationMarginMs : 0);
  if (nowMs - candidateSinceMs < required) {
    return { state: { ...s, candidate, candidateSinceMs }, sting: null };
  }

  // 4. Commit the phase change; debounce the sting.
  const canSting = nowMs - s.lastStingMs >= minStingIntervalMs;
  return {
    state: {
      committed: candidate,
      candidate,
      candidateSinceMs,
      lastStingMs: canSting ? nowMs : s.lastStingMs,
    },
    sting: canSting ? candidate : null,
  };
}
