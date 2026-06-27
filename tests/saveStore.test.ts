// SAVE / LOAD — the browser-IO layer's NEW bits (Lane F): the rolling AUTOSAVE slot and the CONTINUE entry
// (loadContinue / hasAnySave) Lane G's title screen will call. Driven through a Map-backed localStorage stub so
// the scene-side glue is exercised headlessly; the determinism-critical work stays in the pure core.
import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { autoSave, quickSave, loadContinue, hasAnySave } from '../src/scenes/saveStore';

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
