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
  spawnCollector,
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
  update as advanceWorld,
  type GameState,
  type Selection,
  type NavGrid,
  type MovableUnit,
} from '../sim';
import { NOIR_PALETTE, NOIR_FONT } from './theme';

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

/** A unit and its render objects: a selection ring (ground) + a token marker. */
interface UnitView {
  unit: MovableUnit;
  ring: Phaser.GameObjects.Ellipse;
  marker: Phaser.GameObjects.Container;
}

export class IsoScene extends Phaser.Scene {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private navGrid!: NavGrid;
  private state!: GameState;
  private units: UnitView[] = [];
  private selection: Selection = emptySelection();
  private pressX = 0;
  private pressY = 0;
  private statusText?: Phaser.GameObjects.Text;
  private robbedCollectors = new Set<string>();

  constructor() {
    super('IsoScene');
  }

  create(): void {
    const cam = this.cameras.main;
    cam.setBackgroundColor(NOIR_PALETTE.ink);

    this.drawGround();
    this.drawBlocks(BLOCKS);

    // Buildings are impassable; units (RTS-2) pathfind around them on this nav grid.
    this.navGrid = makeGrid(COLS, ROWS, BLOCKS.map((b) => ({ gx: b.gx, gy: b.gy })));
    // The real-time world: units live on state.units and are advanced by advanceWorld (update).
    this.state = createInitialState(1);
    this.spawnUnits();

    const mid = gridToScreen((COLS - 1) / 2, (ROWS - 1) / 2);
    cam.centerOn(mid.x, mid.y);

    this.setupCameraControls();
    this.setupSelectionInput();
    this.drawHud();
  }

  // ── units (RTS-2 movement + RTS-3 selection + RTS-4 interception markers) ─────────────────

  private spawnUnits(): void {
    // Player muscle (selectable, no faction conflict among themselves).
    const roster: Array<{ id: string; gx: number; gy: number; color: string }> = [
      { id: 'muscle-1', gx: 2, gy: 1, color: NOIR_PALETTE.blood },
      { id: 'muscle-2', gx: 1, gy: 2, color: NOIR_PALETTE.bone },
    ];
    for (const r of roster) this.addUnit(spawnUnit(r.id, r.gx, r.gy), r.color);

    // RTS-4 ambush demo: a player collector carrying a fat take walks across the map; a rival
    // enforcer chases it down. When it closes within range, advanceWorld resolves the robbery.
    this.addUnit(spawnCollector('collector', 1, 14, 'player', 500, 1.6), NOIR_PALETTE.brass);
    this.addUnit(spawnEnforcer('rival-gun', 14, 1, 'rival-a', 2.2), NOIR_PALETTE.blood);
    const collector = this.state.units.find((u) => u.id === 'collector')!;
    issueMove(collector, { gx: 14, gy: 14 }, this.navGrid); // head for the far "safe house"
  }

  private addUnit(unit: MovableUnit, color: string): void {
    this.state.units.push(unit);
    const ring = this.add
      .ellipse(0, 4, 30, 16)
      .setStrokeStyle(2, hex(NOIR_PALETTE.brass), 1)
      .setVisible(false);
    this.units.push({ unit, ring, marker: this.makeMarker(color, unit.id) });
  }

  /** A token (disc + drop shadow + label) standing in for a real unit sprite (RTS-7). */
  private makeMarker(color: string, label: string): Phaser.GameObjects.Container {
    const shadow = this.add.ellipse(0, 4, 26, 13, hex(NOIR_PALETTE.ink), 0.45);
    const disc = this.add
      .circle(0, -10, 9, hex(color), 1)
      .setStrokeStyle(2, hex(NOIR_PALETTE.bone), 0.9);
    const tag = this.add
      .text(0, -30, label, { fontFamily: NOIR_FONT, fontSize: '11px', color: NOIR_PALETTE.bone })
      .setOrigin(0.5, 1);
    return this.add.container(0, 0, [shadow, disc, tag]);
  }

  private updateUnits(dt: number): void {
    // The rival enforcer hunts the collector: re-path toward it while it still carries a take.
    const collector = this.state.units.find((u) => u.id === 'collector');
    const gun = this.state.units.find((u) => u.id === 'rival-gun');
    if (collector && gun && (collector.carrying ?? 0) > 0) {
      issueMove(gun, unitTile(collector), this.navGrid);
    }

    // Advance the whole real-time world (movement + interception + week clock).
    const res = advanceWorld(this.state, dt);
    for (const ev of res.interceptions) this.flashAmbush(ev.collectorId);

    for (const v of this.units) {
      const s = unitScreenPos(v.unit);
      const t = v.unit.pos;
      const depth = depthValue(Math.round(t.gx), Math.round(t.gy)) * 10 + 8;
      v.marker.setPosition(s.x, s.y).setDepth(depth);
      v.ring.setPosition(s.x, s.y + 4).setDepth(depth - 1).setVisible(isSelected(this.selection, v.unit.id));
    }
  }

  /** Render the ambush: a noir flash over the robbed collector (RTS-4). */
  private flashAmbush(collectorId: string): void {
    if (this.robbedCollectors.has(collectorId)) return;
    this.robbedCollectors.add(collectorId);
    const v = this.units.find((u) => u.unit.id === collectorId);
    if (!v) return;
    const s = unitScreenPos(v.unit);
    const flash = this.add
      .text(s.x, s.y - 44, '— ROBBED —', {
        fontFamily: NOIR_FONT,
        fontSize: '16px',
        color: NOIR_PALETTE.blood,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 1)
      .setDepth(100001);
    this.tweens.add({ targets: flash, y: s.y - 80, alpha: 0, duration: 1600, onComplete: () => flash.destroy() });
    this.refreshStatus('collector ambushed — the take is gone');
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
    if (!isCommandableTile(target, this.navGrid)) return;
    const res = resolveMoveCommand(this.units.map((v) => v.unit), this.selection.ids, target, this.navGrid);
    this.refreshStatus(`moving ${res.moved.length} → (${target.gx},${target.gy})` +
      (res.failed.length ? ` · ${res.failed.length} blocked` : ''));
  }

  // ── map ────────────────────────────────────────────────────────────────────────────────

  private drawGround(): void {
    for (let gx = 0; gx < COLS; gx++) {
      for (let gy = 0; gy < ROWS; gy++) {
        const c = gridToScreen(gx, gy);
        const corners = tileCorners(gx, gy);
        const pts = corners.map((pt) => ({ x: pt.x - c.x, y: pt.y - c.y }));
        const checker = (gx + gy) % 2 === 0 ? NOIR_PALETTE.charcoal : NOIR_PALETTE.ink;
        const tile = this.add
          .polygon(c.x, c.y, pts, hex(checker), 1)
          .setStrokeStyle(1, hex(NOIR_PALETTE.fog), 0.25);
        tile.setDepth(depthValue(gx, gy) * 10);
      }
    }
  }

  private drawBlocks(blocks: Block[]): void {
    for (const b of blocks) {
      const c = gridToScreen(b.gx, b.gy);
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
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.updateUnits(dt);

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
        'left-click = select (shift = add) · right-click = move · drag = pan · wheel = zoom · [B] card view',
      { fontFamily: NOIR_FONT, fontSize: '14px', color: NOIR_PALETTE.brass },
    );
    t.setScrollFactor(0).setDepth(100000);

    this.statusText = this.add
      .text(12, 54, 'nothing selected', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.bone })
      .setScrollFactor(0)
      .setDepth(100000);
    void ISO_TILE_HALF_HEIGHT;
  }

  private refreshStatus(action?: string): void {
    if (!this.statusText) return;
    const sel = this.selection.ids;
    const base = sel.length === 0 ? 'nothing selected' : `selected: ${sel.join(', ')}`;
    this.statusText.setText(action ? `${base}  ·  ${action}` : base);
  }
}
