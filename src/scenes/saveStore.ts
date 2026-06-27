// SAVE / LOAD — the browser persistence layer (localStorage named slots + a downloadable/importable file).
// Thin glue over the PURE serialization core (src/sim/saveLoad): this side owns the browser IO (localStorage,
// Blob download, FileReader) and the clock for the savedAt stamp; all the determinism-critical work lives in
// the pure core. localStorage is guarded (typeof !== 'undefined') exactly like the audio-settings persistence,
// so headless/test contexts degrade gracefully instead of throwing.

import { serializeToString, deserializeGame, type LoadResult } from '../sim/saveLoad';
import type { GameState } from '../sim';

const PREFIX = 'lcr_save_';        // named slots → localStorage key = PREFIX + slot
const QUICK_SLOT = 'quick';        // the [F5]/[F9] quick-save slot
export const MAX_SLOTS = 6;

/** The Phaser registry key the load HANDOFF uses: a scene sets the deserialized GameState here, then starts
 * IsoScene, whose create() adopts it. Shared so the menu's "Continue" and the in-game loader agree. */
export const LOADED_STATE_KEY = 'lcr_loaded_state';

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

/** Write a named slot. `nowMs` is the caller's clock (keeps the pure core clock-free). Returns ok/why. */
export function writeSaveSlot(slot: string, state: GameState, label: string, nowMs: number): { ok: boolean; reason?: string } {
  const store = ls();
  if (!store) return { ok: false, reason: 'no local storage available' };
  try {
    store.setItem(PREFIX + slot, serializeToString(state, { label, savedAt: nowMs }));
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

export function quickSave(state: GameState, nowMs: number): { ok: boolean; reason?: string } {
  return writeSaveSlot(QUICK_SLOT, state, 'Quick Save', nowMs);
}

export function quickLoad(): LoadResult {
  return readSaveSlot(QUICK_SLOT);
}

// ── downloadable / importable save FILE (survives a cache clear) ─────────────────────────────────
/** Trigger a download of the save as a .json file (browser only; no-op without a DOM). */
export function exportSaveFile(state: GameState, label: string, nowMs: number): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([serializeToString(state, { label, savedAt: nowMs })], { type: 'application/json' });
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
