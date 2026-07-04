// Citizen Life P0 — PURE query-flag parsing. Phaser-free; the Phaser side passes window.location.search in.
// The citizen layer is OFF by default (spec §11.2/§11.5): with ?citizens absent, AmbientLife behaves exactly
// as today (byte-identical ambient). Mirrors the scene's inline ?life/?reveal/?market parse convention so
// ?citizens=1 reads as a peer inspection flag (devDebug §60 — inspection flags are NOT dev-gate keys).

/** Values that count as "on" for a boolean flag (matching the scene's mix of `=1` and `=on`). */
function isOn(v: string | null): boolean {
  return v === '1' || v === 'on' || v === 'true';
}

function param(search: string, key: string): string | null {
  if (!search) return null;
  try { return new URLSearchParams(search).get(key); } catch { return null; }
}

/** Whether the citizen ambient upgrade is enabled: ?citizens=1 (default OFF, spec §11.2). Pure. */
export function parseCitizensEnabled(search: string): boolean {
  return isOn(param(search, 'citizens'));
}

/**
 * Whether the DEBUG occupation-letter overlay renders (Rider R4 / spec §11.3): requires ?citizens=1 AND the
 * explicitly-named debug subflag ?citizenletters=1. Letters are debug-only, never production UI — so both
 * gates must be present. Pure.
 */
export function parseCitizenLetters(search: string): boolean {
  return parseCitizensEnabled(search) && isOn(param(search, 'citizenletters'));
}
