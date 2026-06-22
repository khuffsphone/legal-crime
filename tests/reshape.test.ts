// RTS-29 — the peaceful-builder reshape: fog reveal, extort-as-repeated-visits, fixed per-business
// collectors, and the rival-dormancy gate. Pure & seeded; /src/sim Phaser-free.
// RTS-30a NOTE: the CONTROL-CURRENCY tests were REMOVED here — that spend-to-extort meter is RETIRED
// (control is now district STATUS, covered by tests/world.test.ts); extortion is no longer gated by it.

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { createFog, isRevealed, revealAround, revealedCount, tileKey } from '../src/sim/fog';
import { extortResistance, extortProgress, recordExtortVisit } from '../src/sim/extortion';
import { advanceStrategy, rivalsDormant } from '../src/sim/strategy';
import { ensureBusinessCollector, businessRouteId, collectorsVulnerable } from '../src/sim/routes';
import { buildMapLayout, navGridForLayout } from '../src/sim/mapEconomy';
import { businessEarner } from '../src/sim/economy';
import type { GameState } from '../src/sim/types';

function big(seed = 1): GameState { return createInitialState(seed, { startingCrew: true, bigCity: true }); }
function firstFront(s: GameState): string {
  for (const d of s.districts) for (const b of d.businesses) if (b.kind === 'front') return b.id;
  throw new Error('no front');
}

// ── FOG OF WAR ──────────────────────────────────────────────────────────────────────────────────
describe('fog of war — reveal radius + incremental delta', () => {
  it('starts fully shrouded; revealAround uncovers a disk and returns only the NEW tiles', () => {
    const fog = createFog();
    expect(revealedCount(fog)).toBe(0);
    const newly = revealAround(fog, 5, 5, 2, 16, 16);
    expect(newly.length).toBeGreaterThan(0);
    expect(isRevealed(fog, 5, 5)).toBe(true);
    expect(isRevealed(fog, 5, 6)).toBe(true);
    expect(isRevealed(fog, 15, 15)).toBe(false); // far corner stays dark
    // a second identical reveal adds nothing (incremental — only redraw what changed)
    expect(revealAround(fog, 5, 5, 2, 16, 16).length).toBe(0);
  });

  it('clamps to the board bounds and rounds tile keys', () => {
    const fog = createFog();
    revealAround(fog, 0, 0, 3, 16, 16);
    expect(isRevealed(fog, 0, 0)).toBe(true);
    expect(fog.has(tileKey(0, 0))).toBe(true);
    for (const k of fog) { const [gx, gy] = k.split(',').map(Number); expect(gx).toBeGreaterThanOrEqual(0); expect(gy).toBeGreaterThanOrEqual(0); }
  });
});

// ── EXTORT AS REPEATED VISITS ─────────────────────────────────────────────────────────────────
describe('extort-as-repeated-visits — convert a front over N muscle visits', () => {
  it('a front resists N visits, then converts to extorted (no cash cost)', () => {
    const s = big();
    const id = firstFront(s);
    const needed = extortProgress(s, id)!.needed;
    expect(needed).toBeGreaterThanOrEqual(3);
    let res = recordExtortVisit(s, 'player', id);
    for (let i = 1; i < needed; i++) {
      expect(res.converted).toBe(false);
      res = recordExtortVisit(s, 'player', id);
    }
    expect(res.converted).toBe(true);
    expect(businessEarner(s.districts[0].businesses.find((b) => b.id === id)!)).toBe('player');
  });

  it('an already-paying front rejects further visits; richer blocks resist more', () => {
    const s = big();
    const id = firstFront(s);
    const fr = s.districts[0].businesses.find((b) => b.id === id)!;
    fr.extortedBy = 'player';
    expect(recordExtortVisit(s, 'player', id).ok).toBe(false);
    // wealth raises resistance
    const poor = extortResistance({ ...fr, extortedBy: undefined }, { wealth: 1 } as never);
    const rich = extortResistance({ ...fr, extortedBy: undefined }, { wealth: 4 } as never);
    expect(rich).toBeGreaterThan(poor);
  });
});

// ── RIVAL DORMANCY ──────────────────────────────────────────────────────────────────────────────
describe('delayed rivals — territorial aggression is dormant early', () => {
  it('rivalsDormant honours rivalWakeWeek (absent ⇒ never dormant, prior behaviour)', () => {
    const s = big();
    expect(rivalsDormant(s)).toBe(false); // no wake week set
    s.rivalWakeWeek = 3;
    expect(rivalsDormant(s)).toBe(true); // tick 0 < 3
    s.tick = 3;
    expect(rivalsDormant(s)).toBe(false);
  });

  it('advanceStrategy fires NO pulses while dormant, then resumes', () => {
    const s = big();
    s.rivalWakeWeek = 3;
    expect(advanceStrategy(s, 1000).pulses).toBe(0); // dormant — a huge dt still fires nothing
    s.tick = 3; // rivals wake
    expect(advanceStrategy(s, 1000).pulses).toBeGreaterThan(0);
  });
});

// ── FIXED PER-BUSINESS COLLECTORS ─────────────────────────────────────────────────────────────
describe('fixed per-business collectors — the sea of collectors', () => {
  it('spawns ONE collector per extorted business; repeat is a no-op; interception is dormant early', () => {
    const s = big();
    s.rivalWakeWeek = 3;
    const layout = buildMapLayout(s, 16, 16);
    const grid = navGridForLayout(layout);
    const id = firstFront(s);
    s.districts[0].businesses.find((b) => b.id === id)!.extortedBy = 'player';

    const setup = ensureBusinessCollector(s, layout, 'player', id, grid);
    expect(setup).not.toBeNull();
    expect(setup!.unit.routeId).toBe(businessRouteId(id));
    expect(s.units.filter((u) => u.routeId === businessRouteId(id)).length).toBe(1);
    // a second call doesn't stack a duplicate collector
    expect(ensureBusinessCollector(s, layout, 'player', id, grid)).toBeNull();
    expect(s.units.filter((u) => u.routeId === businessRouteId(id)).length).toBe(1);
    // RTS-30 hook is dormant in the safe early game
    expect(collectorsVulnerable(s)).toBe(false);
    s.tick = 3;
    expect(collectorsVulnerable(s)).toBe(true);
  });
});
