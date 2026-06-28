// Lane G — the MAIN MENU: the product shell's front door and the new boot entry. Registered FIRST in
// main.ts so Phaser auto-starts it; gameplay (IsoScene) is launched on demand. Four choices:
//   • NEW GAME   → clears any load handoff and starts a fresh IsoScene
//   • CONTINUE   → loads the newest save (Lane F's saveStore) into the registry, then starts IsoScene
//                  (disabled when there is no save)
//   • SETTINGS   → opens the shared SettingsPanel modal
//   • QUIT       → attempts to close the tab (browsers usually block this for a non-script tab; we show a
//                  graceful note instead of pretending)
// Its own scene, its own 1:1 camera — no world camera, so no setupUiCamera/hudFx is needed here.

import Phaser from 'phaser';
import { NOIR_PALETTE, NOIR_FONT, NOIR_DISPLAY, GAME_TITLE } from './theme';
import { PAL } from './cityArt';
import { listResumableSlots, loadContinue, hasResumableSave, deleteSaveSlot, AUTOSAVE_SLOT, LOADED_STATE_KEY } from './saveStore';
import { SettingsPanel } from './settingsPanel';
import { hasDevFlags } from './devDebug';

/** Registry flag: the dev menu-bypass has already fired this page load (so a RETURN to the menu — e.g.
 *  Esc from the endgame — shows the real front door instead of auto-starting again into a loop). */
const DEV_BYPASS_KEY = 'lcr_dev_menu_bypassed';

interface MenuButton {
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  sub?: Phaser.GameObjects.Text;
  enabled: boolean;
  onClick: () => void;
}

export class MainMenuScene extends Phaser.Scene {
  private settings?: SettingsPanel;
  private buttons: MenuButton[] = [];
  private note?: Phaser.GameObjects.Text;

  constructor() {
    super('MainMenuScene');
  }

  create(): void {
    // Task 1 (DEV-ONLY menu bypass) — a cold dev deep-link (?debug=win/lose, ?arm…, ?scenario…, ?skipmenu)
    // must reach the GAME, not dead-end at this front door. On the FIRST menu visit of the page load only,
    // auto-start a fresh game so the flag is honoured; the registry guard means a later RETURN here (Quit /
    // Esc-from-endgame) shows the real menu (no bypass loop). Wholly inert in production (hasDevFlags=false).
    if (this.maybeDevBypass()) return;

    const W = this.scale.width, H = this.scale.height;
    this.cameras.main.setBackgroundColor('#0d0b0a');

    // backdrop — a soot field with a faint deco rule, the same noir mood as the game
    const g = this.add.graphics();
    g.fillStyle(PAL.soot, 1).fillRect(0, 0, W, H);
    g.fillStyle(PAL.ink, 0.6).fillRect(0, H * 0.5, W, H * 0.5);
    g.lineStyle(2, PAL.brass, 0.5).strokeRect(28, 28, W - 56, H - 56);

    const cx = W / 2;
    this.add.text(cx, H * 0.22, GAME_TITLE, { fontFamily: NOIR_DISPLAY, fontSize: '64px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(cx, H * 0.22 + 56, 'FEDORA NOIR', { fontFamily: NOIR_DISPLAY, fontSize: '24px', color: NOIR_PALETTE.bone }).setOrigin(0.5);
    this.add.text(cx, H * 0.22 + 88, 'Prohibition-era Brassmere — build a protection empire, quietly first, by war later.', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.fog }).setOrigin(0.5);

    // ── the saved-game probe (Lane F) — CONTINUE resumes only an IN-PROGRESS run (B1): a terminal win/lose
    // end-state is never offered, so we probe the RESUMABLE slots, not every slot. ──
    const newest = listResumableSlots()[0];

    let y = H * 0.5;
    const gap = 56;
    this.mkButton(cx, y, 'NEW GAME', 'a fresh outfit', true, () => this.startGame(true)); y += gap;
    this.mkButton(cx, y, 'CONTINUE', newest ? `resume ${newest.label || 'your last game'}` : 'no save found', hasResumableSave(), () => this.continueGame()); y += gap;
    this.mkButton(cx, y, 'SETTINGS', 'audio · controls · display', true, () => this.openSettings()); y += gap;
    this.mkButton(cx, y, 'QUIT', 'leave the city', true, () => this.quit());

    this.note = this.add.text(cx, H - 48, '', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.fog }).setOrigin(0.5);

    // the shared settings modal (no audio routing in the menu — volume is applied when the game boots;
    // no register hook — this scene has a single 1:1 camera).
    this.settings = new SettingsPanel({ scene: this, depth: 1000 });

    this.input.keyboard?.on('keydown-ESC', () => { if (this.settings?.isOpen()) this.settings.close(); });

    // clean up DOM/global listeners the panel installed when this scene is torn down
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.settings?.destroy());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.settings?.destroy());
  }

  private mkButton(cx: number, y: number, text: string, sub: string, enabled: boolean, onClick: () => void): void {
    const w = 320, h = 44;
    const rect = this.add.rectangle(cx, y, w, h, PAL.ink, enabled ? 0.85 : 0.4).setStrokeStyle(2, PAL.brass, enabled ? 0.9 : 0.35);
    const label = this.add.text(cx - w / 2 + 18, y, text, { fontFamily: NOIR_DISPLAY, fontSize: '22px', color: enabled ? NOIR_PALETTE.brass : NOIR_PALETTE.fog, fontStyle: 'bold' }).setOrigin(0, 0.5);
    const subT = this.add.text(cx + w / 2 - 18, y, sub, { fontFamily: NOIR_FONT, fontSize: '11px', color: NOIR_PALETTE.fog }).setOrigin(1, 0.5);
    const btn: MenuButton = { rect, label, sub: subT, enabled, onClick };
    if (enabled) {
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerover', () => { if (!this.settings?.isOpen()) rect.setFillStyle(PAL.brass, 0.18); });
      rect.on('pointerout', () => rect.setFillStyle(PAL.ink, 0.85));
      rect.on('pointerdown', () => { if (!this.settings?.isOpen()) btn.onClick(); });
    }
    this.buttons.push(btn);
  }

  /**
   * Task 1 — the DEV-ONLY menu bypass. Returns true (and starts a fresh game) iff this is a dev build with
   * a dev/QA deep-link present AND the bypass hasn't already fired this page load. The once-per-load guard
   * (a registry flag) is what keeps Quit / Esc-from-endgame from bouncing straight back into the game.
   */
  private maybeDevBypass(): boolean {
    const search = typeof window !== 'undefined' ? (window.location?.search ?? '') : '';
    if (this.registry.get(DEV_BYPASS_KEY) || !hasDevFlags(search)) return false;
    this.registry.set(DEV_BYPASS_KEY, true);
    this.startGame(true); // a fresh game; IsoScene.applyDebugScenario then honours the deep-link
    return true;
  }

  private startGame(fresh: boolean): void {
    if (fresh) {
      this.registry.remove(LOADED_STATE_KEY); // ensure IsoScene.create falls through to a new game
      // B1 — a NEW GAME replaces the autosave: clear the rolling autosave so a PRIOR run's ending can never be
      // what CONTINUE resumes (the fresh run rewrites it week-by-week anyway). Manual/quick slots are kept.
      deleteSaveSlot(AUTOSAVE_SLOT);
    }
    this.scene.start('IsoScene');
  }

  private continueGame(): void {
    // loadContinue picks the newest slot across autosave / quick / manual (Lane F's purpose-built entry).
    const res = loadContinue();
    if (!res.ok) { this.setNote(`could not load: ${res.reason}`); return; }
    this.registry.set(LOADED_STATE_KEY, res.state);          // IsoScene.create adopts this on start
    if (res.file.view) this.registry.set('lcr_loaded_view', res.file.view); // restore fog exactly (NO-X-RAY)
    this.scene.start('IsoScene');
  }

  private openSettings(): void { this.settings?.show(); }

  private quit(): void {
    // a browser tab can rarely be closed by script (only if script-opened). Try, then tell the truth.
    try { window.close(); } catch { /* blocked */ }
    this.setNote('Thanks for playing — close this tab to quit.');
  }

  private setNote(s: string): void { this.note?.setText(s); }
}
