// STATUS UI — Phase 1: a self-contained ScreenView RENDERER (all the Phaser drawing lives here, not in
// IsoScene). Draws a ScreenView as a diegetic-ish ledger overlay on the FIXED HUD camera: title bar, section
// headings, one coloured line per row (Brassmere colour law). Read-only + throwaway — rebuilt only when the
// view content changes. The panel knows nothing about fog: the builder already resolved every value through
// the StatusVisibility funnel, so an `unknown` row is just a neutral "— unknown —" line here.

import Phaser from 'phaser';
import type { ScreenRow, ScreenView, Tone } from './screenView';

const TONE_COLOR: Record<Tone, string> = {
  brass: '#d8b24a', // player / money / positive
  blood: '#c0392b', // rival / danger
  law: '#8fa9c4', // Bureau / blue-gray
  money: '#6fae6f', // dirty green
  neutral: '#c8bfa8', // fog / bone
};
const HEADING_COLOR = '#b9a878';
const UNKNOWN_COLOR = '#6b6358'; // muted — a masked fog row reads as absent, not alarming
const MONO = 'Courier New, monospace';

function meterBar(value: number, max: number): string {
  const n = 16;
  const filled = max > 0 ? Math.max(0, Math.min(n, Math.round((value / max) * n))) : 0;
  return `[${'▮'.repeat(filled)}${'▯'.repeat(n - filled)}]`;
}

function rowText(row: ScreenRow): { text: string; color: string } {
  switch (row.kind) {
    case 'value':
      return { text: `  ${row.label}${row.value ? `: ${row.value}` : ''}${row.delta ? `  (${row.delta})` : ''}`, color: TONE_COLOR[row.tone ?? 'neutral'] };
    case 'meter':
      return { text: `  ${row.label} ${meterBar(row.value, row.max)} ${Math.round(row.value)}/${row.max}`, color: TONE_COLOR[row.tone ?? 'neutral'] };
    case 'source':
      return { text: `    ${row.label} … ${row.contribution}${row.note ? `  — ${row.note}` : ''}`, color: TONE_COLOR[row.tone ?? 'neutral'] };
    case 'unit':
      return { text: `  ${row.name} — ${row.role} — ${row.primary}${row.badge ? `  [${row.badge}]` : ''}`, color: TONE_COLOR[row.tone ?? 'neutral'] };
    case 'incident':
      return { text: `  wk${row.week} [${row.category}/${row.severity}] ${row.summary}`, color: TONE_COLOR[row.tone ?? 'neutral'] };
    case 'unknown':
      return { text: `  ${row.label} — ${row.note ?? 'unknown'} —`, color: UNKNOWN_COLOR };
    case 'note':
      return { text: `  ${row.text}`, color: '#9a917f' };
  }
}

export class StatusScreenPanel {
  private readonly scene: Phaser.Scene;
  private readonly register: (o: Phaser.GameObjects.GameObject) => void;
  private root?: Phaser.GameObjects.Container;
  private lastJson = '';

  /** `register` is IsoScene.hudFx — makes the world camera ignore these fixed-HUD objects. */
  constructor(scene: Phaser.Scene, register: (o: Phaser.GameObjects.GameObject) => void) {
    this.scene = scene;
    this.register = register;
  }

  get isOpen(): boolean {
    return this.root !== undefined;
  }

  /** Render (or re-render on change) the given view. Cheap: skips a rebuild when content is unchanged. */
  render(view: ScreenView): void {
    const jsonKey = JSON.stringify(view);
    if (this.root && jsonKey === this.lastJson) return;
    this.lastJson = jsonKey;
    this.destroyRoot();

    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    const panelW = Math.min(680, W - 40);
    const panelH = Math.min(H - 40, 40 + this.countLines(view) * 20 + 40);
    const x = Math.round((W - panelW) / 2);
    const y = Math.round((H - panelH) / 2);

    const c = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(300000);
    const backdrop = this.scene.add.rectangle(x, y, panelW, panelH, 0x171310, 0.95)
      .setOrigin(0, 0).setStrokeStyle(2, 0x4a3f2e).setScrollFactor(0).setInteractive();
    c.add(backdrop);
    const title = this.scene.add.text(x + 16, y + 12, view.title.toUpperCase(), {
      fontFamily: MONO, fontSize: '18px', color: '#d8b24a', fontStyle: 'bold',
    }).setScrollFactor(0);
    c.add(title);
    c.add(this.scene.add.text(x + panelW - 16, y + 14, '] next · click to close', {
      fontFamily: MONO, fontSize: '11px', color: '#6b6358',
    }).setOrigin(1, 0).setScrollFactor(0));

    let ly = y + 44;
    const maxY = y + panelH - 16;
    outer: for (const section of view.sections) {
      if (section.heading) {
        if (ly > maxY - 16) { this.overflow(c, x + 16, ly); break; }
        c.add(this.scene.add.text(x + 16, ly, section.heading, { fontFamily: MONO, fontSize: '12px', color: HEADING_COLOR, fontStyle: 'bold' }).setScrollFactor(0));
        ly += 20;
      }
      for (const row of section.rows) {
        if (ly > maxY - 16) { this.overflow(c, x + 16, ly); break outer; }
        const { text, color } = rowText(row);
        c.add(this.scene.add.text(x + 16, ly, text, { fontFamily: MONO, fontSize: '13px', color, wordWrap: { width: panelW - 32 } }).setScrollFactor(0));
        ly += 20;
      }
      ly += 6;
    }

    // Close on a click anywhere on the backdrop.
    backdrop.on('pointerdown', () => this.hide());
    this.register(c);
    this.root = c;
  }

  private overflow(c: Phaser.GameObjects.Container, x: number, y: number): void {
    c.add(this.scene.add.text(x, y, '  … more (screen truncated)', { fontFamily: MONO, fontSize: '12px', color: '#6b6358' }).setScrollFactor(0));
  }

  private countLines(view: ScreenView): number {
    return view.sections.reduce((n, s) => n + (s.heading ? 1 : 0) + s.rows.length + 1, 0);
  }

  hide(): void {
    this.destroyRoot();
    this.lastJson = '';
  }

  private destroyRoot(): void {
    this.root?.destroy(true); // destroys children too
    this.root = undefined;
  }
}
