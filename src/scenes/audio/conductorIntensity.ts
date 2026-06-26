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
