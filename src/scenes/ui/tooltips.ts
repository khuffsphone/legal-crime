// Lane — CONTEXTUAL HUD TOOLTIPS. A small, reusable CONTENT MAP of concise plain-language explanations for
// HUD elements, plus a tiny pure helper to build region entries.
//
// ⚠️ ONE RENDERER. IsoScene ALREADY owns a single HUD tooltip renderer on the fixed UI camera: a `hudRegions`
// registry (screen-space rects + an `explain` string) read by `hudRegionExplain`, with `updateTooltip`
// painting the shared `tooltipBg`/`tooltipText` (depth 100050/1) from the `pointermove` handler. Rather than
// stand up a SECOND tooltip renderer (which would fight the first), this module feeds that existing one: the
// scene additively pushes `tipRegion(...)` entries onto `hudRegions` for the elements it doesn't already
// explain. Pure data + pure helpers — no Phaser import, so it stays trivially testable.

/** A screen-space hover zone + its explanation — shape-compatible with IsoScene's `hudRegions` entries. */
export interface HudTipRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  explain: string;
}

/**
 * Concise, plain-language explanations keyed by HUD element. Kept short so the tooltip stays a glance, not a
 * wall of text. The `dossier.*` keys mirror the bottom-strip drawer ids (PanelId: wire/turf/paths/crew/finance).
 */
export const HUD_TIPS: Record<string, string> = {
  // THE CONSIGLIERE advisor toast (top-left, under THE WIRE).
  consigliere:
    'THE CONSIGLIERE — your advisor reads THE WIRE and your own books, then names the single most useful next move. Colour = urgency: red critical · amber warning · brass opportunity · bone tip.',
  // THE WIRE inline log header (only shown in the expanded/legacy HUD).
  wire:
    'THE WIRE — a running feed of what just happened: a block flips, a collector is robbed, federal heat crosses a rung. Newest first; click a located slip to jump the camera there. [L] opens the full log.',
  // The bottom dossier-strip chips — one per drawer toggle.
  'dossier.wire': 'THE WIRE — the full event log of what just happened in the city. [L] opens/closes it; the number is unread slips.',
  'dossier.turf': 'TURF — districts you hold vs the city total, and how many are being contested right now. [T] opens it.',
  'dossier.paths': 'COLLECTIONS ARE AUTOMATIC. WAIT is cash at fronts; ROAD is cash being carried. [C] only rushes waiting cash home early. [V] opens the full readout.',
  'dossier.crew': 'CREW — your muscle on the street and how many are idle and ready for orders. [K] opens it.',
  'dossier.finance': 'FINANCE — the ledger: clean vs dirty cash, exposure, and laundering. [F] opens it.',
};

/** The explanation for a key, or undefined if there is none. */
export function hudTip(key: string): string | undefined {
  return HUD_TIPS[key];
}

/**
 * Build a tooltip region for the scene's `hudRegions` registry (the one shared renderer). Returns null when
 * the key has no content, so the scene can register additively in a loop without guarding each call.
 */
export function tipRegion(x: number, y: number, w: number, h: number, key: string): HudTipRegion | null {
  const explain = HUD_TIPS[key];
  return explain ? { x, y, w, h, explain } : null;
}
