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
  ISO_TILE_HALF_WIDTH,
  ISO_TILE_HALF_HEIGHT,
  makeGrid,
  spawnUnit,
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
  startCollectorRun,
  processCollectorArrivals,
  dispatchThreat,
  pendingCollection,
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
  hudPhase,
  victoryProximity,
  winPaths,
  viceLadder,
  applyViceUpgrade,
  marketRows,
  buyGood,
  sellGood,
  tradePreview,
  advanceWeeklyContent,
  advanceCivics,
  type ViceLadder as ViceLadderView,
  type TradeSide,
  federalTierLabel,
  FEDERAL_LADDER,
  bribeBracket,
  BRIBE_PIPS,
  verbChipState,
  alertCategory,
  incidentNeedsYou,
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
  ATTACK_SHUTDOWN_WEEKS,
  ATTACK_HEAT,
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
  isShutDown,
  businessActions,
  resolveAttack,
  advanceRoutes,
  ensureBusinessCollector,
  cityRoster,
  citySummary,
  generateWorld,
  tileKindAt,
  scatterProps,
  WORLD_SIZE,
  type WorldLayout,
  type WorldDistrict,
  type PropPlacement,
  recordExtortVisit,
  extortProgress,
  createFog,
  revealAround,
  revealAll,
  revealAllRequested,
  isRevealed,
  STROLL_SPEED,
  RIVAL_DORMANT_WEEKS,
  FOG_REVEAL_RADIUS,
  type FogState,
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
import { NOIR_PALETTE, NOIR_FONT, NOIR_DISPLAY, heatLabel, shockFlavor, bribeChannelLabel } from './theme';
import {
  buildCityTextures,
  figureKeyFor,
  richArt,
  drawIsoBuilding,
  BUILDING_STYLES,
  TEX,
  PAL,
} from './cityArt';
import { AudioManager } from './audio';
import { cycleVolume } from './audioMap';
import type { MusicPhase } from './audioMap';
import {
  nextTimeScale, scaledDt, skipWeekDt,
} from './playability';
import { pickIdleMuscle, type MuscleCandidate } from './dispatch';
import {
  SPEC,
  MOTION,
  hexNum,
  satchelTier,
  dangerStageColor,
  federalBarColor,
  loyaltyMotion,
} from './visualSpec';

const PAN_SPEED = 720;
// RTS-22: a wider zoom range so the player can pull back to read the whole 9-district city or push
// in to drive individual thugs. Zoom is eased toward a target each frame for a smooth feel.
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.6;
const ZOOM_STEP = 0.12; // per wheel notch (fraction of current zoom)
const CLICK_SLOP = 6;

// RTS-28 PACING: the scene runs a tighter real-time week than the sim's 120s default so a week isn't
// mostly dead waiting (the economy PER week is identical — only the real-time spacing tightens). The
// rival-pulse cadence scales with it (~5.5 pulses/week, same as before). Fast-forward multiplies dt.
const SCENE_WEEK_SECONDS = 55;
const SCENE_PULSE_SECONDS = 10;


// RTS-30b-ground — the sparse-world ground palette, per tile kind, as a [lit, shadow] 2-tone (the
// low-contrast paving the world-spec asks for — soot-dark but clearly DIFFERENTIATED, never flat
// black so the gaps between buildings read as real ground/roads/parks, not void). Checker-picked.
const GROUND_TONES: Record<string, [number, number]> = {
  ground: [0x242019, 0x1e1b15],   // dirt / soot lot
  avenue: [0x262320, 0x201d1b],   // wide asphalt
  street: [0x242120, 0x1d1b19],   // asphalt
  sidewalk: [0x39342c, 0x322d26], // half-tone lighter paving (the curb read)
  park: [0x33442f, 0x2a3826],     // grass 2-tone
  plaza: [0x322d25, 0x29251f],    // deco paving
  building: [0x14110f, 0x14110f], // (the building Graphics draws over this)
};
// RTS-30b-ground — per-prop render spec: baked texture + base-anchor origin + a sub-tile pixel nudge
// + depth bias (props sort UNDER the building massing but over the ground) + a recede alpha.
interface PropSpec { tex: string; ox: number; oy: number; dx: number; dy: number; dz: number; alpha: number; }
const PROP_SPECS: Record<string, PropSpec> = {
  lamppost: { tex: TEX.lamppost, ox: 0.5, oy: 0.96, dx: 0, dy: 6, dz: 3, alpha: 0.92 },
  tree: { tex: TEX.tree, ox: 0.5, oy: 0.94, dx: 0, dy: 6, dz: 3, alpha: 0.95 },
  hydrant: { tex: TEX.hydrant, ox: 0.5, oy: 0.92, dx: -10, dy: 6, dz: 2, alpha: 0.9 },
  mailbox: { tex: TEX.mailbox, ox: 0.5, oy: 0.92, dx: 10, dy: 6, dz: 2, alpha: 0.9 },
  bench: { tex: TEX.bench, ox: 0.5, oy: 0.85, dx: 0, dy: 4, dz: 2, alpha: 0.9 },
  car: { tex: TEX.car, ox: 0.5, oy: 0.72, dx: 0, dy: 2, dz: 4, alpha: 0.85 },
  fence: { tex: TEX.fence, ox: 0.5, oy: 0.82, dx: 0, dy: 4, dz: 1, alpha: 0.8 },
};
const SEAM = 0x15120e;  // dark lane / paving expansion seam
const CURB = 0x4a443a;  // light curb edge on a sidewalk
const PARK_TUFT = 0x3c4e36; // grass tuft fleck
const PLAZA_INLAY = 0x40392f; // plaza deco seam
const FOUNTAIN_WATER = 0x2e3a3a; // muted water (never bright)

// RTS-30a — the three discrete zoom stops (CLOSE / MID resting / FAR strategy).
const ZOOM_STOPS = [1.0, 0.6, 0.35] as const;

interface UnitView {
  unit: MovableUnit;
  faction: 'player' | 'rival';
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  factionRing: Phaser.GameObjects.Ellipse;
  selRing: Phaser.GameObjects.Ellipse;
  cashTag?: Phaser.GameObjects.Text;
  dangerRing?: Phaser.GameObjects.Ellipse;
  satchelTier?: 1 | 2 | 3; // RTS-26: last-rendered collector satchel tier (swap texture only on change)
}

interface BizMarker { coin: Phaser.GameObjects.Image; glow?: Phaser.GameObjects.Image; roofX: number; roofY: number; }

export class IsoScene extends Phaser.Scene {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
  private targetZoom = 0.6; // eased toward each frame (RTS-22 smooth zoom)
  private zoomAnchor?: { sx: number; sy: number; wx: number; wy: number }; // RTS-23 zoom-to-cursor
  private navGrid!: NavGrid;
  private state!: GameState;
  private layout!: MapLayout;
  private world!: WorldLayout; // RTS-30a the sparse generated world (extends MapLayout)
  private groundGfx?: Phaser.GameObjects.Graphics; // culled per-frame ground/streets/parks + fog
  private uiCam?: Phaser.Cameras.Scene2D.Camera; // RTS-30a fixed HUD camera (never zooms)
  private scoutCue?: { card: Phaser.GameObjects.Text; outline: Phaser.GameObjects.Graphics }; // RTS-30a.1 fly-to cue
  // RTS-30b-ground: static set-dressing props (baked-once Images). `dressingDark` is the monotonically
  // shrinking list still under fog; `dressingFar` tracks the FAR-LOD bulk-hide threshold.
  private dressing: { img: Phaser.GameObjects.Image; gx: number; gy: number }[] = [];
  private dressingDark: { img: Phaser.GameObjects.Image; gx: number; gy: number }[] = [];
  private dressingFar = false;
  private lastFogSize = -1; // gate the prop-reveal scan: only run when the fog actually grew
  private units: UnitView[] = [];
  private bizMarkers = new Map<string, BizMarker>();
  private bizPlates = new Map<string, Phaser.GameObjects.Polygon>(); // RTS-22 allegiance plate per business
  // RTS-26: the drawn building per business + its current style key + tile, so a vice upgrade can
  // MORPH it (speakeasy → casino) by redrawing on the event (cached between events, never per-frame).
  private bizBuildings = new Map<string, { gfx: Phaser.GameObjects.Graphics; styleKey: string; gx: number; gy: number; depth: number; shut: boolean; boards?: Phaser.GameObjects.Graphics }>();
  private routeGfx?: Phaser.GameObjects.Graphics; // RTS-22 the drawn collection route
  private ctxMenu?: Phaser.GameObjects.Container; // RTS-22 right-click EXTORT/ATTACK menu
  private ctxRect?: { x: number; y: number; w: number; h: number };
  private ctxRows: { y0: number; y1: number; act: () => void }[] = [];
  private districtLabels = new Map<string, Phaser.GameObjects.Text>();
  private strategyPanel?: Phaser.GameObjects.Text;
  private strategyTitle?: Phaser.GameObjects.Text;
  private pressureBanner?: Phaser.GameObjects.Text;
  private endgameShown = false;
  // RTS-23 — elevated HUD (top bar / channel dials / context card / wire frame / audio seams)
  private hudGfx?: Phaser.GameObjects.Graphics; // all static + dynamic HUD framing
  private topCells: { label: Phaser.GameObjects.Text; value: Phaser.GameObjects.Text; x: number; w: number; key: string }[] = [];
  private phaseChip?: Phaser.GameObjects.Text;
  private heatCaption?: Phaser.GameObjects.Text;
  private channelTitle?: Phaser.GameObjects.Text;
  private channelRows: Phaser.GameObjects.Text[] = [];
  private channelPanelRect = { x: 12, y: 64, w: 250, h: 116 };
  private routePill?: Phaser.GameObjects.Text;
  private ctxCardTitle?: Phaser.GameObjects.Text;
  private ctxCardBody?: Phaser.GameObjects.Text;
  private hudRegions: { x: number; y: number; w: number; h: number; explain: string }[] = [];
  private lastHeat = 0;
  private lastPhase = '';
  private wireFlashUntil = 0;
  private lastIncidentSeq = -1;
  private lastSeenWireSeq = -1; // §4: incidents past this seq are "unread"
  private selection: Selection = emptySelection();
  private pressX = 0;
  private pressY = 0;
  private greaseIndex = 0;
  private lastTrailAt = 0;
  private robbedCollectors = new Set<string>();

  // HUD objects
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
  // RTS-24 — THE MARKET tab (right dock) + the hovered racket for [U] vice-upgrade.
  private marketOpen = false;
  private marketSel = 0; // 0..3 selected good
  private marketQty = 5; // fixed trade size
  private marketTitle?: Phaser.GameObjects.Text;
  private marketBody?: Phaser.GameObjects.Text;
  private ctxBizId?: string; // the business currently shown in the context card (for [U])
  private artRich = richArt(); // RTS-26: cached rich/lean flag (don't re-parse the URL per frame)
  // RTS-27 audio
  private audio!: AudioManager;
  private lastFederalTier = 0;     // to fire the teletype only when the tier CROSSES up
  private lastMutinyName = '';     // fire the mutiny stinger on the transition, not every frame
  private tipsFired = new Set<string>(); // consigliere tips: first-occurrence gating
  private audioPanelOpen = false;
  private audioPanel?: Phaser.GameObjects.Text;
  // RTS-28 playability
  private timeScale = 1;            // fast-forward multiplier (1× / 2× / 4×)
  private skipWeekPending = false;  // consume on the next update to jump to the next week boundary
  private ffButton?: Phaser.GameObjects.Text;   // on-screen fast-forward control
  private skipButton?: Phaser.GameObjects.Text; // on-screen skip-week control
  // RTS-29: the Market is OFF by default now (its dock tab is freed for the CONTROL readout); opt back
  // in only with ?market=on. The market code stays dormant behind the flag (not ripped out).
  private marketEnabled = (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('market') : null) === 'on';
  // RTS-30a.1: ?reveal=1 lifts the fog over the whole map so the sparse city is inspectable (debug-only;
  // normal play keeps the fog). Parsed by the pure revealAllRequested helper.
  private debugRevealAll = typeof window !== 'undefined' && revealAllRequested(window.location?.search ?? '');
  private focusBizId?: string;      // a left-clicked building (RTS-28 building selection)
  private actionTitle?: Phaser.GameObjects.Text; // RTS-28 the separated ACTION BOARD
  private actionBody?: Phaser.GameObjects.Text;
  // RTS-29 reshape — fog of war, the CONTROL readout, fixed per-business collectors, extort-visits.
  private fog: FogState = createFog();
  private controlTitle?: Phaser.GameObjects.Text;
  private controlBody?: Phaser.GameObjects.Text;
  private cityRowHits: { x: number; y: number; w: number; h: number; districtId: string }[] = [];
  private extortIntents = new Map<string, string>(); // unitId → businessId a thug is walking to lean on
  // RTS-25 — crisp text + per-frame rasterisation budget. textRes renders each Text's canvas at the
  // device pixel ratio (no blurry browser upscaling). setT() change-gates setText so we only re-
  // rasterise a label when its string actually changed (the per-frame text churn was the bottleneck).
  private textRes = Math.min((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1, 2);
  private rasterCount = 0;       // setText rasterisations this second (the cost we cut)
  private rasterPerSec = 0;      // last full second's count (shown in the [P] overlay)
  private perfAccumMs = 0;       // 1s window for the raster/fps sample
  private perfVisible = false;
  private perfText?: Phaser.GameObjects.Text;

  constructor() {
    super('IsoScene');
  }

  /** RTS-25 — every Text in the scene is born here: rasterised at the device pixel ratio (crisp on
   * HiDPI, not a blurry browser upscale) and given a subtle dark backing so it stays legible over the
   * soot/iso playfield and the textured HUD plates. Drop-in for this.add.text. */
  private mkText(x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.GameObjects.Text {
    const t = new Phaser.GameObjects.Text(this, x, y, text, { resolution: this.textRes, ...style });
    this.add.existing(t);
    t.setShadow(0, 1, '#0a0807', 3, false, true); // contrast backing (the readability fix)
    return t;
  }

  /** RTS-25 — change-gated setText: only re-rasterise (the expensive Phaser canvas re-render + GPU
   * upload) when the string actually changed. Behaviour-identical to setText; the win is on the ~40
   * HUD labels that were re-rasterising every frame even when nothing moved. Returns the object so
   * existing .setColor()/.setPosition() chains keep working. */
  private setT<T extends Phaser.GameObjects.Text>(o: T, s: string): T {
    if (o.text !== s) { o.setText(s); this.rasterCount++; }
    return o;
  }

  /** RTS-25 — change-gated text + colour. setColor ALSO re-rasterises in Phaser (it routes through
   * updateText), so gating the colour matters as much as the string. Trailing .setPosition()/
   * .setVisible()/.setAlpha() are cheap transforms and stay chained as-is. */
  private setTC<T extends Phaser.GameObjects.Text>(o: T, s: string, color: string): T {
    if (o.text !== s) { o.setText(s); this.rasterCount++; }
    if (o.style.color !== color) { o.setColor(color); this.rasterCount++; }
    return o;
  }

  /** RTS-25 — change-gated colour only (e.g. the per-frame district nameplate recolour). */
  private setC<T extends Phaser.GameObjects.Text>(o: T, color: string): T {
    if (o.style.color !== color) { o.setColor(color); this.rasterCount++; }
    return o;
  }

  preload(): void {
    // RTS-27: register the audio library for loading (missing clips 404 → graceful no-op).
    AudioManager.preload(this);
  }

  create(): void {
    buildCityTextures(this);
    const cam = this.cameras.main;
    cam.setBackgroundColor(PAL.soot);

    // RTS-11: start with a small loyal crew so the opening is fair (muscle + defense).
    // RTS-12/16: a fair opening (loyal crew + one protected run) on the BIG contested city —
    // a 9-district turf war against two active rival families.
    this.state = createInitialState(1, { startingCrew: true, tutorialFreeRuns: 1, bigCity: true });
    // RTS-29: rivals stay DORMANT (no territorial contact) for the first weeks — the peaceful runway.
    this.state.rivalWakeWeek = RIVAL_DORMANT_WEEKS;
    this.applyDebugScenario();
    // RTS-30a: the SPARSE LARGER world — buildings placed apart with setbacks across a 96² map,
    // partitioned into districts. WorldLayout extends MapLayout, so collectors/routes consume it
    // unchanged. The ground/streets/parks are CULLED to the viewport (drawGround), not 4096 Images.
    this.world = generateWorld(this.state, { size: WORLD_SIZE });
    this.layout = this.world;
    this.navGrid = makeGrid(WORLD_SIZE, WORLD_SIZE); // walkable everywhere (buildings aren't blockers)
    this.groundGfx = this.add.graphics().setDepth(0);

    this.drawCity();
    this.drawSetDressing(); // RTS-30b-ground: faction-neutral static props on the open tiles
    this.spawnUnits();
    // RTS-30a: the fog veil is rendered CULLED inside drawGround (per visible tile); here we just seed
    // the opening pocket around the HQ + starting units into the revealed set.
    this.seedFogAroundPlayer();

    // RTS-22: frame the player's home neighbourhood (where the extort-first opening happens), zoomed
    // out enough to read the block. The camera is fully driveable (WASD / drag / wheel / F-follow).
    this.routeGfx = this.add.graphics().setDepth(7);
    // RTS-30a: clamp the camera to the WORLD bounds (no black void), and OPEN framed on the player's
    // HQ DISTRICT at MID zoom — the calm, readable home base. The rest is under fog.
    this.setWorldCameraBounds();
    const home = this.world.districts[0];
    const c = gridToScreen(home.plaza.gx, home.plaza.gy);
    cam.centerOn(c.x, c.y - 60);
    this.targetZoom = ZOOM_STOPS[1]; // MID = the resting view
    cam.setZoom(this.targetZoom);

    this.setupCameraControls();
    this.setupSelectionInput();
    this.setupHoverTooltip();
    this.drawHud();
    this.buildObjective();
    this.buildLegend();

    // ── RTS-27 AUDIO: wire the manager, start the beds (on unlock), seed the phase machine ──
    this.audio = new AudioManager(this);
    this.audio.ready();
    this.lastPhase = hudPhase(this.state).phase; // seed so we don't sting on the first frame
    const startBeds = (): void => this.audio.startBeds();
    if (this.sound.locked) this.sound.once('unlocked', startBeds); else startBeds();
    this.audio.setPhase(this.lastPhase as MusicPhase, true);
    this.buildAudioPanel();
    // RTS-30a: split the world + HUD onto two cameras (AFTER all HUD exists) so the HUD never zooms.
    this.setupUiCamera();
    // consigliere: the extort-first tip on a fresh load (gated to once)
    this.fireTipOnce('extort');
  }

  // ── onboarding objective (RTS-11) ────────────────────────────────────────────────────────

  private buildObjective(): void {
    // A pulsing world-space ring over the suggested first target.
    this.highlight = this.add.ellipse(0, 0, 96, 50).setStrokeStyle(3, PAL.brass, 1).setVisible(false);
    // A blood ring over the prowling enforcer when the route is hot (RTS-13 timing telegraph).
    this.routeWarn = this.add.ellipse(0, 0, 44, 24).setStrokeStyle(3, PAL.blood, 1).setVisible(false);
    // A persistent top-centre objective banner.
    this.objTitle = this.mkText(this.scale.width / 2, 12, '', { fontFamily: NOIR_DISPLAY, fontSize: '18px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100000);
    this.objDetail = this.mkText(this.scale.width / 2, 34, '', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.bone, align: 'center', wordWrap: { width: 560 } }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100000);
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
    this.setTC(this.objTitle, `▶  ${o.title}`, o.done ? NOIR_PALETTE.fog : NOIR_PALETTE.brass).setPosition(cx, 62);
    this.setT(this.objDetail, detail).setPosition(cx, 82);
  }

  // ── the city ─────────────────────────────────────────────────────────────────────────────

  private drawCity(): void {
    // RTS-30a: the ground/streets/parks/plazas + fog are drawn CULLED per frame (drawGround) instead
    // of 4096 tile Images. Only the sparse buildings/plates/markers below are drawn-once objects.

    // businesses — brick storefronts; a protection coin floats over player-extorted fronts
    for (const d of this.state.districts) {
      for (const biz of d.businesses) {
        const t = businessTileOf(this.layout, biz.id);
        if (!t) continue;
        const c = gridToScreen(t.gx, t.gy);
        // RTS-22 allegiance plate: a coloured diamond on the ground under each business reads its
        // state at a glance — fog = un-shaken, brass = yours-paying, blood = a rival's, dark = shut.
        const corners = tileCorners(t.gx, t.gy).map((pt) => ({ x: pt.x - c.x, y: pt.y - c.y }));
        const plate = this.add.polygon(c.x, c.y, corners, hexNum(SPEC.fog), 0.16)
          .setStrokeStyle(1.5, hexNum(SPEC.fog), 0.5)
          .setDepth(depthValue(t.gx, t.gy) * 10 + 1);
        this.bizPlates.set(biz.id, plate);
        // RTS-26: an upgraded vice racket (rts24 viceRung) reads as a CASINO; else its base style.
        const upgraded = (biz.viceRung ?? 0) >= 2 && (biz.kind === 'speakeasy' || biz.kind === 'numbers');
        const styleKey = upgraded ? 'casino'
          : biz.kind === 'front' ? 'storefront' : biz.kind === 'speakeasy' || biz.kind === 'numbers' ? 'speakeasy' : 'warehouse';
        const bdepth = depthValue(t.gx, t.gy) * 10 + 5;
        const roof = drawIsoBuilding(this, c.x, c.y, BUILDING_STYLES[styleKey], bdepth, { lit: !isShutDown(biz) });
        this.bizBuildings.set(biz.id, { gfx: roof.gfx, styleKey, gx: t.gx, gy: t.gy, depth: bdepth, shut: isShutDown(biz) });
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
        // RTS-25: a solid ink backing plate so the district name stays legible over the cobbles
        // (was bare fog text on a textured ground). Zoom-gated in refreshStrategy so it doesn't
        // smear into an unreadable speck when the whole city is framed.
        this.districtLabels.set(d.id, this.mkText(c.x, c.y - 2, d.name.toUpperCase(), { fontFamily: NOIR_DISPLAY, fontSize: '13px', color: NOIR_PALETTE.bone, fontStyle: 'bold', backgroundColor: '#14110fcc', padding: { x: 5, y: 2 } })
          .setOrigin(0.5, 0.5).setDepth(depthValue(first.gx, first.gy) * 10 + 8));
      }
    }

    // HQs — a distinct brass-trimmed tower with a faction flag
    for (const fid of ['player', 'rival-a', 'rival-b'] as const) {
      const hq = hqTileOf(this.layout, fid);
      if (!hq) continue;
      const c = gridToScreen(hq.gx, hq.gy);
      const hqFaction: 'player' | 'rival' = fid === 'player' ? 'player' : 'rival';
      const roof = drawIsoBuilding(this, c.x, c.y, BUILDING_STYLES.hq, depthValue(hq.gx, hq.gy) * 10 + 5, { faction: hqFaction });
      // RTS-26: the boss's signature ride parked at the seat — a hero Cadillac whose coachline +
      // wheel hubs carry the faction accent (baked in, not a body-wide tint per the accent law).
      if (richArt()) this.add.image(c.x - 34, c.y + 20, fid === 'player' ? TEX.carPlayer : TEX.carRival).setOrigin(0.5, 0.7).setDepth(depthValue(hq.gx, hq.gy) * 10 + 4);
      const flagCol = fid === 'player' ? PAL.brass : PAL.blood;
      this.add.rectangle(roof.roofX, roof.roofY - 10, 3, 20, PAL.ink).setDepth(depthValue(hq.gx, hq.gy) * 10 + 7);
      this.add.triangle(roof.roofX + 9, roof.roofY - 16, 0, 0, 16, 4, 0, 8, flagCol).setDepth(depthValue(hq.gx, hq.gy) * 10 + 7);
      this.mkText(roof.roofX, roof.roofY - 24, fid === 'player' ? 'YOUR HQ' : 'RIVAL', {
        fontFamily: NOIR_DISPLAY, fontSize: '13px', color: NOIR_PALETTE.bone, fontStyle: 'bold',
        backgroundColor: '#14110fcc', padding: { x: 4, y: 1 },
      })
        .setOrigin(0.5, 1)
        .setDepth(depthValue(hq.gx, hq.gy) * 10 + 7);
    }
  }

  /** RTS-30b-ground — scatter the faction-NEUTRAL static set dressing (lampposts, trees, parked cars,
   * hydrants/mailboxes, benches, fences) onto the open non-building tiles the worldgen classified.
   * Deterministic (seeded by the map seed) + baked-once cached textures. The props start HIDDEN and are
   * revealed by the fog pass / hidden in bulk at FAR zoom (managed in update) so render stays bounded by
   * the viewport. Drawn before setupUiCamera so the world/HUD camera split already ignores them. */
  private drawSetDressing(): void {
    const props: PropPlacement[] = scatterProps(this.world, { seed: this.state.seed });
    for (const p of props) {
      const spec = PROP_SPECS[p.kind];
      if (!spec) continue;
      const c = gridToScreen(p.gx, p.gy);
      const img = this.add.image(c.x + spec.dx, c.y + spec.dy, spec.tex)
        .setOrigin(spec.ox, spec.oy)
        .setAlpha(spec.alpha)
        .setDepth(depthValue(p.gx, p.gy) * 10 + spec.dz)
        .setVisible(false); // shown when its tile is fog-revealed (update)
      const rec = { img, gx: p.gx, gy: p.gy };
      this.dressing.push(rec);
      this.dressingDark.push(rec);
    }
  }

  /** RTS-30b-ground — keep the static dressing viewport-cheap: bulk-hide ALL props at FAR (the strategy
   * zoom needs washes, not specks), and lazily reveal props as the fog peels back (monotonic — the dark
   * list only shrinks, via in-place swap-remove so there's NO per-frame allocation). The reveal scan is
   * skipped entirely on frames where the fog didn't grow (size unchanged), so it's O(1) at rest. */
  private updateDressingVisibility(): void {
    const far = this.cameras.main.zoom < 0.45;
    if (far !== this.dressingFar) {
      this.dressingFar = far;
      // threshold cross only: hide all at FAR; on return, re-show the fog-revealed ones.
      for (const p of this.dressing) p.img.setVisible(!far && isRevealed(this.fog, p.gx, p.gy));
      this.lastFogSize = -1; // visibility was just overwritten — force one rescan next non-far frame
    }
    if (far) return;
    const fogSize = this.fog.size;
    if (fogSize === this.lastFogSize) return; // fog didn't grow → nothing newly revealed
    this.lastFogSize = fogSize;
    for (let i = this.dressingDark.length - 1; i >= 0; i--) {
      const p = this.dressingDark[i];
      if (!isRevealed(this.fog, p.gx, p.gy)) continue;
      p.img.setVisible(true);
      this.dressingDark[i] = this.dressingDark[this.dressingDark.length - 1];
      this.dressingDark.pop();
    }
  }

  /** RTS-30a — CULLED ground render: each frame draw only the tiles in the camera's view (the big
   * sparse map is ~4096 tiles; we never touch offscreen ones). Fog over unrevealed tiles; a faint
   * district ownership wash; LOD drops per-tile detail at FAR zoom for performance. */
  private drawGround(): void {
    if (!this.groundGfx || !this.world) return;
    const g = this.groundGfx; g.clear();
    const cam = this.cameras.main;
    const view = cam.worldView;
    const size = this.world.size;
    const corners = [
      screenToGrid(view.x, view.y), screenToGrid(view.right, view.y),
      screenToGrid(view.x, view.bottom), screenToGrid(view.right, view.bottom),
    ];
    let minGx = Infinity, maxGx = -Infinity, minGy = Infinity, maxGy = -Infinity;
    for (const c of corners) { minGx = Math.min(minGx, c.gx); maxGx = Math.max(maxGx, c.gx); minGy = Math.min(minGy, c.gy); maxGy = Math.max(maxGy, c.gy); }
    const pad = 2;
    minGx = Math.max(0, Math.floor(minGx) - pad); minGy = Math.max(0, Math.floor(minGy) - pad);
    maxGx = Math.min(size - 1, Math.ceil(maxGx) + pad); maxGy = Math.min(size - 1, Math.ceil(maxGy) + pad);
    const far = cam.zoom < 0.45;
    // district ownership wash colour per district (computed once per frame — ~9 entries)
    const wash = new Map<string, { c: number; a: number }>();
    for (const row of cityRoster(this.state)) {
      if (row.status === 'HELD') wash.set(row.id, { c: hexNum(SPEC.brass), a: 0.05 });
      else if (row.status === 'RIVAL') wash.set(row.id, { c: hexNum(SPEC.rival), a: 0.07 });
    }
    if (far) {
      // FAR LOD: a cheap soot fill over the view + only the non-ground features + washes + fog.
      g.fillStyle(0x161310, 1).fillRect(view.x, view.y, view.width, view.height);
    }
    const detail = !far; // fine paving seams / curbs / grass at CLOSE+MID; dropped at FAR (LOD)
    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gy = minGy; gy <= maxGy; gy++) {
        const pts = tileCorners(gx, gy);
        if (!isRevealed(this.fog, gx, gy)) { g.fillStyle(0x0e0c0b, 0.97).fillPoints(pts, true); continue; }
        const k = tileKindAt(this.world, gx, gy);
        const checker = (gx + gy) % 2 === 0;
        if (far && k === 'ground') { /* covered by the bulk soot fill */ }
        else {
          const tone = GROUND_TONES[k] ?? GROUND_TONES.ground;
          g.fillStyle(checker ? tone[0] : tone[1], 1).fillPoints(pts, true);
          if (detail) this.groundDetail(g, pts, k, gx, gy);
        }
        const w = wash.get(this.world.districtOfTile[gy * size + gx]);
        if (w) { g.fillStyle(w.c, w.a).fillPoints(pts, true); }
      }
    }
    // FOUNTAINS — the plaza landmark of each (revealed, in-view) district: concentric ellipses with a
    // slow shimmer. ~9 districts; only the visible ones draw — a handful of ops, never per-tile.
    if (!far) for (const d of this.world.districts) {
      if (d.plaza.gx < minGx || d.plaza.gx > maxGx || d.plaza.gy < minGy || d.plaza.gy > maxGy) continue;
      if (!isRevealed(this.fog, d.plaza.gx, d.plaza.gy)) continue;
      this.drawFountain(g, d.plaza.gx, d.plaza.gy);
    }
  }

  /** Per-tile ground texture by kind (only at CLOSE/MID): road lane seams, the sidewalk curb, plaza
   * deco inlay, park tufts. Cheap vector — a couple of ops, bounded by the visible-tile count. */
  private groundDetail(g: Phaser.GameObjects.Graphics, pts: ReturnType<typeof tileCorners>, k: string, gx: number, gy: number): void {
    const [top, right, bottom, left] = pts;
    if (k === 'avenue' || k === 'street') {
      g.lineStyle(1, SEAM, 0.5); g.beginPath(); g.moveTo(left.x, left.y); g.lineTo(right.x, right.y); g.strokePath();
    } else if (k === 'sidewalk') {
      // a light curb line along the NW edge (the raised-kerb read)
      g.lineStyle(1.5, CURB, 0.4); g.beginPath(); g.moveTo(left.x, left.y); g.lineTo(top.x, top.y); g.strokePath();
    } else if (k === 'plaza') {
      g.lineStyle(1, PLAZA_INLAY, 0.55); g.beginPath();
      g.moveTo(top.x, top.y); g.lineTo(bottom.x, bottom.y); g.moveTo(left.x, left.y); g.lineTo(right.x, right.y); g.strokePath();
    } else if (k === 'park' && (gx * 7 + gy * 3) % 4 === 0) {
      g.fillStyle(PARK_TUFT, 0.8); g.fillCircle((left.x + right.x) / 2 + ((gx % 3) - 1) * 8, left.y + ((gy % 3) - 1) * 4, 1.6);
    }
  }

  /** A plaza FOUNTAIN landmark — concentric basin ellipses + a slow water shimmer (calm, ambient). */
  private drawFountain(g: Phaser.GameObjects.Graphics, gx: number, gy: number): void {
    const c = gridToScreen(gx, gy);
    const shimmer = 0.5 + 0.5 * Math.sin(this.time.now / 900); // slow, never the danger tempo
    g.fillStyle(0x322d25, 1); g.fillEllipse(c.x, c.y, 46, 24); // stone basin rim
    g.fillStyle(0x29251f, 1); g.fillEllipse(c.x, c.y, 38, 19);
    g.fillStyle(FOUNTAIN_WATER, 1); g.fillEllipse(c.x, c.y, 30, 15); // water
    g.fillStyle(0x3a4a4a, 0.5 + 0.3 * shimmer); g.fillEllipse(c.x, c.y - 1, 16 + shimmer * 4, 8); // shimmer ring
    g.fillStyle(0x4a5a5a, 0.6); g.fillEllipse(c.x, c.y - 2, 4, 3); // central jet base
  }

  // ── units ────────────────────────────────────────────────────────────────────────────────

  /** RTS-26 — sparse period set-dressing drawn ONCE (cached, never per-frame): cast-iron lampposts
   * with a warm glow at street corners, and a few parked Cadillacs along the kerb. Rich-art only. */
  // ── RTS-29 fog of war ─────────────────────────────────────────────────────────────────────────

  /** RTS-30a: reveal the opening pocket around the player's HQ + starting units. The veil is RENDERED
   * culled in drawGround (per-visible-tile), so this only updates the revealed set. */
  private seedFogAroundPlayer(): void {
    // RTS-30a.1 ?reveal=1 (debug): lift the fog over the WHOLE map so the full sparse city — avenues,
    // parks/plazas, every district + its boundaries/nameplates/washes — is inspectable + playtestable.
    if (this.debugRevealAll) { revealAll(this.fog, WORLD_SIZE, WORLD_SIZE); return; }
    const hq = hqTileOf(this.layout, 'player');
    if (hq) revealAround(this.fog, hq.gx, hq.gy, FOG_REVEAL_RADIUS + 2, WORLD_SIZE, WORLD_SIZE);
    for (const v of this.units) { const t = unitTile(v.unit); revealAround(this.fog, t.gx, t.gy, FOG_REVEAL_RADIUS, WORLD_SIZE, WORLD_SIZE); }
  }

  /** Reveal around the HQ + every player unit each frame (updates the set; drawGround renders it). */
  private revealFog(): void {
    const hq = hqTileOf(this.layout, 'player');
    if (hq) revealAround(this.fog, hq.gx, hq.gy, FOG_REVEAL_RADIUS, WORLD_SIZE, WORLD_SIZE);
    for (const v of this.units) {
      if (v.faction !== 'player') continue;
      const t = unitTile(v.unit);
      revealAround(this.fog, t.gx, t.gy, FOG_REVEAL_RADIUS, WORLD_SIZE, WORLD_SIZE);
    }
  }

  private spawnUnits(): void {
    // RTS-29: your two starting button men at the SLOW stroll speed (travel is visible ambient time).
    // NO rival enforcer is spawned — rivals are dormant/off-screen across the fog this slice (the
    // interception path is retained but never triggered while rivals sleep — see RTS-30).
    this.addUnit(spawnUnit('muscle-1', 3, 2, STROLL_SPEED), 'player');
    this.addUnit(spawnUnit('muscle-2', 4, 2, STROLL_SPEED), 'player');
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
    const selRing = this.add.ellipse(0, 0, 38, 20).setStrokeStyle(3, PAL.brass, 1).setVisible(false);
    const sprite = this.add.image(0, 0, figureKeyFor(unit.role, faction, 1)).setOrigin(0.5, 0.93);
    const view: UnitView = { unit, faction, sprite, shadow, factionRing, selRing };
    if (unit.role === 'collector') {
      view.dangerRing = this.add.ellipse(0, 0, 40, 22).setStrokeStyle(3, PAL.blood, 1).setVisible(false);
      view.cashTag = this.add
        .text(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.brass, fontStyle: 'bold' })
        .setOrigin(0.5, 1)
        .setVisible(false);
    }
    // RTS-30a: runtime world objects must be ignored by the fixed UI camera (else they'd ghost on it).
    this.worldFx(view.sprite, view.shadow, view.factionRing, view.selRing, view.cashTag, view.dangerRing);
    this.units.push(view);
  }

  /** RTS-30a — register runtime-created WORLD objects so the fixed UI camera ignores them (the
   * create-time snapshot in setupUiCamera only covers objects that existed then). */
  private worldFx(...objs: (Phaser.GameObjects.GameObject | undefined)[]): void {
    if (!this.uiCam) return;
    for (const o of objs) if (o) this.uiCam.ignore(o);
  }

  /** RTS-30a.1 — mirror of worldFx for runtime-created HUD objects (scrollFactor 0): the MAIN camera
   * must ignore them, or they'd double-render in world space (the create-time snapshot only covers
   * objects that existed at setupUiCamera). */
  private hudFx(...objs: (Phaser.GameObjects.GameObject | undefined)[]): void {
    for (const o of objs) if (o) this.cameras.main.ignore(o);
  }

  private updateUnits(dt: number): void {
    // rival hunts whichever player collector is carrying cash
    const collector = this.playerCarrier();
    const gun = this.state.units.find((u) => u.id === 'rival-gun');
    if (collector && gun) issueMove(gun, unitTile(collector), this.navGrid);

    // RTS-28 PACING: feed the sim a tighter real-time week + the fast-forward multiplier; a pending
    // SKIP-WEEK jumps straight to the next settlement (exactly one). Economy math is untouched.
    let stepDt = scaledDt(dt, this.timeScale);
    if (this.skipWeekPending) { stepDt = skipWeekDt(this.state.weekElapsed ?? 0, SCENE_WEEK_SECONDS); this.skipWeekPending = false; }
    const obs = observeWorld(this.state, stepDt, SCENE_WEEK_SECONDS, SCENE_PULSE_SECONDS);
    this.state = obs.state;
    // RTS-24: on each settled week, run the content beat — civic INFLUENCE accrual (Mayor path),
    // market drift back toward balance, and the light event roll. WRAPS settlement; tick untouched.
    // RTS-28 ?market=off de-emphasises the Market + Events noise: still accrue civic influence
    // (the Mayor win path), but skip the market drift + event rolls. Default on = unchanged.
    if (obs.result.weeksFired > 0) {
      if (this.marketEnabled) advanceWeeklyContent(this.state, obs.result.weeksFired);
      else for (let i = 0; i < obs.result.weeksFired; i++) advanceCivics(this.state);
    }
    // RTS-22/29: advance the fixed per-business collectors (gather → bank → loop). No-op without one.
    advanceRoutes(this.state, this.layout, this.navGrid);
    // RTS-29: a thug that has walked to a front leans on it (a muscle VISIT); ensure a collector
    // exists for every business we earn from (the sea-of-collectors). Cheap; acts only on change.
    this.processExtortArrivals();
    if (obs.result.weeksFired > 0) this.syncBusinessCollectors();
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
        const tier = (carry.vulnerable ? satchelTier(carry.carrying) : 1) as 1 | 2 | 3;
        // RTS-26: swap to the matching baked satchel-tier figure ONLY when the tier changes (cached,
        // state-driven — never a per-frame re-rasterise).
        if (this.artRich && v.satchelTier !== tier) {
          v.sprite.setTexture(figureKeyFor(v.unit.role, v.faction, tier));
          v.satchelTier = tier;
        }
        v.cashTag.setVisible(carry.vulnerable).setPosition(s.x, s.y - 40).setDepth(depth + 1)
          .setScale(0.88 + tier * 0.12);
        const safe = !!v.unit.protectedRun;
        if (carry.vulnerable) this.setT(v.cashTag, safe ? `$${carry.carrying} ✓ SAFE` : `$${carry.carrying}`);
        const threat = carry.vulnerable ? threats.get(v.unit.id) : undefined;
        if (safe && carry.vulnerable) {
          // Tutorial run: a steady brass ring reads as "guaranteed home" even as the rival hunts.
          v.dangerRing.setStrokeStyle(3, hexNum(SPEC.brass), 0.9).setPosition(s.x, s.y + 2).setDepth(depth - 1).setVisible(true);
          this.setC(v.cashTag, SPEC.brass);
        } else if (threat) {
          // Two-stage danger ring: amber when threatened, danger-red MOTION at ambush range.
          const col = hexNum(dangerStageColor(threat.level));
          v.dangerRing.setStrokeStyle(3, col, threat.level === 'ambush' ? 0.6 + 0.4 * pulse : 0.85)
            .setPosition(s.x, s.y + 2).setDepth(depth - 1).setVisible(true);
          this.setC(v.cashTag, threat.level === 'ambush' ? SPEC.danger : SPEC.brass);
        } else {
          v.dangerRing.setVisible(false);
          this.setC(v.cashTag, SPEC.brass);
        }
        // Cash trail: a carrying collector drops faint greenback breadcrumbs (~2s fade).
        if (carry.vulnerable && moving) this.dropGreenback(s.x, s.y, depth - 3);
      }
    }

    // RTS-29 badges: a spinning brass coin over fronts — DIM [%] (extortable invitation) vs FULL [$]
    // (earning) — and HIDDEN under the fog (so shrouded blocks/rivals stay unseen).
    const spinAngle = ((now % MOTION.coinSpin) / MOTION.coinSpin) * 360;
    for (const [bid, m] of this.bizMarkers) {
      const t = businessTileOf(this.layout, bid);
      if (t && !isRevealed(this.fog, t.gx, t.gy)) { m.coin.setVisible(false); if (m.glow) m.glow.setVisible(false); continue; }
      const insp = inspectBusiness(this.state, bid);
      const earning = !!insp?.payingProtection;
      const extortable = !earning && !!extortProgress(this.state, bid)?.extortable; // only for revealed fronts
      const on = earning || extortable;
      m.coin.setVisible(on);
      if (m.glow) m.glow.setVisible(earning);
      if (on) {
        m.coin.setAngle(spinAngle).setY(m.roofY - 6 + Math.sin(now / 700) * 2).setAlpha(earning ? 1 : 0.45);
        if (m.glow && earning) m.glow.setAlpha(0.25 + 0.1 * Math.sin(now / 700));
      }
    }

    // RTS-22: recolour each business's allegiance plate by who earns from it (and dark if shut).
    this.refreshBizPlates();
    this.refreshRoute();
  }

  /** RTS-22: read every business's state onto its ground plate — fog (un-shaken) / brass (yours) /
   * rival-red (a rival's) / dark (shut down by an ATTACK). */
  private refreshBizPlates(): void {
    for (const b of allBusinesses(this.state)) {
      const plate = this.bizPlates.get(b.id);
      if (!plate) continue;
      const earner = businessEarner(b);
      const shut = isShutDown(b);
      let fill = hexNum(SPEC.fog), alpha = 0.14, stroke = hexNum(SPEC.fog), sAlpha = 0.45;
      if (shut) { fill = hexNum(SPEC.soot); alpha = 0.5; stroke = hexNum(SPEC.danger); sAlpha = 0.6; }
      else if (earner === 'player') { fill = hexNum(SPEC.brass); alpha = 0.26; stroke = hexNum(SPEC.brass); sAlpha = 0.8; }
      else if (earner && earner.startsWith('rival')) { fill = hexNum(SPEC.rival); alpha = 0.26; stroke = hexNum(SPEC.rival); sAlpha = 0.8; }
      plate.setFillStyle(fill, alpha).setStrokeStyle(1.5, stroke, sAlpha);
      // RTS-26: the building boards up / relights on the SHUT transition (event-driven redraw, not
      // per-frame — windows go dark + X-boards over the door when raided, warm again when reopened).
      const rec = this.bizBuildings.get(b.id);
      if (rec && rec.shut !== shut) this.relightBuilding(b.id, shut);
    }
  }

  /** RTS-26 — redraw one racket's building lit/shut on the state transition (raided ↔ reopened).
   * Mirrors the morph: destroy + re-bake the one Graphics ONCE, then static; adds X-boards when shut. */
  private relightBuilding(bizId: string, shut: boolean): void {
    const rec = this.bizBuildings.get(bizId);
    if (!rec) return;
    rec.gfx.destroy();
    rec.boards?.destroy();
    const c = gridToScreen(rec.gx, rec.gy);
    const roof = drawIsoBuilding(this, c.x, c.y, BUILDING_STYLES[rec.styleKey], rec.depth, { lit: !shut });
    let boards: Phaser.GameObjects.Graphics | undefined;
    if (shut) {
      boards = this.add.graphics().setDepth(rec.depth + 1);
      boards.fillStyle(hexNum('#3a2c20'), 1); // timber X-boards over the door
      boards.fillRect(c.x - 8, c.y + 6, 16, 3);
      boards.fillRect(c.x - 8, c.y + 12, 16, 3);
      this.cameras.main.flash(150, 225, 29, 29, false); // one-shot danger flash on closure (≤1.1s)
    }
    this.worldFx(roof.gfx, boards);
    this.bizBuildings.set(bizId, { ...rec, gfx: roof.gfx, shut, boards });
  }

  /** RTS-22: draw the active player collection route as a faint brass polyline through its stops. */
  private refreshRoute(): void {
    if (!this.routeGfx) return;
    this.routeGfx.clear();
    const route = this.state.routes?.find((r) => r.familyId === 'player');
    if (!route) return;
    const hq = hqTileOf(this.layout, 'player');
    const pts: { x: number; y: number }[] = [];
    if (hq) pts.push(gridToScreen(hq.gx, hq.gy));
    for (const sid of route.stops) { const t = businessTileOf(this.layout, sid); if (t) pts.push(gridToScreen(t.gx, t.gy)); }
    if (hq) pts.push(gridToScreen(hq.gx, hq.gy));
    if (pts.length < 2) return;
    this.routeGfx.lineStyle(2, hexNum(SPEC.brass), 0.5);
    this.routeGfx.beginPath();
    this.routeGfx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.routeGfx.lineTo(pts[i].x, pts[i].y);
    this.routeGfx.strokePath();
    for (const sid of route.stops) { const t = businessTileOf(this.layout, sid); if (t) { const c = gridToScreen(t.gx, t.gy); this.routeGfx.fillStyle(hexNum(SPEC.brass), 0.6).fillCircle(c.x, c.y, 3); } }
  }

  /** Cash trail (RTS-15): drop a fading greenback breadcrumb, throttled to ~5/sec. */
  private dropGreenback(x: number, y: number, depth: number): void {
    if (this.time.now - this.lastTrailAt < 200) return;
    this.lastTrailAt = this.time.now;
    const gb = this.add.image(x + Phaser.Math.Between(-4, 4), y - 6, TEX.greenback)
      .setDepth(depth).setAngle(Phaser.Math.Between(-30, 30)).setAlpha(0.9);
    this.worldFx(gb);
    this.tweens.add({ targets: gb, alpha: 0, y: y + 2, duration: MOTION.cashTrail, onComplete: () => gb.destroy() });
  }

  /** Ambush beat (RTS-15): a danger-red muzzle flash, three 6px shakes, and grab-able banknotes
   * scattering from the robbed collector. */
  private flashAmbush(ev: InterceptionEvent): void {
    if (this.robbedCollectors.has(ev.collectorId)) return;
    this.robbedCollectors.add(ev.collectorId);
    this.signalBeat('ambush', 'YOUR COLLECTOR WAS ROBBED — guard the route'); // RTS-23 audio seam
    const v = this.units.find((u) => u.unit.id === ev.collectorId);
    if (!v) return;
    const s = unitScreenPos(v.unit);

    // muzzle flash — danger-red, soft radial, brief (motion = danger).
    const flashGlow = this.add.image(s.x + 8, s.y - 14, TEX.glow).setTint(hexNum(SPEC.danger)).setScale(0.4).setDepth(100001);
    this.worldFx(flashGlow);
    this.tweens.add({ targets: flashGlow, scale: 1.1, alpha: 0, duration: 180, onComplete: () => flashGlow.destroy() });
    const ring = this.add.circle(s.x, s.y - 8, 8).setStrokeStyle(4, hexNum(SPEC.danger), 1).setDepth(100001);
    this.worldFx(ring);
    this.tweens.add({ targets: ring, scale: 7, alpha: 0, duration: 600, onComplete: () => ring.destroy() });

    // three sharp 6px shakes.
    const cam = this.cameras.main;
    cam.shake(80, 0.006);
    this.time.delayedCall(110, () => cam.shake(80, 0.006));
    this.time.delayedCall(220, () => cam.shake(80, 0.006));

    // grab-able banknotes scatter.
    for (let i = 0; i < 7; i++) {
      const note = this.add.image(s.x, s.y - 10, TEX.note).setDepth(100001).setAngle(Phaser.Math.Between(0, 360));
      this.worldFx(note);
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
    this.worldFx(flash);
    this.tweens.add({ targets: flash, y: s.y - 96, alpha: 0, duration: 1900, onComplete: () => flash.destroy() });
    if (v.cashTag) v.cashTag.setVisible(false);
    if (v.dangerRing) v.dangerRing.setVisible(false);
    this.setStatus(`collector ambushed — $${ev.amount} gone to ${ev.attackerFaction}`);
  }

  /** Banked beat (RTS-15): coins arc to the HQ vault, a 90ms 1.04x camera punch, satchel deflates. */
  private flashDeposit(collectorId: string, banked: number): void {
    const v = this.units.find((u) => u.unit.id === collectorId);
    if (!v) return;
    if (banked > 0) this.signalBeat('banked'); // RTS-23 audio seam
    const s = unitScreenPos(v.unit);
    const hq = hqTileOf(this.layout, 'player');
    const vault = hq ? gridToScreen(hq.gx, hq.gy) : { x: s.x, y: s.y - 40 };

    // coins (greenbacks) arc from the collector to the vault.
    for (let i = 0; i < 6; i++) {
      const coin = this.add.image(s.x, s.y - 10, TEX.greenback).setDepth(100001).setTint(hexNum(SPEC.cashGreen));
      this.worldFx(coin);
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
    this.worldFx(flash);
    this.tweens.add({ targets: flash, y: vault.y - 70, alpha: 0, duration: 1600, onComplete: () => flash.destroy() });
    this.setStatus(`collector reached HQ — banked $${banked}`);
  }

  // ── selection & command ──────────────────────────────────────────────────────────────────

  private setupSelectionInput(): void {
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.pressX = p.x; this.pressY = p.y; });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.legend?.visible) { this.hideLegend(); return; }
      // A real drag panned the camera — not a click.
      if (Math.hypot(p.x - this.pressX, p.y - this.pressY) > CLICK_SLOP) return;
      // RTS-30a: a click on a CITY-roster row flies the camera to that district.
      const row = this.cityRowHits.find((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
      if (row) { this.flyToDistrict(row.districtId); return; }
      const shift = !!(p.event as MouseEvent | undefined)?.shiftKey;
      // An open menu consumes the next click: a row runs its action, anywhere else dismisses it.
      if (this.ctxMenu) {
        const hit = this.menuRowAt(p.x, p.y);
        this.closeBizMenu();
        if (hit) hit();
        return;
      }
      if (p.rightButtonReleased()) {
        // RTS-22/23: right-click a BUILDING (base tile OR its roof) → EXTORT/ATTACK menu; else MOVE.
        const bizId = this.businessAtScreen(p.worldX, p.worldY);
        if (bizId && this.selection.ids.length > 0) this.openBizMenu(bizId, p.x, p.y);
        else this.commandMove(p);
      } else {
        this.commandSelect(p, shift);
      }
    });
  }

  // ── RTS-22: right-click building context menu (EXTORT / ATTACK) ───────────────────────────────

  /** RTS-23: hit-test a business by SCREEN point, accounting for the iso building's HEIGHT — a
   * click on the visible roof (drawn above the tile) maps to the base tile, not the tile up-left of
   * it. Tries the exact base tile first, then any building whose drawn column contains the point. */
  private businessAtScreen(worldX: number, worldY: number): string | undefined {
    // RTS-28: hit-test the drawn building COLUMN first (the visible body, height-aware) so a click on
    // a tall building's body resolves to THAT building — not the tile one row up-left that
    // screenToTile would pick. Only fall back to the raw base tile when no body contains the point.
    const BUILD_H = 70; // covers the tallest drawn building (HQ ~66)
    let best: { id: string; y: number } | undefined;
    for (const b of allBusinesses(this.state)) {
      const t = businessTileOf(this.layout, b.id);
      if (!t) continue;
      const c = gridToScreen(t.gx, t.gy);
      if (worldX >= c.x - ISO_TILE_HALF_WIDTH * 0.7 && worldX <= c.x + ISO_TILE_HALF_WIDTH * 0.7 &&
          worldY <= c.y + ISO_TILE_HALF_HEIGHT && worldY >= c.y - BUILD_H) {
        if (!best || c.y > best.y) best = { id: b.id, y: c.y }; // frontmost (lowest on screen) wins
      }
    }
    if (best) return best.id;
    return businessAtTile(this.layout, screenToTile(worldX, worldY)) ?? undefined;
  }

  private closeBizMenu(): void { this.ctxMenu?.destroy(); this.ctxMenu = undefined; this.ctxRect = undefined; this.ctxRows = []; }

  /** The action for the menu row under screen (sx, sy), or null if the click missed the rows. */
  private menuRowAt(sx: number, sy: number): (() => void) | null {
    if (!this.ctxRect) return null;
    for (const r of this.ctxRows) if (sx >= this.ctxRect.x && sx <= this.ctxRect.x + this.ctxRect.w && sy >= r.y0 && sy <= r.y1) return r.act;
    return null;
  }

  /** Open the EXTORT / ATTACK menu for a business at screen (sx, sy). */
  private openBizMenu(businessId: string, sx: number, sy: number): void {
    this.closeBizMenu();
    const acts = businessActions(this.state, businessId, 'player');
    if (!acts) return;
    const b = inspectBusiness(this.state, businessId);
    const title = b ? `${b.name}` : 'business';
    const sub = acts.earner === 'player' ? 'yours' : acts.earner ? `${acts.earner}'s` : 'un-shaken';

    const rows: { label: string; color: string; enabled: boolean; hint: string; act: () => void }[] = [
      { label: 'EXTORT', color: acts.extort.ok ? SPEC.brass : NOIR_PALETTE.fog, enabled: acts.extort.ok, hint: acts.extort.reason, act: () => this.commandExtortBusiness(businessId) },
      { label: 'ATTACK', color: acts.attack.ok ? SPEC.danger : NOIR_PALETTE.fog, enabled: acts.attack.ok, hint: acts.attack.reason, act: () => this.commandAttackBusiness(businessId) },
    ];

    const W = 196, rowH = 28, headH = 30, H = headH + rows.length * rowH + 6;
    const x = Math.min(sx, this.scale.width - W - 6), y = Math.min(sy, this.scale.height - H - 6);
    const bg = this.add.rectangle(0, 0, W, H, PAL.ink, 0.97).setOrigin(0, 0).setStrokeStyle(2, PAL.brass, 0.9);
    const head = this.mkText(8, 6, `${title} · ${sub}`, { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(0, 0);
    const objs: Phaser.GameObjects.GameObject[] = [bg, head];
    this.ctxRows = [];
    rows.forEach((r, i) => {
      const ry = headH + i * rowH;
      const rowBg = this.add.rectangle(3, ry, W - 6, rowH - 2, PAL.charcoal, r.enabled ? 0.55 : 0.2).setOrigin(0, 0);
      const lbl = this.mkText(10, ry + 5, r.label, { fontFamily: NOIR_FONT, fontSize: '13px', color: r.color, fontStyle: 'bold' }).setOrigin(0, 0);
      const hint = this.mkText(W - 8, ry + 8, r.enabled ? '▸' : r.hint, { fontFamily: NOIR_FONT, fontSize: '10px', color: NOIR_PALETTE.fog }).setOrigin(1, 0);
      objs.push(rowBg, lbl, hint);
      if (r.enabled) this.ctxRows.push({ y0: y + ry, y1: y + ry + rowH - 2, act: r.act });
    });
    this.ctxRect = { x, y, w: W, h: H };
    this.ctxMenu = this.add.container(x, y, objs).setScrollFactor(0).setDepth(100200);
  }

  /** EXTORT a specific building: send a selected thug toward it and attempt the shakedown. */
  /** RTS-29 — extort = REPEATED VISITS. Send a thug to the front; he walks there (slow) and leans on
   * it (a visit), dropping its resistance a notch. Empty it → it converts to [$] + a collector spawns.
   * Cost = time + a thug occupied, NOT cash. Gated by the CONTROL cap (you can't take new turf at cap). */
  private commandExtortBusiness(businessId: string): void {
    const prog = extortProgress(this.state, businessId);
    if (!prog || !prog.extortable) { this.setStatus('that block already pays — pick an un-shaken [%] front'); return; }
    // RTS-30a: extortion is NO LONGER gated by a control budget — only by walking time + free muscle.
    const thug = this.idlePlayerThug();
    if (!thug) { this.setStatus('no free muscle — wait for a thug to finish, or recruit [6]'); return; }
    const tile = businessTileOf(this.layout, businessId);
    if (!tile) return;
    issueMove(thug, tile, this.navGrid);
    this.extortIntents.set(thug.id, businessId);
    this.focusBizId = businessId;
    this.setStatus(`muscle on the way to lean on ${inspectBusiness(this.state, businessId)?.name ?? 'the block'} — ${prog.remaining} visit${prog.remaining === 1 ? '' : 's'} to fold it`);
  }

  /** An idle player button-man (no path, not a collector, not already tasked) free to be sent on a
   * job. RTS-29.1: faction is resolved from the VIEW layer (sim muscle units carry no factionId/role —
   * that was the dead-dispatch blocker); the pure pickIdleMuscle helper makes the seam testable. */
  private idlePlayerThug(): MovableUnit | undefined {
    const candidates: MuscleCandidate[] = this.units.map((v) => ({
      id: v.unit.id,
      faction: v.faction,
      isCollector: v.unit.role === 'collector',
      idle: v.unit.path.length === 0,
    }));
    const pick = pickIdleMuscle(candidates, new Set(this.extortIntents.keys()));
    return pick ? this.state.units.find((u) => u.id === pick.id) : undefined;
  }

  /** RTS-29 — a thug that has arrived at its target front LEANS on it (records a visit); on conversion
   * the front becomes [$] and its fixed collector spawns (coin-stamp + Wire slip). Event-driven. */
  private processExtortArrivals(): void {
    if (this.extortIntents.size === 0) return;
    for (const [unitId, bizId] of [...this.extortIntents]) {
      const u = this.state.units.find((x) => x.id === unitId);
      const tile = businessTileOf(this.layout, bizId);
      if (!u || !tile) { this.extortIntents.delete(unitId); continue; }
      if (u.path.length > 0) continue; // still walking
      const ut = unitTile(u);
      if (Math.abs(ut.gx - tile.gx) > 1 || Math.abs(ut.gy - tile.gy) > 1) { this.extortIntents.delete(unitId); continue; }
      this.extortIntents.delete(unitId);
      const res = recordExtortVisit(this.state, 'player', bizId);
      this.state = harvestIncidents(this.state);
      const c = gridToScreen(tile.gx, tile.gy);
      if (res.converted) {
        this.seedBackPay(bizId); this.leanBeat(c.x, c.y); this.signalBeat('extort');
        const setup = ensureBusinessCollector(this.state, this.layout, 'player', bizId, this.navGrid);
        if (setup) this.attachView(setup.unit, 'player');
        this.setStatus(`${inspectBusiness(this.state, bizId)?.name ?? 'the block'} folded — it pays protection now (a collector is on the way)`);
      } else if (res.ok) {
        this.floatText(c.x, c.y - 30, `LEANED ON — ${res.remaining} more`, SPEC.brass);
        this.setStatus(`leaned on the block — ${res.remaining} more visit${res.remaining === 1 ? '' : 's'} to fold it`);
      }
    }
  }

  /** RTS-29 — make sure every business the player EARNS from has its one fixed collector (the
   * sea-of-collectors). Called on settlement + after a conversion; ensureBusinessCollector no-ops a
   * business that already has its collector, so this never stacks. */
  private syncBusinessCollectors(): void {
    for (const b of allBusinesses(this.state)) {
      if (businessEarner(b) !== 'player') continue;
      const setup = ensureBusinessCollector(this.state, this.layout, 'player', b.id, this.navGrid);
      if (setup) this.attachView(setup.unit, 'player');
    }
  }

  /** ATTACK a specific building: temporarily shut it down (interdict a rival's racket). */
  private commandAttackBusiness(businessId: string): void {
    const res = resolveAttack(this.state, businessId, 'player');
    this.state = harvestIncidents(this.state);
    if (!res.ok) { this.setStatus(`can't attack: ${res.reason}`); return; }
    const tile = businessTileOf(this.layout, businessId);
    if (tile) { this.sendSelectedTo(tile); const c = gridToScreen(tile.gx, tile.gy); this.floatText(c.x, c.y - 30, `SHUT DOWN ${res.weeks}wk`, SPEC.danger); }
    this.signalBeat('attack');
    const insp = inspectBusiness(this.state, businessId);
    this.setStatus(`${insp?.name ?? 'business'} shut down for ${res.weeks} weeks — it stops producing`);
  }

  /** Walk the selected thugs to a tile (flavour for extort/attack; also a plain order). */
  private sendSelectedTo(tile: { gx: number; gy: number }): void {
    if (this.selection.ids.length === 0) return;
    resolveMoveCommand(this.units.map((v) => v.unit), this.selection.ids, tile, this.navGrid);
  }

  /** [T] — set up (or refresh) the automated collection route over your protected businesses. */
  private commandSelect(p: Phaser.Input.Pointer, shift: boolean): void {
    const point = screenToGrid(p.worldX, p.worldY);
    const hit = pickUnit(this.units.map((v) => v.unit), point);
    if (hit) {
      this.focusBizId = undefined;
      this.selection = shift ? toggleSelection(this.selection, hit.id) : selectOnly(hit.id);
      this.setStatus();
      return;
    }
    // RTS-28: no unit under the cursor → try a BUILDING (height-aware hit-test). A click selects the
    // building under the cursor (its card sticks in the context panel; [E]/[U] target it).
    const bizId = this.businessAtScreen(p.worldX, p.worldY);
    if (bizId) {
      this.focusBizId = bizId;
      if (!shift) this.selection = clearSelection();
      const insp = inspectBusiness(this.state, bizId);
      this.setStatus(insp ? `selected ${insp.name} — right-click → EXTORT/ATTACK · [U] upgrade` : undefined);
      return;
    }
    this.focusBizId = undefined;
    if (!shift) this.selection = clearSelection();
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
    this.worldFx(mark);
    this.tweens.add({ targets: mark, scale: ok ? 0.4 : 1, alpha: 0, duration: 650, onComplete: () => mark.destroy() });
  }

  // ── guided onboarding actions (RTS-11) ───────────────────────────────────────────────────

  /** [E] — RTS-29: send muscle to lean on the selected [%] front (or the onboarding target). Extort is
   * now REPEATED VISITS — a thug walks there and leans; repeat to fold it into a [$] earner. */
  private commandExtort(): void {
    // prefer the front the player has clicked/focused; else the onboarding suggestion.
    let bizId = this.focusBizId && extortProgress(this.state, this.focusBizId)?.extortable ? this.focusBizId : undefined;
    if (!bizId) {
      const obj = firstObjective(this.state);
      if (obj.step === 'extort' && obj.targetBusinessId && extortProgress(this.state, obj.targetBusinessId)?.extortable) bizId = obj.targetBusinessId;
    }
    if (!bizId) { this.setStatus('click an un-shaken [%] front, then [E] to send muscle'); return; }
    this.commandExtortBusiness(bizId);
  }

  /** The Lean (RTS-15): a brick-dust shudder, a thumping "NOW PAYING" stamp, and a coin burst. */
  private leanBeat(x: number, y: number): void {
    // brick-dust puffs (fog motes drifting up and fading).
    for (let i = 0; i < 8; i++) {
      const dust = this.add.circle(x + Phaser.Math.Between(-22, 22), y + Phaser.Math.Between(-6, 10), Phaser.Math.Between(1, 3), PAL.fog, 0.6).setDepth(100001);
      this.worldFx(dust);
      this.tweens.add({ targets: dust, y: dust.y - Phaser.Math.Between(14, 30), alpha: 0, duration: 700 + i * 30, onComplete: () => dust.destroy() });
    }
    // coin burst (brass = money state).
    for (let i = 0; i < 6; i++) {
      const coin = this.add.image(x, y - 8, TEX.coin).setDepth(100001).setScale(0.6);
      this.worldFx(coin);
      this.tweens.add({ targets: coin, x: x + Phaser.Math.Between(-30, 30), y: y - Phaser.Math.Between(18, 40), alpha: 0, angle: Phaser.Math.Between(-180, 180), duration: 700, ease: 'Cubic.Out', onComplete: () => coin.destroy() });
    }
    // "NOW PAYING" stamp — thumps on big then settles.
    const stamp = this.mkText(x, y - 34, 'NOW PAYING', { fontFamily: NOIR_FONT, fontSize: '17px', color: SPEC.brass, fontStyle: 'bold' }).setOrigin(0.5, 1).setDepth(100002).setScale(2.2).setAlpha(0);
    this.worldFx(stamp);
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
          this.audio?.confirm(); // RTS-27 crew-order confirm on dispatch
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
    this.audio?.confirm(); this.fireTipOnce('launder'); // RTS-27 crew confirm + the consigliere's money tip
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
    if (paid) { this.audio?.grease(ch); this.audio?.confirm(); this.fireTipOnce('grease'); } // RTS-27 distinct cue per channel
    this.setStatus(paid ? `greased ${bribeChannelLabel(ch)} → $${this.state.player.bribes[ch]}/wk` : `can't afford to grease ${bribeChannelLabel(ch)}`);
  }

  /** RTS-27 — fire a consigliere VO tip the FIRST time its onboarding trigger occurs (don't spam). */
  private fireTipOnce(which: 'extort' | 'grease' | 'launder' | 'war'): void {
    if (this.tipsFired.has(which)) return;
    this.tipsFired.add(which);
    this.audio?.tip(which);
  }

  // ── the build verbs (RTS-20) — how the player leaves ESTABLISH ───────────────────────────────

  /** [5] EXPAND control in your home corner (toward HOLDING it → unlocks RAID), else your stronghold. */
  private commandExpand(): void {
    const targetId = expandTargetDistrictId(this.state);
    if (!targetId) { this.setStatus('nowhere to expand — get a foothold first'); return; }
    // RTS-30a: no control-budget gate on expansion — pacing comes from space + slow movement.
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

  // ── RTS-24 vice upgrades + THE MARKET ────────────────────────────────────────────────────

  /** [U] climb the next vice rung on the racket shown in the context card (the hovered op). */
  private commandViceUpgrade(): void {
    const id = this.ctxBizId;
    if (!id) { this.setStatus('hover one of YOUR rackets, then [U] to upgrade it'); return; }
    const ladder = viceLadder(this.state, id);
    if (!ladder || !ladder.next) { this.setStatus(ladder && ladder.branch ? 'this racket is maxed out' : 'that storefront has no vice branch'); return; }
    const res = applyViceUpgrade(this.state, id);
    this.state = harvestIncidents(this.state);
    if (res.ok) {
      const b = allBusinesses(this.state).find((x) => x.id === id);
      const t = b ? businessTileOf(this.layout, id) : undefined;
      if (t) { const c = gridToScreen(t.gx, t.gy); this.floatText(c.x, c.y - 30, `${ladder.label} ▲`, NOIR_PALETTE.brass); }
      this.morphBuildingIfUpgraded(id); // RTS-26: speakeasy → casino silhouette on the upgrade
      this.setStatus(`upgraded → ${ladder.next.name} (+$${ladder.next.incomeBump}/wk)`);
    } else {
      this.setStatus(`UPGRADE — ${res.reason}`);
    }
  }

  /** RTS-26 — redraw a racket's building as a CASINO once its vice rung crosses the morph threshold.
   * Event-driven: it destroys the old cached Graphics and bakes the new silhouette ONCE, then leaves
   * it static (no per-frame redraw). A no-op if the style is already current. */
  private morphBuildingIfUpgraded(bizId: string): void {
    const rec = this.bizBuildings.get(bizId);
    const biz = allBusinesses(this.state).find((x) => x.id === bizId);
    if (!rec || !biz) return;
    const upgraded = (biz.viceRung ?? 0) >= 2 && (biz.kind === 'speakeasy' || biz.kind === 'numbers');
    const wantKey = upgraded ? 'casino' : rec.styleKey;
    if (wantKey === rec.styleKey && wantKey !== 'casino') return;
    if (rec.styleKey === 'casino') return; // already morphed
    if (!upgraded) return;
    rec.gfx.destroy();
    const c = gridToScreen(rec.gx, rec.gy);
    const roof = drawIsoBuilding(this, c.x, c.y, BUILDING_STYLES.casino, rec.depth, { lit: !rec.shut });
    this.worldFx(roof.gfx);
    this.bizBuildings.set(bizId, { ...rec, gfx: roof.gfx, styleKey: 'casino' });
    // lift the coin/glow markers to the taller roof
    const m = this.bizMarkers.get(bizId);
    if (m) { m.roofY = roof.roofY; m.coin.setY(roof.roofY - 6); if (m.glow) m.glow.setY(roof.roofY - 6); }
    // RTS-26 "racket transformed" beat (§2.5): a one-shot scale-pop on the new casino Graphics
    // (a TRANSFORM tween — the art was baked once, not redrawn per frame) + a brass OPEN wax-stamp.
    roof.gfx.setScale(1, 0.82); roof.gfx.setData('baseY', c.y);
    this.tweens.add({ targets: roof.gfx, scaleY: 1, duration: 600, ease: 'Back.Out' });
    const stamp = this.mkText(c.x, roof.roofY + 10, 'OPEN', { fontFamily: NOIR_DISPLAY, fontSize: '18px', color: NOIR_PALETTE.brass, fontStyle: 'bold' })
      .setOrigin(0.5).setDepth(rec.depth + 40).setScale(2.4).setAlpha(0);
    this.worldFx(stamp);
    this.tweens.add({ targets: stamp, scale: 1, alpha: 1, duration: 300, ease: 'Back.Out',
      onComplete: () => this.tweens.add({ targets: stamp, alpha: 0, delay: 700, duration: 400, onComplete: () => stamp.destroy() }) });
    this.cameras.main.flash(180, 184, 134, 43, false); // a brass flash beat (event, ≤1.1s)
  }

  /** [M] open/close THE MARKET right-dock tab. */
  private toggleMarket(): void {
    if (!this.marketEnabled) { this.setStatus('the Market is turned off (?market=on to enable)'); return; }
    this.marketOpen = !this.marketOpen;
    this.marketTitle?.setVisible(this.marketOpen);
    this.marketBody?.setVisible(this.marketOpen);
    // RTS-28: the Market REPLACES the right dock — hide The Wire + The City + Actions while it's open
    // so nothing overlaps; the per-frame refreshers also respect marketOpen and restore on close.
    const dockVisible = !this.marketOpen;
    this.feedTitle?.setVisible(dockVisible && this.feedVisible);
    for (const l of this.feedLines) l.setVisible(dockVisible && this.feedVisible);
    this.strategyTitle?.setVisible(dockVisible);
    this.strategyPanel?.setVisible(dockVisible);
    this.actionTitle?.setVisible(dockVisible);
    this.actionBody?.setVisible(dockVisible);
    if (this.marketOpen) this.setStatus('THE MARKET — [N] pick a good · [Y] buy · [J] sell · [M] close');
  }

  /** [Y]/[J] buy or sell the selected good (only while the market tab is open). */
  private commandTrade(side: TradeSide): void {
    if (!this.marketOpen) return;
    const rows = marketRows(this.state);
    const row = rows[this.marketSel];
    if (!row) return;
    const res = side === 'buy' ? buyGood(this.state, row.id, this.marketQty) : sellGood(this.state, row.id, this.marketQty);
    this.state = harvestIncidents(this.state);
    if (res.ok) this.setStatus(`${side === 'buy' ? 'BOUGHT' : 'SOLD'} ${this.marketQty} ${row.name} for $${res.total}`);
    else this.setStatus(`${side.toUpperCase()} ${row.name} — ${res.reason}`);
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
    this.audio?.combat('raid'); this.audio?.confirm(); // RTS-27 tommy-gun + crew confirm
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
    this.audio?.combat('sabotage'); this.audio?.confirm();
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
    this.audio?.combat('assassinate'); this.audio?.confirm(); // RTS-27 single pistol report
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
    this.audio?.combat('lockout'); this.audio?.confirm(); // RTS-27 the Bureau's siren
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
    // RTS-27: the win/lose STING + a VO one-liner, and switch the music bed (theme swell / defeat).
    this.audio?.play(won ? 'sting_win' : 'sting_lose');
    this.audio?.vo([won ? 'vo_win' : 'vo_lose']);
    this.audio?.setPhase(won ? 'TITLE' : 'GAMEOVER');
    const w = this.scale.width, h = this.scale.height;
    this.add.rectangle(0, 0, 6000, 4000, PAL.soot, 0.82).setOrigin(0, 0).setScrollFactor(0).setDepth(200000);
    const last = [...this.state.log].reverse().find((e) => e.kind === 'game-over');
    // RTS-24: a per-WIN-PATH headline variant — the screen names HOW you won (force / clean / ballot).
    const kind = (last?.data as { kind?: string } | undefined)?.kind;
    const headline = !won ? 'THE CITY TOOK YOU'
      : kind === 'win-go-straight' ? 'YOU WENT STRAIGHT'
      : kind === 'win-mayor' ? 'MR. MAYOR'
      : kind === 'win-dominance' ? 'THE CITY IS YOURS'
      : 'YOU TOOK THE CITY';
    this.mkText(w / 2, h / 2 - 30, headline, {
      fontFamily: NOIR_FONT, fontSize: '34px', color: won ? SPEC.brass : SPEC.danger, fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200001);
    this.mkText(w / 2, h / 2 + 16, last?.message ?? '', { fontFamily: NOIR_FONT, fontSize: '15px', color: NOIR_PALETTE.bone }).setOrigin(0.5).setScrollFactor(0).setDepth(200001);
  }

  /** Give a freshly-shaken front a little back-pay so the collect step is immediately playable. */
  private seedBackPay(businessId: string): void {
    for (const d of this.state.districts) {
      const b = d.businesses.find((x) => x.id === businessId);
      if (b) { b.uncollected = (b.uncollected ?? 0) + 320; return; }
    }
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.mkText(x, y, text, { fontFamily: NOIR_FONT, fontSize: '15px', color, fontStyle: 'bold' }).setOrigin(0.5, 1).setDepth(100002);
    this.worldFx(t); // a world-space beat — keep it off the fixed UI camera
    this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 1500, onComplete: () => t.destroy() });
  }

  // ── hover tooltip ────────────────────────────────────────────────────────────────────────

  private setupHoverTooltip(): void {
    this.tooltipBg = this.add.graphics().setScrollFactor(0).setDepth(100050).setVisible(false);
    this.tooltipText = this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, lineSpacing: 2 }).setScrollFactor(0).setDepth(100051).setVisible(false);

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) { this.hideTooltip(); return; }
      this.updateTooltip(p);
    });
  }

  /** RTS-23: the plain-English explanation for a HUD region under the cursor (the anti-Gangsters
   * fix — every number is inspectable). */
  private hudRegionExplain(sx: number, sy: number): string | null {
    for (const r of this.hudRegions) if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return r.explain;
    return null;
  }

  private updateTooltip(p: Phaser.Input.Pointer): void {
    // HUD numbers explain themselves first (screen-space regions), then world hover.
    const text = this.hudRegionExplain(p.x, p.y) ?? this.hoverText(p);
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
    const bizId = this.businessAtScreen(p.worldX, p.worldY);
    if (bizId) {
      const b = inspectBusiness(this.state, bizId);
      if (b) {
        const found = this.state.districts.flatMap((d) => d.businesses).find((x) => x.id === bizId);
        const shut = found ? isShutDown(found) : false;
        const acts = businessActions(this.state, bizId, 'player');
        const aff = acts ? [acts.extort.ok ? 'EXTORT' : '', acts.attack.ok ? 'ATTACK' : ''].filter(Boolean).join(' · ') : '';
        return [
          `${b.name} (${b.kind})`,
          shut ? 'SHUT DOWN — not producing' : b.payingProtection ? 'PAYING PROTECTION — yours' : b.earnerName ? `pays ${b.earnerName}` : 'not yet shaken down',
          `income $${b.income}/wk · uncollected $${b.uncollected}`,
          aff ? `right-click → ${aff}` : `${b.districtName}`,
        ].join('\n');
      }
    }
    // RTS-30a: map the hovered tile to its district via the world partition.
    const did = this.world.districtOfTile[Math.round(tile.gy) * this.world.size + Math.round(tile.gx)];
    const d = did ? inspectDistrict(this.state, did) : undefined;
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

  /** [Z] RTS-23/30a — one press to FRAME THE WHOLE CITY (the big sparse map) + centre it. */
  private frameCity(): void {
    const cam = this.cameras.main;
    const S = this.world.size;
    const corners = [gridToScreen(0, 0), gridToScreen(S - 1, 0), gridToScreen(0, S - 1), gridToScreen(S - 1, S - 1)];
    const minX = Math.min(...corners.map((c) => c.x)) - ISO_TILE_HALF_WIDTH;
    const maxX = Math.max(...corners.map((c) => c.x)) + ISO_TILE_HALF_WIDTH;
    const minY = Math.min(...corners.map((c) => c.y)) - ISO_TILE_HEIGHT;
    const maxY = Math.max(...corners.map((c) => c.y)) + ISO_TILE_HEIGHT;
    const z = Phaser.Math.Clamp(Math.min(this.scale.width / (maxX - minX), this.scale.height / (maxY - minY)) * 0.9, MIN_ZOOM, MAX_ZOOM);
    this.zoomAnchor = undefined;
    this.targetZoom = z;
    cam.setZoom(z);
    cam.centerOn((minX + maxX) / 2, (minY + maxY) / 2);
    this.setStatus('framed the whole city — [F] follow a thug · wheel to zoom');
  }

  /** Smoothly recentre the camera on the first selected unit (RTS-22 follow). */
  private centerOnSelection(): void {
    const id = this.selection.ids[0];
    const v = id ? this.units.find((u) => u.unit.id === id) : undefined;
    if (!v) { this.setStatus('select a thug first, then [F] to centre on it'); return; }
    const s = unitScreenPos(v.unit);
    this.cameras.main.pan(s.x, s.y, 280, 'Sine.easeInOut');
  }

  /** RTS-30a — clamp the world camera to the iso bounds of the whole map (no black void on pan). */
  private setWorldCameraBounds(): void {
    const s = this.world.size;
    const cs = [gridToScreen(0, 0), gridToScreen(s - 1, 0), gridToScreen(0, s - 1), gridToScreen(s - 1, s - 1)];
    const minX = Math.min(...cs.map((c) => c.x)) - ISO_TILE_HALF_WIDTH * 2;
    const maxX = Math.max(...cs.map((c) => c.x)) + ISO_TILE_HALF_WIDTH * 2;
    const minY = Math.min(...cs.map((c) => c.y)) - ISO_TILE_HEIGHT * 2;
    const maxY = Math.max(...cs.map((c) => c.y)) + ISO_TILE_HEIGHT * 2;
    this.cameras.main.setBounds(minX, minY, maxX - minX, maxY - minY);
  }

  /** RTS-30a — the CRITICAL world/HUD split: a second FIXED ui camera renders the HUD at 1:1 and is
   * never transformed by zoom/pan, so the instrument panel never drifts. The world (default scroll
   * factor) renders on the main camera (zoom/pan); the HUD (scrollFactor 0) renders on the ui camera.
   * Partitioned by the scene's long-standing convention (HUD = scrollFactor 0). */
  private setupUiCamera(): void {
    const main = this.cameras.main;
    const ui = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    ui.setName('ui');
    this.uiCam = ui;
    const hud: Phaser.GameObjects.GameObject[] = [];
    const world: Phaser.GameObjects.GameObject[] = [];
    for (const obj of this.children.list) {
      const sf = (obj as unknown as { scrollFactorX?: number }).scrollFactorX;
      (sf === 0 ? hud : world).push(obj);
    }
    main.ignore(hud); // the HUD never zooms/pans with the world
    ui.ignore(world); // the world never renders on the fixed panel
    this.scale.on('resize', () => ui.setSize(this.scale.width, this.scale.height));
  }

  /** RTS-30a — snap to the next/prev of the 3 zoom stops (CLOSE/MID/FAR), anchored to the cursor. */
  private cycleZoom(dir: 1 | -1): void {
    const cur = this.targetZoom;
    let i = 0; let best = Infinity;
    ZOOM_STOPS.forEach((z, k) => { const d = Math.abs(z - cur); if (d < best) { best = d; i = k; } });
    const next = ZOOM_STOPS[Phaser.Math.Clamp(i - dir, 0, ZOOM_STOPS.length - 1)]; // dir +1 = closer
    this.targetZoom = next;
    const p = this.input.activePointer;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    this.zoomAnchor = { sx: p.x, sy: p.y, wx: wp.x, wy: wp.y };
  }

  /** RTS-30a — fly the camera to a district (clicked in the roster) at FAR zoom. RTS-30a.1: when the
   * target is unscouted (still under fog), show a cue so it isn't a black dead-end. */
  private flyToDistrict(districtId: string): void {
    const d = this.world.districts.find((x) => x.id === districtId);
    if (!d) return;
    const c = gridToScreen(d.centroid.gx, d.centroid.gy);
    this.targetZoom = ZOOM_STOPS[2];
    this.cameras.main.pan(c.x, c.y, 420, 'Sine.easeInOut');
    const scouted = this.debugRevealAll || isRevealed(this.fog, d.plaza.gx, d.plaza.gy) || isRevealed(this.fog, d.centroid.gx, d.centroid.gy);
    this.showScoutCue(d, scouted);
    this.setStatus(scouted ? `flying to ${d.name}` : `flying to ${d.name} — not yet scouted`);
  }

  /** RTS-30a.1 — the fly-to cue: a faint WORLD outline of the district drawn through the fog (so the
   * target isn't just black) + a FIXED, always-readable HUD cartouche naming it (the world nameplate
   * is an illegible speck at FAR zoom, and is zoom-gated off below 0.5×). Both fade out. Purely
   * visual — no sim/fog change; the district stays unscouted until a unit actually walks there. */
  private showScoutCue(d: WorldDistrict, scouted: boolean): void {
    this.scoutCue?.card.destroy();
    this.scoutCue?.outline.destroy();
    // (A) faint district-region outline (iso diamond of its bounds), above the fog soot.
    const outline = this.add.graphics().setDepth(60);
    const corners = [
      gridToScreen(d.minX, d.minY), gridToScreen(d.maxX + 1, d.minY),
      gridToScreen(d.maxX + 1, d.maxY + 1), gridToScreen(d.minX, d.maxY + 1),
    ];
    outline.lineStyle(2, hexNum(SPEC.brass), scouted ? 0.5 : 0.34);
    outline.beginPath();
    outline.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) outline.lineTo(corners[i].x, corners[i].y);
    outline.closePath();
    outline.strokePath();
    this.worldFx(outline);
    this.tweens.add({ targets: outline, alpha: 0, delay: 1700, duration: 1200, onComplete: () => outline.destroy() });
    // (B) fixed HUD cartouche — reads WHICH district + the scouting state, at any zoom.
    const txt = scouted ? `▣ ${d.name.toUpperCase()}` : `▣ ${d.name.toUpperCase()}\n— not yet scouted —`;
    const card = this.mkText(this.scale.width / 2, 122, txt, {
      fontFamily: NOIR_DISPLAY, fontSize: '16px', color: scouted ? NOIR_PALETTE.brass : NOIR_PALETTE.bone,
      fontStyle: 'bold', align: 'center', backgroundColor: '#14110fdd', padding: { x: 12, y: 6 },
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(100050);
    this.hudFx(card);
    this.tweens.add({ targets: card, alpha: 0, delay: 1900, duration: 900, onComplete: () => card.destroy() });
    this.scoutCue = { card, outline };
  }

  private setupCameraControls(): void {
    const cam = this.cameras.main;
    this.cursors = this.input.keyboard?.createCursorKeys();
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.wasd = this.input.keyboard?.addKeys({ up: K.W, down: K.S, left: K.A, right: K.D }) as typeof this.wasd;
    // Left-drag pans (a real drag, past CLICK_SLOP); a click selects/acts (handled in pointerup).
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown && Math.hypot(p.x - this.pressX, p.y - this.pressY) > CLICK_SLOP) {
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom; cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      }
    });
    // RTS-23: wheel zooms TO THE CURSOR — capture the world point under the cursor so the eased
    // zoom keeps it pinned (no more shoving the city into the left third).
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const factor = dy > 0 ? 1 - ZOOM_STEP : 1 + ZOOM_STEP;
      const next = Phaser.Math.Clamp(this.targetZoom * factor, MIN_ZOOM, MAX_ZOOM);
      if (next === this.targetZoom) return;
      this.targetZoom = next;
      const wp = cam.getWorldPoint(p.x, p.y);
      this.zoomAnchor = { sx: p.x, sy: p.y, wx: wp.x, wy: wp.y };
    });
    this.input.keyboard?.on('keydown-F', () => this.centerOnSelection());
    this.input.keyboard?.on('keydown-Z', () => this.frameCity());
    // RTS-30a: snap through the 3 zoom stops with the +/- keys (and the on-screen buttons).
    this.input.keyboard?.on('keydown-PLUS', () => this.cycleZoom(1));
    this.input.keyboard?.on('keydown-EQUALS', () => this.cycleZoom(1));
    this.input.keyboard?.on('keydown-MINUS', () => this.cycleZoom(-1));
    // RTS-29: collectors are AUTOMATIC now (one per extorted front) — no player routing. [T] just informs.
    this.input.keyboard?.on('keydown-T', () => this.setStatus('collectors are automatic — one spawns per front you extort ([E]); no routing needed'));
    this.input.keyboard?.on('keydown-E', () => this.commandExtort());
    this.input.keyboard?.on('keydown-C', () => this.commandCollect());
    this.input.keyboard?.on('keydown-R', () => this.commandReinvest());
    this.input.keyboard?.on('keydown-G', () => this.commandGrease());
    this.input.keyboard?.on('keydown-L', () => this.toggleFeed());
    this.input.keyboard?.on('keydown-K', () => this.toggleCrew());
    this.input.keyboard?.on('keydown-H', () => this.toggleLegend());
    this.input.keyboard?.on('keydown-B', () => this.scene.start('BootScene'));
    // RTS-17 — the offensive. RTS-27: when the audio panel is open, 1–5 adjust the volume buses
    // instead of firing offense/build verbs (so the settings surface is keyboard-drivable).
    this.input.keyboard?.on('keydown-ONE', () => this.audioPanelOpen ? this.cycleAudioBus(0) : this.commandRaid());
    this.input.keyboard?.on('keydown-TWO', () => this.audioPanelOpen ? this.cycleAudioBus(1) : this.commandSabotage());
    this.input.keyboard?.on('keydown-THREE', () => this.audioPanelOpen ? this.cycleAudioBus(2) : this.commandAssassinate());
    this.input.keyboard?.on('keydown-FOUR', () => this.audioPanelOpen ? this.cycleAudioBus(3) : this.commandLockout());
    // RTS-20 — the build verbs (leave ESTABLISH).
    this.input.keyboard?.on('keydown-FIVE', () => this.audioPanelOpen ? this.cycleAudioBus(4) : this.commandExpand());
    this.input.keyboard?.on('keydown-SIX', () => this.commandRecruit());
    // RTS-27 — audio settings surface: [O] options panel, [0] master mute.
    this.input.keyboard?.on('keydown-O', () => this.toggleAudioPanel());
    this.input.keyboard?.on('keydown-ZERO', () => { this.audio?.toggleMute(); this.refreshAudioPanel(); });
    // RTS-28 — pacing: [Space] cycle fast-forward, [>] (period) skip to the next week.
    this.input.keyboard?.on('keydown-SPACE', () => this.cycleFastForward());
    this.input.keyboard?.on('keydown-PERIOD', () => this.skipWeek());
    // RTS-24 — vice upgrade ([U] on the hovered racket) + THE MARKET ([M] toggle, [N] next good,
    // [Y] buy, [J] sell — buy/sell act only while the market tab is open).
    this.input.keyboard?.on('keydown-U', () => this.commandViceUpgrade());
    this.input.keyboard?.on('keydown-M', () => this.toggleMarket());
    this.input.keyboard?.on('keydown-N', () => { if (this.marketOpen) this.marketSel = (this.marketSel + 1) % 4; });
    this.input.keyboard?.on('keydown-Y', () => this.commandTrade('buy'));
    this.input.keyboard?.on('keydown-J', () => this.commandTrade('sell'));
    // RTS-25 — perf overlay: live FPS · frame ms · text rasterisations/sec (the cost this pass cut).
    this.input.keyboard?.on('keydown-P', () => { this.perfVisible = !this.perfVisible; this.perfText?.setVisible(this.perfVisible); });
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.updateUnits(dt);
    this.revealFog(); // RTS-29: peel back the fog around the HQ + moving units
    this.drawGround(); // RTS-30a: culled ground/streets/parks/fog/washes for the visible tiles only
    this.updateDressingVisibility(); // RTS-30b-ground: fog-reveal + FAR-LOD bulk-hide of static props
    this.refreshHud();
    this.refreshObjective();
    this.refreshFeed();
    this.refreshCrew();
    this.refreshStrategy();
    this.refreshNight();
    this.refreshFastForward();
    this.samplePerf(delta);

    const cam = this.cameras.main;
    // RTS-22/23: ease the zoom toward its target, keeping the cursor's world point pinned.
    if (Math.abs(cam.zoom - this.targetZoom) > 0.001) {
      cam.setZoom(Phaser.Math.Linear(cam.zoom, this.targetZoom, 0.22));
      const a = this.zoomAnchor;
      if (a) {
        const now = cam.getWorldPoint(a.sx, a.sy);
        cam.scrollX += a.wx - now.x;
        cam.scrollY += a.wy - now.y;
      }
    } else {
      this.zoomAnchor = undefined;
    }
    // WASD + arrow-key panning (resolution- and zoom-independent).
    const step = (PAN_SPEED * delta) / 1000 / cam.zoom;
    const k = this.cursors, w = this.wasd;
    const left = !!k?.left.isDown || !!w?.left.isDown;
    const right = !!k?.right.isDown || !!w?.right.isDown;
    const up = !!k?.up.isDown || !!w?.up.isDown;
    const down = !!k?.down.isDown || !!w?.down.isDown;
    if (left) cam.scrollX -= step;
    if (right) cam.scrollX += step;
    if (up) cam.scrollY -= step;
    if (down) cam.scrollY += step;
  }

  // ── HUD ──────────────────────────────────────────────────────────────────────────────────

  /** RTS-23 — an art-deco brass frame on the HUD graphics layer: dark fill, brass border, corner
   * ticks. The shared look for every panel. */
  private decoFrame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, accent: number = PAL.brass, alpha = 0.84): void {
    g.fillStyle(PAL.ink, alpha).fillRect(x, y, w, h);
    g.lineStyle(1.5, accent, 0.85).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    const t = 9;
    g.lineStyle(2, accent, 0.9);
    const cs: [number, number, number, number][] = [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]];
    for (const [cx, cy, dx, dy] of cs) { g.beginPath(); g.moveTo(cx, cy + dy * t); g.lineTo(cx, cy); g.lineTo(cx + dx * t, cy); g.strokePath(); }
  }

  private drawHud(): void {
    this.hudGfx = this.add.graphics().setScrollFactor(0).setDepth(99990);

    // TOP BAR — labeled stat cells (CLEAN / DIRTY / NET / HEAT METER / CREW / WEEK) + a PHASE chip.
    const cellDefs = [
      { key: 'clean', label: 'CLEAN $' }, { key: 'dirty', label: 'DIRTY $' }, { key: 'net', label: 'NET /wk' },
      { key: 'heat', label: 'HEAT vs FED LADDER' }, { key: 'crew', label: 'CREW' }, { key: 'week', label: 'WEEK' },
    ];
    for (const cd of cellDefs) {
      // RTS-25: labels ≥13px; the empire-at-a-glance TOTALS jump to 24px in the condensed display
      // face (was a thin 17px mono — the #1 "hard to read" offender).
      const label = this.mkText(0, 0, cd.label, { fontFamily: NOIR_DISPLAY, fontSize: '13px', color: NOIR_PALETTE.fog }).setScrollFactor(0).setDepth(100000);
      const value = this.mkText(0, 0, '', { fontFamily: NOIR_DISPLAY, fontSize: '24px', color: NOIR_PALETTE.bone, fontStyle: 'bold' }).setScrollFactor(0).setDepth(100000);
      this.topCells.push({ label, value, x: 0, w: 0, key: cd.key });
    }
    this.heatCaption = this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '11px', color: NOIR_PALETTE.fog }).setScrollFactor(0).setDepth(100000);
    this.phaseChip = this.mkText(0, 0, '', { fontFamily: NOIR_DISPLAY, fontSize: '15px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(100001);

    // FOUR CHANNELS — labeled dials (level + what it buys + bump cost). [G] cycles a bump.
    this.channelTitle = this.mkText(0, 0, 'THE FOUR CHANNELS  [G] grease', { fontFamily: NOIR_DISPLAY, fontSize: '15px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setScrollFactor(0).setDepth(100000);
    for (let i = 0; i < 4; i++) this.channelRows.push(this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, lineSpacing: 2 }).setScrollFactor(0).setDepth(100000));

    // ROUTE pill — prominent collection-route status (stops · banking $X · rob-risk).
    this.routePill = this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setScrollFactor(0).setDepth(100001);

    // RTS-29 — the CONTROL readout (the freed Market dock tab): a brass-bezel meter under the route
    // pill. "CONTROL ███░░ 7/10", named + capped, with a plain-English tooltip.
    this.controlTitle = this.mkText(0, 0, "THE CITY — WHAT'S YOURS", { fontFamily: NOIR_DISPLAY, fontSize: '14px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setScrollFactor(0).setDepth(100001);
    this.controlBody = this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, lineSpacing: 3 }).setScrollFactor(0).setDepth(100001);

    // CONTEXT card — the selected thug's card + its valid verbs.
    this.ctxCardTitle = this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setScrollFactor(0).setDepth(100001);
    this.ctxCardBody = this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, lineSpacing: 3 }).setScrollFactor(0).setDepth(100001);

    this.statusText = this.mkText(12, 0, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.fog }).setScrollFactor(0).setDepth(100000);
    this.warningBanner = this.mkText(12, 0, '', { fontFamily: NOIR_FONT, fontSize: '15px', color: NOIR_PALETTE.blood, fontStyle: 'bold' }).setScrollFactor(0).setDepth(100000).setVisible(false);

    this.feedTitle = this.mkText(0, 12, 'THE WIRE  [L]', { fontFamily: NOIR_DISPLAY, fontSize: '15px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setScrollFactor(0).setDepth(100000).setOrigin(1, 0);
    for (let i = 0; i < 9; i++) {
      this.feedLines.push(this.mkText(0, 32 + i * 16, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.fog }).setScrollFactor(0).setDepth(100000).setOrigin(1, 0));
    }
    this.nightVeil = this.add.rectangle(0, 0, 6000, 4000, 0x0a1020, 0).setOrigin(0, 0).setScrollFactor(0).setDepth(99980);
    this.klaxon = this.add.graphics().setScrollFactor(0).setDepth(99985);

    // RTS-14/15 crew roster (bottom-left; per-member animated rows; toggle with [K]).
    this.crewTitle = this.mkText(12, 0, 'YOUR CREW  [K]', { fontFamily: NOIR_DISPLAY, fontSize: '15px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(0, 0).setScrollFactor(0).setDepth(100000);
    for (let i = 0; i < 8; i++) {
      this.crewWrong.push(this.add.rectangle(8, 0, 320, 16).setOrigin(0, 0.5).setStrokeStyle(2, hexNum(SPEC.danger), 1).setScrollFactor(0).setDepth(99999).setVisible(false));
      this.crewRows.push(this.mkText(14, 0, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(100000));
    }
    // Mutiny telegraph banner (top-centre, under the objective) — legible, earned, with a countdown.
    this.mutinyBanner = this.mkText(this.scale.width / 2, 60, '', { fontFamily: NOIR_FONT, fontSize: '15px', color: SPEC.danger, fontStyle: 'bold' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100001).setVisible(false);

    // RTS-24 THE MARKET tab (right dock, toggled with [M]) — rows of goods that narrate themselves.
    this.marketTitle = this.mkText(0, 0, 'THE MARKET  [M]', { fontFamily: NOIR_DISPLAY, fontSize: '15px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100001).setVisible(false);
    this.marketBody = this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, lineSpacing: 3, align: 'right' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100001).setVisible(false);

    // RTS-16 turf-war standings (right side, under THE WIRE) + rival-pressure telegraph banner.
    this.strategyTitle = this.mkText(0, 196, 'THE CITY', { fontFamily: NOIR_DISPLAY, fontSize: '15px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100000);
    this.strategyPanel = this.mkText(0, 216, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, lineSpacing: 2, align: 'right' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100000);
    this.pressureBanner = this.mkText(this.scale.width / 2, 84, '', { fontFamily: NOIR_FONT, fontSize: '14px', color: SPEC.danger, fontStyle: 'bold' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100001).setVisible(false);

    // RTS-28 §4 — the ACTION BOARD: the [1]–[6] verbs in their OWN scannable, framed panel (bottom-
    // right), separated from THE CITY standings/ledger. Solid plate so the chips read at a glance.
    this.actionTitle = this.mkText(0, 0, '⚔ ACTIONS  [1-6]', { fontFamily: NOIR_DISPLAY, fontSize: '14px', color: NOIR_PALETTE.brass, fontStyle: 'bold', backgroundColor: '#0a0807ee' }).setOrigin(1, 1).setScrollFactor(0).setDepth(100001).setPadding(8, 4, 8, 4);
    this.actionBody = this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, lineSpacing: 3, align: 'left', backgroundColor: '#0a0807e6' }).setOrigin(1, 1).setScrollFactor(0).setDepth(100001).setPadding(8, 6, 8, 6);

    // RTS-28 §1 — the fast-forward + skip-week controls (always visible, clickable). Bottom-centre.
    this.ffButton = this.mkText(0, 0, '', { fontFamily: NOIR_DISPLAY, fontSize: '15px', color: NOIR_PALETTE.brass, fontStyle: 'bold', backgroundColor: '#0a0807ee' })
      .setOrigin(0.5, 1).setScrollFactor(0).setDepth(100002).setPadding(10, 5, 10, 5).setInteractive({ useHandCursor: true });
    this.ffButton.on('pointerdown', () => this.cycleFastForward());
    this.skipButton = this.mkText(0, 0, '⏭ SKIP WEEK  [>]', { fontFamily: NOIR_DISPLAY, fontSize: '15px', color: NOIR_PALETTE.bone, fontStyle: 'bold', backgroundColor: '#0a0807ee' })
      .setOrigin(0.5, 1).setScrollFactor(0).setDepth(100002).setPadding(10, 5, 10, 5).setInteractive({ useHandCursor: true });
    this.skipButton.on('pointerdown', () => this.skipWeek());

    // RTS-25 perf overlay ([P]) — top-centre, off by default. Real FPS + frame ms + rasterisations/s.
    this.perfText = this.mkText(this.scale.width / 2, 6, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: '#7CFC8A', backgroundColor: '#000000cc' })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(200002).setPadding(6, 3, 6, 3).setVisible(false);
    this.refreshFastForward(); // initial label + placement
  }

  /** RTS-25 — sample FPS / frame-time / text-rasterisations once per second for the [P] overlay. */
  private samplePerf(deltaMs: number): void {
    this.perfAccumMs += deltaMs;
    if (this.perfAccumMs >= 1000) {
      this.rasterPerSec = this.rasterCount;
      this.rasterCount = 0;
      this.perfAccumMs = 0;
    }
    if (this.perfVisible && this.perfText) {
      const fps = Math.round(this.game.loop.actualFps);
      const ms = (deltaMs).toFixed(1);
      this.setT(this.perfText, `FPS ${fps} · frame ${ms}ms · text-raster ${this.rasterPerSec}/s · DPR ${this.textRes}`)
        .setPosition(this.scale.width / 2, 6);
    }
  }

  /** Turf-war readout (RTS-16): trajectory + standings + rival-pressure telegraph, and recolour
   * the district nameplates by who holds them (brass = you, rival-red = a rival, fog = neutral). */
  private refreshStrategy(): void {
    if (!this.strategyPanel || !this.strategyTitle || !this.pressureBanner) return;
    const right = this.scale.width - 18;
    const standing = cityStanding(this.state);
    this.strategyTitle.setPosition(right, 256);
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
    // RTS-23: the 4-stage phase header + WIN/LOSS PROXIMITY readout (how close anyone is).
    const phase = hudPhase(this.state);
    const vp = victoryProximity(this.state);
    lines.push('');
    lines.push(`— ${phase.phase} —`);
    lines.push(`LOSE ${vp.playerLosePct}%`);
    // RTS-24: THREE WIN PATHS — each a labeled progress readout (the leader is starred). The player
    // reads at a glance which route is closest and what advances it.
    const paths = winPaths(this.state);
    const lead = paths.reduce((a, b) => (b.pct > a.pct ? b : a), paths[0]);
    lines.push('— THREE WAYS TO WIN —');
    for (const w of paths) {
      const star = w === lead && w.pct > 0 ? '★' : '·';
      lines.push(`${star} ${w.label} ${w.pct}%`);
      lines.push(`   ${w.read.length > 38 ? w.read.slice(0, 37) + '…' : w.read}`);
    }
    this.setT(this.strategyPanel, lines.join('\n')).setPosition(right, 276);
    this.setC(this.strategyPanel, standing.trajectory === 'dominant' || standing.trajectory === 'ahead' ? NOIR_PALETTE.brass
      : standing.trajectory === 'behind' || standing.trajectory === 'crushed' ? SPEC.danger : NOIR_PALETTE.bone);

    // RTS-28 §4 — the ACTION BOARD (its OWN bottom-right panel, separated from the ledger above).
    this.refreshActionBoard();

    // recolour district nameplates by holder + RTS-25 zoom-gate: hide the small map labels when the
    // camera is pulled back far enough that they'd be an illegible speck (the §-legibility rule).
    const labelsLegible = this.cameras.main.zoom >= 0.5;
    for (const [id, label] of this.districtLabels) {
      const d = this.state.districts.find((x) => x.id === id);
      const holder = d ? districtHolder(d) : null;
      this.setC(label, holder === 'player' ? SPEC.brass : holder && holder.startsWith('rival') ? SPEC.rival : NOIR_PALETTE.fog);
      label.setVisible(labelsLegible);
    }

    // rival-pressure telegraph: the most urgent push onto your turf (like the run-2 threat).
    const onPlayer = telegraphedPushes(this.state).find((t) => t.onPlayer);
    if (onPlayer) {
      this.setT(this.pressureBanner, `⚔ ${onPlayer.familyName.toUpperCase()} IS PUSHING INTO ${onPlayer.districtName.toUpperCase()} — DEFEND OR GREASE CITY HALL`)
        .setPosition(this.scale.width / 2, 106).setVisible(true).setAlpha(0.7 + 0.3 * Math.abs(Math.sin(this.time.now / 300)));
    } else {
      this.pressureBanner.setVisible(false);
    }
  }

  /** RTS-28 §4 — the ACTION BOARD: the [1]–[6] build + offence verbs in their own scannable, framed
   * bottom-right panel (kept off THE CITY ledger), each a READY/CONDITIONAL/LOCKED chip. */
  private refreshActionBoard(): void {
    if (!this.actionTitle || !this.actionBody) return;
    const lines: string[] = [];
    // build verbs (grow the outfit out of ESTABLISH)
    for (const b of buildReadout(this.state)) {
      const chip = b.affordable ? 'READY' : 'COND';
      const mark = b.affordable ? '●' : '◐';
      const eta = b.affordable ? '' : IsoScene.etaTag(b.affordEtaWeeks);
      lines.push(`${mark} [${b.hotkey}] ${b.label.padEnd(9)} $${b.cost}${eta}  ${chip}`);
    }
    // §3C offence chips — READY / CONDITIONAL / LOCKED + cost · heat
    for (const o of offenseReadout(this.state)) {
      const st = verbChipState(o.available, o.reason);
      const mark = st === 'READY' ? '●' : st === 'CONDITIONAL' ? '◐' : '○';
      const heat = o.heat > 0 ? ` +${o.heat}🔥` : '';
      const tail = o.available ? '' : `  (${o.reason})`;
      lines.push(`${mark} [${o.hotkey}] ${o.label.padEnd(9)} $${o.cost}${heat}  ${st}${tail}`);
    }
    const margin = 18;
    const bottom = this.scale.height - 12;
    const x = this.scale.width - margin;
    this.setT(this.actionBody, lines.join('\n')).setPosition(x, bottom);
    const titleY = bottom - this.actionBody.height - 2;
    this.actionTitle.setPosition(x, titleY).setVisible(!this.marketOpen);
    this.actionBody.setVisible(!this.marketOpen);
  }

  /** A turf-war beat (RTS-16): a district changed hands — called out over its nameplate. */
  private flashTerritory(districtId: string, lostByPlayer: boolean): void {
    const label = this.districtLabels.get(districtId);
    if (!label) return;
    const txt = lostByPlayer ? 'BLOCK LOST!' : 'BLOCK TAKEN';
    const t = this.mkText(label.x, label.y - 14, txt, { fontFamily: NOIR_FONT, fontSize: '15px', color: lostByPlayer ? SPEC.danger : SPEC.rival, fontStyle: 'bold' })
      .setOrigin(0.5, 1).setDepth(100002);
    this.worldFx(t);
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
    // RTS-27: the mutiny stinger when a member FIRST becomes primed to betray (reuses `rows`, no
    // extra per-frame allocation; UI-independent of whether the roster panel is open).
    const primed = rows.find((m) => m.status === 'disloyal')?.name ?? '';
    if (primed && primed !== this.lastMutinyName) this.audio?.mutiny();
    this.lastMutinyName = primed;
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

      this.setTC(row, `${IsoScene.crewGlyph(r.status)} ${r.name}${tr} — ${r.status} (${r.loyalty})`, color)
        .setPosition(14 + dx, y + dy).setScale(scale).setVisible(true);

      const flashing = (this.crewFlashUntil.get(r.id) ?? 0) > now;
      wrong.setPosition(8 + dx, y + dy).setVisible(flashing)
        .setStrokeStyle(2, hexNum(SPEC.danger), flashing ? 0.5 + 0.5 * Math.abs(Math.sin(now / 150)) : 1);
    }

    // Mutiny telegraph: a disloyal member may walk at the next settlement — name it + countdown.
    if (this.mutinyBanner) {
      if (mostUrgent && this.crewVisible) {
        const countdown = realtimeHudView(this.state, SCENE_WEEK_SECONDS).weekCountdownLabel;
        this.setT(this.mutinyBanner, `⚠ ${mostUrgent.name.toUpperCase()} READY TO BETRAY — ACT NOW  (settles in ${countdown})`)
          .setPosition(this.scale.width / 2, 130).setVisible(true).setAlpha(0.7 + 0.3 * Math.abs(Math.sin(now / 300)));
      } else {
        this.mutinyBanner.setVisible(false);
      }
    }
  }

  private refreshHud(): void {
    if (!this.hudGfx) return;
    const g = this.hudGfx;
    const hud = realtimeHudView(this.state, SCENE_WEEK_SECONDS);
    const p = hud.player;
    const danger = anyCollectorInDanger(this.state);
    const net = playerWeeklyNet(this.state);
    const W = this.scale.width, now = this.time.now;
    g.clear();
    this.hudRegions = [];

    // ── TOP BAR ──
    const barX = 8, barY = 6, barW = W - 16, barH = 50;
    this.decoFrame(g, barX, barY, barW, barH);
    // a hairline brass deco rule under the title row
    g.lineStyle(1, PAL.brass, 0.25).beginPath(); g.moveTo(barX + 8, barY + 21); g.lineTo(barX + barW - 8, barY + 21); g.strokePath();

    const heatCellW = 300;
    const fixed: Record<string, { v: string; c: string; w: number }> = {
      clean: { v: `$${p.cleanCash}`, c: NOIR_PALETTE.brass, w: 118 },
      dirty: { v: `$${p.dirtyCash}`, c: p.dirtyCash > 4000 ? '#d98a6a' : NOIR_PALETTE.bone, w: 118 },
      net: { v: net >= 0 ? `+$${net}` : `-$${Math.abs(net)}`, c: net >= 0 ? SPEC.cashGreen : SPEC.danger, w: 120 },
      heat: { v: '', c: NOIR_PALETTE.bone, w: heatCellW },
      crew: { v: `${p.crew}`, c: NOIR_PALETTE.bone, w: 64 },
      week: { v: `${hud.week} · ${hud.weekCountdownLabel}`, c: NOIR_PALETTE.bone, w: 150 },
    };
    // RTS-24 HUD nit E — spread the empire-glance across the FULL top edge instead of clustering it
    // upper-left with empty centre. The cells keep their widths; the gaps grow to fill the bar (down
    // to a 10px floor on narrow screens). Room is reserved on the right for the PHASE chip.
    const contentStart = barX + 14;
    const phaseReserve = 156;
    const contentEnd = barX + barW - 14 - phaseReserve;
    const totalCellW = this.topCells.reduce((s, c) => s + fixed[c.key].w, 0);
    const gaps = Math.max(1, this.topCells.length - 1);
    const spreadGap = Math.max(10, (contentEnd - contentStart - totalCellW) / gaps);
    let cx = contentStart;
    for (const cell of this.topCells) {
      const def = fixed[cell.key];
      cell.x = cx; cell.w = def.w;
      cell.label.setPosition(cx, barY + 7); // label text is fixed (set at creation)
      if (cell.key === 'heat') {
        cell.value.setVisible(false);
        this.drawHeatMeter(g, cx, barY, def.w, p.heat, p.federalExposure, p.federalTier);
      } else {
        this.setTC(cell.value, def.v, def.c).setPosition(cx, barY + 22).setVisible(true);
      }
      this.hudRegions.push({ x: cx - 6, y: barY, w: def.w, h: barH, explain: this.cellExplain(cell.key, p, net) });
      cx += def.w + spreadGap;
    }

    // PHASE chip at the bar's right end — the 4-stage arc header.
    const phase = hudPhase(this.state);
    if (this.phaseChip) {
      const pc = phase.phase === 'DECAPITATE' ? SPEC.danger : phase.phase === 'ESTABLISH' ? NOIR_PALETTE.brass : NOIR_PALETTE.bone;
      this.setTC(this.phaseChip, `◆ ${phase.phase}`, pc).setPosition(barX + barW - 14, barY + barH / 2);
      const chipW = this.phaseChip.width + 12;
      this.hudRegions.push({ x: barX + barW - 14 - chipW, y: barY, w: chipW, h: barH, explain: `PHASE: ${phase.phase} — ${phase.read}  (ESTABLISH → FIRST BLOOD → CONTEST → DECAPITATE)` });
    }
    // week progress sliver along the bottom edge of the top bar
    g.fillStyle(PAL.brass, 0.85).fillRect(barX + 1, barY + barH - 2, (barW - 2) * Phaser.Math.Clamp(hud.weekProgress, 0, 1), 2);

    // ── FOUR CHANNEL DIALS (left, under the top bar) ──
    this.drawChannels(g, p);

    // ── ROUTE PILL (prominent, under the channels) ──
    this.drawRoutePill(g, p);

    // ── CONTROL readout (RTS-29, the freed Market tab) ──
    this.drawControl(g);

    // ── CONTEXT CARD (selected thug) ──
    this.drawContextCard(g);

    // ── THE MARKET tab (right dock, when open) ──
    this.drawMarket(g);

    // ── THE WIRE frame (behind the feed, under the top bar) — hidden while the Market replaces the dock ──
    if (this.feedVisible && !this.marketOpen) {
      const fw = 306, fx = W - fw - 6, fy = 60;
      this.decoFrame(g, fx, fy, fw, 184, PAL.brass, 0.5);
      if (now < this.wireFlashUntil) { g.lineStyle(2, hexNum(SPEC.danger), 0.4 + 0.4 * Math.abs(Math.sin(now / 120))); g.strokeRect(fx + 1, fy + 1, fw - 2, 182); }
    }

    // Klaxon vignette + warning banner + audio seams
    this.refreshKlaxon(p.federalTier >= 3);
    const warn = p.federalTier > 0 ? this.fedLine(p.federalTier) : danger ? 'A COLLECTOR IS UNDER THREAT — get it to HQ' : null;
    if (this.warningBanner) {
      this.warningBanner.setVisible(!!warn);
      if (warn) this.setT(this.warningBanner, `⚠ ${warn}`).setPosition(12, this.scale.height - 26).setAlpha(0.7 + 0.3 * Math.abs(Math.sin(now / 280)));
    }
    this.detectHudBeats(p, phase.phase);
    this.lastHeat = p.federalExposure; // for the next frame's heat-direction arrow
    void shockFlavor; void ISO_TILE_HEIGHT; void heatLabel;
  }

  /** §1D — the LADDERED heat meter: filled to exposure, ENGRAVED ticks at 50/70/85 with their
   * NOTICE/WATCH/RAID labels, a direction arrow, and a named caption. */
  private drawHeatMeter(g: Phaser.GameObjects.Graphics, x: number, barY: number, w: number, _heat: number, exposure: number, tier: number): void {
    const my = barY + 26, mh = 8, mw = w - 8;
    g.fillStyle(PAL.charcoal, 1).fillRect(x, my, mw, mh);
    g.fillStyle(hexNum(federalBarColor(tier)), 1).fillRect(x, my, mw * Phaser.Math.Clamp(exposure / 100, 0, 1), mh);
    // engraved threshold ticks + tiny NOTICE/WATCH/RAID labels
    for (const t of FEDERAL_LADDER) {
      const tx = x + (mw * t.at) / 100;
      const passed = exposure >= t.at;
      g.lineStyle(1, hexNum(passed ? SPEC.brass : SPEC.bone), passed ? 0.95 : 0.7); // static: brass when passed
      g.beginPath(); g.moveTo(tx, my - 2); g.lineTo(tx, my + mh + 2); g.strokePath();
    }
    // direction arrow + the named tier caption ("WATCH · exp 72/100 ▲ · raid at 85")
    const dir = exposure > this.lastHeat + 0.5 ? '▲ rising' : exposure < this.lastHeat - 0.5 ? '▼ cooling' : '◆ steady';
    const name = federalTierLabel(tier);
    const cap = `${name} · exp ${exposure}/100 ${dir} · raid at 85`;
    if (this.heatCaption) this.setTC(this.heatCaption, cap, tier >= 2 ? '#d98a6a' : NOIR_PALETTE.fog).setPosition(x, my + mh + 3);
    // the threshold labels engraved under their ticks
    this.drawLadderLabels(g, x, my + mh + 14, mw);
  }

  /** Tiny engraved NOTICE/WATCH/RAID labels under their ladder ticks (drawn once-per-frame as text
   * cache so we don't allocate; reuses 3 pooled labels). */
  private ladderLabelPool: Phaser.GameObjects.Text[] = [];
  private drawLadderLabels(_g: Phaser.GameObjects.Graphics, x: number, y: number, mw: number): void {
    FEDERAL_LADDER.forEach((t, i) => {
      let lbl = this.ladderLabelPool[i];
      if (!lbl) { lbl = this.mkText(0, 0, '', { fontFamily: NOIR_DISPLAY, fontSize: '11px', color: NOIR_PALETTE.fog }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100000); this.ladderLabelPool[i] = lbl; }
      this.setT(lbl, t.label).setPosition(x + (mw * t.at) / 100, y).setVisible(true);
    });
  }

  private cellExplain(key: string, p: { cleanCash: number; dirtyCash: number; weeklyUpkeep: number; crew: number; heat: number }, net: number): string {
    switch (key) {
      case 'clean': return 'CLEAN $ — laundered, safe money you can freely spend.';
      case 'dirty': return 'DIRTY $ — crime proceeds. A big hoard radiates heat; launder it.';
      case 'net': return `NET /wk — income minus upkeep ($${p.weeklyUpkeep}) & bribes. ${net >= 0 ? 'in the black.' : 'the bleed is winning — extort more or cut costs.'}`;
      case 'heat': return 'HEAT vs the FEDERAL LADDER (50/70/85). At 85 a raid can bust you — grease The Beat / launder / cool off.';
      case 'crew': return 'CREW — your thugs. More = more extortion, defense, and muscle for a hit (need 12 strength).';
      case 'week': return 'WEEK — the settlement clock. Income accrues each week; next settles when the sliver fills.';
      default: return '';
    }
  }

  /** RTS-23 — the FOUR CHANNELS as labeled dials: level $/wk · what it buys · the [G] bump cost. */
  private drawChannels(g: Phaser.GameObjects.Graphics, _p: unknown): void {
    const r = this.channelPanelRect; r.y = 64; r.w = 300; r.h = 122;
    this.decoFrame(g, r.x, r.y, r.w, r.h);
    this.channelTitle?.setPosition(r.x + 8, r.y + 6);
    const FEDERAL_GREEN = 0x5b7d6a; // §2: The Bureau reads federal-green (canon-checked accent)
    const defs: { ch: BribeChannel; name: string; buys: string }[] = [
      { ch: 'police', name: 'THE BEAT', buys: 'fewer raids' },
      { ch: 'judges', name: 'THE BENCH', buys: 'survive a bust · −raid heat' },
      { ch: 'politicians', name: 'CITY HALL', buys: 'heat cools · hit cover' },
      { ch: 'feds', name: 'THE BUREAU', buys: 'fed shield · unlocks lockout' },
    ];
    const bribes = this.state.player.bribes;
    defs.forEach((d, i) => {
      const row = this.channelRows[i]; if (!row) return;
      const y = r.y + 26 + i * 23;
      const lvl = bribes[d.ch] ?? 0;
      const bracket = bribeBracket(lvl);
      const accent = d.ch === 'feds' ? FEDERAL_GREEN : PAL.brass;
      // named-bracket pip dial (NONE → … → IRON GRIP)
      const dotsX = r.x + 9;
      for (let s = 0; s < BRIBE_PIPS; s++) { g.fillStyle(s < bracket.pips ? accent : PAL.charcoal, s < bracket.pips ? 0.95 : 0.7).fillRect(dotsX + s * 7, y + 3, 5, 10); }
      const next = bracket.nextName ? ` →${bracket.nextName}@$${bracket.nextAt}` : ' (IRON GRIP)';
      const col = d.ch === 'feds' && lvl > 0 ? '#7da890' : lvl > 0 ? NOIR_PALETTE.bone : NOIR_PALETTE.fog;
      this.setTC(row, `${d.name} · ${bracket.name} $${lvl}/wk · ${d.buys}${next}`, col).setPosition(dotsX + 42, y);
      const fedExtra = d.ch === 'feds' ? ' Greasing The Bureau lowers your federal EXPOSURE directly.' : '';
      this.hudRegions.push({ x: r.x, y: y - 2, w: r.w, h: 21, explain: `${d.name} — ${bracket.name} ($${lvl}/wk): buys ${d.buys}. [G] greases the next channel +$10/wk.${fedExtra}` });
    });
  }

  /** RTS-29 — the COLLECTORS pill: how many fixed per-business collectors are on the rounds + the cash
   * in transit (the sea-of-collectors heartbeat). One collector per extorted front; no player routing. */
  private drawRoutePill(g: Phaser.GameObjects.Graphics, p: { uncollected: number }): void {
    if (!this.routePill) return;
    const r = this.channelPanelRect; const x = r.x, y = r.y + r.h + 8, w = r.w;
    const cols = this.state.units.filter((u) => u.role === 'collector' && u.factionId === 'player' && u.routeId !== undefined);
    const carrying = cols.reduce((a, u) => a + (u.carrying ?? 0), 0);
    let text: string, col: string;
    if (cols.length > 0) {
      text = `◆ ${cols.length} COLLECTOR${cols.length === 1 ? '' : 'S'} on the rounds${carrying > 0 ? ` · banking $${carrying}` : ''}`;
      col = NOIR_PALETTE.brass;
    } else {
      text = '◆ No collectors yet — lean on a [%] front ([E]) to start earning'; col = NOIR_PALETTE.fog;
    }
    this.decoFrame(g, x, y, w, 26, PAL.brass, 0.8);
    this.setTC(this.routePill, text, col).setPosition(x + 8, y + 6);
    this.hudRegions.push({ x, y, w, h: 26, explain: 'One collector per extorted front walks a fixed HQ↔shop track each week, banking the take. Collectors are SAFE while rivals are dormant; they become robbable once the war begins (RTS-30).' });
    void p;
  }

  /** RTS-29 — the CONTROL meter (the freed Market dock tab): "CONTROL ███░░ 7/10", named + capped. */
  /** RTS-30a — THE CITY — WHAT'S YOURS: the district-status roster (the reworked "control"). A row per
   * district (pip · name · status · biz-held/total · tag) + a summary line. Click a row → fly there.
   * Lives in the freed dock space under the channels/collectors pill. */
  private drawControl(g: Phaser.GameObjects.Graphics): void {
    if (!this.controlTitle || !this.controlBody) return;
    const r = this.channelPanelRect; const x = r.x, y = r.y + r.h + 8 + 32, w = r.w;
    const rows = cityRoster(this.state);
    const sum = citySummary(this.state);
    const rowH = 15, headH = 18, h = headH + rows.length * rowH + 18;
    this.decoFrame(g, x, y, w, h, PAL.brass, 0.84);
    this.controlTitle.setPosition(x + 8, y + 4).setVisible(true);
    this.cityRowHits = [];
    const lines: string[] = [];
    rows.forEach((row, i) => {
      const ry = y + headH + i * rowH;
      const held = row.bizTotal > 0 ? `${row.bizHeld}/${row.bizTotal}` : '—';
      lines.push(`${row.pip} ${row.name.replace('The ', '').padEnd(13).slice(0, 13)} ${row.status.padEnd(11)} ${held.padStart(5)} ${row.tag}`);
      this.cityRowHits.push({ x, y: ry, w, h: rowH, districtId: row.id });
      this.hudRegions.push({ x, y: ry, w, h: rowH, explain: `${row.name}: ${row.status} (${held} businesses). Click to fly the camera there.` });
    });
    lines.push(`── HELD ${sum.held}/${sum.total} · ${sum.establishing} establishing · ${sum.rival} rival`);
    this.setTC(this.controlBody, lines.join('\n'), NOIR_PALETTE.bone).setPosition(x + 8, y + headH);
    this.controlBody.setVisible(true);
  }

  /** RTS-23 — the CONTEXT card (bottom-left): a HOVERED business's card (state · yield · heat + its
   * valid verbs with expected effect), else the SELECTED thug's card. Every value labeled. */
  private drawContextCard(g: Phaser.GameObjects.Graphics): void {
    if (!this.ctxCardTitle || !this.ctxCardBody) return;
    const w = 268, x = 12;
    // Prefer a business under the cursor (only over the world, not the HUD panels).
    const ptr = this.input.activePointer;
    const overWorld = ptr.y > 60 && ptr.x < this.scale.width - 320 && ptr.y < this.scale.height - 96;
    // RTS-28: hovered building takes priority; otherwise the STICKY left-clicked building (focusBizId).
    const hovered = overWorld ? this.businessAtScreen(ptr.worldX, ptr.worldY) : undefined;
    const bizId = hovered ?? (this.focusBizId && allBusinesses(this.state).some((bb) => bb.id === this.focusBizId) ? this.focusBizId : undefined);
    if (bizId) {
      const b = inspectBusiness(this.state, bizId);
      const raw = allBusinesses(this.state).find((x2) => x2.id === bizId);
      const acts = businessActions(this.state, bizId, 'player');
      if (b && raw && acts) {
        this.ctxBizId = bizId;
        // RTS-24 §3B "The Books": the vice ladder for one of YOUR rackets — next rung's
        // cost · yield-Δ · heat-Δ · READY/CONDITIONAL/LOCKED (with the plain locked reason).
        const ladder = viceLadder(this.state, bizId);
        const viceLine = this.viceLadderLine(ladder);
        const h = viceLine ? 98 : 84, y = this.scale.height - h - 12;
        this.decoFrame(g, x, y, w, h);
        const shut = isShutDown(raw);
        const state = shut ? 'SHUT DOWN' : b.payingProtection ? 'YOURS — paying' : b.earnerName ? `${b.earnerName}'s` : 'un-shaken';
        const stateCol = shut ? SPEC.danger : b.payingProtection ? SPEC.brass : b.earnerName ? SPEC.rival : NOIR_PALETTE.fog;
        const branchTag = ladder && ladder.branch ? ` · ${ladder.label}${ladder.current > 0 ? ` ${'I'.repeat(ladder.current)}` : ''}` : '';
        this.setTC(this.ctxCardTitle, `▣ ${b.name} (${b.kind})${branchTag} · ${state}`, stateCol).setPosition(x + 8, y + 6).setVisible(true);
        // §3C action-verb chips: verb · effect/cost · READY/CONDITIONAL/LOCKED + plain reason.
        const exSt = verbChipState(acts.extort.ok, acts.extort.reason);
        const atSt = verbChipState(acts.attack.ok, acts.attack.reason);
        const ex = acts.extort.ok ? `[READY] EXTORT → +30% protection income` : `[${exSt}] EXTORT — ${acts.extort.reason}`;
        const at = acts.attack.ok ? `[READY] ATTACK → shut ${ATTACK_SHUTDOWN_WEEKS}wk, +${ATTACK_HEAT}🔥` : `[${atSt}] ATTACK — ${acts.attack.reason}`;
        const body = [`yield $${b.income}/wk · heat ${raw.heatPerTick}/wk · uncollected $${b.uncollected}`, ex, at];
        if (viceLine) body.push(viceLine);
        this.setTC(this.ctxCardBody, body.join('\n'), NOIR_PALETTE.bone).setPosition(x + 8, y + 24).setVisible(true);
        this.hudRegions.push({ x, y, w, h, explain: `${b.name}: ${state}. Yield $${b.income}/wk. Right-click → EXTORT or ATTACK.${viceLine ? ' [U] upgrades its vice branch.' : ''}` });
        return;
      }
    }
    this.ctxBizId = undefined;
    // else: the selected thug's card.
    const id = this.selection.ids[0];
    const view = id ? this.units.find((u) => u.unit.id === id) : undefined;
    const insp = id ? inspectUnit(this.state, id) : null;
    if (!view || !insp) { this.ctxCardTitle.setVisible(false); this.ctxCardBody.setVisible(false); return; }
    const h = 76, y = this.scale.height - h - 12;
    this.decoFrame(g, x, y, w, h);
    const member = crewReadout(this.state.player).find((m) => m.id === id);
    const role = view.unit.role === 'collector' ? 'collector' : view.faction === 'player' ? 'button man' : 'rival';
    this.setTC(this.ctxCardTitle, `▣ ${member?.name ?? insp.kind.toUpperCase()} · ${role}`, NOIR_PALETTE.brass).setPosition(x + 8, y + 6).setVisible(true);
    const more = this.selection.ids.length > 1 ? `  (+${this.selection.ids.length - 1} more selected)` : '';
    const traits = member && member.traitLabels.length ? ' · ' + member.traitLabels.join(', ') : '';
    const body = member
      ? [`skill ${member.skill} · loyalty ${member.loyalty} (${member.status})${traits}`,
         'RIGHT-CLICK a shop → EXTORT / ATTACK · right-click street → move' + more]
      : [`${insp.vulnerable ? `carrying $${insp.carrying}` : 'on the move'}`, 'guard your collectors — a rival enforcer robs them' + more];
    this.setTC(this.ctxCardBody, body.join('\n'), NOIR_PALETTE.bone).setPosition(x + 8, y + 26).setVisible(true);
  }

  /** RTS-24 §3B — the next vice-rung as a one-line chip ([U] · name · cost · +yield · ±heat ·
   * READY/CONDITIONAL/LOCKED + reason), or null when the racket has no branch / is maxed. */
  private viceLadderLine(ladder: ViceLadderView | null): string | null {
    if (!ladder || !ladder.branch) return null;
    if (!ladder.next) return `THE BOOKS: ${ladder.label} maxed — top of the ladder`;
    const n = ladder.next;
    const chip = n.state === 'READY' ? '[READY]' : n.state === 'CONDITIONAL' ? '[CONDITIONAL]' : '[LOCKED]';
    const heat = `${n.heatDelta >= 0 ? '+' : ''}${n.heatDelta}🔥`;
    const tail = n.state === 'READY' ? '[U] upgrade' : n.reason;
    return `${chip} [U] ${n.name}: $${n.cost} · +$${n.incomeBump}/wk · ${heat} — ${tail}`;
  }

  /** RTS-24 — THE MARKET right-dock tab: one self-narrating row per good (price · ▲/▼ vs base ·
   * supply↔demand read · held), the selected good marked, and a live BUY/SELL preview with spread. */
  private drawMarket(g: Phaser.GameObjects.Graphics): void {
    if (!this.marketTitle || !this.marketBody || !this.marketOpen) return;
    const right = this.scale.width - 18;
    const rows = marketRows(this.state);
    if (this.marketSel >= rows.length) this.marketSel = 0;
    // RTS-28: THE MARKET cleanly REPLACES the right dock (The Wire + The City + Actions are hidden
    // while it's open — see toggleMarket / the refresh gates), so it never overlaps their text.
    const top = 64;
    this.marketTitle.setPosition(right, top);
    const lines: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const cursor = i === this.marketSel ? '▶' : ' ';
      lines.push(`${cursor} ${r.dir} ${r.name} $${r.price} (base $${r.basePrice})${r.held ? ` · hold ${r.held}` : ''}`);
      lines.push(`    ${r.read}`);
    }
    // live preview for the selected good (buy lifts demand, sell lifts supply — the footprint).
    const sel = rows[this.marketSel];
    if (sel) {
      const bp = tradePreview(this.state, sel.id, this.marketQty, 'buy');
      const sp = tradePreview(this.state, sel.id, this.marketQty, 'sell');
      lines.push('');
      if (bp) lines.push(`[Y] BUY ${this.marketQty} → -$${bp.total} ($${bp.unitPrice}/ea, spread $${bp.spreadPerUnit}) → $${bp.newPrice}`);
      if (sp) lines.push(`[J] SELL ${this.marketQty} → +$${sp.total} ($${sp.unitPrice}/ea) → $${sp.newPrice}`);
      lines.push('[N] next good · trades move the market');
    }
    const body = lines.join('\n');
    this.setT(this.marketBody, body).setPosition(right, top + 20);
    const h = this.marketBody.height + 30;
    const w = 312;
    this.decoFrame(g, right - w + 4, top - 4, w, h, PAL.brass, 0.94); // opaque: a real overlay tab
    this.hudRegions.push({ x: right - w + 4, y: top - 4, w, h, explain: 'THE MARKET: buy low, sell high. Demand up → dearer; supply up → cheaper. Your trades move the price (a footprint), and the house takes a spread. Sale proceeds are DIRTY cash.' });
  }

  // ── RTS-23 audio-feedback seams ──────────────────────────────────────────────────────────────

  /** A single discrete event signal. Drives the HUD beat AND (RTS-27) the matching audio cue. */
  private signalBeat(kind: 'extort' | 'banked' | 'ambush' | 'federal' | 'unrest' | 'phase' | 'attack' | 'capture', label?: string): void {
    this.wireFlashUntil = this.time.now + 900; // the Wire frame pulses on any major beat
    if (label) this.setStatus(label);
    // RTS-27: hang the catalogued clip on the beat that already fires (no new triggers).
    switch (kind) {
      case 'extort': this.audio?.extort(); break;
      case 'banked': this.audio?.banked(); break;
      case 'ambush': this.audio?.combat('ambush'); break;
      case 'attack': this.audio?.combat('attack'); break;
      case 'unrest': this.audio?.mutiny(); break;
      // 'phase' / 'federal' / 'capture' are handled at their richer call sites (sting + music / tier).
    }
  }

  /** Watch state for major beats (new alert on the Wire, a phase change) and emit a signal. */
  private detectHudBeats(p: { federalTier: number }, phase: string): void {
    const last = this.state.incidents[this.state.incidents.length - 1];
    if (last && last.seq !== this.lastIncidentSeq) {
      this.lastIncidentSeq = last.seq;
      const needsYou = last.severity === 'danger' || last.severity === 'warning';
      if (needsYou) this.wireFlashUntil = this.time.now + 900;
      // RTS-27 progressive disclosure for the ears: only needs-you slips RING (📞); routine = soft tick.
      this.audio?.wire(needsYou ? 'crisis' : 'routine');
    }
    if (this.lastPhase && this.lastPhase !== phase) {
      this.flashPhaseChange(phase);
      // RTS-27: crossfade the adaptive music to the new phase bed + a phase sting.
      this.audio?.setPhase(phase as MusicPhase);
      this.audio?.play(this.audio.stingForPhaseKey(phase as MusicPhase));
      if (phase === 'CONTEST' || phase === 'FIRST BLOOD') this.fireTipOnce('war');
    }
    this.lastPhase = phase;
    // RTS-27: the teletype escalation only when the federal tier CROSSES up (50/70/85).
    if (p.federalTier > this.lastFederalTier) this.audio?.federal(p.federalTier);
    this.lastFederalTier = p.federalTier;
  }

  // ── RTS-27 audio settings surface ──────────────────────────────────────────────────────────

  private static readonly AUDIO_BUSES: (keyof import('./audio').AudioSettings)[] = ['master', 'music', 'sfx', 'vo', 'ambience'];

  private buildAudioPanel(): void {
    this.audioPanel = this.mkText(12, this.scale.height - 140, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, backgroundColor: '#0a0807dd', lineSpacing: 3 })
      .setOrigin(0, 1).setScrollFactor(0).setDepth(200002).setPadding(8, 6, 8, 6).setVisible(false);
    this.refreshAudioPanel();
  }

  private toggleAudioPanel(): void {
    this.audioPanelOpen = !this.audioPanelOpen;
    this.audioPanel?.setVisible(this.audioPanelOpen);
    if (this.audioPanelOpen) this.refreshAudioPanel();
  }

  /** Cycle one bus's volume down a notch (100→75→50→25→0→100) and respect it immediately. */
  private cycleAudioBus(index: number): void {
    if (!this.audio) return;
    const bus = IsoScene.AUDIO_BUSES[index];
    const cur = this.audio.getSettings()[bus] as number;
    this.audio.setBusVolume(bus, cycleVolume(cur));
    this.refreshAudioPanel();
  }

  private refreshAudioPanel(): void {
    if (!this.audioPanel || !this.audio) return;
    const s = this.audio.getSettings();
    const bar = (v: number): string => '▮'.repeat(Math.round(v * 4)) + '▭'.repeat(4 - Math.round(v * 4));
    const lines = ['♪ AUDIO  [O] close · [0] mute' + (s.muted ? '  (MUTED)' : '')];
    IsoScene.AUDIO_BUSES.forEach((b, i) => lines.push(`[${i + 1}] ${b.toUpperCase().padEnd(9)} ${bar(s[b] as number)} ${Math.round((s[b] as number) * 100)}%`));
    this.setT(this.audioPanel, lines.join('\n')).setColor(s.muted ? SPEC.danger : NOIR_PALETTE.bone);
  }

  // ── RTS-28 fast-forward / skip-week ─────────────────────────────────────────────────────────

  /** [Space] / the on-screen button — cycle the real-time speed 1× → 2× → 4×. */
  private cycleFastForward(): void {
    this.timeScale = nextTimeScale(this.timeScale);
    this.refreshFastForward();
    this.setStatus(`speed ${this.timeScale}× — [Space] cycle · [>] skip week`);
  }

  /** [>] / the on-screen button — jump straight to the next week settlement (exactly one). */
  private skipWeek(): void {
    this.skipWeekPending = true;
    this.setStatus('skipping to the next week…');
  }

  /** Position + label the FF/skip controls (bottom-centre, always visible). */
  private refreshFastForward(): void {
    if (!this.ffButton || !this.skipButton) return;
    const cy = this.scale.height - 12, cx = this.scale.width / 2;
    const glyph = this.timeScale === 1 ? '▶' : this.timeScale === 2 ? '▶▶' : '▶▶▶';
    this.setT(this.ffButton, `${glyph} ${this.timeScale}×  [Space]`).setColor(this.timeScale > 1 ? SPEC.cashGreen : NOIR_PALETTE.brass)
      .setPosition(cx - this.ffButton.width / 2 - 6, cy);
    this.skipButton.setPosition(cx + this.skipButton.width / 2 + 6, cy);
  }

  /** A centred banner when the match phase changes (a clear visual beat for audio/VO to hook). */
  private flashPhaseChange(phase: string): void {
    const labels: Record<string, string> = {
      'ESTABLISH': 'ESTABLISH YOUR RACKET — EXTORT THE NEIGHBOURHOOD',
      'FIRST BLOOD': 'FIRST BLOOD — MAKE YOUR MOVE ON A RIVAL',
      'CONTEST': 'CONTEST THE CITY — THE TURF WAR IS ON',
      'DECAPITATE': 'DECAPITATE — FINISH A RIVAL FAMILY',
    };
    const label = labels[phase] ?? phase;
    const t = this.mkText(this.scale.width / 2, 120, label, { fontFamily: NOIR_FONT, fontSize: '22px', color: phase === 'DECAPITATE' ? SPEC.danger : SPEC.brass, fontStyle: 'bold' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(100002).setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 320, ease: 'Back.Out' });
    this.tweens.add({ targets: t, alpha: 0, y: 100, delay: 1600, duration: 600, onComplete: () => t.destroy() });
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
    const hint = '  ·  right-click a shop → EXTORT/ATTACK · [T] route · WASD/drag/wheel camera · [F] follow · [6] recruit · [5] expand';
    this.statusText.setText((action ? `${base}  ·  ${action}` : base + hint) + (sh ? `   |  ${sh}` : ''));
  }

  private toggleFeed(): void {
    this.feedVisible = !this.feedVisible;
    this.feedTitle?.setVisible(this.feedVisible);
    for (const l of this.feedLines) l.setVisible(this.feedVisible);
    // §4: focusing The Wire marks everything read (clears the NEEDS-YOU count).
    const last = this.state.incidents[this.state.incidents.length - 1];
    if (last) this.lastSeenWireSeq = last.seq;
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
    const right = this.scale.width - 18;
    const dotX = this.scale.width - 300; // category-dot column at the panel's left edge (§4)
    const flashing = this.time.now < this.wireFlashUntil;
    // §4: unread "NEEDS YOU" count — danger/warning incidents past what the player last focused.
    const unread = this.state.incidents.filter((r) => r.seq > this.lastSeenWireSeq && incidentNeedsYou(r.severity)).length;
    const title = unread > 0 ? `THE WIRE  [L] · ${unread} NEEDS YOU` : (flashing ? 'THE WIRE  [L]  ◂ NEW' : 'THE WIRE  [L]');
    if (this.feedTitle) this.setTC(this.feedTitle, title, unread > 0 || flashing ? SPEC.danger : NOIR_PALETTE.brass).setPosition(right, 66);
    const recent: IncidentRecord[] = recentIncidents(this.state, this.feedLines.length);
    const g = this.hudGfx; // dots drawn after refreshHud's clear, persist through the frame
    for (let i = 0; i < this.feedLines.length; i++) {
      const line = this.feedLines[i];
      const rec = recent[i];
      const ly = 86 + i * 15;
      line.setPosition(right, ly);
      if (!rec) { this.setT(line, ''); continue; }
      // §4 category dot (money/threat/law/turf/crew) + a NEEDS-YOU tab marker on the left.
      const cat = alertCategory(rec.type);
      if (g) {
        g.fillStyle(hexNum(cat.color), 0.95).fillCircle(dotX, ly + 6, 3);
        if (rec.seq > this.lastSeenWireSeq && incidentNeedsYou(rec.severity)) g.fillStyle(PAL.brass, 0.95).fillRect(dotX - 10, ly + 1, 3, 11); // "needs you" tab (brass = you)
      }
      const sum = rec.summary.length > 44 ? rec.summary.slice(0, 43) + '…' : rec.summary;
      this.setTC(line, `[w${rec.week}] ${sum}`, IsoScene.feedColor(rec.severity));
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
    const w = 600, h = 372;
    const cx = this.scale.width / 2, cy = this.scale.height / 2;
    const bg = this.add.rectangle(0, 0, w, h, PAL.ink, 0.96).setStrokeStyle(2, PAL.brass, 1);
    const title = this.mkText(0, -h / 2 + 16, 'LEGAL CRIME — FEDORA NOIR', { fontFamily: NOIR_FONT, fontSize: '20px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(0.5, 0);
    const body = this.mkText(0, -h / 2 + 50, [
      'Prohibition Chicago. Build a protection empire — quietly first, by war later.',
      '',
      'CAMERA — move around and read the city',
      '  WASD / arrows pan · drag to pan · wheel zoom-to-cursor · [F] follow selection · [Z] frame whole city',
      '',
      'MOUSE — drive your thugs',
      '  LEFT-CLICK a thug to select (SHIFT-click adds more)',
      '  RIGHT-CLICK a storefront → EXTORT (take protection) or ATTACK (shut it down)',
      '  RIGHT-CLICK the street → move the selected thugs',
      '  The coloured plate under a shop = its allegiance: fog new · brass yours · red rival.',
      '',
      'EXTORT-FIRST — the early game',
      '  • Shake down the NEIGHBOURHOOD — every cheap front you can (low heat, steady money).',
      '  • [T] set an automated COLLECTION ROUTE so the take banks itself — but GUARD it,',
      '    a rival enforcer who catches the collector still robs you.',
      '  • [6] recruit more thugs · [5] expand to the next block · [G] grease The Beat.',
      '  • War comes later: [1] raid · [2] sabotage · [3] assassinate · [4] lockout.',
      '',
      '  [K] crew · [L] the wire · [H] help · [B] card view',
    ].join('\n'), { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, lineSpacing: 3, align: 'left' }).setOrigin(0.5, 0);
    const hint = this.mkText(0, h / 2 - 22, 'click anywhere to begin', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.fog }).setOrigin(0.5, 0);
    this.legend = this.add.container(cx, cy, [bg, title, body, hint]).setScrollFactor(0).setDepth(100100);
  }

  private toggleLegend(): void {
    if (this.legend?.visible) this.hideLegend(); else this.showLegend();
  }
  private showLegend(): void { this.legend?.setPosition(this.scale.width / 2, this.scale.height / 2).setVisible(true); }
  private hideLegend(): void { this.legend?.setVisible(false); }
}
