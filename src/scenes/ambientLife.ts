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
//
// CITIZEN LIFE P0 (behind ?citizens=1, default OFF): the ped side upgrades in place to DISTRICT-WEIGHTED
// citizen ROLES — the same pool/cull/LOD/fog, but spawn nodes are weighted by the ART DistrictArchetype
// density field, each ped is assigned a deterministic role (warm-neutral marker tone) with contextual
// loiter/windowShop states, and OPTIONAL debug occupation letters (?citizenletters=1). With ?citizens
// ABSENT, every citizen branch is skipped and this file behaves byte-identically to the ped/car layer.
// Pure citizen data + planner live in ./citizens (Phaser-free); marker bakes live in ./cityArt (R4).

import Phaser from 'phaser';
import {
  buildCityGraph, pickStep, STEP_DIRS, depthValue,
  ISO_TILE_HALF_WIDTH, ISO_TILE_HALF_HEIGHT, Rng,
  districtOfWorldTile, tileKindAt,
  type CityGraph, type LifeCaps, type WorldLayout,
} from '../sim';
import { TEX, PED_COATS, pedTexKey, ensureCitizenMarkers } from './cityArt';
import { ambientShown } from './fx';
import { districtIdentityFor } from './art/districtIdentity';
import {
  parseCitizensEnabled, parseCitizenLetters,
  buildDistrictArchetypeMap, spawnWeightsForNodes, cumulative, weightedIndex,
  roleForSlot, speedForRole, citizenRoll, RollSalt,
  citizenMarkerTexKey, CITIZEN_MARKER_SCALE, roleIndex, ROLE_LETTER,
  pauseChance, pauseStateFor, stateDuration, reactionCooldown, reactionFor,
  type CitizenRole, type CitizenState, type PauseContext, type CitizenEvent,
} from './citizens';

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
  // ── Citizen Life P0 (used only when ?citizens=1) ──
  slot: number;                 // stable pool index — a deterministic input for role/variant (spec §4.7)
  epoch?: number;               // the spawn-epoch this citizen was born in (its stable timing/react seed)
  role?: CitizenRole;           // assigned citizen role (marker tone + debug letter)
  state?: CitizenState;         // current behaviour state (walk/loiter/windowShop/queue/react/panic)
  reactCd?: number;             // seconds until this citizen may react again (spec §6.3 jitter)
  letterText?: Phaser.GameObjects.Text; // debug occupation letter overlay (?citizenletters=1)
}

/** A tiny generic pool, inlined here so the Phaser sprites live with their agent structs. Mirrors the
 * pure src/sim Pool (which is unit-tested); pre-allocates `cap` agents, activate/return with no alloc. */
class AgentPool {
  readonly capacity: number;
  private readonly free: Agent[] = [];
  private readonly live: Agent[] = [];
  constructor(cap: number, factory: (slot: number) => Agent) {
    this.capacity = cap;
    for (let i = 0; i < cap; i++) this.free.push(factory(i));
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

  // ── Citizen Life P0 state (only populated when citizensEnabled) ──
  private readonly citizensEnabled: boolean;
  private readonly citizenLetters: boolean;
  private readonly layout: WorldLayout;
  private readonly seed: number;
  /** Cumulative district-density weights over sidewalkNodes — the weighted spawn field (spec §4.6). Layout-
   * derived + rebuilt on reconstruction (this whole object is rebuilt at IsoScene:create → no stale cache). */
  private readonly spawnCum?: Float64Array;
  /** Monotonic spawn counter — a deterministic input so successive citizens in a slot vary (spec §4.7). */
  private spawnEpoch = 0;

  constructor(scene: Phaser.Scene, layout: WorldLayout, caps: LifeCaps, seed: number) {
    this.scene = scene;
    this.caps = caps;
    this.layout = layout;
    this.seed = seed >>> 0;
    this.graph = buildCityGraph(layout);
    this.rng = new Rng((seed ^ 0x11fe) >>> 0);

    const search = typeof window !== 'undefined' ? (window.location?.search ?? '') : '';
    this.citizensEnabled = parseCitizensEnabled(search); // Rider R2: parsed HERE — IsoScene needs zero changes
    this.citizenLetters = parseCitizenLetters(search);
    if (this.citizensEnabled) {
      ensureCitizenMarkers(scene); // R4 warm-neutral marker bakes (lazy — flag-off boot never bakes)
      const archMap = buildDistrictArchetypeMap(layout);
      this.spawnCum = cumulative(spawnWeightsForNodes(layout, archMap, this.graph.sidewalkNodes));
    }

    // pools pre-allocate ALL sprites up front (created before setupUiCamera, so the world/HUD camera
    // split already ignores them — same as the static dressing). Hidden until spawned.
    this.peds = new AgentPool(caps.peds, (slot) => this.makeAgent(false, slot));
    this.cars = new AgentPool(caps.cars, (slot) => this.makeAgent(true, slot));
  }

  private makeAgent(isCar: boolean, slot: number): Agent {
    const tex = isCar ? TEX.carLite : (this.citizensEnabled ? citizenMarkerTexKey(0, false) : pedTexKey(0, false));
    const scale = isCar ? CAR_SCALE : (this.citizensEnabled ? CITIZEN_MARKER_SCALE : PED_SCALE);
    const originY = isCar ? 0.72 : (this.citizensEnabled ? 0.9 : 0.95);
    const sprite = this.scene.add.image(0, 0, tex).setOrigin(0.5, originY).setScale(scale).setVisible(false);
    const agent: Agent = { sprite, isCar, gx: 0, gy: 0, tx: 0, ty: 0, dir: -1, speed: 0, pauseT: 0, offT: 0, frameT: 0, frameB: false, coat: 0, slot };
    // Debug occupation letter (?citizens=1 + ?citizenletters=1) — a pooled world-camera Text created ONCE per
    // ped, hidden until the ped is a visible citizen. Never production UI (spec §11.3).
    if (this.citizensEnabled && this.citizenLetters && !isCar) {
      agent.letterText = this.scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '10px', color: '#e8e2d4' })
        .setOrigin(0.5, 1).setVisible(false).setDepth(1_000_000);
    }
    return agent;
  }

  get pedCount(): number { return this.peds.activeCount; }
  get carCount(): number { return this.cars.activeCount; }

  /** Per-frame tick: LOD by zoom, then cull+simulate+top-up each pool. O(active), no allocation. */
  // RTS-34 — the fog-gate predicate for this frame: an agent is only drawn on a revealed tile.
  private reveal?: (gx: number, gy: number) => boolean;
  // Citizen Life P0 (Rider R3): OPTIONAL visible-crime events for citizen reactions. IsoScene passes NONE
  // today (its update call is (dt, cam, reveal)), so reactions stay dormant — feeding this is the serialized
  // T13 wire-up. When present, each event's `visible` must already be the fog verdict (NO-X-RAY).
  private events?: readonly CitizenEvent[];

  update(dt: number, cam: Phaser.Cameras.Scene2D.Camera, reveal?: (gx: number, gy: number) => boolean, events?: readonly CitizenEvent[]): void {
    this.reveal = reveal;
    this.events = events;
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
        if (a.offT > OFFSCREEN_RETIRE) { a.sprite.setVisible(false); if (a.letterText) a.letterText.setVisible(false); pool.release(a); }
        continue; // frozen while offscreen — not simulated
      }
      a.offT = 0;
      this.simAgent(a, dt, isCar, mid, sx, sy);
    }
    // top up toward the cap (a few per frame so the city fills without a spawn burst)
    let budget = 3;
    while (pool.activeCount < cap && budget-- > 0) if (!this.spawn(pool, isCar, minX, maxX, minY, maxY)) break;
    // shed the tail when the cap drops (e.g. MID just halved it, or we eased back from CLOSE)
    while (pool.activeCount > cap) { const a = pool.active[pool.activeCount - 1]; a.sprite.setVisible(false); if (a.letterText) a.letterText.setVisible(false); pool.release(a); }
  }

  private simAgent(a: Agent, dt: number, isCar: boolean, mid: boolean, sx: number, sy: number): void {
    const s = a.sprite;
    // RTS-34: fog-gate — keep simulating the agent's path, but only DRAW it on a revealed tile (no
    // peds/cars showing through the fog of war).
    const shown = ambientShown(this.reveal, a.gx, a.gy);
    s.setVisible(shown).setPosition(sx, sy).setDepth(depthValue(a.gx, a.gy) * 10 + (isCar ? 4 : 3));
    if (a.letterText) { a.letterText.setVisible(shown).setPosition(sx, sy - 20); }
    // Citizen reaction (Rider R3): dormant unless events are fed. Visible-only + NO-X-RAY handled in reactionFor.
    if (this.citizensEnabled && !isCar) this.tickCitizenReaction(a, dt);
    if (a.pauseT > 0) { a.pauseT -= dt; return; }
    const dx = a.tx - a.gx, dy = a.ty - a.gy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const step = a.speed * dt;
    if (dist <= step || dist < 1e-4) { a.gx = a.tx; a.gy = a.ty; this.advanceNode(a, isCar); }
    else { a.gx += (dx / dist) * step; a.gy += (dy / dist) * step; }
    if (isCar) s.setFlipX(a.dir === 3 || a.dir === 0); // approximate iso facing (W/N → flip)
    else if (this.citizensEnabled) { if (a.state !== 'walk' && a.pauseT <= 0) a.state = 'walk'; } // markers: no leg tick
    else if (!mid) { // MID freezes the walk frames (static dots); CLOSE animates the 2-frame leg tick
      a.frameT += dt;
      if (a.frameT > PED_FRAME_MS) { a.frameT = 0; a.frameB = !a.frameB; s.setTexture(pedTexKey(a.coat, a.frameB)); }
    }
  }

  /** Citizen visible-crime reaction (spec §7 / Rider R3). DORMANT while no events are fed (IsoScene's update
   * call passes none). Visual-only: a brief pause — NEVER writes heat/federal/economy/GameState. The panic
   * FLEE (away-biased pickStep + the tested panicSpeed cap, spec §6.2) is part of the serialized T10 wire-up
   * that also feeds the events; the MVP dormant stub reacts as a pause so it can never mutate movement speed. */
  private tickCitizenReaction(a: Agent, dt: number): void {
    if (a.reactCd && a.reactCd > 0) a.reactCd -= dt;
    const events = this.events;
    if (!events || events.length === 0) return;
    if (a.reactCd && a.reactCd > 0) return;
    const epoch = a.epoch ?? this.spawnEpoch;
    const roll = citizenRoll(this.seed, a.slot, Math.round(a.gx) * 131 + Math.round(a.gy), epoch, RollSalt.React);
    const r = reactionFor(events, a.gx, a.gy, roll);
    if (r.kind === 'none') return;
    a.reactCd = reactionCooldown(roll);
    a.state = r.kind === 'panic' ? 'panic' : 'react';
    a.pauseT = stateDuration('react', roll);
  }

  private advanceNode(a: Agent, isCar: boolean): void {
    const size = this.graph.size;
    const gx = Math.round(a.gx), gy = Math.round(a.gy);
    if (gx < 0 || gy < 0 || gx >= size || gy >= size) { a.offT = OFFSCREEN_RETIRE + 1; return; }
    const ti = gy * size + gx;
    const adj = isCar ? this.graph.roadAdj[ti] : this.graph.sidewalkAdj[ti]; // citizens: sidewalkAdj ONLY (T3)
    const d = pickStep(adj, a.dir, this.rng.nextFloat());
    if (d < 0) { a.dir = -1; a.tx = gx; a.ty = gy; a.pauseT = isCar ? 0.6 : 1.4; return; } // dead-end beat
    const nx = gx + STEP_DIRS[d][0], ny = gy + STEP_DIRS[d][1];
    if (isCar && this.carAhead(nx, ny, a)) { a.pauseT = 0.35; return; } // spacing: hold if the lane's taken
    a.dir = d; a.tx = nx; a.ty = ny;
    if (isCar) return;
    if (this.citizensEnabled) this.rollCitizenPause(a, gx, gy);            // contextual loiter/windowShop (T4/T9)
    else if (this.rng.nextFloat() < 0.06) a.pauseT = 1.5;                  // legacy: occasional window-shop pause
  }

  /** Roll a contextual pause for a citizen at (gx,gy) — plaza→loiter, frontage→windowShop, else generic
   * loiter (spec §6.3 pause chances + §6.2 durations). Deterministic per (seed, slot, tile, epoch). */
  private rollCitizenPause(a: Agent, gx: number, gy: number): void {
    const ctx = this.contextAt(gx, gy);
    const epoch = a.epoch ?? this.spawnEpoch;
    const rollP = citizenRoll(this.seed, a.slot, gx * 131 + gy, epoch, RollSalt.Timing);
    if (rollP >= pauseChance(ctx)) return;
    const st = pauseStateFor(ctx);
    const rollD = citizenRoll(this.seed, a.slot, gx * 131 + gy + 7, epoch, RollSalt.Timing);
    a.state = st;
    a.pauseT = stateDuration(st, rollD);
  }

  /** The local pause CONTEXT from cheap worldgen tile heuristics (no PR#62 zones on this branch). Pure read. */
  private contextAt(gx: number, gy: number): PauseContext {
    const near = (k: string): boolean =>
      tileKindAt(this.layout, gx + 1, gy) === k || tileKindAt(this.layout, gx - 1, gy) === k ||
      tileKindAt(this.layout, gx, gy + 1) === k || tileKindAt(this.layout, gx, gy - 1) === k;
    if (near('building')) return 'frontage';
    if (near('park') || near('plaza')) return 'plaza';
    return 'generic';
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
    const weighted = !isCar && this.citizensEnabled && this.spawnCum !== undefined;
    for (let tries = 0; tries < 14; tries++) {
      // citizens: sample a spawn node WEIGHTED by district density (spec §4.6); else uniform.
      const idx = weighted ? weightedIndex(this.spawnCum!, this.rng.nextFloat()) : (this.rng.nextFloat() * nodes.length) | 0;
      if (idx < 0) return false;
      const ti = nodes[idx];
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
    const s = a.sprite;
    if (isCar) {
      a.speed = CAR_SPEED;
      s.setTexture(this.rng.nextFloat() < 0.28 ? TEX.taxi : TEX.carLite).setOrigin(0.5, 0.72);
    } else if (this.citizensEnabled) {
      this.spawnEpoch++;
      a.epoch = this.spawnEpoch;
      const ordinal = this.ordinalAt(gx, gy);
      const archetype = districtIdentityFor(ordinal).archetype;
      const role = roleForSlot(this.seed, ordinal, a.slot, a.epoch, archetype);
      a.role = role;
      a.state = 'walk';
      a.reactCd = 0;
      a.speed = speedForRole(role, citizenRoll(this.seed, ordinal, a.slot, a.epoch, RollSalt.Speed));
      s.setTexture(citizenMarkerTexKey(roleIndex(role), false)).setOrigin(0.5, 0.9);
      if (a.letterText) a.letterText.setText(ROLE_LETTER[role]).setVisible(false);
    } else {
      a.speed = PED_SPEED;
      a.coat = (this.rng.nextFloat() * PED_COATS.length) | 0;
      s.setTexture(pedTexKey(a.coat, false)).setOrigin(0.5, 0.95);
    }
    s.setVisible(true);
    this.advanceNode(a, isCar); // pick the first heading immediately
  }

  /** The district ordinal (index in layout.districts) covering a tile — the ART-archetype key (recon §11
   * flag 1). Falls back to 0 off-map. */
  private ordinalAt(gx: number, gy: number): number {
    const id = districtOfWorldTile(this.layout, gx, gy);
    if (!id) return 0;
    const i = this.layout.districts.findIndex((d) => d.id === id);
    return i < 0 ? 0 : i;
  }
}
