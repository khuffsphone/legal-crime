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
  dispatchThreat,
  pendingCollection,
  extortAtTile,
  applyCommand,
  affordableOperation,
  strongholdDistrict,
  firstObjective,
  hqTileOf,
  businessTileOf,
  businessAtTile,
  realtimeHudView,
  crewReadout,
  collectorCarryView,
  threatenedCollectors,
  anyCollectorInDanger,
  unitFacing,
  facesRight,
  inspectUnit,
  inspectBusiness,
  inspectDistrict,
  cityStanding,
  telegraphedPushes,
  resolveStrategicPulse,
  offenseReadout,
  matchPhase,
  playerWeeklyNet,
  buildReadout,
  expandTargetDistrictId,
  districtHolder,
  controlOf,
  districtsHeld,
  familyStrength,
  EXPAND_COST,
  RECRUIT_COST,
  CONTROL_HOLD,
  ASSASSINATE_MIN_STRENGTH,
  canRaid,
  resolveRaid,
  canSabotage,
  resolveSabotage,
  canAssassinate,
  resolveAssassinate,
  canLockout,
  resolveLockout,
  weakestRival,
  hqIntegrityOf,
  allBusinesses,
  businessEarner,
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
  type BribeChannel,
} from '../sim';
import { NOIR_PALETTE, NOIR_FONT, heatLabel, shockFlavor, bribeChannelLabel } from './theme';
import {
  buildCityTextures,
  figureKeyForRole,
  drawIsoBuilding,
  BUILDING_STYLES,
  TEX,
  PAL,
} from './cityArt';
import {
  SPEC,
  MOTION,
  hexNum,
  satchelTier,
  dangerStageColor,
  federalBarColor,
  loyaltyMotion,
} from './visualSpec';

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

interface BizMarker { coin: Phaser.GameObjects.Image; glow?: Phaser.GameObjects.Image; roofX: number; roofY: number; }

export class IsoScene extends Phaser.Scene {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private navGrid!: NavGrid;
  private state!: GameState;
  private layout!: MapLayout;
  private units: UnitView[] = [];
  private bizMarkers = new Map<string, BizMarker>();
  private districtLabels = new Map<string, Phaser.GameObjects.Text>();
  private strategyPanel?: Phaser.GameObjects.Text;
  private strategyTitle?: Phaser.GameObjects.Text;
  private pressureBanner?: Phaser.GameObjects.Text;
  private endgameShown = false;
  private selection: Selection = emptySelection();
  private pressX = 0;
  private pressY = 0;
  private greaseIndex = 0;
  private lastTrailAt = 0;
  private robbedCollectors = new Set<string>();

  // HUD objects
  private hudPanel?: Phaser.GameObjects.Text;
  private uncollectedText?: Phaser.GameObjects.Text;
  private fedBar?: Phaser.GameObjects.Graphics;
  private weekBar?: Phaser.GameObjects.Graphics;
  private statusText?: Phaser.GameObjects.Text;
  private warningBanner?: Phaser.GameObjects.Text;
  private feedTitle?: Phaser.GameObjects.Text;
  private feedLines: Phaser.GameObjects.Text[] = [];
  private feedVisible = true;
  private crewTitle?: Phaser.GameObjects.Text;
  private crewRows: Phaser.GameObjects.Text[] = [];
  private crewWrong: Phaser.GameObjects.Rectangle[] = [];
  private crewVisible = true;
  private crewLastLoyalty = new Map<string, number>();
  private crewFlashUntil = new Map<string, number>();
  private mutinyBanner?: Phaser.GameObjects.Text;
  private tooltipBg?: Phaser.GameObjects.Graphics;
  private tooltipText?: Phaser.GameObjects.Text;
  private legend?: Phaser.GameObjects.Container;
  private nightVeil?: Phaser.GameObjects.Rectangle;
  private klaxon?: Phaser.GameObjects.Graphics;
  private objTitle?: Phaser.GameObjects.Text;
  private objDetail?: Phaser.GameObjects.Text;
  private highlight?: Phaser.GameObjects.Ellipse;
  private routeWarn?: Phaser.GameObjects.Ellipse;

  constructor() {
    super('IsoScene');
  }

  create(): void {
    buildCityTextures(this);
    const cam = this.cameras.main;
    cam.setBackgroundColor(PAL.soot);

    // RTS-11: start with a small loyal crew so the opening is fair (muscle + defense).
    // RTS-12/16: a fair opening (loyal crew + one protected run) on the BIG contested city —
    // a 9-district turf war against two active rival families.
    this.state = createInitialState(1, { startingCrew: true, tutorialFreeRuns: 1, bigCity: true });
    this.applyDebugScenario();
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
    // A blood ring over the prowling enforcer when the route is hot (RTS-13 timing telegraph).
    this.routeWarn = this.add.ellipse(0, 0, 44, 24).setStrokeStyle(3, PAL.blood, 1).setVisible(false);
    // A persistent top-centre objective banner.
    this.objTitle = this.add.text(this.scale.width / 2, 12, '', { fontFamily: NOIR_FONT, fontSize: '16px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100000);
    this.objDetail = this.add.text(this.scale.width / 2, 34, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, align: 'center', wordWrap: { width: 560 } }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100000);
  }

  private refreshObjective(): void {
    if (!this.objTitle || !this.objDetail || !this.highlight || !this.routeWarn) return;
    const o = firstObjective(this.state);
    const cx = this.scale.width / 2;
    const pulse = 1 + 0.12 * Math.sin(this.time.now / 180);
    let detail = o.detail;
    this.highlight.setVisible(false);
    this.routeWarn.setVisible(false);

    if (o.step === 'extort' && o.targetBusinessId) {
      const t = businessTileOf(this.layout, o.targetBusinessId);
      if (t) {
        const c = gridToScreen(t.gx, t.gy);
        this.highlight.setVisible(true).setPosition(c.x, c.y + 4).setScale(pulse).setDepth(depthValue(t.gx, t.gy) * 10 + 9);
      }
    } else if (o.step === 'collect') {
      // RTS-13 run-2 ramp: read the route and coach the player to WAIT for clear (unless the
      // next run is still a guaranteed tutorial run).
      const threat = dispatchThreat(this.state, this.layout, 'player');
      const protectedNext = this.state.tutorialFreeRuns > 0;
      if (!protectedNext) {
        detail = `${o.detail}\n` + (threat.hot
          ? 'ROUTE: ⚠ HOT — a rival enforcer is prowling. WAIT for it to wander off, THEN press [C].'
          : 'ROUTE: ✓ CLEAR — the coast is clear, press [C] to send now.');
        if (threat.hot && threat.enemyId) {
          const enemy = this.state.units.find((u) => u.id === threat.enemyId);
          if (enemy) {
            const c = gridToScreen(enemy.pos.gx, enemy.pos.gy);
            this.routeWarn.setVisible(true).setPosition(c.x, c.y + 2).setScale(pulse)
              .setDepth(depthValue(Math.round(enemy.pos.gx), Math.round(enemy.pos.gy)) * 10 + 9);
          }
        }
      }
    }
    this.objTitle.setText(`▶  ${o.title}`).setPosition(cx, 12).setColor(o.done ? NOIR_PALETTE.fog : NOIR_PALETTE.brass);
    this.objDetail.setText(detail).setPosition(cx, 34);
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
        const glow = this.add
          .image(roof.roofX, roof.roofY - 6, TEX.glow)
          .setDepth(depthValue(t.gx, t.gy) * 10 + 6)
          .setTint(hexNum(SPEC.brass)).setScale(0.7).setVisible(false);
        const coin = this.add
          .image(roof.roofX, roof.roofY - 6, TEX.coin)
          .setDepth(depthValue(t.gx, t.gy) * 10 + 7)
          .setVisible(false);
        this.bizMarkers.set(biz.id, { coin, glow, roofX: roof.roofX, roofY: roof.roofY });
      }
      // RTS-16: a district nameplate at its first tile, recoloured each frame by who holds it.
      const first = d.businesses[0] && businessTileOf(this.layout, d.businesses[0].id);
      if (first) {
        const c = gridToScreen(first.gx, first.gy);
        this.districtLabels.set(d.id, this.add
          .text(c.x, c.y - 2, d.name.toUpperCase(), { fontFamily: NOIR_FONT, fontSize: '11px', color: NOIR_PALETTE.fog, fontStyle: 'bold' })
          .setOrigin(0.5, 0.5).setDepth(depthValue(first.gx, first.gy) * 10 + 8));
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
    // RTS-16: the turf war moved — call out captures and routed families over the district.
    for (const cap of obs.strategy.captures) this.flashTerritory(cap.districtId, cap.before === 'player');
    for (const fid of obs.strategy.fallen) this.setStatus(`${fid} has been driven out of the city`);
    // RTS-17: a rival struck our HQ — telegraph the blow.
    if (obs.strategy.hqStrikes.length > 0) {
      this.cameras.main.shake(220, 0.006);
      this.setStatus('OUR HQ IS UNDER ATTACK');
    }
    this.state = harvestIncidents(this.state);
    // RTS-17: the contest resolved — surface the win/lose readout.
    if (obs.endgame || this.state.status !== 'playing') this.showEndgame();

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
        // The satchel grows in 3 tiers with the take; the tag scales with it (state = brass).
        const tier = carry.vulnerable ? satchelTier(carry.carrying) : 1;
        v.cashTag.setVisible(carry.vulnerable).setPosition(s.x, s.y - 40).setDepth(depth + 1)
          .setScale(0.88 + tier * 0.12);
        const safe = !!v.unit.protectedRun;
        if (carry.vulnerable) v.cashTag.setText(safe ? `$${carry.carrying} ✓ SAFE` : `$${carry.carrying}`);
        const threat = carry.vulnerable ? threats.get(v.unit.id) : undefined;
        if (safe && carry.vulnerable) {
          // Tutorial run: a steady brass ring reads as "guaranteed home" even as the rival hunts.
          v.dangerRing.setStrokeStyle(3, hexNum(SPEC.brass), 0.9).setPosition(s.x, s.y + 2).setDepth(depth - 1).setVisible(true);
          v.cashTag.setColor(SPEC.brass);
        } else if (threat) {
          // Two-stage danger ring: amber when threatened, danger-red MOTION at ambush range.
          const col = hexNum(dangerStageColor(threat.level));
          v.dangerRing.setStrokeStyle(3, col, threat.level === 'ambush' ? 0.6 + 0.4 * pulse : 0.85)
            .setPosition(s.x, s.y + 2).setDepth(depth - 1).setVisible(true);
          v.cashTag.setColor(threat.level === 'ambush' ? SPEC.danger : SPEC.brass);
        } else {
          v.dangerRing.setVisible(false);
          v.cashTag.setColor(SPEC.brass);
        }
        // Cash trail: a carrying collector drops faint greenback breadcrumbs (~2s fade).
        if (carry.vulnerable && moving) this.dropGreenback(s.x, s.y, depth - 3);
      }
    }

    // Protection coins spin slowly (idle ≥1.3s) over player-extorted fronts, with a soft glow.
    const spinAngle = ((now % MOTION.coinSpin) / MOTION.coinSpin) * 360;
    for (const [bid, m] of this.bizMarkers) {
      const insp = inspectBusiness(this.state, bid);
      const on = !!insp?.payingProtection;
      m.coin.setVisible(on);
      if (m.glow) m.glow.setVisible(on);
      if (on) {
        m.coin.setAngle(spinAngle).setY(m.roofY - 6 + Math.sin(now / 700) * 2);
        if (m.glow) m.glow.setAlpha(0.25 + 0.1 * Math.sin(now / 700));
      }
    }
  }

  /** Cash trail (RTS-15): drop a fading greenback breadcrumb, throttled to ~5/sec. */
  private dropGreenback(x: number, y: number, depth: number): void {
    if (this.time.now - this.lastTrailAt < 200) return;
    this.lastTrailAt = this.time.now;
    const gb = this.add.image(x + Phaser.Math.Between(-4, 4), y - 6, TEX.greenback)
      .setDepth(depth).setAngle(Phaser.Math.Between(-30, 30)).setAlpha(0.9);
    this.tweens.add({ targets: gb, alpha: 0, y: y + 2, duration: MOTION.cashTrail, onComplete: () => gb.destroy() });
  }

  /** Ambush beat (RTS-15): a danger-red muzzle flash, three 6px shakes, and grab-able banknotes
   * scattering from the robbed collector. */
  private flashAmbush(ev: InterceptionEvent): void {
    if (this.robbedCollectors.has(ev.collectorId)) return;
    this.robbedCollectors.add(ev.collectorId);
    const v = this.units.find((u) => u.unit.id === ev.collectorId);
    if (!v) return;
    const s = unitScreenPos(v.unit);

    // muzzle flash — danger-red, soft radial, brief (motion = danger).
    const flashGlow = this.add.image(s.x + 8, s.y - 14, TEX.glow).setTint(hexNum(SPEC.danger)).setScale(0.4).setDepth(100001);
    this.tweens.add({ targets: flashGlow, scale: 1.1, alpha: 0, duration: 180, onComplete: () => flashGlow.destroy() });
    const ring = this.add.circle(s.x, s.y - 8, 8).setStrokeStyle(4, hexNum(SPEC.danger), 1).setDepth(100001);
    this.tweens.add({ targets: ring, scale: 7, alpha: 0, duration: 600, onComplete: () => ring.destroy() });

    // three sharp 6px shakes.
    const cam = this.cameras.main;
    cam.shake(80, 0.006);
    this.time.delayedCall(110, () => cam.shake(80, 0.006));
    this.time.delayedCall(220, () => cam.shake(80, 0.006));

    // grab-able banknotes scatter.
    for (let i = 0; i < 7; i++) {
      const note = this.add.image(s.x, s.y - 10, TEX.note).setDepth(100001).setAngle(Phaser.Math.Between(0, 360));
      this.tweens.add({
        targets: note,
        x: s.x + Phaser.Math.Between(-46, 46),
        y: s.y + Phaser.Math.Between(-10, 26),
        angle: Phaser.Math.Between(-180, 180),
        alpha: 0,
        duration: 900 + i * 40,
        ease: 'Cubic.Out',
        onComplete: () => note.destroy(),
      });
    }

    const flash = this.add
      .text(s.x, s.y - 50, `ROBBED  $${ev.amount}`, { fontFamily: NOIR_FONT, fontSize: '18px', color: SPEC.danger, fontStyle: 'bold' })
      .setOrigin(0.5, 1).setDepth(100002);
    this.tweens.add({ targets: flash, y: s.y - 96, alpha: 0, duration: 1900, onComplete: () => flash.destroy() });
    if (v.cashTag) v.cashTag.setVisible(false);
    if (v.dangerRing) v.dangerRing.setVisible(false);
    this.setStatus(`collector ambushed — $${ev.amount} gone to ${ev.attackerFaction}`);
  }

  /** Banked beat (RTS-15): coins arc to the HQ vault, a 90ms 1.04x camera punch, satchel deflates. */
  private flashDeposit(collectorId: string, banked: number): void {
    const v = this.units.find((u) => u.unit.id === collectorId);
    if (!v) return;
    const s = unitScreenPos(v.unit);
    const hq = hqTileOf(this.layout, 'player');
    const vault = hq ? gridToScreen(hq.gx, hq.gy) : { x: s.x, y: s.y - 40 };

    // coins (greenbacks) arc from the collector to the vault.
    for (let i = 0; i < 6; i++) {
      const coin = this.add.image(s.x, s.y - 10, TEX.greenback).setDepth(100001).setTint(hexNum(SPEC.cashGreen));
      this.tweens.add({
        targets: coin,
        x: vault.x,
        y: vault.y - 24,
        scale: 0.6,
        alpha: { from: 1, to: 0.2 },
        delay: i * 45,
        duration: 520,
        ease: 'Cubic.In',
        onComplete: () => coin.destroy(),
      });
    }
    // 90ms 1.04x camera punch.
    const cam = this.cameras.main;
    const z = cam.zoom;
    this.tweens.add({ targets: cam, zoom: z * 1.04, duration: MOTION.bankedPunch, yoyo: true, ease: 'Quad.Out' });

    if (v.cashTag) v.cashTag.setVisible(false); // satchel deflates
    const flash = this.add
      .text(vault.x, vault.y - 40, `+ $${banked} BANKED`, { fontFamily: NOIR_FONT, fontSize: '16px', color: SPEC.cashGreen, fontStyle: 'bold' })
      .setOrigin(0.5, 1).setDepth(100002);
    this.tweens.add({ targets: flash, y: vault.y - 70, alpha: 0, duration: 1600, onComplete: () => flash.destroy() });
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
    const mark = this.add.polygon(c.x, c.y, corners).setStrokeStyle(3, ok ? hexNum(SPEC.brass) : hexNum(SPEC.danger), 1).setDepth(depthValue(tile.gx, tile.gy) * 10 + 9);
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
      this.leanBeat(c.x, c.y);
      this.setStatus(`${insp.name} pays protection — collect the take with [C]`);
    } else {
      this.floatText(c.x, c.y - 30, 'RESISTED — try again', SPEC.danger);
      this.setStatus('they held out — extortion is a roll, press [E] again');
    }
  }

  /** The Lean (RTS-15): a brick-dust shudder, a thumping "NOW PAYING" stamp, and a coin burst. */
  private leanBeat(x: number, y: number): void {
    // brick-dust puffs (fog motes drifting up and fading).
    for (let i = 0; i < 8; i++) {
      const dust = this.add.circle(x + Phaser.Math.Between(-22, 22), y + Phaser.Math.Between(-6, 10), Phaser.Math.Between(1, 3), PAL.fog, 0.6).setDepth(100001);
      this.tweens.add({ targets: dust, y: dust.y - Phaser.Math.Between(14, 30), alpha: 0, duration: 700 + i * 30, onComplete: () => dust.destroy() });
    }
    // coin burst (brass = money state).
    for (let i = 0; i < 6; i++) {
      const coin = this.add.image(x, y - 8, TEX.coin).setDepth(100001).setScale(0.6);
      this.tweens.add({ targets: coin, x: x + Phaser.Math.Between(-30, 30), y: y - Phaser.Math.Between(18, 40), alpha: 0, angle: Phaser.Math.Between(-180, 180), duration: 700, ease: 'Cubic.Out', onComplete: () => coin.destroy() });
    }
    // "NOW PAYING" stamp — thumps on big then settles.
    const stamp = this.add.text(x, y - 34, 'NOW PAYING', { fontFamily: NOIR_FONT, fontSize: '17px', color: SPEC.brass, fontStyle: 'bold' }).setOrigin(0.5, 1).setDepth(100002).setScale(2.2).setAlpha(0);
    this.tweens.add({ targets: stamp, scale: 1, alpha: 1, duration: MOTION.leanBeat * 0.35, ease: 'Back.Out' });
    this.tweens.add({ targets: stamp, alpha: 0, y: y - 54, delay: 900, duration: 500, onComplete: () => stamp.destroy() });
  }

  /** [C] — send a collector from the first district that has player takings waiting. */
  private commandCollect(): void {
    const hotBefore = dispatchThreat(this.state, this.layout, 'player').hot; // before the source empties
    for (const d of this.state.districts) {
      if (pendingCollection(this.state, 'player', d.id) > 0) {
        const run = startCollectorRun(this.state, this.layout, 'player', d.id, this.navGrid);
        if (run.unit) {
          this.attachView(run.unit, 'player');
          if (run.unit.protectedRun) {
            this.setStatus(`collector dispatched from ${d.name} — first run rides home SAFE`);
          } else if (hotBefore) {
            const c = gridToScreen(run.unit.pos.gx, run.unit.pos.gy);
            this.floatText(c.x, c.y - 30, 'SENT INTO DANGER!', NOIR_PALETTE.blood);
            this.setStatus(`collector sent into a HOT route from ${d.name} — keep it clear of the enforcer!`);
          } else {
            this.setStatus(`collector dispatched from ${d.name} — coast was clear, walk it home`);
          }
          return;
        }
      }
    }
    this.setStatus('nothing to collect yet — takings build each week after a shakedown');
  }

  /** [R] — reinvest: open the priciest racket you can afford in your strongest district. */
  private commandReinvest(): void {
    const kind = affordableOperation(this.state.player.cash);
    if (!kind) { this.setStatus('not enough clean cash to open a racket yet'); return; }
    const d = strongholdDistrict(this.state, 'player');
    applyCommand(this.state, { type: 'establishOperation', familyId: 'player', districtId: d.id, kind });
    this.state = harvestIncidents(this.state);
    const hq = hqTileOf(this.layout, 'player');
    if (hq) { const c = gridToScreen(hq.gx, hq.gy); this.floatText(c.x, c.y - 30, `OPENED ${kind.toUpperCase()} RACKET`, NOIR_PALETTE.brass); }
    this.setStatus(`opened a ${kind} racket in ${d.name}`);
  }

  /** [G] — grease: bump the next of the four bribe channels by $10/wk (cycles through them). */
  private commandGrease(): void {
    const channels: BribeChannel[] = ['police', 'judges', 'politicians', 'feds'];
    const ch = channels[this.greaseIndex % channels.length];
    this.greaseIndex += 1;
    const cur = this.state.player.bribes[ch];
    applyCommand(this.state, { type: 'setBribe', familyId: 'player', channel: ch, amount: cur + 10 });
    this.state = harvestIncidents(this.state);
    const paid = this.state.player.bribes[ch] > cur;
    this.setStatus(paid ? `greased ${bribeChannelLabel(ch)} → $${this.state.player.bribes[ch]}/wk` : `can't afford to grease ${bribeChannelLabel(ch)}`);
  }

  // ── the build verbs (RTS-20) — how the player leaves ESTABLISH ───────────────────────────────

  /** [5] EXPAND control in your home corner (toward HOLDING it → unlocks RAID), else your stronghold. */
  private commandExpand(): void {
    const targetId = expandTargetDistrictId(this.state);
    if (!targetId) { this.setStatus('nowhere to expand — get a foothold first'); return; }
    if (this.state.player.cash < EXPAND_COST) { this.setStatus(`can't afford to expand (need $${EXPAND_COST})`); return; }
    const d = this.state.districts.find((x) => x.id === targetId)!;
    const before = controlOf(d, 'player');
    applyCommand(this.state, { type: 'expandControl', familyId: 'player', districtId: targetId });
    this.state = harvestIncidents(this.state);
    const after = controlOf(d, 'player');
    const nowHeld = districtsHeld(this.state, 'player').some((x) => x.id === targetId);
    const justHeld = nowHeld && before < CONTROL_HOLD;
    const label = this.districtLabels.get(targetId);
    if (label) this.floatText(label.x, label.y - 14, justHeld ? 'BLOCK HELD!' : `CONTROL +${after - before}`, justHeld ? SPEC.brass : NOIR_PALETTE.bone);
    this.setStatus(justHeld
      ? `${d.name} is YOURS (${after}) — RAID is unlocked`
      : `expanded in ${d.name} → ${after}/${CONTROL_HOLD} control (+${after - before})`);
  }

  /** [6] RECRUIT a gangster — muscle for defense, collection, and (at strength ≥ 12) ASSASSINATION. */
  private commandRecruit(): void {
    if (this.state.player.cash < RECRUIT_COST) { this.setStatus(`can't afford to recruit (need $${RECRUIT_COST})`); return; }
    const before = this.state.player.gangsters.length;
    applyCommand(this.state, { type: 'recruitGangster', familyId: 'player' });
    this.state = harvestIncidents(this.state);
    const added = this.state.player.gangsters.length > before;
    const strength = familyStrength(this.state.player);
    const hq = hqTileOf(this.layout, 'player');
    if (added && hq) { const c = gridToScreen(hq.gx, hq.gy); this.floatText(c.x, c.y - 30, 'NEW MUSCLE', NOIR_PALETTE.brass); }
    const toward = strength >= ASSASSINATE_MIN_STRENGTH ? 'hit-ready' : `${strength}/${ASSASSINATE_MIN_STRENGTH} toward a hit`;
    this.setStatus(added ? `recruited muscle — crew ${this.state.player.gangsters.length}, strength ${toward}` : 'no one to recruit right now');
  }

  // ── the offensive (RTS-17) ───────────────────────────────────────────────────────────────

  /** [1] RAID the first rival-held/contested district by force. */
  private commandRaid(): void {
    const target = this.state.districts.find((d) => { const h = districtHolder(d); return !!h && h !== 'player'; })
      ?? this.state.districts.find((d) => Object.entries(d.control).some(([f, v]) => f !== 'player' && v > 0));
    if (!target) { this.setStatus('no rival turf to raid'); return; }
    const g = canRaid(this.state, target.id);
    if (!g.ok) { this.setStatus(`RAID ${target.name}: ${g.reason}`); return; }
    const res = resolveRaid(this.state, target.id);
    this.state = harvestIncidents(this.state);
    this.flashTerritory(target.id, false);
    this.setStatus(res.repelled ? `raid on ${target.name} was REPELLED` : `RAID on ${target.name}!`);
  }

  /** [2] SABOTAGE the first rival racket — interdict their economy. */
  private commandSabotage(): void {
    const biz = allBusinesses(this.state).find((b) => { const e = businessEarner(b); return !!e && e !== 'player'; });
    if (!biz) { this.setStatus('no rival racket to hit'); return; }
    const g = canSabotage(this.state, biz.id);
    if (!g.ok) { this.setStatus(`SABOTAGE: ${g.reason}`); return; }
    const res = resolveSabotage(this.state, biz.id);
    this.state = harvestIncidents(this.state);
    this.setStatus(res.destroyed ? 'racket WRECKED' : 'rival racket sabotaged');
  }

  /** [3] ASSASSINATE the weakest rival's Don — the decapitating blow. */
  private commandAssassinate(): void {
    const w = weakestRival(this.state);
    if (!w) { this.setStatus('no rival Don left to hit'); return; }
    const g = canAssassinate(this.state, w.familyId);
    if (!g.ok) { this.setStatus(`HIT ${w.name}: ${g.reason}`); return; }
    const res = resolveAssassinate(this.state, w.familyId);
    this.state = harvestIncidents(this.state);
    const hq = hqIntegrityOf(this.state.rivals.find((r) => r.id === w.familyId)!);
    this.setStatus(res.success ? (res.eliminated ? `${w.name} ELIMINATED` : `struck ${w.name}'s HQ — integrity ${hq}`) : `the hit on ${w.name} failed`);
  }

  /** [4] LOCKOUT the weakest rival via The Bureau — freeze and bleed them. */
  private commandLockout(): void {
    const w = weakestRival(this.state);
    if (!w) { this.setStatus('no rival to lock down'); return; }
    const g = canLockout(this.state, w.familyId);
    if (!g.ok) { this.setStatus(`LOCKOUT ${w.name}: ${g.reason}`); return; }
    resolveLockout(this.state, w.familyId);
    this.state = harvestIncidents(this.state);
    this.setStatus(`the Bureau is locking down ${w.name}`);
  }

  /**
   * QA-only scenario hooks. Non-invasive: read the URL query and seed an interesting board by
   * exercising EXISTING systems (turf pulses, loyalty seeding, the bribe command, the endgame
   * evaluator) — they change NO sim rule and are a no-op in normal play (no flags) and outside the
   * browser. Supported:
   *   • ?arm=1                       — a funded, established, hit-ready outfit (skips the build phase).
   *   • ?debug=turf|mutiny|all[&pulses=N] — fast-forward the turf war / prime a mutiny.
   *   • ?debug=win | ?debug=lose     — force the endgame to resolve (the wrapper reads it next frame).
   */
  private applyDebugScenario(): void {
    const search = typeof window !== 'undefined' ? (window.location?.search ?? '') : '';
    if (!search) return;
    const params = new URLSearchParams(search);

    // ?arm=1 — the UAT injector: a strong, funded, established outfit so QA can drive the full arc
    // (raid/lockout/assassinate) immediately, bypassing the economy→offense build-up.
    if (params.get('arm') === '1') {
      const p = this.state.player;
      p.cash = 12000; p.dirtyCash = 3000;
      // muscle: three made men guarding the home block → strength ≥ 12 (unlocks ASSASSINATE).
      for (let i = 0; i < 3; i++) {
        p.gangsters.push({ id: `player-arm-${i}`, name: 'Made Man', skill: 6, loyalty: 80, upkeep: 0, assignment: { type: 'guard', districtId: 'district-0' } });
      }
      const home = this.state.districts.find((d) => d.id === 'district-0');
      if (home) home.control.player = 60; // HOLD the home block (unlocks RAID)
      applyCommand(this.state, { type: 'setBribe', familyId: 'player', channel: 'feds', amount: 20 }); // The Bureau (unlocks LOCKOUT)
      this.state = harvestIncidents(this.state);
    }

    const debug = params.get('debug');
    if (!debug) return;
    const want = (k: string): boolean => debug === k || debug === 'all';
    const pulses = Math.max(1, Math.min(40, Math.floor(Number(params.get('pulses')) || 8)));

    if (want('turf')) {
      // Fast-forward the turf war so rival expansion + captures are immediately visible to QA.
      for (let i = 0; i < pulses; i++) resolveStrategicPulse(this.state);
      this.state = harvestIncidents(this.state);
    }
    if (want('mutiny')) {
      // Prime a mutiny: starve the crew's loyalty so the mutiny telegraph + desertions surface.
      for (const g of this.state.player.gangsters) g.loyalty = Math.min(g.loyalty, 8);
    }
    if (debug === 'win') {
      // Topple every rival; the wrapper's evaluateEndgame resolves a WIN on the next frame.
      for (const r of this.state.rivals) { r.alive = false; r.hqIntegrity = 0; }
    }
    if (debug === 'lose') {
      // Raze the player's HQ; the wrapper's evaluateEndgame resolves a LOSS on the next frame.
      this.state.player.hqIntegrity = 0;
    }
  }

  /** The victory/defeat readout when the contest resolves (RTS-17). */
  private showEndgame(): void {
    if (this.endgameShown) return;
    this.endgameShown = true;
    const won = this.state.status === 'won';
    const w = this.scale.width, h = this.scale.height;
    this.add.rectangle(0, 0, 6000, 4000, PAL.soot, 0.82).setOrigin(0, 0).setScrollFactor(0).setDepth(200000);
    const last = [...this.state.log].reverse().find((e) => e.kind === 'game-over');
    this.add.text(w / 2, h / 2 - 30, won ? 'YOU TOOK THE CITY' : 'THE CITY TOOK YOU', {
      fontFamily: NOIR_FONT, fontSize: '34px', color: won ? SPEC.brass : SPEC.danger, fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200001);
    this.add.text(w / 2, h / 2 + 16, last?.message ?? '', { fontFamily: NOIR_FONT, fontSize: '15px', color: NOIR_PALETTE.bone }).setOrigin(0.5).setScrollFactor(0).setDepth(200001);
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
    this.input.keyboard?.on('keydown-R', () => this.commandReinvest());
    this.input.keyboard?.on('keydown-G', () => this.commandGrease());
    this.input.keyboard?.on('keydown-L', () => this.toggleFeed());
    this.input.keyboard?.on('keydown-K', () => this.toggleCrew());
    this.input.keyboard?.on('keydown-H', () => this.toggleLegend());
    this.input.keyboard?.on('keydown-B', () => this.scene.start('BootScene'));
    // RTS-17 — the offensive.
    this.input.keyboard?.on('keydown-ONE', () => this.commandRaid());
    this.input.keyboard?.on('keydown-TWO', () => this.commandSabotage());
    this.input.keyboard?.on('keydown-THREE', () => this.commandAssassinate());
    this.input.keyboard?.on('keydown-FOUR', () => this.commandLockout());
    // RTS-20 — the build verbs (leave ESTABLISH).
    this.input.keyboard?.on('keydown-FIVE', () => this.commandExpand());
    this.input.keyboard?.on('keydown-SIX', () => this.commandRecruit());
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.updateUnits(dt);
    this.refreshHud();
    this.refreshObjective();
    this.refreshFeed();
    this.refreshCrew();
    this.refreshStrategy();
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
    // Cash-flow legibility (RTS-12): the uncollected pile the player is owed but doesn't have.
    this.uncollectedText = this.add.text(12, 128, '', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setScrollFactor(0).setDepth(100000);
    this.statusText = this.add.text(12, 156, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.fog }).setScrollFactor(0).setDepth(100000);
    this.warningBanner = this.add.text(12, 0, '', { fontFamily: NOIR_FONT, fontSize: '15px', color: NOIR_PALETTE.blood, fontStyle: 'bold' }).setScrollFactor(0).setDepth(100000).setVisible(false);

    this.feedTitle = this.add.text(0, 12, 'THE WIRE  [L]', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setScrollFactor(0).setDepth(100000).setOrigin(1, 0);
    for (let i = 0; i < 9; i++) {
      this.feedLines.push(this.add.text(0, 32 + i * 16, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.fog }).setScrollFactor(0).setDepth(100000).setOrigin(1, 0));
    }
    this.nightVeil = this.add.rectangle(0, 0, 6000, 4000, 0x0a1020, 0).setOrigin(0, 0).setScrollFactor(0).setDepth(99980);
    this.klaxon = this.add.graphics().setScrollFactor(0).setDepth(99985);

    // RTS-14/15 crew roster (bottom-left; per-member animated rows; toggle with [K]).
    this.crewTitle = this.add.text(12, 0, 'YOUR CREW  [K]', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(0, 0).setScrollFactor(0).setDepth(100000);
    for (let i = 0; i < 8; i++) {
      this.crewWrong.push(this.add.rectangle(8, 0, 320, 16).setOrigin(0, 0.5).setStrokeStyle(2, hexNum(SPEC.danger), 1).setScrollFactor(0).setDepth(99999).setVisible(false));
      this.crewRows.push(this.add.text(14, 0, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(100000));
    }
    // Mutiny telegraph banner (top-centre, under the objective) — legible, earned, with a countdown.
    this.mutinyBanner = this.add.text(this.scale.width / 2, 60, '', { fontFamily: NOIR_FONT, fontSize: '15px', color: SPEC.danger, fontStyle: 'bold' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100001).setVisible(false);

    // RTS-16 turf-war standings (right side, under THE WIRE) + rival-pressure telegraph banner.
    this.strategyTitle = this.add.text(0, 196, 'THE CITY', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100000);
    this.strategyPanel = this.add.text(0, 216, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, lineSpacing: 2, align: 'right' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100000);
    this.pressureBanner = this.add.text(this.scale.width / 2, 84, '', { fontFamily: NOIR_FONT, fontSize: '14px', color: SPEC.danger, fontStyle: 'bold' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100001).setVisible(false);
  }

  /** Turf-war readout (RTS-16): trajectory + standings + rival-pressure telegraph, and recolour
   * the district nameplates by who holds them (brass = you, rival-red = a rival, fog = neutral). */
  private refreshStrategy(): void {
    if (!this.strategyPanel || !this.strategyTitle || !this.pressureBanner) return;
    const right = this.scale.width - 12;
    const standing = cityStanding(this.state);
    this.strategyTitle.setPosition(right, 196);
    const lines = [standing.read, ''];
    lines.push(`YOUR HQ: ${Math.round(hqIntegrityOf(this.state.player))}%`);
    // While founding, show the home corner and the path to lock it down (30 → CONTROL_HOLD).
    if (standing.homeFront) {
      const hf = standing.homeFront;
      lines.push(`HOME ${hf.districtName}: ${hf.control}/${hf.control + hf.needed} (+${hf.needed} to secure)`);
    }
    for (const r of standing.rows) {
      if (r.isPlayer) continue;
      const fam = this.state.rivals.find((x) => x.id === r.familyId);
      const tag = r.name.replace('The ', '').replace(' Family', '').replace(' Crew', '');
      if (!r.alive) { lines.push(`${tag}: † finished`); continue; }
      const hq = fam ? Math.round(hqIntegrityOf(fam)) : 100;
      const locked = (fam?.lockoutTicks ?? 0) > 0 ? ' 🔒' : '';
      lines.push(`${tag}: ${r.districtsHeld} blk · HQ ${hq}%${locked}`);
    }
    // who's the softest target right now — nudge the player at a kill.
    const weak = weakestRival(this.state);
    if (weak) { lines.push(''); lines.push(`weakest: ${weak.name.replace('The ', '').replace(' Family', '').replace(' Crew', '')}`); }
    // RTS-19 legibility: the match phase + the offence board (what each action costs in cash+heat,
    // and whether you can pull it off right now — ✓ ready / ✗ + the reason).
    const phase = matchPhase(this.state);
    lines.push('');
    lines.push(`— ${phase.phase.toUpperCase()} —`);
    // RTS-20/21 build board: the verbs that grow the outfit out of ESTABLISH (expand → HOLD → RAID,
    // recruit → muscle → ASSASSINATE), with a "when can I afford it" ETA when short on cash.
    for (const b of buildReadout(this.state)) {
      const mark = b.affordable ? '✓' : '✗';
      const eta = b.affordable ? '' : IsoScene.etaTag(b.affordEtaWeeks);
      lines.push(`${mark} [${b.hotkey}] ${b.label} $${b.cost}${eta} — ${b.effect}`);
    }
    for (const o of offenseReadout(this.state)) {
      const mark = o.available ? '✓' : '✗';
      const heat = o.heat > 0 ? ` +${o.heat}🔥` : '';
      const tail = o.available ? '' : ` (${o.reason})`;
      // show the cash ETA only when cash is the (or a) blocker, so a muscle/Bureau-gated row isn't noisy.
      const eta = !o.available && o.affordEtaWeeks !== 0 ? IsoScene.etaTag(o.affordEtaWeeks) : '';
      lines.push(`${mark} [${o.hotkey}] ${o.label} $${o.cost}${heat}${tail}${eta}`);
    }
    this.strategyPanel.setText(lines.join('\n')).setPosition(right, 216);
    this.strategyPanel.setColor(standing.trajectory === 'dominant' || standing.trajectory === 'ahead' ? NOIR_PALETTE.brass
      : standing.trajectory === 'behind' || standing.trajectory === 'crushed' ? SPEC.danger : NOIR_PALETTE.bone);

    // recolour district nameplates by holder
    for (const [id, label] of this.districtLabels) {
      const d = this.state.districts.find((x) => x.id === id);
      const holder = d ? districtHolder(d) : null;
      label.setColor(holder === 'player' ? SPEC.brass : holder && holder.startsWith('rival') ? SPEC.rival : NOIR_PALETTE.fog);
    }

    // rival-pressure telegraph: the most urgent push onto your turf (like the run-2 threat).
    const onPlayer = telegraphedPushes(this.state).find((t) => t.onPlayer);
    if (onPlayer) {
      this.pressureBanner.setText(`⚔ ${onPlayer.familyName.toUpperCase()} IS PUSHING INTO ${onPlayer.districtName.toUpperCase()} — DEFEND OR GREASE CITY HALL`)
        .setPosition(this.scale.width / 2, 84).setVisible(true).setAlpha(0.7 + 0.3 * Math.abs(Math.sin(this.time.now / 300)));
    } else {
      this.pressureBanner.setVisible(false);
    }
  }

  /** A turf-war beat (RTS-16): a district changed hands — called out over its nameplate. */
  private flashTerritory(districtId: string, lostByPlayer: boolean): void {
    const label = this.districtLabels.get(districtId);
    if (!label) return;
    const txt = lostByPlayer ? 'BLOCK LOST!' : 'BLOCK TAKEN';
    const t = this.add.text(label.x, label.y - 14, txt, { fontFamily: NOIR_FONT, fontSize: '15px', color: lostByPlayer ? SPEC.danger : SPEC.rival, fontStyle: 'bold' })
      .setOrigin(0.5, 1).setDepth(100002);
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 1800, onComplete: () => t.destroy() });
    if (lostByPlayer) this.cameras.main.shake(160, 0.004);
  }

  private toggleCrew(): void {
    this.crewVisible = !this.crewVisible;
    this.crewTitle?.setVisible(this.crewVisible);
    for (const r of this.crewRows) r.setVisible(this.crewVisible && r.text !== '');
  }

  private static crewGlyph(status: string): string {
    return status === 'loyal' ? '●' : status === 'wavering' ? '◐' : '○';
  }

  /** Paint the crew roster with per-member loyalty animation (RTS-15): loyaltyBob / waverRoll /
   * disloyalPulse, a crimson wrongedFlash when a member's loyalty drops, and the mutiny telegraph. */
  private refreshCrew(): void {
    if (!this.crewTitle) return;
    const rows = crewReadout(this.state.player);
    const now = this.time.now;
    const baseY = this.scale.height - 30 - rows.length * 18;
    this.crewTitle.setPosition(12, baseY - 18).setVisible(this.crewVisible);

    let mostUrgent: { name: string } | null = null;
    for (let i = 0; i < this.crewRows.length; i++) {
      const row = this.crewRows[i];
      const wrong = this.crewWrong[i];
      const r = rows[i];
      if (!r || !this.crewVisible) { row.setVisible(false); wrong.setVisible(false); continue; }

      // wronged flash: arm a 1.2s crimson border when a member's loyalty just dropped.
      const prev = this.crewLastLoyalty.get(r.id);
      if (prev !== undefined && r.loyalty < prev) this.crewFlashUntil.set(r.id, now + MOTION.wrongedFlash);
      this.crewLastLoyalty.set(r.id, r.loyalty);

      const color = r.status === 'disloyal' ? SPEC.danger : r.status === 'wavering' ? SPEC.brass : SPEC.bone;
      const tr = r.traitLabels.length ? ` [${r.traitLabels.join(', ')}]` : '';
      const y = baseY + i * 18;

      // band animation (all idle-slow except the disloyal pulse, still ≥1.3s): bob / roll / pulse.
      let dx = 0, dy = 0, scale = 1;
      const phase = (k: number) => (now / MOTION[loyaltyMotion(r.status)]) * Math.PI * 2 + k;
      if (r.status === 'loyal') dy = Math.sin(phase(i)) * 1.2;
      else if (r.status === 'wavering') dx = Math.sin(phase(i)) * 2;
      else { scale = 1 + 0.05 * Math.sin(phase(i)); mostUrgent = mostUrgent ?? { name: r.name }; }

      row.setText(`${IsoScene.crewGlyph(r.status)} ${r.name}${tr} — ${r.status} (${r.loyalty})`)
        .setColor(color).setPosition(14 + dx, y + dy).setScale(scale).setVisible(true);

      const flashing = (this.crewFlashUntil.get(r.id) ?? 0) > now;
      wrong.setPosition(8 + dx, y + dy).setVisible(flashing)
        .setStrokeStyle(2, hexNum(SPEC.danger), flashing ? 0.5 + 0.5 * Math.abs(Math.sin(now / 150)) : 1);
    }

    // Mutiny telegraph: a disloyal member may walk at the next settlement — name it + countdown.
    if (this.mutinyBanner) {
      if (mostUrgent && this.crewVisible) {
        const countdown = realtimeHudView(this.state).weekCountdownLabel;
        this.mutinyBanner.setText(`⚠ ${mostUrgent.name.toUpperCase()} READY TO BETRAY — ACT NOW  (settles in ${countdown})`)
          .setPosition(this.scale.width / 2, 60).setVisible(true).setAlpha(0.7 + 0.3 * Math.abs(Math.sin(now / 300)));
      } else {
        this.mutinyBanner.setVisible(false);
      }
    }
  }

  private refreshHud(): void {
    if (!this.hudPanel) return;
    const hud = realtimeHudView(this.state);
    const p = hud.player;
    const danger = anyCollectorInDanger(this.state);
    // RTS-19 legibility: project the weekly net so the player can read whether the economy funds
    // the war (positive) or the bleed is winning (negative).
    const net = playerWeeklyNet(this.state);
    const netStr = net >= 0 ? `+$${net}` : `-$${Math.abs(net)}`;
    this.hudPanel.setText([
      `Clean $${p.cleanCash}    Dirty $${p.dirtyCash}`,
      `Heat ${p.heat} (${heatLabel(p.heat)})    Crew ${p.crew}    Upkeep $${p.weeklyUpkeep}/wk` + (p.debt > 0 ? `    Debt $${p.debt}` : ''),
      `Net ${netStr}/wk    Week ${hud.week} — next in ${hud.weekCountdownLabel}`,
    ].join('\n'));

    // Uncollected readout — why clean drifts: takings you're owed but haven't collected yet.
    if (this.uncollectedText) {
      if (p.uncollected > 0) {
        this.uncollectedText.setText(`Uncollected $${p.uncollected} waiting — press [C] to collect`).setColor(NOIR_PALETTE.brass);
      } else {
        this.uncollectedText.setText('Uncollected $0 — all takings banked').setColor(NOIR_PALETTE.fog);
      }
    }

    // week countdown bar
    if (this.weekBar) {
      this.weekBar.clear();
      this.weekBar.fillStyle(PAL.charcoal, 1).fillRect(12, 92, 316, 6);
      this.weekBar.fillStyle(PAL.brass, 1).fillRect(12, 92, 316 * Phaser.Math.Clamp(hud.weekProgress, 0, 1), 6);
    }
    // federal exposure ladder bar — reddens by tier at 50/70/85 (spec colours).
    if (this.fedBar) {
      const x = 12, y = 110, w = 316;
      this.fedBar.clear();
      this.fedBar.fillStyle(PAL.charcoal, 1).fillRect(x, y, w, 8);
      this.fedBar.fillStyle(hexNum(federalBarColor(p.federalTier)), 1).fillRect(x, y, w * Phaser.Math.Clamp(p.federalExposure / 100, 0, 1), 8);
      this.fedBar.lineStyle(1, hexNum(SPEC.bone), 0.7);
      for (const mk of [FED_T1, FED_T2, FED_T3]) {
        this.fedBar.beginPath(); this.fedBar.moveTo(x + (w * mk) / 100, y - 2); this.fedBar.lineTo(x + (w * mk) / 100, y + 10); this.fedBar.strokePath();
      }
    }
    // Klaxon vignette: at tier 3 (exposure ≥ 85) the screen edge pulses danger-red.
    this.refreshKlaxon(p.federalTier >= 3);
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

  /** Klaxon vignette (RTS-15): a danger-red edge that pulses when a federal bust is imminent. */
  private refreshKlaxon(on: boolean): void {
    if (!this.klaxon) return;
    this.klaxon.clear();
    if (!on) return;
    const w = this.scale.width, h = this.scale.height;
    const a = 0.2 + 0.35 * Math.abs(Math.sin(this.time.now / 250));
    for (let i = 0; i < 5; i++) {
      this.klaxon.lineStyle(30 - i * 5, hexNum(SPEC.danger), a * (0.1 + i * 0.05));
      this.klaxon.strokeRect(i * 3, i * 3, w - i * 6, h - i * 6);
    }
  }

  private fedLine(tier: number): string {
    return tier >= 3 ? 'FEDERAL BUST IMMINENT — launder, cool off, or pay The Bureau' : tier >= 2 ? 'Agents are watching your fronts' : 'The Bureau is asking questions';
  }

  private setStatus(action?: string): void {
    if (!this.statusText) return;
    const sel = this.selection.ids;
    const base = sel.length === 0 ? 'Click a unit to select · right-click to move' : `selected: ${sel.join(', ')}`;
    const sh = this.state.activeShocks.map((s) => shockFlavor(s.kind as ShockKind)).join(', ');
    const hint = '  ·  [E] shake down · [C] collect · [R] reinvest · [G] grease · [5] expand · [6] recruit';
    this.statusText.setText((action ? `${base}  ·  ${action}` : base + hint) + (sh ? `   |  ${sh}` : ''));
  }

  private toggleFeed(): void {
    this.feedVisible = !this.feedVisible;
    this.feedTitle?.setVisible(this.feedVisible);
    for (const l of this.feedLines) l.setVisible(this.feedVisible);
  }

  /** RTS-21 legibility: a compact "when can I afford it" tag for the build/offence boards. */
  private static etaTag(weeks: number | null): string {
    if (weeks === null) return ' (income-)';
    if (weeks <= 0) return '';
    return ` ~${weeks}wk`;
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
      '  • [5] EXPAND your home block 30→50 to HOLD it (unlocks RAID).',
      '  • [6] RECRUIT muscle toward the 12 strength a hit needs.',
      '',
      'TAKE THE CITY  (the offence board, right)',
      '  [1] raid · [2] sabotage · [3] assassinate · [4] lockout',
      '',
      'CONTROLS',
      '  left-click select · shift adds · right-click move · drag pan · wheel zoom',
      '  [E] shake down · [C] collect · [R] reinvest · [G] grease · [5] expand · [6] recruit',
      '  [K] your crew (names · traits · loyalty) · [L] the wire · [H] help · [B] card view',
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
