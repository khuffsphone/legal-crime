// HUD PHASE 1 — the PANEL MANAGER (Phaser side). A ONE-DRAWER-AT-A-TIME right-side overlay on the FIXED-HUD
// camera. Opening a panel replaces the current one; its own key / ESC / a second chip click closes it. A
// 120ms slide + 70ms fade, NO bounce. The drawer OVERLAYS — it never resizes or offsets the world camera
// (the fixed-HUD layer is sacred). The pure open/close/replace decision lives in panelState; this owns the
// container, the procedural frame, and the animation. Panel BODIES are scaffolds in Phase 1 (the scene
// supplies their lines via a provider; Wire shows trivial real data, the rest a labelled stub).

import Phaser from 'phaser';
import { NOIR_PALETTE, NOIR_FONT, NOIR_DISPLAY } from '../theme';
import { SPEC, hexNum } from '../visualSpec';
import {
  initPanels, togglePanel, openPanel, closePanel, isPanelOpen, anyPanelOpen, panelDef,
  type PanelId, type PanelState,
} from './panelState';

const PANEL_W = 320;
const TOP = 62;          // below the top bar
const BOTTOM_GAP = 36;   // clear the dossier strip
const SLIDE_MS = 120;
const FADE_MS = 70;
const INK = 0x0a0807;

export class PanelManager {
  private scene: Phaser.Scene;
  private state: PanelState = initPanels();
  private container: Phaser.GameObjects.Container;
  private frame: Phaser.GameObjects.Graphics;
  private titleText: Phaser.GameObjects.Text;
  private bodyText: Phaser.GameObjects.Text;
  private rect = { x: 0, y: TOP, w: PANEL_W, h: 0 };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.frame = scene.add.graphics();
    this.titleText = scene.add.text(0, 0, '', { fontFamily: NOIR_DISPLAY, fontSize: '15px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(0, 0);
    this.bodyText = scene.add.text(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, lineSpacing: 4, wordWrap: { width: PANEL_W - 28 } }).setOrigin(0, 0);
    this.container = scene.add.container(0, 0, [this.frame, this.titleText, this.bodyText])
      .setScrollFactor(0).setDepth(100120).setVisible(false).setAlpha(0);
    this.layout();
  }

  /** Re-derive the drawer rect from the current viewport (call on resize). The drawer is OVERLAY only. */
  layout(): void {
    const W = this.scene.scale.width, H = this.scene.scale.height;
    this.rect = { x: W - PANEL_W - 8, y: TOP, w: PANEL_W, h: Math.max(120, H - TOP - BOTTOM_GAP) };
    this.frame.clear();
    this.drawFrame();
    this.titleText.setPosition(this.rect.x + 14, this.rect.y + 12);
    this.bodyText.setPosition(this.rect.x + 14, this.rect.y + 40);
    if (anyPanelOpen(this.state)) this.container.setX(0); // keep an open drawer pinned after a resize
  }

  /** A procedural noir frame: near-black α0.90 fill, brass strokes, clipped corners (no plain rectangle). */
  private drawFrame(): void {
    const { x, y, w, h } = this.rect;
    const c = 10; // corner clip
    const pts: Phaser.Geom.Point[] = [
      new Phaser.Geom.Point(x + c, y), new Phaser.Geom.Point(x + w - c, y),
      new Phaser.Geom.Point(x + w, y + c), new Phaser.Geom.Point(x + w, y + h - c),
      new Phaser.Geom.Point(x + w - c, y + h), new Phaser.Geom.Point(x + c, y + h),
      new Phaser.Geom.Point(x, y + h - c), new Phaser.Geom.Point(x, y + c),
    ];
    this.frame.fillStyle(INK, 0.9).fillPoints(pts, true);
    this.frame.lineStyle(2, hexNum(SPEC.brass), 0.85).strokePoints(pts, true, true);
    // a hairline rule under the title
    this.frame.lineStyle(1, hexNum(SPEC.brass), 0.3).beginPath();
    this.frame.moveTo(x + 12, y + 34); this.frame.lineTo(x + w - 12, y + 34); this.frame.strokePath();
  }

  /** The drawer's root container — the scene registers it with its fixed-HUD camera (hudFx) so the WORLD
   * camera IGNORES it (a scrollFactor-0 object still double-renders in world space without this). */
  get root(): Phaser.GameObjects.Container { return this.container; }

  // ── public API (delegates the decision to panelState, then animates) ──
  toggle(id: PanelId): void { this.apply(togglePanel(this.state, id)); }
  open(id: PanelId): void { this.apply(openPanel(this.state, id)); }
  close(): void { this.apply(closePanel(this.state)); }
  isOpen(id?: PanelId): boolean { return id ? isPanelOpen(this.state, id) : anyPanelOpen(this.state); }
  openId(): PanelId | null { return this.state.open; }

  /** Whether a fixed-HUD point is inside the OPEN drawer (so the scene skips world clicks under it). */
  capturesPointer(sx: number, sy: number): boolean {
    if (!anyPanelOpen(this.state)) return false;
    const { x, y, w, h } = this.rect;
    return sx >= x && sx <= x + w && sy >= y && sy <= y + h;
  }

  private apply(next: PanelState): void {
    const wasOpen = anyPanelOpen(this.state);
    const nowOpen = anyPanelOpen(next);
    this.state = next;
    this.scene.tweens.killTweensOf(this.container);
    if (nowOpen && !wasOpen) {
      // slide in from the right + fade (no bounce).
      this.container.setVisible(true).setX(PANEL_W + 24).setAlpha(0);
      this.scene.tweens.add({ targets: this.container, x: 0, duration: SLIDE_MS, ease: 'Quad.Out' });
      this.scene.tweens.add({ targets: this.container, alpha: 1, duration: FADE_MS });
    } else if (!nowOpen && wasOpen) {
      this.scene.tweens.add({ targets: this.container, x: PANEL_W + 24, duration: SLIDE_MS, ease: 'Quad.In' });
      this.scene.tweens.add({ targets: this.container, alpha: 0, duration: FADE_MS, onComplete: () => this.container.setVisible(false) });
    }
    // open→open (replace) keeps the drawer pinned; render() swaps the content in place.
  }

  /** Per-frame: paint the open drawer's title + body (the scene supplies the body lines). No-op when closed. */
  render(bodyFor: (id: PanelId) => string[]): void {
    const id = this.state.open;
    if (!id) return;
    this.titleText.setText(`${panelDef(id).title}   [${panelDef(id).key}]`);
    this.bodyText.setText(bodyFor(id).join('\n'));
  }
}
