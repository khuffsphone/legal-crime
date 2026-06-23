// RTS-30a — the sparse world generator invariants + the reworked district-status read.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { generateWorld, tileKindAt, districtOfTile, openFraction, scatterProps } from '../src/sim/worldgen';
import { districtStatusOf, cityRoster, citySummary } from '../src/sim/districtStatus';
import { businessTileOf, hqTileOf } from '../src/sim/mapEconomy';
import { HOLD_THRESHOLD } from '../src/sim/constants';
import type { GameState } from '../src/sim/types';

function big(seed = 1): GameState { return createInitialState(seed, { startingCrew: true, bigCity: true }); }

describe('sparse world generator', () => {
  it('builds a large map and is MapLayout-compatible (every business + HQ gets a tile)', () => {
    const s = big();
    const w = generateWorld(s, { size: 64 });
    expect(w.size).toBe(64);
    expect(w.cols).toBe(64);
    for (const d of s.districts) for (const b of d.businesses) {
      const t = businessTileOf(w, b.id);
      expect(t).toBeDefined();
      expect(t!.gx).toBeGreaterThanOrEqual(0); expect(t!.gx).toBeLessThan(64);
    }
    expect(hqTileOf(w, 'player')).toBeDefined();
  });

  it('DISTRICT PARTITION: every tile belongs to exactly one district', () => {
    const s = big();
    const w = generateWorld(s, { size: 64 });
    const ids = new Set(s.districts.map((d) => d.id));
    let assigned = 0;
    for (let gx = 0; gx < w.size; gx++) for (let gy = 0; gy < w.size; gy++) {
      const id = districtOfTile(w, gx, gy);
      expect(id).toBeDefined();
      expect(ids.has(id!)).toBe(true);
      assigned++;
    }
    expect(assigned).toBe(w.size * w.size); // complete partition
  });

  it('SPARSENESS: building footprints never touch (the min-gap rule) and blocks stay mostly open', () => {
    const s = big();
    const w = generateWorld(s, { size: 64 });
    // no building has a building in its 8-neighbourhood (≥1-tile setback everywhere)
    for (let gx = 0; gx < w.size; gx++) for (let gy = 0; gy < w.size; gy++) {
      if (tileKindAt(w, gx, gy) !== 'building') continue;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        expect(tileKindAt(w, gx + dx, gy + dy)).not.toBe('building');
      }
    }
    // every district is overwhelmingly open (sparse) — well above the 40–55% open target
    for (const d of s.districts) expect(openFraction(w, d.id)).toBeGreaterThan(0.85);
  });

  it('every district gets a park + a plaza (breathing room / landmarks)', () => {
    const s = big();
    const w = generateWorld(s, { size: 64 });
    for (const d of w.districts) {
      expect(tileKindAt(w, d.park.gx, d.park.gy)).toBe('park');
      expect(tileKindAt(w, d.plaza.gx, d.plaza.gy)).toBe('plaza');
    }
  });

  it('is deterministic for a seed', () => {
    const a = generateWorld(big(7), { size: 64 });
    const b = generateWorld(big(7), { size: 64 });
    expect(a.tiles).toEqual(b.tiles);
    expect(a.businessTiles).toEqual(b.businessTiles);
  });

  it('SIDEWALKS: open ground fronting a road is reclassified, and a sidewalk never overwrites a building', () => {
    const s = big();
    const w = generateWorld(s, { size: 64 });
    const isRoad = (gx: number, gy: number): boolean => { const k = tileKindAt(w, gx, gy); return k === 'avenue' || k === 'street'; };
    let sidewalks = 0;
    for (let gx = 0; gx < w.size; gx++) for (let gy = 0; gy < w.size; gy++) {
      if (tileKindAt(w, gx, gy) !== 'sidewalk') continue;
      sidewalks++;
      // every sidewalk tile fronts at least one road (it was derived that way)
      expect(isRoad(gx + 1, gy) || isRoad(gx - 1, gy) || isRoad(gx, gy + 1) || isRoad(gx, gy - 1)).toBe(true);
    }
    expect(sidewalks).toBeGreaterThan(0);
    // no business tile became a sidewalk
    for (const d of s.districts) for (const b of d.businesses) {
      const t = businessTileOf(w, b.id)!;
      expect(tileKindAt(w, t.gx, t.gy)).toBe('building');
    }
  });
});

describe('static set-dressing scatter (RTS-30b-ground)', () => {
  it('is deterministic per (layout, seed) and NEVER places a prop on a building/business tile', () => {
    const s = big();
    const w = generateWorld(s, { size: 64 });
    const a = scatterProps(w, { seed: s.seed });
    const b = scatterProps(w, { seed: s.seed });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    for (const p of a) expect(tileKindAt(w, p.gx, p.gy)).not.toBe('building');
  });

  it('places each prop only where its tile class allows (cars on roads, trees in parks/yards, …)', () => {
    const s = big();
    const w = generateWorld(s, { size: 64 });
    for (const p of scatterProps(w, { seed: s.seed })) {
      const k = tileKindAt(w, p.gx, p.gy);
      if (p.kind === 'lamppost' || p.kind === 'hydrant' || p.kind === 'mailbox') expect(k).toBe('sidewalk');
      else if (p.kind === 'car') expect(k === 'avenue' || k === 'street').toBe(true);
      else if (p.kind === 'bench') expect(k === 'park' || k === 'plaza').toBe(true);
      else if (p.kind === 'tree') expect(k === 'park' || k === 'ground').toBe(true);
      else if (p.kind === 'fence') expect(k).toBe('ground');
    }
  });

  it('stays sparse — at most one prop per tile, lived-in not cluttered', () => {
    const s = big();
    const w = generateWorld(s, { size: 96 });
    const props = scatterProps(w, { seed: s.seed });
    const seen = new Set<string>();
    for (const p of props) { const key = `${p.gx},${p.gy}`; expect(seen.has(key)).toBe(false); seen.add(key); }
    // well under one prop per ~10 tiles of the 9216-tile map (sparse, keeps the soot read)
    expect(props.length).toBeLessThan(w.size * w.size * 0.1);
  });
});

describe('district status — the reworked control read', () => {
  it('NEUTRAL with no holdings; ESTABLISHING with some; HELD past the threshold', () => {
    const s = big();
    const d = s.districts[0];
    expect(districtStatusOf(s, d.id)!.status).toBe('NEUTRAL');
    const fronts = d.businesses.filter((b) => b.kind === 'front');
    if (fronts.length > 0) {
      fronts[0].extortedBy = 'player';
      const after = districtStatusOf(s, d.id)!;
      // one of several businesses held → under the hold threshold → ESTABLISHING
      expect(['ESTABLISHING', 'HELD']).toContain(after.status);
      expect(after.bizHeld).toBe(1);
    }
    // hold ≥ threshold of ALL businesses → HELD
    for (const b of d.businesses) b.extortedBy = b.kind === 'front' ? 'player' : b.extortedBy;
    for (const b of d.businesses) if (b.kind !== 'front') b.ownerFamily = 'player';
    const held = districtStatusOf(s, d.id)!;
    expect(held.pct).toBeGreaterThanOrEqual(HOLD_THRESHOLD);
    expect(held.status).toBe('HELD');
    expect(held.tag).toMatch(/secure/);
  });

  it('the roster + summary count held/neutral districts', () => {
    const s = big();
    const roster = cityRoster(s);
    expect(roster.length).toBe(s.districts.length);
    const sum = citySummary(s);
    expect(sum.total).toBe(s.districts.length);
    expect(sum.held).toBe(0); // nothing held at the start
  });

  // RTS-30c-1 UPDATED: CONTESTED is no longer "never produced" — the turf-war slice now emits it for a
  // district with an active contest. Premise changed (war went live); the contest-driven behaviour is
  // covered in tests/turfContest.test.ts. Here we assert the AT-REST default still isn't CONTESTED.
  it('CONTESTED is not produced at rest (only while a turf-war contest is active)', () => {
    const s = big();
    s.districts[0].businesses.forEach((b, i) => { if (i % 2 === 0) b.extortedBy = 'player'; });
    for (const r of cityRoster(s)) expect(r.status).not.toBe('CONTESTED'); // no contests ⇒ no CONTESTED
  });
});
