// FOG-LEAK FIX — NO-X-RAY on the base cursor surface (independent of ?combat=1).
//
// The pre-existing leak (CC report on #67): the hover tooltip, the left-click "that's a rival" hint,
// the cursor op-preview card, and the right-click verb routing all fog-gated ONLY under ?combat=1. With
// the flag OFF — i.e. the SHIPPING base build — a fogged rival under the cursor still tooltipped its
// kind + family, fired the attack hint, popped a preview card, and routed 'attack' (crew marches in, a
// reticle blooms on the fogged tile). Sweeping the mouse over the dark was a free X-ray of hidden rivals.
//
// The fix routes EVERY cursor channel through ONE fog predicate (isVisibleTile) via the pure fog-safe
// pick (pickVisibleUnit), UNCONDITIONALLY. A fogged rival now resolves byte-identically to empty ground.
//
// Two proofs, each with mutation teeth:
//   1. TWIN WORLDS (pure) — a fogged-rival tile deep-equals an empty-ground tile at the pick that drives
//      all three read channels, AND the opPreview selector itself stays 'visible only' (defense in depth).
//   2. SCENE WIRING (source-scan, node-side — the beatCops/combat-PR pattern) — each channel actually
//      calls the unconditional gate; the `this.combatControlsEnabled ? …filter` leak pattern is gone everywhere.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pickVisibleUnit, pickUnit } from '../src/sim/selection';
import { previewAttackRival } from '../src/sim/opPreview';
import { VISIBLE_ONLY } from '../src/sim/opPreviewTypes';
import { spawnEnforcer, type MovableUnit } from '../src/sim/movement';
import type { GameState, Family } from '../src/sim/types';
import type { GridPos } from '../src/sim/iso';

const FOGGED = (_pos: GridPos): boolean => false; // the whole map is dark
const LIT = (_pos: GridPos): boolean => true;

// ── minimal pure fixtures (no Phaser, no scene) ──────────────────────────────────────────────────
function family(id: string, over: Partial<Family> = {}): Family {
  return {
    id, name: id, isPlayer: id === 'player', alive: true, color: 0, hq: { gx: 0, gy: 0 },
    cash: 0, dirtyCash: 0, heat: 0, gangsters: [], bribes: { feds: 0, judges: 0, politicians: 0, police: 0 },
    aggro: 0, fedWarningLevel: 0, fedImminentTicks: 0, bustArmed: false, ...over,
  } as Family;
}
function stateWith(units: MovableUnit[]): GameState {
  return {
    tick: 0, rngState: 1, offenseCooldown: 0,
    player: family('player', { cash: 5000 }),
    rivals: [family('rival-a')], districts: [], units, log: [], extortionActs: [],
  } as unknown as GameState;
}
const enforcer = (id: string, faction: string, gx: number, gy: number): MovableUnit => spawnEnforcer(id, gx, gy, faction);

describe('fog-leak fix — TWIN WORLDS: a fogged rival tile deep-equals empty ground', () => {
  const PROBE = { gx: 12, gy: 12 };

  // The single discriminant behind hover / left-click / cursor-preview: the fog-safe pick. When it is
  // null the channel falls through to its empty-ground branch (no tooltip identity, no hint, no card).
  it('the read channels — hover / left-click hint / cursor-preview — resolve NOTHING at a fogged rival', () => {
    const rivalWorld = [enforcer('r1', 'rival-a', PROBE.gx, PROBE.gy)];
    const emptyWorld: MovableUnit[] = [];

    // hover tooltip picks its unit from ALL units; left-click hint picks from rival non-collectors;
    // cursor-preview picks from ALL units. Each is pickVisibleUnit over its candidate list.
    const hoverPick = (us: MovableUnit[]) => pickVisibleUnit(us, PROBE, FOGGED);
    const hintPick = (us: MovableUnit[]) => pickVisibleUnit(us.filter((u) => u.factionId !== 'player'), PROBE, FOGGED);
    const previewPick = (us: MovableUnit[]) => pickVisibleUnit(us, PROBE, FOGGED);

    for (const pick of [hoverPick, hintPick, previewPick]) {
      expect(pick(rivalWorld)).toBeNull();                 // fogged rival → nothing
      expect(pick(rivalWorld)).toEqual(pick(emptyWorld));  // …deep-equals empty ground (both null)
    }
  });

  it('with the tile LIT the very same pick DOES surface the rival (the gate is not vacuously null)', () => {
    const rivalWorld = [enforcer('r1', 'rival-a', PROBE.gx, PROBE.gy)];
    expect(pickVisibleUnit(rivalWorld, PROBE, LIT)?.id).toBe('r1');
  });

  it('MUTATION WITNESS — delete the gate (pickVisibleUnit → pickUnit) and the fogged rival leaks', () => {
    const rivalWorld = [enforcer('r1', 'rival-a', PROBE.gx, PROBE.gy)];
    expect(pickUnit(rivalWorld, PROBE)?.id).toBe('r1');        // ungated pick — the LEAK
    expect(pickVisibleUnit(rivalWorld, PROBE, FOGGED)).toBeNull(); // gated pick — closed
  });

  it('DEFENSE IN DEPTH — even the opPreview selector collapses a fogged rival to "visible only"', () => {
    // the cursor-preview card is a second gate: were a fogged fighter ever picked, the pure selector
    // still refuses to read its condition. So the leak needs BOTH gates to fail — pick AND selector.
    const st = stateWith([enforcer('p1', 'player', 5, 5), enforcer('r1', 'rival-a', PROBE.gx, PROBE.gy)]);
    const card = previewAttackRival(st, 'p1', 'r1', FOGGED);
    expect(card.glance[0].value).toBe(VISIBLE_ONLY);
    expect(JSON.stringify(card)).not.toMatch(/down them in/); // no fabricated combat math
  });
});

describe('fog-leak fix — SCENE WIRING (source-scan): every cursor channel funnels through the one gate', () => {
  const sceneSrc = readFileSync(join(__dirname, '../src/scenes/IsoScene.ts'), 'utf8');
  const from = (marker: string, len: number) => {
    const i = sceneSrc.indexOf(marker);
    expect(i, `marker not found: ${marker}`).toBeGreaterThanOrEqual(0);
    return sceneSrc.slice(i, i + len);
  };

  it('there is ONE fog predicate — isVisibleTile — folding debugRevealAll over isRevealed', () => {
    expect(sceneSrc).toMatch(
      /private isVisibleTile\(pos: \{ gx: number; gy: number \}\): boolean \{\s*\n\s*return this\.debugRevealAll \|\| isRevealed\(this\.fog, Math\.round\(pos\.gx\), Math\.round\(pos\.gy\)\);/,
    );
  });

  it('combatCtx reuses isVisibleTile (the combat surface shares the one rule, no parallel closure)', () => {
    expect(from('private combatCtx(', 200)).toContain('isVisible: (pos) => this.isVisibleTile(pos),');
  });

  it('combat Wire feedback routes through combatInfoIntent with the canonical visibility predicate', () => {
    const beat = from('private playCombatBeat(', 3500);
    expect(beat).toContain('const revealed = this.isVisibleTile({ gx: ev.gx, gy: ev.gy });');
    expect(beat).toContain('combatInfoIntent(ev, this.state.player.id, revealed)');
    expect(beat).toContain('if (info) this.recordInfoEvent(info.kind, info.message, info.gx, info.gy);');
    expect(beat).toContain("if (visible) this.cameraBeat('normalHit')");
    expect(beat).toContain("if (visible) this.cameraBeat('kill')");
    expect(beat).toContain('if (visible) this.playKill(c.x, c.y, faction)');
  });

  it('hidden combat cannot alter the adaptive score or instantiate a downed-body view', () => {
    expect(sceneSrc).toContain('obs.result.combat.some((ev) => this.isVisibleTile({ gx: ev.gx, gy: ev.gy }))');
    const bodies = from('private syncDownedBodies(', 1100);
    expect(bodies).toContain('const shown = this.isVisibleTile({ gx: b.gx, gy: b.gy });');
    expect(bodies).toContain('if (!img && !shown) continue;');
  });

  it('hover tooltip picks through the unconditional gate', () => {
    expect(from('private hoverText(', 900)).toContain('pickVisibleUnit(hoverUnits, gpoint, (pos) => this.isVisibleTile(pos))');
  });

  it('left-click "that\'s a rival" hint picks through the unconditional gate', () => {
    expect(from('private commandSelect(', 2800)).toContain('pickVisibleUnit(foeCandidates, point, (pos) => this.isVisibleTile(pos))');
  });

  it('cursor op-preview picks through the unconditional gate, and its local isVis delegates to the one predicate', () => {
    const preview = from('private resolveOpPreview(', 1700);
    expect(preview).toContain('const isVis = (pos: { gx: number; gy: number }) => this.isVisibleTile(pos);');
    expect(preview).toContain('pickVisibleUnit(hoverable, screenToGrid(p.worldX, p.worldY), isVis)');
  });

  it('right-click verb routing is fog-safe on BOTH paths (flagged → hostile pick, flag-off → visible pick)', () => {
    const ctx = from('private commandContextual(', 900);
    expect(ctx).toContain('? pickVisibleHostile(');
    expect(ctx).toContain('pickVisibleUnit(this.units.map((v) => v.unit), gpoint, (pos) => this.isVisibleTile(pos))');
  });

  it('MUTATION TOOTH — the combat-only leak pattern is gone from every channel', () => {
    // reverting ANY channel to `this.combatControlsEnabled ? <list>.filter((u) => …isVisible(u.pos)) : <list>`
    // re-opens the flag-off leak and fails here.
    expect(sceneSrc).not.toMatch(/this\.combatControlsEnabled \? \w+\.filter\(\(u\) => (this\.combatCtx\(\)\.isVisible|isVis)\(u\.pos\)\)/);
  });
});

describe('fog-leak fix — FRONT-INFO surfaces: a fogged front names no rival earner or economics', () => {
  // The sibling of the unit leak: businessAtScreen hit-tests ALL fronts regardless of fog, and the
  // hover tooltip / persistent context card / left-click selection / right-click EXTORT menu each read a
  // fogged front's earner + income/uncollected — the exact economics resolveOpPreview already suppresses.
  // The fog-aware visibleBusinessAt (the businessAtScreen twin of pickVisibleUnit) closes all four.
  const sceneSrc = readFileSync(join(__dirname, '../src/scenes/IsoScene.ts'), 'utf8');
  const from = (marker: string, len: number) => {
    const i = sceneSrc.indexOf(marker);
    expect(i, `marker not found: ${marker}`).toBeGreaterThanOrEqual(0);
    return sceneSrc.slice(i, i + len);
  };

  it('visibleFrontId gates a front id on its tile visibility (isVisibleTile)', () => {
    expect(from('private visibleFrontId(', 320)).toMatch(
      /const tile = businessTileOf\(this\.layout, bizId\);\s*\n\s*return tile && this\.isVisibleTile\(tile\) \? bizId : undefined;/,
    );
  });

  it('visibleBusinessAt is the fog-safe businessAtScreen (delegates through visibleFrontId)', () => {
    expect(from('private visibleBusinessAt(', 260)).toContain('this.visibleFrontId(this.businessAtScreen(worldX, worldY))');
  });

  it('hover tooltip resolves the front through the fog-safe pick', () => {
    expect(from('private hoverText(', 2900)).toContain('this.visibleBusinessAt(p.worldX, p.worldY)');
  });

  it('left-click building selection resolves the front through the fog-safe pick', () => {
    expect(from('private commandSelect(', 4000)).toContain('this.visibleBusinessAt(p.worldX, p.worldY)');
  });

  it('right-click verb routing resolves the front through the fog-safe pick', () => {
    expect(from('private commandContextual(', 1400)).toContain('this.visibleBusinessAt(p.worldX, p.worldY)');
  });

  it('the persistent context card fog-gates BOTH the hovered pick and the sticky focusBizId', () => {
    const card = from('private drawContextCard(', 1400);
    expect(card).toContain('this.visibleBusinessAt(ptr.worldX, ptr.worldY)');
    expect(card).toContain('this.visibleFrontId(sticky)'); // a re-shrouded sticky front drops
  });

  it('resolveOpPreview keeps its own fogged-front guard (the canonical precedent this mirrors)', () => {
    expect(from('private resolveOpPreview(', 2200)).toContain('if (!tile || !isVis(tile))');
  });
});
