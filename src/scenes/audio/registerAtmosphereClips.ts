// registerAtmosphereClips.ts — AUDIO E-H, Ticket F2: the ONE module allowed to touch the AudioManager.
// Registers the complete F.3 manifest (atmosphereClipManifest — the single source array, R4) through the
// PUBLIC AudioManager.register seam. Every other E-H module emits intents only; none of them import the
// manager, and none reach the private LIBRARY/ClipDef (the seam is additive + skip-on-existing, so the
// shipped federal_notice/watch/raid clips keep their real assets).
//
// R4 fail-loudly: after the manager's ready() has marked what actually loaded, the H3 wire-up calls
// verifyAtmosphereClipsLoaded — a registered E-H key whose .wav asset is missing THROWS in dev (the
// mixer's production queue is behind) and returns the missing list quietly in prod (graceful silence,
// exactly like every other absent clip).

import { AudioManager, type RegisteredClipDef } from '../audio';
import { ATMOSPHERE_CLIP_KEYS, ATMOSPHERE_CLIP_MANIFEST } from './atmosphereClipManifest';
import { BUS_TO_AUDIO_BUS } from './atmosphereIntents';

/** The manifest projected onto the manager's registration shape (R3: conceptual bus → real bus). The
 * urgent flag carries through so alarm-class cues (police trio, federal family) ride the manager's
 * urgent governor exactly like their shipped federal siblings — never the soft-sfx cap. Pure. */
export function atmosphereClipDefs(): RegisteredClipDef[] {
  return ATMOSPHERE_CLIP_MANIFEST.map((c) => ({
    key: c.key,
    file: c.file,
    bus: BUS_TO_AUDIO_BUS[c.bus],
    loop: c.loop,
    vol: c.vol,
    ...(c.urgent ? { urgent: true } : {}),
  }));
}

export interface AtmosphereRegistration {
  /** keys newly added to the catalog this call. */
  added: string[];
  /** keys already in the catalog (the shipped federal parity entries, or a repeat call). */
  skipped: string[];
}

/** Register the full E-H manifest. Idempotent: a second call skips everything. Call BEFORE the scene's
 * AudioManager.preload so the files queue with the rest of the library. */
export function registerAtmosphereClips(): AtmosphereRegistration {
  return AudioManager.register(atmosphereClipDefs());
}

/** Every E-H key is in the registration catalog (added now or shipped already) — the F.4 parity check,
 * callable from tests without a Phaser scene. */
export function atmosphereManifestParity(): { ok: boolean; unregistered: string[] } {
  const unregistered = ATMOSPHERE_CLIP_KEYS.filter((k) => !AudioManager.isRegistered(k));
  return { ok: unregistered.length === 0, unregistered };
}

/**
 * R4 — a REGISTERED key with a MISSING asset fails loudly in dev. `hasLoaded` is the manager's has()
 * (injected so this is testable Phaser-free); `isDev` defaults to Vite's dev flag. Returns the missing
 * keys; throws in dev when any are missing.
 */
export function verifyAtmosphereClipsLoaded(
  hasLoaded: (key: string) => boolean,
  isDev: boolean = typeof import.meta !== 'undefined' && !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV,
): string[] {
  const missing = ATMOSPHERE_CLIP_KEYS.filter((k) => !hasLoaded(k));
  if (missing.length > 0 && isDev) {
    throw new Error(
      `AUDIO E-H: ${missing.length} registered clip(s) have no loaded asset — the mixer production queue is behind. Missing: ${missing.join(', ')}`,
    );
  }
  return missing;
}
