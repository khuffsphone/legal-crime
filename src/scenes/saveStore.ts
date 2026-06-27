// SAVE / LOAD — the browser persistence layer (localStorage named slots + a downloadable/importable file).
// Thin glue over the PURE serialization core (src/sim/saveLoad): this side owns the browser IO (localStorage,
// Blob download, FileReader) and the clock for the savedAt stamp; all the determinism-critical work lives in
// the pure core. localStorage is guarded (typeof !== 'undefined') exactly like the audio-settings persistence,
// so headless/test contexts degrade gracefully instead of throwing.

import { serializeToString, deserializeGame, type LoadResult, type SaveView } from '../sim/saveLoad';
import type { GameState } from '../sim';

const PREFIX = 'lcr_save_';        // named slots → localStorage key = PREFIX + slot
const QUICK_SLOT = 'quick';        // the [F5]/[F9] quick-save slot
export const AUTOSAVE_SLOT = 'auto'; // the rolling autosave slot (cadence + key events)
export const MAX_SLOTS = 6;

export type { SaveView };

export interface SlotInfo {
  slot: string;
  label: string;
  savedAt: number;
  version: number;
}

function ls(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

/** List the saved slots (newest first), reading each save's lightweight header. */
export function listSaveSlots(): SlotInfo[] {
  const store = ls();
  if (!store) return [];
  const out: SlotInfo[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key || !key.startsWith(PREFIX)) continue;
    const raw = store.getItem(key);
    if (!raw) continue;
    try {
      const f = JSON.parse(raw) as { version?: number; label?: string; savedAt?: number };
      out.push({ slot: key.slice(PREFIX.length), label: f.label ?? '', savedAt: f.savedAt ?? 0, version: f.version ?? 0 });
    } catch { /* skip a corrupt slot in the list */ }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

/** Write a named slot. `nowMs` is the caller's clock (keeps the pure core clock-free). `view` carries the fog
 * so visibility restores exactly as saved. Returns ok/why. */
export function writeSaveSlot(slot: string, state: GameState, label: string, nowMs: number, view?: SaveView): { ok: boolean; reason?: string } {
  const store = ls();
  if (!store) return { ok: false, reason: 'no local storage available' };
  try {
    store.setItem(PREFIX + slot, serializeToString(state, { label, savedAt: nowMs }, view));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error && e.name === 'QuotaExceededError' ? 'storage full — delete a save or export to a file' : 'could not write the save' };
  }
}

/** Read + validate a named slot back into a usable state (delegates to the pure deserializer). */
export function readSaveSlot(slot: string): LoadResult {
  const store = ls();
  if (!store) return { ok: false, reason: 'no local storage available' };
  const raw = store.getItem(PREFIX + slot);
  if (!raw) return { ok: false, reason: 'no save in that slot' };
  return deserializeGame(raw);
}

export function deleteSaveSlot(slot: string): void {
  ls()?.removeItem(PREFIX + slot);
}

export function quickSave(state: GameState, nowMs: number, view?: SaveView): { ok: boolean; reason?: string } {
  return writeSaveSlot(QUICK_SLOT, state, 'Quick Save', nowMs, view);
}

export function quickLoad(): LoadResult {
  return readSaveSlot(QUICK_SLOT);
}

// ── AUTOSAVE + CONTINUE ───────────────────────────────────────────────────────────────────────────
/** Write the rolling autosave slot (called on a cadence / key events by the scene). Carries the fog. */
export function autoSave(state: GameState, label: string, nowMs: number, view?: SaveView): { ok: boolean; reason?: string } {
  return writeSaveSlot(AUTOSAVE_SLOT, state, label, nowMs, view);
}

/** Whether ANY save exists (for a "Continue" affordance — e.g. Lane G's title-screen button). */
export function hasAnySave(): boolean {
  return listSaveSlots().length > 0;
}

/**
 * The CONTINUE entry: load the most recent save across all slots (autosave / quick / manual), newest first.
 * The single clean call a title-screen "Continue" can use. Returns a LoadResult (ok:false if there is none).
 */
export function loadContinue(): LoadResult {
  const newest = listSaveSlots()[0]; // listSaveSlots already sorts newest-first
  if (!newest) return { ok: false, reason: 'no save to continue' };
  return readSaveSlot(newest.slot);
}

// ── downloadable / importable save FILE (survives a cache clear) ─────────────────────────────────
/** Trigger a download of the save as a .json file (browser only; no-op without a DOM). */
export function exportSaveFile(state: GameState, label: string, nowMs: number, view?: SaveView): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([serializeToString(state, { label, savedAt: nowMs }, view)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fedora-noir-${(label || 'save').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${nowMs}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Read + validate an imported save File (from an <input type=file>). Resolves a LoadResult. */
export function importSaveFile(file: File): Promise<LoadResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(deserializeGame(String(reader.result ?? '')));
    reader.onerror = () => resolve({ ok: false, reason: 'could not read the file' });
    reader.readAsText(file);
  });
}
