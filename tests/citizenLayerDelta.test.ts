// CITIZEN LAYER DELTA (2026-07-09 spec refresh) — the six deltas, mutation-verified. Each block names the
// delta and the mutation that must fail it. Pure tests exercise ./citizens/anchors + the vocabulary; the
// wiring into AmbientLife/IsoScene is pinned by source-scan (the fogLeak/beatCops repo pattern) because
// AmbientLife needs a live Phaser scene.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  LEGACY_PROP_FAMILY, anchorsFromLegacyProps, buildAnchorIndex, anchorAt,
  VENDOR_ANCHOR_FAMILIES, QUEUE_ANCHOR_FAMILIES, LOITER_ANCHOR_FAMILIES, AVOID_STAND_FAMILIES,
  nearQueueAnchor, nearLoiterAnchor, isStandBlocked, resolveSpawnRole, resolveStandSpot,
  bandOffsetPx, VENDOR_FALLBACK_ROLE, WALK_RENDER_OFFSET,
  DISTRICT_COMPOSITION, buildDistrictArchetypeMap,
  type CitizenAnchor,
} from '../src/scenes/citizens';
import { REACTION_MATRIX, type CitizenEventKind } from '../src/scenes/citizens/reactions';
import { buildCityGraph, STEP_DIRS, type WorldLayout, type TileKind, type PropPlacement } from '../src/sim';
import { districtIdentityFor, type DistrictArchetype } from '../src/scenes/art/districtIdentity';

const CITIZENS_DIR = join(__dirname, '../src/scenes/citizens');
const ambientSrc = readFileSync(join(__dirname, '../src/scenes/ambientLife.ts'), 'utf8');
const isoSrc = readFileSync(join(__dirname, '../src/scenes/IsoScene.ts'), 'utf8');
const citizensSources = (): { file: string; src: string }[] =>
  readdirSync(CITIZENS_DIR).filter((f) => f.endsWith('.ts')).map((f) => ({ file: f, src: readFileSync(join(CITIZENS_DIR, f), 'utf8') }));

/** An all-'ground' NxN layout with select tiles painted (for graph tests). */
function grid(size: number, paint: ReadonlyArray<[number, number, TileKind]> = []): WorldLayout {
  const tiles: TileKind[] = Array.from({ length: size * size }, () => 'ground' as TileKind);
  for (const [gx, gy, k] of paint) tiles[gy * size + gx] = k;
  return {
    size, cols: size, rows: size, tiles,
    districtOfTile: Array.from({ length: size * size }, () => 'district-0'),
    districts: [], hqTiles: {}, businessTiles: {},
  } as WorldLayout;
}

const A = (family: string, gx: number, gy: number): CitizenAnchor => ({ family, gx, gy });

// ── DELTA 1 — movement zone discipline ────────────────────────────────────────────────────────────
describe('DELTA 1 — sidewalk_through walking, band loitering, no road', () => {
  it('walking renders at the tile centre; every pause context shifts OFF centre into its band', () => {
    expect(WALK_RENDER_OFFSET).toEqual({ dx: 0, dy: 0 });
    for (const ctx of ['generic', 'frontage', 'anchor', 'plaza', 'apron'] as const) {
      for (const roll of [0, 0.33, 0.66, 0.99]) {
        const off = bandOffsetPx(ctx, roll);
        expect(Math.abs(off.dx) + Math.abs(off.dy), `${ctx}@${roll}`).toBeGreaterThan(0); // band ≠ through-centre
        expect(Math.abs(off.dx)).toBeLessThanOrEqual(16); // subordinate nudge, not a teleport (56px scale)
        expect(Math.abs(off.dy)).toBeLessThanOrEqual(16);
      }
      expect(bandOffsetPx(ctx, 0.2)).toEqual(bandOffsetPx(ctx, 0.2)); // deterministic
    }
  });

  it('MUTATION offset-unwired: AmbientLife renders pauseDx/pauseDy and clears them when the pause ends', () => {
    expect(ambientSrc).toContain('setPosition(sx + a.pauseDx, sy + a.pauseDy)');
    expect(ambientSrc).toContain('a.pauseDx = 0; a.pauseDy = 0;');
  });

  it('MUTATION road-walking: peds step on sidewalkAdj ONLY, and no sidewalk edge ever leads onto a road', () => {
    // the wiring: the non-car branch reads sidewalkAdj (cars read roadAdj)
    expect(ambientSrc).toMatch(/isCar \? this\.graph\.roadAdj\[ti\] : this\.graph\.sidewalkAdj\[ti\]/);
    // the graph fact: a sidewalk tile's adjacency bits never point at an avenue/street tile (disjoint
    // graphs, no crosswalk edges — unchanged in MVP)
    const L = grid(8, [
      [3, 3, 'sidewalk'], [4, 3, 'sidewalk'], [5, 3, 'avenue'], [3, 4, 'street'], [3, 2, 'sidewalk'],
    ]);
    const g = buildCityGraph(L);
    for (const ti of g.sidewalkNodes) {
      const gx = ti % g.size, gy = (ti / g.size) | 0;
      const adj = g.sidewalkAdj[ti];
      for (let d = 0; d < 4; d++) {
        if (!(adj & (1 << d))) continue;
        const k = L.tiles[(gy + STEP_DIRS[d][1]) * g.size + (gx + STEP_DIRS[d][0])];
        expect(k, `sidewalk (${gx},${gy}) edge ${d}`).toBe('sidewalk'); // never 'avenue'/'street'
      }
    }
  });
});

// ── DELTA 2 — real prop anchors ───────────────────────────────────────────────────────────────────
describe('DELTA 2 — vendor requires a REAL cart/stall prop; anchors come from placed props', () => {
  it('the legacy scatter maps to families physically (hydrant/mailbox kept) and fence drops', () => {
    const props: PropPlacement[] = [
      { kind: 'lamppost', gx: 1, gy: 1 }, { kind: 'tree', gx: 2, gy: 1 }, { kind: 'hydrant', gx: 3, gy: 1 },
      { kind: 'mailbox', gx: 4, gy: 1 }, { kind: 'bench', gx: 5, gy: 1 }, { kind: 'car', gx: 6, gy: 1 },
      { kind: 'fence', gx: 7, gy: 1 },
    ];
    const anchors = anchorsFromLegacyProps(props);
    expect(anchors.map((a) => a.family)).toEqual(['street_lamp', 'street_tree', 'fire_hydrant', 'mailbox', 'bench', 'parked_car']);
    expect(anchorAt(buildAnchorIndex(anchors), 3, 1)?.family).toBe('fire_hydrant');
  });

  it('NO vendor anchor is derivable from the legacy 7 kinds ⇒ zero vendors until real carts are placed', () => {
    for (const family of Object.values(LEGACY_PROP_FAMILY)) {
      if (family) expect(VENDOR_ANCHOR_FAMILIES.has(family)).toBe(false);
    }
  });

  it('MUTATION vendor-gate-deleted: streetVendor demotes with no cart; stands with a cart adjacent', () => {
    const none = buildAnchorIndex([]);
    expect(resolveSpawnRole('streetVendor', none, 5, 5)).toBe(VENDOR_FALLBACK_ROLE);
    expect(resolveSpawnRole('streetVendor', none, 5, 5)).not.toBe('streetVendor');
    const cart = buildAnchorIndex([A('vendor_cart', 6, 5)]);
    expect(resolveSpawnRole('streetVendor', cart, 5, 5)).toBe('streetVendor'); // cart in the 8-neighbourhood
    const stall = buildAnchorIndex([A('produce_stall', 5, 5)]);
    expect(resolveSpawnRole('streetVendor', stall, 5, 5)).toBe('streetVendor');
    const far = buildAnchorIndex([A('vendor_cart', 9, 9)]);
    expect(resolveSpawnRole('streetVendor', far, 5, 5)).toBe(VENDOR_FALLBACK_ROLE); // out of reach
    expect(resolveSpawnRole('worker', none, 5, 5)).toBe('worker'); // other roles pass through
  });

  it('anchor uses per spec §3: queue anchors gate the queue context; loiter anchors are the lean/sit set', () => {
    expect([...QUEUE_ANCHOR_FAMILIES].sort()).toEqual(['news_stand', 'produce_stall', 'vendor_cart']);
    for (const f of ['bench', 'fountain', 'street_lamp', 'parked_car', 'crate_stack']) {
      expect(LOITER_ANCHOR_FAMILIES.has(f), f).toBe(true);
    }
    const idx = buildAnchorIndex([A('news_stand', 4, 4), A('bench', 8, 8)]);
    expect(nearQueueAnchor(idx, 5, 5)?.family).toBe('news_stand'); // diagonal counts
    expect(nearQueueAnchor(idx, 8, 8)).toBeUndefined();            // a bench is not a queue
    expect(nearLoiterAnchor(idx, 7, 7)?.family).toBe('bench');
  });

  it('MUTATION wiring: AmbientLife builds the index from the placed scatter and gates the spawn role', () => {
    expect(ambientSrc).toContain('buildAnchorIndex(anchorsFromLegacyProps(scatterProps(layout, { seed })))');
    expect(ambientSrc).toContain('resolveSpawnRole(roleForSlot(');
  });
});

// ── DELTA 3 — no reaction to ordinary beat-cop proximity ─────────────────────────────────────────
describe('DELTA 3 — citizens ignore patrol proximity (law-EVENT reactions stay deferred + unfed)', () => {
  it('MUTATION cop-coupling-added: no citizen module or AmbientLife reads cop/patrol/suspicion state', () => {
    for (const { file, src } of citizensSources()) {
      expect(src, `citizens/${file}`).not.toMatch(/beatCop|BeatCop|copSees|suspicion|patrolWorld|advanceCop/);
    }
    expect(ambientSrc).not.toMatch(/beatCop|BeatCop|copSees|suspicion|patrolWorld/);
  });

  it('no proximity-shaped event kind exists; the chase/raid LAW EVENTS stay DEFER (out of this pass)', () => {
    const kinds = Object.keys(REACTION_MATRIX) as CitizenEventKind[];
    for (const k of kinds) expect(k).not.toMatch(/patrol|proximity|nearby.*cop|copNear/i);
    expect(REACTION_MATRIX.copPursuit.status).toBe('DEFER'); // chase = future law event, not built this pass
    expect(REACTION_MATRIX.raid.status).toBe('DEFER');
  });

  it('the scene feeds NO events — reactions (incl. any future law events) are dormant end-to-end', () => {
    // IsoScene's only ambient.update call passes (dt, cam, reveal) — the reveal closure is the LAST
    // argument; no 4th events argument exists, so reactionFor never fires in the live scene.
    const call = isoSrc.match(/this\.ambient\?\.update\(([^;]*)\);/);
    expect(call, 'ambient.update call').toBeTruthy();
    expect(call![1]).not.toContain('events');
    expect(call![1].trimEnd().endsWith('isRevealed(this.fog, gx, gy)')).toBe(true); // reveal is the final arg
  });
});

// ── DELTA 4 — district vocabulary: 9 ART archetypes, ordinal join only ─────────────────────────────
describe('DELTA 4 — citizen composition keys the 9 ART archetypes; join is ordinal, never name-matching', () => {
  const ART_9: DistrictArchetype[] = [
    'FINANCIAL', 'DOCKS', 'TENEMENT', 'CIVIC', 'MARKET', 'THEATRE', 'INDUSTRIAL', 'QUARTER', 'RIVERSIDE',
  ];

  it('MUTATION vocabulary-merged: DISTRICT_COMPOSITION carries exactly the 9 ART keys (incl. QUARTER)', () => {
    expect(Object.keys(DISTRICT_COMPOSITION).sort()).toEqual([...ART_9].sort());
  });

  it('MUTATION name-matching: the archetype map joins by ORDINAL — arbitrary district ids still resolve', () => {
    // ids that match NO vocabulary anywhere; only their array position may matter
    const layout = {
      ...grid(4),
      districts: [{ id: 'zzz-anything' }, { id: 'DOCKS' }, { id: 'market' }] as never,
    } as WorldLayout;
    const m = buildDistrictArchetypeMap(layout);
    expect(m.get('zzz-anything')).toBe(districtIdentityFor(0).archetype); // position 0, name irrelevant
    expect(m.get('DOCKS')).toBe(districtIdentityFor(1).archetype);        // NOT the 'DOCKS' archetype by name
    expect(m.get('market')).toBe(districtIdentityFor(2).archetype);
  });

  it('no citizen module name-matches the sim CITY_ARCHETYPES vocabulary (comments stripped — docs MAY warn)', () => {
    const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const { file, src } of citizensSources()) {
      expect(stripComments(src), `citizens/${file}`).not.toContain('CITY_ARCHETYPES');
    }
    expect(stripComments(ambientSrc)).not.toContain('CITY_ARCHETYPES');
  });
});

// ── DELTA 5 — no audio/citizen mechanical coupling ─────────────────────────────────────────────────
describe('DELTA 5 — citizens and audio never import each other (both read district context independently)', () => {
  it('MUTATION coupling-added: citizens/ + ambientLife import nothing from audio; audio imports no citizens', () => {
    for (const { file, src } of citizensSources()) {
      expect(src, `citizens/${file}`).not.toMatch(/from '.*audio/);
    }
    expect(ambientSrc).not.toMatch(/from '.\/audio|from '.*\/audio/);
    const AUDIO_DIR = join(__dirname, '../src/scenes/audio');
    for (const f of readdirSync(AUDIO_DIR).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(AUDIO_DIR, f), 'utf8');
      expect(src, `audio/${f}`).not.toMatch(/from '.*citizens|from '.*ambientLife/);
    }
  });
});

// ── DELTA 6 — prop overlap / draw-order ────────────────────────────────────────────────────────────
describe('DELTA 6 — the prop wins the tile: no standing on filler anchors, diagonal-favoring offsets', () => {
  it('the avoid-stand set is exactly the 10 filler anchors from the delta', () => {
    expect([...AVOID_STAND_FAMILIES].sort()).toEqual([
      'barrel_drum', 'bollard', 'crate_stack', 'fire_hydrant', 'mailbox',
      'manhole_cover', 'pallet_stack', 'puddle_stain', 'sewer_grate', 'trash_can',
    ]);
  });

  it('standing is blocked ON a filler anchor, never beside one; loiter anchors do not block', () => {
    const idx = buildAnchorIndex([A('fire_hydrant', 5, 5), A('bench', 7, 7)]);
    expect(isStandBlocked(idx, 5, 5)).toBe(true);
    expect(isStandBlocked(idx, 5, 6)).toBe(false); // beside is fine
    expect(isStandBlocked(idx, 7, 7)).toBe(false); // a bench is a loiter anchor, not a blocker
  });

  it('MUTATION diagonal-favor-deleted: a blocked pause shifts to a DIAGONAL half-tile; all-blocked skips', () => {
    const idx = buildAnchorIndex([A('trash_can', 5, 5)]);
    const spot = resolveStandSpot(idx, 5, 5, 'generic', 0.1);
    expect(spot).not.toBeNull();
    // the four half-tile diagonal screen offsets in 2:1 dimetric: toward (1,1)→(0,32), (1,−1)→(64,0),
    // (−1,1)→(−64,0), (−1,−1)→(0,−32) — i.e. half of ((dx−dy)·64, (dx+dy)·32)
    const diag = [{ dx: 0, dy: 32 }, { dx: 64, dy: 0 }, { dx: -64, dy: 0 }, { dx: 0, dy: -32 }];
    expect(diag.some((d) => d.dx === spot!.dx && d.dy === spot!.dy)).toBe(true);
    // fully surrounded (centre + all four diagonals carry blockers) ⇒ null (the pause is skipped)
    const walled = buildAnchorIndex([
      A('trash_can', 5, 5), A('bollard', 6, 6), A('barrel_drum', 6, 4), A('crate_stack', 4, 6), A('sewer_grate', 4, 4),
    ]);
    expect(resolveStandSpot(walled, 5, 5, 'generic', 0.7)).toBeNull();
    // an unblocked tile keeps its context band offset (delta 1 path)
    expect(resolveStandSpot(buildAnchorIndex([]), 5, 5, 'plaza', 0.4)).toEqual(bandOffsetPx('plaza', 0.4));
  });

  it('MUTATION spawn-on-prop: the spawn loop skips a blocked node (wiring)', () => {
    expect(ambientSrc).toContain('isStandBlocked(this.anchorIndex, gx, gy)) continue;');
  });
});
