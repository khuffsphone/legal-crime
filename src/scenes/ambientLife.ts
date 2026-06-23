// RTS-30 living-city Pass 1 — ambient PEDESTRIANS + CARS. Phaser-side (lives in /src/scenes); the
// pure graph build, the wander step, the object pool + the liveliness caps come from /src/sim. THE
// frame-budget test: N moving agents translating per frame. Everything here is pooled (pre-allocated at
// construction; activate/return, never allocate per spawn) and viewport-culled (only agents inside the
// camera view + a 1-tile margin are simulated; offscreen >2s are returned to the pool). LOD by zoom:
// MID halves the caps + freezes the pedestrian walk frames; FAR culls ALL moving life (the strategy
// zoom reads district washes, not specks) — so the most-tiles-in-frame zoom is the CHEAPEST for ambient.
//
// THE GOVERNING LAW: faction-neutral, muted, subordinate — the art (cityArt) is grey/brown, ~14–24px,
// no accent/glow/badge, so a pedestrian or taxi can never be mistaken for a 56px brass thug / red rival.

import Phaser from 'phaser';
import {
  buildCityGraph, pickStep, STEP_DIRS, depthValue,
  ISO_TILE_HALF_WIDTH, ISO_TILE_HALF_HEIGHT, Rng,
  type CityGraph, type LifeCaps, type WorldLayout,
} from '../sim';
import { TEX, PED_COATS, pedTexKey } from './cityArt';

const HW = ISO_TILE_HALF_WIDTH;  // 64
const HH = ISO_TILE_HALF_HEIGHT; // 32
const PED_SPEED = 0.42; // tiles/sec — ~⅓ the unit stroll (calm ambient pace)
const CAR_SPEED = 0.95; // tiles/sec — a touch faster than peds, still calm
// RTS-30c-scale: grow ambient life to real proportion against the ~56px unit (KEEP the unit, GROW the
// world). Ped ≈ 0.85× the unit (subordinate ~46px); ambient car ≈ a real car next to the man.
const PED_SCALE = 2.3;  // ~20px bake → ~46px
const CAR_SCALE = 2.8;  // ~14px bake → ~39px
const PED_FRAME_MS = 0.2; // walk-frame toggle cadence (seconds)
const OFFSCREEN_RETIRE = 2; // seconds offscreen before an agent is returned to the pool
const CULL_MARGIN = 160; // world px (~1 tile + a margin) around the viewport
const FAR_ZOOM = 0.45;  // < this ⇒ FAR LOD (cull all)
const MID_ZOOM = 0.8;   // < this (and ≥ FAR) ⇒ MID LOD (half caps, frozen ped frames)

interface Agent {
  sprite: Phaser.GameObjects.Image;
  isCar: boolean;
  gx: number; gy: number; // continuous grid position
  tx: number; ty: number; // current target tile
  dir: number;            // heading bit 0..3 (−1 = none yet)
  speed: number;
  pauseT: number;         // seconds remaining paused (window-shop / traffic beat)
  offT: number;           // seconds spent offscreen
  frameT: number;         // ped walk-frame timer
  frameB: boolean;        // which leg frame
  coat: number;           // ped coat variant index
}

/** A tiny generic pool, inlined here so the Phaser sprites live with their agent structs. Mirrors the
 * pure src/sim Pool (which is unit-tested); pre-allocates `cap` agents, activate/return with no alloc. */
class AgentPool {
  readonly capacity: number;
  private readonly free: Agent[] = [];
  private readonly live: Agent[] = [];
  constructor(cap: number, factory: () => Agent) {
    this.capacity = cap;
    for (let i = 0; i < cap; i++) this.free.push(factory());
  }
  acquire(): Agent | null { const o = this.free.pop(); if (!o) return null; this.live.push(o); return o; }
  release(o: Agent): void {
    const i = this.live.indexOf(o); if (i < 0) return;
    this.live[i] = this.live[this.live.length - 1]; this.live.pop(); this.free.push(o);
  }
  get active(): readonly Agent[] { return this.live; }
  get activeCount(): number { return this.live.length; }
}

export class AmbientLife {
  private readonly scene: Phaser.Scene;
  private readonly graph: CityGraph;
  private readonly rng: Rng;
  private readonly caps: LifeCaps;
  private readonly peds: AgentPool;
  private readonly cars: AgentPool;

  constructor(scene: Phaser.Scene, layout: WorldLayout, caps: LifeCaps, seed: number) {
    this.scene = scene;
    this.caps = caps;
    this.graph = buildCityGraph(layout);
    this.rng = new Rng((seed ^ 0x11fe) >>> 0);
    // pools pre-allocate ALL sprites up front (created before setupUiCamera, so the world/HUD camera
    // split already ignores them — same as the static dressing). Hidden until spawned.
    this.peds = new AgentPool(caps.peds, () => this.makeAgent(false));
    this.cars = new AgentPool(caps.cars, () => this.makeAgent(true));
  }

  private makeAgent(isCar: boolean): Agent {
    const sprite = this.scene.add.image(0, 0, isCar ? TEX.carLite : pedTexKey(0, false))
      .setOrigin(0.5, isCar ? 0.72 : 0.95).setScale(isCar ? CAR_SCALE : PED_SCALE).setVisible(false);
    return { sprite, isCar, gx: 0, gy: 0, tx: 0, ty: 0, dir: -1, speed: 0, pauseT: 0, offT: 0, frameT: 0, frameB: false, coat: 0 };
  }

  get pedCount(): number { return this.peds.activeCount; }
  get carCount(): number { return this.cars.activeCount; }

  /** Per-frame tick: LOD by zoom, then cull+simulate+top-up each pool. O(active), no allocation. */
  update(dt: number, cam: Phaser.Cameras.Scene2D.Camera): void {
    const zoom = cam.zoom;
    const far = zoom < FAR_ZOOM;
    const mid = !far && zoom < MID_ZOOM;
    const pedCap = far ? 0 : mid ? this.caps.peds >> 1 : this.caps.peds;
    const carCap = far ? 0 : mid ? this.caps.cars >> 1 : this.caps.cars;
    const v = cam.worldView;
    const minX = v.x - CULL_MARGIN, maxX = v.right + CULL_MARGIN, minY = v.y - CULL_MARGIN, maxY = v.bottom + CULL_MARGIN;
    this.stepPool(this.peds, pedCap, dt, minX, maxX, minY, maxY, false, mid);
    this.stepPool(this.cars, carCap, dt, minX, maxX, minY, maxY, true, mid);
  }

  private stepPool(
    pool: AgentPool, cap: number, dt: number,
    minX: number, maxX: number, minY: number, maxY: number, isCar: boolean, mid: boolean,
  ): void {
    const active = pool.active;
    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i];
      const sx = (a.gx - a.gy) * HW, sy = (a.gx + a.gy) * HH; // gridToScreen inlined (no Vec2 alloc)
      if (sx < minX || sx > maxX || sy < minY || sy > maxY) {
        a.offT += dt;
        if (a.offT > OFFSCREEN_RETIRE) { a.sprite.setVisible(false); pool.release(a); }
        continue; // frozen while offscreen — not simulated
      }
      a.offT = 0;
      this.simAgent(a, dt, isCar, mid, sx, sy);
    }
    // top up toward the cap (a few per frame so the city fills without a spawn burst)
    let budget = 3;
    while (pool.activeCount < cap && budget-- > 0) if (!this.spawn(pool, isCar, minX, maxX, minY, maxY)) break;
    // shed the tail when the cap drops (e.g. MID just halved it, or we eased back from CLOSE)
    while (pool.activeCount > cap) { const a = pool.active[pool.activeCount - 1]; a.sprite.setVisible(false); pool.release(a); }
  }

  private simAgent(a: Agent, dt: number, isCar: boolean, mid: boolean, sx: number, sy: number): void {
    const s = a.sprite;
    s.setVisible(true).setPosition(sx, sy).setDepth(depthValue(a.gx, a.gy) * 10 + (isCar ? 4 : 3));
    if (a.pauseT > 0) { a.pauseT -= dt; return; }
    const dx = a.tx - a.gx, dy = a.ty - a.gy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const step = a.speed * dt;
    if (dist <= step || dist < 1e-4) { a.gx = a.tx; a.gy = a.ty; this.advanceNode(a, isCar); }
    else { a.gx += (dx / dist) * step; a.gy += (dy / dist) * step; }
    if (isCar) s.setFlipX(a.dir === 3 || a.dir === 0); // approximate iso facing (W/N → flip)
    else if (!mid) { // MID freezes the walk frames (static dots); CLOSE animates the 2-frame leg tick
      a.frameT += dt;
      if (a.frameT > PED_FRAME_MS) { a.frameT = 0; a.frameB = !a.frameB; s.setTexture(pedTexKey(a.coat, a.frameB)); }
    }
  }

  private advanceNode(a: Agent, isCar: boolean): void {
    const size = this.graph.size;
    const gx = Math.round(a.gx), gy = Math.round(a.gy);
    if (gx < 0 || gy < 0 || gx >= size || gy >= size) { a.offT = OFFSCREEN_RETIRE + 1; return; }
    const ti = gy * size + gx;
    const adj = isCar ? this.graph.roadAdj[ti] : this.graph.sidewalkAdj[ti];
    const d = pickStep(adj, a.dir, this.rng.nextFloat());
    if (d < 0) { a.dir = -1; a.tx = gx; a.ty = gy; a.pauseT = isCar ? 0.6 : 1.4; return; } // dead-end beat
    const nx = gx + STEP_DIRS[d][0], ny = gy + STEP_DIRS[d][1];
    if (isCar && this.carAhead(nx, ny, a)) { a.pauseT = 0.35; return; } // spacing: hold if the lane's taken
    a.dir = d; a.tx = nx; a.ty = ny;
    if (!isCar && this.rng.nextFloat() < 0.06) a.pauseT = 1.5; // occasional window-shop pause
  }

  /** Light car spacing (no collision model): is another car already on / heading to this tile? */
  private carAhead(gx: number, gy: number, self: Agent): boolean {
    for (const o of this.cars.active) {
      if (o === self) continue;
      if (Math.round(o.tx) === gx && Math.round(o.ty) === gy) return true;
    }
    return false;
  }

  private spawn(pool: AgentPool, isCar: boolean, minX: number, maxX: number, minY: number, maxY: number): boolean {
    const nodes = isCar ? this.graph.roadNodes : this.graph.sidewalkNodes;
    if (nodes.length === 0) return false;
    const size = this.graph.size;
    for (let tries = 0; tries < 14; tries++) {
      const ti = nodes[(this.rng.nextFloat() * nodes.length) | 0];
      const gx = ti % size, gy = (ti / size) | 0;
      const sx = (gx - gy) * HW, sy = (gx + gy) * HH;
      if (sx < minX || sx > maxX || sy < minY || sy > maxY) continue; // within the cull ring only
      const a = pool.acquire();
      if (!a) return false;
      this.initAgent(a, gx, gy, isCar);
      return true;
    }
    return false;
  }

  private initAgent(a: Agent, gx: number, gy: number, isCar: boolean): void {
    a.gx = gx; a.gy = gy; a.tx = gx; a.ty = gy; a.dir = -1; a.offT = 0; a.pauseT = 0; a.frameT = 0; a.frameB = false;
    a.speed = isCar ? CAR_SPEED : PED_SPEED;
    const s = a.sprite;
    if (isCar) s.setTexture(this.rng.nextFloat() < 0.28 ? TEX.taxi : TEX.carLite).setOrigin(0.5, 0.72);
    else { a.coat = (this.rng.nextFloat() * PED_COATS.length) | 0; s.setTexture(pedTexKey(a.coat, false)).setOrigin(0.5, 0.95); }
    s.setVisible(true);
    this.advanceNode(a, isCar); // pick the first heading immediately
  }
}
