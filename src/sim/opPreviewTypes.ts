// OPERATION-OUTCOME PREVIEWS · TYPES (pure; Phaser-free). A read-only projection layer: it describes what
// the sim ALREADY computes for the four player verbs (attack_rival / extort_front / retake_front /
// federal_heat_action) BEFORE the player commits. It adds NO mechanics and reveals NOTHING the fog hides.
//
// LAW (mirrors the q7 minimap ruling):
//   • NO-X-RAY — anything behind the fog, or any rival stat the sim does not expose, is 'Unknown' /
//     'visible only'. NEVER reveal a fog-hidden rival or invent a number the sim didn't already produce.
//   • 100% is shown ONLY for genuinely deterministic outcomes (the combat damage table has no miss roll;
//     the shakedown always converts on completion; the lockout always lands). Risk that the sim does not
//     quantify is described, never given a fabricated probability.
//
// The view-model carries a TONE, not a hex colour — the renderer applies the palette (and the danger =
// MOTION-only treatment) so the colour law stays in one place.

/** The four previewable player verbs. `federal_heat_action` is the Bureau LOCKOUT (the federal channel). */
export type OpVerb = 'attack_rival' | 'extort_front' | 'retake_front' | 'federal_heat_action';

/** A row's semantic weight — the renderer maps it to the palette (good = brass/win, risk = danger MOTION,
 * block = a hard gate, neutral = plain readout). NOT a colour. */
export type PreviewTone = 'neutral' | 'good' | 'risk' | 'block';

/** One labelled readout line. `value` is already humanised ('Unknown' / 'visible only' where the sim is
 * silent or the fog hides the target). */
export interface PreviewRow {
  label: string;
  value: string;
  tone?: PreviewTone;
}

/**
 * A pre-commit preview for one verb against one target.
 *   • `blocked` — a hard gate refuses the order right now; `blocker` carries the (existing) gate reason.
 *   • `glance` — the GLANCE card: ≤4 primary rows (result-or-blocker, chance/risk, cost/reward/time,
 *     requirement/commit-hint).
 *   • `detail` — the HOLD-ALT expansion: modifiers, assumptions, threshold crossings, visible-only caveats.
 */
export interface OpPreview {
  verb: OpVerb;
  title: string;
  blocked: boolean;
  blocker?: string;
  glance: PreviewRow[];
  detail: PreviewRow[];
}

/** The unknown sentinels — used everywhere the sim does not expose a value (NO-X-RAY). */
export const UNKNOWN = 'Unknown';
export const VISIBLE_ONLY = 'visible only';

/** Cap on the GLANCE card — the at-a-glance read stays ≤4 rows; everything else lives in the detail. */
export const MAX_GLANCE_ROWS = 4;
