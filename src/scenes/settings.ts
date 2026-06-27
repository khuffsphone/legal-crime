// Lane G — the persisted SETTINGS store. The single owner of localStorage key `fedora-noir:settings`:
// audio volumes (master / sfx / music, 0..1), the screen-shake toggle, the lighting-quality toggle, and
// the keybind-remap overlay. Pure browser-glue (no Phaser): localStorage is guarded exactly like the
// audio-settings and save-store persistence, so headless/test contexts degrade gracefully. Loaded on boot
// and applied by the scenes (volumes → audio public setters, shake/lighting → render flags, keybinds →
// the central keybind map). The schema is SANITISED on every read/write so a hand-edited or stale blob can
// never crash the game or smuggle in an out-of-range value / an illegal keybind.

import { KEY_ACTIONS, normalizeKey, type KeyAction } from './keybinds';

export const SETTINGS_KEY = 'fedora-noir:settings';

export type LightingQuality = 'low' | 'high';

export interface Settings {
  /** Master / SFX / music output levels, 0..1. Routed through audio.ts's public bus setters. */
  master: number;
  sfx: number;
  music: number;
  /** Screen-shake amplitude on/off. CANON: this scales camera-shake AMPLITUDE only — it never makes the
   * motion-only danger reds static. */
  screenShake: boolean;
  /** Lighting quality — 'low' drops the secondary wet-asphalt sheen layer (pure set-dressing). */
  lighting: LightingQuality;
  /** Keybind remap overlay: action → key token, ONLY for entries that differ from the factory default. */
  keybinds: Partial<Record<KeyAction, string>>;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  sfx: 1,
  music: 0.8,
  screenShake: true,
  lighting: 'high',
  keybinds: {},
};

function clamp01(n: unknown, fallback: number): number {
  return typeof n === 'number' && isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

/** Coerce an arbitrary parsed blob into a valid Settings (every field validated/clamped, bad keybinds
 * dropped). Pure — the one chokepoint both load and save run through, so the stored value is always sane. */
export function sanitizeSettings(p: unknown): Settings {
  const o = (p && typeof p === 'object' ? p : {}) as Partial<Settings>;
  const keybinds: Partial<Record<KeyAction, string>> = {};
  const rawKb = o.keybinds;
  if (rawKb && typeof rawKb === 'object') {
    for (const action of KEY_ACTIONS) {
      const v = (rawKb as Record<string, unknown>)[action];
      if (typeof v === 'string') {
        const k = normalizeKey(v);
        if (k) keybinds[action] = k;
      }
    }
  }
  return {
    master: clamp01(o.master, DEFAULT_SETTINGS.master),
    sfx: clamp01(o.sfx, DEFAULT_SETTINGS.sfx),
    music: clamp01(o.music, DEFAULT_SETTINGS.music),
    screenShake: typeof o.screenShake === 'boolean' ? o.screenShake : DEFAULT_SETTINGS.screenShake,
    lighting: o.lighting === 'low' || o.lighting === 'high' ? o.lighting : DEFAULT_SETTINGS.lighting,
    keybinds,
  };
}

/** Read settings from localStorage, merged over the defaults and fully sanitised. Never throws — a missing,
 * empty, or corrupt blob yields the defaults. */
export function loadSettings(): Settings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_KEY) : null;
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persist settings (sanitised first). Guarded — a no-op without localStorage; swallows quota errors. */
export function saveSettings(s: Settings): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(s)));
  } catch {
    /* ignore — out of quota / blocked storage */
  }
}

/** Convenience: patch a subset and persist, returning the new full Settings. Pure-ish (writes storage). */
export function updateSettings(current: Settings, patch: Partial<Settings>): Settings {
  const next = sanitizeSettings({ ...current, ...patch, keybinds: patch.keybinds ?? current.keybinds });
  saveSettings(next);
  return next;
}
