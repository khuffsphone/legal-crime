// Lane G — the SETTINGS PANEL: a reusable noir modal mounted by BOTH the main menu (MainMenuScene) and the
// in-game pause overlay (inside IsoScene). It edits the persisted settings.ts store: master/SFX/music volume,
// the screen-shake and lighting-quality toggles, and the keybind-remap list. Volume routes ONLY through the
// AudioManager's public named setters when one is supplied (in-game); in the menu it just persists and is
// applied when the game boots. Keybind capture uses a WINDOW capture-phase listener so the captured key never
// also triggers a game action, and remaps go through the conflict-refusing central map (no new conflicts).
//
// Camera discipline: the host supplies a `register` hook. Inside IsoScene that hook is `hudFx` (so the world
// camera ignores every object and the panel never drifts on zoom/pan); MainMenuScene has no world camera and
// passes nothing. Nothing here reaches into the sim.

import Phaser from 'phaser';
import { NOIR_PALETTE, NOIR_FONT, NOIR_DISPLAY } from './theme';
import { PAL } from './cityArt';
import {
  loadSettings, saveSettings, type Settings, type LightingQuality,
} from './settings';
import {
  KEY_ACTIONS, KEY_ACTION_LABELS, DEFAULT_KEYBINDS, resolveKeybinds, applyRemap, resetKeybind,
  remapOverlay, keyLabel, normalizeKey, type KeyAction,
} from './keybinds';

export interface SettingsPanelHost {
  scene: Phaser.Scene;
  /** Live volume routing (in-game). Absent in the menu — there it only persists. */
  audio?: {
    setMasterVolume(v: number): void;
    setSfxVolume(v: number): void;
    setMusicVolume(v: number): void;
  };
  /** Register every created object with the fixed-HUD camera (hudFx in IsoScene). No-op in the menu. */
  register?(obj: Phaser.GameObjects.GameObject): void;
  /** The host re-resolves its live keybind dispatch map when a remap lands. */
  onKeybindsChange?(map: Record<KeyAction, string>): void;
  /** The host applies the screen-shake / lighting toggles live. */
  onSettingsChange?(s: Settings): void;
  /** Base depth for the modal (above the host's other HUD). */
  depth?: number;
}

const W = 540;
const PAD = 22;
const ROW = 30;
const BAR_W = 200;
const BAR_H = 12;

type VolKey = 'master' | 'sfx' | 'music';

export class SettingsPanel {
  private host: SettingsPanelHost;
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private open = false;
  private settings: Settings;
  private keybinds: Record<KeyAction, string>;
  private capturing: KeyAction | null = null;
  private captureCleanup?: () => void;
  private destroyed = false;
  private dragging: VolKey | null = null;
  private notice = '';

  // hit zones, recomputed each render: a screen rect + its handler
  private zones: Array<{ x: number; y: number; w: number; h: number; onDown: (px: number) => void }> = [];
  private barRects: Record<VolKey, { x: number; y: number; w: number; h: number }> = {
    master: { x: 0, y: 0, w: 0, h: 0 }, sfx: { x: 0, y: 0, w: 0, h: 0 }, music: { x: 0, y: 0, w: 0, h: 0 },
  };

  constructor(host: SettingsPanelHost) {
    this.host = host;
    this.scene = host.scene;
    this.settings = loadSettings();
    this.keybinds = resolveKeybinds(this.settings.keybinds);
    this.g = this.scene.add.graphics();
    this.root = this.scene.add.container(0, 0, [this.g])
      .setScrollFactor(0)
      .setDepth(host.depth ?? 150000)
      .setVisible(false);
    host.register?.(this.root);
    this.installPointer();
  }

  isOpen(): boolean { return this.open; }
  isCapturing(): boolean { return this.capturing !== null; }

  toggle(): void { this.open ? this.close() : this.show(); }

  show(): void {
    this.settings = loadSettings(); // adopt anything changed elsewhere this session
    this.keybinds = resolveKeybinds(this.settings.keybinds);
    this.notice = '';
    this.open = true;
    this.root.setVisible(true);
    this.render();
  }

  close(): void {
    this.cancelCapture();
    this.open = false;
    this.root.setVisible(false);
  }

  destroy(): void {
    if (this.destroyed) return; // idempotent — registered on both SHUTDOWN and DESTROY
    this.destroyed = true;
    this.cancelCapture();
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.root.destroy(true);
  }

  // ── pointer plumbing ──────────────────────────────────────────────────────────────────────
  private installPointer(): void {
    this.scene.input.on('pointerdown', this.onPointerDown, this);
    this.scene.input.on('pointermove', this.onPointerMove, this);
    this.scene.input.on('pointerup', this.onPointerUp, this);
  }

  /** True when a fixed-HUD point is inside the open modal (the host swallows world clicks under it). */
  capturesPointer(px: number, py: number): boolean {
    if (!this.open) return false;
    const r = this.cardRect();
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (!this.open) return;
    for (const z of this.zones) {
      if (p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h) { z.onDown(p.x); return; }
    }
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (!this.open || !this.dragging || !p.isDown) return;
    this.setVolumeFromX(this.dragging, p.x);
  }

  private onPointerUp(): void { this.dragging = null; }

  // ── geometry ──────────────────────────────────────────────────────────────────────────────
  private rowCount(): number {
    // title + audio header + 3 vols + display header + 2 toggles + controls header + 8 binds + notice + footer
    return 1 + 1 + 3 + 1 + 2 + 1 + KEY_ACTIONS.length + 1 + 1;
  }
  private cardRect(): { x: number; y: number; w: number; h: number } {
    const h = PAD * 2 + this.rowCount() * ROW + 18;
    const x = Math.round(this.scene.scale.width / 2 - W / 2);
    const y = Math.round(this.scene.scale.height / 2 - h / 2);
    return { x, y, w: W, h };
  }

  // ── value mutation ────────────────────────────────────────────────────────────────────────
  private setVolumeFromX(bus: VolKey, px: number): void {
    const r = this.barRects[bus];
    const v = Math.max(0, Math.min(1, (px - r.x) / r.w));
    this.settings = { ...this.settings, [bus]: v };
    if (bus === 'master') this.host.audio?.setMasterVolume(v);
    else if (bus === 'sfx') this.host.audio?.setSfxVolume(v);
    else this.host.audio?.setMusicVolume(v);
    saveSettings(this.settings);
    this.render();
  }

  private toggleShake(): void {
    this.settings = { ...this.settings, screenShake: !this.settings.screenShake };
    saveSettings(this.settings);
    this.host.onSettingsChange?.(this.settings);
    this.render();
  }
  private cycleLighting(): void {
    const next: LightingQuality = this.settings.lighting === 'high' ? 'low' : 'high';
    this.settings = { ...this.settings, lighting: next };
    saveSettings(this.settings);
    this.host.onSettingsChange?.(this.settings);
    this.render();
  }

  private resetAll(): void {
    this.cancelCapture();
    this.keybinds = { ...DEFAULT_KEYBINDS };
    this.settings = { ...this.settings, keybinds: {} };
    saveSettings(this.settings);
    this.host.onKeybindsChange?.(this.keybinds);
    this.notice = 'controls reset to defaults';
    this.render();
  }

  private resetOne(action: KeyAction): void {
    this.keybinds = resetKeybind(this.keybinds, action);
    this.persistKeybinds();
    this.notice = `${KEY_ACTION_LABELS[action]} → ${keyLabel(this.keybinds[action])}`;
    this.render();
  }

  private persistKeybinds(): void {
    this.settings = { ...this.settings, keybinds: remapOverlay(this.keybinds) };
    saveSettings(this.settings);
    this.host.onKeybindsChange?.(this.keybinds);
  }

  // ── keybind capture (window capture-phase, so the key never hits a game handler) ───────────
  private beginCapture(action: KeyAction): void {
    this.cancelCapture();
    this.capturing = action;
    this.notice = `press a key for ${KEY_ACTION_LABELS[action]}…  (Esc cancels)`;
    this.render();
    const handler = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopImmediatePropagation();
      // We bind single keys only. A bare modifier press is the lead-in to a combo we don't support — keep
      // listening for the real key rather than capturing the modifier itself (which is reserved anyway).
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
      this.cancelCapture();
      if (e.key === 'Escape') { this.notice = 'remap cancelled'; this.render(); return; }
      const r = applyRemap(this.keybinds, action, normalizeKey(e.key));
      if (r.ok) {
        this.keybinds = r.map;
        this.persistKeybinds();
        this.notice = `${KEY_ACTION_LABELS[action]} → ${keyLabel(this.keybinds[action])}`;
      } else {
        this.notice = `✗ ${r.reason}`;
      }
      this.render();
    };
    // capture phase: runs before Phaser's bubble-phase DOM listener, and stopImmediatePropagation prevents
    // Phaser from emitting any keydown for this physical press. NOT `once` — we must stay listening through
    // a bare-modifier press; cancelCapture() removes it once a real key (or Esc) lands.
    window.addEventListener('keydown', handler, { capture: true });
    this.captureCleanup = () => window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions);
  }

  private cancelCapture(): void {
    if (this.captureCleanup) { this.captureCleanup(); this.captureCleanup = undefined; }
    this.capturing = null;
  }

  // ── render ────────────────────────────────────────────────────────────────────────────────
  private clearTexts(): void {
    for (const t of this.texts) t.destroy();
    this.texts = [];
  }
  private label(x: number, y: number, s: string, opts: { color?: string; font?: string; size?: number; origin?: number; bold?: boolean } = {}): Phaser.GameObjects.Text {
    const t = this.scene.add.text(x, y, s, {
      fontFamily: opts.font ?? NOIR_FONT,
      fontSize: `${opts.size ?? 13}px`,
      color: opts.color ?? NOIR_PALETTE.bone,
      fontStyle: opts.bold ? 'bold' : 'normal',
    }).setOrigin(opts.origin ?? 0, 0.5).setScrollFactor(0).setDepth((this.host.depth ?? 150000) + 2);
    this.host.register?.(t);
    this.root.add(t);
    this.texts.push(t);
    return t;
  }

  private render(): void {
    if (!this.open) return;
    this.clearTexts();
    this.zones = [];
    const r = this.cardRect();
    const g = this.g;
    g.clear();
    // backdrop dims the whole screen; the card is a brass-framed ink slab
    g.fillStyle(PAL.soot, 0.72).fillRect(0, 0, this.scene.scale.width, this.scene.scale.height);
    g.fillStyle(PAL.ink, 0.97).fillRect(r.x, r.y, r.w, r.h);
    this.decoFrame(g, r.x, r.y, r.w, r.h, PAL.brass, 0.92);

    const left = r.x + PAD;
    const right = r.x + r.w - PAD;
    let y = r.y + PAD + ROW / 2;

    this.label(left, y, 'SETTINGS', { font: NOIR_DISPLAY, size: 22, color: NOIR_PALETTE.brass, bold: true });
    this.label(right, y, '✕  Close  [Esc]', { origin: 1, color: NOIR_PALETTE.fog });
    this.zones.push({ x: right - 130, y: y - 12, w: 130, h: 24, onDown: () => this.close() });
    y += ROW;

    // ── audio ──
    this.section(left, right, y, 'AUDIO'); y += ROW;
    y = this.volumeRow(left, right, y, 'master', 'Master');
    y = this.volumeRow(left, right, y, 'sfx', 'Sound FX');
    y = this.volumeRow(left, right, y, 'music', 'Music');

    // ── display ──
    this.section(left, right, y, 'DISPLAY'); y += ROW;
    y = this.toggleRow(left, right, y, 'Screen shake', this.settings.screenShake ? 'ON' : 'OFF', this.settings.screenShake, () => this.toggleShake());
    y = this.toggleRow(left, right, y, 'Lighting quality', this.settings.lighting === 'high' ? 'HIGH' : 'LOW', this.settings.lighting === 'high', () => this.cycleLighting());

    // ── controls ──
    this.section(left, right, y, 'CONTROLS');
    this.label(right, y + ROW / 2, 'Reset all', { origin: 1, color: NOIR_PALETTE.fog });
    this.zones.push({ x: right - 80, y: y + ROW / 2 - 12, w: 80, h: 24, onDown: () => this.resetAll() });
    y += ROW;
    for (const action of KEY_ACTIONS) {
      y = this.keybindRow(left, right, y, action);
    }

    // ── notice + footer ──
    if (this.notice) {
      const isErr = this.notice.startsWith('✗');
      this.label(left, y + ROW / 2, this.notice, { color: isErr ? NOIR_PALETTE.blood : NOIR_PALETTE.fog });
    }
    y += ROW;
    this.label(r.x + r.w / 2, y + ROW / 2, 'Volume routes through the audio bus · keys can’t collide', { origin: 0.5, color: NOIR_PALETTE.fog, size: 11 });
  }

  private section(left: number, right: number, y: number, title: string): void {
    this.label(left, y + ROW / 2, title, { font: NOIR_DISPLAY, size: 13, color: NOIR_PALETTE.brass, bold: true });
    this.g.lineStyle(1, PAL.brass, 0.3).beginPath();
    this.g.moveTo(left + 96, y + ROW / 2); this.g.lineTo(right, y + ROW / 2); this.g.strokePath();
  }

  private volumeRow(left: number, right: number, y: number, bus: VolKey, name: string): number {
    const cy = y + ROW / 2;
    this.label(left, cy, name);
    const bx = right - BAR_W;
    const by = cy - BAR_H / 2;
    const v = this.settings[bus];
    // track + fill
    this.g.fillStyle(PAL.charcoal, 1).fillRect(bx, by, BAR_W, BAR_H);
    this.g.fillStyle(PAL.brass, 0.92).fillRect(bx, by, Math.max(0, Math.min(1, v)) * BAR_W, BAR_H);
    this.g.lineStyle(1, PAL.brass, 0.7).strokeRect(bx, by, BAR_W, BAR_H);
    this.label(bx - 10, cy, `${Math.round(v * 100)}%`, { origin: 1, font: NOIR_FONT, color: NOIR_PALETTE.bone });
    this.barRects[bus] = { x: bx, y: by, w: BAR_W, h: BAR_H };
    this.zones.push({ x: bx, y: by - 6, w: BAR_W, h: BAR_H + 12, onDown: (px) => { this.dragging = bus; this.setVolumeFromX(bus, px); } });
    return y + ROW;
  }

  private toggleRow(left: number, right: number, y: number, name: string, value: string, on: boolean, onDown: () => void): number {
    const cy = y + ROW / 2;
    this.label(left, cy, name);
    const bw = 90, bx = right - bw, by = cy - 12;
    this.g.fillStyle(on ? PAL.brass : PAL.soot, on ? 0.9 : 0.9).fillRect(bx, by, bw, 24);
    this.g.lineStyle(1.5, PAL.brass, 0.85).strokeRect(bx, by, bw, 24);
    this.label(bx + bw / 2, cy, value, { origin: 0.5, color: on ? '#14110f' : NOIR_PALETTE.bone, bold: true });
    this.zones.push({ x: bx, y: by, w: bw, h: 24, onDown });
    return y + ROW;
  }

  private keybindRow(left: number, right: number, y: number, action: KeyAction): number {
    const cy = y + ROW / 2;
    this.label(left, cy, KEY_ACTION_LABELS[action]);
    const capturing = this.capturing === action;
    const bw = 88, bx = right - bw, by = cy - 12;
    this.g.fillStyle(capturing ? PAL.blood : PAL.soot, 0.9).fillRect(bx, by, bw, 24);
    this.g.lineStyle(1.5, capturing ? PAL.danger : PAL.brass, 0.85).strokeRect(bx, by, bw, 24);
    this.label(bx + bw / 2, cy, capturing ? '…' : keyLabel(this.keybinds[action]), { origin: 0.5, color: NOIR_PALETTE.bone, bold: true });
    this.zones.push({ x: bx, y: by, w: bw, h: 24, onDown: () => this.beginCapture(action) });
    // a small reset glyph for a remapped row
    if (this.keybinds[action] !== DEFAULT_KEYBINDS[action]) {
      this.label(bx - 12, cy, '⟲', { origin: 1, color: NOIR_PALETTE.fog });
      this.zones.push({ x: bx - 28, y: by, w: 20, h: 24, onDown: () => this.resetOne(action) });
    }
    return y + ROW;
  }

  /** A clipped-corner brass frame, mirroring IsoScene.decoFrame so the modal matches house style. */
  private decoFrame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, accent: number, alpha: number): void {
    const c = 10;
    const pts = [
      new Phaser.Geom.Point(x + c, y), new Phaser.Geom.Point(x + w - c, y),
      new Phaser.Geom.Point(x + w, y + c), new Phaser.Geom.Point(x + w, y + h - c),
      new Phaser.Geom.Point(x + w - c, y + h), new Phaser.Geom.Point(x + c, y + h),
      new Phaser.Geom.Point(x, y + h - c), new Phaser.Geom.Point(x, y + c),
    ];
    g.lineStyle(2, accent, alpha).strokePoints(pts, true, true);
  }
}
