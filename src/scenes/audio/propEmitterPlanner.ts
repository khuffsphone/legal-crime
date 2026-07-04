// propEmitterPlanner.ts — AUDIO E-H, Ticket G2: the pure positional-emitter PLANNER — gating, zoom LOD,
// screen-space attenuation/pan, density caps, pooling identity, and the SEEDED (deterministic) rhythm
// scheduler. Emits intents only; zero AudioManager calls; zero /src/sim runtime imports (types only —
// erased at compile). The caller drives it at the 2 Hz candidate cadence (G.4) and threads state through.
//
// NO-X-RAY: every positional emitter passes the SHIPPED gate — shouldEmitFeedback(revealed, onScreen)
// (weaponFeedback.ts) — fed by the H3 adapter's single isAudioFeedbackEligible closure. Revealed is the
// grow-only explored-ever fog; no LOS, no re-shroud. No tile ⇒ no emitter (structurally: every
// EmitterSource carries its tile).
//
// R2 (validated): audioZoom is the REAL cam.zoom (Phaser zoom 1 == the default pixels-per-tile).
// Audio-FAR fires at zoom < 0.65 — STRICTLY BEFORE the visual prop-hide at zoom < 0.45 while zooming
// out — so an emitter can never be audible while its prop is hidden.

import type { GridPos } from '../../sim';
import { shouldEmitFeedback } from '../weaponFeedback';
import { emitterStyleDistrict } from './districtBedCatalog';
import {
  emitterTreatment, type AnchorLoopTreatment, type EmitterSource, type RhythmOneShotTreatment,
} from './propEmitterCatalog';
import type { DistrictArchetype } from '../art/districtIdentity';
import { PROP_RHYTHM_PRIORITY, dbToGain, type AtmosphereIntent } from './atmosphereIntents';

// ── zoom LOD (G.6) ────────────────────────────────────────────────────────────────────────────────
export type AudioLod = 'far' | 'mid' | 'near';

export function audioLod(audioZoom: number): AudioLod {
  if (audioZoom < 0.65) return 'far';   // emitters OFF (≥ the 0.45 visual hide — R2)
  if (audioZoom <= 1.15) return 'mid';  // anchor loops only
  return 'near';                        // anchors + rhythm one-shots
}

// ── screen-space attenuation + pan (G.5); listener = screen center ───────────────────────────────
// The iso projection constants are the canon 128×64 tile (src/sim/iso.ts) — inlined so this module
// carries no runtime sim import; a canon change would be a breaking art-pipeline event, not a tweak.
const ISO_HALF_W = 64;
const ISO_HALF_H = 32;

function toScreenPx(pos: GridPos): { x: number; y: number } {
  return { x: (pos.gx - pos.gy) * ISO_HALF_W, y: (pos.gx + pos.gy) * ISO_HALF_H };
}

/** G.5 distance→gain curve in dB (piecewise-linear between the spec knots); null = beyond the hard
 * kill radius (> 720 px). 0-96 px full; -9 dB @ 360; -24 dB @ 640; silence by 720. */
export function emitterGainDb(distPx: number): number | null {
  if (distPx > 720) return null;
  if (distPx <= 96) return 0;
  if (distPx <= 360) return (-9 * (distPx - 96)) / (360 - 96);
  if (distPx <= 640) return -9 + (-15 * (distPx - 360)) / (640 - 360);
  return -24 + (-36 * (distPx - 640)) / (720 - 640); // -24 → -60: inaudible by the kill edge
}

/** Stereo pan from the horizontal screen offset, clamped to ±0.65 (G.5). */
export function emitterPan(dxPx: number): number {
  const pan = dxPx / 640;
  return pan < -0.65 ? -0.65 : pan > 0.65 ? 0.65 : pan;
}

// ── deterministic per-source rng (seeded — NEVER Math.random; same seed+inputs ⇒ same schedule) ──
function hash32(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ b, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** A [0,1) draw for (seed, sourceId, salt) — pure and stable. */
export function seededDraw(seed: number, sourceId: string, salt: number): number {
  return hash32(hash32(seed >>> 0, hashStr(sourceId)), salt >>> 0) / 0x100000000;
}

// ── G.4/G.5/H.4 rhythm + density constants ───────────────────────────────────────────────────────
export const MAX_ANCHOR_LOOPS = 4;
export const ANCHOR_FADE_IN_MS = 700;
export const ANCHOR_FADE_OUT_MS = 900;
export const RHYTHM_COOLDOWN_MIN_MS = 18_000;
export const RHYTHM_COOLDOWN_MAX_MS = 42_000;
export const RHYTHM_FAMILY_COOLDOWN_MS = 8_000;
export const RHYTHM_GLOBAL_MIN_GAP_MS = 1_500;  // 1 start per 1.5 s
export const RHYTHM_WINDOW_MS = 10_000;
export const RHYTHM_MAX_PER_WINDOW = 4;         // 4 starts per rolling 10 s

// ── planner state (thread through; treat as opaque) ─────────────────────────────────────────────
export interface ActiveAnchor {
  voiceId: string;
  sourceId: string;
  family: string;
  clipKey: string;
  gx: number;
  gy: number;
}

export interface EmitterPlannerState {
  seed: number;
  anchors: ActiveAnchor[];
  /** per-source epoch-ms before which its rhythm may not fire again (18-42 s draws). */
  rhythmNextAt: Record<string, number>;
  /** per-source fire count — salts the next cooldown draw so the schedule stays aperiodic. */
  rhythmFires: Record<string, number>;
  familyLastMs: Record<string, number>;
  recentStarts: number[];
  lastGlobalStartMs: number;
}

export function createEmitterPlannerState(seed: number): EmitterPlannerState {
  return { seed: seed >>> 0, anchors: [], rhythmNextAt: {}, rhythmFires: {}, familyLastMs: {}, recentStarts: [], lastGlobalStartMs: -1e12 };
}

export interface EmitterEligibility { revealed: boolean; onScreen: boolean; }

export interface EmitterPlanInputs {
  sources: readonly EmitterSource[];
  nowMs: number;
  audioZoom: number;
  /** camera focal tile (fractional ok) — the G.5 listener. */
  screenCenter: GridPos;
  /** the H3 adapter's single eligibility closure (feeds the shipped shouldEmitFeedback). */
  eligibility: (gx: number, gy: number) => EmitterEligibility;
  /** ART archetype at a tile (explored or not — styling only, never a reveal channel), for the
   * preferDistrict rank bonus; QUARTER styles as TENEMENT (E.1 fallback). Optional. */
  districtAt?: (gx: number, gy: number) => DistrictArchetype | null;
}

export interface EmitterPlan {
  state: EmitterPlannerState;
  intents: AtmosphereIntent[];
}

interface Candidate {
  source: EmitterSource;
  distPx: number;
  dxPx: number;
  gainDb: number;
}

function candidateFor(source: EmitterSource, centerPx: { x: number; y: number }, eligibility: EmitterPlanInputs['eligibility']): Candidate | null {
  const e = eligibility(source.gx, source.gy);
  if (!shouldEmitFeedback(e.revealed, e.onScreen)) return null; // the ONE no-x-ray gate
  const p = toScreenPx({ gx: source.gx, gy: source.gy });
  const dx = p.x - centerPx.x;
  const dy = p.y - centerPx.y;
  const dist = Math.hypot(dx, dy);
  const gainDb = emitterGainDb(dist);
  if (gainDb === null) return null; // beyond the hard kill radius
  return { source, distPx: dist, dxPx: dx, gainDb };
}

/**
 * Plan one emitter step (call at the 2 Hz cadence, or on camera-move ≥0.5 tile / LOD change /
 * eligibility change). Deterministic: same state + inputs ⇒ same plan. Pure — returns new state.
 */
export function planEmitters(state: EmitterPlannerState, inputs: EmitterPlanInputs): EmitterPlan {
  const intents: AtmosphereIntent[] = [];
  const lod = audioLod(inputs.audioZoom);

  // FAR: everything off — loops fade within 900 ms, no rhythm scheduling at all (G.6).
  if (lod === 'far') {
    for (const a of state.anchors) intents.push({ op: 'stopLoop', bus: 'emitters', voiceId: a.voiceId, fadeOutMs: ANCHOR_FADE_OUT_MS });
    return { state: { ...state, anchors: [] }, intents };
  }

  const centerPx = toScreenPx(inputs.screenCenter);

  // ── anchors (MID + NEAR) ───────────────────────────────────────────────────────────────────────
  const anchorCands: (Candidate & { t: AnchorLoopTreatment })[] = [];
  const rhythmCands: (Candidate & { t: RhythmOneShotTreatment })[] = [];
  for (const s of inputs.sources) {
    const t = emitterTreatment(s.family);
    if (!t || t.kind === 'silent') continue; // silent filler: catalogued, never a playback command
    const c = candidateFor(s, centerPx, inputs.eligibility);
    if (!c) continue;
    if (t.kind === 'anchorLoop') anchorCands.push({ ...c, t });
    else rhythmCands.push({ ...c, t });
  }

  const activeIds = new Set(state.anchors.map((a) => a.sourceId));
  // G.4 ranking: treatment rank → keep a stable existing loop → closer to center → stable id.
  anchorCands.sort((a, b) =>
    a.t.rank - b.t.rank
    || Number(!activeIds.has(a.source.id)) - Number(!activeIds.has(b.source.id))
    || a.distPx - b.distPx
    || a.source.id.localeCompare(b.source.id));

  // greedy pick: family diversity FIRST (one per family in rank order), then fill remaining slots
  // (street_tree may take its 2nd), never exceeding per-family caps or the 4-loop total.
  const perFamily = new Map<string, number>();
  const chosen: (Candidate & { t: AnchorLoopTreatment })[] = [];
  for (const pass of [1, 2] as const) {
    for (const c of anchorCands) {
      if (chosen.length >= MAX_ANCHOR_LOOPS) break;
      if (chosen.includes(c)) continue;
      const n = perFamily.get(c.source.family) ?? 0;
      const capThisPass = pass === 1 ? 1 : c.t.maxPerScreen;
      if (n >= capThisPass || n >= c.t.maxPerScreen) continue;
      perFamily.set(c.source.family, n + 1);
      chosen.push(c);
    }
  }

  const nextAnchors: ActiveAnchor[] = [];
  const chosenIds = new Set(chosen.map((c) => c.source.id));
  for (const a of state.anchors) {
    if (!chosenIds.has(a.sourceId)) intents.push({ op: 'stopLoop', bus: 'emitters', voiceId: a.voiceId, fadeOutMs: ANCHOR_FADE_OUT_MS });
  }
  for (const c of chosen) {
    const gain = dbToGain(c.gainDb);
    const pan = emitterPan(c.dxPx);
    const existing = state.anchors.find((a) => a.sourceId === c.source.id);
    if (existing) {
      nextAnchors.push(existing);
      intents.push({ op: 'setLoop', bus: 'emitters', voiceId: existing.voiceId, gain, pan }); // re-trim without restart
    } else {
      const voice: ActiveAnchor = {
        voiceId: `emitter:${c.source.id}`, sourceId: c.source.id, family: c.source.family,
        clipKey: c.t.clipKey, gx: c.source.gx, gy: c.source.gy,
      };
      nextAnchors.push(voice);
      intents.push({ op: 'playLoop', bus: 'emitters', key: c.t.clipKey, voiceId: voice.voiceId, gain, fadeInMs: ANCHOR_FADE_IN_MS, pan });
    }
  }

  // ── rhythm one-shots (NEAR only; seeded scheduler, H.4/G.5 rate caps) ─────────────────────────
  const nowMs = inputs.nowMs;
  const nextAtTable = { ...state.rhythmNextAt };
  const firesTable = { ...state.rhythmFires };
  const familyLast = { ...state.familyLastMs };
  let recentStarts = state.recentStarts.filter((t) => nowMs - t < RHYTHM_WINDOW_MS);
  let lastGlobal = state.lastGlobalStartMs;

  if (lod === 'near' && rhythmCands.length > 0) {
    const drawCooldown = (id: string, salt: number): number =>
      RHYTHM_COOLDOWN_MIN_MS + seededDraw(state.seed, id, salt) * (RHYTHM_COOLDOWN_MAX_MS - RHYTHM_COOLDOWN_MIN_MS);

    // arm first-seen sources with a full seeded cooldown (subtle: the street doesn't clatter on arrival).
    for (const c of rhythmCands) {
      if (nextAtTable[c.source.id] === undefined) nextAtTable[c.source.id] = nowMs + drawCooldown(c.source.id, 0);
    }

    const globalOpen = nowMs - lastGlobal >= RHYTHM_GLOBAL_MIN_GAP_MS && recentStarts.length < RHYTHM_MAX_PER_WINDOW;
    if (globalOpen) {
      const ready = rhythmCands
        .filter((c) => nowMs >= (nextAtTable[c.source.id] ?? Infinity))
        .filter((c) => nowMs - (familyLast[c.source.family] ?? -1e12) >= RHYTHM_FAMILY_COOLDOWN_MS)
        .sort((a, b) => {
          // preferDistrict bonus (produce_stall prefers MARKET block-faces), then distance, then id.
          const prefA = a.t.preferDistrict && inputs.districtAt
            && emitterStyleDistrict(inputs.districtAt(a.source.gx, a.source.gy) ?? 'TENEMENT') === a.t.preferDistrict ? 0 : 1;
          const prefB = b.t.preferDistrict && inputs.districtAt
            && emitterStyleDistrict(inputs.districtAt(b.source.gx, b.source.gy) ?? 'TENEMENT') === b.t.preferDistrict ? 0 : 1;
          return prefA - prefB || a.distPx - b.distPx || a.source.id.localeCompare(b.source.id);
        });
      const fire = ready[0]; // ≤1 start per plan step — with the 2 Hz cadence this sits under 1/1.5 s
      if (fire) {
        const fires = (firesTable[fire.source.id] ?? 0) + 1;
        firesTable[fire.source.id] = fires;
        nextAtTable[fire.source.id] = nowMs + drawCooldown(fire.source.id, fires);
        familyLast[fire.source.family] = nowMs;
        recentStarts = [...recentStarts, nowMs];
        lastGlobal = nowMs;
        intents.push({
          op: 'playOneShot', bus: 'emitters', key: fire.t.clipKey, priority: PROP_RHYTHM_PRIORITY,
          positional: true, tile: { gx: fire.source.gx, gy: fire.source.gy },
          gain: dbToGain(fire.gainDb), pan: emitterPan(fire.dxPx), source: `prop:${fire.source.id}`,
        });
      }
    }
  }

  // bound the schedule tables to the sources still on the board (stale ids drop off).
  const liveIds = new Set(inputs.sources.map((s) => s.id));
  for (const id of Object.keys(nextAtTable)) if (!liveIds.has(id)) { delete nextAtTable[id]; delete firesTable[id]; }

  return {
    state: {
      ...state, anchors: nextAnchors, rhythmNextAt: nextAtTable, rhythmFires: firesTable,
      familyLastMs: familyLast, recentStarts, lastGlobalStartMs: lastGlobal,
    },
    intents,
  };
}
