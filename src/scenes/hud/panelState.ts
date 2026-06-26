// HUD PHASE 1 — the PANEL STATE MACHINE (pure; Phaser-free, testable). One drawer open at a time. The
// Phaser PanelManager owns the sound/graphics; this owns the DECISION (which panel is open) so the
// open/close/replace rules are unit-tested without pixels. The fixed-HUD camera is sacred — nothing here
// resizes the world; panels only OVERLAY.

export type PanelId = 'wire' | 'turf' | 'paths' | 'crew' | 'finance';

export interface PanelDef {
  id: PanelId;
  /** The single hotkey that toggles this panel (also the keycap shown on its dossier chip). */
  key: string;
  title: string;
}

/** The five Phase-1 drawers, in dossier-strip order. Content is scaffolded now; filled in later phases. */
export const PANELS: readonly PanelDef[] = [
  { id: 'wire',    key: 'L', title: 'THE WIRE' },
  { id: 'turf',    key: 'T', title: 'TURF' },
  { id: 'paths',   key: 'V', title: 'PATHS' },
  { id: 'crew',    key: 'K', title: 'CREW' },
  { id: 'finance', key: 'F', title: 'FINANCE' },
];

export interface PanelState {
  /** The single open drawer, or null when the HUD is collapsed to just the city + strip. */
  open: PanelId | null;
}

export function initPanels(): PanelState {
  return { open: null };
}

/** Toggle a panel: opening it if closed/different, closing it if it's already the open one (same key/ESC). */
export function togglePanel(s: PanelState, id: PanelId): PanelState {
  return { open: s.open === id ? null : id };
}

/** Open a panel — REPLACES whatever was open (one drawer at a time). */
export function openPanel(_s: PanelState, id: PanelId): PanelState {
  return { open: id };
}

/** Close the open drawer (ESC / its own key / a second chip click). */
export function closePanel(_s: PanelState): PanelState {
  return { open: null };
}

export function isPanelOpen(s: PanelState, id: PanelId): boolean {
  return s.open === id;
}

export function anyPanelOpen(s: PanelState): boolean {
  return s.open !== null;
}

/** The panel a hotkey toggles, or null if the key isn't a panel key. Case-insensitive. */
export function panelForKey(key: string): PanelId | null {
  const up = key.toUpperCase();
  return PANELS.find((p) => p.key === up)?.id ?? null;
}

export function panelDef(id: PanelId): PanelDef {
  return PANELS.find((p) => p.id === id)!;
}
