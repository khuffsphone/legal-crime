// PROCEDURAL FIDELITY (BRASSMERE) — the figure-renderer flags, pure & Phaser-free so they unit-test in
// node. Both default to the IDENTITY so the current renderer is byte-for-byte unchanged unless flagged:
//   ?fig2[=on|off]   — toggle the higher-fidelity thug drawer (drawThugRig2) vs the current one (default OFF).
//   ?figscale=<px>   — render the figure at a target height in px so K can find the readable sweet spot
//                      (~56 / 72 / 80). Default = FIG_BASE_PX (56) → scale factor 1.0 (no change).

/** The current figure-height contract (gait FIGURE_PX). figscale is expressed relative to this. */
export const FIG_BASE_PX = 56;
/** Sane clamp for ?figscale so a typo can't blow the figure up past the world scale or vanish it. */
export const FIG_SCALE_MIN = 40;
export const FIG_SCALE_MAX = 96;
/** ?fig2 default — OFF, so production/normal boots keep the current renderer. */
export const FIG2_DEFAULT = false;

/**
 * Parse the ?fig2 feature flag. `?fig2`, `?fig2=on|1|true|yes` → ON; `?fig2=off|0|false|no` → OFF; absent or
 * unrecognised → FIG2_DEFAULT (off). Case-insensitive. Pure.
 */
export function parseFig2Flag(search: string): boolean {
  if (!search) return FIG2_DEFAULT;
  const p = new URLSearchParams(search);
  if (!p.has('fig2')) return FIG2_DEFAULT;
  const v = (p.get('fig2') ?? '').toLowerCase();
  if (v === '' || v === 'on' || v === '1' || v === 'true' || v === 'yes') return true;
  if (v === 'off' || v === '0' || v === 'false' || v === 'no') return false;
  return FIG2_DEFAULT;
}

/**
 * Parse ?figscale as a TARGET figure height in px. Absent / non-numeric / ≤0 → FIG_BASE_PX (56, the no-op
 * default). A valid value is clamped to [FIG_SCALE_MIN, FIG_SCALE_MAX]. Pure.
 */
export function parseFigScalePx(search: string): number {
  if (!search) return FIG_BASE_PX;
  const raw = new URLSearchParams(search).get('figscale');
  if (raw === null) return FIG_BASE_PX;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return FIG_BASE_PX;
  return Math.max(FIG_SCALE_MIN, Math.min(FIG_SCALE_MAX, n));
}

/** The uniform scale factor to apply to the rig Graphics (FIG_BASE_PX → 1.0 = the current 56px figure). */
export function figScaleFactor(px: number): number {
  return px / FIG_BASE_PX;
}
