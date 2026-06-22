// RTS-30 living-city Pass 1 — pure tests for the ambient infrastructure: the object pool, the sidewalk/
// road graphs built from the worldgen tile classes, the wander step, and the liveliness parse. The
// agent rendering/cull is Phaser-side (ambientLife.ts); these cover the deterministic, testable seams.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { generateWorld, tileKindAt } from '../src/sim/worldgen';
import { Pool } from '../src/sim/pool';
import { buildCityGraph, pickStep, parseLiveliness, LIVELINESS_CAPS, STEP_DIRS } from '../src/sim/cityGraph';
import type { GameState } from '../src/sim/types';

function big(seed = 1): GameState { return createInitialState(seed, { startingCrew: true, bigCity: true }); }

describe('object pool — pre-allocated, activate/return, no growth', () => {
  it('acquires up to capacity then returns null; release recycles', () => {
    let built = 0;
    const pool = new Pool<{ n: number }>(3, () => ({ n: built++ }));
    expect(pool.capacity).toBe(3);
    expect(built).toBe(3); // pre-allocated at construction
    const a = pool.acquire()!, b = pool.acquire()!, c = pool.acquire()!;
    expect(pool.activeCount).toBe(3);
    expect(pool.acquire()).toBeNull(); // exhausted — never allocates beyond capacity
    expect(built).toBe(3);
    pool.release(b);
    expect(pool.activeCount).toBe(2);
    expect(pool.freeCount).toBe(1);
    const d = pool.acquire()!; // recycles the freed object, no new build
    expect(built).toBe(3);
    expect([a, c, d]).toContain(d);
  });

  it('reverse-iterate + release is safe (the per-frame cull pattern)', () => {
    const pool = new Pool<{ id: number }>(5, (() => { let i = 0; return () => ({ id: i++ }); })());
    for (let i = 0; i < 5; i++) pool.acquire();
    const active = pool.active;
    for (let i = active.length - 1; i >= 0; i--) if (active[i].id % 2 === 0) pool.release(active[i]);
    // released ids 0,2,4 ⇒ 2 remain
    expect(pool.activeCount).toBe(2);
    for (const a of pool.active) expect(a.id % 2).toBe(1);
  });
});

describe('city graphs — built once from the ground tile classes', () => {
  it('sidewalk + road nodes match the tile classification, and adjacency only links same-kind', () => {
    const s = big();
    const w = generateWorld(s, { size: 64 });
    const g = buildCityGraph(w);
    expect(g.size).toBe(64);
    expect(g.sidewalkNodes.length).toBeGreaterThan(0);
    expect(g.roadNodes.length).toBeGreaterThan(0);
    // every sidewalk node is a sidewalk tile; its adjacency bits point only to sidewalk neighbours
    for (const ti of g.sidewalkNodes) {
      const gx = ti % 64, gy = (ti / 64) | 0;
      expect(tileKindAt(w, gx, gy)).toBe('sidewalk');
      const m = g.sidewalkAdj[ti];
      for (let d = 0; d < 4; d++) if (m & (1 << d)) {
        expect(tileKindAt(w, gx + STEP_DIRS[d][0], gy + STEP_DIRS[d][1])).toBe('sidewalk');
      }
    }
    // every road node is an avenue/street; adjacency points only to road
    for (const ti of g.roadNodes) {
      const gx = ti % 64, gy = (ti / 64) | 0;
      const k = tileKindAt(w, gx, gy);
      expect(k === 'avenue' || k === 'street').toBe(true);
      const m = g.roadAdj[ti];
      for (let d = 0; d < 4; d++) if (m & (1 << d)) {
        const nk = tileKindAt(w, gx + STEP_DIRS[d][0], gy + STEP_DIRS[d][1]);
        expect(nk === 'avenue' || nk === 'street').toBe(true);
      }
    }
  });

  it('is deterministic for a seed', () => {
    const a = buildCityGraph(generateWorld(big(5), { size: 64 }));
    const b = buildCityGraph(generateWorld(big(5), { size: 64 }));
    expect(Array.from(a.sidewalkAdj)).toEqual(Array.from(b.sidewalkAdj));
    expect(a.roadNodes).toEqual(b.roadNodes);
  });
});

describe('wander step — keeps flowing, no U-turn unless dead-end', () => {
  const N = 0, E = 1, S = 2, W = 3;
  it('returns -1 at a dead-end with no exits', () => {
    expect(pickStep(0, -1, 0.5)).toBe(-1);
  });
  it('continues straight when possible (roll < 0.6)', () => {
    const mask = (1 << E) | (1 << S); // exits E and S
    expect(pickStep(mask, E, 0.1)).toBe(E); // heading E, E available → straight
  });
  it('never reverses unless it is the only exit', () => {
    // exits only W while heading E ⇒ W is the reverse, but it's the lone exit → allowed
    expect(pickStep(1 << W, E, 0.9)).toBe(W);
    // a cross with both turns available never picks the reverse (W) when heading E
    const cross = (1 << N) | (1 << E) | (1 << S) | (1 << W);
    for (const roll of [0.0, 0.3, 0.6, 0.75, 0.99]) {
      const d = pickStep(cross, E, roll);
      if (roll < 0.6) expect(d).toBe(E); else expect(d).not.toBe(W);
    }
  });
  it('only ever returns a direction that is set in the mask', () => {
    const mask = (1 << N) | (1 << S);
    for (let r = 0; r < 20; r++) {
      const d = pickStep(mask, -1, r / 20);
      expect(d === N || d === S).toBe(true);
    }
  });
});

describe('liveliness setting — the single perf dial (default med)', () => {
  it('parses ?life=low|med|high, defaulting to med', () => {
    expect(parseLiveliness('?life=low')).toBe('low');
    expect(parseLiveliness('?life=high')).toBe('high');
    expect(parseLiveliness('?life=med')).toBe('med');
    expect(parseLiveliness('')).toBe('med');
    expect(parseLiveliness('?life=ludicrous')).toBe('med');
  });
  it('caps rise low → med → high and med is the recommended ship', () => {
    expect(LIVELINESS_CAPS.low.peds).toBeLessThan(LIVELINESS_CAPS.med.peds);
    expect(LIVELINESS_CAPS.med.peds).toBeLessThan(LIVELINESS_CAPS.high.peds);
    expect(LIVELINESS_CAPS.med).toEqual({ peds: 30, cars: 8 }); // the spec's recommended cap
  });
});
