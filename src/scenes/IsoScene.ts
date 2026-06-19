// RTS-1 — isometric world scene. Renders a tile grid as a 2:1 dimetric map (placeholder
// diamond tiles; real art arrives in RTS-7) with correct depth-sorting and a pannable,
// zoomable camera. Rendering + input only — all projection math is the pure /src/sim/iso
// module; no game rules here. The strategic card scene (BootScene) remains registered.

import Phaser from 'phaser';
import {
  gridToScreen,
  tileCorners,
  depthValue,
  ISO_TILE_HALF_HEIGHT,
  ISO_TILE_HEIGHT,
} from '../sim';
import { NOIR_PALETTE, NOIR_FONT } from './theme';

const COLS = 16;
const ROWS = 16;
const PAN_SPEED = 600; // px/sec for keyboard panning (in world units)
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;

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

export class IsoScene extends Phaser.Scene {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super('IsoScene');
  }

  create(): void {
    const cam = this.cameras.main;
    cam.setBackgroundColor(NOIR_PALETTE.ink);

    this.drawGround();
    this.drawBlocks([
      { gx: 3, gy: 3, height: 48, color: NOIR_PALETTE.brass },
      { gx: 4, gy: 3, height: 80, color: NOIR_PALETTE.blood },
      { gx: 3, gy: 4, height: 64, color: NOIR_PALETTE.charcoal },
      { gx: 8, gy: 9, height: 96, color: NOIR_PALETTE.brass },
      { gx: 9, gy: 9, height: 40, color: NOIR_PALETTE.charcoal },
    ]);

    // Center the camera on the middle of the map.
    const mid = gridToScreen((COLS - 1) / 2, (ROWS - 1) / 2);
    cam.centerOn(mid.x, mid.y);

    this.setupCameraControls();
    this.drawHud();
  }

  // ── map ────────────────────────────────────────────────────────────────────────────────

  private drawGround(): void {
    for (let gx = 0; gx < COLS; gx++) {
      for (let gy = 0; gy < ROWS; gy++) {
        const c = gridToScreen(gx, gy);
        const corners = tileCorners(gx, gy);
        // Polygon points are relative to the object's (x,y), so subtract the center.
        const pts = corners.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
        const checker = (gx + gy) % 2 === 0 ? NOIR_PALETTE.charcoal : NOIR_PALETTE.ink;
        const tile = this.add
          .polygon(c.x, c.y, pts, hex(checker), 1)
          .setStrokeStyle(1, hex(NOIR_PALETTE.fog), 0.25);
        // Ground sits at the bottom of its tile's depth band (layer 0).
        tile.setDepth(depthValue(gx, gy) * 10);
      }
    }
  }

  private drawBlocks(blocks: Block[]): void {
    for (const b of blocks) {
      const c = gridToScreen(b.gx, b.gy);
      const corners = tileCorners(b.gx, b.gy).map((p) => ({ x: p.x - c.x, y: p.y - c.y }));

      // Vertical faces (left + right) as parallelograms, then the top diamond — a simple box.
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

    // Drag to pan.
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) {
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      }
    });

    // Wheel to zoom, about the cursor.
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const z = Phaser.Math.Clamp(cam.zoom - dy * 0.001, MIN_ZOOM, MAX_ZOOM);
      cam.setZoom(z);
    });

    // [B] view the strategic card scene; the iso map is the default RTS view.
    this.input.keyboard?.on('keydown-B', () => this.scene.start('BootScene'));
  }

  update(_time: number, delta: number): void {
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
        'drag = pan · wheel = zoom · arrows = scroll · [B] card view',
      { fontFamily: NOIR_FONT, fontSize: '14px', color: NOIR_PALETTE.brass },
    );
    t.setScrollFactor(0).setDepth(100000);
    // ISO_TILE_HALF_HEIGHT referenced so the spec value is part of the build surface.
    void ISO_TILE_HALF_HEIGHT;
  }
}
