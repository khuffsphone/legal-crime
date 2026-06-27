import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSettings,
  saveSettings,
  updateSettings,
  sanitizeSettings,
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
} from '../src/scenes/settings';

// A minimal in-memory localStorage so the persistence path runs in the node/vitest context.
class MemStore {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStore }).localStorage = new MemStore();
});

describe('settings — defaults & sanitisation', () => {
  it('loads defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps volumes to 0..1 and falls back on garbage', () => {
    const s = sanitizeSettings({ master: 5, sfx: -2, music: 'loud' });
    expect(s.master).toBe(1);
    expect(s.sfx).toBe(0);
    expect(s.music).toBe(DEFAULT_SETTINGS.music); // non-number → default
  });

  it('validates the toggles', () => {
    expect(sanitizeSettings({ screenShake: 'yes' }).screenShake).toBe(DEFAULT_SETTINGS.screenShake);
    expect(sanitizeSettings({ screenShake: false }).screenShake).toBe(false);
    expect(sanitizeSettings({ lighting: 'ultra' }).lighting).toBe(DEFAULT_SETTINGS.lighting);
    expect(sanitizeSettings({ lighting: 'low' }).lighting).toBe('low');
  });

  it('drops illegal keybind remaps but keeps legal ones', () => {
    const s = sanitizeSettings({ keybinds: { extort: 'F', collect: ';', bogus: 'Q' } });
    expect(s.keybinds.extort).toBe('F'); // sanitize only normalises the token; legality is resolveKeybinds' job
    expect(s.keybinds.collect).toBe('SEMICOLON');
    // an unknown action key is not in KEY_ACTIONS → never copied
    expect((s.keybinds as Record<string, string>).bogus).toBeUndefined();
  });
});

describe('settings — round-trip persistence (the spec requirement)', () => {
  it('save → load returns an equal value', () => {
    const custom = { ...DEFAULT_SETTINGS, master: 0.3, sfx: 0.5, music: 0, screenShake: false, lighting: 'low' as const, keybinds: { skipWeek: 'SEMICOLON' } };
    saveSettings(custom);
    expect(localStorage.getItem(SETTINGS_KEY)).toBeTruthy(); // it really wrote the canonical key
    const back = loadSettings();
    expect(back).toEqual(custom);
  });

  it('updateSettings patches, persists, and reapplies on the next load', () => {
    const a = updateSettings(loadSettings(), { master: 0.42 });
    expect(a.master).toBe(0.42);
    expect(loadSettings().master).toBe(0.42); // reapplied from storage
    const b = updateSettings(a, { screenShake: false });
    expect(b.master).toBe(0.42); // earlier patch preserved
    expect(b.screenShake).toBe(false);
    expect(loadSettings()).toEqual(b);
  });

  it('a corrupt blob loads as defaults, never throws', () => {
    localStorage.setItem(SETTINGS_KEY, '{ not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('degrades gracefully with no localStorage at all', () => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
