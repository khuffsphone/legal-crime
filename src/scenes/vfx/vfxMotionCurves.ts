// POLISH-PASS v2 · PACKAGE 2 — VFX MOTION CURVES (pure math; Phaser-free). REFINES the existing RTS-30e
// harvest beats (combatContact / playKill / leanBeat …) with crisp attack-decay envelopes — it adds NO new
// beats; the renderer feeds elapsed-ms through these to drive a one-shot's alpha/scale each frame.
//
// CANON HELD: danger reds are MOTION-only. The muzzle/danger family STANDARDIZES on #FF5A2C; the hotter
// #E11D1D is used ONLY on an ACTIVE-danger frame (a live hit), never as a resting tint. Smoke is allowed
// ONLY on beats that ALREADY leave lingering damage (a demolish's debris, a downed body) — never on a clean
// muzzle/shatter/sparkle.

/** The muzzle flash is a SNAP — capped at 120ms (was ~150) so it punches and clears. */
export const MUZZLE_FLASH_MS = 120;
export const CASH_SPARKLE_MS = 520;
export const DUST_MS = 800;
export const SMOKE_MS = 1400;
export const IMPACT_RING_MS = 360;

/** The standard danger/muzzle colour (motion-only). */
export const DANGER_MUZZLE = '#FF5A2C';
/** The hotter red — ONLY on an active-danger frame (a live hit), never a resting tint. */
export const DANGER_ACTIVE = '#E11D1D';

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * The core ATTACK-DECAY envelope (alpha 0..1 over normalized time 0..1): a quick linear ATTACK up to the
 * `attack` fraction, then a quadratic DECAY back to zero. 0 at the endpoints, peaks at the attack point.
 * Every refined beat shapes its alpha through this so one-shots punch in and ease out. Pure.
 */
export function vfxEnvelope(tNorm: number, attack = 0.15): number {
  const t = clamp01(tNorm);
  if (t <= 0 || t >= 1) return 0;
  const a = attack <= 0 ? 1e-4 : attack >= 1 ? 1 - 1e-4 : attack;
  if (t < a) return t / a;                       // crisp attack
  const d = (t - a) / (1 - a);                   // 0..1 across the decay
  return (1 - d) * (1 - d);                       // soft quadratic tail
}

/** Muzzle-flash alpha by elapsed ms — a near-instant attack, hard-capped to clear by MUZZLE_FLASH_MS. */
export function muzzleFlashCurve(elapsedMs: number): number {
  if (elapsedMs <= 0 || elapsedMs >= MUZZLE_FLASH_MS) return 0;
  return vfxEnvelope(elapsedMs / MUZZLE_FLASH_MS, 0.08);
}

/** Cash-sparkle {alpha, scale}: a bright pop that drifts/grows a touch as it fades. */
export function cashSparkleCurve(tNorm: number): { alpha: number; scale: number } {
  const e = vfxEnvelope(tNorm, 0.1);
  return { alpha: e, scale: 0.6 + (1 - e) * 0.8 };
}

/** Dust {alpha, scale}: a fast puff that expands and settles (clean impact — no smoke). */
export function dustCurve(tNorm: number): { alpha: number; scale: number } {
  const t = clamp01(tNorm);
  return { alpha: vfxEnvelope(t, 0.05), scale: 1 + t * 0.9 };
}

/** Smoke {alpha, scale}: a slow lingering rise→fall that keeps billowing — for lingering-damage beats only. */
export function smokeCurve(tNorm: number): { alpha: number; scale: number } {
  const t = clamp01(tNorm);
  const rise = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
  return { alpha: clamp01(rise) * 0.6, scale: 1 + t * 1.6 };
}

/** Optional impact-ring {alpha, scale}: an expanding shock ring that fades as it grows. */
export function impactRingCurve(tNorm: number): { alpha: number; scale: number } {
  const t = clamp01(tNorm);
  return { alpha: (1 - t) * (1 - t), scale: 0.4 + t * 4 };
}

/** The danger colour for a frame: the standard #FF5A2C, escalating to #E11D1D ONLY on an active-danger
 * frame (a live hit landing this frame). Pure — keeps the "static red = identity, hot red = live threat" law. */
export function dangerColor(activeDangerFrame: boolean): string {
  return activeDangerFrame ? DANGER_ACTIVE : DANGER_MUZZLE;
}

/** The refined beat kinds (the EXISTING RTS-30e beats — NOT new ones). */
export type BeatKind = 'muzzle' | 'shatter' | 'sparkle' | 'dust' | 'kill' | 'sabotage';

// the beats that ALREADY leave lingering damage (a demolish's debris field; a downed body + stain pool).
const LINGERING_DAMAGE: ReadonlySet<BeatKind> = new Set<BeatKind>(['dust', 'kill']);

/** Whether smoke may ride a beat — ONLY beats that already leave lingering damage (never a clean pop). Pure. */
export function smokeAllowed(beat: BeatKind): boolean {
  return LINGERING_DAMAGE.has(beat);
}
