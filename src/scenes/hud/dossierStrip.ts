// HUD PHASE 1 — the DOSSIER STRIP chip model (pure; Phaser-free, testable). The ~28px bottom strip that
// REPLACES the permanent side-panel stack: one summary chip per drawer, each with its keycap. The scene
// reads live sim/HUD state into DossierData; this turns it into the labelled chips; the scene draws them on
// the fixed-HUD camera and routes a chip click to its panel. No pixels here — just the at-a-glance lines.

import { PANELS, type PanelId } from './panelState';

export interface DossierData {
  /** Unread Wire slips (drives the [L] chip's count). */
  wireUnread: number;
  /** Districts you HOLD / total, and how many are being CONTESTED right now. */
  turfHeld: number;
  turfTotal: number;
  turfContested: number;
  /** Collection-route dominance: districts you run a path through / total. */
  pathsDom: number;
  pathsTotal: number;
  /** Free (idle) muscle — thugs with no current order. */
  crewIdle: number;
  /** Dirty-cash share of the hoard, as a whole-number percent (the launder pressure). */
  ledgerDirtyPct: number;
}

export interface DossierChip {
  id: PanelId;
  key: string;
  label: string;
}

/** Build the five strip chips (in PANELS order) from the live summary. Pure — same data ⇒ same chips. */
export function buildDossierChips(d: DossierData): DossierChip[] {
  const label: Record<PanelId, string> = {
    wire: `Wire · ${d.wireUnread} unread`,
    turf: `Turf ${d.turfHeld}/${d.turfTotal} · ${d.turfContested} contested`,
    paths: `Paths · Dom ${d.pathsDom}/${d.pathsTotal}`,
    crew: `Crew · ${d.crewIdle} idle`,
    finance: `Ledger · dirty ${d.ledgerDirtyPct}%`,
  };
  return PANELS.map((p) => ({ id: p.id, key: p.key, label: label[p.id] }));
}

/** A whole-number dirty-cash percent of the hoard (0 when broke). Pure helper for DossierData. */
export function dirtyPercent(cleanCash: number, dirtyCash: number): number {
  const total = Math.max(0, cleanCash) + Math.max(0, dirtyCash);
  if (total <= 0) return 0;
  return Math.round((Math.max(0, dirtyCash) / total) * 100);
}
