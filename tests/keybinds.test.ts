import { describe, it, expect } from 'vitest';
import {
  KEY_ACTIONS,
  DEFAULT_KEYBINDS,
  RESERVED_KEYS,
  normalizeKey,
  keyLabel,
  resolveKeybinds,
  applyRemap,
  resetKeybind,
  keybindConflicts,
  remapOverlay,
  type KeyAction,
} from '../src/scenes/keybinds';

describe('keybinds — the defaults are internally consistent', () => {
  it('every action has a default and the defaults are collision-free', () => {
    for (const a of KEY_ACTIONS) expect(DEFAULT_KEYBINDS[a]).toBeTruthy();
    expect(keybindConflicts(DEFAULT_KEYBINDS)).toEqual([]);
  });

  it('no default key is in the reserved set (the map owns those keys, not the engine)', () => {
    for (const a of KEY_ACTIONS) expect(RESERVED_KEYS).not.toContain(DEFAULT_KEYBINDS[a]);
  });

  it('reserves the engine-bound keys a remap must never steal (camera arrows + bare modifiers)', () => {
    // arrows pan the camera every frame; bare modifiers collide with Shift+Tab / marquee-add or go dead.
    for (const k of ['UP', 'DOWN', 'LEFT', 'RIGHT', 'SHIFT', 'CTRL', 'META', 'ALT', 'SPACE', 'TAB']) {
      expect(RESERVED_KEYS).toContain(k);
    }
  });

  it('refuses a remap onto an arrow key or a bare modifier (the conflict guarantee holds for them too)', () => {
    expect(applyRemap(DEFAULT_KEYBINDS, 'centerSelection', 'ArrowLeft').ok).toBe(false);
    expect(applyRemap(DEFAULT_KEYBINDS, 'extort', 'Shift').ok).toBe(false);
    expect(applyRemap(DEFAULT_KEYBINDS, 'extort', 'Control').ok).toBe(false);
    // and a hand-edited localStorage overlay onto an arrow is dropped on resolve
    expect(resolveKeybinds({ frameCity: 'LEFT' }).frameCity).toBe('Z');
  });
});

describe('normalizeKey — raw KeyboardEvent.key → Phaser token', () => {
  it('maps letters, digits, period and named keys', () => {
    expect(normalizeKey('e')).toBe('E');
    expect(normalizeKey('E')).toBe('E');
    expect(normalizeKey('.')).toBe('PERIOD');
    expect(normalizeKey('1')).toBe('ONE');
    expect(normalizeKey(' ')).toBe('SPACE');
    expect(normalizeKey('Escape')).toBe('ESC');
    expect(normalizeKey('Tab')).toBe('TAB');
    expect(normalizeKey('ArrowUp')).toBe('UP');
    expect(normalizeKey('PERIOD')).toBe('PERIOD'); // already-canonical token round-trips
  });
  it('rejects the unbindable', () => {
    expect(normalizeKey('')).toBe('');
    expect(normalizeKey('   ')).toBe('');
  });
  it('keyLabel renders a short human glyph', () => {
    expect(keyLabel('PERIOD')).toBe('.');
    expect(keyLabel('E')).toBe('E');
    expect(keyLabel('SPACE')).toBe('Space');
  });
});

describe('resolveKeybinds — defaults overlaid with VALID remaps only', () => {
  it('no overlay returns the defaults', () => {
    expect(resolveKeybinds()).toEqual(DEFAULT_KEYBINDS);
    expect(resolveKeybinds(null)).toEqual(DEFAULT_KEYBINDS);
  });

  it('drops a remap onto a reserved key, keeping the default', () => {
    // O is reserved (audio panel); resolve must DROP it, keeping extort on its default E
    expect(resolveKeybinds({ extort: 'O' }).extort).toBe(DEFAULT_KEYBINDS.extort);
  });

  it('drops a remap onto a reserved key, and a remap that would duplicate another action', () => {
    expect(resolveKeybinds({ extort: 'F' }).extort).toBe('E'); // F = finance panel (reserved) → dropped
    expect(resolveKeybinds({ extort: 'C' }).extort).toBe('E'); // C already = collect → dropped
    // the resolved map is ALWAYS conflict-free, even from a hostile blob
    expect(keybindConflicts(resolveKeybinds({ extort: 'C', collect: 'E' }))).toEqual([]);
  });

  it('accepts a genuinely free remap target (a punctuation key not otherwise bound)', () => {
    const map = resolveKeybinds({ frameCity: '/' });
    expect(map.frameCity).toBe('FORWARD_SLASH');
    expect(keybindConflicts(map)).toEqual([]);
  });
});

describe('applyRemap — refuses on conflict so no new collision is ever introduced', () => {
  const base = { ...DEFAULT_KEYBINDS };

  it('accepts a free key and returns a new map', () => {
    const r = applyRemap(base, 'extort', ';');
    expect(r.ok).toBe(true);
    expect(r.map.extort).toBe('SEMICOLON');
    expect(base.extort).toBe('E'); // original untouched (pure)
  });

  it('refuses a reserved key with a reason', () => {
    const r = applyRemap(base, 'extort', 'F');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/reserved/i);
    expect(r.map).toBe(base); // unchanged
  });

  it('refuses a key already bound to another remappable action', () => {
    const r = applyRemap(base, 'extort', 'C');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/already bound/i);
  });

  it('lets an action keep / re-pick its own key (not a self-conflict)', () => {
    const r = applyRemap(base, 'extort', 'E');
    expect(r.ok).toBe(true);
    expect(r.map.extort).toBe('E');
  });

  it('no sequence of accepted remaps can ever produce a conflict', () => {
    let map = { ...DEFAULT_KEYBINDS };
    const moves: Array<[KeyAction, string]> = [
      ['extort', ';'], ['collect', '/'], ['reinvest', "'"], ['frameCity', 'G'], // last is illegal (G = grease)
    ];
    for (const [a, k] of moves) {
      const r = applyRemap(map, a, k);
      if (r.ok) map = r.map;
    }
    expect(keybindConflicts(map)).toEqual([]);
    expect(map.frameCity).toBe('Z'); // the illegal move (G is held by grease) was refused
  });
});

describe('resetKeybind & remapOverlay', () => {
  it('reset restores the factory key', () => {
    const r = applyRemap(DEFAULT_KEYBINDS, 'extort', ';');
    expect(resetKeybind(r.map, 'extort').extort).toBe('E');
  });
  it('remapOverlay persists only the diffs from default', () => {
    const r = applyRemap(DEFAULT_KEYBINDS, 'extort', ';');
    expect(remapOverlay(r.map)).toEqual({ extort: 'SEMICOLON' });
    expect(remapOverlay(DEFAULT_KEYBINDS)).toEqual({});
  });
  it('overlay round-trips back through resolveKeybinds', () => {
    const r = applyRemap(DEFAULT_KEYBINDS, 'skipWeek', ';');
    const overlay = remapOverlay(r.map);
    expect(resolveKeybinds(overlay)).toEqual(r.map);
  });
});
