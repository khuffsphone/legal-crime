// POLISH-PASS v2 · PACKAGE 3 — CAMERA FEEL (pure math; Phaser-free). The response that makes a hit land:
// a severity-banded HIT-STOP (a brief freeze of WORLD visual time — the sim keeps running), a decaying-sine
// SCREEN-NUDGE on the WORLD camera, and focus easing toward the EXISTING zoom stops. This module owns only
// the MATH (durations / windows / offsets) so it is unit-tested; the renderer applies the numbers.
//
// CANON HELD: the fixed UI/HUD camera is SACRED — these offsets/freezes apply to the WORLD camera ONLY,
// never the HUD. Hit-stop freezes WORLD VISUAL time only; the economic/combat sim is untouched. Beat kinds
// map onto EXISTING events (no new beats). Focus easing REUSES the caller's ZOOM_STOPS (passed in) — it does
// not duplicate the zoom-stop constant.

/** Beat severities — mapped onto EXISTING events (a normal combat hit, a kill, a demolish, a federal raid,
 * the win/loss sting). Ordered low→high feel. */
export type BeatSeverity = 'normalHit' | 'kill' | 'demolition' | 'federalRaid' | 'winLoss';

/** Hit-stop freeze duration per severity (ms) — banded + ascending. A bigger blow holds the frame longer. */
export const HIT_STOP_MS: Record<BeatSeverity, number> = {
  normalHit: 40, kill: 90, demolition: 120, federalRaid: 150, winLoss: 220,
};

/** After a hit-stop fires, ignore new requests for this long — the anti-stack lockout (so a flurry of hits
 * can't chain into a long, mushy freeze). */
export const HIT_STOP_LOCKOUT_MS = 60;

/** Screen-nudge amplitude (px) + duration (ms) per severity. */
export const NUDGE: Record<BeatSeverity, { amp: number; ms: number }> = {
  normalHit: { amp: 1.5, ms: 120 }, kill: { amp: 3, ms: 200 }, demolition: { amp: 5, ms: 280 },
  federalRaid: { amp: 4, ms: 240 }, winLoss: { amp: 6, ms: 320 },
};

/** A hard clamp on the nudge — the world camera is never thrown more than this (keeps it a punch, not a lurch). */
export const NUDGE_MAX_PX = 8;

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

// ── HIT-STOP (no-stacking + lockout) ───────────────────────────────────────────────────────────
export interface HitStopState {
  /** WORLD visual time is frozen until this absolute ms. */
  until: number;
  /** No new hit-stop is accepted until this absolute ms (the anti-stack lockout). */
  lockedUntil: number;
}

export function initHitStop(): HitStopState {
  return { until: 0, lockedUntil: 0 };
}

/**
 * Request a hit-stop. It fires ONLY if not within the lockout window (no stacking — a request during the
 * lockout is dropped, leaving the active window untouched). A fired request sets a SINGLE window (the
 * severity's duration — never summed) and arms the lockout. Pure (returns a new state). `nowMs` is absolute.
 */
export function requestHitStop(s: HitStopState, severity: BeatSeverity, nowMs: number): HitStopState {
  if (nowMs < s.lockedUntil) return s;                 // locked out → ignore (no stacking)
  const until = nowMs + HIT_STOP_MS[severity];
  return { until, lockedUntil: until + HIT_STOP_LOCKOUT_MS };
}

/** Whether WORLD visual time is currently frozen. Pure. */
export function worldFrozen(s: HitStopState, nowMs: number): boolean {
  return nowMs < s.until;
}

// ── SCREEN-NUDGE (decaying sine, clamped, one-impulse-not-summed) ───────────────────────────────
/**
 * A single decaying-sine nudge magnitude (px) at `elapsedMs` into an impulse of `amp`/`durMs`. Zero before
 * the impulse and after it ends; a quadratic decay envelope on a sine; hard-clamped to NUDGE_MAX_PX. Pure.
 */
export function screenNudge(elapsedMs: number, amp: number, durMs: number, freqHz = 22): number {
  if (durMs <= 0 || elapsedMs < 0 || elapsedMs >= durMs) return 0;
  const t = elapsedMs / durMs;
  const decay = (1 - t) * (1 - t);
  const raw = amp * decay * Math.sin(2 * Math.PI * freqHz * (elapsedMs / 1000));
  return clamp(raw, -NUDGE_MAX_PX, NUDGE_MAX_PX);
}

export interface NudgeState {
  start: number;
  amp: number;
  ms: number;
}

export function initNudge(): NudgeState {
  return { start: Number.NEGATIVE_INFINITY, amp: 0, ms: 0 };
}

/** Request a nudge — it REPLACES the active impulse (one-impulse-not-summed: a new beat takes over rather
 * than adding amplitude, so rapid beats never compound into a lurch). Pure. */
export function requestNudge(_s: NudgeState, severity: BeatSeverity, nowMs: number): NudgeState {
  return { start: nowMs, amp: NUDGE[severity].amp, ms: NUDGE[severity].ms };
}

/** The current WORLD-camera offset for the active nudge (mostly horizontal, a touch vertical for iso feel).
 * Clamped via screenNudge. Pure. */
export function nudgeOffset(s: NudgeState, nowMs: number): { dx: number; dy: number } {
  const mag = screenNudge(nowMs - s.start, s.amp, s.ms);
  return { dx: mag, dy: mag * 0.5 };
}

// ── FOCUS EASING (through the EXISTING zoom stops) ──────────────────────────────────────────────
/** A frame-step ease from `current` toward `target` by `factor` (0..1). Pure — the renderer uses this for
 * the world camera's zoom/pan glide; it does NOT touch the HUD camera. */
export function focusEase(current: number, target: number, factor = 0.22): number {
  return current + (target - current) * clamp(factor, 0, 1);
}

/** The nearest of the caller's EXISTING zoom stops to `zoom` (REUSES the passed-in ZOOM_STOPS — no duplicate
 * stop constant lives here). Pure. */
export function nearestZoomStop(zoom: number, stops: readonly number[]): number {
  let best = stops[0] ?? zoom, bestD = Number.POSITIVE_INFINITY;
  for (const s of stops) { const d = Math.abs(s - zoom); if (d < bestD) { bestD = d; best = s; } }
  return best;
}

// ── BEAT → FEEL MAPPING ─────────────────────────────────────────────────────────────────────────
export interface CameraFeel {
  hitStopMs: number;
  nudgeAmp: number;
  nudgeMs: number;
}

/** The full camera-feel profile for a beat severity (maps onto EXISTING events). Pure. */
export function cameraFeelForBeat(severity: BeatSeverity): CameraFeel {
  return { hitStopMs: HIT_STOP_MS[severity], nudgeAmp: NUDGE[severity].amp, nudgeMs: NUDGE[severity].ms };
}
