// Lane G — the in-game PAUSE OVERLAY. A centred noir modal (Resume / Settings / Quit to menu) shown when
// the player hits Esc in the game. It does NOT halt the sim itself — the HOST (IsoScene) engages the
// existing active-pause gate (this.pause) when the overlay opens and releases it on resume, so the freeze
// rides the one true mechanism (the sim-advancement gate) and the fixed HUD/UI camera is untouched. The
// host supplies the register hook (hudFx) so the world camera ignores every object.

import Phaser from 'phaser';
import { NOIR_PALETTE, NOIR_FONT, NOIR_DISPLAY } from './theme';
import { PAL } from './cityArt';

export interface PauseOverlayHost {
  scene: Phaser.Scene;
  register?(obj: Phaser.GameObjects.GameObject): void;
  onResume(): void;
  onSettings(): void;
  onQuitToMenu(): void;
  depth?: number;
}

interface Zone { x: number; y: number; w: number; h: number; onDown: () => void; }

const CARD_W = 360;

export class PauseOverlay {
  private host: PauseOverlayHost;
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private open = false;
  private confirmQuit = false;
  private zones: Zone[] = [];
  private destroyed = false;

  constructor(host: PauseOverlayHost) {
    this.host = host;
    this.scene = host.scene;
    this.g = this.scene.add.graphics();
    this.root = this.scene.add.container(0, 0, [this.g])
      .setScrollFactor(0)
      .setDepth(host.depth ?? 140000)
      .setVisible(false);
    host.register?.(this.root);
    this.scene.input.on('pointerdown', this.onPointerDown, this);
  }

  isOpen(): boolean { return this.open; }
  toggle(): void { this.open ? this.close() : this.show(); }

  show(): void { this.open = true; this.confirmQuit = false; this.root.setVisible(true); this.render(); }
  close(): void { this.open = false; this.root.setVisible(false); }

  destroy(): void {
    if (this.destroyed) return; // idempotent — registered on both SHUTDOWN and DESTROY
    this.destroyed = true;
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.root.destroy(true);
  }

  /** True when a fixed-HUD point is inside the open card (host swallows world clicks under it). */
  capturesPointer(px: number, py: number): boolean {
    if (!this.open) return false;
    const r = this.cardRect();
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (!this.open) return;
    for (const z of this.zones) {
      if (p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h) { z.onDown(); return; }
    }
  }

  private cardRect(): { x: number; y: number; w: number; h: number } {
    const rows = this.confirmQuit ? 4 : 4; // title + 3 buttons (or title + warn + 2)
    const h = 40 + rows * 52 + 24;
    return { x: Math.round(this.scene.scale.width / 2 - CARD_W / 2), y: Math.round(this.scene.scale.height / 2 - h / 2), w: CARD_W, h };
  }

  private clearTexts(): void { for (const t of this.texts) t.destroy(); this.texts = []; }

  private text(x: number, y: number, s: string, opts: { size?: number; color?: string; font?: string; origin?: number; bold?: boolean } = {}): void {
    const t = this.scene.add.text(x, y, s, {
      fontFamily: opts.font ?? NOIR_FONT,
      fontSize: `${opts.size ?? 13}px`,
      color: opts.color ?? NOIR_PALETTE.bone,
      fontStyle: opts.bold ? 'bold' : 'normal',
    }).setOrigin(opts.origin ?? 0.5, 0.5).setScrollFactor(0).setDepth((this.host.depth ?? 140000) + 2);
    this.host.register?.(t);
    this.root.add(t);
    this.texts.push(t);
  }

  private button(cx: number, y: number, label: string, accent: number, onDown: () => void): void {
    const w = CARD_W - 64, h = 40, x = cx - w / 2;
    this.g.fillStyle(PAL.ink, 0.9).fillRect(x, y - h / 2, w, h);
    this.g.lineStyle(2, accent, 0.9).strokeRect(x, y - h / 2, w, h);
    this.text(cx, y, label, { font: NOIR_DISPLAY, size: 18, color: NOIR_PALETTE.bone, bold: true });
    this.zones.push({ x, y: y - h / 2, w, h, onDown });
  }

  private render(): void {
    if (!this.open) return;
    this.clearTexts();
    this.zones = [];
    this.g.clear();
    const W = this.scene.scale.width, H = this.scene.scale.height;
    this.g.fillStyle(PAL.soot, 0.6).fillRect(0, 0, W, H);
    const r = this.cardRect();
    this.g.fillStyle(PAL.ink, 0.97).fillRect(r.x, r.y, r.w, r.h);
    this.g.lineStyle(2, PAL.brass, 0.92).strokeRect(r.x, r.y, r.w, r.h);

    const cx = W / 2;
    this.text(cx, r.y + 26, '⏸  PAUSED', { font: NOIR_DISPLAY, size: 24, color: NOIR_PALETTE.brass, bold: true });

    let y = r.y + 40 + 26;
    if (!this.confirmQuit) {
      this.button(cx, y, 'RESUME', PAL.brass, () => this.host.onResume()); y += 52;
      this.button(cx, y, 'SETTINGS', PAL.brass, () => this.host.onSettings()); y += 52;
      this.button(cx, y, 'QUIT TO MENU', PAL.blood, () => { this.confirmQuit = true; this.render(); });
    } else {
      this.text(cx, y - 6, 'Quit to the main menu?', { color: NOIR_PALETTE.bone });
      this.text(cx, y + 12, 'unsaved progress is lost', { size: 11, color: NOIR_PALETTE.fog });
      y += 44;
      this.button(cx, y, 'YES, QUIT', PAL.blood, () => this.host.onQuitToMenu()); y += 52;
      this.button(cx, y, 'BACK', PAL.brass, () => { this.confirmQuit = false; this.render(); });
    }
  }
}
