// RTS-10 — Vision Pass: the Living City. A Fedora-Noir isometric crime map rendered from pure
// procedural art (cityArt.ts) — recognizable figures, brick buildings with a "paying protection"
// coin, a legible cobbled city, hover tooltips, an always-on HUD with the federal ladder, an
// incident feed, onboarding, and juice. Rendering + input only; all game logic is /src/sim.

import Phaser from 'phaser';
import {
  gridToScreen,
  screenToGrid,
  screenToTile,
  tileCorners,
  depthValue,
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
  pendingCollection,
  extortAtTile,
  firstObjective,
  hqTileOf,
  businessTileOf,
  businessAtTile,
  realtimeHudView,
  collectorCarryView,
  threatenedCollectors,
  anyCollectorInDanger,
  unitFacing,
  facesRight,
  inspectUnit,
  inspectBusiness,
  inspectDistrict,
  type GameState,
  type MapLayout,
  type Selection,
  type NavGrid,
  type MovableUnit,
  type ThreatView,
  type InterceptionEvent,
  type IncidentRecord,
  type IncidentSeverity,
  type ShockKind,
} from '../sim';
import { NOIR_PALETTE, NOIR_FONT, heatLabel, shockFlavor } from './theme';
import {
  buildCityTextures,
  figureKeyForRole,
  drawIsoBuilding,
  BUILDING_STYLES,
  TEX,
  PAL,
} from './cityArt';

const COLS = 16;
const ROWS = 16;
const PAN_SPEED = 600;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 2.6;
const CLICK_SLOP = 6;

const FED_T1 = 50;
const FED_T2 = 70;
const FED_T3 = 85;

// Subtle per-district colour identity (a tint multiplied over the cobbles).
const DISTRICT_TINT = [0xffffff, 0xe7dcc6, 0xccd2d8, 0xe6cfae, 0xd9c6c2];

function districtOfTile(gy: number): number {
  return Phaser.Math.Clamp(Math.round((gy - 1) / 3), 0, 4);
}

interface Block { gx: number; gy: number; style: keyof typeof BUILDING_STYLES; }
// Filler tenements — city density AND nav obstacles the collector routes around.
const BLOCKS: Block[] = [
  { gx: 5, gy: 6, style: 'warehouse' },
  { gx: 6, gy: 6, style: 'speakeasy' },
  { gx: 10, gy: 5, style: 'speakeasy' },
  { gx: 11, gy: 11, style: 'warehouse' },
  { gx: 8, gy: 13, style: 'speakeasy' },
];

interface UnitView {
  unit: MovableUnit;
  faction: 'player' | 'rival';
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  factionRing: Phaser.GameObjects.Ellipse;
  selRing: Phaser.GameObjects.Ellipse;
  cashTag?: Phaser.GameObjects.Text;
  dangerRing?: Phaser.GameObjects.Ellipse;
}

interface BizMarker { coin: Phaser.GameObjects.Image; roofX: number; roofY: number; }

export class IsoScene extends Phaser.Scene {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private navGrid!: NavGrid;
  private state!: GameState;
  private layout!: MapLayout;
  private units: UnitView[] = [];
  private bizMarkers = new Map<string, BizMarker>();
  private selection: Selection = emptySelection();
  private pressX = 0;
  private pressY = 0;
  private robbedCollectors = new Set<string>();

  // HUD objects
  private hudPanel?: Phaser.GameObjects.Text;
  private fedBar?: Phaser.GameObjects.Graphics;
  private weekBar?: Phaser.GameObjects.Graphics;
  private statusText?: Phaser.GameObjects.Text;
  private warningBanner?: Phaser.GameObjects.Text;
  private feedTitle?: Phaser.GameObjects.Text;
  private feedLines: Phaser.GameObjects.Text[] = [];
  private feedVisible = true;
  private tooltipBg?: Phaser.GameObjects.Graphics;
  private tooltipText?: Phaser.GameObjects.Text;
  private legend?: Phaser.GameObjects.Container;
  private nightVeil?: Phaser.GameObjects.Rectangle;
  private objTitle?: Phaser.GameObjects.Text;
  private objDetail?: Phaser.GameObjects.Text;
  private highlight?: Phaser.GameObjects.Ellipse;

  constructor() {
    super('IsoScene');
  }

  create(): void {
    buildCityTextures(this);
    const cam = this.cameras.main;
    cam.setBackgroundColor(PAL.soot);

    // RTS-11: start with a small loyal crew so the opening is fair (muscle + defense).
    this.state = createInitialState(1, { startingCrew: true });
    this.layout = buildMapLayout(this.state, COLS, ROWS);
    this.navGrid = makeGrid(COLS, ROWS, BLOCKS.map((b) => ({ gx: b.gx, gy: b.gy })));

    this.drawCity();
    this.spawnUnits();

    const mid = gridToScreen((COLS - 1) / 2, (ROWS - 1) / 2);
    cam.centerOn(mid.x, mid.y);
    cam.setZoom(0.8);

    this.setupCameraControls();
    this.setupSelectionInput();
    this.setupHoverTooltip();
    this.drawHud();
    this.buildObjective();
    this.buildLegend();
  }

  // ── onboarding objective (RTS-11) ────────────────────────────────────────────────────────

  private buildObjective(): void {
    // A pulsing world-space ring over the suggested first target.
    this.highlight = this.add.ellipse(0, 0, 96, 50).setStrokeStyle(3, PAL.brass, 1).setVisible(false);
    // A persistent top-centre objective banner.
    this.objTitle = this.add.text(this.scale.width / 2, 12, '', { fontFamily: NOIR_FONT, fontSize: '16px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100000);
    this.objDetail = this.add.text(this.scale.width / 2, 34, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, align: 'center', wordWrap: { width: 520 } }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100000);
  }

  private refreshObjective(): void {
    if (!this.objTitle || !this.objDetail || !this.highlight) return;
    const o = firstObjective(this.state);
    const cx = this.scale.width / 2;
    this.objTitle.setText(`▶  ${o.title}`).setPosition(cx, 12).setColor(o.done ? NOIR_PALETTE.fog : NOIR_PALETTE.brass);
    this.objDetail.setText(o.detail).setPosition(cx, 34);

    if (o.step === 'extort' && o.targetBusinessId) {
      const t = businessTileOf(this.layout, o.targetBusinessId);
      if (t) {
        const c = gridToScreen(t.gx, t.gy);
        const pulse = 1 + 0.12 * Math.sin(this.time.now / 180);
        this.highlight.setVisible(true).setPosition(c.x, c.y + 4).setScale(pulse).setDepth(depthValue(t.gx, t.gy) * 10 + 9);
        return;
      }
    }
    this.highlight.setVisible(false);
  }

  // ── the city ─────────────────────────────────────────────────────────────────────────────

  private drawCity(): void {
    // cobbled ground with streets + district tint
    for (let gx = 0; gx < COLS; gx++) {
      for (let gy = 0; gy < ROWS; gy++) {
        const c = gridToScreen(gx, gy);
        const road = gx % 4 === 0 || gy % 4 === 0;
        const tile = this.add
          .image(c.x, c.y, road ? TEX.tileStreet : TEX.tileLot)
          .setDepth(depthValue(gx, gy) * 10)
          .setTint(DISTRICT_TINT[districtOfTile(gy)]);
        if (!road) tile.setAlpha(0.96);
      }
    }

    // filler tenements (also nav obstacles)
    for (const b of BLOCKS) {
      const c = gridToScreen(b.gx, b.gy);
      drawIsoBuilding(this, c.x, c.y, BUILDING_STYLES[b.style], depthValue(b.gx, b.gy) * 10 + 5);
    }

    // businesses — brick storefronts; a protection coin floats over player-extorted fronts
    for (const d of this.state.districts) {
      for (const biz of d.businesses) {
        const t = businessTileOf(this.layout, biz.id);
        if (!t) continue;
        const c = gridToScreen(t.gx, t.gy);
        const styleKey = biz.kind === 'front' ? 'storefront' : biz.kind === 'speakeasy' || biz.kind === 'numbers' ? 'speakeasy' : 'warehouse';
        const roof = drawIsoBuilding(this, c.x, c.y, BUILDING_STYLES[styleKey], depthValue(t.gx, t.gy) * 10 + 5);
        const coin = this.add
          .image(roof.roofX, roof.roofY - 6, TEX.coin)
          .setDepth(depthValue(t.gx, t.gy) * 10 + 7)
          .setVisible(false);
        this.bizMarkers.set(biz.id, { coin, roofX: roof.roofX, roofY: roof.roofY });
      }
    }

    // HQs — a distinct brass-trimmed tower with a faction flag
    for (const fid of ['player', 'rival-a', 'rival-b'] as const) {
      const hq = hqTileOf(this.layout, fid);
      if (!hq) continue;
      const c = gridToScreen(hq.gx, hq.gy);
      const roof = drawIsoBuilding(this, c.x, c.y, BUILDING_STYLES.hq, depthValue(hq.gx, hq.gy) * 10 + 5);
      const flagCol = fid === 'player' ? PAL.brass : PAL.blood;
      this.add.rectangle(roof.roofX, roof.roofY - 10, 3, 20, PAL.ink).setDepth(depthValue(hq.gx, hq.gy) * 10 + 7);
      this.add.triangle(roof.roofX + 9, roof.roofY - 16, 0, 0, 16, 4, 0, 8, flagCol).setDepth(depthValue(hq.gx, hq.gy) * 10 + 7);
      this.add
        .text(roof.roofX, roof.roofY - 24, fid === 'player' ? 'YOUR HQ' : 'RIVAL', {
          fontFamily: NOIR_FONT, fontSize: '10px', color: NOIR_PALETTE.bone,
        })
        .setOrigin(0.5, 1)
        .setDepth(depthValue(hq.gx, hq.gy) * 10 + 7);
    }
  }

  // ── units ────────────────────────────────────────────────────────────────────────────────

  private spawnUnits(): void {
    // Your two starting button men, near the home front (the player drives the first move now).
    this.addUnit(spawnUnit('muscle-1', 3, 2), 'player');
    this.addUnit(spawnUnit('muscle-2', 4, 2), 'player');
    // A rival enforcer prowls — the threat your collector must dodge once cash is on the street.
    this.addUnit(spawnEnforcer('rival-gun', 14, 1, 'rival-a', 2.2), 'rival');
  }

  /** The nearest player collector currently carrying a take, if any (the rival's prey). */
  private playerCarrier(): MovableUnit | undefined {
    return this.state.units.find((u) => u.role === 'collector' && u.factionId === 'player' && (u.carrying ?? 0) > 0);
  }

  private addUnit(unit: MovableUnit, faction: 'player' | 'rival'): void {
    this.state.units.push(unit);
    this.attachView(unit, faction);
  }

  private attachView(unit: MovableUnit, faction: 'player' | 'rival'): void {
    const ringColor = faction === 'player' ? PAL.brass : PAL.blood;
    const shadow = this.add.ellipse(0, 0, 22, 11, PAL.soot, 0.5);
    const factionRing = this.add.ellipse(0, 0, 26, 13).setStrokeStyle(2, ringColor, 0.9);
    const selRing = this.add.ellipse(0, 0, 34, 18).setStrokeStyle(2, PAL.bone, 1).setVisible(false);
    const sprite = this.add.image(0, 0, figureKeyForRole(unit.role)).setOrigin(0.5, 0.92);
    const view: UnitView = { unit, faction, sprite, shadow, factionRing, selRing };
    if (unit.role === 'collector') {
      view.dangerRing = this.add.ellipse(0, 0, 40, 22).setStrokeStyle(3, PAL.blood, 1).setVisible(false);
      view.cashTag = this.add
        .text(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.brass, fontStyle: 'bold' })
        .setOrigin(0.5, 1)
        .setVisible(false);
    }
    this.units.push(view);
  }

  private updateUnits(dt: number): void {
    // rival hunts whichever player collector is carrying cash
    const collector = this.playerCarrier();
    const gun = this.state.units.find((u) => u.id === 'rival-gun');
    if (collector && gun) issueMove(gun, unitTile(collector), this.navGrid);

    const obs = observeWorld(this.state, dt);
    this.state = obs.state;
    for (const ev of obs.result.interceptions) this.flashAmbush(ev);
    for (const dep of processCollectorArrivals(this.state, this.layout)) this.flashDeposit(dep.collectorId, dep.banked);
    this.state = harvestIncidents(this.state);

    const threats = new Map<string, ThreatView>(threatenedCollectors(this.state).map((t) => [t.collectorId, t]));
    const now = this.time.now;
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(now / 220));

    for (const v of this.units) {
      const s = unitScreenPos(v.unit);
      const tile = v.unit.pos;
      const depth = depthValue(Math.round(tile.gx), Math.round(tile.gy)) * 10 + 8;
      const moving = v.unit.path.length > 0;
      const bob = moving ? Math.sin(now / 90 + s.x) * 1.5 : Math.sin(now / 600 + s.x) * 0.6;

      v.sprite.setPosition(s.x, s.y - bob).setDepth(depth).setFlipX(!facesRight(unitFacing(v.unit)));
      v.shadow.setPosition(s.x, s.y + 2).setDepth(depth - 2);
      v.factionRing.setPosition(s.x, s.y + 2).setDepth(depth - 1);

      const selected = isSelected(this.selection, v.unit.id);
      v.selRing.setPosition(s.x, s.y + 2).setDepth(depth - 1).setVisible(selected).setAlpha(pulse);

      if (v.cashTag && v.dangerRing) {
        const carry = collectorCarryView(v.unit);
        v.cashTag.setVisible(carry.vulnerable).setPosition(s.x, s.y - 40).setDepth(depth + 1);
        if (carry.vulnerable) v.cashTag.setText(`$${carry.carrying}`);
        const threat = carry.vulnerable ? threats.get(v.unit.id) : undefined;
        if (threat) {
          const col = threat.level === 'ambush' ? PAL.blood : PAL.brass;
          v.dangerRing.setStrokeStyle(3, col, pulse).setPosition(s.x, s.y + 2).setDepth(depth - 1).setVisible(true);
          v.cashTag.setColor(threat.level === 'ambush' ? NOIR_PALETTE.blood : NOIR_PALETTE.brass);
        } else {
          v.dangerRing.setVisible(false);
          v.cashTag.setColor(NOIR_PALETTE.brass);
        }
      }
    }

    // animate protection coins over player-extorted fronts
    for (const [bid, m] of this.bizMarkers) {
      const insp = inspectBusiness(this.state, bid);
      const on = !!insp?.payingProtection;
      m.coin.setVisible(on);
      if (on) {
        m.coin.setAngle((now / 6) % 360);
        m.coin.setY(m.roofY - 6 + Math.sin(now / 300) * 2);
      }
    }
  }

  private flashAmbush(ev: InterceptionEvent): void {
    if (this.robbedCollectors.has(ev.collectorId)) return;
    this.robbedCollectors.add(ev.collectorId);
    const v = this.units.find((u) => u.unit.id === ev.collectorId);
    if (!v) return;
    const s = unitScreenPos(v.unit);
    const burst = this.add.circle(s.x, s.y - 8, 8).setStrokeStyle(4, PAL.blood, 1).setDepth(100001);
    this.tweens.add({ targets: burst, scale: 7, alpha: 0, duration: 650, onComplete: () => burst.destroy() });
    this.cameras.main.shake(240, 0.005);
    const flash = this.add
      .text(s.x, s.y - 50, `ROBBED  $${ev.amount}`, { fontFamily: NOIR_FONT, fontSize: '18px', color: NOIR_PALETTE.blood, fontStyle: 'bold' })
      .setOrigin(0.5, 1).setDepth(100002);
    this.tweens.add({ targets: flash, y: s.y - 96, alpha: 0, duration: 1900, onComplete: () => flash.destroy() });
    if (v.cashTag) v.cashTag.setVisible(false);
    if (v.dangerRing) v.dangerRing.setVisible(false);
    this.setStatus(`collector ambushed — $${ev.amount} gone to ${ev.attackerFaction}`);
  }

  private flashDeposit(collectorId: string, banked: number): void {
    const v = this.units.find((u) => u.unit.id === collectorId);
    if (!v) return;
    const s = unitScreenPos(v.unit);
    const flash = this.add
      .text(s.x, s.y - 50, `+ $${banked} BANKED`, { fontFamily: NOIR_FONT, fontSize: '16px', color: NOIR_PALETTE.brass, fontStyle: 'bold' })
      .setOrigin(0.5, 1).setDepth(100002);
    this.tweens.add({ targets: flash, y: s.y - 92, alpha: 0, duration: 1700, onComplete: () => flash.destroy() });
    this.setStatus(`collector reached HQ — banked $${banked}`);
  }

  // ── selection & command ──────────────────────────────────────────────────────────────────

  private setupSelectionInput(): void {
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.pressX = p.x; this.pressY = p.y; });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.legend?.visible) { this.hideLegend(); return; }
      if (Math.hypot(p.x - this.pressX, p.y - this.pressY) > CLICK_SLOP) return;
      const shift = !!(p.event as MouseEvent | undefined)?.shiftKey;
      if (p.rightButtonReleased()) this.commandMove(p);
      else this.commandSelect(p, shift);
    });
  }

  private commandSelect(p: Phaser.Input.Pointer, shift: boolean): void {
    const point = screenToGrid(p.worldX, p.worldY);
    const hit = pickUnit(this.units.map((v) => v.unit), point);
    if (!hit) { if (!shift) this.selection = clearSelection(); }
    else if (shift) this.selection = toggleSelection(this.selection, hit.id);
    else this.selection = selectOnly(hit.id);
    this.setStatus();
  }

  private commandMove(p: Phaser.Input.Pointer): void {
    if (this.selection.ids.length === 0) return;
    const target = screenToTile(p.worldX, p.worldY);
    if (!isCommandableTile(target, this.navGrid)) { this.drawTargetMarker(target, false); return; }
    const res = resolveMoveCommand(this.units.map((v) => v.unit), this.selection.ids, target, this.navGrid);
    this.drawTargetMarker(target, res.moved.length > 0);
    this.setStatus(`moving ${res.moved.length} → (${target.gx},${target.gy})${res.failed.length ? ` · ${res.failed.length} blocked` : ''}`);
  }

  private drawTargetMarker(tile: { gx: number; gy: number }, ok: boolean): void {
    const c = gridToScreen(tile.gx, tile.gy);
    const corners = tileCorners(tile.gx, tile.gy).map((pt) => ({ x: pt.x - c.x, y: pt.y - c.y }));
    const mark = this.add.polygon(c.x, c.y, corners).setStrokeStyle(3, ok ? PAL.brass : PAL.blood, 1).setDepth(depthValue(tile.gx, tile.gy) * 10 + 9);
    this.tweens.add({ targets: mark, scale: ok ? 0.4 : 1, alpha: 0, duration: 650, onComplete: () => mark.destroy() });
  }

  // ── guided onboarding actions (RTS-11) ───────────────────────────────────────────────────

  /** [E] — lean on the suggested front. Shows a clear success / "resisted" beat either way. */
  private commandExtort(): void {
    const obj = firstObjective(this.state);
    if (obj.step !== 'extort' || !obj.targetBusinessId) { this.setStatus('no shakedown target — expand your turf first'); return; }
    const tile = businessTileOf(this.layout, obj.targetBusinessId);
    if (!tile) return;
    extortAtTile(this.state, this.layout, 'player', tile);
    this.state = harvestIncidents(this.state); // log the attempt into The Wire
    const c = gridToScreen(tile.gx, tile.gy);
    const insp = inspectBusiness(this.state, obj.targetBusinessId);
    if (insp?.payingProtection) {
      this.seedBackPay(obj.targetBusinessId);
      this.floatText(c.x, c.y - 30, 'NOW PAYS PROTECTION', NOIR_PALETTE.brass);
      this.setStatus(`${insp.name} pays protection — collect the take with [C]`);
    } else {
      this.floatText(c.x, c.y - 30, 'RESISTED — try again', NOIR_PALETTE.blood);
      this.setStatus('they held out — extortion is a roll, press [E] again');
    }
  }

  /** [C] — send a collector from the first district that has player takings waiting. */
  private commandCollect(): void {
    for (const d of this.state.districts) {
      if (pendingCollection(this.state, 'player', d.id) > 0) {
        const run = startCollectorRun(this.state, this.layout, 'player', d.id, this.navGrid);
        if (run.unit) { this.attachView(run.unit, 'player'); this.setStatus(`collector dispatched from ${d.name} — walk it home`); return; }
      }
    }
    this.setStatus('nothing to collect yet — takings build each week after a shakedown');
  }

  /** Give a freshly-shaken front a little back-pay so the collect step is immediately playable. */
  private seedBackPay(businessId: string): void {
    for (const d of this.state.districts) {
      const b = d.businesses.find((x) => x.id === businessId);
      if (b) { b.uncollected = (b.uncollected ?? 0) + 320; return; }
    }
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add.text(x, y, text, { fontFamily: NOIR_FONT, fontSize: '15px', color, fontStyle: 'bold' }).setOrigin(0.5, 1).setDepth(100002);
    this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 1500, onComplete: () => t.destroy() });
  }

  // ── hover tooltip ────────────────────────────────────────────────────────────────────────

  private setupHoverTooltip(): void {
    this.tooltipBg = this.add.graphics().setScrollFactor(0).setDepth(100050).setVisible(false);
    this.tooltipText = this.add.text(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, lineSpacing: 2 }).setScrollFactor(0).setDepth(100051).setVisible(false);

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) { this.hideTooltip(); return; }
      this.updateTooltip(p);
    });
  }

  private updateTooltip(p: Phaser.Input.Pointer): void {
    const text = this.hoverText(p);
    if (!text || !this.tooltipBg || !this.tooltipText) { this.hideTooltip(); return; }
    this.tooltipText.setText(text).setVisible(true);
    const w = this.tooltipText.width + 16;
    const h = this.tooltipText.height + 12;
    let x = p.x + 16, y = p.y + 16;
    x = Math.min(x, this.scale.width - w - 6);
    y = Math.min(y, this.scale.height - h - 6);
    this.tooltipBg.clear().setVisible(true);
    this.tooltipBg.fillStyle(PAL.ink, 0.92).fillRect(x, y, w, h);
    this.tooltipBg.lineStyle(1, PAL.brass, 0.8).strokeRect(x, y, w, h);
    this.tooltipText.setPosition(x + 8, y + 6);
  }

  private hoverText(p: Phaser.Input.Pointer): string | null {
    const gpoint = screenToGrid(p.worldX, p.worldY);
    const hit = pickUnit(this.units.map((v) => v.unit), gpoint);
    if (hit) {
      const i = inspectUnit(this.state, hit.id);
      if (i) {
        const lines = [`${i.kind}${i.ownerName ? ` · ${i.ownerName}` : ''}`];
        if (i.vulnerable) lines.push(`carrying $${i.carrying}  ${i.threat === 'ambush' ? '⚠ AMBUSH' : i.threat === 'threatened' ? '⚠ in danger' : 'in transit'}`);
        else lines.push('idle / no cash');
        return lines.join('\n');
      }
    }
    const tile = screenToTile(p.worldX, p.worldY);
    const bizId = businessAtTile(this.layout, tile);
    if (bizId) {
      const b = inspectBusiness(this.state, bizId);
      if (b) {
        return [
          `${b.name} (${b.kind})`,
          b.payingProtection ? 'PAYING PROTECTION — yours' : b.earnerName ? `pays ${b.earnerName}` : 'not yet shaken down',
          `income $${b.income}/wk · uncollected $${b.uncollected}`,
          `${b.districtName}`,
        ].join('\n');
      }
    }
    const di = districtOfTile(tile.gy);
    const d = inspectDistrict(this.state, `district-${di}`);
    if (d) {
      return [`${d.name}`, d.holderName ? `held by ${d.holderName}` : 'contested', `police ${d.policePresence} · your control ${d.playerControl}`].join('\n');
    }
    return null;
  }

  private hideTooltip(): void {
    this.tooltipBg?.clear().setVisible(false);
    this.tooltipText?.setVisible(false);
  }

  // ── camera ───────────────────────────────────────────────────────────────────────────────

  private setupCameraControls(): void {
    const cam = this.cameras.main;
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) { cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom; cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom; }
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.001, MIN_ZOOM, MAX_ZOOM));
    });
    this.input.keyboard?.on('keydown-E', () => this.commandExtort());
    this.input.keyboard?.on('keydown-C', () => this.commandCollect());
    this.input.keyboard?.on('keydown-L', () => this.toggleFeed());
    this.input.keyboard?.on('keydown-H', () => this.toggleLegend());
    this.input.keyboard?.on('keydown-B', () => this.scene.start('BootScene'));
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.updateUnits(dt);
    this.refreshHud();
    this.refreshObjective();
    this.refreshFeed();
    this.refreshNight();

    const cam = this.cameras.main;
    const k = this.cursors;
    if (!k) return;
    const step = (PAN_SPEED * delta) / 1000 / cam.zoom;
    if (k.left.isDown) cam.scrollX -= step;
    if (k.right.isDown) cam.scrollX += step;
    if (k.up.isDown) cam.scrollY -= step;
    if (k.down.isDown) cam.scrollY += step;
  }

  // ── HUD ──────────────────────────────────────────────────────────────────────────────────

  private drawHud(): void {
    this.add.rectangle(0, 0, 340, 150, PAL.ink, 0.55).setOrigin(0, 0).setScrollFactor(0).setDepth(99990);
    this.add
      .text(12, 10, 'LEGAL CRIME — Fedora Noir', { fontFamily: NOIR_FONT, fontSize: '16px', color: NOIR_PALETTE.brass, fontStyle: 'bold' })
      .setScrollFactor(0).setDepth(100000);
    this.hudPanel = this.add.text(12, 34, '', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.bone, lineSpacing: 3 }).setScrollFactor(0).setDepth(100000);
    this.weekBar = this.add.graphics().setScrollFactor(0).setDepth(100000);
    this.fedBar = this.add.graphics().setScrollFactor(0).setDepth(100000);
    this.statusText = this.add.text(12, 156, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.fog }).setScrollFactor(0).setDepth(100000);
    this.warningBanner = this.add.text(12, 0, '', { fontFamily: NOIR_FONT, fontSize: '15px', color: NOIR_PALETTE.blood, fontStyle: 'bold' }).setScrollFactor(0).setDepth(100000).setVisible(false);

    this.feedTitle = this.add.text(0, 12, 'THE WIRE  [L]', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setScrollFactor(0).setDepth(100000).setOrigin(1, 0);
    for (let i = 0; i < 9; i++) {
      this.feedLines.push(this.add.text(0, 32 + i * 16, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.fog }).setScrollFactor(0).setDepth(100000).setOrigin(1, 0));
    }
    this.nightVeil = this.add.rectangle(0, 0, 6000, 4000, 0x0a1020, 0).setOrigin(0, 0).setScrollFactor(0).setDepth(99980);
  }

  private refreshHud(): void {
    if (!this.hudPanel) return;
    const hud = realtimeHudView(this.state);
    const p = hud.player;
    const danger = anyCollectorInDanger(this.state);
    this.hudPanel.setText([
      `Clean $${p.cleanCash}    Dirty $${p.dirtyCash}`,
      `Heat ${p.heat} (${heatLabel(p.heat)})    Crew ${p.crew}` + (p.debt > 0 ? `    Debt $${p.debt}` : ''),
      `Week ${hud.week} — next in ${hud.weekCountdownLabel}`,
    ].join('\n'));

    // week countdown bar
    if (this.weekBar) {
      this.weekBar.clear();
      this.weekBar.fillStyle(PAL.charcoal, 1).fillRect(12, 92, 316, 6);
      this.weekBar.fillStyle(PAL.brass, 1).fillRect(12, 92, 316 * Phaser.Math.Clamp(hud.weekProgress, 0, 1), 6);
    }
    // federal exposure ladder bar with 50/70/85 ticks
    if (this.fedBar) {
      const x = 12, y = 110, w = 316;
      this.fedBar.clear();
      this.fedBar.fillStyle(PAL.charcoal, 1).fillRect(x, y, w, 8);
      const col = p.federalTier >= 3 ? PAL.blood : p.federalTier >= 2 ? 0xb5502a : p.federalTier >= 1 ? PAL.brass : PAL.brassDim;
      this.fedBar.fillStyle(col, 1).fillRect(x, y, w * Phaser.Math.Clamp(p.federalExposure / 100, 0, 1), 8);
      this.fedBar.lineStyle(1, PAL.bone, 0.7);
      for (const mk of [FED_T1, FED_T2, FED_T3]) {
        this.fedBar.beginPath(); this.fedBar.moveTo(x + (w * mk) / 100, y - 2); this.fedBar.lineTo(x + (w * mk) / 100, y + 10); this.fedBar.strokePath();
      }
    }
    this.hudPanel.setColor(p.federalTier >= 2 || danger ? '#d98a6a' : NOIR_PALETTE.bone);

    const warn = p.federalTier > 0 ? this.fedLine(p.federalTier) : danger ? 'A COLLECTOR IS UNDER THREAT — get it to HQ' : null;
    if (this.warningBanner) {
      this.warningBanner.setVisible(!!warn);
      if (warn) this.warningBanner.setText(`⚠ ${warn}`).setPosition(12, this.scale.height - 26);
    }
    if (hud.shocks.length > 0 && this.statusText && this.statusText.text.indexOf('shock') === -1) {
      // surface shocks alongside selection status
    }
    void shockFlavor; void ISO_TILE_HEIGHT;
  }

  private fedLine(tier: number): string {
    return tier >= 3 ? 'FEDERAL BUST IMMINENT — launder, cool off, or pay The Bureau' : tier >= 2 ? 'Agents are watching your fronts' : 'The Bureau is asking questions';
  }

  private setStatus(action?: string): void {
    if (!this.statusText) return;
    const sel = this.selection.ids;
    const base = sel.length === 0 ? 'Click a unit to select · right-click to move' : `selected: ${sel.join(', ')}`;
    const sh = this.state.activeShocks.map((s) => shockFlavor(s.kind as ShockKind)).join(', ');
    const hint = '  ·  [E] shake down · [C] collect';
    this.statusText.setText((action ? `${base}  ·  ${action}` : base + hint) + (sh ? `   |  ${sh}` : ''));
  }

  private toggleFeed(): void {
    this.feedVisible = !this.feedVisible;
    this.feedTitle?.setVisible(this.feedVisible);
    for (const l of this.feedLines) l.setVisible(this.feedVisible);
  }

  private static feedColor(sev: IncidentSeverity): string {
    switch (sev) { case 'danger': return NOIR_PALETTE.blood; case 'warning': return NOIR_PALETTE.brass; case 'gain': return NOIR_PALETTE.bone; default: return NOIR_PALETTE.fog; }
  }

  private refreshFeed(): void {
    if (!this.feedVisible || this.feedLines.length === 0) return;
    const right = this.scale.width - 12;
    this.feedTitle?.setPosition(right, 12);
    const recent: IncidentRecord[] = recentIncidents(this.state, this.feedLines.length);
    for (let i = 0; i < this.feedLines.length; i++) {
      const line = this.feedLines[i];
      const rec = recent[i];
      line.setPosition(right, 32 + i * 16);
      if (!rec) { line.setText(''); continue; }
      const sum = rec.summary.length > 50 ? rec.summary.slice(0, 49) + '…' : rec.summary;
      line.setText(`[w${rec.week}] ${sum}`).setColor(IsoScene.feedColor(rec.severity));
    }
  }

  /** Subtle day→night drift over the real-time week, so the city breathes. */
  private refreshNight(): void {
    if (!this.nightVeil) return;
    const phase = (Math.sin(this.time.now / 9000) + 1) / 2; // 0..1 slow
    this.nightVeil.setAlpha(0.08 + phase * 0.26);
  }

  // ── onboarding ───────────────────────────────────────────────────────────────────────────

  private buildLegend(): void {
    const w = 560, h = 300;
    const cx = this.scale.width / 2, cy = this.scale.height / 2;
    const bg = this.add.rectangle(0, 0, w, h, PAL.ink, 0.95).setStrokeStyle(2, PAL.brass, 1);
    const title = this.add.text(0, -h / 2 + 18, 'LEGAL CRIME — FEDORA NOIR', { fontFamily: NOIR_FONT, fontSize: '20px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(0.5, 0);
    const body = this.add.text(0, -h / 2 + 56, [
      'Prohibition Chicago. You run a crew. Build an empire before the law,',
      'your rivals, or your own men put you in the river.',
      '',
      'THE LOOP  (follow the ▶ objective up top)',
      '  • [E] Shake down the glowing storefront → a brass % means it pays.',
      '    It can take a try or two — extortion is a roll, not a promise.',
      '  • [C] Send a COLLECTOR — it walks the take through the streets to HQ.',
      '  • Guard it — a rival enforcer who catches it steals the cash.',
      '  • Bank it, reinvest in rackets, and bribe the four channels:',
      '    The Beat · The Bench · City Hall · The Bureau.',
      '',
      'CONTROLS',
      '  left-click select · shift adds · right-click move · drag pan · wheel zoom',
      '  [E] shake down · [C] collect · [L] the wire · [H] this help · [B] card view',
    ].join('\n'), { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.bone, lineSpacing: 3, align: 'left' }).setOrigin(0.5, 0);
    const hint = this.add.text(0, h / 2 - 26, 'click anywhere to begin', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.fog }).setOrigin(0.5, 0);
    this.legend = this.add.container(cx, cy, [bg, title, body, hint]).setScrollFactor(0).setDepth(100100);
  }

  private toggleLegend(): void {
    if (this.legend?.visible) this.hideLegend(); else this.showLegend();
  }
  private showLegend(): void { this.legend?.setPosition(this.scale.width / 2, this.scale.height / 2).setVisible(true); }
  private hideLegend(): void { this.legend?.setVisible(false); }
}
