// STATUS UI — Phase 1: the shared VIEW-MODEL. A screen body is a pure (state, visibility) -> ScreenView
// builder; ScreenView is plain data a renderer draws. Keeping the read layer as data (not pixels) is what
// makes the NO-X-RAY gate auditable: every fog-sensitive value is resolved in the builder through the
// StatusVisibility funnel, and a hidden entity becomes an `unknown` row — never its underlying record.
// Phaser-free.

/** Brassmere colour law (spec §1): brass=player/money, blood=rival/danger, law=Bureau/blue-gray,
 * money=dirty green, neutral=fog/bone. */
export type Tone = 'brass' | 'blood' | 'law' | 'money' | 'neutral';

/** A camera-jump target — ONLY ever set for a tile the player can actually see (NO-X-RAY). */
export interface JumpTarget { gx: number; gy: number; }

export type ScreenRow =
  /** A labelled value with an optional recent delta (spec §10.1). */
  | { kind: 'value'; label: string; value: string; delta?: string; tone?: Tone; jump?: JumpTarget }
  /** A meter with threshold ticks (heat/exposure/control/loyalty). */
  | { kind: 'meter'; label: string; value: number; max: number; thresholds?: number[]; tone?: Tone }
  /** A source-breakdown row (spec §10.1) — heat/exposure/money contributions. */
  | { kind: 'source'; label: string; contribution: string; note?: string; tone?: Tone; jump?: JumpTarget }
  /** A unit/person row (spec §10.3). */
  | { kind: 'unit'; name: string; role: string; primary: string; badge?: string; assignment?: string; tone?: Tone; jump?: JumpTarget }
  /** An incident row (spec §10.4). */
  | { kind: 'incident'; week: number; category: string; severity: string; summary: string; tone?: Tone; jump?: JumpTarget }
  /** THE NO-X-RAY masked row: a fog-sensitive entity the player cannot see. Carries NO underlying data —
   * only a neutral "unknown" label + optional count/hint. This is what a hidden rival/cop/unscouted front
   * renders as, instead of leaking its record. */
  | { kind: 'unknown'; label: string; note?: string }
  /** Free text / tooltip-source line. */
  | { kind: 'note'; text: string };

export interface ScreenSection {
  heading?: string;
  rows: ScreenRow[];
}

export interface ScreenView {
  id: string;
  title: string;
  sections: ScreenSection[];
}

// ── tiny pure formatters (kept here so builders read declaratively) ──────────────────────────────
/** Signed money, e.g. $1,240 / −$300. */
export function money(n: number): string {
  const v = Math.round(n);
  return `${v < 0 ? '−$' : '$'}${Math.abs(v).toLocaleString('en-US')}`;
}

/** A recent money delta with an explicit sign, or undefined when there is nothing to show. */
export function deltaStr(n: number | undefined): string | undefined {
  if (n === undefined || n === 0) return undefined;
  return `${n > 0 ? '+$' : '−$'}${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

/** Percent 0..1 -> "42%". */
export function pct(frac: number): string {
  return `${Math.round(frac * 100)}%`;
}

/** The neutral masked row for a hidden fog-sensitive entity (NO-X-RAY). */
export function unknownRow(label = 'Unknown', note?: string): ScreenRow {
  return note === undefined ? { kind: 'unknown', label } : { kind: 'unknown', label, note };
}
