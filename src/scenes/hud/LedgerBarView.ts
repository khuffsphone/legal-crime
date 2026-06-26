// HUD PHASE 2 — the TOP LEDGER BAR render (Phaser; PLAYTEST-GATED). Draws the pure LedgerBarModel as a
// ~56px newspaper-masthead bar on the SACRED fixed-HUD camera — it OVERLAYS, never resizes/offsets/shakes the
// world camera. All decisions/strings come from the tested model; this only lays out pixels.
//
// COLOUR LAW: static ink is brass / bone / fog (case-file). Gains vs losses differ by the ▲/▼ GLYPH, BOTH in
// brass — never green/red. Bright danger is MOTION-ONLY: a brief pulse when a federal rung is freshly crossed
// (tracked here), and a slow shimmer while at RAID / over the dirty-danger line. Reuses the Phase-1 clipped
// procedural-frame idiom.

import Phaser from 'phaser';
import { NOIR_PALETTE, NOIR_FONT, NOIR_DISPLAY } from '../theme';
import { SPEC, hexNum } from '../visualSpec';
import { trendGlyph, type LedgerBarModel, type HeatRung } from './ledgerBar';

const BAR_X = 8, BAR_Y = 6, BAR_H = 56;
const INK = 0x0a0807;
const RUNG_ORDER: readonly HeatRung[] = ['CLEAR', 'NOTICE', 'WATCH', 'RAID'];

export class LedgerBarView {
  private scene: Phaser.Scene;
  private g: Phaser.GameObjects.Graphics;
  private t: Record<string, Phaser.GameObjects.Text> = {};
  private container: Phaser.GameObjects.Container;
  private prevRungIdx = 0;
  private crossPulseUntil = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.g = scene.add.graphics();
    const mk = (size: string, color: string, bold = false, display = false, originX = 0): Phaser.GameObjects.Text =>
      scene.add.text(0, 0, '', { fontFamily: display ? NOIR_DISPLAY : NOIR_FONT, fontSize: size, color, fontStyle: bold ? 'bold' : 'normal' }).setOrigin(originX, 0);
    // heroes
    this.t.cleanLabel = mk('11px', NOIR_PALETTE.fog, true, true);
    this.t.cleanValue = mk('30px', NOIR_PALETTE.brass, true, true);
    this.t.cleanTrend = mk('14px', NOIR_PALETTE.brass, true, true);
    this.t.dirtyLabel = mk('11px', NOIR_PALETTE.fog, true, true);
    this.t.dirtyValue = mk('30px', NOIR_PALETTE.bone, true, true);
    this.t.dirtyTrend = mk('14px', NOIR_PALETTE.brass, true, true);
    this.t.dirtyCap = mk('10px', NOIR_PALETTE.fog, false, false);
    // heat ladder
    this.t.heatRung = mk('12px', NOIR_PALETTE.brass, true, true);
    this.t.heatToRaid = mk('10px', NOIR_PALETTE.fog, false, false);
    this.t.tickNotice = mk('9px', NOIR_PALETTE.fog, false, false, 0.5);
    this.t.tickWatch = mk('9px', NOIR_PALETTE.fog, false, false, 0.5);
    this.t.tickRaid = mk('9px', NOIR_PALETTE.fog, false, false, 0.5);
    // win-path ticker + budget
    this.t.winPaths = mk('12px', NOIR_PALETTE.bone, true, false);
    this.t.budget = mk('12px', NOIR_PALETTE.bone, true, false);
    // week / clock / pause (right anchor)
    this.t.week = mk('12px', NOIR_PALETTE.fog, true, true, 1);
    this.t.clock = mk('15px', NOIR_PALETTE.bone, true, true, 1);

    this.container = scene.add.container(0, 0, [this.g, ...Object.values(this.t)]).setScrollFactor(0).setDepth(100000);
  }

  /** Register with the scene's fixed-HUD camera (hudFx) so the WORLD camera ignores the bar (no double-render). */
  get root(): Phaser.GameObjects.Container { return this.container; }

  /** Draw the bar from the model. `now` drives the motion-only danger pulses. */
  render(m: LedgerBarModel, now: number): void {
    const W = this.scene.scale.width;
    const barW = W - BAR_X * 2;
    const g = this.g;
    g.clear();

    // ── frame: near-black fill, brass strokes, a masthead rule under the hero row ──
    g.fillStyle(INK, 0.92).fillRect(BAR_X, BAR_Y, barW, BAR_H);
    g.lineStyle(2, hexNum(SPEC.brass), 0.8).strokeRect(BAR_X, BAR_Y, barW, BAR_H);
    g.lineStyle(1, hexNum(SPEC.brass), 0.25).beginPath();
    g.moveTo(BAR_X + 8, BAR_Y + 38); g.lineTo(BAR_X + barW - 8, BAR_Y + 38); g.strokePath();

    const top = BAR_Y + 6, sub = BAR_Y + 41;

    // ── CLEAN | DIRTY paired HERO (left) ──
    const cleanX = BAR_X + 14;
    this.t.cleanLabel.setText('CLEAN').setPosition(cleanX, top);
    this.t.cleanValue.setText(m.cash.cleanText).setPosition(cleanX, top + 12);
    this.t.cleanTrend.setText(trendGlyph(m.cash.cleanTrend)).setPosition(cleanX + this.t.cleanValue.width + 4, top + 16);

    const dirtyX = cleanX + 168;
    this.t.dirtyLabel.setText('DIRTY').setPosition(dirtyX, top);
    this.t.dirtyValue.setText(m.cash.dirtyText).setPosition(dirtyX, top + 12);
    this.t.dirtyTrend.setText(trendGlyph(m.cash.dirtyTrend)).setPosition(dirtyX + this.t.dirtyValue.width + 4, top + 16);
    // dirty EXPOSURE meter (under the dirty hero) + "% SAFE CAP" — the spread is the read.
    const mx = dirtyX, my = sub + 2, mw = 120, mh = 5;
    g.fillStyle(hexNum(SPEC.soot ?? NOIR_PALETTE.fog), 0.9).fillRect(mx, my, mw, mh);
    g.fillStyle(hexNum(SPEC.brass), 0.9).fillRect(mx, my, mw * m.cash.exposureFill, mh);
    // over the dirty-danger line → a MOTION shimmer on the meter edge (never a static red wash).
    if (m.cash.overDanger) {
      const a = 0.35 + 0.45 * Math.abs(Math.sin(now / 220));
      g.lineStyle(1, hexNum(SPEC.danger), a).strokeRect(mx - 1, my - 1, mw + 2, mh + 2);
    }
    this.t.dirtyCap.setText(`${m.cash.safeCapPct}% of cap`).setPosition(mx + mw + 8, sub);

    // ── FEDERAL HEAT LADDER (centre): a segmented rail with NOTICE/WATCH/RAID ticks ──
    const railX = dirtyX + 320, railY = top + 18, railW = 240, railH = 7;
    g.fillStyle(hexNum(SPEC.soot ?? NOIR_PALETTE.fog), 0.9).fillRect(railX, railY, railW, railH);
    g.fillStyle(hexNum(SPEC.brass), 0.85).fillRect(railX, railY, railW * m.heat.fill, railH);
    const tickLabel = [this.t.tickNotice, this.t.tickWatch, this.t.tickRaid];
    m.heat.ticks.forEach((tk, i) => {
      const tx = railX + railW * (tk.at / 100);
      g.lineStyle(1, hexNum(SPEC.brass), tk.passed ? 0.95 : 0.55).beginPath();
      g.moveTo(tx, railY - 3); g.lineTo(tx, railY + railH + 3); g.strokePath();
      tickLabel[i].setText(tk.name).setColor(tk.passed ? NOIR_PALETTE.brass : NOIR_PALETTE.fog).setPosition(tx, railY + railH + 4);
    });
    this.t.heatRung.setText(`FED: ${m.heat.rung}`).setPosition(railX, top);
    this.t.heatToRaid.setText(`${m.heat.toRaid} to RAID`).setPosition(railX + railW - 2, top + 2).setOrigin(1, 0);

    // motion-only DANGER pulse when a rung is freshly CROSSED (or a slow shimmer at RAID).
    const rungIdx = RUNG_ORDER.indexOf(m.heat.rung);
    if (rungIdx > this.prevRungIdx) this.crossPulseUntil = now + 900;
    this.prevRungIdx = rungIdx;
    const pulsing = now < this.crossPulseUntil || m.heat.rung === 'RAID';
    if (pulsing) {
      const a = (now < this.crossPulseUntil ? 0.8 : 0.3) * Math.abs(Math.sin(now / 180));
      g.lineStyle(2, hexNum(SPEC.danger), a).strokeRect(railX - 2, railY - 14, railW + 4, railH + 26);
    }

    // ── WIN-PATH TICKER + BUDGET (sub-row, centre-left) ──
    this.t.winPaths.setText(`${m.winPaths.domText}   ·   ${m.winPaths.straightText}   ·   ${m.winPaths.electText}`).setPosition(cleanX, sub);
    this.t.budget.setText(m.budget.text)
      .setColor(m.budget.bottleneck ? NOIR_PALETTE.brass : NOIR_PALETTE.bone)
      .setPosition(railX, sub);
    // a bottleneck (net ≤ 0) gets a brief motion underline tick (brass, pulsing) — emphasis without colour.
    if (m.budget.bottleneck) {
      const a = 0.4 + 0.4 * Math.abs(Math.sin(now / 240));
      g.lineStyle(1, hexNum(SPEC.brass), a).beginPath();
      g.moveTo(railX, sub + 15); g.lineTo(railX + this.t.budget.width, sub + 15); g.strokePath();
    }

    // ── WEEK / CLOCK / PAUSE (right anchor) ──
    const rightX = BAR_X + barW - 14;
    this.t.week.setText(m.weekText).setPosition(rightX, top);
    this.t.clock.setText(m.paused ? '❚❚ PAUSED' : m.clockText).setPosition(rightX, top + 14);
  }
}
