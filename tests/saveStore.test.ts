// SAVE / LOAD — the browser-IO layer's NEW bits (Lane F): the rolling AUTOSAVE slot and the CONTINUE entry
// (loadContinue / hasAnySave) Lane G's title screen will call. Driven through a Map-backed localStorage stub so
// the scene-side glue is exercised headlessly; the determinism-critical work stays in the pure core.
import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { createFog, revealAround, isRevealed } from '../src/sim/fog';
import { spawnEnforcer } from '../src/sim/movement';
import {
  autoSave, quickSave, quickLoad, loadContinue, hasAnySave,
  hasResumableSave, listResumableSlots, writeSaveSlot, readSaveSlot, deleteSaveSlot, listSaveSlots,
} from '../src/scenes/saveStore';

function mockLocalStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  } as Storage;
}

describe('saveStore — autosave + continue', () => {
  beforeEach(() => { (globalThis as { localStorage?: Storage }).localStorage = mockLocalStorage(); });

  it('hasAnySave is false until something is written; loadContinue then fails cleanly', () => {
    expect(hasAnySave()).toBe(false);
    expect(loadContinue().ok).toBe(false);
  });

  it('autoSave writes a slot, and loadContinue returns the NEWEST save with its fog', () => {
    const s = createInitialState(1);
    quickSave(s, 100);                                     // older
    autoSave(s, 'Autosave · Week 3', 200, { fog: ['1,1'] }); // newer (higher savedAt)
    expect(hasAnySave()).toBe(true);
    const r = loadContinue();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.file.label).toBe('Autosave · Week 3'); // newest-first across all slots
      expect(r.file.view?.fog).toEqual(['1,1']);       // the fog survives the scene-IO layer
      expect(r.state.tick).toBe(s.tick);               // a real, usable state
    }
  });
});

// ── B1 — CONTINUE never resumes a FINISHED game ──────────────────────────────────────────────────
describe('saveStore — B1: CONTINUE skips terminal win/lose end-states', () => {
  beforeEach(() => { (globalThis as { localStorage?: Storage }).localStorage = mockLocalStorage(); });

  it('a TERMINAL autosave is NOT offered as CONTINUE; the in-progress save is', () => {
    const inProgress = createInitialState(1); // status: 'playing'
    const won = createInitialState(1); won.status = 'won';
    quickSave(inProgress, 100);                       // older, in-progress
    autoSave(won, 'MR. MAYOR', 200);                  // newer, but a finished game
    // CONTINUE must skip the (newer) terminal save and resume the in-progress one.
    expect(hasResumableSave()).toBe(true);
    const r = loadContinue();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.status).not.toBe('won');
    // the terminal save still EXISTS in the list (loadable on purpose), just not via CONTINUE.
    expect(listSaveSlots().length).toBe(2);
    expect(listResumableSlots().length).toBe(1);
  });

  it('with ONLY a finished game saved, CONTINUE is unavailable (button greys)', () => {
    const lost = createInitialState(1); lost.status = 'lost';
    autoSave(lost, 'wiped out', 100);
    expect(hasAnySave()).toBe(true);          // a save exists…
    expect(hasResumableSave()).toBe(false);   // …but none resumable → CONTINUE greyed
    expect(loadContinue().ok).toBe(false);
  });
});

// ── B3 — QUICK SAVE / QUICK LOAD round-trip (state + fog) ─────────────────────────────────────────
describe('saveStore — B3: quick-save then quick-load reproduces the run incl. fog', () => {
  beforeEach(() => { (globalThis as { localStorage?: Storage }).localStorage = mockLocalStorage(); });

  it('quick-load restores the saved state and the exact fog', () => {
    const s = createInitialState(5, { bigCity: true });
    s.player.cash = 4242; s.tick = 9;
    const fog = createFog(); revealAround(fog, 5, 5, 3, 96, 96);
    expect(quickSave(s, 1, { fog: [...fog] }).ok).toBe(true);
    const r = quickLoad();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.player.cash).toBe(4242);
      expect(r.state.tick).toBe(9);
      expect(new Set(r.file.view?.fog ?? [])).toEqual(fog); // fog preserved byte-for-byte
    }
  });
});

// ── B4 — load a LISTED slot restores it; DEL removes it; fog preserved (NO-X-RAY) ─────────────────
describe('saveStore — B4: per-row LOAD restores the chosen slot; DEL removes it; fog stays', () => {
  beforeEach(() => { (globalThis as { localStorage?: Storage }).localStorage = mockLocalStorage(); });

  it('loading a named slot restores that slot, with a hidden rival STILL hidden', () => {
    const s = createInitialState(1, { bigCity: true });
    const rivalTile = { gx: 80, gy: 80 };
    s.units = [spawnEnforcer('r', rivalTile.gx, rivalTile.gy, s.rivals[0].id)];
    const fog = createFog(); revealAround(fog, 5, 5, 4, 96, 96); // player corner only — rival hidden
    expect(isRevealed(fog, rivalTile.gx, rivalTile.gy)).toBe(false);
    writeSaveSlot('s1', s, 'Week 1', 10, { fog: [...fog] });

    const r = readSaveSlot('s1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const restoredFog = new Set(r.file.view?.fog ?? []);
      expect(isRevealed(restoredFog, rivalTile.gx, rivalTile.gy)).toBe(false); // NO-X-RAY held on load
      expect(JSON.stringify(r.file.view)).not.toContain('80,80');
    }
  });

  it('DEL removes the row and its underlying save', () => {
    writeSaveSlot('s1', createInitialState(1), 'A', 10);
    writeSaveSlot('s2', createInitialState(1), 'B', 20);
    expect(listSaveSlots().map((s) => s.slot).sort()).toEqual(['s1', 's2']);
    deleteSaveSlot('s1');
    expect(listSaveSlots().map((s) => s.slot)).toEqual(['s2']);
    expect(readSaveSlot('s1').ok).toBe(false); // underlying save gone
  });
});
