// SAVE / LOAD — the pure serialization core (Phaser-free, browser-free, unit-tested). The sim is a pure,
// deterministic data tree fully reproducible from (seed, rngState cursor, state tree) — there are NO Sets,
// Maps, functions, or class instances anywhere in GameState — so a save is a faithful JSON clone of the
// COMPLETE state (rngState INCLUDED, so a load is bit-identical and the next tick is deterministic). This is
// a serialize/deserialize of the existing state, NOT a re-architecture: tick()/applyCommand() are untouched.
//
// VERSION-STAMPED: every save carries a schema version; a load refuses a version it can't read (rather than
// silently corrupting old saves). A migration hook is left for future schema bumps.

import type { GameState } from './types';

/** Bump when the GameState shape changes in a way old saves can't satisfy. v1 = the first real save format. */
export const SAVE_SCHEMA_VERSION = 1;

export interface SaveFile {
  /** The schema version this save was written with. */
  version: number;
  /** Epoch ms the save was taken — METADATA only (the caller supplies it; the pure core never reads a clock,
   * so it stays deterministic). 0 if unknown. */
  savedAt: number;
  /** A human label for the slot/menu. */
  label: string;
  /** The COMPLETE deterministic game state (rngState included). */
  state: GameState;
}

/** A faithful deep clone of the pure GameState. JSON round-trip is exact here because the state tree is pure
 * data (no Sets/Maps/functions); optional/absent fields stay absent (=== undefined), so semantics are kept. */
export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

/** Build a version-stamped SaveFile from a live state. `meta.savedAt` is caller-supplied (keeps this pure). */
export function serializeGame(state: GameState, meta?: { label?: string; savedAt?: number }): SaveFile {
  return {
    version: SAVE_SCHEMA_VERSION,
    savedAt: meta?.savedAt ?? 0,
    label: meta?.label ?? '',
    state: cloneState(state),
  };
}

/** The on-disk/localStorage string form of a save. */
export function serializeToString(state: GameState, meta?: { label?: string; savedAt?: number }): string {
  return JSON.stringify(serializeGame(state, meta));
}

export type LoadResult =
  | { ok: true; state: GameState; file: SaveFile }
  | { ok: false; reason: string };

/**
 * Parse + validate a save (a JSON string or an already-parsed SaveFile) back into a usable GameState. Refuses
 * corrupt data and a schema version it can't read (no silent corruption). Returns a CLONED state so the
 * caller owns a fresh tree. Pure.
 */
export function deserializeGame(input: string | SaveFile): LoadResult {
  let file: SaveFile;
  if (typeof input === 'string') {
    try { file = JSON.parse(input) as SaveFile; }
    catch { return { ok: false, reason: 'corrupt save — not valid JSON' }; }
  } else {
    file = input;
  }
  if (!file || typeof file !== 'object') return { ok: false, reason: 'corrupt save — empty or malformed' };
  if (typeof file.version !== 'number') return { ok: false, reason: 'corrupt save — missing schema version' };
  if (file.version !== SAVE_SCHEMA_VERSION) {
    const migrated = migrateSave(file);
    if (!migrated) return { ok: false, reason: `incompatible save — version ${file.version}, this build reads ${SAVE_SCHEMA_VERSION}` };
    file = migrated;
  }
  const state = file.state as GameState | undefined;
  if (!state || typeof state.rngState !== 'number' || typeof state.tick !== 'number' || !Array.isArray(state.districts)) {
    return { ok: false, reason: 'corrupt save — not a game state' };
  }
  return { ok: true, state: cloneState(state), file };
}

/**
 * Migration hook for older schema versions. v1 is the first format, so there is nothing to migrate FROM yet —
 * returns null (incompatible) for any non-current version. A future bump adds case(s) here so old saves keep
 * loading instead of silently corrupting. Pure.
 */
export function migrateSave(file: SaveFile): SaveFile | null {
  // (no prior versions to upgrade to v1)
  return file.version === SAVE_SCHEMA_VERSION ? file : null;
}
