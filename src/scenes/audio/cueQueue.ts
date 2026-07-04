// ⚠ SUPERSEDED (A-D era) — the E-H lane's mixGovernance.admitCue owns duplicate/rate governance on
// the live coordinator path (different windows/constants). Tuning THIS module changes nothing the
// coordinator plays. Kept only until H3 lands; retire with the A-D lane.
// cueQueue.ts — AUDIO ATMOSPHERE lane, Ticket D: the pure PRIORITY + COOLDOWN queue reducer. Phaser-free,
// clock-free (the caller passes nowMs — deterministic and testable). Sits AFTER the no-x-ray gate
// (Ticket C) and decides, for one frame's gated cues, WHICH actually reach the (deferred) playback layer:
//
// 1. COOLDOWN DEDUPE — a cue whose cooldownKey fired within its window is suppressed (spam: eight
//    collectors banking, a machine-gun trade, a raid siren re-firing). Within one batch the same
//    cooldownKey keeps only its highest-priority cue. Dedupe applies to EVERY priority (even 1 —
//    duplicate-spam suppression is about identity, not importance).
// 2. LOAD SHEDDING — at most maxVoicesPerStep survivors per step. Priority-1 cues are NEVER shed.
//    Remaining slots fill by priority (1 first); on equal priority GLOBAL/HUD cues outrank LOCAL ones
//    (locals are world texture, globals are the player's own information), then arrival order. So under
//    load the low-priority local texture drops first — the ticket's exact rule.
//
// This is a REDUCER: (state, cues, now) → { state', play, dropped }. It never plays audio, never mutates
// its inputs, and complements (does not replace) the existing AudioManager-side debounces — this layer
// decides which CUES are worth a voice; the manager still owns per-clip voice pooling.

import type { AudioEventCategory } from './atmosphereSpine';
import type { AudioCueDescriptor } from './sfxEventMapper';

/** Cooldown window per event category (ms) — how long a cooldownKey stays hot after it plays. Combat is
 * short (a firefight should crackle, not gate to one tap); federal/crew/phase are long (a klaxon must not
 * machine-gun); ambient beds never cue through this queue (0). Override per call via options. */
export const DEFAULT_COOLDOWN_MS: Readonly<Record<AudioEventCategory, number>> = {
  combat: 150,
  economy: 450,
  federal: 2500,
  crew: 2500,
  territory: 1500,
  phase: 2500,
  ui: 90,
  ambient: 0,
};

/** Max cues admitted per reduce step (voices are a shared budget; the rest shed by priority). */
export const DEFAULT_MAX_VOICES_PER_STEP = 4;

export interface CueQueueOptions {
  /** Per-category cooldown overrides (ms); unlisted categories use DEFAULT_COOLDOWN_MS. */
  cooldownMs?: Partial<Record<AudioEventCategory, number>>;
  /** Max cues admitted this step (default DEFAULT_MAX_VOICES_PER_STEP). Priority-1 ignores the cap. */
  maxVoicesPerStep?: number;
}

/** The reducer's persistent state: cooldownKey → epoch-ms until which it is hot. Treat as opaque;
 * create with createCueQueueState(). */
export interface CueQueueState {
  hotUntilMs: Readonly<Record<string, number>>;
}

export function createCueQueueState(): CueQueueState {
  return { hotUntilMs: {} };
}

export type CueDropReason = 'cooldown' | 'duplicate-in-batch' | 'load';

export interface CueQueueResult {
  state: CueQueueState;
  /** Cues to hand to playback, in priority order (1 first; stable within a rank). */
  play: AudioCueDescriptor[];
  /** What was suppressed and why (diagnostics / ?debugaudio). */
  dropped: Array<{ cue: AudioCueDescriptor; reason: CueDropReason }>;
}

function windowFor(cue: AudioCueDescriptor, opts?: CueQueueOptions): number {
  return opts?.cooldownMs?.[cue.category] ?? DEFAULT_COOLDOWN_MS[cue.category];
}

/**
 * Reduce one frame's (already no-x-ray-gated) cues against the cooldown state. Pure — returns a NEW
 * state; inputs untouched; same inputs ⇒ same outputs (the caller supplies nowMs).
 */
export function reduceCueQueue(
  state: CueQueueState,
  cues: readonly AudioCueDescriptor[],
  nowMs: number,
  opts?: CueQueueOptions,
): CueQueueResult {
  const maxVoices = Math.max(1, opts?.maxVoicesPerStep ?? DEFAULT_MAX_VOICES_PER_STEP);
  const dropped: CueQueueResult['dropped'] = [];

  // ── 1. cooldown + in-batch dedupe: keep ONE cue per cooldownKey (the highest-priority one) ────
  const byKey = new Map<string, { cue: AudioCueDescriptor; order: number }>();
  cues.forEach((cue, order) => {
    const hotUntil = state.hotUntilMs[cue.cooldownKey] ?? 0;
    if (hotUntil > nowMs) {
      dropped.push({ cue, reason: 'cooldown' });
      return;
    }
    const held = byKey.get(cue.cooldownKey);
    if (!held) {
      byKey.set(cue.cooldownKey, { cue, order });
    } else if (cue.priority < held.cue.priority) {
      dropped.push({ cue: held.cue, reason: 'duplicate-in-batch' }); // outranked by the newcomer
      byKey.set(cue.cooldownKey, { cue, order: held.order });        // keep the earlier slot (stable)
    } else {
      dropped.push({ cue, reason: 'duplicate-in-batch' });
    }
  });

  // ── 2. load shedding: sort by (priority, global-before-local, arrival); cap survivors ─────────
  const candidates = [...byKey.values()].sort((a, b) =>
    a.cue.priority - b.cue.priority
    || Number(a.cue.spatial === 'local') - Number(b.cue.spatial === 'local')
    || a.order - b.order);

  const play: AudioCueDescriptor[] = [];
  for (const c of candidates) {
    if (c.cue.priority === 1 || play.length < maxVoices) play.push(c.cue);
    else dropped.push({ cue: c.cue, reason: 'load' }); // low-priority (local-last) texture sheds first
  }

  // ── 3. arm cooldowns for what plays; prune expired keys so the record stays bounded ───────────
  const hot: Record<string, number> = {};
  for (const [key, until] of Object.entries(state.hotUntilMs)) {
    if (until > nowMs) hot[key] = until;
  }
  for (const cue of play) {
    const w = windowFor(cue, opts);
    if (w > 0) hot[cue.cooldownKey] = nowMs + w;
  }

  return { state: { hotUntilMs: hot }, play, dropped };
}
