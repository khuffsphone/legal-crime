// RTS-1/2/3 — isometric world scene. Renders a 2:1 dimetric tile map (placeholder diamonds;
// real art arrives in RTS-7) with depth-sorting, a pannable/zoomable camera, real-time spatial
// units (RTS-2), and the selection & command control layer (RTS-3). Rendering + input only —
// all projection/movement/selection logic is the pure /src/sim modules; no game rules here.

import Phaser from 'phaser';
import {
  gridToScreen,
  screenToGrid,
  screenToTile,
  tileCorners,
  depthValue,
  ISO_TILE_HALF_HEIGHT,
  ISO_TILE_HEIGHT,
  makeGrid,
  spawnUnit,
  spawnEnforcer,
  issueMove,
  unitTile,
  unitScreenPos,
  pickUnit,
  resolveMoveCommand,
  isCommandableTile,
  emptySelection,
  selectOnly,
  toggleSelection,
  clearSelection,
  isSelected,
  createInitialState,
  updateAndObserve as observeWorld,
  harvestIncidents,
  recentIncidents,
  buildMapLayout,
  startCollectorRun,
  processCollectorArrivals,
  hqTileOf,
  laidOutBusinessIds,
  businessTileOf,
  realtimeHudView,
  collectorCarryView,
  threatenedCollectors,
  anyCollectorInDanger,
  type GameState,
  type MapLayout,
  type Selection,
  type NavGrid,
  type MovableUnit,
  type ThreatView,
  type InterceptionEvent,
  type IncidentRecord,
  type IncidentSeverity,
} from '../sim';
import { NOIR_PALETTE, NOIR_FONT, heatLabel, federalWarningLabel, shockFlavor } from './theme';
import {
  ISO_ASSET_MANIFEST,
  allIsoAssetKeys,
  isoAssetUrl,
  resolveIsoSprite,
  isoUnitKeyForRole,
} from './isoAssets';
import type { ShockKind } from '../sim';

const COLS = 16;
const ROWS = 16;
const PAN_SPEED = 600; // px/sec for keyboard panning (in world units)
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;
const CLICK_SLOP = 6; // px of pointer travel under which a press counts as a click, not a drag

function hex(c: string): number {
  return Number.parseInt(c.replace('#', ''), 16);
}

/** A placeholder "building" block to demonstrate correct depth layering. */
interface Block {
  gx: number;
  gy: number;
  height: number;
  color: string;
}

// The demo building footprints — also the blocked tiles units must route around (RTS-2/3).
const BLOCKS: Block[] = [
  { gx: 3, gy: 3, height: 48, color: NOIR_PALETTE.brass },
  { gx: 4, gy: 3, height: 80, color: NOIR_PALETTE.blood },
  { gx: 3, gy: 4, height: 64, color: NOIR_PALETTE.charcoal },
  { gx: 8, gy: 9, height: 96, color: NOIR_PALETTE.brass },
  { gx: 9, gy: 9, height: 40, color: NOIR_PALETTE.charcoal },
];

/** A unit and its render objects: a selection ring (ground) + a token marker, plus optional
 * collector-only legibility props (a cash tag that follows it, a danger ring when threatened). */
interface UnitView {
  unit: MovableUnit;
  ring: Phaser.GameObjects.Ellipse;
  marker: Phaser.GameObjects.Container;
  cashTag?: Phaser.GameObjects.Text;
  dangerRing?: Phaser.GameObjects.Ellipse;
}

export class IsoScene extends Phaser.Scene {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private navGrid!: NavGrid;
  private state!: GameState;
  private layout!: MapLayout;
  private units: UnitView[] = [];
  private selection: Selection = emptySelection();
  private pressX = 0;
  private pressY = 0;
  private statusText?: Phaser.GameObjects.Text;
  private hudPanel?: Phaser.GameObjects.Text;
  private warningBanner?: Phaser.GameObjects.Text;
  private robbedCollectors = new Set<string>();
  private collectorId?: string;
  private feedTitle?: Phaser.GameObjects.Text;
  private feedLines: Phaser.GameObjects.Text[] = [];
  private feedVisible = true;

  private loadedIso: Set<string> = new Set();

  constructor() {
    super('IsoScene');
  }

  /** RTS-7: attempt to load every iso texture. Missing files fire 'loaderror' and are simply
   * skipped — the scene falls back to placeholders, so it always renders. */
  preload(): void {
    this.load.on('loaderror', () => { /* missing art is expected; placeholder will cover it */ });
    for (const def of ISO_ASSET_MANIFEST) {
      this.load.image(def.key, isoAssetUrl(def));
    }
  }

  create(): void {
    const cam = this.cameras.main;
    cam.setBackgroundColor(NOIR_PALETTE.ink);

    // Which iso textures actually loaded — drives the sprite-vs-placeholder choice (RTS-7).
    this.loadedIso = new Set(allIsoAssetKeys().filter((k) => this.textures.exists(k)));

    this.drawGround();
    this.drawBlocks(BLOCKS);

    // Buildings are impassable; units (RTS-2) pathfind around them on this nav grid.
    this.navGrid = makeGrid(COLS, ROWS, BLOCKS.map((b) => ({ gx: b.gx, gy: b.gy })));
    // The real-time world: units live on state.units and are advanced by advanceWorld (update).
    this.state = createInitialState(1);
    this.layout = buildMapLayout(this.state, COLS, ROWS);
    this.drawEconomy(); // businesses + HQs on tiles (RTS-5)
    this.spawnUnits();

    const mid = gridToScreen((COLS - 1) / 2, (ROWS - 1) / 2);
    cam.centerOn(mid.x, mid.y);

    this.setupCameraControls();
    this.setupSelectionInput();
    this.drawHud();
  }

  // ── economy on the map (RTS-5) ───────────────────────────────────────────────────────────

  private drawEconomy(): void {
    // HQ / collection houses.
    for (const fid of ['player', 'rival-a', 'rival-b']) {
      const hq = hqTileOf(this.layout, fid);
      if (!hq) continue;
      const s = gridToScreen(hq.gx, hq.gy);
      const color = fid === 'player' ? NOIR_PALETTE.brass : NOIR_PALETTE.blood;
      this.add.star(s.x, s.y - 14, 5, 7, 15, hex(color), 1)
        .setStrokeStyle(2, hex(NOIR_PALETTE.bone), 0.9)
        .setDepth(depthValue(hq.gx, hq.gy) * 10 + 6);
      this.add.text(s.x, s.y - 34, fid === 'player' ? 'HQ' : 'HQ', {
        fontFamily: NOIR_FONT, fontSize: '10px', color: NOIR_PALETTE.bone,
      }).setOrigin(0.5, 1).setDepth(depthValue(hq.gx, hq.gy) * 10 + 6);
    }
    // Business storefront dots.
    for (const bid of laidOutBusinessIds(this.layout)) {
      const t = businessTileOf(this.layout, bid)!;
      const s = gridToScreen(t.gx, t.gy);
      this.add.rectangle(s.x, s.y - 6, 12, 12, hex(NOIR_PALETTE.fog), 0.85)
        .setStrokeStyle(1, hex(NOIR_PALETTE.brass), 0.8)
        .setDepth(depthValue(t.gx, t.gy) * 10 + 4);
    }
  }

  // ── units (RTS-2 movement + RTS-3 selection + RTS-4 interception markers) ─────────────────

  private spawnUnits(): void {
    // Player muscle (selectable, no faction conflict among themselves).
    const roster: Array<{ id: string; gx: number; gy: number; color: string }> = [
      { id: 'muscle-1', gx: 6, gy: 1, color: NOIR_PALETTE.blood },
      { id: 'muscle-2', gx: 7, gy: 1, color: NOIR_PALETTE.bone },
    ];
    for (const r of roster) this.addUnit(spawnUnit(r.id, r.gx, r.gy), r.color);

    // RTS-5 collector run + RTS-4 ambush: the player extorts a front, takings pile up, and a
    // real collector spawns there and walks to HQ — while a rival enforcer hunts it en route.
    const front = this.state.districts[0].businesses[0];
    front.extortedBy = 'player';
    front.uncollected = 600;
    const run = startCollectorRun(this.state, this.layout, 'player', 'district-0', this.navGrid);
    if (run.unit) {
      this.collectorId = run.unit.id;
      this.attachMarker(run.unit, NOIR_PALETTE.brass);
    }
    this.addUnit(spawnEnforcer('rival-gun', 14, 1, 'rival-a', 2.4), NOIR_PALETTE.blood);
  }

  /** Push a freshly-built unit onto the world and give it a marker. */
  private addUnit(unit: MovableUnit, color: string): void {
    this.state.units.push(unit);
    this.attachMarker(unit, color);
  }

  /** Give an existing world unit (already on state.units) a selection ring + token marker, and
   * for collectors the RTS-8 legibility props: a cash tag that follows it and a danger ring. */
  private attachMarker(unit: MovableUnit, color: string): void {
    const ring = this.add
      .ellipse(0, 4, 30, 16)
      .setStrokeStyle(2, hex(NOIR_PALETTE.brass), 1)
      .setVisible(false);
    const view: UnitView = { unit, ring, marker: this.makeMarker(color, unit.id, isoUnitKeyForRole(unit.role)) };
    if (unit.role === 'collector') {
      view.dangerRing = this.add
        .ellipse(0, 4, 40, 22)
        .setStrokeStyle(3, hex(NOIR_PALETTE.blood), 1)
        .setVisible(false);
      view.cashTag = this.add
        .text(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.brass, fontStyle: 'bold' })
        .setOrigin(0.5, 1)
        .setVisible(false);
    }
    this.units.push(view);
  }

  /** A unit marker: a real iso sprite (RTS-7, bottom-center) when its texture loaded, otherwise
   * a disc token. Either way a drop shadow + id label sit with it. */
  private makeMarker(color: string, label: string, spriteKey: string): Phaser.GameObjects.Container {
    const shadow = this.add.ellipse(0, 4, 26, 13, hex(NOIR_PALETTE.ink), 0.45);
    const res = resolveIsoSprite(spriteKey, this.loadedIso);
    const body: Phaser.GameObjects.GameObject = res.kind === 'sprite'
      ? this.add.image(0, 2, res.key).setOrigin(0.5, 1)
      : this.add.circle(0, -10, 9, hex(color), 1).setStrokeStyle(2, hex(NOIR_PALETTE.bone), 0.9);
    const tag = this.add
      .text(0, -30, label, { fontFamily: NOIR_FONT, fontSize: '11px', color: NOIR_PALETTE.bone })
      .setOrigin(0.5, 1);
    return this.add.container(0, 0, [shadow, body, tag]);
  }

  private updateUnits(dt: number): void {
    // The rival enforcer hunts the collector: re-path toward it while it still carries a take.
    const collector = this.collectorId ? this.state.units.find((u) => u.id === this.collectorId) : undefined;
    const gun = this.state.units.find((u) => u.id === 'rival-gun');
    if (collector && gun && (collector.carrying ?? 0) > 0) {
      issueMove(gun, unitTile(collector), this.navGrid);
    }

    // Advance the whole real-time world (movement + interception + week clock) AND observe it
    // into the incident ledger (RTS-9). updateAndObserve returns a new state — reassign it.
    const obs = observeWorld(this.state, dt);
    this.state = obs.state;
    const res = obs.result;
    for (const ev of res.interceptions) this.flashAmbush(ev);
    // RTS-5: bank any collector that reached its HQ this frame, then harvest those deposit logs.
    for (const dep of processCollectorArrivals(this.state, this.layout)) {
      this.flashDeposit(dep.collectorId, dep.banked);
    }
    this.state = harvestIncidents(this.state);

    // RTS-8 legibility/tension: which carrying collectors are threatened, by id.
    const threats = new Map<string, ThreatView>(
      threatenedCollectors(this.state).map((t) => [t.collectorId, t]),
    );
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(this.time.now / 200)); // 0.1..1 throb

    for (const v of this.units) {
      const s = unitScreenPos(v.unit);
      const t = v.unit.pos;
      const depth = depthValue(Math.round(t.gx), Math.round(t.gy)) * 10 + 8;
      v.marker.setPosition(s.x, s.y).setDepth(depth);

      const selected = isSelected(this.selection, v.unit.id);
      v.ring.setPosition(s.x, s.y + 4).setDepth(depth - 1).setVisible(selected);
      if (selected) v.ring.setAlpha(pulse); // RTS-8: selected units throb so the command reads

      // RTS-8 collector legibility: a cash tag follows a carrying collector; a danger ring throbs
      // (amber when an enforcer is approaching, blood-red when an ambush is imminent).
      if (v.cashTag && v.dangerRing) {
        const carry = collectorCarryView(v.unit);
        v.cashTag.setVisible(carry.vulnerable).setPosition(s.x, s.y - 42).setDepth(depth + 1);
        if (carry.vulnerable) v.cashTag.setText(`$${carry.carrying}`);

        const threat = carry.vulnerable ? threats.get(v.unit.id) : undefined;
        if (threat) {
          const danger = threat.level === 'ambush' ? NOIR_PALETTE.blood : NOIR_PALETTE.brass;
          v.dangerRing.setStrokeStyle(3, hex(danger), pulse)
            .setPosition(s.x, s.y + 4).setDepth(depth - 1).setVisible(true);
          v.cashTag.setColor(danger);
        } else {
          v.dangerRing.setVisible(false);
          v.cashTag.setColor(NOIR_PALETTE.brass);
        }
      }
    }
  }

  /** Render the ambush as a real beat: an expanding shock ring, a camera shake, and the stolen
   * amount called out over the robbed collector (RTS-8 presentation of the RTS-4 event). */
  private flashAmbush(ev: InterceptionEvent): void {
    if (this.robbedCollectors.has(ev.collectorId)) return;
    this.robbedCollectors.add(ev.collectorId);
    const v = this.units.find((u) => u.unit.id === ev.collectorId);
    if (!v) return;
    const s = unitScreenPos(v.unit);

    // Expanding shock ring.
    const burst = this.add.circle(s.x, s.y - 6, 8).setStrokeStyle(4, hex(NOIR_PALETTE.blood), 1).setDepth(100001);
    this.tweens.add({ targets: burst, scale: 6, alpha: 0, duration: 600, onComplete: () => burst.destroy() });
    this.cameras.main.shake(220, 0.004);

    const flash = this.add
      .text(s.x, s.y - 48, `— ROBBED  $${ev.amount} —`, {
        fontFamily: NOIR_FONT, fontSize: '17px', color: NOIR_PALETTE.blood, fontStyle: 'bold',
      })
      .setOrigin(0.5, 1)
      .setDepth(100002);
    this.tweens.add({ targets: flash, y: s.y - 92, alpha: 0, duration: 1800, onComplete: () => flash.destroy() });
    if (v.cashTag) v.cashTag.setVisible(false);
    if (v.dangerRing) v.dangerRing.setVisible(false);
    this.refreshStatus(`collector ambushed — $${ev.amount} gone to ${ev.attackerFaction}`);
  }

  /** Render a safe deposit: a brass flash over the collector that banked its take (RTS-5). */
  private flashDeposit(collectorId: string, banked: number): void {
    const v = this.units.find((u) => u.unit.id === collectorId);
    if (!v) return;
    const s = unitScreenPos(v.unit);
    const flash = this.add
      .text(s.x, s.y - 44, `+ $${banked} BANKED`, {
        fontFamily: NOIR_FONT, fontSize: '15px', color: NOIR_PALETTE.brass, fontStyle: 'bold',
      })
      .setOrigin(0.5, 1)
      .setDepth(100001);
    this.tweens.add({ targets: flash, y: s.y - 80, alpha: 0, duration: 1600, onComplete: () => flash.destroy() });
    this.refreshStatus(`collector reached HQ — banked $${banked}`);
  }

  // ── selection & command (RTS-3) ──────────────────────────────────────────────────────────

  private setupSelectionInput(): void {
    this.input.mouse?.disableContextMenu(); // so right-click can be a move command

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.pressX = p.x;
      this.pressY = p.y;
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const travel = Math.hypot(p.x - this.pressX, p.y - this.pressY);
      if (travel > CLICK_SLOP) return; // it was a drag (camera pan), not a click
      const shift = !!(p.event as MouseEvent | undefined)?.shiftKey;
      if (p.rightButtonReleased()) this.commandMove(p);
      else this.commandSelect(p, shift);
    });
  }

  private commandSelect(p: Phaser.Input.Pointer, shift: boolean): void {
    const point = screenToGrid(p.worldX, p.worldY);
    const hit = pickUnit(this.units.map((v) => v.unit), point);
    if (!hit) {
      if (!shift) this.selection = clearSelection();
    } else if (shift) {
      this.selection = toggleSelection(this.selection, hit.id);
    } else {
      this.selection = selectOnly(hit.id);
    }
    this.refreshStatus();
  }

  private commandMove(p: Phaser.Input.Pointer): void {
    if (this.selection.ids.length === 0) return;
    const target = screenToTile(p.worldX, p.worldY);
    if (!isCommandableTile(target, this.navGrid)) {
      this.drawTargetMarker(target, false); // RTS-8: an invalid target reads as a rejected click
      return;
    }
    const res = resolveMoveCommand(this.units.map((v) => v.unit), this.selection.ids, target, this.navGrid);
    this.drawTargetMarker(target, res.moved.length > 0);
    this.refreshStatus(`moving ${res.moved.length} → (${target.gx},${target.gy})` +
      (res.failed.length ? ` · ${res.failed.length} blocked` : ''));
  }

  /** RTS-8 command feedback: a brief marker at the clicked tile so the player sees the command
   * register — a brass diamond on a valid move, a blood X on a rejected one. */
  private drawTargetMarker(tile: { gx: number; gy: number }, ok: boolean): void {
    const c = gridToScreen(tile.gx, tile.gy);
    const color = ok ? NOIR_PALETTE.brass : NOIR_PALETTE.blood;
    const corners = tileCorners(tile.gx, tile.gy).map((pt) => ({ x: pt.x - c.x, y: pt.y - c.y }));
    const mark = this.add
      .polygon(c.x, c.y, corners)
      .setStrokeStyle(3, hex(color), 1)
      .setDepth(depthValue(tile.gx, tile.gy) * 10 + 9);
    this.tweens.add({ targets: mark, scale: ok ? 0.4 : 1, alpha: 0, duration: 650, onComplete: () => mark.destroy() });
  }

  // ── map ────────────────────────────────────────────────────────────────────────────────

  private drawGround(): void {
    for (let gx = 0; gx < COLS; gx++) {
      for (let gy = 0; gy < ROWS; gy++) {
        const c = gridToScreen(gx, gy);
        const depth = depthValue(gx, gy) * 10;
        const key = (gx + gy) % 2 === 0 ? 'LCR_iso_tile_cobble' : 'LCR_iso_tile_street';
        const res = resolveIsoSprite(key, this.loadedIso);
        if (res.kind === 'sprite') {
          this.add.image(c.x, c.y, key).setOrigin(0.5, 0.5).setDisplaySize(128, 64).setDepth(depth);
          continue;
        }
        // Placeholder: the diamond polygon (RTS-1 look) until real tile art is dropped in.
        const corners = tileCorners(gx, gy);
        const pts = corners.map((pt) => ({ x: pt.x - c.x, y: pt.y - c.y }));
        this.add
          .polygon(c.x, c.y, pts, hex(res.color), 1)
          .setStrokeStyle(1, hex(NOIR_PALETTE.fog), 0.25)
          .setDepth(depth);
      }
    }
  }

  private drawBlocks(blocks: Block[]): void {
    for (const b of blocks) {
      const c = gridToScreen(b.gx, b.gy);
      const d0 = depthValue(b.gx, b.gy) * 10 + 5;
      // RTS-7: a real building sprite (bottom-center at the tile) replaces the placeholder box.
      const res = resolveIsoSprite('LCR_iso_bldg_warehouse', this.loadedIso);
      if (res.kind === 'sprite') {
        this.add.image(c.x, c.y, res.key).setOrigin(0.5, 1).setDepth(d0);
        continue;
      }
      const corners = tileCorners(b.gx, b.gy).map((p) => ({ x: p.x - c.x, y: p.y - c.y }));

      const top = corners; // [top,right,bottom,left] of the tile diamond
      const right = [top[1], top[2], { x: top[2].x, y: top[2].y - b.height }, { x: top[1].x, y: top[1].y - b.height }];
      const left = [top[3], top[2], { x: top[2].x, y: top[2].y - b.height }, { x: top[3].x, y: top[3].y - b.height }];
      const cap = top.map((p) => ({ x: p.x, y: p.y - b.height }));

      const d = depthValue(b.gx, b.gy) * 10 + 5; // above its own ground tile
      this.add.polygon(c.x, c.y, left, hex(NOIR_PALETTE.ink), 1).setStrokeStyle(1, hex(NOIR_PALETTE.fog), 0.3).setDepth(d);
      this.add.polygon(c.x, c.y, right, hex(NOIR_PALETTE.charcoal), 1).setStrokeStyle(1, hex(NOIR_PALETTE.fog), 0.3).setDepth(d);
      this.add.polygon(c.x, c.y, cap, hex(b.color), 1).setStrokeStyle(1, hex(NOIR_PALETTE.brass), 0.5).setDepth(d);
    }
  }

  // ── camera ───────────────────────────────────────────────────────────────────────────

  private setupCameraControls(): void {
    const cam = this.cameras.main;
    this.cursors = this.input.keyboard?.createCursorKeys();

    // Drag to pan (any button). The click/drag split in selection input ignores drags.
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) {
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      }
    });

    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const z = Phaser.Math.Clamp(cam.zoom - dy * 0.001, MIN_ZOOM, MAX_ZOOM);
      cam.setZoom(z);
    });

    this.input.keyboard?.on('keydown-B', () => this.scene.start('BootScene'));
    this.input.keyboard?.on('keydown-L', () => this.toggleFeed()); // RTS-9: toggle incident feed
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.updateUnits(dt);
    this.refreshHud();
    this.refreshIncidentFeed();

    const cam = this.cameras.main;
    const k = this.cursors;
    if (!k) return;
    const step = (PAN_SPEED * delta) / 1000 / cam.zoom;
    if (k.left.isDown) cam.scrollX -= step;
    if (k.right.isDown) cam.scrollX += step;
    if (k.up.isDown) cam.scrollY -= step;
    if (k.down.isDown) cam.scrollY += step;
  }

  // ── hud (screen-fixed) ─────────────────────────────────────────────────────────────────

  private drawHud(): void {
    const t = this.add.text(
      12,
      12,
      `LEGAL CRIME — Isometric (2:1, ${ISO_TILE_HEIGHT * 2}×${ISO_TILE_HEIGHT} tiles)\n` +
        'left-click = select (shift = add) · right-click = move · drag = pan · wheel = zoom · [L] incidents · [B] card view',
      { fontFamily: NOIR_FONT, fontSize: '14px', color: NOIR_PALETTE.brass },
    );
    t.setScrollFactor(0).setDepth(100000);

    this.statusText = this.add
      .text(12, 54, 'nothing selected', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.bone })
      .setScrollFactor(0)
      .setDepth(100000);

    // RTS-6 real-time HUD: week countdown + player ledger + mutiny/shock lines, refreshed each
    // frame from the pure realtimeHudView selector.
    this.hudPanel = this.add
      .text(12, 80, '', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.fog })
      .setScrollFactor(0)
      .setDepth(100000);
    this.warningBanner = this.add
      .text(12, 0, '', {
        fontFamily: NOIR_FONT, fontSize: '15px', color: NOIR_PALETTE.blood, fontStyle: 'bold',
      })
      .setScrollFactor(0)
      .setDepth(100000)
      .setVisible(false);

    // RTS-9 incident feed (top-right, newest first, severity-coloured, toggle with [L]).
    this.feedTitle = this.add
      .text(0, 12, 'INCIDENTS  [L]', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.brass, fontStyle: 'bold' })
      .setScrollFactor(0)
      .setDepth(100000)
      .setOrigin(1, 0);
    for (let i = 0; i < 9; i++) {
      this.feedLines.push(
        this.add
          .text(0, 34 + i * 16, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.fog })
          .setScrollFactor(0)
          .setDepth(100000)
          .setOrigin(1, 0),
      );
    }
    void ISO_TILE_HALF_HEIGHT;
  }

  /** Toggle the incident feed (RTS-9) so it can be hidden to declutter the map. */
  private toggleFeed(): void {
    this.feedVisible = !this.feedVisible;
    this.feedTitle?.setVisible(this.feedVisible);
    for (const line of this.feedLines) line.setVisible(this.feedVisible);
  }

  private static feedColor(sev: IncidentSeverity): string {
    switch (sev) {
      case 'danger': return NOIR_PALETTE.blood;
      case 'warning': return NOIR_PALETTE.brass;
      case 'gain': return NOIR_PALETTE.bone;
      default: return NOIR_PALETTE.fog;
    }
  }

  /** Paint the recent incidents into the feed, newest first, coloured by severity (RTS-9). */
  private refreshIncidentFeed(): void {
    if (!this.feedVisible || this.feedLines.length === 0) return;
    const right = this.scale.width - 12;
    this.feedTitle?.setPosition(right, 12);
    const recent: IncidentRecord[] = recentIncidents(this.state, this.feedLines.length);
    for (let i = 0; i < this.feedLines.length; i++) {
      const line = this.feedLines[i];
      const rec = recent[i];
      line.setPosition(right, 34 + i * 16);
      if (!rec) { line.setText(''); continue; }
      const summary = rec.summary.length > 52 ? rec.summary.slice(0, 51) + '…' : rec.summary;
      line.setText(`[w${rec.week}] ${summary}`).setColor(IsoScene.feedColor(rec.severity));
    }
  }

  /** Pull the real-time HUD view-model and paint the week timer, ledger, and alerts (RTS-6),
   * with RTS-8 emphasis: federal colour rises with tier, a collector-in-danger alert surfaces. */
  private refreshHud(): void {
    if (!this.hudPanel) return;
    const hud = realtimeHudView(this.state);
    const p = hud.player;
    const danger = anyCollectorInDanger(this.state);
    const lines = [
      `WEEK ${hud.week}   next settlement in ${hud.weekCountdownLabel}`,
      `Clean $${p.cleanCash} · Dirty $${p.dirtyCash}   Heat ${p.heat} (${heatLabel(p.heat)})` +
        (p.debt > 0 ? `   Debt $${p.debt}` : ''),
      `Federal exposure ${p.federalExposure}/100 — tier ${p.federalTier}` +
        (p.bustArmed ? '  ⚠ WARRANT ISSUED' : ''),
      `Crew ${p.crew}` + (p.mutinyImminent ? `  ⚠ MUTINY BREWING (${p.mutinyRisk})` : ''),
    ];
    if (danger) lines.push('⚠ A COLLECTOR IS UNDER THREAT — get it to HQ');
    if (hud.shocks.length > 0) {
      lines.push('Shocks: ' + hud.shocks.map((s) => `${shockFlavor(s.kind as ShockKind)} (${s.ticksRemaining})`).join(', '));
    }
    this.hudPanel.setText(lines.join('\n'));
    // The ledger panel tints toward blood as federal pressure / collector danger climbs.
    this.hudPanel.setColor(p.federalTier >= 2 || danger ? NOIR_PALETTE.blood : NOIR_PALETTE.fog);

    const warn = p.federalTier > 0 ? federalWarningLabel(p.federalTier) : null;
    if (this.warningBanner) {
      this.warningBanner.setVisible(!!warn);
      if (warn) this.warningBanner.setText(warn).setPosition(12, this.scale.height - 28);
    }
  }

  private refreshStatus(action?: string): void {
    if (!this.statusText) return;
    const sel = this.selection.ids;
    const base = sel.length === 0 ? 'nothing selected' : `selected: ${sel.join(', ')}`;
    this.statusText.setText(action ? `${base}  ·  ${action}` : base);
  }
}
