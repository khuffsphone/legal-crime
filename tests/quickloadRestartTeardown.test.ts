// QUICKLOAD RESTART TEARDOWN — the F9 crash regression net. scene.restart() destroys every display
// object but does NOT re-run the constructor, so IsoScene instance fields that cache GameObject handles
// survive holding corpses; the first post-load update() then re-drove a destroyed handle (crash traces:
// sprite.anims.getName() via updateUnits with ?sprites on; Text.setText on a null frame via refreshHud's
// topCells with ?sprites off). The fix is resetRestartCaches(), called FIRST in create().
//
// The Phaser restart redraw itself can't run under the node test environment, so this net has three
// layers, mirroring the repo's established teeth idiom (the #63 source-scan gates):
//   1. the REAL localStorage-shape save driven through quickLoad() — the byte-identical entry F9 uses;
//   2. the corpse failure mode pinned on the real animator (a destroyed sprite's .anims is undefined);
//   3. source-scan mutation teeth: create() must call resetRestartCaches() before any builder, the reset
//      list must cover every crash-confirmed cache, and — forward-looking — EVERY lazily-created
//      (get-or-create) display singleton in the scene must appear in the reset list, so the next
//      "if (!this.x) this.x = this.add..." added to IsoScene fails CI until it joins the teardown.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/sim/state';
import { quickSave, quickLoad } from '../src/scenes/saveStore';
import { playUnitAnim } from '../src/scenes/render/unitSpriteAnimator';

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

const SRC = readFileSync('src/scenes/IsoScene.ts', 'utf8');

/** The body of a private method in the IsoScene source (brace-matched from its declaration). */
function methodBody(name: string): string {
  const start = SRC.indexOf(`private ${name}(`);
  const cStart = SRC.indexOf(`  ${name}(`); // create() has no `private`
  const at = start >= 0 ? start : cStart;
  expect(at, `method ${name} exists in IsoScene.ts`).toBeGreaterThanOrEqual(0);
  const open = SRC.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) return SRC.slice(open, i + 1); }
  }
  throw new Error(`unbalanced braces scanning ${name}`);
}

describe('quickload restart teardown — F9 crash regression net', () => {
  beforeEach(() => { (globalThis as { localStorage?: Storage }).localStorage = mockLocalStorage(); });

  // ── 1. the REAL save shape through the REAL F9 entry ────────────────────────────────────────────
  it('a genuine localStorage-shape quicksave loads back through quickLoad() — the exact F9 entry', () => {
    const s = createInitialState(1, { startingCrew: true, tutorialFreeRuns: 1, bigCity: true });
    const w = quickSave(s, 12345, { fog: ['3,4', '5,6'] });
    expect(w.ok).toBe(true);
    const r = quickLoad(); // IsoScene binds keydown-F9 → handleLoadResult(quickLoad(), 'quick')
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.seed).toBe(s.seed);
      expect(r.file.view?.fog).toEqual(['3,4', '5,6']);
    }
  });

  // ── 2. the corpse failure mode, pinned on the real animator ────────────────────────────────────
  it('driving a restart-destroyed sprite throws — why a stale UnitView must never survive create()', () => {
    // scene.restart() destroys display objects; Phaser nulls .anims on destroy. A UnitView retained
    // across the restart hands exactly this corpse to playUnitAnim (Signature α of the F9 crash).
    const destroyedSprite = { anims: undefined } as unknown as Phaser.GameObjects.Sprite;
    expect(() => playUnitAnim(destroyedSprite, 'thug', 'idle', 0)).toThrow(TypeError);
  });

  // ── 3. source-scan mutation teeth on the create() wiring ───────────────────────────────────────
  it('create() calls resetRestartCaches() before any display builder runs', () => {
    const body = methodBody('create');
    const reset = body.indexOf('this.resetRestartCaches()');
    expect(reset, 'create() invokes this.resetRestartCaches()').toBeGreaterThanOrEqual(0);
    for (const builder of ['buildCityTextures(', 'this.drawCity()', 'this.spawnUnits()', 'this.drawHud()']) {
      const at = body.indexOf(builder);
      expect(at, `${builder} present in create()`).toBeGreaterThanOrEqual(0);
      expect(reset, `resetRestartCaches() runs before ${builder}`).toBeLessThan(at);
    }
  });

  it('resetRestartCaches() drops every crash-confirmed retained display cache', () => {
    const body = methodBody('resetRestartCaches');
    // Signature α: the unit views. Signature β: the drawHud-appended text rows. Plus every other
    // create-path appender that would otherwise double up and be re-driven as a corpse.
    const requiredArrayResets = [
      'units', 'topCells', 'channelRows', 'feedLines', 'crewRows', 'crewWrong',
      'toolbarBtns', 'actionChips', 'buildingHulls', 'dressing', 'dressingDark', 'reticleNames',
    ];
    for (const f of requiredArrayResets) {
      expect(body, `resets this.${f} = []`).toContain(`this.${f} = []`);
    }
    const requiredMapClears = [
      'bizMarkers', 'bizPlates', 'bizOwnerGlow', 'bizDistrict', 'bizBuildings', 'districtLabels',
      'downedBodyViews',
    ];
    for (const f of requiredMapClears) {
      expect(body, `clears this.${f}`).toContain(`this.${f}.clear()`);
    }
    // Retained per-run flags that must not leak across a load (stale endgameShown hijacks ESC and
    // suppresses the next real endgame; Infinity-lived alerts pin pre-load coordinates).
    expect(body).toContain('this.endgameShown = false');
    expect(body).toContain('this.alerts = []');
    expect(body).toContain('this.pings = []');
    expect(body).toContain('this.tipsFired.clear()');
    expect(body).toContain('this.tipUnlockQueued.clear()');
    expect(body).toContain('this.rushUsed = false');
  });

  it('EVERY lazily-created display singleton is reset — new get-or-create fields must join the teardown', () => {
    // Find each `if (!this.x) ... this.x = this.add...` / `this.x ?? (this.x = ...this.add...)`
    // get-or-create display singleton in the scene. After a restart these fields hold a corpse that the
    // guard treats as live, so each one MUST be set back to undefined in resetRestartCaches().
    const names = new Set<string>();
    for (const m of SRC.matchAll(/if \(!this\.(\w+)\)/g)) {
      const tail = SRC.slice(m.index, m.index + 400);
      if (new RegExp(`this\\.${m[1]} = this\\.(add|mkText)`).test(tail)) names.add(m[1]);
    }
    for (const m of SRC.matchAll(/this\.(\w+) \?\? \(this\.\1 =/g)) names.add(m[1]);
    // the net must actually be catching the known offenders — if this list shrinks the regex broke.
    for (const known of ['marqueeGfx', 'selCountText', 'collectorInfo', 'extortOverlay',
      'minimapG', 'edgeAlertG', 'wireLogG', 'advisorG', 'statusDashG', 'reticleG', 'opPreviewG']) {
      expect([...names], 'the get-or-create scan still finds the known singletons').toContain(known);
    }
    const body = methodBody('resetRestartCaches');
    for (const n of names) {
      expect(body, `lazily-created this.${n} is reset to undefined on restart`).toContain(`this.${n} = undefined`);
    }
  });
});
