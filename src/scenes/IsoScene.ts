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
  spawnEnforcer,
  issueMove,
  stopUnit,
  unitTile,
  unitScreenPos,
  pickUnit,
  resolveMoveCommand,
  isCommandableTile,
  isCommandableUnit,
  collectorVulnerableInDistrict,
  emptySelection,
  selectOnly,
  selectMany,
  toggleSelection,
  clearSelection,
  isSelected,
  createInitialState,
  updateAndObserve as observeWorld,
  harvestIncidents,
  recentIncidents,
  rushCollection,
  processCollectorArrivals,
  dispatchThreat,
  applyCommand,
  affordableOperation,
  strongholdDistrict,
  firstObjective,
  tutorialCard,
  tutorialComplete,
  type TutorialProgress,
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
  victoryConditions,
  imminentVictory,
  victoryReport,
  type VictoryCondition,
  type VictoryReport,
  // Lane L — RUN STATS: pure tally accumulated at existing outcome points + the endgame summary block.
  ensureRunStats,
  observeRun,
  recordFundsBanked,
  recordIncomeEarned,
  recordBribePaid,
  recordRacketRun,
  runStatsSummary,
  familyIncome,
  // Lane — CONSIGLIERE: pure advisor reads player-knowable facts + THE WIRE events → ranked suggestions.
  topSuggestion,
  suggestedExtortTarget,
  type AdvisorSnapshot,
  type AdvisorPlace,
  type Suggestion,
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
  raidChance,
  federalExposure,
  verbChipState,
  alertCategory,
  incidentNeedsYou,
  playerWeeklyNet,
  buildReadout,
  expandTargetDistrictId,
  coreVerbState,
  type ToolbarVerbState,
  type CoreVerbId,
  type CoreVerbContext,
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
  advanceRoutes,
  ensureBusinessCollector,
  cityRoster,
  citySummary,
  rivalsDormant,
  recruitEnforcer,
  recruitableEnforcers,
  enforcerUnitSkill,
  unitMusclePresence,
  unitActionChips,
  multiSelectChips,
  buildActionInspector,
  rowSymbol,
  type InspectorContext,
  type WeaponTier,
  type RecruitOption,
  type ActionChip,
  type UnitActionContext,
  type VerbId,
  activateContests,
  resolveContestStep,
  contestedDistrictIds,
  CONTEST_PULSE_SECONDS,
  CONTEST_MUSCLE_PER_INVASION,
  type Contest,
  generateWorld,
  tileKindAt,
  scatterProps,
  parseLiveliness,
  LIVELINESS_CAPS,
  WORLD_SIZE,
  type WorldLayout,
  type WorldDistrict,
  type PropPlacement,
  extortProgress,
  canIssueMoveAndShakedown,
  canIssueMoveAndSabotage,
  isRivalHeldFront,
  previewAttackRival,
  previewExtortFront,
  previewRetakeFront,
  previewFederalAction,
  type OpPreview,
  frontInteractionPoint,
  applyCommandWithEmbodiedExtortion,
  type EmbodiedExtortionAct,
  type EmbodiedExtortionEvent,
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
  COMBAT_SEEK_RANGE,
  isCombatant,
  enemyInRange,
  downedBodyDecay,
  type DownedBody,
  spawnBeatCops,
  primePatrolWorld,
  copsRequested,
  debugCopsRequested,
  copMarkerVisible,
  type BeatCop,
  type NavGrid,
  type MovableUnit,
  type ThreatView,
  type InterceptionEvent,
  type CombatEvent,
  type IncidentRecord,
  type IncidentSeverity,
  type ShockKind,
  type BribeChannel,
} from '../sim';
import { NOIR_PALETTE, NOIR_FONT, NOIR_DISPLAY, heatLabel, shockFlavor, bribeChannelLabel, GAME_TITLE, NEWSPAPER_MASTHEAD } from './theme';
import {
  buildCityTextures,
  figureKeyFor,
  enforcerTexKey,
  actionIconKey,
  richArt,
  drawIsoBuilding,
  drawLandmark,
  BUILDING_STYLES,
  ENV_HEIGHT_SCALE,
  TEX,
  PAL,
} from './cityArt';
import {
  districtIdentityFor, facadeAccentFor, buildingVariantFor, hashKey, type DistrictIdentity,
} from './art/districtIdentity';
import { AudioManager } from './audio';
import { cycleVolume } from './audioMap';
import type { MusicPhase } from './audioMap';
import {
  nextTimeScale, scaledDt, skipWeekDt, flagEnabled,
} from './playability';
import { pickSelectedMuscle, type MuscleCandidate } from './dispatch';
import { orderVerbFor, type OrderTarget } from './orderRouting';
import {
  idleUnitIds, nextIdleId, bindGroup, recallGroup, pruneGroup, isCenterRecall, idsInScreenRect,
  type ControlGroups, type RecallTap,
} from './selectionControl';
import {
  type UnitOrder, type OrderUnit, holdOrder, attackMoveOrder, resolveAutoOrder,
  ATTACK_MOVE_ACQUIRE_RADIUS,
} from './combatOrders';
import { applyDevDebug, isDevBuild, parseScenario, applyScenario } from './devDebug';
import { formatPreviewLines, type PreviewPalette } from './operationPreview';
import { initRestartGate, armRestart, confirmRestart, cancelRestart, type RestartGate } from './restartGate';
import { healthFraction, shouldShowHealthBar, isCritical, showTargetReticle } from './combatReadout';
import { initPause, togglePause as togglePauseState, setPaused as setPausedState, type PauseState } from './pauseGate';
import {
  listSaveSlots, writeSaveSlot, readSaveSlot, deleteSaveSlot, quickSave, quickLoad,
  exportSaveFile, importSaveFile, autoSave, LOADED_STATE_KEY, type SlotInfo, type SaveView,
} from './saveStore';
// Lane G — the menu/settings shell.
import { loadSettings, clampUiScale, type Settings } from './settings';
import { resolveKeybinds, normalizeKey, type KeyAction } from './keybinds';
import { SettingsPanel } from './settingsPanel';
import { fitOverlayPanel } from './overlayLayout';
import { PauseOverlay } from './pauseOverlay';
import type { LoadResult } from '../sim';
// COMBAT DEPTH · PART 2 + FINALIZE — the rival offensive planner (conservative; ⚠ needs a human balance
// playtest) + accuracy/telegraph/retreat helpers (all pure).
import {
  planRivalOffense, committedForce, planTelegraph, shouldRetreat, unitCombatStrength,
  RIVAL_OFFENSE_TUNING, type RivalOffenseInput, type RivalStrikeReason,
  // FAIRNESS slice — telegraph visibility tiers (player-side intel → graduated, NO-X-RAY warning).
  telegraphTier, countFriendlyNear, buildTelegraphReport, type TelegraphTier,
  districtStatusOf,
} from '../sim';
// LANE D — earned-intel/dossier: the PURE intel model (imported directly from the module, not the barrel, to
// keep the lane file-isolated) + the one read-only HUD panel. NO-X-RAY: aged/learned data only, no live position.
import { createDossier, advanceIntel, type IntelDossier, type IntelObservation } from '../sim/intel';
import { DossierPanel } from './ui/dossierPanel';
// Lane — STATUS DASHBOARD: the at-a-glance threat/economy summary (pure view-model; rendered on the fixed HUD).
import { buildStatusDashboard, type DashboardTone } from './ui/statusDashboard';
import { districtStatus } from '../sim';
import { tipRegion } from './ui/tooltips'; // Lane — contextual HUD tooltips (feeds the existing one renderer)
// INFO-FEEDBACK slice — THE WIRE — LOG + screen-edge alerts + minimap (render/UI; reads sim state only).
import { metaFor, combatEventKind, extortionEventKind, captureEventKind, bribeEventKind, type EventKind, type EventTier } from './info/infoEvents';
import { initLog, pushLog, latestUnreadPositional, markRead, unreadCount, type LogStore } from './info/logStore';
import { edgeAlertMarker } from './info/edgeAlerts';
import {
  worldToMinimap, minimapToWorld, isInMinimap, cameraViewportRect, districtControlColor, minimapPlayerBlips, minimapRivalBlips,
  type MiniRect, type MiniUnit, type ControlStatus,
} from './info/minimapMath';
// HUD PHASE 1 — the one-drawer panel system + the dossier strip that REPLACE the always-on side stack.
import { PanelManager } from './hud/PanelManager';
import { type PanelId } from './hud/panelState';
import { buildDossierChips, dirtyPercent, type DossierChip } from './hud/dossierStrip';
import { AmbientLife } from './ambientLife';
import { rollToward, winLossCompass, cashRollRate, crisisPulse, panelReveal } from './fx';
// POLISH-PASS v2 — render-side feel/depth modules (math is pure + unit-tested; here we WIRE the numbers).
import { lampFalloff, wetSheenAlpha, ownershipWindowTint } from './noirLightingMath';
import { smokeCurve, smokeAllowed, dangerColor, MUZZLE_FLASH_MS, SMOKE_MS } from './vfx/vfxMotionCurves';
import {
  initHitStop, requestHitStop, worldFrozen, initNudge, requestNudge, nudgeOffset,
  type BeatSeverity, type HitStopState, type NudgeState,
} from './cameraFeel';
import {
  isOccluded, criticalVisualState, occlusionDisplay, occlusionTargetAlpha, xRayRim, type BuildingHull,
} from './render/isoOcclusion';
import {
  conductorIntensity, conductWithHysteresis, initConductor, isIntensityBed, type ConductorState,
} from './audio/conductorIntensity';
import {
  advanceGaitPhase, poseFor, locoTarget, easeLoco, rigLOD, WALK_STRIDE, RUN_STRIDE, computeIntimidateLean, FIGURE_PX, type RigPose,
} from './gait';
import { drawThugRig, drawRigDebug, PLAYER_RIG, RIVAL_RIG } from './rigDraw';
import { hottestChannel, type GreasePressure } from './greaseTargets';
import { drawThugFig2 } from './figureDraw2';
import { figurePlan, parseFigScale, FIG2_REFERENCE_PX } from './figureStyle';
// ?sprites — the OPT-IN 3D-rendered iso sprite-sheet view for the thug (procedural figure stays the
// authoritative fallback). Pure flag/state/facing math + Phaser loader/animator/view.
import { spritesRequested, spriteScaleParam, spriteDisplayScale } from './render/unitSpriteState';
import { preloadUnitSprites, registerUnitAnims, availableActions, THUG_SPRITE_CONFIG } from './render/unitSpriteLoader';
import { ensureUnitSprite, driveUnitSprite } from './render/unitSpriteView';
import { THUG_FACING_OFFSET } from './render/unitFacingQuantize';
import {
  rigAttackWeaponFromTier, sampleWeaponAttackPose, weaponAttackDurationMs, type RigAttackWeapon,
} from './weaponAttackPose';
import {
  attackCommitFromCombat, weaponFeedback, hitSfxKey, shouldEmitFeedback,
  type HitReactParams, type MuzzleFlashParams,
} from './weaponFeedback';
import {
  SPEC,
  MOTION,
  hexNum,
  satchelTier,
  dangerStageColor,
  federalBarColor,
  loyaltyMotion,
} from './visualSpec';
import {
  combatVfxForVerb,
  attackMotionForWeapon,
  corpseMemoryRole,
  outcomeDownedAMan,
  killNudgePx,
  type CombatVfx,
} from './feelMap';

const PAN_SPEED = 720;
const RUN_BOB_SPEED = 1.55; // RTS-30e: a unit moving faster than the STROLL gets the quicker RUN footfall
// RTS-22: a wider zoom range so the player can pull back to read the whole 9-district city or push
// in to drive individual thugs. Zoom is eased toward a target each frame for a smooth feel.
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.6;
const ZOOM_STEP = 0.12; // per wheel notch (fraction of current zoom)
const CLICK_SLOP = 6;

// Lane B — FTUE coach card geometry (one fixed-HUD mount, bottom-centred above the toolbar).
const TUTORIAL_CARD_W = 460;
const TUTORIAL_CARD_BOTTOM = 92; // gap above the bottom edge so it clears the toolbar row

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
// RTS-30c-scale: each prop carries a `scale` to restore real proportion against the ~56px unit (KEEP
// the unit, GROW the world). Targets at MID: lamppost ~150px (≈2.5–3× the man), tree a tall canopy,
// parked-car roof ≈ the man's shoulder, hydrant/mailbox ~26px. Per-class so it re-tunes easily.
interface PropSpec { tex: string; ox: number; oy: number; dx: number; dy: number; dz: number; alpha: number; scale: number; }
const PROP_SPECS: Record<string, PropSpec> = {
  lamppost: { tex: TEX.lamppost, ox: 0.5, oy: 0.96, dx: 0, dy: 6, dz: 3, alpha: 0.92, scale: 3.1 }, // 48→~150px
  tree: { tex: TEX.tree, ox: 0.5, oy: 0.94, dx: 0, dy: 6, dz: 3, alpha: 0.95, scale: 2.6 },         // 34→~88px canopy
  hydrant: { tex: TEX.hydrant, ox: 0.5, oy: 0.92, dx: -14, dy: 6, dz: 2, alpha: 0.9, scale: 1.9 },  // 14→~26px
  mailbox: { tex: TEX.mailbox, ox: 0.5, oy: 0.92, dx: 14, dy: 6, dz: 2, alpha: 0.9, scale: 1.9 },
  bench: { tex: TEX.bench, ox: 0.5, oy: 0.85, dx: 0, dy: 4, dz: 2, alpha: 0.9, scale: 1.8 },
  car: { tex: TEX.car, ox: 0.5, oy: 0.72, dx: 0, dy: 2, dz: 4, alpha: 0.85, scale: 1.7 },            // roof ≈ shoulder
  fence: { tex: TEX.fence, ox: 0.5, oy: 0.82, dx: 0, dy: 4, dz: 1, alpha: 0.8, scale: 1.8 },
};
// RTS-30b-ui — a clickable toolbar button: the verb config + its live Phaser objects.
interface ToolbarButton {
  id: string;
  group: 'core' | 'offense' | 'build';
  icon: string;
  name: string;
  hotkey: string;
  run: () => void;       // exactly what the hotkey does
  tip: string;           // plain-English hover tooltip (what it does + how to use)
  label: Phaser.GameObjects.Text;
  state?: ToolbarVerbState; // last-rendered chip state (re-colour only on change)
}
// RTS-30c-2b — a contextual action-card chip slot (pooled): the deco icon + a hotkey tab + a hit zone.
interface ActionChipSlot {
  icon: Phaser.GameObjects.Image;
  tab: Phaser.GameObjects.Text;
  hit: Phaser.GameObjects.Rectangle;
  verb?: VerbId;
  enabled: boolean;
  reason: string;
}
const WAR_AMBER = 0xe8a53a; // RTS-30c-1 CONTESTED district wash (amber — neither brass nor rival-red)
const WAR_AMBER_HEX = '#e8a53a';
const SEAM = 0x15120e;  // dark lane / paving expansion seam
const CURB = 0x4a443a;  // light curb edge on a sidewalk
const PARK_TUFT = 0x3c4e36; // grass tuft fleck
const PLAZA_INLAY = 0x40392f; // plaza deco seam

// RTS-30a — the three discrete zoom stops (CLOSE / MID resting / FAR strategy).
const ZOOM_STOPS = [1.0, 0.6, 0.35] as const;

/** COMBAT DEPTH FINALIZE (Part C) — a rival's in-flight offensive: telegraphed (warning shown, lead counting
 * down before the muscle moves) then active (force committed, monitored for retreat). */
interface RivalStrike {
  phase: 'telegraphed' | 'active';
  kind: 'contestFront' | 'interceptUnit';
  gx: number;
  gy: number;
  fireAtMs: number;    // when the committed force actually moves (end of the telegraph lead)
  expireAtMs: number;  // commitment window end (set when it fires)
  unitIds: string[];   // the committed force (for survivor/loss tracking + retreat)
  initialCount: number;
  reason: RivalStrikeReason;
}

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
  // RTS-30e action-motion state: a per-unit idle phase (desync) + transient attack/hit one-shots.
  idleSeed?: number;
  attackUntil?: number; // time.now ms until the attack recoil/swing finishes
  attackStartedAt?: number;
  attackKind?: 'melee' | 'ranged';
  attackRigWeapon?: RigAttackWeapon;
  attackFaceRight?: boolean; // recoil direction (away from the target)
  hitUntil?: number; // time.now ms until the hit-react flinch finishes
  hitKnockbackPx?: number; // per-weapon shove distance for the flinch (default 3)
  hitDwellMs?: number; // per-weapon flinch dwell = base flinch + weapon stagger (default MOTION.hitFlinch)
  occA?: number; // POLISH v2 · PKG4 — eased occlusion alpha (1 visible → 0 hidden behind a building)
  hpBar?: Phaser.GameObjects.Graphics; // COMBAT READABILITY — the small over-unit health bar (lazy)
  // RTS-32 procedural rig (thug-role units only): the live-posed articulated figure + its gait clock.
  rig?: Phaser.GameObjects.Graphics;       // the posed silhouette (CLOSE/MID); undefined for un-rigged roles
  spriteSheet?: Phaser.GameObjects.Sprite; // ?sprites — the 3D-rendered iso atlas view (opt-in; thug only)
  rigDebug?: Phaser.GameObjects.Graphics;  // ?debugRig=1 joint/plant overlay
  rigText?: Phaser.GameObjects.Text;       // ?debugRig=1 phase + state readout
  gaitPhase?: number; // 0..1 — DISTANCE-driven gait clock (the anti-skate keystone)
  loco?: number;      // 0 idle → 1 walk → 2 run, eased for cross-fades
  lastSX?: number; lastSY?: number; // last world screen-pos, to measure per-frame ground distance
}

/** RTS-32 — which units get the procedural rig: a plain button-man (thug) of either faction. Weapon
 * enforcers + collectors keep their baked silhouettes this slice (the rig is structured to adopt them
 * later — same gait clock, their own prop layer). */
function isRiggedUnit(unit: MovableUnit): boolean {
  return !unit.weapon && unit.role !== 'collector';
}

interface BizMarker { coin: Phaser.GameObjects.Image; glow?: Phaser.GameObjects.Image; roofX: number; roofY: number; }

/** RTS-35b — render cadence for the menacing shoves a thug throws WHILE shaking a front down (ms). */
const EXTORT_SHOVE_INTERVAL_MS = 950;

/** RTS-30e — a deterministic 0..1000 phase offset from a unit id, so idle breaths/sways desync across
 * the crew without per-frame randomness (motion stays deterministic + replay-safe). */
function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100000;
  return h;
}

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
  private uiCam?: Phaser.Cameras.Scene2D.Camera; // RTS-30a fixed HUD camera (zooms ONLY by the user UI-scale)
  // Floor polish — USER UI-SCALE. The HUD renders on uiCam at this zoom (top-left anchored, origin 0,0); the
  // HUD lays out + hit-tests in LOGICAL coords (real screen ÷ uiScaleFactor) so it always fills the screen and
  // stays clickable. 1 = native. The world/main camera + sim are never touched.
  private uiScaleFactor = 1;
  private scoutCue?: { card: Phaser.GameObjects.Text; outline: Phaser.GameObjects.Graphics }; // RTS-30a.1 fly-to cue
  // RTS-30b-ground: static set-dressing props (baked-once Images). `dressingDark` is the monotonically
  // shrinking list still under fog; `dressingFar` tracks the FAR-LOD bulk-hide threshold.
  private dressing: { img: Phaser.GameObjects.Image; gx: number; gy: number }[] = [];
  private dressingDark: { img: Phaser.GameObjects.Image; gx: number; gy: number }[] = [];
  private dressingFar = false;
  private lastFogSize = -1; // gate the prop-reveal scan: only run when the fog actually grew
  private ambient?: AmbientLife; // RTS-30 living-city Pass 1: pooled ambient pedestrians + cars
  private units: UnitView[] = [];
  private bizMarkers = new Map<string, BizMarker>();
  private bizPlates = new Map<string, Phaser.GameObjects.Polygon>(); // RTS-22 allegiance plate per business
  // POLISH v2 · PKG1 — per-building OWNERSHIP WINDOW glow (tinted per frame by the building's DISTRICT
  // holder — CANON: district control only, never a per-building owner), + the static biz→district map.
  private bizOwnerGlow = new Map<string, Phaser.GameObjects.Image>();
  private bizDistrict = new Map<string, string>();
  // CITY VISUAL DEPTH (Lane C) — each district's stable visual IDENTITY (archetype + warm accent + plaza
  // landmark), assigned by district ordinal once in drawCity and read by both the building draw (a faint
  // facade accent) and the plaza-landmark draw. World-render only — no sim, no HUD.
  private districtIdentity = new Map<string, DistrictIdentity>();
  // POLISH v2 · PKG4 — static building occlusion hulls (buildings don't move; computed once in drawCity).
  private buildingHulls: BuildingHull[] = [];
  private occEnabled = true; // independently toggleable
  // COMBAT READABILITY (4) — persistent downed-body sprites, keyed by the downed unit's id.
  private downedBodyViews = new Map<string, Phaser.GameObjects.Image>();
  // BEAT-COP P0 — one small NEUTRAL marker per cop (never faction-coloured, never interactive), keyed
  // by cop id; plus the ?debugCops=1 patrol-edge overlay.
  private copViews = new Map<string, Phaser.GameObjects.Graphics>();
  private copDebugGfx?: Phaser.GameObjects.Graphics;
  // POLISH v2 · PKG3 — camera FEEL state (the "clunk"): a hit-stop that freezes WORLD visual time + a
  // decaying-sine screen-nudge on the WORLD camera. The fixed HUD camera is never touched.
  private hitStop: HitStopState = initHitStop();
  private nudge: NudgeState = initNudge();
  private appliedNudgeX = 0;
  private appliedNudgeY = 0;
  private feelEnabled = true; // independently toggleable
  // POLISH v2 · PKG5 — the audio conductor's intensity-driven bed state (requested via the RTS-31 path).
  private conductor: ConductorState = initConductor('ESTABLISH');
  private lastCombatMs = Number.NEGATIVE_INFINITY; // when unit combat last fired (the activeCombat signal)
  private lastWireRoutineMs = Number.NEGATIVE_INFINITY; // throttle the routine Wire soft-tick (no incident-burst rattle)
  private audioConductEnabled = true; // independently toggleable
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
  private compassText?: Phaser.GameObjects.Text; // RTS-34 win/loss compass (hero line of the right rail)
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
  // BALANCE — click-to-grease targets: each FOUR-CHANNELS row is a clickable region that greases THAT channel
  // (rebuilt each frame in drawChannels). Lets the player choose who to grease instead of the old blind cycle.
  private channelHitRegions: { ch: BribeChannel; x: number; y: number; w: number; h: number }[] = [];
  private lastHeat = 0;
  private lastPhase = '';
  private wireFlashUntil = 0;
  private lastIncidentSeq = -1;
  private lastSeenWireSeq = -1; // §4: incidents past this seq are "unread"
  private selection: Selection = emptySelection();
  private controlGroups: ControlGroups = {}; // QoL: Ctrl+1-9 bind / 1-9 recall numbered groups
  private lastRecall?: RecallTap;            // last group recall (for the double-tap-centres gesture)
  private pressX = 0;
  private pressY = 0;
  private lastTrailAt = 0;
  private robbedCollectors = new Set<string>();

  // HUD objects
  private statusText?: Phaser.GameObjects.Text;
  private warningBanner?: Phaser.GameObjects.Text;
  private feedTitle?: Phaser.GameObjects.Text;
  private feedLines: Phaser.GameObjects.Text[] = [];
  private feedVisible = true;
  // HUD PHASE 1 — the panel system + dossier strip that COLLAPSE the always-on side stack. `hudCollapsed`
  // retires the legacy side panels (feed dock / channels / route pill / control / crew) so the city viewport
  // dominates; their summaries live in the strip and their detail in the on-demand drawers (scaffolds now).
  private panels?: PanelManager;
  private hudCollapsed = true;
  private dossierG?: Phaser.GameObjects.Container;
  private dossierHits: { x: number; y: number; w: number; h: number; id: PanelId }[] = [];
  // LANE D — earned-intel/dossier: the built-over-time dossier (pure) + its one read-only HUD panel. The
  // dossier ages by sim tick; advanceIntel runs once per settlement (gated by lastIntelTick).
  private intel: IntelDossier = createDossier();
  private dossierPanel?: DossierPanel;
  private lastIntelTick = -1;
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
  // Lane B — the FTUE coach card (one HUD mount). Its frame + the three text rows live in this container;
  // `tutorialProgress` is the only non-derived bit (did the player SKIP). `tutorialShowing` lets the top
  // objective banner stand down while the richer coach card is up, so the early loop isn't double-coached.
  private tutorialCardC?: Phaser.GameObjects.Container;
  private tutorialFrame?: Phaser.GameObjects.Graphics;
  private tutorialStepText?: Phaser.GameObjects.Text;
  private tutorialTitle?: Phaser.GameObjects.Text;
  private tutorialBody?: Phaser.GameObjects.Text;
  private tutorialAction?: Phaser.GameObjects.Text;
  private tutorialSkipHint?: Phaser.GameObjects.Text;
  private tutorialProgress: TutorialProgress = { skipped: false };
  private tutorialShowing = false;
  private tutorialDoneFired = false;
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
  private rushUsed = false; // RTS-34.1: once the player uses [C] RUSH, the collect tutorial prompt retires
  private audioPanelOpen = false;
  private audioPanel?: Phaser.GameObjects.Text;
  // FOOTGUN FIX — restart-to-Boot now requires explicit confirmation (the gate state + its modal).
  private restartGate: RestartGate = initRestartGate();
  private restartPrompt?: Phaser.GameObjects.Container;
  // RTS-28 playability
  private timeScale = 1;            // fast-forward multiplier (1× / 2× / 4×)
  private pause: PauseState = initPause(); // GLOBAL ACTIVE-PAUSE — halts the sim tick; camera/UI stay live
  private pausedBanner?: Phaser.GameObjects.Container; // the PAUSED indicator
  // Lane G — the menu/settings shell. Settings are loaded at construct so the lighting/shake/keybind flags
  // are ready before create()'s draw + input wiring runs; volumes apply after the AudioManager exists.
  private shellSettings: Settings = loadSettings();
  private keybinds: Record<KeyAction, string> = resolveKeybinds(this.shellSettings.keybinds);
  private shakeScale = this.shellSettings.screenShake ? 1 : 0; // CANON: scales camera-shake AMPLITUDE only
  private lightingHigh = this.shellSettings.lighting === 'high';
  private settingsPanel?: SettingsPanel;
  private pauseMenu?: PauseOverlay;
  private saveMenu?: Phaser.GameObjects.Container;     // SAVE/LOAD menu (fixed HUD camera)
  private saveButton?: Phaser.GameObjects.Text;        // the HUD entry point
  // INFO-FEEDBACK — SESSION-ONLY event log (#6), live edge alerts, minimap pings (all render-side).
  private wireLog: LogStore = initLog();
  private alerts: { id: number; gx: number; gy: number; tier: EventTier; until: number }[] = [];
  private pings: { gx: number; gy: number; tier: EventTier; until: number }[] = [];
  private wireLogG?: Phaser.GameObjects.Container;
  private wireLogHits: { x: number; y: number; w: number; h: number; gx?: number; gy?: number; id: number }[] = [];
  // Lane — CONSIGLIERE: the advisor's current top suggestion + its HUD surface (recomputed on a throttle so
  // it never flickers frame-to-frame). Reads THE WIRE (above) + a player-knowable snapshot; NO-X-RAY safe.
  private advisorG?: Phaser.GameObjects.Container;
  private advisorTop?: Suggestion | null;
  private advisorNextMs = 0;
  // Lane — STATUS DASHBOARD: the at-a-glance threat/economy strip (one fixed-HUD mount, throttled redraw).
  private statusDashG?: Phaser.GameObjects.Container;
  private statusDashNextMs = 0;
  // Floor polish — TARGET RETICLE/NAME: a subtle marker on the unit a selected fighter is engaging. One
  // shared ring-graphics + a small pooled set of name labels, on the fixed HUD camera. NO-X-RAY: only ever
  // drawn over a target already visible (revealed + on-screen).
  private reticleG?: Phaser.GameObjects.Graphics;
  private reticleNames: Phaser.GameObjects.Text[] = [];
  private edgeAlertG?: Phaser.GameObjects.Graphics;
  private edgeAlertHits: { x: number; y: number; r: number; gx: number; gy: number; id: number }[] = [];
  private minimapG?: Phaser.GameObjects.Graphics;
  private minimapRect: MiniRect = { x: 0, y: 0, w: 176, h: 176 };
  // COMBAT DEPTH · PART 2 — rival-offense cadence + per-rival cooldown/commitment state (scene-side; the
  // planner stays pure). ⚠ CONSERVATIVE — biased timid; needs a human balance playtest before any increase.
  private rivalOffenseAcc = 0;
  private rivalLastOffenseSec = new Map<string, number>();
  // COMBAT DEPTH FINALIZE (Part C) — one in-flight strike per rival: telegraphed (warning shown, lead
  // counting down) then active (force dispatched, monitored for retreat). Holds the rival's commitment slot.
  private rivalStrikes = new Map<string, RivalStrike>();
  private skipWeekPending = false;  // consume on the next update to jump to the next week boundary
  private ffButton?: Phaser.GameObjects.Text;   // on-screen fast-forward control
  private skipButton?: Phaser.GameObjects.Text; // on-screen skip-week control
  // RTS-29: the Market is OFF by default now (its dock tab is freed for the CONTROL readout); opt back
  // in only with ?market=on. The market code stays dormant behind the flag (not ripped out).
  private marketEnabled = (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('market') : null) === 'on';
  // RTS-30a.1: ?reveal=1 lifts the fog over the whole map so the sparse city is inspectable (debug-only;
  // normal play keeps the fog). Parsed by the pure revealAllRequested helper.
  private debugRevealAll = typeof window !== 'undefined' && revealAllRequested(window.location?.search ?? '');
  // RTS-32: ?debugRig=1 overlays joint + foot-PLANT dots + the gaitPhase/state readout on rigged units
  // (debug colours only — off in normal play) so the articulated walk is verifiable at a glance.
  private debugRig = (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('debugRig') : null) === '1';
  // BEAT-COP P0 (?cops=1): the law-patrol MARKER layer — 2-3 neutral beat cops random-walking the
  // sidewalk graph, observation-only. OFF by default (reversible opt-in, ?facadekit-style) so normal
  // play is untouched; ?debugCops=1 adds each cop's current patrol edge for QA.
  private copsEnabled = typeof window !== 'undefined' && copsRequested(window.location?.search ?? '');
  private debugCops = typeof window !== 'undefined' && debugCopsRequested(window.location?.search ?? '');
  // RTS-34 — the noir MOOD layer (film grain + soft vignette). Cheap full-screen overlay on the FIXED
  // UI camera (no drift on zoom/pan); ?fx=off disables it (and [0]-style toggle). Soot/ink only — never red.
  private fxEnabled = flagEnabled(typeof window !== 'undefined' ? (window.location?.search ?? '') : '', 'fx');
  // ?sprites — opt-in 3D iso atlas swap (default OFF). spriteSheetReady gates it on the sheets loading.
  private spritesEnabled = spritesRequested(typeof window !== 'undefined' ? (window.location?.search ?? '') : '');
  private spriteScaleMul = spriteScaleParam(typeof window !== 'undefined' ? (window.location?.search ?? '') : '');
  private spriteSheetReady = false;
  private spriteScale = 0.25; // display scale (manifest figurePxH → FIGURE_PX), recomputed in create()
  private spriteActions: ReadonlySet<string> = new Set(); // which clips actually rendered (drives fallback)
  private grain?: Phaser.GameObjects.TileSprite;
  // FIGURE-STYLE v2 (?fig2 A/B proof — THUG): swap the default thug rig for the upgraded iconic noir
  // silhouette (figureDraw2). OFF by default — nothing changes unless flagged. ?figscale=N (dev knob, ~56/
  // 72/80) uniformly scales the figure for K's eyeball read; faction stays on the plate, NO-X-RAY unchanged.
  private fig2 = flagEnabled(typeof window !== 'undefined' ? (window.location?.search ?? '') : '', 'fig2');
  private figScale = parseFigScale(typeof window !== 'undefined' ? (window.location?.search ?? '') : '');
  private vignette?: Phaser.GameObjects.Graphics;
  private shownCash = 0; private shownNet = 0; private cashInit = false; // RTS-34 top-bar count-up state
  private focusBizId?: string;      // a left-clicked building (RTS-28 building selection)
  // OPERATION-OUTCOME PREVIEWS — a read-only, hover-driven projection card for the four player verbs. The
  // pure selectors compute it; this scene only resolves the cursor target, holds the result, and draws it.
  private opPreview?: OpPreview;                    // the live preview under the cursor (undefined = nothing to show)
  private opPreviewG?: Phaser.GameObjects.Container; // the GLANCE/DETAIL card (fixed-camera HUD overlay)
  private opAltHeld = false;                        // HOLD-ALT expands the glance card to its detail rows
  private opCursor = { x: 0, y: 0 };                // last hover screen pos (to place the card)
  private actionTitle?: Phaser.GameObjects.Text; // RTS-28 ACTION BOARD (retired by the rts30b-ui toolbar)
  private actionBody?: Phaser.GameObjects.Text;
  // RTS-30b-ui — the clickable hotkey TOOLBAR: every key verb as a mouse-clickable button with its
  // icon + name + hotkey + READY/CONDITIONAL/LOCKED chip. Replaces the text ACTIONS board.
  private toolbarBtns: ToolbarButton[] = [];
  private toolbarTip?: Phaser.GameObjects.Text;
  private toolbarClick = false; // a toolbar press swallows the next world-click (no deselect)
  // RTS-30c-2b — the contextual action-icon CARD (a pool of clickable deco-glyph chips for the selected unit).
  private actionChips: ActionChipSlot[] = [];
  private actionTip?: Phaser.GameObjects.Text;
  private collectorInfo?: Phaser.GameObjects.Text; // RTS-30d-2 read-only collector popover (no control)
  private collectorInfoId?: string;
  private marqueeGfx?: Phaser.GameObjects.Graphics; // RTS-30d-3 drag-box selection marquee (fixed UI cam)
  private marqueeActive = false;
  // COMBAT CONTROL VERBS (input-only) — per-unit STOP/HOLD/ATTACK-MOVE stance, kept RENDER-SIDE (the sim
  // MovableUnit type is untouched). Absent id ⇒ NORMAL. attackMovePending arms [A]: the next left-click
  // sets the attack-move destination instead of box-selecting. The stances drive the EXISTING issueMove/
  // stopUnit + 35a auto-engage each tick (applyUnitOrders) — no new sim mechanic.
  private unitOrders = new Map<string, UnitOrder>();
  private attackMovePending = false;
  private selCountText?: Phaser.GameObjects.Text; // RTS-30d-3 "N selected" readout (fixed UI cam)
  // RTS-29 reshape — fog of war, the CONTROL readout, fixed per-business collectors, extort-visits.
  private fog: FogState = createFog();
  private loadedFog?: string[]; // LANE F — saved fog to restore on a load (else fog is recomputed)
  private lastAutosaveTick = -1; // LANE F — autosave cadence gate
  private controlTitle?: Phaser.GameObjects.Text;
  private controlBody?: Phaser.GameObjects.Text;
  private cityRowHits: { x: number; y: number; w: number; h: number; districtId: string }[] = [];
  // RTS-35b — EMBODIED EXTORTION (CANON REV c): a thug is ordered to MOVE-AND-SHAKEDOWN — it walks to the
  // front and performs a TIMED shakedown while physically present (no converting from a distance). The pure
  // acts live on state.extortionActs; this overlay graphic draws the brass intent line + progress ring, and
  // the per-thug shove cadence times the menacing shoves during the shakedown.
  private extortOverlay?: Phaser.GameObjects.Graphics;
  private extortShoveAt = new Map<string, number>(); // thugId → time.now ms of its next shakedown shove
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
    // ?sprites — queue the thug iso sheets + manifest (missing → graceful no-op, procedural stays up).
    if (this.spritesEnabled) preloadUnitSprites(this, THUG_SPRITE_CONFIG);
  }

  /** RESTART TEARDOWN — scene.restart() (F9/menu quickload, slot/file load, endgame restart) destroys
   * every display object and re-runs create(), but does NOT re-run the constructor: instance fields that
   * cache GameObject handles survive holding corpses. The create-time builders then APPEND fresh objects
   * next to the stale ones, and the first update() frame re-drives a destroyed handle — with ?sprites on,
   * updateUnits hits the old UnitView.spriteSheet (`sprite.anims.getName()` on undefined `.anims`); with
   * ?sprites off, refreshHud hits the old topCells Texts (`setText` on a null frame). That was the F9
   * quickload crash. Drop EVERY retained display cache here, first thing in create(), before any builder
   * runs. The objects themselves were already destroyed by the shutdown — dropping the handles is all
   * that's needed, and on first boot everything is already empty so this is a no-op. */
  private resetRestartCaches(): void {
    // unit views (addUnit appends; updateUnits drives every entry each frame) — Signature α.
    this.units = [];
    // drawHud() appenders (refreshHud/refreshChannels/refreshFeed/refreshCrew iterate these) — Signature β.
    this.topCells = [];
    this.channelRows = [];
    this.feedLines = [];
    this.crewRows = [];
    this.crewWrong = [];
    this.toolbarBtns = [];
    this.actionChips = [];
    // drawCity()/drawSetDressing() appenders + keyed building/marker views.
    this.buildingHulls = [];
    this.dressing = [];
    this.dressingDark = [];
    this.bizMarkers.clear();
    this.bizPlates.clear();
    this.bizOwnerGlow.clear();
    this.bizDistrict.clear();
    this.bizBuildings.clear();
    this.districtLabels.clear();
    this.downedBodyViews.clear();
    this.copViews.clear(); // BEAT-COP P0 — marker pool; cop ids are stable, so corpses would pin forever
    // lazily-created (get-or-create) display singletons — undefined makes each creator rebuild a live one
    // instead of silently reusing a corpse (the copViews lesson, applied to every sibling).
    this.copDebugGfx = undefined; // BEAT-COP P0 — the ?debugCops=1 overlay
    this.marqueeGfx = undefined;
    this.selCountText = undefined;
    this.collectorInfo = undefined;
    this.extortOverlay = undefined;
    this.minimapG = undefined;
    this.edgeAlertG = undefined;
    this.wireLogG = undefined;
    this.advisorG = undefined;
    this.statusDashG = undefined;
    this.reticleG = undefined;
    this.opPreviewG = undefined;
    this.reticleNames = [];
    this.ctxMenu = undefined;
    this.ctxRect = undefined;
    this.ctxRows = [];
    // the old fixed HUD camera died with the shutdown — worldFx() must not register objects against its
    // corpse during create; setupUiCamera() builds the new one and re-splits the whole display list.
    this.uiCam = undefined;
    // retained per-run FLAGS that must not leak across a load/restart: a stale endgameShown hijacks ESC
    // (exitEndgame) and suppresses the next real endgame; stale alerts pin Infinity-lived edge markers at
    // pre-load coords; cashInit=false re-seeds the top-bar count-up to the loaded totals (no ghost roll);
    // lastFogSize forces one prop-reveal rescan against the restored fog; robbedCollectors/lastAutosaveTick
    // are pre-load run state.
    this.endgameShown = false;
    this.alerts = [];
    this.pings = [];
    this.cashInit = false;
    this.lastFogSize = -1;
    this.robbedCollectors = new Set<string>();
    this.lastAutosaveTick = -1;
  }

  create(): void {
    // Quickload/restart lifecycle — drop stale display-object handles BEFORE any builder appends (see
    // resetRestartCaches above; this is what makes F9 quickload survive scene.restart()).
    this.resetRestartCaches();
    // Floor polish — adopt the persisted UI-scale BEFORE any HUD is built, so every create-time hudW()/hudH()
    // lays out in the correct logical space (setupUiCamera then applies the matching uiCam zoom).
    this.uiScaleFactor = clampUiScale(this.shellSettings.uiScale);
    buildCityTextures(this);
    const cam = this.cameras.main;
    cam.setBackgroundColor(PAL.soot);

    // ?sprites — register the 3D iso atlas anims now the sheets have loaded. If the manifest/sheets are
    // missing (404), spriteSheetReady stays false and the procedural figure remains authoritative.
    if (this.spritesEnabled) {
      const manifest = registerUnitAnims(this, THUG_SPRITE_CONFIG);
      if (manifest) {
        this.spriteSheetReady = true;
        this.spriteScale = spriteDisplayScale(manifest.figurePxH, FIGURE_PX, this.spriteScaleMul);
        this.spriteActions = availableActions(this, THUG_SPRITE_CONFIG); // clips that actually rendered (idle/walk/…)
      }
    }

    // RTS-11: start with a small loyal crew so the opening is fair (muscle + defense).
    // RTS-12/16: a fair opening (loyal crew + one protected run) on the BIG contested city —
    // a 9-district turf war against two active rival families.
    // SAVE/LOAD — if a save was loaded, restart() left the deserialized state in the registry; adopt it (a
    // full clean re-init of every view layer from the saved tree) instead of starting a fresh game.
    const loaded = this.registry.get(LOADED_STATE_KEY) as GameState | undefined;
    const loadedView = this.registry.get('lcr_loaded_view') as SaveView | undefined;
    if (loaded) {
      this.registry.remove(LOADED_STATE_KEY);
      this.registry.remove('lcr_loaded_view');
      this.state = loaded;
      this.loadedFog = loadedView?.fog; // LANE F — restore saved fog at the fog-seed step (NO-X-RAY)
    } else {
      this.state = createInitialState(1, { startingCrew: true, tutorialFreeRuns: 1, bigCity: true });
      // RTS-29: rivals stay DORMANT (no territorial contact) for the first weeks — the peaceful runway.
      this.state.rivalWakeWeek = RIVAL_DORMANT_WEEKS;
      this.applyDebugScenario();
    }
    // RTS-30a: the SPARSE LARGER world — buildings placed apart with setbacks across a 96² map,
    // partitioned into districts. WorldLayout extends MapLayout, so collectors/routes consume it
    // unchanged. The ground/streets/parks are CULLED to the viewport (drawGround), not 4096 Images.
    this.world = generateWorld(this.state, { size: WORLD_SIZE });
    this.layout = this.world;
    this.navGrid = makeGrid(WORLD_SIZE, WORLD_SIZE); // walkable everywhere (buildings aren't blockers)
    this.groundGfx = this.add.graphics().setDepth(0);

    this.drawCity();
    this.drawSetDressing(); // RTS-30b-ground: faction-neutral static props on the open tiles
    // RTS-30 living-city Pass 1: pooled ambient pedestrians + cars on the sidewalk/road graphs. Caps are
    // the single "city liveliness" dial (?life=low|med|high, default med). Built BEFORE setupUiCamera so
    // its pre-allocated sprites land in the world-camera partition (ignored by the fixed HUD camera).
    const caps = LIVELINESS_CAPS[parseLiveliness(typeof window !== 'undefined' ? (window.location?.search ?? '') : '')];
    this.ambient = new AmbientLife(this, this.world, caps, this.state.seed);
    // BEAT-COP P0 — the cop view caches are dropped in resetRestartCaches() with every other
    // restart-surviving display handle (the #65 teardown owns that lifecycle now).
    // Pin the patrol substrate to THIS create/load epoch's RENDERED layout (business churn between
    // save and load re-rolls parcels, so primePatrolWorld also heals any saved cop coords that fell
    // off the regenerated sidewalk graph). Then spawn ONLY behind ?cops=1 (a loaded save that already
    // carries cops keeps them). Cop draws use the separate lawRngState cursor; state.rngState is
    // never touched, so flagged and unflagged runs of the same seed play out identically elsewhere.
    if (this.copsEnabled || this.state.beatCops?.length) {
      primePatrolWorld(this.state, this.world);
      if (this.copsEnabled && !this.state.beatCops?.length) spawnBeatCops(this.state);
    }
    this.spawnUnits();
    // RTS-30a: the fog veil is rendered CULLED inside drawGround (per visible tile); here we just seed
    // the opening pocket around the HQ + starting units into the revealed set.
    // LANE F — on a load, restore the fog EXACTLY as saved (explored stays explored; hidden rivals stay
    // hidden). Otherwise seed fresh fog around the player. Play then continues to reveal as normal.
    if (this.loadedFog) { this.fog = new Set(this.loadedFog); this.loadedFog = undefined; }
    else this.seedFogAroundPlayer();

    // RTS-22: frame the player's home neighbourhood (where the extort-first opening happens), zoomed
    // out enough to read the block. The camera is fully driveable (WASD / drag / wheel / F-follow).
    this.routeGfx = this.add.graphics().setDepth(7);
    // RTS-30a: clamp the camera to the WORLD bounds (no black void), and OPEN framed on the player's
    // HQ DISTRICT at MID zoom — the calm, readable home base. The rest is under fog.
    this.setWorldCameraBounds();
    // RTS-31: frame the player's SEAT (HQ) — where the starting crew now spawns — so the opening view
    // always contains the crew + HQ. (Falls back to the home plaza if the HQ tile is somehow absent.)
    const home = this.world.districts[0];
    const seat = hqTileOf(this.layout, 'player') ?? home.plaza;
    const c = gridToScreen(seat.gx, seat.gy);
    cam.centerOn(c.x, c.y - 20);
    this.targetZoom = ZOOM_STOPS[1]; // MID = the resting view
    cam.setZoom(this.targetZoom);

    this.setupCameraControls();
    this.setupSelectionInput();
    this.setupHoverTooltip();
    this.drawHud();
    this.buildObjective();
    this.buildTutorialCard(); // Lane B — the skippable FTUE coach card (one HUD mount)
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
    // LANE D — earned-intel dossier: the ONE HUD mount. Read-only panel on the FIXED HUD camera (sacred);
    // hudFx makes the WORLD camera ignore it. Toggled with backtick (see setupCameraControls).
    this.dossierPanel = new DossierPanel(this);
    this.hudFx(this.dossierPanel.root);
    // RTS-34: the noir mood overlay (grain + vignette) on the fixed UI camera, below every HUD element.
    this.buildFxOverlay();
    this.buildSaveButton(); // SAVE/LOAD entry point (fixed HUD camera)
    this.buildShellOverlays(); // Lane G — pause overlay + settings panel (fixed HUD camera), + apply volumes
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
    this.objTitle = this.mkText(this.hudW() / 2, 12, '', { fontFamily: NOIR_DISPLAY, fontSize: '18px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100000);
    this.objDetail = this.mkText(this.hudW() / 2, 34, '', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.bone, align: 'center', wordWrap: { width: 560 } }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100000);
  }

  private refreshObjective(): void {
    if (!this.objTitle || !this.objDetail || !this.highlight || !this.routeWarn) return;
    const o = firstObjective(this.state);
    const cx = this.hudW() / 2;
    const pulse = 1 + 0.12 * Math.sin(this.time.now / 180);
    let detail = o.detail;
    this.highlight.setVisible(false);
    this.routeWarn.setVisible(false);

    // RTS-34.1 — once the player has used [C] RUSH, the collect tutorial has done its job: retire the
    // banner (collectors are autonomous — they run themselves) so it stops re-nagging each week.
    if (o.step === 'collect' && this.rushUsed) {
      this.objTitle.setVisible(false);
      this.objDetail.setVisible(false);
      return;
    }
    this.objTitle.setVisible(true);
    this.objDetail.setVisible(true);

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
    // Lane B — while the FTUE coach card is up it teaches this same early beat (richer, skippable, with
    // progress dots), so stand the top banner down to avoid double-coaching. The world spotlight ring set
    // above STAYS — it points at the extort target the coach card references. The banner resumes the moment
    // the tutorial is skipped or graduates (grease onward), guiding the mid/late game as before.
    if (this.tutorialShowing) {
      this.objTitle.setVisible(false);
      this.objDetail.setVisible(false);
      return;
    }
    this.setTC(this.objTitle, `▶  ${o.title}`, o.done ? NOIR_PALETTE.fog : NOIR_PALETTE.brass).setPosition(cx, 62);
    this.setT(this.objDetail, detail).setPosition(cx, 82);
  }

  // ── Lane B — the first-time-user tutorial (FTUE) coach card ───────────────────────────────
  // ONE fixed-HUD mount: a bottom-centre coach card that walks a new player through the core loop
  // (extort → collect → protect → grow) one beat at a time, skippable. The card content is a PURE
  // derivation of game state (sim/onboarding.tutorialCard) — it advances itself as the player acts.

  private buildTutorialCard(): void {
    const D = 100000; // same band as the objective banner; the FX overlay (200000) still sits above
    this.tutorialFrame = this.add.graphics();
    this.tutorialStepText = this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '11px', color: NOIR_PALETTE.fog, fontStyle: 'bold' }).setOrigin(0, 0);
    this.tutorialTitle = this.mkText(0, 0, '', { fontFamily: NOIR_DISPLAY, fontSize: '18px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(0, 0);
    this.tutorialBody = this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, lineSpacing: 3, wordWrap: { width: TUTORIAL_CARD_W - 32 } }).setOrigin(0, 0);
    this.tutorialAction = this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.brass, fontStyle: 'bold', wordWrap: { width: TUTORIAL_CARD_W - 32 } }).setOrigin(0, 0);
    this.tutorialSkipHint = this.mkText(0, 0, 'SKIP TUTORIAL  [Esc]', { fontFamily: NOIR_FONT, fontSize: '11px', color: NOIR_PALETTE.fog }).setOrigin(1, 0);
    this.tutorialCardC = this.add.container(0, 0, [
      this.tutorialFrame, this.tutorialStepText, this.tutorialTitle, this.tutorialBody, this.tutorialAction, this.tutorialSkipHint,
    ]).setScrollFactor(0).setDepth(D).setVisible(false);
    this.hudFx(this.tutorialCardC); // fixed HUD camera only — the world camera must ignore it (never drift on zoom/pan)
  }

  private refreshTutorial(): void {
    const frame = this.tutorialFrame, stepT = this.tutorialStepText, titleT = this.tutorialTitle;
    const bodyT = this.tutorialBody, actionT = this.tutorialAction, skipT = this.tutorialSkipHint;
    const cont = this.tutorialCardC;
    if (!cont || !frame || !stepT || !titleT || !bodyT || !actionT || !skipT) { this.tutorialShowing = false; return; }
    const card = tutorialCard(this.state, this.tutorialProgress);

    // One-shot "tutorial complete" beat: the player worked all the way through the loop (not via SKIP).
    if (!card && !this.tutorialProgress.skipped && !this.tutorialDoneFired && tutorialComplete(this.state)) {
      this.tutorialDoneFired = true;
      this.setStatus('TUTORIAL COMPLETE — you’ve got the loop. The objective up top guides the rest.');
    }

    if (!card) {
      this.tutorialShowing = false;
      cont.setVisible(false);
      return;
    }
    this.tutorialShowing = true;

    // Layout: a bottom-centred card clear of the toolbar. Height grows to fit the wrapped body.
    this.setT(stepT, `TUTORIAL  ${'●'.repeat(card.index)}${'○'.repeat(card.total - card.index)}  STEP ${card.index} / ${card.total}`);
    this.setT(titleT, card.title);
    this.setT(bodyT, card.body);
    this.setT(actionT, `▶  ${card.action}`);

    const w = TUTORIAL_CARD_W;
    const pad = 16;
    const bodyH = bodyT.height;
    const actH = actionT.height;
    const h = pad + 16 + 24 + bodyH + 8 + actH + pad;
    const x = Math.round(this.hudW() / 2 - w / 2);
    const y = Math.round(this.hudH() - h - TUTORIAL_CARD_BOTTOM);

    frame.clear();
    frame.fillStyle(PAL.ink, 0.92).fillRect(x, y, w, h);
    this.decoFrame(frame, x, y, w, h, PAL.brass, 0.9);

    stepT.setPosition(x + pad, y + pad);
    skipT.setPosition(x + w - pad, y + pad);
    titleT.setPosition(x + pad, y + pad + 16);
    bodyT.setPosition(x + pad, y + pad + 16 + 24);
    actionT.setPosition(x + pad, y + pad + 16 + 24 + bodyH + 8);
    cont.setVisible(true);
  }

  /** SKIP — retire the coach card for the rest of the session (the [Esc] / world-click affordance). The
   * ongoing objective banner resumes immediately, so an experienced player loses the hand-holding, not the
   * guidance. Pure UI: nothing is written to the sim. */
  private skipTutorial(): void {
    if (this.tutorialProgress.skipped || !this.tutorialShowing) return;
    this.tutorialProgress = { skipped: true };
    this.tutorialShowing = false;
    this.tutorialCardC?.setVisible(false);
    this.setStatus('Tutorial skipped — press [H] anytime for the full controls.');
  }

  // ── the city ─────────────────────────────────────────────────────────────────────────────

  private drawCity(): void {
    // RTS-30a: the ground/streets/parks/plazas + fog are drawn CULLED per frame (drawGround) instead
    // of 4096 tile Images. Only the sparse buildings/plates/markers below are drawn-once objects.

    // businesses — brick storefronts; a protection coin floats over player-extorted fronts
    for (const d of this.state.districts) {
      // CITY DEPTH (Lane C): the district's stable identity (by ordinal) drives a faint per-building facade
      // accent + the plaza landmark. Computed once here so both reads agree.
      const ident = districtIdentityFor(this.state.districts.indexOf(d));
      this.districtIdentity.set(d.id, ident);
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
        const bstyle = BUILDING_STYLES[styleKey];
        // POLISH v2 · PKG4 — the static occlusion HULL (screen-space silhouette): footprint extent + the
        // scaled height. CANON: this affects ONLY occlusion/silhouette/draw-depth — never the unit anchor,
        // footprint, pathing, or sim position (all untouched).
        const bhw = bstyle.footHalfW ?? 54, bhh = bstyle.footHalfH ?? 27, bh = bstyle.height * ENV_HEIGHT_SCALE;
        this.buildingHulls.push({ cx: c.x, footY: c.y + bhh, roofY: c.y + bhh - bh, halfW: bhw, depth: bdepth });
        const roof = drawIsoBuilding(this, c.x, c.y, bstyle, bdepth, {
          lit: !isShutDown(biz),
          accent: facadeAccentFor(ident.accent, buildingVariantFor(hashKey(biz.id))), // Lane C — neighbourhood facade variety
        });
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
        // POLISH v2 · PKG1 — the ownership WINDOW glow: a faint warm/cooled wash on the facade that reads
        // who CONTROLS this block's district. Created once + fog-gated; tint/alpha set per frame from the
        // district holder. Sits just under the coin so the [$] marker still reads on top.
        const owner = this.add.image(roof.roofX, roof.roofY + 8, TEX.glow)
          .setDepth(depthValue(t.gx, t.gy) * 10 + 4).setScale(1.4, 1.9)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
        this.bizOwnerGlow.set(biz.id, owner);
        this.bizDistrict.set(biz.id, d.id);
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
      if (richArt()) this.add.image(c.x - 48, c.y + 22, fid === 'player' ? TEX.carPlayer : TEX.carRival).setOrigin(0.5, 0.7).setScale(1.7).setDepth(depthValue(hq.gx, hq.gy) * 10 + 4); // RTS-30c-scale: hero car to real proportion
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
        .setScale(spec.scale) // RTS-30c-scale: grow props to real proportion vs the ~56px unit
        .setAlpha(spec.alpha)
        .setDepth(depthValue(p.gx, p.gy) * 10 + spec.dz)
        .setVisible(false); // shown when its tile is fog-revealed (update)
      const rec = { img, gx: p.gx, gy: p.gy };
      this.dressing.push(rec);
      this.dressingDark.push(rec);
      // RTS-34: a warm AMBER light POOL on the wet asphalt under each lamppost (soft radial alpha,
      // additive → reads as gaslight catching the rain-slick street; never a bright white). It rides the
      // SAME fog-reveal / FAR-cull lifecycle as the prop (pushed into the dressing lists). Depth sits just
      // above the ground so units + the lamp draw OVER the pool.
      if (p.kind === 'lamppost' && this.fxEnabled) {
        // POLISH v2 · PKG1 — the RTS-34 "faint lamp" flag (~0.15) → a real warm pool seeded at the noir
        // peak (lampFalloff(0,R) = LAMP_SEED_ALPHA = 0.31). The baked TEX.glow already carries the soft
        // (1−r/R)² radial falloff, so the pool reads as gaslight catching the rain-slick street.
        const pool = this.add.image(c.x, c.y + 6, TEX.glow).setOrigin(0.5)
          .setScale(2.4, 1.25).setTint(PAL.lamp).setAlpha(lampFalloff(0, 1))
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(depthValue(p.gx, p.gy) * 10 + 1).setVisible(false);
        const poolRec = { img: pool, gx: p.gx, gy: p.gy };
        this.dressing.push(poolRec);
        this.dressingDark.push(poolRec);
        // POLISH v2 · PKG1 — a WET-ASPHALT SHEEN: a faint, longer, tinted streak smeared down-slope from
        // the pool (cheap additive image, NOT a real reflection). Gentler than the pool (wetSheenAlpha).
        // Lane G — the secondary sheen is the LIGHTING-QUALITY layer: 'low' drops it (the primary gaslight
        // pool stays, so the noir mood holds). Pure set-dressing — no gameplay/danger-red impact.
        if (this.lightingHigh) {
          const sheen = this.add.image(c.x, c.y + 16, TEX.glow).setOrigin(0.5, 0.2)
            .setScale(0.9, 2.6).setTint(PAL.lamp).setAlpha(wetSheenAlpha(0, 1))
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(depthValue(p.gx, p.gy) * 10 + 1).setVisible(false);
          const sheenRec = { img: sheen, gx: p.gx, gy: p.gy };
          this.dressing.push(sheenRec);
          this.dressingDark.push(sheenRec);
        }
      }
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
    // RTS-30c-1: CONTESTED districts wash AMBER with a ~1.6s pulse (the war reads on the map at a glance);
    // held = faint brass, rival-held = faint static blood-red.
    const warPulse = 0.5 + 0.5 * Math.sin(this.time.now / 255); // ~1.6s period
    for (const row of cityRoster(this.state)) {
      // RTS-30c-1.1: the CONTESTED wash is much stronger now (was 0.06–0.13, too faint — the HUD carried
      // the read) so the war reads on the MAP at the resting zoom; still soot-friendly amber, never
      // brass, never rival-red (red discipline held).
      if (row.status === 'CONTESTED') wash.set(row.id, { c: WAR_AMBER, a: 0.20 + 0.14 * warPulse });
      else if (row.status === 'HELD') wash.set(row.id, { c: hexNum(SPEC.brass), a: 0.05 });
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
    // LANDMARKS — each (revealed, in-view) district's plaza carries a civic landmark chosen by its IDENTITY
    // (fountain / statue / clocktower / obelisk). ~9 districts; only the visible ones draw — a handful of ops,
    // never per-tile. A slow calm shimmer (fountain water only); never the danger tempo.
    if (!far) {
      const shimmer = 0.5 + 0.5 * Math.sin(this.time.now / 900);
      for (const d of this.world.districts) {
        if (d.plaza.gx < minGx || d.plaza.gx > maxGx || d.plaza.gy < minGy || d.plaza.gy > maxGy) continue;
        if (!isRevealed(this.fog, d.plaza.gx, d.plaza.gy)) continue;
        const ident = this.districtIdentity.get(d.id) ?? districtIdentityFor(0);
        const c = gridToScreen(d.plaza.gx, d.plaza.gy);
        drawLandmark(g, ident.landmark, c.x, c.y, shimmer, ident.accent);
      }
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
    // RTS-31: spawn them BESIDE the player HQ (in the home district the opening camera frames) — they
    // used to spawn at the map corner (3,2)/(4,2), OFF the opening view AND a whole map away from the
    // first extort target, which made the opening crew invisible and the first shakedown a long slog.
    const hq = hqTileOf(this.layout, 'player');
    const sx = hq ? hq.gx : 3, sy = hq ? hq.gy + 1 : 2; // just south of the seat (HQ tile itself is a building)
    this.addUnit(spawnUnit('muscle-1', sx, sy, STROLL_SPEED), 'player');
    this.addUnit(spawnUnit('muscle-2', sx + 1, sy, STROLL_SPEED), 'player');
  }

  /** The nearest player collector currently carrying a take, if any (the rival's prey). */
  private playerCarrier(): MovableUnit | undefined {
    return this.state.units.find((u) => u.role === 'collector' && u.factionId === 'player' && (u.carrying ?? 0) > 0);
  }

  private addUnit(unit: MovableUnit, faction: 'player' | 'rival'): void {
    // ⭐ BUG FIX (the dead combat): spawnUnit() makes player muscle with NO factionId — but the 35a combat
    // only fights isCombatant() units, which REQUIRES a factionId. Without this, every player thug failed
    // isCombatant(), so resolveProximityCombat never engaged them (player↔rival) — the thug walked up to the
    // rival and nothing happened. Stamp the player's faction on the sim unit so it can actually FIGHT. (The
    // VIEW-layer faction the dispatch/selection seam reads is separate + unchanged; rival units already get
    // their factionId from spawnEnforcer. role stays undefined — isCombatant only needs !collector.)
    if (faction === 'player' && unit.factionId === undefined) unit.factionId = this.state.player.id;
    this.state.units.push(unit);
    this.attachView(unit, faction);
  }

  private attachView(unit: MovableUnit, faction: 'player' | 'rival'): void {
    const ringColor = faction === 'player' ? PAL.brass : PAL.blood;
    const shadow = this.add.ellipse(0, 0, 22, 11, PAL.soot, 0.5);
    const factionRing = this.add.ellipse(0, 0, 26, 13).setStrokeStyle(2, ringColor, 0.9);
    const selRing = this.add.ellipse(0, 0, 38, 20).setStrokeStyle(3, PAL.brass, 1).setVisible(false);
    // RTS-30c-2a: a weapon-tier enforcer renders its distinct silhouette (player brass; red discipline).
    const figKey = faction === 'player' && unit.weapon ? enforcerTexKey(unit.weapon) : figureKeyFor(unit.role, faction, 1);
    const sprite = this.add.image(0, 0, figKey).setOrigin(0.5, 0.93);
    const view: UnitView = { unit, faction, sprite, shadow, factionRing, selRing, idleSeed: hashSeed(unit.id) };
    // RTS-32: a plain button-man gets the live procedural rig (a reused Graphics, posed each frame). Its
    // gait clock starts desynced so a crew doesn't march in lock-step. Weapon/collector roles keep the
    // baked sprite this slice.
    if (isRiggedUnit(unit)) {
      view.rig = this.add.graphics();
      view.gaitPhase = (hashSeed(unit.id) % 1000) / 1000;
      view.loco = 0;
      if (this.debugRig) {
        view.rigDebug = this.add.graphics();
        view.rigText = this.add.text(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '9px', color: '#ff2bd0' }).setOrigin(0.5, 1);
        this.worldFx(view.rigDebug, view.rigText);
      }
      this.worldFx(view.rig);
    }
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

  // ── RTS-30c-1: TURF WAR (presence-based contest + collector interception switch-on) ────────────

  private districtName(id: string): string { return this.state.districts.find((d) => d.id === id)?.name ?? id; }

  // ── LANE D — earned-intel / dossier (read-only, NO-X-RAY) ─────────────────────────────────────────
  /** Toggle the read-only dossier panel; opening renders the current AGED dossier (never live state). */
  private toggleDossier(): void {
    this.dossierPanel?.toggle(this.intel, this.state.tick, {
      rivalName: (id) => this.state.rivals.find((r) => r.id === id)?.name ?? id,
      districtName: (id) => this.districtName(id),
    });
    if (this.dossierPanel?.isOpen()) this.setStatus('DOSSIER — what you’ve learned (aged · not live) · [`] to close');
  }

  /** Build the scene-observed snapshot advanceIntel earns from: greased channels, rival/collector/controlled
   * districts. DISTRICT-LEVEL only — no coordinates leave the scene, so nothing live can enter the dossier. */
  private buildIntelObservation(): IntelObservation {
    const pid = this.state.player.id;
    const size = this.world.size;
    const districtOf = (u: MovableUnit): string | undefined => {
      const t = unitTile(u);
      if (t.gx < 0 || t.gy < 0 || t.gx >= size || t.gy >= size) return undefined;
      return this.world.districtOfTile[t.gy * size + t.gx];
    };
    const greasedChannels = (['police', 'judges', 'politicians', 'feds'] as BribeChannel[])
      .filter((c) => (this.state.player.bribes[c] ?? 0) > 0);
    const rivals = this.state.rivals.filter((r) => r.alive).map((r) => r.id);
    const rivalDistrict: Record<string, string | undefined> = {};
    for (const rid of rivals) {
      const u = this.state.units.find((x) => x.factionId === rid && x.role !== 'collector' && !x.downed);
      rivalDistrict[rid] = u ? districtOf(u) : undefined;
    }
    const collectorDistricts = this.state.units
      .filter((u) => u.factionId === pid && u.role === 'collector')
      .map(districtOf).filter((d): d is string => !!d);
    const controlledDistricts = districtsHeld(this.state, pid).map((d) => d.id);
    return { greasedChannels, rivals, rivalDistrict, collectorDistricts, controlledDistricts };
  }

  /** Once per settlement (tick), let the pure dossier EARN new aged tips from what the player observed, and
   * refresh the panel if it is open. Called from update(); aging itself is query-time, so this no-ops between
   * settlements. Never edits the sim tick. */
  private advanceDossier(): void {
    if (this.state.tick === this.lastIntelTick) return;
    this.lastIntelTick = this.state.tick;
    this.intel = advanceIntel(this.intel, this.buildIntelObservation(), this.state.tick);
    if (this.dossierPanel?.isOpen()) {
      this.dossierPanel.render(this.intel, this.state.tick, {
        rivalName: (id) => this.state.rivals.find((r) => r.id === id)?.name ?? id,
        districtName: (id) => this.districtName(id),
      });
    }
  }

  /** Drive the turf war: steer the visible rival invaders each frame, and on the contest pulse open new
   * border contests (spawning rival muscle), resolve the presence contest, and clean up ended ones.
   * RTS-30c-1.1: the pulse runs on the SIMULATED stepDt (a while-loop, so a skipped/fast week fires the
   * pulses it should) — the meter is the visible authority and it KEEPS PACE with the economy clock. */
  private tickWar(stepDt: number): void {
    if (!this.world || rivalsDormant(this.state)) return;
    this.steerWarMuscle();
    // COMBAT DEPTH · PART 2 — evaluate the rival OFFENSIVE planner on a slow cadence (every ~2 sim-seconds, so
    // the timid commit roll is a real per-interval decision, not a per-frame one). ⚠ conservative; playtest.
    this.rivalOffenseAcc += stepDt;
    if (this.rivalOffenseAcc >= 2) { this.rivalOffenseAcc = 0; this.tickRivalOffense(); }
    this.state.contestElapsed = (this.state.contestElapsed ?? 0) + stepDt;
    let guard = 0;
    while ((this.state.contestElapsed ?? 0) >= CONTEST_PULSE_SECONDS && guard++ < 64) {
      this.state.contestElapsed = (this.state.contestElapsed ?? 0) - CONTEST_PULSE_SECONDS;
      for (const c of activateContests(this.state)) this.spawnContestMuscle(c); // new borders → muscle in
      const res = resolveContestStep(this.state, this.contestPresence());
      for (const o of res.outcomes) {
        if (o.flipped) { this.flashTerritory(o.districtId, true); this.audio?.confirm(); } // a block fell to the rival
        if (o.ended === 'held') this.setStatus(`you repelled the invasion of ${this.districtName(o.districtId)}`);
        if (o.ended === 'lost') this.setStatus(`${this.districtName(o.districtId)} has fallen to the rival`);
      }
      for (const c of res.ended) this.despawnContestMuscle(c);
      this.state = harvestIncidents(this.state);
    }
  }

  /** Per-district muscle presence by UNIT POSITION (the contest's inputs): player thugs vs rival
   * enforcers physically standing in each contested district. */
  private contestPresence(): Map<string, { rival: number; player: number }> {
    const size = this.world.size;
    const m = new Map<string, { rival: number; player: number }>();
    for (const c of this.state.contests ?? []) m.set(c.districtId, { rival: 0, player: 0 });
    if (m.size === 0) return m;
    for (const v of this.units) {
      const t = unitTile(v.unit);
      if (t.gx < 0 || t.gy < 0 || t.gx >= size || t.gy >= size) continue;
      const cell = m.get(this.world.districtOfTile[t.gy * size + t.gx]);
      if (!cell) continue;
      // RTS-30c-2a/2b: weight player muscle by weapon tier + a PATROL bonus (unitMusclePresence).
      if (v.faction === 'player' && v.unit.role !== 'collector') cell.player += unitMusclePresence(v.unit);
      else if (v.faction !== 'player' && v.unit.role === 'enforcer') cell.rival++;
    }
    return m;
  }

  /** Move rival muscle into a freshly contested district — visible blood-red invaders the player can
   * see + fight. Tracked on the contest so they're despawned when it ends. */
  private spawnContestMuscle(c: Contest): void {
    const d = this.world.districts.find((x) => x.id === c.districtId);
    if (!d) return;
    const cl = (v: number) => Math.max(0, Math.min(this.world.size - 1, v));
    for (let i = 0; i < CONTEST_MUSCLE_PER_INVASION; i++) {
      const id = `war-${c.districtId}-${this.state.tick}-${i}`;
      const u = spawnEnforcer(id, cl(d.centroid.gx + (i === 0 ? -1 : 1)), cl(d.centroid.gy), c.invaderId, STROLL_SPEED);
      this.state.units.push(u);
      this.attachView(u, 'rival');
      c.muscleIds.push(id);
    }
    this.setStatus(`${this.districtName(c.districtId)} is under attack — rival muscle is moving in. Send thugs to defend.`);
  }

  private despawnContestMuscle(c: Contest): void {
    // RTS-30e: a repelled invasion's muscle goes DOWN — play the kill beat where each one stood.
    for (const id of c.muscleIds) {
      const v = this.units.find((u) => u.unit.id === id);
      if (v) { const s = unitScreenPos(v.unit); this.playKill(s.x, s.y, v.faction); }
    }
    for (const id of c.muscleIds) this.removeUnitById(id);
    c.muscleIds = [];
  }

  /** Steer each contest's rival enforcers: chase the nearest player CARRIER inside the same district
   * (so it gets robbed), else patrol the district centre. Targets stay in-district → robbing is scoped
   * to contested districts (uncontested stays safe). */
  private steerWarMuscle(): void {
    const size = this.world.size;
    const cl = (v: number) => Math.max(0, Math.min(size - 1, v));
    for (const c of this.state.contests ?? []) {
      const prey = this.nearestCarrierInDistrict(c.districtId);
      const d = this.world.districts.find((x) => x.id === c.districtId);
      for (const id of c.muscleIds) {
        const e = this.state.units.find((u) => u.id === id);
        if (!e) continue;
        // RTS-35a — fix the inverted AI: a rival muscle ENGAGES a nearby player thug FIRST (defend/
        // contest the block, not only rob collectors). It breaks off to fight, then resumes the prey/wander.
        const foe = this.nearestPlayerThug(e);
        if (foe) { issueMove(e, unitTile(foe), this.navGrid); continue; }
        if (prey) issueMove(e, unitTile(prey), this.navGrid);
        else if (e.path.length === 0 && d) issueMove(e, { gx: cl(d.centroid.gx + Phaser.Math.Between(-2, 2)), gy: cl(d.centroid.gy + Phaser.Math.Between(-2, 2)) }, this.navGrid);
      }
    }
  }

  /** COMBAT DEPTH · PART 2 — apply the rival offensive PLANNER (pure) per alive rival: gather the inputs from
   * live state, run planRivalOffense (timid/conservative), and APPLY an emitted order by moving the rival's
   * nearest free muscle toward the target tile — the existing 35a combat / contest then resolve it. NO new
   * verbs; reuses movement. ⚠ BALANCE-GATED — conservative seeds; needs a HUMAN PLAYTEST before any increase. */
  private tickRivalOffense(): void {
    const nowMs = this.time.now;
    const nowSec = nowMs / 1000;
    const pid = this.state.player.id;
    const playerUnits = this.state.units.filter((u) => u.factionId === pid && u.role !== 'collector' && !u.downed);
    // COMBAT DEPTH FINALIZE (Part B) — local DEFENDER strength is now weapon-tier + skill WEIGHTED (a tommy
    // counts more than a fist), not a raw head-count, so the rival's odds reflect the fight it will get.
    const strengthNear = (gx: number, gy: number): number => {
      let s = 0;
      for (const u of playerUnits) if (Math.hypot(u.pos.gx - gx, u.pos.gy - gy) <= 4) s += unitCombatStrength(u);
      return s;
    };
    for (const rival of this.state.rivals) {
      if (!rival.alive) continue;
      const rid = rival.id;

      // 1) an in-flight strike (telegraphed → fired → monitored) owns this rival's commitment slot.
      const strike = this.rivalStrikes.get(rid);
      if (strike && this.advanceRivalStrike(rid, strike, nowMs, strengthNear)) continue;

      // 2) otherwise plan a NEW commit. The odds are scored on the ACTUALLY-committed force (committedForce,
      //    garrison reserve withheld) — not the whole idle pool — so the rival stops over-crediting itself.
      const muscle = this.state.units.filter((u) => u.factionId === rid && u.role !== 'collector' && !u.downed);
      if (muscle.length === 0) continue;
      const free = muscle.filter((u) => u.path.length === 0);
      const cf = committedForce(free, RIVAL_OFFENSE_TUNING.minMuscle);
      const fronts = allBusinesses(this.state)
        .filter((b) => b.kind === 'front' && b.extortedBy === pid)
        .map((b) => { const t = businessTileOf(this.layout, b.id); return t ? { frontId: b.id, gx: t.gx, gy: t.gy, defenderStrength: Math.max(1, strengthNear(t.gx, t.gy)) } : undefined; })
        .filter((f): f is { frontId: string; gx: number; gy: number; defenderStrength: number } => !!f);
      const units = playerUnits.map((u) => ({ id: u.id, gx: u.pos.gx, gy: u.pos.gy, defenderStrength: Math.max(1, strengthNear(u.pos.gx, u.pos.gy)) }));
      const input: RivalOffenseInput = {
        rivalId: rid, nowSec,
        lastOffenseSec: this.rivalLastOffenseSec.get(rid) ?? Number.NEGATIVE_INFINITY,
        activeOrders: this.rivalStrikes.has(rid) ? 1 : 0, // a telegraphed/active strike IS the one in flight
        freeMuscle: free.length, attackerStrength: cf.strength,
        fronts, units, rngState: this.state.rngState,
      };
      const plan = planRivalOffense(input);
      this.state.rngState = plan.rngState; // keep the world deterministic (no-op unless the commit roll drew)
      const order = plan.orders[0];
      if (!order || cf.units.length === 0) continue;
      // TELEGRAPH first — emit the pre-strike beat + schedule the dispatch; the muscle does NOT move yet.
      this.telegraphRivalStrike(rid, order, cf.units);
      this.rivalLastOffenseSec.set(rid, nowSec);
    }
  }

  /** COMBAT DEPTH FINALIZE (Part C) — drive one rival's in-flight strike. Returns true while it still owns the
   * commitment slot. Telegraphed → holds until the lead elapses, then FIRES (dispatches the committed force).
   * Active → re-checks the local edge each frame and RETREATS (recalls the survivors to the rival HQ) when the
   * odds collapse or losses pass the cap; expires after a commitment window. Reuses movement/35a — no new verb. */
  private advanceRivalStrike(rid: string, strike: RivalStrike, nowMs: number, strengthNear: (gx: number, gy: number) => number): boolean {
    const surviving = strike.unitIds
      .map((id) => this.state.units.find((u) => u.id === id))
      .filter((u): u is MovableUnit => !!u && !u.downed);
    if (surviving.length === 0) { this.rivalStrikes.delete(rid); return false; } // the strike force is gone

    if (strike.phase === 'telegraphed') {
      if (nowMs < strike.fireAtMs) return true;             // still inside the player's defensive window
      for (const u of surviving) issueMove(u, { gx: strike.gx, gy: strike.gy }, this.navGrid); // FIRE
      strike.phase = 'active';
      strike.expireAtMs = nowMs + 20000;                    // ~20s commitment window
      return true;
    }

    // ACTIVE — fair retreat: break off if the edge collapsed or losses exceeded the cap (reserve already held).
    let atk = 0; for (const u of surviving) atk += unitCombatStrength(u);
    const localAdvantage = atk / Math.max(0.0001, strengthNear(strike.gx, strike.gy));
    const lossFraction = (strike.initialCount - surviving.length) / Math.max(1, strike.initialCount);
    if (shouldRetreat(localAdvantage, lossFraction)) {
      const home = hqTileOf(this.layout, rid) ?? unitTile(surviving[0]);
      for (const u of surviving) issueMove(u, home, this.navGrid); // RECALL — pull back, don't grind it down
      this.rivalStrikes.delete(rid);
      return true;
    }
    if (nowMs > strike.expireAtMs) { this.rivalStrikes.delete(rid); return false; } // window elapsed → free again
    return true;
  }

  /** COMBAT DEPTH FINALIZE (Part C-1) + FAIRNESS slice — TELEGRAPH a committed strike through q7: a WIRE line +
   * an edge alert + a ping, with a 'why' reason and a consequence-scaled LEAD (higher stakes ⇒ longer warning).
   * FAIRNESS: the warning is now GRADUATED by the player's OWN intel near the target (telegraphTier) — a
   * well-defended block earns an earlier, clearer read; a blind one gets only a rumor — and the tier extends
   * the reaction window. ⭐ NO-X-RAY: the ping + message describe the player's OWN asset/district under threat
   * (order.gx/gy is the TARGET, the player's front/unit — never the hidden rival's position). PLAYTEST-GATED
   * presentation; the pure tier/window/report logic lives in sim/telegraph.ts (non-HITL, unit-tested). */
  private telegraphRivalStrike(rid: string, order: { kind: 'contestFront' | 'interceptUnit'; gx: number; gy: number; frontId?: string; targetUnitId?: string }, units: MovableUnit[]): void {
    let consequence01 = 0.3; let carrying = false; let escorted = false;
    let assetLabel: string | undefined;
    const size = this.world.size;
    const inb = order.gx >= 0 && order.gy >= 0 && order.gx < size && order.gy < size;
    const did = inb ? this.world.districtOfTile[Math.round(order.gy) * size + Math.round(order.gx)] : undefined;
    const where = did ? this.districtName(did) : 'the open street';
    if (order.kind === 'contestFront') {
      const biz = allBusinesses(this.state).find((b) => b.id === order.frontId);
      consequence01 = Math.min(1, (biz?.baseIncome ?? 0) / 200); // richer block = higher stakes = longer lead
      assetLabel = biz?.name;
    } else {
      const target = this.state.units.find((u) => u.id === order.targetUnitId);
      carrying = !!target && (target.carrying ?? 0) > 0;
      consequence01 = carrying ? Math.min(1, (target!.carrying ?? 0) / 600) : 0.2;
      escorted = carrying && this.nearestPlayerThug(target!) !== undefined; // a thug guarding the carrier
      assetLabel = carrying ? 'your collector' : undefined;
    }
    const tg = planTelegraph(order.kind, { consequence01, carrying, escorted });
    // FAIRNESS — the player's OWN intel near the target grades the warning (presence + eyes-on + control). All
    // player-side reads; never a rival query. A blind block gets a rumor, a watched one a confirmed read.
    const pid = this.state.player.id;
    const friendly = this.state.units
      .filter((u) => u.factionId === pid && u.role !== 'collector' && !u.downed)
      .map((u) => u.pos);
    const tier: TelegraphTier = telegraphTier({
      friendlyNearby: countFriendlyNear(friendly, { gx: order.gx, gy: order.gy }),
      targetRevealed: isRevealed(this.fog, order.gx, order.gy),
      controlsDistrict: !!did && districtStatusOf(this.state, did)?.owner === pid,
    });
    const report = buildTelegraphReport(tier, tg.reason, consequence01, { districtName: where, assetLabel });
    const lede = tier === 'confirmed' ? 'Confirmed threat' : tier === 'suspected' ? 'Rival lookouts' : 'Word on the street';
    const message = `${lede}: ${report.where} — ${tg.reason} · ${report.eta}`;
    this.recordInfoEvent('rival.telegraph', message, order.gx, order.gy);
    this.rivalStrikes.set(rid, {
      phase: 'telegraphed', kind: order.kind, gx: order.gx, gy: order.gy,
      fireAtMs: this.time.now + report.leadMs, expireAtMs: 0, // tier-extended reaction window (fairness)
      unitIds: units.map((u) => u.id), initialCount: units.length, reason: tg.reason,
    });
  }

  private nearestCarrierInDistrict(districtId: string): MovableUnit | undefined {
    const size = this.world.size;
    for (const v of this.units) {
      if (v.faction !== 'player' || v.unit.role !== 'collector' || (v.unit.carrying ?? 0) <= 0) continue;
      const t = unitTile(v.unit);
      if (t.gx < 0 || t.gy < 0 || t.gx >= size || t.gy >= size) continue;
      if (this.world.districtOfTile[t.gy * size + t.gx] === districtId) return v.unit;
    }
    return undefined;
  }

  /** Remove a unit + its view (turf-war invaders that have been repelled/won). */
  /** RTS-35a — the nearest live player thug (combatant, non-collector) within seek range of `from`, if
   * any. Drives a rival's decision to break off and ENGAGE a player unit. */
  private nearestPlayerThug(from: MovableUnit): MovableUnit | undefined {
    let best: MovableUnit | undefined;
    let bestD = COMBAT_SEEK_RANGE;
    for (const u of this.state.units) {
      if (u.factionId !== 'player' || u.role === 'collector' || u.downed) continue;
      const d = Math.hypot(u.pos.gx - from.pos.gx, u.pos.gy - from.pos.gy);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }

  private removeUnitById(id: string): void {
    const idx = this.units.findIndex((v) => v.unit.id === id);
    if (idx >= 0) {
      const v = this.units[idx];
      // PLAYTEST FIX (Part 2) — release the health bar WITH the rest of the view. v.hpBar is a single Graphics
      // holding BOTH the fill AND the dark backing/track; it was missing from this list, so on death (when the
      // fill is ~0) the frozen backing leaked on screen as an orphaned "shadow". Tying it to the unit's render
      // lifecycle here destroys fill + shadow together when the unit/downed-body is finally removed.
      for (const o of [v.sprite, v.shadow, v.factionRing, v.selRing, v.cashTag, v.dangerRing, v.hpBar, v.rig, v.rigDebug, v.rigText]) o?.destroy();
      this.units.splice(idx, 1);
    }
    this.state.units = this.state.units.filter((u) => u.id !== id);
    // RTS-30d-3: a dead/despawned unit drops out of the selection (the brass ring + its card vote go with it).
    if (this.selection.ids.includes(id)) this.selection = selectMany(this.selection.ids.filter((x) => x !== id));
    if (this.collectorInfoId === id) this.hideCollectorInfo();
  }

  private updateUnits(dt: number): void {
    // RTS-28 PACING: feed the sim a tighter real-time week + the fast-forward multiplier; a pending
    // SKIP-WEEK jumps straight to the next settlement (exactly one). Economy math is untouched.
    // RTS-30c-1.1: compute the simulated step FIRST and drive the turf war with the SAME stepDt as the
    // economy/strategy — so the contest meter keeps pace with skipped/fast-forwarded weeks (it used to
    // run on raw real-time dt, so a skipped week advanced the background capture but froze the meter).
    // GLOBAL ACTIVE-PAUSE — while paused, the loop simply does NOT advance the sim (no tickWar / observeWorld
    // / routes): the world freezes in place. The render block below + the camera/HUD still run every frame,
    // and input still flows, so the player can look around and issue/queue orders (an active pause). This is
    // a LOOP-level gate; tick()/applyCommand() are untouched.
    if (!this.pause.paused) {
    let stepDt = scaledDt(dt, this.timeScale);
    if (this.skipWeekPending) { stepDt = skipWeekDt(this.state.weekElapsed ?? 0, SCENE_WEEK_SECONDS); this.skipWeekPending = false; }

    // RTS-30c-1: advance the TURF WAR first (spawn/steer rival invaders, resolve contests) so the
    // interception that observeWorld runs this frame sees fresh positions. Settles AROUND the tick.
    this.tickWar(stepDt);
    this.steerPatrols(); // RTS-30c-2b: patrolling units loop their district (defensive stance)
    // rival hunts whichever player collector is carrying cash
    const collector = this.playerCarrier();
    const gun = this.state.units.find((u) => u.id === 'rival-gun');
    if (collector && gun) issueMove(gun, unitTile(collector), this.navGrid);

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
    // Lane L — RUN STATS: once per SETTLED week, sample the peak/final counters (turf, rivals down, heat
    // peak, weeks survived) and book the gross weekly income the empire produced. Pure observe — it only
    // READS state; tick()/applyCommand() are untouched.
    const runStats = ensureRunStats(this.state);
    if (obs.result.weeksFired > 0) {
      observeRun(runStats, this.state);
      recordIncomeEarned(runStats, familyIncome(this.state, 'player') * obs.result.weeksFired);
    }
    // FUNDS: snapshot the player's cash here so every deposit banked below (route + manual collectors) is
    // tallied. Settlement/expenses already resolved inside observeWorld above, and NO command runs in this
    // loop, so the only cash movement between here and processCollectorArrivals is banked takings.
    const cashBeforeDeposits = this.state.player.cash;
    // RTS-22/29: advance the fixed per-business collectors (gather → bank → loop). No-op without one.
    advanceRoutes(this.state, this.layout, this.navGrid);
    // RTS-35b: react to the embodied-extortion transitions (the sim already drove the acts + fired the
    // EXISTING conversion on resolve); ensure a collector exists for every business we earn from.
    this.processExtortionEvents(obs.result.extortion);
    if (obs.result.weeksFired > 0) this.syncBusinessCollectors();
    for (const ev of obs.result.interceptions) {
      this.flashAmbush(ev);
      // INFO-FEEDBACK — collector.robbed (state change → log + edge alert + ping) at the collector's tile.
      const col = this.state.units.find((u) => u.id === ev.collectorId);
      this.recordInfoEvent('collector.robbed', `a collector was robbed of $${ev.amount}`, col?.pos.gx, col?.pos.gy);
    }
    for (const ev of obs.result.combat) this.playCombatBeat(ev); // RTS-35a unit-vs-unit fight beats
    if (obs.result.combat.length > 0) this.lastCombatMs = this.time.now; // POLISH v2 · PKG5 — active-combat signal
    this.applyUnitOrders(); // COMBAT CONTROL VERBS — HOLD stands; ATTACK-MOVE diverts to engage then advances
    for (const dep of processCollectorArrivals(this.state, this.layout)) {
      this.flashDeposit(dep.collectorId, dep.banked);
      // LANE K — a collector REPORTED IN: log the bank so income shows up on THE WIRE, not just a one-frame
      // float. ⭐ NO-X-RAY: PLAYER deposits only — processCollectorArrivals also yields rival collectors, and
      // a rival's bank is NOT a player-knowable fact. Positional to the player's OWN HQ vault (click-to-jump),
      // no alert/ping (routine good news).
      if (dep.familyId === 'player' && dep.banked > 0) {
        const vault = hqTileOf(this.layout, 'player');
        this.recordInfoEvent('collector.banked', `a collector banked $${dep.banked}`, vault?.gx, vault?.gy);
      }
    }
    // Lane L — RUN STATS: the cash gained across the deposit calls above is the funds banked this frame.
    recordFundsBanked(runStats, this.state.player.cash - cashBeforeDeposits);
    // RTS-16: the turf war moved — call out captures and routed families over the district.
    for (const cap of obs.strategy.captures) {
      this.flashTerritory(cap.districtId, cap.before === 'player');
      const wd = this.world.districts.find((d) => d.id === cap.districtId);
      const lost = cap.before === 'player';
      this.recordInfoEvent(captureEventKind(lost), `${wd?.name ?? cap.districtId} ${lost ? 'LOST to a rival' : 'captured'}`, wd?.centroid.gx, wd?.centroid.gy);
    }
    for (const fid of obs.strategy.fallen) { this.setStatus(`${fid} has been driven out of the city`); this.recordInfoEvent('rival.fallen', `${fid} driven out of the city`); }
    // RTS-17: a rival struck our HQ — telegraph the blow.
    if (obs.strategy.hqStrikes.length > 0) {
      this.fxShake(220, 0.006);
      this.setStatus('OUR HQ IS UNDER ATTACK');
      const hq = hqTileOf(this.layout, 'player');
      this.recordInfoEvent('hq.attack', 'OUR HQ IS UNDER ATTACK', hq?.gx, hq?.gy);
    }
    this.state = harvestIncidents(this.state);
    // RTS-17: the contest resolved — surface the win/lose readout.
    if (obs.endgame || this.state.status !== 'playing') this.showEndgame();
    this.advanceDossier(); // LANE D — earn aged intel once per settlement (no-op between ticks; never edits the sim)
    this.advanceAutosave(); // LANE F — autosave once per settlement (no-op between ticks)
    } // end !paused — sim advancement gate

    const threats = new Map<string, ThreatView>(threatenedCollectors(this.state).map((t) => [t.collectorId, t]));
    const now = this.time.now;
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(now / 220));

    // RTS-35b — the live embodied-extortion acts, keyed by their thug, so the unit loop can pose the
    // intimidate-lean + throw the cadence shoves while a thug is squared up at a front.
    const extortByThug = new Map<string, EmbodiedExtortionAct>((this.state.extortionActs ?? []).map((a) => [a.thugId, a]));

    // POLISH v2 · PKG4 — the unit the cursor is over (kept findable behind buildings via the x-ray).
    const ptr = this.input.activePointer;
    const hoveredId = this.occEnabled ? pickUnit(this.units.map((u) => u.unit), screenToGrid(ptr.worldX, ptr.worldY))?.id : undefined;

    for (const v of this.units) {
      const s = unitScreenPos(v.unit);
      const tile = v.unit.pos;
      const depth = depthValue(Math.round(tile.gx), Math.round(tile.gy)) * 10 + 8;
      const moving = v.unit.path.length > 0;
      const seed = v.idleSeed ?? 0;
      // RTS-30e LOCOMOTION: a footstep BOB while moving (faster cadence = a RUN read for an urgent
      // unit), and a gentle IDLE BREATH + sway when still (a slow ≥1.3s loop — units never freeze).
      let bob: number, breath = 1, sway = 0;
      if (moving) {
        const cadence = v.unit.speed >= RUN_BOB_SPEED ? MOTION.runBob : MOTION.walkBob;
        bob = Math.abs(Math.sin((now + seed) / (cadence / Math.PI))) * 2.0; // a lifting footfall
      } else {
        const ph = (now + seed * 7) / MOTION.idleBreath * Math.PI * 2;
        bob = 0;
        breath = 1 + Math.sin(ph) * 0.015; // a shallow chest breath (vertical)
        sway = Math.sin(ph * 0.5) * 0.7;   // a slow weight shift
      }
      // RTS-30e ATTACK recoil (one-shot): aim→fire kicks the figure back from its target; a melee
      // wind-up→swing lunges in then settles. RTS-30e HIT flinch: a short knock-back nudge when struck.
      let kick = 0, lift = 0;
      const attackSample = v.attackStartedAt !== undefined && v.attackRigWeapon && v.attackUntil && now < v.attackUntil
        ? sampleWeaponAttackPose(v.attackRigWeapon, now - v.attackStartedAt)
        : undefined;
      if (v.attackUntil && now < v.attackUntil) {
        const duration = Math.max(1, (v.attackUntil - (v.attackStartedAt ?? (v.attackUntil - MOTION.attackRecoil))));
        const t = 1 - (v.attackUntil - now) / duration; // 0→1 over the beat
        const env = Math.sin(Math.min(1, t) * Math.PI); // ease in/out
        const dir = v.attackFaceRight ? 1 : -1;
        if (attackSample) { kick = dir * attackSample.bodyKickPx; lift = attackSample.bodyLiftPx; }
        else if (v.attackKind === 'ranged') { kick = -dir * 5 * env; lift = -1.5 * env; } // recoil back + up
        else { kick = dir * 6 * env; lift = -3 * env; } // melee lunge in + up
      }
      if (v.hitUntil && now < v.hitUntil) {
        const dwell = v.hitDwellMs ?? MOTION.hitFlinch; // per-weapon stagger (heavier weapon lingers)
        const t = (v.hitUntil - now) / dwell; // 1→0
        kick += (v.faction === 'player' ? -1 : 1) * (v.hitKnockbackPx ?? 3) * t; // weapon-scaled knock-back
      }
      // RTS-35b INTIMIDATE LEAN: a thug squared up at a front (engage/shakedown) leans FORWARD into the
      // storefront — a slow surging menace (computeIntimidateLean) plus periodic shoves on a cadence.
      const xact = extortByThug.get(v.unit.id);
      if (xact && (xact.state === 'engage' || xact.state === 'shakedown')) {
        const fc = gridToScreen(xact.interaction.gx, xact.interaction.gy);
        const fwd = Math.sign(fc.x - s.x) || (facesRight(unitFacing(v.unit)) ? 1 : -1);
        const { lean, surge } = computeIntimidateLean(now + (v.idleSeed ?? 0));
        kick += fwd * lean; lift -= surge * 0.4; // lean in + a slight rise on the surge
        if (xact.state === 'shakedown') {
          const nextShove = this.extortShoveAt.get(v.unit.id) ?? 0;
          if (now >= nextShove) { this.triggerAttackMotion(v, undefined, fc.x); this.extortShoveAt.set(v.unit.id, now + EXTORT_SHOVE_INTERVAL_MS); }
        }
      }

      // RTS-32 — the ARTICULATED RIG (thug-role units): a DISTANCE-driven gait so the foot never skates.
      if (v.rig) {
        const lsx = v.lastSX ?? s.x, lsy = v.lastSY ?? s.y;
        const dist = Math.hypot(s.x - lsx, s.y - lsy); // world-screen travel since last frame (camera-independent)
        v.lastSX = s.x; v.lastSY = s.y;
        const stride = v.unit.speed >= RUN_BOB_SPEED ? RUN_STRIDE : WALK_STRIDE;
        v.gaitPhase = advanceGaitPhase(v.gaitPhase ?? 0, moving ? dist : 0, stride); // ⭐ cadence ∝ ground speed
        v.loco = easeLoco(v.loco ?? 0, locoTarget(v.unit.speed, moving, RUN_BOB_SPEED), dt * 1000, 150); // ~150ms cross-fade / stop-settle
        const faceRight = facesRight(unitFacing(v.unit));
        if (this.spritesEnabled && this.spriteSheetReady) {
          // ?sprites — the 3D-rendered iso ATLAS view (opt-in). Hides the rig + baked silhouette and drives
          // an 8-direction animated Sprite at the SAME anchor/depth. Faction stays on the base-plate ring
          // (never the body). NO-X-RAY: a rival only draws when its tile is revealed (hidden = nothing).
          v.rig.setVisible(false); v.rigDebug?.setVisible(false); v.rigText?.setVisible(false);
          v.sprite.setVisible(false);
          if (!v.spriteSheet) { v.spriteSheet = ensureUnitSprite(this, THUG_SPRITE_CONFIG.unitName); this.worldFx(v.spriteSheet); }
          const revealed = v.faction === 'player' || isRevealed(this.fog, Math.round(tile.gx), Math.round(tile.gy));
          driveUnitSprite(v.spriteSheet, {
            unitName: THUG_SPRITE_CONFIG.unitName,
            facing: unitFacing(v.unit),
            dirOffset: THUG_FACING_OFFSET, // Mixamo FBX forward=-Y, rows baked modelForwardDeg=0 → rotate 180° (4 octants) to stop the moonwalk
            attacking: !!v.attackUntil && now < v.attackUntil,
            moving, loco: v.loco ?? 0,
            availableActions: this.spriteActions, // desired action degrades to a rendered clip (run→walk→idle)
            x: s.x + kick, y: s.y + lift, depth, alpha: v.occA ?? 1, visible: revealed, scale: this.spriteScale,
          });
        } else if (rigLOD(this.targetZoom) === 'far') {
          // FAR LOD — bypass the per-frame rig; the cheap baked silhouette stands in (perf).
          v.rig.setVisible(false); v.rigDebug?.setVisible(false); v.rigText?.setVisible(false);
          v.sprite.setVisible(true).setPosition(s.x + kick, s.y + lift).setDepth(depth).setScale(1, 1).setFlipX(!faceRight);
        } else {
          v.sprite.setVisible(false);
          const pose: RigPose = poseFor(v.gaitPhase, v.loco, now + seed * 7);
          if (this.fig2) {
            // ?fig2 proof — the upgraded thug. ?figscale uniformly scales the figure (plate/shadow stay
            // unscaled, drawn separately). Same pose ⇒ idle/walk/attack animation carries over. The fog/
            // occlusion alpha gate below (v.rig.setAlpha) still enforces NO-X-RAY — only the BODY swaps.
            const sc = this.figScale / FIG2_REFERENCE_PX;
            const g = v.rig.setVisible(true).setPosition(s.x + kick, s.y + lift).setDepth(depth).setScale(faceRight ? sc : -sc, sc);
            g.clear();
            const plan = figurePlan({ archetype: 'thug', faction: v.faction === 'player' ? 'player' : 'rival', revealed: true, downed: !!v.unit.downed });
            if (plan.draw) drawThugFig2(g, pose, plan, attackSample);
          } else {
            const g = v.rig.setVisible(true).setPosition(s.x + kick, s.y + lift).setDepth(depth).setScale(faceRight ? 1 : -1, 1);
            g.clear();
            drawThugRig(g, pose, v.faction === 'player' ? PLAYER_RIG : RIVAL_RIG, attackSample);
          }
          if (v.rigDebug && v.rigText) {
            const dg = v.rigDebug.setVisible(true).setPosition(s.x + kick, s.y + lift).setDepth(depth + 1).setScale(faceRight ? 1 : -1, 1);
            dg.clear(); drawRigDebug(dg, pose);
            const state = v.loco < 0.5 ? 'IDLE' : v.loco < 1.5 ? 'WALK' : 'RUN';
            v.rigText.setVisible(true).setPosition(s.x, s.y - 58).setDepth(depth + 2).setText(`φ${v.gaitPhase.toFixed(2)} ${state}`);
          }
        }
      } else {
        v.sprite.setPosition(s.x + sway + kick, s.y - bob + lift).setDepth(depth).setScale(1, breath).setFlipX(!facesRight(unitFacing(v.unit)));
      }
      v.shadow.setPosition(s.x, s.y + 2).setDepth(depth - 2);
      v.factionRing.setPosition(s.x, s.y + 2).setDepth(depth - 1);

      const selected = isSelected(this.selection, v.unit.id);
      v.selRing.setPosition(s.x, s.y + 2).setDepth(depth - 1).setVisible(selected).setAlpha(pulse);

      // POLISH v2 · PKG4 — ISO OCCLUSION: a unit slipping behind a taller building dims→hides; a unit the
      // player needs to track (fighting / mid-shakedown / selected / hovered) keeps a faction-rimmed x-ray
      // so it stays findable. NEVER x-ray a fog-hidden unit (a shrouded rival stays shrouded).
      if (this.occEnabled) {
        const occluded = this.buildingHulls.length > 0 && isOccluded(s.x, s.y, depth, this.buildingHulls);
        const revealed = isRevealed(this.fog, Math.round(tile.gx), Math.round(tile.gy));
        const xact = extortByThug.get(v.unit.id);
        const critical = criticalVisualState({
          fighting: (!!v.attackUntil && now < v.attackUntil) || (!!v.hitUntil && now < v.hitUntil),
          shakedown: xact?.state === 'engage' || xact?.state === 'shakedown',
          selected,
          hovered: v.unit.id === hoveredId,
        });
        const display = occlusionDisplay(occluded, critical, revealed);
        const target = occlusionTargetAlpha(display);
        v.occA = v.occA === undefined ? target : v.occA + (target - v.occA) * 0.25; // ease dim→hide
        const a = v.occA;
        v.sprite.setAlpha(a); v.rig?.setAlpha(a); v.spriteSheet?.setAlpha(a); v.shadow.setAlpha(0.5 * a);
        // the x-ray rim: a bright faction silhouette ring lifted ABOVE the buildings so it reads through them.
        if (display === 'xray') {
          v.factionRing.setVisible(true).setStrokeStyle(2.5, hexNum(xRayRim(v.faction, !!v.unit.downed)), 0.95).setDepth(99000);
        } else {
          v.factionRing.setStrokeStyle(2, v.faction === 'player' ? PAL.brass : PAL.blood, 0.9).setDepth(depth - 1).setAlpha(a);
        }
      }

      // COMBAT READABILITY — a small faction-tinted HEALTH BAR over a fighter that has taken damage OR is in
      // combat (hidden at full health / out of combat, and hidden when occluded away — restraint). A critical
      // unit's bar PULSES (motion = threat; never a static danger-red fill, per the red-discipline law).
      if (isCombatant(v.unit) || v.unit.health !== undefined) {
        const inCombat = (!!v.hitUntil && now < v.hitUntil) || (!!v.attackUntil && now < v.attackUntil) || !!enemyInRange(v.unit, this.state.units);
        const show = shouldShowHealthBar(v.unit, inCombat) && (v.occA ?? 1) > 0.15;
        if (!v.hpBar) { v.hpBar = this.add.graphics(); this.worldFx(v.hpBar); }
        v.hpBar.setVisible(show).setDepth(depth + 3);
        if (show) {
          const frac = healthFraction(v.unit);
          const W = 24, H = 3, bx = s.x - W / 2, by = s.y - 52;
          const col = v.faction === 'player' ? PAL.brass : hexNum(SPEC.rival); // faction read (rival = static #9E1B1B)
          const fillA = isCritical(v.unit) ? 0.5 + 0.45 * Math.abs(Math.sin(now / 130)) : 0.95; // critical PULSES
          v.hpBar.clear();
          v.hpBar.fillStyle(hexNum(SPEC.soot), 0.8).fillRect(bx - 1, by - 1, W + 2, H + 2); // dark backing
          v.hpBar.fillStyle(col, fillA).fillRect(bx, by, W * frac, H);
        }
      }

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

    this.drawExtortOverlay(now);
    this.syncDownedBodies(); // COMBAT READABILITY (4) — persistent desaturated downed bodies
    this.syncBeatCops(); // BEAT-COP P0 — neutral law markers on the sidewalk graph (fog-gated)
    // INFO-FEEDBACK — the minimap, the screen-edge alerts, and THE WIRE — LOG (all read sim state only).
    this.drawMinimap(now);
    this.drawEdgeAlerts(now);
    if (!this.hudCollapsed) this.drawWireLog(); // HUD PHASE 1 — full log lives in the [L] Wire drawer when collapsed
    this.updateAdvisor(now); // Lane — CONSIGLIERE: the distilled "what to do next" nudge, read from THE WIRE
    this.updateStatusDashboard(now); // Lane — STATUS DASHBOARD: the at-a-glance threat/economy summary
    this.drawTargetReticles(now); // Floor polish — mark a selected unit's (visible) target
    this.drawOpPreview(); // OPERATION-OUTCOME PREVIEWS — the hover GLANCE/DETAIL card (read-only)

    // RTS-29 badges: a spinning brass coin over fronts — DIM [%] (extortable invitation) vs FULL [$]
    // (earning) — and HIDDEN under the fog (so shrouded blocks/rivals stay unseen).
    const spinAngle = ((now % MOTION.coinSpin) / MOTION.coinSpin) * 360;
    // POLISH v2 · PKG1 — district holders this frame (CANON: district control only) for the ownership windows.
    const holderByDistrict = new Map<string, string | undefined>(this.state.districts.map((d) => [d.id, districtHolder(d)]));
    const breathe = 0.85 + 0.15 * Math.sin(now / 1300); // a slow window breath (never a static alarm)
    for (const [bid, m] of this.bizMarkers) {
      const t = businessTileOf(this.layout, bid);
      const owner = this.bizOwnerGlow.get(bid);
      if (t && !isRevealed(this.fog, t.gx, t.gy)) { m.coin.setVisible(false); if (m.glow) m.glow.setVisible(false); owner?.setVisible(false); continue; }
      // ownership window glow: tint by the building's DISTRICT holder (player brass / rival cooled #9E1B1B).
      if (owner) {
        const tint = ownershipWindowTint(holderByDistrict.get(this.bizDistrict.get(bid) ?? ''), this.state.player.id);
        if (tint) owner.setVisible(true).setTint(hexNum(tint.color)).setAlpha(tint.alpha * breathe);
        else owner.setVisible(false);
      }
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

  /** RTS-22: draw the player's deliberate [T] AUTOMATED collection route as a faint brass polyline
   * through its stops. RTS-34.1: EXCLUDE the per-business collector routes (`route-biz-*`, created by
   * ensureBusinessCollector for the autonomous sea-of-collectors) — those single-stop routes were being
   * drawn as a stray HQ→business line (the "yellow line" leftover); only the explicit [T] route overlays. */
  private refreshRoute(): void {
    if (!this.routeGfx) return;
    this.routeGfx.clear();
    const route = this.state.routes?.find((r) => r.familyId === 'player' && !r.id.startsWith('route-biz-'));
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
    this.triggerHitReact(ev.collectorId); // RTS-30e: the robbed collector flinches from the hit
    const s = unitScreenPos(v.unit);

    // muzzle flash — danger-red, soft radial, brief (motion = danger).
    const flashGlow = this.add.image(s.x + 8, s.y - 14, TEX.glow).setTint(hexNum(SPEC.danger)).setScale(0.4).setDepth(100001);
    this.worldFx(flashGlow);
    this.tweens.add({ targets: flashGlow, scale: 1.1, alpha: 0, duration: 180, onComplete: () => flashGlow.destroy() });
    const ring = this.add.circle(s.x, s.y - 8, 8).setStrokeStyle(4, hexNum(SPEC.danger), 1).setDepth(100001);
    this.worldFx(ring);
    this.tweens.add({ targets: ring, scale: 7, alpha: 0, duration: 600, onComplete: () => ring.destroy() });

    // three sharp 6px shakes (Lane G — routed through the screen-shake setting via fxShake).
    this.fxShake(80, 0.006);
    this.time.delayedCall(110, () => this.fxShake(80, 0.006));
    this.time.delayedCall(220, () => this.fxShake(80, 0.006));

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
  /** RTS-34 — a brief BRASS sparkle off the top-bar CLEAN-cash cell so a bank reads as the number
   * LANDING (pairs with the count-up roll). UI-camera only; brass, restrained (4 motes, ~600ms). */
  private sparkleCashCell(): void {
    const cell = this.topCells.find((c) => c.key === 'clean');
    if (!cell) return;
    const bx = cell.x, by = cell.label.y + 24;
    for (let i = 0; i < 4; i++) {
      const star = this.mkText(bx + Phaser.Math.Between(0, 64), by + Phaser.Math.Between(-2, 8), '✦',
        { fontFamily: NOIR_FONT, fontSize: '12px', color: '#e3c36a' }).setOrigin(0.5).setScrollFactor(0).setDepth(100003);
      this.hudFx(star);
      this.tweens.add({ targets: star, y: star.y - 16, alpha: { from: 0.9, to: 0 }, duration: 560 + i * 50, onComplete: () => star.destroy() });
    }
  }

  private flashDeposit(collectorId: string, banked: number): void {
    const v = this.units.find((u) => u.unit.id === collectorId);
    if (!v) return;
    if (banked > 0) { this.signalBeat('banked'); this.sparkleCashCell(); } // RTS-23 audio seam + RTS-34 cash-land sparkle
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
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // Lane G — a pause/settings modal owns the screen: never start a world marquee under it.
      if (this.pauseMenu?.isOpen() || this.settingsPanel?.isOpen()) return;
      this.pressX = p.x; this.pressY = p.y; this.marqueeActive = false;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      // Lane G — swallow world clicks while a pause/settings modal is open (its own handlers run the UI).
      if (this.pauseMenu?.isOpen() || this.settingsPanel?.isOpen()) return;
      // RTS-30b-ui: a toolbar button press already ran its verb — swallow the world-click so it doesn't
      // also box-select/deselect units beneath the HUD.
      if (this.toolbarClick) { this.toolbarClick = false; return; }
      if (this.legend?.visible) { this.hideLegend(); return; }
      // Lane B — a click on the FTUE coach card's SKIP hint dismisses the tutorial (for mouse users who
      // don't reach for [Esc]). Hit-test the fixed-HUD label in screen space before any world click.
      if (this.tutorialShowing && this.tutorialSkipHint?.visible) {
        const b = this.tutorialSkipHint.getBounds(); // logical HUD bounds — compare the logical pointer
        const lx = this.hudX(p.x), ly = this.hudY(p.y);
        if (lx >= b.x - 6 && lx <= b.x + b.width + 6 && ly >= b.y - 4 && ly <= b.y + b.height + 6) { this.skipTutorial(); return; }
      }
      // HUD PHASE 1 — the dossier strip + the open drawer OVERLAY the world: a click on a chip toggles its
      // panel; a click anywhere inside the open drawer is swallowed (so it never box-selects the city beneath).
      if (this.handleDossierClick(p.x, p.y)) return;
      if (this.panels?.capturesPointer(p.x, p.y)) return;
      // RTS-30d-3: a left-drag marquee just finished — resolve the box-selection (NOT a click/pan).
      if (this.marqueeActive) { const shift = !!(p.event as MouseEvent | undefined)?.shiftKey; this.resolveMarquee(p, shift); this.endMarquee(); return; }
      // A real drag panned the camera — not a click.
      if (Math.hypot(p.x - this.pressX, p.y - this.pressY) > CLICK_SLOP) return;
      // RTS-30a: a click on a CITY-roster row flies the camera to that district.
      const rx = this.hudX(p.x), ry = this.hudY(p.y); // logical HUD space for the roster-row zones
      const row = this.cityRowHits.find((r) => rx >= r.x && rx <= r.x + r.w && ry >= r.y && ry <= r.y + r.h);
      if (row) { this.flyToDistrict(row.districtId); return; }
      // INFO-FEEDBACK — a click on the minimap / a log row / an edge arrow jumps the camera (consume it).
      if (this.handleInfoClick(p.x, p.y)) return;
      // BALANCE — a left-click on a FOUR-CHANNELS row greases THAT channel (targetable grease).
      if (p.leftButtonReleased() && this.handleChannelClick(p.x, p.y)) return;
      const shift = !!(p.event as MouseEvent | undefined)?.shiftKey;
      // An open menu consumes the next click: a row runs its action, anywhere else dismisses it.
      if (this.ctxMenu) {
        const hit = this.menuRowAt(p.x, p.y);
        this.closeBizMenu();
        if (hit) hit();
        return;
      }
      if (p.rightButtonReleased()) {
        // RTS-35c VERB SPLIT: route the right-click by TARGET TYPE — a rival UNIT → ATTACK, a BUILDING →
        // the extort/attack menu, empty ground → MOVE (RTS-22/23 building rule preserved within).
        this.commandContextual(p);
      } else if (this.attackMovePending) {
        // [A] is armed: this left-click sets the ATTACK-MOVE destination (instead of box-selecting).
        this.attackMovePending = false;
        this.commandAttackMove(p);
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
    sx = this.hudX(sx); sy = this.hudY(sy); // screen → logical HUD space (UI-scale)
    for (const r of this.ctxRows) if (sx >= this.ctxRect.x && sx <= this.ctxRect.x + this.ctxRect.w && sy >= r.y0 && sy <= r.y1) return r.act;
    return null;
  }

  /** Open the EXTORT / ATTACK menu for a business at screen (sx, sy). */
  private openBizMenu(businessId: string, sx: number, sy: number): void {
    sx = this.hudX(sx); sy = this.hudY(sy); // open at the logical HUD position (UI-scale)
    this.closeBizMenu();
    const acts = businessActions(this.state, businessId, 'player');
    if (!acts) return;
    const b = inspectBusiness(this.state, businessId);
    const title = b ? `${b.name}` : 'business';
    const sub = acts.earner === 'player' ? 'yours' : acts.earner ? `${acts.earner}'s` : 'un-shaken';

    // RTS-35d — the EXTORT row reflects the AUTHORITATIVE 35b/35d gate (un-taken front OR a guard-cleared
    // RIVAL-HELD retake), not the legacy control-foothold gate. A rival-held front reads RETAKE; the gate
    // hint surfaces "clear the guard first" while a rival still watches the block.
    const exTile = businessTileOf(this.layout, businessId);
    const exThug = this.selectedPlayerThug();
    const exGate = exThug && exTile
      ? canIssueMoveAndShakedown(this.state, exThug.id, businessId, exTile)
      : { ok: false, reason: 'select one of your thugs first' };
    const retakeLabel = isRivalHeldFront(this.state, businessId) ? 'RETAKE' : 'EXTORT';

    const rows: { label: string; color: string; enabled: boolean; hint: string; act: () => void }[] = [
      { label: retakeLabel, color: exGate.ok ? SPEC.brass : NOIR_PALETTE.fog, enabled: exGate.ok, hint: exGate.reason, act: () => this.commandExtortBusiness(businessId) },
      { label: 'ATTACK', color: acts.attack.ok ? SPEC.danger : NOIR_PALETTE.fog, enabled: acts.attack.ok, hint: acts.attack.reason, act: () => this.commandAttackBusiness(businessId) },
    ];

    const W = 196, rowH = 28, headH = 30, H = headH + rows.length * rowH + 6;
    const x = Math.min(sx, this.hudW() - W - 6), y = Math.min(sy, this.hudH() - H - 6);
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
    this.hudFx(this.ctxMenu); // RTS-30d-fix: a runtime HUD object — the MAIN camera must ignore it, or it double-renders in world space
  }

  /** EXTORT a specific building: order a free thug to MOVE-AND-SHAKEDOWN it. */
  /** RTS-35b — EMBODIED EXTORTION (CANON REV c). Extort DELIVERY is now POSITIONAL: a thug paths to the
   * front, squares up at the door, and performs a TIMED shakedown while physically present — the front
   * converts on completion (no converting from across the map). ELIGIBILITY/ECONOMY are unchanged: the
   * order is gated by canIssueMoveAndShakedown and, on resolve, the wrapper invokes the EXISTING
   * recordExtortVisit conversion. Cost = time + a thug occupied, NOT cash. */
  private commandExtortBusiness(businessId: string): void {
    const tile = businessTileOf(this.layout, businessId);
    if (!tile) return;
    // RTS-35b.1 — SELECTION IS AUTHORITATIVE: the order goes to the SELECTED thug, never an arbitrary
    // free one. No selection → require one (the right-click menu is already selection-gated; this matches).
    const thug = this.selectedPlayerThug();
    if (!thug) { this.setStatus('select one of your thugs first, then order the shakedown'); return; }
    // RTS-35d — the gate now allows a RETAKE (a rival-held front whose guard is cleared) when given the
    // front tile, as well as the 35b un-taken front; it states the reason (incl. "clear the guard first").
    const gate = canIssueMoveAndShakedown(this.state, thug.id, businessId, tile);
    if (!gate.ok) { this.setStatus(gate.reason); return; }
    const retake = isRivalHeldFront(this.state, businessId);
    // RTS-35b.1 — a busy selected thug is RE-TASKED (not silently handed off): the wrapper replaces his
    // existing act (dedup by thugId) and issueMove re-paths him — consistent with a MOVE order overriding.
    const wasBusy = this.extortBusyThugIds().has(thug.id);
    // resolution 2: the interaction point is the building-CENTER seed. Walk the thug there; the act
    // accrues the shakedown only once he is AT the door (the positional gate).
    const interaction = frontInteractionPoint(tile);
    issueMove(thug, interaction, this.navGrid);
    // create the act through the WRAPPER (proves applyCommand is untouched) — it pushes onto state.extortionActs.
    applyCommandWithEmbodiedExtortion(this.state, { type: 'moveAndShakedown', familyId: 'player', thugId: thug.id, frontId: businessId }, () => {}, interaction);
    this.focusBizId = businessId;
    const name = inspectBusiness(this.state, businessId)?.name ?? 'the block';
    const verb = retake ? 'muscle' : 'shake down';
    this.setStatus(wasBusy
      ? `pulled your man off his last job — he's on the way to ${verb} ${name}`
      : retake
        ? `your man is moving in to muscle ${name} back off the rival — he leans on it once he's at the door`
        : `your man is on the way to shake down ${name} — he leans on it once he's at the door`);
  }

  /** RTS-35b — the thug ids currently committed to an embodied-extortion act (for the re-task readout). */
  private extortBusyThugIds(): Set<string> {
    return new Set((this.state.extortionActs ?? []).map((a) => a.thugId));
  }

  /** RTS-35b.1 — the SELECTED player thug an embodied order is issued to (selection is AUTHORITATIVE).
   * Faction/role are resolved from the VIEW layer (sim muscle units carry no factionId/role); the pure
   * pickSelectedMuscle seam makes it testable. A busy selected thug is still returned — the caller
   * RE-TASKS it (never a silent hand-off to a different thug). */
  private selectedPlayerThug(): MovableUnit | undefined {
    const candidates: MuscleCandidate[] = this.units.map((v) => ({
      id: v.unit.id,
      faction: v.faction,
      isCollector: v.unit.role === 'collector',
      idle: v.unit.path.length === 0,
    }));
    const pick = pickSelectedMuscle(candidates, this.selection.ids);
    return pick ? this.state.units.find((u) => u.id === pick.id) : undefined;
  }

  /** RTS-35b — render the embodied-extortion state transitions the wrapper raised this step (the front
   * conversion ALREADY fired inside the sim via the EXISTING recordExtortVisit path; here we only react):
   *  • entering shakedown → a "leaning on them" cue (VO/SFX + status) and the building starts to shudder
   *  • converted → the Lean beat: brick-dust + coin-stamp, the fixed collector spawns, the front flips to [$]
   *  • interrupted → a "they jumped your man" warning (the brawl knocked him off the shakedown)
   *  • failed → a "shakedown blown" line (downed / target gone / walked off / lost the fight) */
  private processExtortionEvents(events: EmbodiedExtortionEvent[]): void {
    for (const ev of events) {
      const tile = businessTileOf(this.layout, ev.frontId);
      const c = tile ? gridToScreen(tile.gx, tile.gy) : undefined;
      const name = inspectBusiness(this.state, ev.frontId)?.name ?? 'the block';
      const thugView = this.units.find((v) => v.unit.id === ev.thugId);
      // INFO-FEEDBACK — log the embodied transition (front.converted / front.retaken / extort.failed). The
      // 'extort.failed' wording is kind-aware (a blown shakedown vs a hit that fell through).
      const ik = extortionEventKind(ev);
      if (ik) {
        const msg = ik === 'extort.failed'
          ? (ev.kind === 'sabotage' ? `the hit on ${name} fell through` : `shakedown on ${name} blown`)
          : `${name} ${ev.retook ? 'muscled back' : 'now pays protection'}`;
        this.recordInfoEvent(ik, msg, tile?.gx, tile?.gy);
      }
      // EMBODIMENT — the embodied building-ATTACK landed: the thug reached the racket and shut it down (the
      // EXISTING resolveAttack already fired in the sim). Surface the danger-MOTION beat + the shutdown read.
      if (ev.sabotaged) {
        this.state = harvestIncidents(this.state);
        if (c) {
          this.triggerAttackMotion(thugView, thugView?.unit.weapon, c.x);
          this.combatContact(c.x, c.y, combatVfxForVerb('attack'));
          this.floatText(c.x, c.y - 30, 'SHUT DOWN', SPEC.danger);
        }
        this.signalBeat('attack');
        this.setStatus(`${name} shut down — it stops producing`);
        this.extortShoveAt.delete(ev.thugId);
        continue;
      }
      if (ev.converted) {
        // the EXISTING conversion already set extortedBy — surface the felt beat (mirror of the old flow).
        this.state = harvestIncidents(this.state);
        recordRacketRun(ensureRunStats(this.state)); // Lane L — a front shaken into a paying racket
        if (c) {
          this.triggerAttackMotion(thugView, undefined, c.x); // a final committing SHOVE on the storefront
          this.seedBackPay(ev.frontId); this.leanBeat(c.x, c.y); this.signalBeat('extort');
          if (tile) this.flashConverted(tile.gx, tile.gy);    // a brass flash-to-converted on the building
        }
        const setup = ensureBusinessCollector(this.state, this.layout, 'player', ev.frontId, this.navGrid);
        if (setup) this.attachView(setup.unit, 'player');
        // RTS-35d — a RETAKE reads as muscling the block back off the rival (ownership flipped rival→player).
        this.setStatus(ev.retook
          ? `${name} is yours again — muscled it back off the rival (a collector is on the way)`
          : `${name} folded — it pays protection now (a collector is on the way)`);
        this.extortShoveAt.delete(ev.thugId);
        continue;
      }
      if (ev.failed) {
        if (c) this.floatText(c.x, c.y - 30, ev.kind === 'sabotage' ? 'HIT BLOWN' : 'SHAKEDOWN BLOWN', SPEC.danger);
        this.setStatus(ev.kind === 'sabotage'
          ? `the hit on ${name} fell through — send muscle again when it's clear`
          : `the shakedown on ${name} fell through — send muscle again when the block's clear`);
        this.extortShoveAt.delete(ev.thugId);
        continue;
      }
      if (ev.state === 'shakedown' && ev.prevState !== 'shakedown') {
        // the thug squared up and started leaning on them — open with a shove + the lean cue.
        if (c) this.triggerAttackMotion(thugView, undefined, c.x);
        this.signalBeat('extort');
        this.setStatus(`your man is leaning on ${name} — hold the block while he works`);
        this.extortShoveAt.set(ev.thugId, this.time.now + EXTORT_SHOVE_INTERVAL_MS);
      } else if (ev.state === 'interrupted') {
        if (c) this.floatText(c.x, c.y - 30, 'JUMPED!', SPEC.danger);
        this.setStatus(`they jumped your man at ${name} — clear the brawl before the shakedown's blown`);
      }
    }
  }

  /** RTS-35b — a brass flash-to-converted pulse over a just-folded front (a beat, not a static wash). */
  private flashConverted(gx: number, gy: number): void {
    const c = gridToScreen(gx, gy);
    const ring = this.add.circle(c.x, c.y - 8, 8).setStrokeStyle(3, hexNum(SPEC.brass), 0.9).setDepth(100001);
    this.worldFx(ring);
    this.tweens.add({ targets: ring, scale: 4.5, alpha: 0, duration: 520, ease: 'Quad.Out', onComplete: () => ring.destroy() });
  }

  /** RTS-35b — the player's BRASS extortion intent + progress feedback, redrawn each frame onto one
   * world-layer graphic (brass = player; #B8862B): EN ROUTE a thin intent line from the thug to the
   * front he's been sent to lean on; AT THE DOOR (engage/shakedown) a filling progress ARC over the
   * storefront so you can read how close the shakedown is to folding it. Fog-gated like the coin badges. */
  private drawExtortOverlay(now: number): void {
    const g = this.extortOverlay ?? (this.extortOverlay = (() => { const gr = this.add.graphics().setDepth(100000); this.worldFx(gr); return gr; })());
    g.clear();
    const acts = this.state.extortionActs ?? [];
    if (acts.length === 0) return;
    const brass = hexNum(SPEC.brass);
    for (const act of acts) {
      const tile = businessTileOf(this.layout, act.frontId);
      if (!tile || !isRevealed(this.fog, tile.gx, tile.gy)) continue;
      const fc = gridToScreen(tile.gx, tile.gy);
      const thug = this.state.units.find((u) => u.id === act.thugId);
      if (act.state === 'approach' && thug) {
        // intent line: thug → front (a faint brass tether reads "this man is going to lean on that block").
        const ts = unitScreenPos(thug);
        g.lineStyle(2, brass, 0.35 + 0.15 * Math.sin(now / 320));
        g.beginPath(); g.moveTo(ts.x, ts.y - 4); g.lineTo(fc.x, fc.y - 8); g.strokePath();
        g.fillStyle(brass, 0.6); g.fillCircle(fc.x, fc.y - 8, 3);
      } else if (act.state === 'engage' || act.state === 'shakedown' || act.state === 'interrupted') {
        // progress arc over the storefront: a faint track ring + a brass sweep filling with progress.
        const cx = fc.x, cy = fc.y - 30, r = 13;
        g.lineStyle(3, brass, 0.18);
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.strokePath();
        const frac = act.state === 'interrupted' ? 0 : Math.max(0.02, act.progress);
        const a0 = -Math.PI / 2;
        g.lineStyle(3, brass, act.state === 'interrupted' ? 0.4 + 0.3 * Math.sin(now / 120) : 0.95);
        g.beginPath(); g.arc(cx, cy, r, a0, a0 + Math.PI * 2 * frac); g.strokePath();
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
  /** EMBODIMENT CONSISTENCY — ATTACK a business is now POSITIONAL (the mirror of the embodied shakedown):
   * the SELECTED thug WALKS to the racket and dwells in proximity before it shuts down — no instant-at-range
   * effect. The shutdown (the EXISTING resolveAttack) fires on arrival inside the sim (processExtortionEvents
   * renders the beat). Selection is authoritative (consistent with 35b.1). */
  private commandAttackBusiness(businessId: string): void {
    const tile = businessTileOf(this.layout, businessId);
    if (!tile) return;
    const thug = this.selectedPlayerThug();
    if (!thug) { this.setStatus('select one of your thugs first, then send them to wreck the racket'); return; }
    const gate = canIssueMoveAndSabotage(this.state, thug.id, businessId, 'player');
    if (!gate.ok) { this.setStatus(`can't attack: ${gate.reason}`); return; }
    const wasBusy = this.extortBusyThugIds().has(thug.id);
    const interaction = frontInteractionPoint(tile);
    issueMove(thug, interaction, this.navGrid);
    // create the embodied act through the WRAPPER (applyCommand untouched) — it shuts the racket down on resolve.
    applyCommandWithEmbodiedExtortion(this.state, { type: 'moveAndSabotage', familyId: 'player', thugId: thug.id, businessId }, () => {}, interaction);
    this.focusBizId = businessId;
    const c = gridToScreen(tile.gx, tile.gy);
    this.flashAttackIntent(unitScreenPos(thug).x, unitScreenPos(thug).y, c.x, c.y); // the danger-MOTION intent tether (no static wash)
    this.signalBeat('attack');
    const name = inspectBusiness(this.state, businessId)?.name ?? 'the racket';
    this.setStatus(wasBusy
      ? `pulled your man off his last job — he's moving in to wreck ${name}`
      : `your man is moving in to wreck ${name} — it shuts down once he's leaned on it`);
  }

  /** [T] — set up (or refresh) the automated collection route over your protected businesses. */
  private commandSelect(p: Phaser.Input.Pointer, shift: boolean): void {
    const point = screenToGrid(p.worldX, p.worldY);
    // RTS-30d-2: only COMMANDABLE units are selectable (collectors are autonomous — not orderable).
    const hit = pickUnit(this.commandableViews().map((v) => v.unit), point);
    if (hit) {
      this.focusBizId = undefined;
      this.hideCollectorInfo();
      this.selection = shift ? toggleSelection(this.selection, hit.id) : selectOnly(hit.id);
      this.setStatus();
      return;
    }
    // RTS-30d-2: a click ON a collector opens its READ-ONLY popover (visibility, no control).
    const col = pickUnit(this.units.filter((v) => v.faction === 'player' && v.unit.role === 'collector').map((v) => v.unit), point);
    if (col) { this.focusBizId = undefined; if (!shift) this.selection = clearSelection(); this.showCollectorInfo(col); return; }
    this.hideCollectorInfo();
    // ⭐ DISCOVERABILITY: a LEFT-click on a RIVAL fighter (not selectable — it's the enemy) tells the player
    // the ATTACK gesture instead of silently deselecting, and KEEPS the crew selected so they can right-click
    // it straight away. (The player report was "the attack function doesn't work / is locked" — make it obvious.)
    const foe = pickUnit(this.units.filter((v) => v.faction === 'rival' && v.unit.role !== 'collector').map((v) => v.unit), point);
    if (foe) {
      this.setStatus(this.selection.ids.length > 0
        ? "that's a rival — RIGHT-CLICK it to send your crew in (they trade blows on contact)"
        : "that's a rival — select one of your thugs, then RIGHT-CLICK it to ATTACK");
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

  /** RTS-35c — the contextual right-click: ROUTE the order by TARGET TYPE (the pure orderVerbFor seam),
   * so attacking a rival and extorting a front are never confused. A RIVAL UNIT under the cursor → ATTACK
   * (move-to-engage; 35a proximity combat resolves it); a BUILDING → the EXTORT/ATTACK menu (RTS-22/23,
   * gated on a selection); empty GROUND → MOVE. No new combat/extortion — pure dispatch to the existing
   * systems. Selection gating lives in each command (consistent with 35b.1 — selection is authoritative). */
  private commandContextual(p: Phaser.Input.Pointer): void {
    const gpoint = screenToGrid(p.worldX, p.worldY);
    const hitUnit = pickUnit(this.units.map((v) => v.unit), gpoint);
    const hitView = hitUnit ? this.units.find((v) => v.unit.id === hitUnit.id) : undefined;
    // a RIVAL COMBATANT (non-collector) is the attack target; collectors stay autonomous (robbed via
    // interception, never a unit-attack target).
    const rival = hitView && hitView.faction === 'rival' && hitView.unit.role !== 'collector' ? hitUnit : undefined;
    const bizId = this.businessAtScreen(p.worldX, p.worldY);
    const target: OrderTarget = rival
      ? { kind: 'rival', unitId: rival.id }
      : bizId
        ? { kind: 'front', businessId: bizId }
        : { kind: 'ground', tile: screenToTile(p.worldX, p.worldY) };
    const verb = orderVerbFor(target);
    if (verb === 'attack' && target.kind === 'rival') this.commandAttackUnit(target.unitId);
    else if (verb === 'extort' && target.kind === 'front') {
      if (this.selection.ids.length > 0) this.openBizMenu(target.businessId, p.x, p.y);
      else this.commandMove(p); // no crew selected → a right-click on a building just walks there (legacy rule)
    } else this.commandMove(p);
  }

  /** RTS-35c — ATTACK a RIVAL UNIT: order the SELECTED crew to MOVE-TO-ENGAGE it. No new combat — the
   * thug paths onto the rival and the 35a proximity combat trades blows on contact. Selection is the
   * actor (consistent with 35b.1); the danger-red intent line + reticle are the attack analog of the
   * brass extort intent. */
  private commandAttackUnit(rivalId: string): void {
    const rival = this.state.units.find((u) => u.id === rivalId);
    const rivalView = this.units.find((v) => v.unit.id === rivalId);
    if (!rival || !rivalView || rivalView.faction !== 'rival') return;
    const thug = this.selectedPlayerThug();
    if (!thug) { this.setStatus('select one of your thugs first, then order the hit'); return; }
    // move-to-engage: walk the selected crew onto the rival's tile — auto-engage does the rest.
    const dest = unitTile(rival);
    const res = resolveMoveCommand(this.units.map((v) => v.unit), this.selection.ids, dest, this.navGrid);
    for (const id of res.moved) this.unitOrders.delete(id); // a direct ATTACK order cancels any stance
    const from = unitScreenPos(thug), to = unitScreenPos(rival);
    this.flashAttackIntent(from.x, from.y, to.x, to.y);
    this.signalBeat('attack');
    this.setStatus(`${res.moved.length > 1 ? `${res.moved.length} thugs` : 'your man'} moving in on the rival — they trade blows on contact`);
  }

  /** RTS-35c — the ATTACK intent feedback: the danger-red analog of the brass extort intent line. A
   * pulsing tether from the thug to the rival + a reticle that snaps onto the target then fades. MOTION
   * only (a brief fading line + shrinking ring), never a static red wash. */
  private flashAttackIntent(fromWx: number, fromWy: number, toWx: number, toWy: number): void {
    const line = this.add.graphics().setDepth(100001);
    this.worldFx(line);
    line.lineStyle(2, hexNum(SPEC.danger), 0.9);
    line.beginPath(); line.moveTo(fromWx, fromWy - 4); line.lineTo(toWx, toWy - 8); line.strokePath();
    this.tweens.add({ targets: line, alpha: 0, duration: 600, onComplete: () => line.destroy() });
    const reticle = this.add.circle(toWx, toWy - 8, 16).setStrokeStyle(3, hexNum(SPEC.danger), 0.95).setDepth(100001);
    this.worldFx(reticle);
    this.tweens.add({ targets: reticle, scale: 0.5, alpha: 0, duration: 600, ease: 'Quad.Out', onComplete: () => reticle.destroy() });
  }

  private commandMove(p: Phaser.Input.Pointer): void {
    if (this.selection.ids.length === 0) return;
    const target = screenToTile(p.worldX, p.worldY);
    if (!isCommandableTile(target, this.navGrid)) { this.drawTargetMarker(target, false); return; }
    const res = resolveMoveCommand(this.units.map((v) => v.unit), this.selection.ids, target, this.navGrid);
    for (const id of res.moved) this.unitOrders.delete(id); // a fresh MOVE cancels any STOP/HOLD/ATTACK-MOVE stance
    this.drawTargetMarker(target, res.moved.length > 0);
    this.setStatus(`moving ${res.moved.length} → (${target.gx},${target.gy})${res.failed.length ? ` · ${res.failed.length} blocked` : ''}`);
  }

  // ── COMBAT CONTROL VERBS (input-only: STOP / HOLD / ATTACK-MOVE) ───────────────────────────────
  // Reuse the EXISTING order system (issueMove / stopUnit) + the 35a proximity auto-engage; the per-unit
  // stance lives render-side (the sim unit type is untouched) and the pure combatOrders module decides.
  // Selection is authoritative — these act on the SELECTED commandable player crew.

  /** The selected, commandable PLAYER fighters (thugs/enforcers; collectors stay autonomous). */
  private selectedCombatViews(): UnitView[] {
    return this.units.filter((v) =>
      this.selection.ids.includes(v.unit.id) && v.faction === 'player' && isCommandableUnit(v.unit) && v.unit.role !== 'collector');
  }

  /** [S] STOP — cancel the selected crew's orders and hold their tile (clears path + any stance). */
  private commandStop(): void {
    const sel = this.selectedCombatViews();
    if (sel.length === 0) { this.setStatus('select crew first, then [S] to stop'); return; }
    for (const v of sel) { stopUnit(v.unit); this.unitOrders.delete(v.unit.id); } // clear orders → NORMAL, held tile
    this.attackMovePending = false;
    this.setStatus(`STOP — ${sel.length} holding position`);
  }

  /** [I] HOLD — the selected crew stands and fights without chasing (a persistent stance). [H] stays help. */
  private commandHold(): void {
    const sel = this.selectedCombatViews();
    if (sel.length === 0) { this.setStatus('select crew first, then [I] to hold'); return; }
    for (const v of sel) { stopUnit(v.unit); this.unitOrders.set(v.unit.id, holdOrder()); } // stand; 35a fights what's in range
    this.attackMovePending = false;
    this.setStatus(`HOLD — ${sel.length} stand & fight, no chase`);
  }

  /** [A] — arm ATTACK-MOVE: the next left-click sets the destination (engage any hostile met en route). */
  private beginAttackMove(): void {
    if (this.selectedCombatViews().length === 0) { this.setStatus('select crew first, then [A] attack-move'); return; }
    this.attackMovePending = true;
    this.setStatus('ATTACK-MOVE — left-click a destination');
  }

  /** Issue the armed ATTACK-MOVE to the destination under the cursor: path the crew there + tag the stance
   * so applyUnitOrders diverts them onto any hostile they meet, then resumes the advance. */
  private commandAttackMove(p: Phaser.Input.Pointer): void {
    const sel = this.selectedCombatViews();
    if (sel.length === 0) return;
    const target = screenToTile(p.worldX, p.worldY);
    if (!isCommandableTile(target, this.navGrid)) { this.drawTargetMarker(target, false); return; }
    const ids = sel.map((v) => v.unit.id);
    const res = resolveMoveCommand(this.units.map((v) => v.unit), ids, target, this.navGrid);
    for (const id of res.moved) this.unitOrders.set(id, attackMoveOrder(target));
    this.drawTargetMarker(target, res.moved.length > 0);
    this.signalBeat('attack');
    this.setStatus(`ATTACK-MOVE — ${res.moved.length} advancing, engaging hostiles en route`);
  }

  /** Per-tick: drive the STOP/HOLD/ATTACK-MOVE stances against the EXISTING order system. HOLD stands (no
   * chase); ATTACK-MOVE diverts to ENGAGE a hostile in acquire range (35a trades blows on contact) then
   * resumes toward its destination. No new sim mechanic — it only issues moves / stops the player's units. */
  private applyUnitOrders(): void {
    if (this.unitOrders.size === 0) return;
    const orderUnits: OrderUnit[] = this.units.map((v) => ({
      id: v.unit.id, pos: v.unit.pos, factionId: v.unit.factionId, role: v.unit.role, downed: v.unit.downed,
    }));
    for (const v of this.units) {
      if (v.faction !== 'player') continue;
      const order = this.unitOrders.get(v.unit.id);
      if (!order || order.stance === 'NORMAL') continue;
      const self: OrderUnit = { id: v.unit.id, pos: v.unit.pos, factionId: v.unit.factionId, role: v.unit.role, downed: v.unit.downed };
      const decision = resolveAutoOrder(self, order, orderUnits, ATTACK_MOVE_ACQUIRE_RADIUS);
      if (decision.kind === 'engage') {
        if (v.unit.path.length === 0) issueMove(v.unit, decision.tile, this.navGrid); // walk onto the foe; re-acquire on arrival
      } else if (decision.kind === 'advance') {
        if (v.unit.path.length === 0) issueMove(v.unit, decision.tile, this.navGrid); // resume toward the destination
      } else if (decision.kind === 'hold') {
        if (order.stance === 'HOLD') v.unit.path = []; // HOLD never moves (defends in place)
      }
    }
    // prune stances for units that left play (downed/removed), so the map can't grow unbounded.
    for (const id of [...this.unitOrders.keys()]) if (!this.units.some((v) => v.unit.id === id)) this.unitOrders.delete(id);
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

  /** [C] RUSH COLLECTION — collectors are autonomous (one per front, banking on their own rounds); this
   * EXPEDITES that flow: send a collector for the accrued takings NOW instead of waiting for the next
   * auto-run. Reuses the existing collector/route/bank machinery (rushCollection) — NOT a second money
   * path, only earlier timing. A clear no-op when nothing has accrued or a rushed collector is already
   * on its way. (Rushing into a contested district is a real risk — collectors are robbable there.) */
  private commandCollect(): void {
    const hotBefore = dispatchThreat(this.state, this.layout, 'player').hot; // before the source empties
    const out = rushCollection(this.state, this.layout, 'player', this.navGrid);
    if (!out.ok) {
      this.setStatus(out.reason === 'in-flight'
        ? 'a rushed collector is already on its way — let it bank before sending another'
        : 'nothing to rush yet — takings build each week after a shakedown');
      return;
    }
    this.attachView(out.unit, 'player');
    // RTS-34.1 — make the dispatch a FELT beat, not just copy: a dispatch SOUND (runner out the door)
    // on top of the crew VO, and a visible brass "RUNNER OUT" punch at the spawn so the player SEES the
    // collector leave. Collectors stay AUTONOMOUS — this only juices the player-initiated [C] rush.
    this.audio?.dispatch();
    this.audio?.confirm(); // RTS-27 crew-order confirm on dispatch
    this.rushUsed = true;  // the player learned [C] — the onboarding prompt can now retire
    const sp = gridToScreen(out.unit.pos.gx, out.unit.pos.gy);
    this.floatText(sp.x, sp.y - 34, '▸ RUNNER OUT', NOIR_PALETTE.brass);
    const dName = this.districtName(out.districtId);
    if (out.unit.protectedRun) {
      this.setStatus(`RUSHED a collector from ${dName} for $${out.carrying} — first run rides home SAFE`);
    } else if (hotBefore) {
      const c = gridToScreen(out.unit.pos.gx, out.unit.pos.gy);
      this.floatText(c.x, c.y - 30, 'RUSHED INTO DANGER!', NOIR_PALETTE.blood);
      this.setStatus(`RUSHED a collector from ${dName} into a HOT route — keep it clear of the enforcer!`);
    } else {
      this.setStatus(`RUSHED a collector from ${dName} for $${out.carrying} — pulling the take home early`);
    }
  }

  /** [R] — reinvest: open the priciest racket you can afford in your strongest district. */
  private commandReinvest(): void {
    const kind = affordableOperation(this.state.player.cash);
    if (!kind) { this.setStatus('not enough clean cash to open a racket yet'); return; }
    const d = strongholdDistrict(this.state, 'player');
    applyCommand(this.state, { type: 'establishOperation', familyId: 'player', districtId: d.id, kind });
    this.state = harvestIncidents(this.state);
    recordRacketRun(ensureRunStats(this.state)); // Lane L — a racket brought online
    const hq = hqTileOf(this.layout, 'player');
    if (hq) { const c = gridToScreen(hq.gx, hq.gy); this.floatText(c.x, c.y - 30, `OPENED ${kind.toUpperCase()} RACKET`, NOIR_PALETTE.brass); }
    this.audio?.laundering(); this.audio?.confirm(); this.fireTipOnce('launder'); // RTS-34 typewriter (cooking the books) + RTS-27 confirm + money tip
    this.setStatus(`opened a ${kind} racket in ${d.name}`);
  }

  /** The live grease pressure on each channel, read from the EXISTING pure sim helpers (no new heat model).
   * Lets [G] target the hottest channel and powers the targeting that fixes the "forced to pay all four"
   * degeneracy from Playtest #1. */
  private greasePressure(): GreasePressure {
    const p = this.state.player;
    return {
      raidRisk: raidChance(p.heat, p.bribes.police),  // POLICE buys this down
      federalExposure: federalExposure(p),            // FEDS buys this down
      heat: p.heat,                                    // POLITICIANS cool it (decay)
      bustArmed: !!p.bustArmed,                        // JUDGES survive it
    };
  }

  /**
   * GREASE — now TARGETABLE (Playtest #1 fix). [G] greases the HOTTEST channel (so a lean player pays only
   * what's hot); clicking a channel row greases THAT specific channel. Each channel maps to a distinct heat
   * source in the sim (police→raids, politicians→heat decay, judges→bust, feds→federal exposure), so paying
   * the relevant one reduces the relevant pressure — no longer forced to spread $10 across all four.
   */
  private commandGrease(channel?: BribeChannel): void {
    const ch = channel ?? hottestChannel(this.greasePressure());
    const cur = this.state.player.bribes[ch];
    applyCommand(this.state, { type: 'setBribe', familyId: 'player', channel: ch, amount: cur + 10 });
    this.state = harvestIncidents(this.state);
    const paid = this.state.player.bribes[ch] > cur;
    if (paid) {
      recordBribePaid(ensureRunStats(this.state), ch, this.state.player.bribes[ch] - cur); // Lane L — greased $ by channel
      this.audio?.grease(ch); this.audio?.confirm(); this.fireTipOnce('grease'); // RTS-27 distinct cue per channel
    }
    const how = channel ? '' : ' (hottest)';
    const greaseMsg = paid ? `greased ${bribeChannelLabel(ch)}${how} → $${this.state.player.bribes[ch]}/wk` : `can't afford to grease ${bribeChannelLabel(ch)}`;
    this.setStatus(greaseMsg);
    // LANE K — surface the bribe outcome on THE WIRE so the player can read that a channel landed (or that
    // they came up short). Non-positional (an abstract channel action) — logs only, no arrow/ping.
    this.recordInfoEvent(bribeEventKind(paid), greaseMsg);
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
  /** [6] / toolbar RECRUIT — open the recruit MENU (a plain Thug + the RTS-30c-2a weapon-tier specialists,
   * each with its cost + channel-gate state). Mouse-first; reuses the context-menu infra. */
  private commandRecruit(): void { this.openRecruitMenu(); }

  /** Spawn an on-map player muscle unit at HQ (so it's fieldable in the war + counts toward muscle
   * presence). `weapon` set ⇒ a weapon-tier silhouette; absent ⇒ a plain thug. */
  private spawnPlayerMuscle(weapon?: WeaponTier): void {
    const hq = hqTileOf(this.layout, 'player');
    if (!hq) return;
    const u = spawnUnit(`muscle-${weapon ?? 'thug'}-${this.state.tick}-${this.units.length}`, hq.gx, hq.gy, STROLL_SPEED);
    u.weapon = weapon;
    // COMBAT DEPTH FINALIZE (Part A) — copy the enforcer's combat SKILL (= the recruited gangster's skill)
    // onto the on-map unit so the already-built+tested tuning modifiers fire. The caps guarantee no
    // burst-delete even at skill 10, so this is a safe realization of the intended depth, not a new mechanic.
    u.skill = enforcerUnitSkill(weapon);
    this.addUnit(u, 'player');
    const c = gridToScreen(hq.gx, hq.gy);
    this.floatText(c.x, c.y - 30, weapon ? `NEW ${weapon.toUpperCase()}` : 'NEW MUSCLE', NOIR_PALETTE.brass);
  }

  /** Recruit a plain Thug (the original [6] behaviour) + field it on the map. */
  private recruitThug(): void {
    if (this.state.player.cash < RECRUIT_COST) { this.setStatus(`can't afford to recruit (need $${RECRUIT_COST})`); return; }
    const before = this.state.player.gangsters.length;
    applyCommand(this.state, { type: 'recruitGangster', familyId: 'player' });
    this.state = harvestIncidents(this.state);
    if (this.state.player.gangsters.length > before) {
      this.spawnPlayerMuscle(); this.audio?.confirm();
      const strength = familyStrength(this.state.player);
      const toward = strength >= ASSASSINATE_MIN_STRENGTH ? 'hit-ready' : `${strength}/${ASSASSINATE_MIN_STRENGTH} toward a hit`;
      this.setStatus(`recruited muscle — crew ${this.state.player.gangsters.length}, strength ${toward}`);
    } else this.setStatus('no one to recruit right now');
  }

  /** Recruit a channel-gated weapon-tier specialist (pure recruitEnforcer) + field it on the map. */
  private recruitSpecialist(tier: WeaponTier): void {
    const res = recruitEnforcer(this.state, tier);
    if (!res.ok) { this.setStatus(`can't recruit that — ${res.reason}`); return; }
    this.state = harvestIncidents(this.state);
    this.spawnPlayerMuscle(tier); this.audio?.confirm();
    this.setStatus(`recruited a ${res.gangster?.name ?? tier} — crew ${this.state.player.gangsters.length}, heat is up`);
  }

  /** The RECRUIT menu: a Thug + each weapon-tier specialist with its cost + locked/ready channel-gate. */
  private openRecruitMenu(): void {
    this.closeBizMenu();
    const p = this.input.activePointer;
    const thugReady = this.state.player.cash >= RECRUIT_COST;
    const rows: { label: string; sub: string; color: string; enabled: boolean; hint: string; act: () => void }[] = [
      { label: `THUG  $${RECRUIT_COST}`, sub: 'street muscle', color: thugReady ? SPEC.brass : NOIR_PALETTE.fog, enabled: thugReady, hint: thugReady ? '▸' : `need $${RECRUIT_COST}`, act: () => this.recruitThug() },
    ];
    for (const o of recruitableEnforcers(this.state) as RecruitOption[]) {
      rows.push({
        label: `${o.spec.label}  $${o.spec.cost}`,
        sub: `${o.spec.channelLabel} · +${o.spec.heat}🔥`,
        color: o.gate.ok ? SPEC.brass : NOIR_PALETTE.fog,
        enabled: o.gate.ok,
        hint: o.gate.ok ? '▸' : o.gate.reason, // "needs The Beat ≥ $N/wk"
        act: () => this.recruitSpecialist(o.tier),
      });
    }
    const W = 264, rowH = 30, headH = 26, H = headH + rows.length * rowH + 6;
    const px = this.hudX(p.x), py = this.hudY(p.y); // logical HUD position (UI-scale)
    const x = Math.min(px, this.hudW() - W - 6), y = Math.min(Math.max(8, py - H), this.hudH() - H - 6);
    const bg = this.add.rectangle(0, 0, W, H, PAL.ink, 0.97).setOrigin(0, 0).setStrokeStyle(2, PAL.brass, 0.9);
    const head = this.mkText(8, 5, 'RECRUIT — crew + specialists', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(0, 0);
    const objs: Phaser.GameObjects.GameObject[] = [bg, head];
    this.ctxRows = [];
    rows.forEach((r, i) => {
      const ry = headH + i * rowH;
      const rowBg = this.add.rectangle(3, ry, W - 6, rowH - 2, PAL.charcoal, r.enabled ? 0.55 : 0.18).setOrigin(0, 0);
      const lbl = this.mkText(10, ry + 3, r.label, { fontFamily: NOIR_FONT, fontSize: '13px', color: r.color, fontStyle: 'bold' }).setOrigin(0, 0);
      const sub = this.mkText(10, ry + 17, r.sub, { fontFamily: NOIR_FONT, fontSize: '10px', color: NOIR_PALETTE.fog }).setOrigin(0, 0);
      const hint = this.mkText(W - 8, ry + 9, r.hint, { fontFamily: NOIR_FONT, fontSize: '10px', color: r.enabled ? NOIR_PALETTE.brass : NOIR_PALETTE.fog }).setOrigin(1, 0);
      objs.push(rowBg, lbl, sub, hint);
      if (r.enabled) this.ctxRows.push({ y0: y + ry, y1: y + ry + rowH - 2, act: r.act });
    });
    this.ctxRect = { x, y, w: W, h: H };
    this.ctxMenu = this.add.container(x, y, objs).setScrollFactor(0).setDepth(100200);
    this.hudFx(this.ctxMenu); // RTS-30d-fix: a runtime HUD object — the MAIN camera must ignore it, or it double-renders in world space
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

  // ── RTS-30e game-feel: action motion + combat-contact VFX + the kill beat ──────────────────────

  /** The player unit that should ACT for a command: the first selected commandable unit, else the
   * nearest player muscle to the target world point (so a click without a selection still animates). */
  private actingUnitView(targetWx?: number, targetWy?: number): UnitView | undefined {
    const sel = this.commandableViews().find((v) => this.selection.ids.includes(v.unit.id));
    if (sel) return sel;
    const muscle = this.commandableViews();
    if (muscle.length === 0 || targetWx === undefined || targetWy === undefined) return muscle[0];
    let best = muscle[0], bestD = Infinity;
    for (const v of muscle) { const s = unitScreenPos(v.unit); const d = Math.hypot(s.x - targetWx, s.y - targetWy); if (d < bestD) { bestD = d; best = v; } }
    return best;
  }

  /** RTS-30e — fire a unit's ATTACK motion (a one-shot recoil/swing) toward a world point. */
  private triggerAttackMotion(view: UnitView | undefined, weapon: WeaponTier | undefined, targetWx: number): void {
    if (!view) return;
    const s = unitScreenPos(view.unit);
    view.attackStartedAt = this.time.now;
    view.attackUntil = this.time.now + weaponAttackDurationMs(weapon);
    view.attackKind = attackMotionForWeapon(weapon);
    view.attackRigWeapon = rigAttackWeaponFromTier(weapon);
    view.attackFaceRight = targetWx >= s.x;
  }

  /** RTS-30e — a unit's HIT-REACT flinch (struck / robbed). With `react`, the flinch dwell + knock-back
   * scale by WEAPON (a shotgun staggers harder + longer than a pistol tap); without it, the legacy
   * base flinch (used by the ambush/raid beats) is unchanged. */
  private triggerHitReact(unitId: string, react?: HitReactParams): void {
    const v = this.units.find((u) => u.unit.id === unitId);
    if (!v) return;
    const dwell = MOTION.hitFlinch * (react?.flinchScale ?? 1) + (react?.staggerMs ?? 0);
    v.hitUntil = this.time.now + dwell;
    v.hitDwellMs = dwell;
    v.hitKnockbackPx = react?.knockbackPx ?? 3;
  }

  /** RTS-35a — render a unit-vs-unit combat beat from the pure sim (resolveProximityCombat): the
   * attacker SWINGS/FIRES (melee swing or ranged recoil by its weapon — reusing the RTS-30e motion
   * system, not a duplicate helper), the struck thug FLINCHES, and on a DOWN the kill beat fires
   * (one danger-MOTION flash → desaturated slump → near-black pool, NEVER rival-red) + the view drops
   * + a "down" line rides The Wire. Combat SFX punctuate the beats. */
  private playCombatBeat(ev: CombatEvent): void {
    const c = gridToScreen(ev.gx, ev.gy);
    // INFO-FEEDBACK — a DOWN is a state change (unit.down, logged always); a HIT is a combat beat (combat.hit,
    // throttled inside the log so swings don't spam). Both carry the event tile.
    const faction: 'player' | 'rival' = ev.faction === this.state.player.id ? 'player' : 'rival';
    this.recordInfoEvent(combatEventKind(ev.kind), ev.kind === 'down' ? `a ${faction} thug went DOWN` : `${faction} thug took a hit`, ev.gx, ev.gy);
    // ⭐ ONE synced attack-commit event drives the three render channels (muzzle flash / hit-react / hit-SFX),
    // frame-aligned with the already-merged weaponAttackPose BODY lane — all off the SAME resolved-attack signal.
    const commit = attackCommitFromCombat(ev, { x: c.x, y: c.y });
    const fb = weaponFeedback(commit.weaponType);
    // NO-FOG-X-RAY: the WORLD FLASH + the SOUND fire only when the struck tile is BOTH fog-revealed AND
    // on-screen, so a brawl never leaks a hidden/off-screen rival's position through a flash or a report.
    const visible = shouldEmitFeedback(isRevealed(this.fog, ev.gx, ev.gy), this.onScreen(c.x, c.y));

    // channel 0 — BODY: the attacker swings/fires (the merged weaponAttackPose lane), driven off this signal.
    const attacker = this.units.find((v) => v.unit.id === ev.attackerId);
    if (attacker) this.triggerAttackMotion(attacker, ev.weapon, c.x);
    // channel 2 — HIT-REACT: the struck body flinches/staggers/knocks back BY WEAPON (tommy burst vs pistol tap).
    this.triggerHitReact(ev.unitId, fb.hitReact);
    // channel 1 — MUZZLE FLASH (per weapon) + channel 3 — HIT-SFX KEY (per weapon). Both gated NO-FOG-X-RAY.
    if (visible) {
      this.weaponMuzzleFlash(c.x, c.y, fb.muzzle);   // distinct procedural flash per weaponType (motion-only danger)
      this.audio?.play(hitSfxKey(commit.weaponType)); // sfx_hit_<weapon> — placeholder until the WAV lands
    }

    if (commit.hitResult === 'hit') {
      if (visible) this.hitPip(c.x, c.y);      // COMBAT READABILITY (2) — a restrained damage-flash pip (no numbers)
      this.cameraBeat('normalHit');            // POLISH v2 · PKG3 — a small punch on every trade
    } else {
      this.cameraBeat('kill');                 // POLISH v2 · PKG3 — a heavier hit-stop on a down
      this.playKill(c.x, c.y, faction);        // ⭐ the kill beat (danger MOTION-only → desat slump → pool; onScreen-gated)
      this.removeUnitById(ev.unitId);          // the sim already dropped the unit; drop its on-map view
      this.setStatus(faction === 'player' ? 'one of your thugs went DOWN — pull back or reinforce' : 'a rival thug went DOWN in the brawl');
    }
  }

  /** ATTACK-COMMIT channel 1 — the per-weapon MUZZLE FLASH. A transient danger glow + spark streaks, sized
   * and coloured by the weapon's MuzzleFlashParams (a bigger/hotter weapon throws a larger flash + more
   * sparks; fists, flashScale 0, lands contact sparks with NO gun-glow). MOTION-ONLY danger — it flashes and
   * fades, never a static mark. World-layer; the caller has already gated NO-FOG-X-RAY + viewport. */
  private weaponMuzzleFlash(wx: number, wy: number, m: MuzzleFlashParams): void {
    if (m.flashScale > 0) {
      const flash = this.add.image(wx, wy - 16, TEX.glow).setTint(hexNum(dangerColor(m.hot))).setScale(m.flashScale * 0.5).setDepth(100001);
      this.worldFx(flash);
      this.tweens.add({ targets: flash, scale: m.flashScale * 2.4, alpha: 0, duration: m.flashMs, ease: 'Quad.Out', onComplete: () => flash.destroy() });
    }
    const sp = m.sparkSpreadPx;
    for (let i = 0; i < m.sparkCount; i++) {
      const spark = this.add.rectangle(wx, wy - 16, 3, 1.5, hexNum(dangerColor(true)), 1).setAngle(Phaser.Math.Between(0, 360)).setDepth(100001);
      this.worldFx(spark);
      this.tweens.add({ targets: spark, x: wx + Phaser.Math.Between(-sp, sp), y: wy - 16 + Phaser.Math.Between(-Math.round(sp * 0.7), Math.round(sp * 0.4)), alpha: 0, duration: 200 + i * 18, onComplete: () => spark.destroy() });
    }
  }

  /** COMBAT READABILITY (2) — a RESTRAINED hit pip: a brief danger tick that pops up off the struck unit and
   * fades (~180ms). No floating damage numbers — a single motion-danger mark, viewport-culled. */
  private hitPip(wx: number, wy: number): void {
    if (!this.onScreen(wx, wy)) return;
    const pip = this.add.rectangle(wx + Phaser.Math.Between(-6, 6), wy - 30, 2.5, 7, hexNum(dangerColor(true)), 1).setDepth(100001);
    this.worldFx(pip);
    this.tweens.add({ targets: pip, y: pip.y - 14, alpha: 0, duration: 180, ease: 'Quad.Out', onComplete: () => pip.destroy() });
  }

  /** COMBAT READABILITY (4) — render the persistent DOWNED BODIES (state.downedBodies, driven by the sim
   * wrapper). A downed unit leaves a DESATURATED, slumped body (canon: desat, never rival-red) that fades
   * out over its persist window, then is cleaned up — instead of the unit vanishing the instant it falls.
   * Pools one image per body; syncs create/fade/destroy against the sim list each frame. */
  private syncDownedBodies(): void {
    const bodies: DownedBody[] = this.state.downedBodies ?? [];
    const live = new Set(bodies.map((b) => b.id));
    // drop views whose body the sim has cleaned up
    for (const [id, img] of this.downedBodyViews) {
      if (!live.has(id)) { img.destroy(); this.downedBodyViews.delete(id); }
    }
    for (const b of bodies) {
      const sp = gridToScreen(b.gx, b.gy);
      let img = this.downedBodyViews.get(b.id);
      if (!img) {
        // a flattened, DESATURATED figure on the ground (grey — never rival-red), behind the living units.
        img = this.add.image(sp.x, sp.y + 4, figureKeyFor(undefined, b.factionId === this.state.player.id ? 'player' : 'rival', 1))
          .setOrigin(0.5, 0.9).setTint(0x6b6358).setScale(1.05, 0.5)
          .setDepth(depthValue(Math.round(b.gx), Math.round(b.gy)) * 10 + 3);
        this.worldFx(img);
        this.downedBodyViews.set(b.id, img);
      }
      img.setAlpha(0.7 * (1 - downedBodyDecay(b))); // fade out toward cleanup
    }
  }

  /** BEAT-COP P0 (?cops=1) — render each beat cop as a small NEUTRAL marker: a blue-grey dot with a
   * bone badge pip (never faction-coloured, never interactive/selectable — cops are not units). The
   * marker is FOG-GATED through the pure copMarkerVisible predicate (NO-X-RAY: an unrevealed cop
   * draws NOTHING); ?reveal=1 debug boards see them all. Pools one Graphics per cop (shape drawn
   * once; per-frame we only move/sort/gate). ?debugCops=1 overlays the current patrol edge. */
  private syncBeatCops(): void {
    const cops: BeatCop[] = this.copsEnabled ? (this.state.beatCops ?? []) : [];
    const live = new Set(cops.map((c) => c.id));
    for (const [id, g] of this.copViews) {
      if (!live.has(id)) { g.destroy(); this.copViews.delete(id); }
    }
    this.copDebugGfx?.clear();
    for (const c of cops) {
      let g = this.copViews.get(c.id);
      if (!g) {
        g = this.add.graphics();
        g.fillStyle(0x000000, 0.22).fillEllipse(0, 3, 16, 7);   // soft ground shadow
        g.fillStyle(0x5c6b7a, 1).fillCircle(0, -3, 6);          // blue-grey coat dot (neutral law read)
        g.lineStyle(1, 0x2c333c, 0.9).strokeCircle(0, -3, 6);   // soot rim so it reads on pale ground
        g.fillStyle(0xd8d2c2, 1).fillCircle(3, -6, 2);          // bone badge pip
        this.worldFx(g);
        this.copViews.set(c.id, g);
      }
      const shown = copMarkerVisible(this.fog, c, this.debugRevealAll);
      g.setVisible(shown);
      if (!shown) continue; // hidden cop: nothing drawn, nothing leaked
      const sp = gridToScreen(c.pos.gx, c.pos.gy);
      g.setPosition(sp.x, sp.y).setDepth(depthValue(Math.round(c.pos.gx), Math.round(c.pos.gy)) * 10 + 3);
      if (this.debugCops && c.path.length > 0) {
        // NO-X-RAY: the patrol edge can point INTO the shroud — draw it only once the WAYPOINT tile
        // is revealed too (?debugCops does not imply ?reveal; the veil discloses nothing).
        const wp = c.path[0];
        if (this.debugRevealAll || isRevealed(this.fog, wp.gx, wp.gy)) {
          const dbg = this.copDebugGfx ?? (this.copDebugGfx = (() => {
            const gr = this.add.graphics().setDepth(100000);
            this.worldFx(gr);
            return gr;
          })());
          const tp = gridToScreen(wp.gx, wp.gy);
          dbg.lineStyle(1.5, 0x8fa3b8, 0.85).lineBetween(sp.x, sp.y, tp.x, tp.y);
          dbg.fillStyle(0x8fa3b8, 0.85).fillCircle(tp.x, tp.y, 2.5);
        }
      }
    }
  }

  /** RTS-30e — the CONTACT vfx at a target (world coords). All MOTION pulses, never a static mark:
   *  muzzle = a danger-red flash + spark streaks; shatter = brass-line shards; dust = a soot mushroom
   *  + debris + shock-ring (the heaviest). Bounded particle counts; world-layer, viewport-culled. */
  private combatContact(wx: number, wy: number, kind: CombatVfx): void {
    if (!this.onScreen(wx, wy)) return; // cost bounded by the viewport, not the map
    // POLISH v2 · PKG3 — the contact's camera FEEL now flows through the tested cameraBeat (hit-stop +
    // decaying-sine nudge) instead of an ad-hoc random shake. dust = a demolition; muzzle/shatter = a hit.
    this.cameraBeat(kind === 'dust' ? 'demolition' : 'normalHit');
    if (kind === 'muzzle') {
      // POLISH v2 · PKG2 — the muzzle SNAPS (≤120ms) in the STANDARD danger #FF5A2C; the live spark is the
      // hotter #E11D1D (the active-danger frame). dangerColor() keeps that discipline in one place.
      const flash = this.add.image(wx, wy - 16, TEX.glow).setTint(hexNum(dangerColor(false))).setScale(0.35).setDepth(100001);
      this.worldFx(flash);
      this.tweens.add({ targets: flash, scale: 1.0, alpha: 0, duration: MUZZLE_FLASH_MS, ease: 'Quad.Out', onComplete: () => flash.destroy() });
      for (let i = 0; i < 5; i++) {
        const spark = this.add.rectangle(wx, wy - 16, 3, 1.5, hexNum(dangerColor(true)), 1).setAngle(Phaser.Math.Between(0, 360)).setDepth(100001);
        this.worldFx(spark);
        this.tweens.add({ targets: spark, x: wx + Phaser.Math.Between(-26, 26), y: wy - 16 + Phaser.Math.Between(-18, 10), alpha: 0, duration: 220 + i * 20, onComplete: () => spark.destroy() });
      }
    } else if (kind === 'shatter') {
      for (let i = 0; i < 9; i++) { // brass-line glass shards (NOT red)
        const shard = this.add.rectangle(wx, wy - 14, Phaser.Math.Between(2, 5), 1.5, hexNum(SPEC.brass), 0.95).setAngle(Phaser.Math.Between(0, 360)).setDepth(100001);
        this.worldFx(shard);
        this.tweens.add({ targets: shard, x: wx + Phaser.Math.Between(-34, 34), y: wy + Phaser.Math.Between(-6, 28), angle: Phaser.Math.Between(-220, 220), alpha: 0, duration: 520 + i * 25, ease: 'Cubic.Out', onComplete: () => shard.destroy() });
      }
    } else { // 'dust' — the demolish mushroom: debris + soot shock-ring + a heavier kick
      const ring = this.add.circle(wx, wy - 6, 6).setStrokeStyle(3, hexNum(SPEC.fog), 0.6).setDepth(100001);
      this.worldFx(ring);
      this.tweens.add({ targets: ring, scale: 6, alpha: 0, duration: 650, ease: 'Quad.Out', onComplete: () => ring.destroy() });
      for (let i = 0; i < 14; i++) {
        const r = Phaser.Math.Between(2, 5);
        const dust = this.add.circle(wx + Phaser.Math.Between(-10, 10), wy - 6, r, hexNum(i % 3 === 0 ? SPEC.brickDark : SPEC.fog), 0.7).setDepth(100001);
        this.worldFx(dust);
        this.tweens.add({ targets: dust, x: dust.x + Phaser.Math.Between(-30, 30), y: wy - 6 - Phaser.Math.Between(20, 58), scale: { from: 1, to: 1.8 }, alpha: 0, duration: 800 + i * 30, ease: 'Quad.Out', onComplete: () => dust.destroy() });
      }
      // POLISH v2 · PKG2 — a slow SMOKE column rides ONLY this lingering-damage beat (smokeAllowed('dust'));
      // a clean muzzle/shatter never smokes. Shaped by smokeCurve (peak ~0.6, long rise→fall).
      if (smokeAllowed('dust')) {
        const peak = smokeCurve(0.2).alpha;
        for (let i = 0; i < 3; i++) {
          const smoke = this.add.circle(wx + Phaser.Math.Between(-8, 8), wy - 8, Phaser.Math.Between(5, 9), hexNum(SPEC.fog), peak).setDepth(100000);
          this.worldFx(smoke);
          this.tweens.add({ targets: smoke, y: wy - 8 - Phaser.Math.Between(40, 80), scale: { from: 1, to: 2.6 }, alpha: 0, duration: SMOKE_MS + i * 140, ease: 'Sine.Out', onComplete: () => smoke.destroy() });
        }
      }
    }
  }

  /** POLISH v2 · PKG3 — register a camera-feel BEAT: arm the severity-banded hit-stop (no-stack + lockout)
   * + the screen-nudge impulse. Both are applied to the WORLD camera in update(); the fixed HUD camera is
   * never touched. Maps onto EXISTING events — adds no new beats. */
  private cameraBeat(severity: BeatSeverity): void {
    if (!this.feelEnabled) return;
    const now = this.time.now;
    this.hitStop = requestHitStop(this.hitStop, severity, now);
    this.nudge = requestNudge(this.nudge, severity, now);
  }

  /** Whether a world point is within the (padded) camera view — viewport culling for FX cost. */
  private onScreen(wx: number, wy: number, pad = 120): boolean {
    const v = this.cameras.main.worldView;
    return wx >= v.x - pad && wx <= v.right + pad && wy >= v.y - pad && wy <= v.bottom + pad;
  }

  /** RTS-30e — the KILL / DOWNED beat (Design §4): ONE danger-red muzzle-flash + a ~2px screen-nudge
   * (≤1.1s, once — the only danger-red here), then a DESATURATED slump (the figure's own colour drained
   * ~50%, never rival-red on a player) over a near-black pool (#1A0A09 @60%), a dimmed faction-memory
   * glint, fading to a faint stain decal (culled). The "X is down" line rides THE WIRE, not floating text. */
  private playKill(wx: number, wy: number, faction: 'player' | 'rival' | 'civilian'): void {
    if (!this.onScreen(wx, wy)) return;
    // the one danger-red flash + the 2px nudge (once).
    const flash = this.add.image(wx, wy - 14, TEX.glow).setTint(hexNum(SPEC.danger)).setScale(0.4).setDepth(100002);
    this.worldFx(flash);
    this.tweens.add({ targets: flash, scale: 1.0, alpha: 0, duration: MOTION.killFlash * 0.2, onComplete: () => flash.destroy() });
    const nudge = killNudgePx();
    this.fxShake(MOTION.killFlash * 0.18, nudge / 1000);
    // the near-black pool (#1A0A09 @ 60%) — NOT danger-red.
    const pool = this.add.ellipse(wx, wy + 2, 20, 9, hexNum('#1a0a09'), 0.6).setDepth(99998);
    this.worldFx(pool);
    pool.setScale(0.2);
    this.tweens.add({ targets: pool, scaleX: 1, scaleY: 1, duration: 500, ease: 'Quad.Out' });
    // the desaturated slump: a dimmed faction-memory glint that settles, then fades to a stain.
    const memRole = corpseMemoryRole(faction);
    const slump = this.add.ellipse(wx, wy, 22, 8, hexNum(SPEC[memRole]), 0.55).setDepth(99999);
    this.worldFx(slump);
    slump.setScale(0.5, 0.5);
    this.tweens.add({ targets: slump, scaleX: 1.1, scaleY: 0.7, duration: 360, ease: 'Back.Out' });
    // settle, then fade both to a faint stain (the pool lingers dimmer); culled object count stays bounded.
    this.tweens.add({ targets: slump, alpha: 0, duration: 900, delay: MOTION.corpseStainFade, onComplete: () => slump.destroy() });
    this.tweens.add({ targets: pool, alpha: 0.16, duration: 1400, delay: MOTION.corpseStainFade, onComplete: () => { this.tweens.add({ targets: pool, alpha: 0, duration: 2600, delay: 3000, onComplete: () => pool.destroy() }); } });
  }

  /** RTS-30e — a one-shot HUD edge flash when federal exposure CROSSES a ladder rung (50/70/85):
   * amber at NOTICE/WATCH, danger-red at RAID — motion-only (it flashes and fades, never a static fill). */
  private flashFederalCross(tier: number): void {
    const color = federalBarColor(tier);
    const w = this.hudW(), h = this.hudH();
    const g = this.add.graphics().setScrollFactor(0).setDepth(100052);
    this.hudFx(g);
    for (let i = 0; i < 4; i++) { g.lineStyle(26 - i * 5, hexNum(color), 0.5 - i * 0.1); g.strokeRect(i * 3, i * 3, w - i * 6, h - i * 6); }
    g.setAlpha(0);
    const label = tier >= 3 ? 'FEDERAL RAID LINE — 85' : tier >= 2 ? 'FEDERAL WATCH — 70' : 'FEDERAL NOTICE — 50';
    const t = this.mkText(w / 2, 150, label, { fontFamily: NOIR_FONT, fontSize: '18px', color, fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(100053).setAlpha(0);
    this.hudFx(t);
    this.tweens.add({ targets: [g, t], alpha: 1, duration: 160, yoyo: true, hold: 220, onComplete: () => { g.destroy(); t.destroy(); } });
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
    // RTS-30e: the raiding unit recoils, a muzzle-clash lands on the block; a repelled raid downs a man.
    const tc = this.world.districts.find((d) => d.id === target.id)?.centroid;
    if (tc) { const p = gridToScreen(tc.gx, tc.gy); const actor = this.actingUnitView(p.x, p.y);
      this.triggerAttackMotion(actor, actor?.unit.weapon, p.x); this.combatContact(p.x, p.y, combatVfxForVerb('raid'));
      if (outcomeDownedAMan(res) && actor) { this.triggerHitReact(actor.unit.id); const s = unitScreenPos(actor.unit); this.playKill(s.x, s.y, 'player'); } }
    this.setStatus(res.repelled ? `raid on ${target.name} was REPELLED — a man down` : `RAID on ${target.name}!`);
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
    // RTS-30e: a window-shatter on the racket + the saboteur's recoil. A wreck = the heaviest dust beat.
    const bt = businessTileOf(this.layout, biz.id);
    if (bt) { const p = gridToScreen(bt.gx, bt.gy); const actor = this.actingUnitView(p.x, p.y);
      this.triggerAttackMotion(actor, actor?.unit.weapon, p.x);
      this.combatContact(p.x, p.y, res.destroyed ? combatVfxForVerb('demolish') : combatVfxForVerb('sabotage')); }
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
    // RTS-30e: a pistol muzzle at the rival HQ + the hitman's recoil; an elimination plays the KILL on
    // the rival Don; a botched hit downs one of YOUR men.
    const ht = hqTileOf(this.layout, w.familyId);
    if (ht) { const p = gridToScreen(ht.gx, ht.gy); const actor = this.actingUnitView(p.x, p.y);
      this.triggerAttackMotion(actor, actor?.unit.weapon, p.x); this.combatContact(p.x, p.y, combatVfxForVerb('assassinate'));
      if (res.eliminated) this.playKill(p.x, p.y, 'rival');
      else if (outcomeDownedAMan(res) && actor) { this.triggerHitReact(actor.unit.id); const s = unitScreenPos(actor.unit); this.playKill(s.x, s.y, 'player'); } }
    this.setStatus(res.success ? (res.eliminated ? `${w.name} ELIMINATED` : `struck ${w.name}'s HQ — integrity ${hq}`) : `the hit on ${w.name} failed — a man down`);
  }

  /** [4] LOCKOUT the weakest rival via The Bureau — freeze and bleed them. */
  private commandLockout(): void {
    const w = weakestRival(this.state);
    if (!w) { this.setStatus('LOCKOUT: no rival left to lock down'); return; }
    const g = canLockout(this.state, w.familyId);
    if (!g.ok) { this.setStatus(`LOCKOUT ${w.name}: ${g.reason}`); return; }
    resolveLockout(this.state, w.familyId);
    this.state = harvestIncidents(this.state);
    this.audio?.combat('lockout'); this.audio?.lockoutEntry(); this.audio?.confirm(); // RTS-27 siren + RTS-34 door-slam forced entry
    // FIX — a FELT success beat at the rival's HQ so the lockout reads as DELIVERING (it used to play only
    // SFX + a one-line status, so a successful lockout looked like a dead button). Federal-green pulse +
    // a lock stamp + a kick — MOTION, no static wash.
    const ht = hqTileOf(this.layout, w.familyId);
    if (ht) { const p = gridToScreen(ht.gx, ht.gy); this.lockoutBeat(p.x, p.y); }
    this.signalBeat('federal');
    this.setStatus(`the Bureau is locking down ${w.name} — they can't expand & they bleed while it holds`);
  }

  /** FIX — the LOCKOUT beat: the Bureau moves in. A federal-green shock-ring + a "🔒 LOCKED DOWN" stamp
   * over the rival HQ + a short camera kick. Federal-green (#5b7d6a, the canon Bureau accent), MOTION-only. */
  private lockoutBeat(wx: number, wy: number): void {
    const FED = 0x5b7d6a;
    const ring = this.add.circle(wx, wy - 8, 8).setStrokeStyle(3, FED, 0.9).setDepth(100001);
    this.worldFx(ring);
    this.tweens.add({ targets: ring, scale: 5, alpha: 0, duration: 620, ease: 'Quad.Out', onComplete: () => ring.destroy() });
    this.floatText(wx, wy - 34, '🔒 LOCKED DOWN', '#7da890');
    this.cameraBeat('federalRaid'); // POLISH v2 · PKG3 — the Bureau's blow lands with a banded hit-stop
  }

  /**
   * QA-only scenario hooks — DEV-ONLY (gated by isDevBuild(); wholly inert in a production / Steam build).
   * Read the URL query and seed an interesting board by exercising EXISTING systems — they change NO sim
   * rule and are a no-op in normal play (no flags) and outside the browser. Supported:
   *   • ?arm                          — equip each SELECTABLE player unit via the real spawn/equip path
   *                                     (devDebug.applyDevDebug — never an invalid weapon state).
   *   • ?debug=win | ?debug=lose      — flip ONLY the resolved endgame status (no HQ raze, no corruption).
   *   • ?debug=turf|mutiny|all[&pulses=N] — fast-forward the turf war / prime a mutiny (legacy QA tools).
   *   • ?scenario=rival-contest|fed-watch|save-roundtrip — prime a deterministic QA board (NO-X-RAY).
   */
  private applyDebugScenario(): void {
    if (!isDevBuild()) return; // the GUARD: nothing below ever runs in a production build
    const search = typeof window !== 'undefined' ? (window.location?.search ?? '') : '';
    if (!search) return;

    // ?arm + ?debug=win|lose — the guarded dev-debug module (routes through the real spawn/equip + a
    // status-only endgame flip). Refresh the armed units' views so the new enforcer silhouettes show.
    const report = applyDevDebug(this.state, search, true); // already dev-gated above
    for (const id of report.armed) this.refreshArmedView(id);
    // ?debug=win|lose — dismiss the opening legend so the forced endgame readout is actually reachable
    // (it otherwise renders behind the intro overlay). The endgame resolves on the next sim-advance frame.
    if (report.dismissIntro) this.hideLegend();

    // ?scenario= — deterministic QA boards (independent of ?debug; runs even with no ?debug param).
    this.applyQaScenario(search);

    const params = new URLSearchParams(search);
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
  }

  /**
   * Task 3 — ?scenario= deterministic QA boards, applied via the pure devDebug helpers (DEV-gated above).
   * rival-contest fast-forwards the strategic clock (so we re-harvest incidents); fed-watch raises heat to
   * WATCH; save-roundtrip is a marker. NO-X-RAY: the sim mutates, but no fog/reveal call is made here, so a
   * hidden rival stays hidden. Each surfaces a QA status line. A no-op when no scenario flag is present.
   */
  private applyQaScenario(search: string): void {
    const scenario = parseScenario(search, true); // dev-gated by applyDebugScenario's guard
    if (!scenario) return;
    const report = applyScenario(this.state, scenario);
    if (report.pulsed) this.state = harvestIncidents(this.state);
    if (report.note) this.setStatus(report.note);
  }

  /** ?arm view refresh: a just-equipped unit is now a weapon-tier ENFORCER — swap to its baked enforcer
   * silhouette and drop the plain button-man procedural rig (an enforcer renders the baked sprite). */
  private refreshArmedView(id: string): void {
    const v = this.units.find((u) => u.unit.id === id);
    if (!v) return;
    if (v.unit.weapon) v.sprite.setTexture(enforcerTexKey(v.unit.weapon)).setVisible(true);
    if (v.rig) { v.rig.destroy(); v.rig = undefined; }
    if (v.rigDebug) { v.rigDebug.destroy(); v.rigDebug = undefined; }
    if (v.rigText) { v.rigText.destroy(); v.rigText = undefined; }
  }

  /** The victory/defeat readout when the contest resolves (RTS-17). */
  /** RTS-34 — the end-state lands as a period NEWSPAPER headline (deco masthead, big headline naming
   * the win PATH, a one-line story, a week dateline, the "— 30 —" end mark). Brass/soot/newsprint on the
   * fixed camera. ⭐ The headline is newsprint INK for both win and loss — no static danger-red wash
   * (red discipline; danger stays MOTION-only). A brass rule under the masthead marks a victory. */
  private showEndgame(): void {
    if (this.endgameShown) return;
    this.endgameShown = true;
    this.cameraBeat('winLoss'); // POLISH v2 · PKG3 — the decisive sting gets the longest hit-stop
    const won = this.state.status === 'won';
    // RTS-27: the win/lose STING + a VO one-liner, and switch the music bed (theme swell / defeat).
    this.audio?.play(won ? 'sting_win' : 'sting_lose');
    this.audio?.vo([won ? 'vo_win' : 'vo_lose']);
    this.audio?.setPhase(won ? 'TITLE' : 'GAMEOVER');
    const w = this.hudW(), h = this.hudH(), cx = w / 2, cy = h / 2;
    // Lane E — the victory newspaper is built from the pure report: the named win/loss, the four
    // telegraphed conditions ranked into a FINAL STANDING, and the deterministic "by the numbers".
    const report: VictoryReport = victoryReport(this.state);
    const { headline, kicker } = report;

    const objs: Phaser.GameObjects.GameObject[] = [];
    objs.push(this.add.rectangle(0, 0, 6000, 4000, PAL.soot, 0.9).setOrigin(0, 0).setScrollFactor(0).setDepth(200000));
    const paperW = Math.min(700, w - 56), paperH = Math.min(388, h - 56);
    const px = cx - paperW / 2, py = cy - paperH / 2;
    const g = this.add.graphics().setScrollFactor(0).setDepth(200001);
    const footH = 124; // the lower column carries the FINAL STANDING + BY THE NUMBERS
    g.fillStyle(0xcdc4b0, 1).fillRect(px, py, paperW, paperH);          // aged newsprint
    g.fillStyle(PAL.ink, 0.05).fillRect(px, py + paperH - footH, paperW, footH); // a faint lower column
    g.lineStyle(2, PAL.ink, 0.55).strokeRect(px, py, paperW, paperH);
    g.lineStyle(1, PAL.ink, 0.4); g.strokeRect(px + 7, py + 7, paperW - 14, paperH - 14); // double rule
    g.lineStyle(1, PAL.ink, 0.35); g.beginPath(); g.moveTo(px + 16, py + paperH - footH); g.lineTo(px + paperW - 16, py + paperH - footH); g.strokePath();
    objs.push(g);

    const ink = '#16130f', inkSoft = '#3a322a';
    objs.push(this.mkText(cx, py + 22, NEWSPAPER_MASTHEAD, { fontFamily: NOIR_DISPLAY, fontSize: '20px', color: ink, fontStyle: 'bold' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(200002));
    objs.push(this.mkText(cx, py + 46, `EXTRA  ·  WEEK ${report.week}  ·  ${kicker}`, { fontFamily: NOIR_FONT, fontSize: '11px', color: inkSoft }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(200002));
    // masthead rule — brass for a win, plain ink for a loss
    g.lineStyle(2, won ? PAL.brass : PAL.ink, won ? 0.95 : 0.5); g.beginPath(); g.moveTo(px + 24, py + 66); g.lineTo(px + paperW - 24, py + 66); g.strokePath();

    const headY = py + Math.round((paperH - footH) * 0.42) + 30;
    objs.push(this.mkText(cx, headY, headline, { fontFamily: NOIR_DISPLAY, fontSize: '38px', color: ink, fontStyle: 'bold', align: 'center', wordWrap: { width: paperW - 60 } }).setOrigin(0.5).setScrollFactor(0).setDepth(200002));
    objs.push(this.mkText(cx, headY + 42, report.dek.toUpperCase(), { fontFamily: NOIR_FONT, fontSize: '13px', color: inkSoft, align: 'center', wordWrap: { width: paperW - 80 } }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(200002));

    // ── Lane L — THE RUN IN NUMBERS: inject the run-stat summary into Lane E's paper (a centered strip
    // under the deck, NOT a forked screen). A final observe pins the FINAL turf + weeks survived; the eight
    // pure tokens print as two centered lines in the gap above the footer. ──
    const runStats = ensureRunStats(this.state);
    observeRun(runStats, this.state);
    const runTokens = runStatsSummary(runStats);
    const runRuleY = py + paperH - footH; // the footer's top rule — the strip sits just above it
    const runStripStyle = { fontFamily: NOIR_FONT, fontSize: '11px', color: inkSoft, align: 'center', wordWrap: { width: paperW - 48 } } as const;
    objs.push(this.mkText(cx, runRuleY - 48, 'THE RUN IN NUMBERS', { fontFamily: NOIR_FONT, fontSize: '11px', color: ink, fontStyle: 'bold' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(200002));
    objs.push(this.mkText(cx, runRuleY - 32, runTokens.slice(0, 4).join('   ·   '), runStripStyle).setOrigin(0.5, 0).setScrollFactor(0).setDepth(200002));
    objs.push(this.mkText(cx, runRuleY - 17, runTokens.slice(4).join('   ·   '), runStripStyle).setOrigin(0.5, 0).setScrollFactor(0).setDepth(200002));

    // ── the FINAL STANDING (left) + BY THE NUMBERS (right) — Lane E's telegraphed-win payoff ──
    const footTop = py + paperH - footH + 12;
    const bar = (pct: number): string => { const n = Math.max(0, Math.min(10, Math.round(pct / 10))); return '█'.repeat(n) + '░'.repeat(10 - n); };
    const standingLines = report.standing.map((c) => `${report.achievedId === c.id ? '✦' : ' '} ${c.label.padEnd(13)} ${bar(c.pct)} ${String(c.pct).padStart(3)}%`);
    objs.push(this.mkText(px + 24, footTop, 'THE FINAL STANDING', { fontFamily: NOIR_FONT, fontSize: '11px', color: ink, fontStyle: 'bold' }).setOrigin(0, 0).setScrollFactor(0).setDepth(200002));
    objs.push(this.mkText(px + 24, footTop + 18, standingLines.join('\n'), { fontFamily: NOIR_FONT, fontSize: '12px', color: inkSoft, lineSpacing: 3 }).setOrigin(0, 0).setScrollFactor(0).setDepth(200002));
    objs.push(this.mkText(px + paperW - 24, footTop, 'BY THE NUMBERS', { fontFamily: NOIR_FONT, fontSize: '11px', color: ink, fontStyle: 'bold' }).setOrigin(1, 0).setScrollFactor(0).setDepth(200002));
    objs.push(this.mkText(px + paperW - 24, footTop + 18, report.byTheNumbers.join('\n'), { fontFamily: NOIR_FONT, fontSize: '12px', color: inkSoft, lineSpacing: 3, align: 'right' }).setOrigin(1, 0).setScrollFactor(0).setDepth(200002));
    objs.push(this.mkText(cx, py + paperH - 16, '— 30 —', { fontFamily: NOIR_FONT, fontSize: '12px', color: inkSoft }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(200002));

    // RTS-34 fix (Task 4) — a DEFINED exit so the end-state never backs into a blank frame: an on-screen
    // hint on the soot below the paper, paired with the Esc→menu / Enter→new-game handlers. Brass on soot.
    objs.push(this.mkText(cx, py + paperH + 18, '[Enter] new game      ·      [Esc] main menu', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.brass }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(200002));

    this.hudFx(...objs);
    // a brief slam-in (the headline thumps onto the desk)
    const paperBits = objs.slice(1) as unknown as Phaser.GameObjects.Components.Alpha[];
    for (const o of paperBits) o.setAlpha(0);
    this.tweens.add({ targets: paperBits, alpha: 1, duration: 360, ease: 'Quad.Out' });
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
      if (p.isDown) { this.hideTooltip(); this.opPreview = undefined; return; }
      this.updateTooltip(p);
      this.resolveOpPreview(p);
    });
  }

  /** OPERATION-OUTCOME PREVIEWS — resolve the read-only preview under the cursor. Reuses the SAME target
   * routing as the contextual right-click (rival unit → attack; un-taken front → extort; rival-held front →
   * retake), and falls back to the federal LOCKOUT projection on a rival when no muscle is selected to hit
   * with — so the cursor always answers "what would committing here do?". Pure selectors do the work; this
   * only picks which one and passes the fog predicate (NO-X-RAY). */
  private resolveOpPreview(p: Phaser.Input.Pointer): void {
    this.opCursor = { x: this.hudX(p.x), y: this.hudY(p.y) }; // the preview card is fixed-HUD → logical coords
    // a HUD region owns this pixel (the tooltip explains it) — don't also pop a world preview over it.
    if (this.hudRegionExplain(p.x, p.y) !== null) { this.opPreview = undefined; return; }
    const isVis = (pos: { gx: number; gy: number }) => this.debugRevealAll || isRevealed(this.fog, Math.round(pos.gx), Math.round(pos.gy));
    const hitUnit = pickUnit(this.units.map((v) => v.unit), screenToGrid(p.worldX, p.worldY));
    const hitView = hitUnit ? this.units.find((v) => v.unit.id === hitUnit.id) : undefined;
    const rival = hitView && hitView.faction === 'rival' && hitView.unit.role !== 'collector' ? hitUnit : undefined;
    const thug = this.selectedPlayerThug();

    if (rival) {
      // a rival fighter: with muscle selected, preview the ATTACK; otherwise show what the Bureau could do.
      this.opPreview = thug
        ? previewAttackRival(this.state, thug.id, rival.id, isVis)
        : (rival.factionId ? previewFederalAction(this.state, rival.factionId) : undefined);
      return;
    }
    const bizId = this.businessAtScreen(p.worldX, p.worldY);
    if (bizId) {
      const tile = businessTileOf(this.layout, bizId);
      // never preview a fogged building (NO-X-RAY) — and we need a tile for the spatial guard/retake checks.
      if (!tile || !isVis(tile)) { this.opPreview = undefined; return; }
      const actorId = thug?.id ?? '';
      this.opPreview = isRivalHeldFront(this.state, bizId)
        ? previewRetakeFront(this.state, actorId, bizId, tile, isVis)
        : previewExtortFront(this.state, actorId, bizId, tile, isVis);
      return;
    }
    this.opPreview = undefined; // empty ground — nothing to project
  }

  /** RTS-23: the plain-English explanation for a HUD region under the cursor (the anti-Gangsters
   * fix — every number is inspectable). */
  private hudRegionExplain(sx: number, sy: number): string | null {
    sx = this.hudX(sx); sy = this.hudY(sy); // screen → logical HUD space (UI-scale)
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
    let x = this.hudX(p.x) + 16, y = this.hudY(p.y) + 16; // place in logical HUD space (UI-scale)
    x = Math.min(x, this.hudW() - w - 6);
    y = Math.min(y, this.hudH() - h - 6);
    this.tooltipBg.clear().setVisible(true);
    this.tooltipBg.fillStyle(PAL.ink, 0.92).fillRect(x, y, w, h);
    this.tooltipBg.lineStyle(1, PAL.brass, 0.8).strokeRect(x, y, w, h);
    this.tooltipText.setPosition(x + 8, y + 6);
  }

  private hoverText(p: Phaser.Input.Pointer): string | null {
    const gpoint = screenToGrid(p.worldX, p.worldY);
    const hit = pickUnit(this.units.map((v) => v.unit), gpoint);
    if (hit) {
      const view = this.units.find((v) => v.unit.id === hit.id);
      const i = inspectUnit(this.state, hit.id);
      if (i) {
        const lines = [`${i.kind}${i.ownerName ? ` · ${i.ownerName}` : ''}`];
        if (i.vulnerable) lines.push(`carrying $${i.carrying}  ${i.threat === 'ambush' ? '⚠ AMBUSH' : i.threat === 'threatened' ? '⚠ in danger' : 'in transit'}`);
        else lines.push('idle / no cash');
        // ⭐ DISCOVERABILITY: a RIVAL fighter is an ATTACK target — surface the right-click gesture (the
        // combat half of the game was unreachable; make the gesture obvious on hover).
        if (view?.faction === 'rival' && hit.role !== 'collector') {
          lines.push(this.selection.ids.length > 0 ? '⚔ right-click → ATTACK' : '⚔ select a thug, then right-click → ATTACK');
        }
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
    const ui = this.cameras.add(0, 0, this.scale.width, this.scale.height); // viewport = full real screen
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
    this.scale.on('resize', () => { ui.setSize(this.scale.width, this.scale.height); this.applyUiScale(this.shellSettings.uiScale); });
    this.applyUiScale(this.shellSettings.uiScale); // honour the persisted UI scale on boot (origin + zoom)
  }

  /** RTS-34 — the noir MOOD overlay: a soft dark VIGNETTE + a faint film-GRAIN, both on the fixed UI
   * camera so they never scale with zoom/pan. Restrained (atmosphere, not a filter) and BELOW every HUD
   * element so readability is untouched. Cheap: the vignette is drawn ONCE; the grain is a single tiled
   * sprite jittered a few px/frame. ?fx=off (or toggleFx) removes it entirely. Soot/ink — never red. */
  private buildFxOverlay(): void {
    if (!this.fxEnabled) return;
    const w = this.hudW(), h = this.hudH();
    const vig = this.add.graphics().setScrollFactor(0).setDepth(90000);
    this.drawVignette(vig, w, h);
    this.vignette = vig;
    if (!this.textures.exists('lcr_grain')) this.bakeGrain();
    const grain = this.add.tileSprite(0, 0, w, h, 'lcr_grain').setOrigin(0, 0).setScrollFactor(0).setDepth(90001).setAlpha(0.05);
    this.grain = grain;
    this.hudFx(vig, grain); // UI-camera only (the create-time snapshot already passed)
    this.scale.on('resize', () => { this.drawVignette(vig, this.hudW(), this.hudH()); grain.setSize(this.hudW(), this.hudH()); });
  }

  /** A rectangular soft vignette: dark ink rings strongest at the edge, fading to nothing toward centre
   * (so the corners sink into shadow). Drawn once into `g`. */
  private drawVignette(g: Phaser.GameObjects.Graphics, w: number, h: number): void {
    g.clear();
    const rings = 22, reach = Math.min(w, h) * 0.5, band = reach / rings + 1, maxA = 0.5;
    for (let i = 0; i < rings; i++) {
      const t = i / rings;            // 0 = outer edge, 1 = inner
      const inset = t * reach;
      g.lineStyle(band, PAL.ink, maxA * (1 - t) * (1 - t)); // strongest at the very edge
      g.strokeRect(inset, inset, w - 2 * inset, h - 2 * inset);
    }
  }

  /** Bake a small monochrome speck texture once for the film grain (one-time; render-only, so the
   * cosmetic randomness here never touches the deterministic sim). */
  private bakeGrain(): void {
    const S = 128;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const specks = Math.floor(S * S * 0.07);
    for (let i = 0; i < specks; i++) {
      g.fillStyle(Phaser.Math.Between(0, 1) ? 0xffffff : 0x000000, 1);
      g.fillRect(Phaser.Math.Between(0, S - 1), Phaser.Math.Between(0, S - 1), 1, 1);
    }
    g.generateTexture('lcr_grain', S, S);
    g.destroy();
  }

  /** Toggle the mood overlay live (atmosphere vs maximum readability). */
  private toggleFx(): void {
    this.fxEnabled = !this.fxEnabled;
    if (this.fxEnabled && !this.vignette) { this.buildFxOverlay(); return; }
    this.vignette?.setVisible(this.fxEnabled);
    this.grain?.setVisible(this.fxEnabled);
  }

  // ── FOOTGUN FIX — confirm before restart-to-Boot ──────────────────────────────────────────────

  /** [B] — ARM the restart (never restarts on the press itself) and raise the confirm modal. */
  private armRestartPrompt(): void {
    const r = armRestart(this.restartGate);
    this.restartGate = r.gate;
    this.showRestartPrompt();
  }

  /** [Y] while armed — confirm: restart to Boot ONLY because the gate says so (pure decision). */
  private doConfirmRestart(): void {
    const r = confirmRestart(this.restartGate);
    this.restartGate = r.gate;
    this.hideRestartPrompt();
    if (r.restart) this.scene.start('BootScene');
  }

  /** [Esc] / cancel button while armed — back out, leave the game running. */
  private doCancelRestart(): void {
    const r = cancelRestart(this.restartGate);
    this.restartGate = r.gate;
    this.hideRestartPrompt();
  }

  /** The restart confirm dialog: a dim backdrop + a brass-framed panel reading the consequence, with
   * clickable CONFIRM / CANCEL buttons (keyboard [Y]/[Esc] do the same). Fixed-HUD camera, top depth. */
  private showRestartPrompt(): void {
    if (this.restartPrompt) return;
    const w = this.hudW(), h = this.hudH(), cx = w / 2, cy = h / 2;
    const pw = 460, ph = 150;
    const backdrop = this.add.rectangle(0, 0, w, h, PAL.soot, 0.72).setOrigin(0, 0);
    const panel = this.add.rectangle(cx, cy, pw, ph, PAL.ink, 0.98).setStrokeStyle(2, PAL.brass, 0.95);
    const title = this.mkText(cx, cy - 44, 'RESTART?', { fontFamily: NOIR_DISPLAY, fontSize: '20px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(0.5, 0.5);
    const body = this.mkText(cx, cy - 12, 'This ENDS your current game.', { fontFamily: NOIR_FONT, fontSize: '14px', color: NOIR_PALETTE.bone }).setOrigin(0.5, 0.5);
    const confirm = this.mkText(cx - 92, cy + 34, '[Y] RESTART', { fontFamily: NOIR_DISPLAY, fontSize: '15px', color: SPEC.danger, fontStyle: 'bold', backgroundColor: '#1a0a09' })
      .setOrigin(0.5, 0.5).setPadding(10, 6, 10, 6).setInteractive({ useHandCursor: true });
    const cancel = this.mkText(cx + 92, cy + 34, '[Esc] CANCEL', { fontFamily: NOIR_DISPLAY, fontSize: '15px', color: NOIR_PALETTE.brass, fontStyle: 'bold', backgroundColor: '#0a0807' })
      .setOrigin(0.5, 0.5).setPadding(10, 6, 10, 6).setInteractive({ useHandCursor: true });
    confirm.on('pointerdown', () => this.doConfirmRestart());
    cancel.on('pointerdown', () => this.doCancelRestart());
    backdrop.setInteractive().on('pointerdown', () => this.doCancelRestart()); // click-off cancels (safe default)
    const c = this.add.container(0, 0, [backdrop, panel, title, body, confirm, cancel]).setScrollFactor(0).setDepth(300000);
    this.hudFx(c); // fixed HUD camera only (the main camera ignores it — never renders in world space)
    this.restartPrompt = c;
  }

  private hideRestartPrompt(): void {
    this.restartPrompt?.destroy(true);
    this.restartPrompt = undefined;
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
    const card = this.mkText(this.hudW() / 2, 122, txt, {
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
    // COMBAT CONTROL VERBS — WASD is FREED for the standard RTS command keys (S=STOP, A=ATTACK-MOVE;
    // W/D now unused, D re-homes the old [I]=center-on-selection). The camera still pans via the ARROW
    // keys + screen-edge + middle-drag + wheel — full keyboard coverage without WASD. `this.wasd` stays
    // undefined; the pan reads it with optional chaining, so dropping it is safe.
    this.wasd = undefined;
    // RTS-30d-3: LEFT-drag = selection MARQUEE; MIDDLE-drag = pan the camera (a real drag past slop).
    // (Arrows / edge / wheel still pan/zoom; right-click still moves/commands.)
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || Math.hypot(p.x - this.pressX, p.y - this.pressY) <= CLICK_SLOP) return;
      if (p.middleButtonDown()) { cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom; cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom; }
      else if (p.leftButtonDown()) { this.marqueeActive = true; this.drawMarquee(this.pressX, this.pressY, p.x, p.y); }
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
    // HUD PHASE 1 — [F] now opens the FINANCE drawer; the camera CENTRE-ON-SELECTION it displaced moves to
    // [I] (the only collision the L/T/V/K/F bindings introduce; the larger remap is deferred).
    this.input.keyboard?.on('keydown-F', () => this.panels?.toggle('finance'));
    // COMBAT CONTROL VERBS (input-only; reuse the order system + 35a engage):
    this.input.keyboard?.on('keydown-S', () => this.commandStop());        // [S] STOP — cancel orders, hold tile
    this.input.keyboard?.on('keydown-I', () => this.commandHold());        // [I] HOLD — stand & fight, no chase ([H] = help)
    this.input.keyboard?.on('keydown-A', () => this.beginAttackMove());    // [A] then left-click — ATTACK-MOVE
    // Lane G — [D] center-on-selection and [Z] frame-city are REMAPPABLE: they're dispatched from the
    // central keybind map (see the generic dispatcher below), not bound to a fixed literal here.
    // RTS-30a: snap through the 3 zoom stops with the +/- keys (and the on-screen buttons).
    this.input.keyboard?.on('keydown-PLUS', () => this.cycleZoom(1));
    this.input.keyboard?.on('keydown-EQUALS', () => this.cycleZoom(1));
    this.input.keyboard?.on('keydown-MINUS', () => this.cycleZoom(-1));
    // HUD PHASE 1 — [T] opens the TURF drawer (the old [T] no-op status hint is retired).
    this.input.keyboard?.on('keydown-T', () => this.panels?.toggle('turf'));
    // Lane G — [E] extort / [C] collect / [R] reinvest / [G] grease are REMAPPABLE: dispatched from the
    // central keybind map by the generic handler below (so a player can rebind them and never collide).
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.dispatchKeybind(e));
    // HUD PHASE 1 — [L] Wire / [K] Crew now open their DRAWERS (the old always-on feed/crew panels are retired).
    this.input.keyboard?.on('keydown-L', () => this.panels?.toggle('wire'));
    this.input.keyboard?.on('keydown-K', () => this.panels?.toggle('crew'));
    this.input.keyboard?.on('keydown-H', () => this.toggleLegend());
    // FOOTGUN FIX — [B] no longer wipes the game on a single press; it ARMS a confirm prompt.
    this.input.keyboard?.on('keydown-B', () => this.armRestartPrompt());
    // HUD PHASE 1 — ESC closes the open drawer first (the common case); else cancels an armed restart prompt.
    this.input.keyboard?.on('keydown-ESC', () => {
      // Task 4 — when the endgame newspaper is up, Esc has a DEFINED destination (the main menu); it must
      // NOT fall through to the pause menu (which renders BELOW the newspaper → the old blank-frame hit).
      if (this.endgameShown) { this.exitEndgame('menu'); return; }
      // Lane G — Esc precedence: a deeper modal closes first, then the pause menu, then existing overlays;
      // with nothing else open, Esc raises the pause menu.
      if (this.settingsPanel?.isOpen()) { this.settingsPanel.close(); return; }
      if (this.pauseMenu?.isOpen()) { this.resumeFromPause(); return; }
      if (this.panels?.isOpen()) { this.panels.close(); return; }
      if (this.restartGate.armed) { this.doCancelRestart(); return; }
      if (this.tutorialShowing) { this.skipTutorial(); return; } // Lane B — dismiss the FTUE coach card
      if (this.saveMenu || this.marketOpen || this.audioPanelOpen) return; // another overlay owns Esc
      this.openPauseMenu();
    });
    // Task 4 — Enter is the endgame's other defined exit: start a NEW GAME (a clean restart). Inert during
    // normal play (Enter has no gameplay binding), so it only acts once the win/lose newspaper is showing.
    this.input.keyboard?.on('keydown-ENTER', () => { if (this.endgameShown) this.exitEndgame('restart'); });
    // SELECTION/CONTROL QoL — numbered CONTROL GROUPS share the digit keys: Ctrl+1-9 BINDS the current
    // selection, a bare digit RECALLS a bound group (double-tap centres). A digit only acts as a group
    // recall once that group is BOUND, so an unused digit still fires its offense/build verb / audio bus.
    // RTS-17 — the offensive. RTS-27: when the audio panel is open, 1–5 adjust the volume buses
    // instead of firing offense/build verbs (so the settings surface is keyboard-drivable).
    this.input.keyboard?.on('keydown-ONE', (e: KeyboardEvent) => { if (this.handleGroupDigit(1, e)) return; this.audioPanelOpen ? this.cycleAudioBus(0) : this.commandRaid(); });
    this.input.keyboard?.on('keydown-TWO', (e: KeyboardEvent) => { if (this.handleGroupDigit(2, e)) return; this.audioPanelOpen ? this.cycleAudioBus(1) : this.commandSabotage(); });
    this.input.keyboard?.on('keydown-THREE', (e: KeyboardEvent) => { if (this.handleGroupDigit(3, e)) return; this.audioPanelOpen ? this.cycleAudioBus(2) : this.commandAssassinate(); });
    this.input.keyboard?.on('keydown-FOUR', (e: KeyboardEvent) => { if (this.handleGroupDigit(4, e)) return; this.audioPanelOpen ? this.cycleAudioBus(3) : this.commandLockout(); });
    // RTS-20 — the build verbs (leave ESTABLISH).
    this.input.keyboard?.on('keydown-FIVE', (e: KeyboardEvent) => { if (this.handleGroupDigit(5, e)) return; this.audioPanelOpen ? this.cycleAudioBus(4) : this.commandExpand(); });
    this.input.keyboard?.on('keydown-SIX', (e: KeyboardEvent) => { if (this.handleGroupDigit(6, e)) return; this.commandRecruit(); });
    // 7-9 have no verb — they are pure control-group slots (bind with Ctrl, recall with the bare digit).
    this.input.keyboard?.on('keydown-SEVEN', (e: KeyboardEvent) => { this.handleGroupDigit(7, e); });
    this.input.keyboard?.on('keydown-EIGHT', (e: KeyboardEvent) => { this.handleGroupDigit(8, e); });
    this.input.keyboard?.on('keydown-NINE', (e: KeyboardEvent) => { this.handleGroupDigit(9, e); });
    // TAB cycles the player's IDLE (no-order) units; Shift+TAB reverses. preventDefault stops the
    // browser stealing TAB for focus traversal.
    this.input.keyboard?.on('keydown-TAB', (e: KeyboardEvent) => { e.preventDefault?.(); this.cycleIdleUnit(!!e.shiftKey); });
    // RTS-30c-2b — the two glyphs that shipped without a canon key: PATROL [Q], DEMOLISH [V].
    // INFO-FEEDBACK (canon ruling #1): [Q] = jump to the last/highest-priority unread alert (NOT Space=pause,
    // NOT Tab=idle cycle). PATROL keeps its action-card chip (the [Q] hotkey moved to jump-to-alert).
    // Lane G — [Q] jump-to-alert is REMAPPABLE (dispatched from the central keybind map below).
    // HUD PHASE 1 — fix the [V]/[2] dupe: [V] opens the PATHS drawer; [2] remains the sole sabotage key.
    this.input.keyboard?.on('keydown-V', () => this.panels?.toggle('paths'));
    // RTS-27 — audio settings surface: [O] options panel, [0] master mute.
    this.input.keyboard?.on('keydown-O', () => this.toggleAudioPanel());
    this.input.keyboard?.on('keydown-ZERO', () => { this.audio?.toggleMute(); this.refreshAudioPanel(); });
    this.input.keyboard?.on('keydown-X', () => { this.toggleFx(); this.setStatus(this.fxEnabled ? 'film grain + vignette ON' : 'film grain + vignette OFF'); }); // RTS-34 mood toggle (also ?fx=off)
    // RTS-28 — pacing: [Space] cycle fast-forward, [>] (period) skip to the next week.
    // [Space] is the conventional PAUSE (the keystone). Fast-forward moves to its always-visible button.
    this.input.keyboard?.on('keydown-SPACE', () => this.togglePause());
    // Lane G — [.] skip-week is REMAPPABLE (dispatched from the central keybind map below).
    // RTS-24 — vice upgrade ([U] on the hovered racket) + THE MARKET ([M] toggle, [N] next good,
    // [Y] buy, [J] sell — buy/sell act only while the market tab is open).
    this.input.keyboard?.on('keydown-U', () => this.commandViceUpgrade());
    this.input.keyboard?.on('keydown-M', () => this.toggleMarket());
    this.input.keyboard?.on('keydown-N', () => { if (this.marketOpen) this.marketSel = (this.marketSel + 1) % 4; });
    this.input.keyboard?.on('keydown-Y', () => { if (this.restartGate.armed) this.doConfirmRestart(); else this.commandTrade('buy'); });
    this.input.keyboard?.on('keydown-J', () => this.commandTrade('sell'));
    // LANE D — earned-intel DOSSIER toggle. [J] (journal) is already the market SELL key, so the dossier
    // toggles on BACKTICK (`). Read-only; opening renders the current aged dossier (NO-X-RAY — never live).
    this.input.keyboard?.on('keydown-BACKTICK', () => this.toggleDossier());
    // LANE F — quicksave [F5] / quickload [F9]. Both are unbound in-app; F5 is the browser refresh, so we
    // preventDefault to keep it in-game (the SAVE/LOAD menu's buttons remain the fallback if the browser still
    // intercepts it). Quickload restarts the scene with the saved state + restored fog.
    this.input.keyboard?.on('keydown-F5', (e: KeyboardEvent) => { e.preventDefault?.(); this.doQuickSave(); });
    this.input.keyboard?.on('keydown-F9', (e: KeyboardEvent) => { e.preventDefault?.(); this.handleLoadResult(quickLoad(), 'quick'); });
    // RTS-25 — perf overlay: live FPS · frame ms · text rasterisations/sec (the cost this pass cut).
    this.input.keyboard?.on('keydown-P', () => { this.perfVisible = !this.perfVisible; this.perfText?.setVisible(this.perfVisible); });
    // OPERATION-OUTCOME PREVIEWS — HOLD-ALT expands the hover GLANCE card into its DETAIL rows. [ALT] is
    // free in the keymap (audited); preventDefault keeps the browser from stealing the Alt menu.
    this.input.keyboard?.on('keydown-ALT', (e: KeyboardEvent) => { e.preventDefault?.(); this.opAltHeld = true; });
    this.input.keyboard?.on('keyup-ALT', (e: KeyboardEvent) => { e.preventDefault?.(); this.opAltHeld = false; });
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.updateUnits(dt);
    this.revealFog(); // RTS-29: peel back the fog around the HQ + moving units
    this.drawGround(); // RTS-30a: culled ground/streets/parks/fog/washes for the visible tiles only
    this.updateDressingVisibility(); // RTS-30b-ground: fog-reveal + FAR-LOD bulk-hide of static props
    // RTS-34: fog-gate the ambient life — peds/cars only render on revealed tiles (no life through fog).
    // GLOBAL ACTIVE-PAUSE — the living city freezes too (a paused frame advances ambient by 0).
    this.ambient?.update(this.pause.paused ? 0 : dt, this.cameras.main, (gx, gy) => this.debugRevealAll || isRevealed(this.fog, gx, gy));
    this.refreshHud();
    this.refreshTutorial(); // Lane B — before refreshObjective: sets tutorialShowing so the banner stands down
    this.refreshObjective();
    if (!this.hudCollapsed) { this.refreshFeed(); this.refreshCrew(); } // HUD PHASE 1 — legacy side panels retired
    this.refreshPanels(); // HUD PHASE 1 — the dossier strip + the open drawer's body
    this.registerHudTooltips(); // Lane — contextual tooltips: hover explanations for the dossier chips + advisor
    this.refreshStrategy();
    this.refreshToolbar(); // RTS-30b-ui: clickable hotkey toolbar (states + progressive disclosure)
    this.refreshActionCard(); // RTS-30c-2b: the selected-unit action-icon chips
    this.refreshNight();
    this.refreshFastForward();
    // RTS-34: jitter the film grain a few px/frame for a subtle moving-emulsion flicker (one cheap
    // property set; the tile sprite is a single draw call).
    if (this.grain) this.grain.setTilePosition((_t * 0.07) % 128, (_t * 0.053) % 128);
    this.samplePerf(delta);

    const cam = this.cameras.main;
    // POLISH v2 · PKG3 — HIT-STOP: freeze WORLD-VISUAL time (the VFX tweens) for the brief banded window so
    // a blow READS. The sim (economy/combat) ran already in updateUnits and is untouched; the fixed HUD
    // camera is untouched (this only gates tween time + the WORLD-camera nudge below). Auto-releases as the
    // clock advances past the window.
    this.tweens.timeScale = this.feelEnabled && worldFrozen(this.hitStop, this.time.now) ? 0 : 1;
    // POLISH v2 · PKG3 — SCREEN-NUDGE: undo last frame's offset so the pan/zoom math sees the true scroll
    // (no drift), then re-apply this frame's decaying-sine nudge at the end. WORLD camera only.
    cam.scrollX -= this.appliedNudgeX; cam.scrollY -= this.appliedNudgeY;
    this.appliedNudgeX = 0; this.appliedNudgeY = 0;
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
    // POLISH v2 · PKG3 — apply this frame's screen-nudge to the WORLD camera (stored so the next frame can
    // undo it cleanly; clamped + decaying inside nudgeOffset). The fixed HUD camera never sees it.
    if (this.feelEnabled) {
      const off = nudgeOffset(this.nudge, this.time.now);
      this.appliedNudgeX = off.dx; this.appliedNudgeY = off.dy;
      cam.scrollX += off.dx; cam.scrollY += off.dy;
    }
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
      // RTS-34 HUD hierarchy — ONE hero number: NET/wk (the empire's heartbeat) renders LARGER than the
      // secondary cells, so the eye lands on the trajectory first. Every cell keeps its number + hover.
      const hero = cd.key === 'net';
      const value = this.mkText(0, 0, '', { fontFamily: NOIR_DISPLAY, fontSize: hero ? '30px' : '23px', color: NOIR_PALETTE.bone, fontStyle: 'bold' }).setScrollFactor(0).setDepth(100000);
      this.topCells.push({ label, value, x: 0, w: 0, key: cd.key });
    }
    this.heatCaption = this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '10px', color: NOIR_PALETTE.fog }).setScrollFactor(0).setDepth(100000);
    this.phaseChip = this.mkText(0, 0, '', { fontFamily: NOIR_DISPLAY, fontSize: '15px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(100001);

    // FOUR CHANNELS — labeled dials (level + what it buys + bump cost). [G] cycles a bump.
    this.channelTitle = this.mkText(0, 0, 'THE FOUR CHANNELS  · click to grease · [G] hottest', { fontFamily: NOIR_DISPLAY, fontSize: '14px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setScrollFactor(0).setDepth(100000);
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
    this.mutinyBanner = this.mkText(this.hudW() / 2, 60, '', { fontFamily: NOIR_FONT, fontSize: '15px', color: SPEC.danger, fontStyle: 'bold' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100001).setVisible(false);

    // RTS-24 THE MARKET tab (right dock, toggled with [M]) — rows of goods that narrate themselves.
    this.marketTitle = this.mkText(0, 0, 'THE MARKET  [M]', { fontFamily: NOIR_DISPLAY, fontSize: '15px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100001).setVisible(false);
    this.marketBody = this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, lineSpacing: 3, align: 'right' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100001).setVisible(false);

    // RTS-34 — the WIN/LOSS COMPASS: one high-signal line (fastest win path + top threat) so the player
    // always knows where they're heading and what's coming for them. The hero of the right rail; the
    // verbose standings sit below it as the inspectable detail.
    this.compassText = this.mkText(0, 196, '', { fontFamily: NOIR_DISPLAY, fontSize: '14px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100001);
    // RTS-16 turf-war standings (right side, under THE WIRE) + rival-pressure telegraph banner.
    this.strategyTitle = this.mkText(0, 196, 'THE CITY', { fontFamily: NOIR_DISPLAY, fontSize: '15px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100000);
    this.strategyPanel = this.mkText(0, 216, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, lineSpacing: 2, align: 'right' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100000);
    this.pressureBanner = this.mkText(this.hudW() / 2, 84, '', { fontFamily: NOIR_FONT, fontSize: '14px', color: SPEC.danger, fontStyle: 'bold' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100001).setVisible(false);

    // RTS-30b-ui — the clickable hotkey TOOLBAR replaces the text ACTION BOARD (actionTitle/actionBody
    // are intentionally NOT created now; refreshActionBoard early-returns). Every verb is a mouse button.
    this.buildToolbar();
    this.buildActionCard(); // RTS-30c-2b: the selected-unit action-icon chips

    // RTS-28 §1 — the fast-forward + skip-week controls (always visible, clickable). Bottom-centre.
    this.ffButton = this.mkText(0, 0, '', { fontFamily: NOIR_DISPLAY, fontSize: '15px', color: NOIR_PALETTE.brass, fontStyle: 'bold', backgroundColor: '#0a0807ee' })
      .setOrigin(0.5, 1).setScrollFactor(0).setDepth(100002).setPadding(10, 5, 10, 5).setInteractive({ useHandCursor: true });
    this.ffButton.on('pointerdown', () => this.cycleFastForward());
    this.skipButton = this.mkText(0, 0, '⏭ SKIP WEEK  [>]', { fontFamily: NOIR_DISPLAY, fontSize: '15px', color: NOIR_PALETTE.bone, fontStyle: 'bold', backgroundColor: '#0a0807ee' })
      .setOrigin(0.5, 1).setScrollFactor(0).setDepth(100002).setPadding(10, 5, 10, 5).setInteractive({ useHandCursor: true });
    this.skipButton.on('pointerdown', () => this.skipWeek());

    // RTS-25 perf overlay ([P]) — top-centre, off by default. Real FPS + frame ms + rasterisations/s.
    this.perfText = this.mkText(this.hudW() / 2, 6, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: '#7CFC8A', backgroundColor: '#000000cc' })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(200002).setPadding(6, 3, 6, 3).setVisible(false);
    this.refreshFastForward(); // initial label + placement

    // HUD PHASE 1 — stand up the one-drawer panel system + the dossier strip, then COLLAPSE the always-on
    // side stack so the city viewport dominates. The legacy panels' summaries now live in the strip; their
    // detail lives in the on-demand drawers. (OVERLAY only — nothing here touches the world camera.)
    this.panels = new PanelManager(this);
    this.hudFx(this.panels.root); // the WORLD camera must ignore the drawer (fixed-HUD layer), or it double-renders
    this.scale.on('resize', () => this.panels?.layout()); // re-derive the drawer rect (OVERLAY only — never the world)
    this.dossierG = this.add.container(0, 0).setScrollFactor(0).setDepth(100110);
    this.hudFx(this.dossierG);
    if (this.hudCollapsed) this.collapseLegacyPanels();
  }

  /** HUD PHASE 1 — retire the always-on side panels the strip/drawers replace: hide their persistent text
   * objects (the per-frame draws are gated on `hudCollapsed` in refreshHud/refreshFeed/refreshCrew/render). */
  private collapseLegacyPanels(): void {
    const objs: (Phaser.GameObjects.Text | undefined)[] = [
      this.feedTitle, this.crewTitle, this.channelTitle, this.controlTitle, this.controlBody, this.routePill,
      ...this.feedLines, ...this.crewRows, ...this.channelRows,
    ];
    for (const o of objs) o?.setVisible(false);
    this.feedVisible = false;
    this.crewVisible = false;
  }

  /** HUD PHASE 1 — per frame: build the dossier chips from live state, draw the bottom strip, and render the
   * open drawer's body. Reads sim/HUD state only; never resizes the world camera. */
  private refreshPanels(): void {
    if (!this.panels || !this.dossierG) return;
    const W = this.hudW(), H = this.hudH();
    const hud = realtimeHudView(this.state, SCENE_WEEK_SECONDS);
    const pid = this.state.player.id;
    const earnDistricts = new Set<string>();
    for (const d of this.state.districts) for (const b of d.businesses) if (businessEarner(b) === pid) earnDistricts.add(d.id);
    const idle = this.state.units.filter((u) => u.factionId === pid && u.role !== 'collector' && !u.downed && u.path.length === 0).length;
    const chips = buildDossierChips({
      wireUnread: unreadCount(this.wireLog),
      turfHeld: districtsHeld(this.state, pid).length,
      turfTotal: this.state.districts.length,
      turfContested: this.state.contests?.length ?? 0,
      pathsDom: earnDistricts.size,
      pathsTotal: this.state.districts.length,
      crewIdle: idle,
      ledgerDirtyPct: dirtyPercent(hud.player.cleanCash, hud.player.dirtyCash),
    });
    this.drawDossierStrip(chips, W, H);
    this.panels.render((id) => this.panelBody(id));
  }

  /** Draw the ~28px bottom dossier strip: one clickable chip per drawer (keycap + summary; the open one
   * reads brass). REPLACES the permanent side panels. */
  private drawDossierStrip(chips: DossierChip[], W: number, H: number): void {
    const g = this.dossierG!;
    g.removeAll(true);
    this.dossierHits = [];
    const stripH = 28, y = H - stripH;
    const bg = this.add.graphics().setScrollFactor(0);
    bg.fillStyle(PAL.ink, 0.92).fillRect(0, y, W, stripH);
    bg.lineStyle(1, hexNum(SPEC.brass), 0.35).beginPath(); bg.moveTo(0, y + 0.5); bg.lineTo(W, y + 0.5); bg.strokePath();
    g.add(bg);
    let x = 10;
    for (const chip of chips) {
      const open = !!this.panels?.isOpen(chip.id);
      const t = this.mkText(x, y + stripH / 2, `[${chip.key}] ${chip.label}`, {
        fontFamily: NOIR_FONT, fontSize: '12px', color: open ? NOIR_PALETTE.brass : NOIR_PALETTE.bone, fontStyle: open ? 'bold' : 'normal',
      }).setOrigin(0, 0.5);
      g.add(t);
      const w = t.width + 16;
      this.dossierHits.push({ x: x - 6, y, w, h: stripH, id: chip.id });
      x += w + 6;
    }
  }

  /**
   * Lane — CONTEXTUAL TOOLTIPS. Additively register hover zones for the HUD elements the existing ledger-bar
   * tooltips don't already explain — the CONSIGLIERE advisor toast and the bottom dossier-strip chips —
   * feeding the SAME one renderer (hudRegions → hudRegionExplain → the shared tooltipBg/tooltipText). Called
   * from update() AFTER refreshHud() (which resets hudRegions) and refreshPanels() (which rebuilds dossierHits),
   * so the zones survive the frame and use this frame's chip rects. Registration only — no layout changes.
   */
  private registerHudTooltips(): void {
    const add = (x: number, y: number, w: number, h: number, key: string): void => {
      const r = tipRegion(x, y, w, h, key);
      if (r) this.hudRegions.push(r);
    };
    // CONSIGLIERE advisor toast — only when a suggestion is showing (mirrors drawAdvisor's mount at 12,240).
    if (this.advisorTop) add(10, 236, 312, 64, 'consigliere');
    // the bottom dossier-strip chips — one tip per drawer toggle, from their live click rects.
    for (const hit of this.dossierHits) add(hit.x, hit.y, hit.w, hit.h, `dossier.${hit.id}`);
    // the legacy inline WIRE header, only when the expanded HUD actually shows it.
    if (!this.hudCollapsed) add(12, 60, 200, 22, 'wire');
  }

  /** The (scaffold) body lines for an open drawer. Wire shows trivial real log data; the rest are labelled
   * stubs until later HUD phases wire their real content in. */
  private panelBody(id: PanelId): string[] {
    const pid = this.state.player.id;
    switch (id) {
      case 'wire': {
        const rows = this.wireLog.entries.slice(0, 14).map((e) => `• ${e.message}${e.count > 1 ? ` ×${e.count}` : ''}`);
        return rows.length ? rows : ['No slips on the wire yet.'];
      }
      case 'turf':
        return [`Districts held: ${districtsHeld(this.state, pid).length}/${this.state.districts.length}`,
          `Contested: ${this.state.contests?.length ?? 0}`, '', '(full turf board lands in a later HUD phase)'];
      case 'paths':
        return ['Collection routes + dominance.', '', '(full paths view lands in a later HUD phase)'];
      case 'crew': {
        const muscle = this.state.units.filter((u) => u.factionId === pid && u.role !== 'collector' && !u.downed).length;
        return [`Muscle on the street: ${muscle}`, '', '(full crew roster lands in a later HUD phase)'];
      }
      case 'finance':
        return ['The ledger — clean / dirty / laundering.', '', '(full finance view lands in a later HUD phase)'];
    }
  }

  /** Resolve a click on the dossier strip → toggle that drawer. Returns true if it consumed the click. */
  private handleDossierClick(sx: number, sy: number): boolean {
    sx = this.hudX(sx); sy = this.hudY(sy); // screen → logical HUD space (UI-scale)
    for (const h of this.dossierHits) {
      if (sx >= h.x && sx <= h.x + h.w && sy >= h.y && sy <= h.y + h.h) { this.panels?.toggle(h.id); return true; }
    }
    return false;
  }

  // ── RTS-30b-ui: the clickable hotkey TOOLBAR ───────────────────────────────────────────────────

  /** Build the toolbar buttons once (in drawHud, before setupUiCamera → fixed HUD camera). Each verb is
   * a single interactive HUD Text (icon + NAME + [hotkey]); clicking runs EXACTLY what the hotkey does. */
  private buildToolbar(): void {
    const defs: Array<Omit<ToolbarButton, 'label'>> = [
      { id: 'extort', group: 'core', icon: '⊕', name: 'EXTORT', hotkey: 'E', run: () => this.commandExtort(), tip: 'Send a free thug to lean on the focused [%] front. Repeated visits fold it into a paying earner — no cash cost, just walking time + a spare thug.' },
      { id: 'collect', group: 'core', icon: '$', name: 'RUSH', hotkey: 'C', run: () => this.commandCollect(), tip: 'RUSH COLLECTION — collectors run themselves; this sends one for the accrued takings NOW instead of waiting for its next auto-run. No-op if nothing has accrued or a rushed collector is already on its way.' },
      { id: 'reinvest', group: 'core', icon: '▲', name: 'REINVEST', hotkey: 'R', run: () => this.commandReinvest(), tip: 'Open the priciest racket you can afford in your strongest district.' },
      { id: 'grease', group: 'core', icon: '✦', name: 'GREASE', hotkey: 'G', run: () => this.commandGrease(), tip: 'Bump the next bribe channel by $10/wk — buys down heat / raises the raid bar against you.' },
      { id: 'vice', group: 'core', icon: '♣', name: 'VICE', hotkey: 'U', run: () => this.commandViceUpgrade(), tip: 'Climb the vice ladder on the racket under your cursor — more yield, more heat. Hover one of YOUR rackets first.' },
      { id: 'krew', group: 'core', icon: '☷', name: 'KREW', hotkey: 'K', run: () => this.toggleCrew(), tip: 'Show / hide your crew roster + loyalty.' },
      { id: 'raid', group: 'offense', icon: '⚔', name: 'RAID', hotkey: '1', run: () => this.commandRaid(), tip: 'Raid a reachable rival front — shuts it down for weeks. Costs cash + heat.' },
      { id: 'sabotage', group: 'offense', icon: '✷', name: 'SABOTAGE', hotkey: '2', run: () => this.commandSabotage(), tip: 'Sabotage a rival operation. Costs cash + heat.' },
      { id: 'assassinate', group: 'offense', icon: '☠', name: 'HIT', hotkey: '3', run: () => this.commandAssassinate(), tip: 'Order a hit on a weakened rival — needs the muscle (crew strength). Costs cash + heat.' },
      { id: 'lockout', group: 'offense', icon: '⛒', name: 'LOCKOUT', hotkey: '4', run: () => this.commandLockout(), tip: 'Lock a rival out through The Bureau. Costs cash.' },
      { id: 'expand', group: 'build', icon: '⬢', name: 'EXPAND', hotkey: '5', run: () => this.commandExpand(), tip: 'Push your hold deeper into a district you already have a foothold in.' },
      { id: 'recruit', group: 'build', icon: '＋', name: 'RECRUIT', hotkey: '6', run: () => this.commandRecruit(), tip: 'Hire muscle — defense, collection, and (at strength) hits.' },
    ];
    for (const d of defs) {
      const label = this.mkText(0, this.hudH() - 44, `${d.icon} ${d.name} [${d.hotkey}]`, {
        fontFamily: NOIR_DISPLAY, fontSize: '12px', color: NOIR_PALETTE.bone, fontStyle: 'bold', backgroundColor: '#0a0807ee',
      }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(100002).setPadding(7, 5, 7, 5).setInteractive({ useHandCursor: true });
      const btn: ToolbarButton = { ...d, label };
      label.on('pointerdown', () => { this.toolbarClick = true; d.run(); });
      label.on('pointerover', () => this.showToolbarTip(btn));
      label.on('pointerout', () => this.toolbarTip?.setVisible(false));
      this.toolbarBtns.push(btn);
    }
    this.toolbarTip = this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, backgroundColor: '#0a0807f4', wordWrap: { width: 320 } })
      .setOrigin(0.5, 1).setScrollFactor(0).setDepth(100006).setPadding(9, 6, 9, 6).setVisible(false);
  }

  /** Scene context the core-verb chip states depend on (resolved view-side). */
  private toolbarContext(): CoreVerbContext {
    let extortTarget = !!(this.focusBizId && extortProgress(this.state, this.focusBizId)?.extortable);
    if (!extortTarget) {
      const o = firstObjective(this.state);
      if (o.step === 'extort' && o.targetBusinessId && extortProgress(this.state, o.targetBusinessId)?.extortable) extortTarget = true;
    }
    const ladder = this.ctxBizId ? viceLadder(this.state, this.ctxBizId) : null;
    return {
      selectedThug: !!this.selectedPlayerThug(),
      extortTarget,
      viceCtx: !!(ladder && ladder.next),
      viceAfford: !!(ladder && ladder.next && ladder.next.state === 'READY'),
    };
  }

  /** Per-frame: recompute each button's READY/CONDITIONAL/LOCKED chip (colour only on change — no per-
   * frame re-raster), apply progressive disclosure (offense group hidden until any unlocks; whole bar
   * tucked while the Market is open), and centre the visible row along the bottom. */
  private refreshToolbar(): void {
    if (this.toolbarBtns.length === 0) return;
    const ctx = this.toolbarContext();
    const offense = offenseReadout(this.state);
    const build = buildReadout(this.state);
    const anyOffense = offense.some((o) => verbChipState(o.available, o.reason) !== 'LOCKED');
    const tucked = this.marketOpen; // the Market takes the screen — tuck the toolbar (progressive disclosure)
    const visible: ToolbarButton[] = [];
    for (const b of this.toolbarBtns) {
      let st: ToolbarVerbState;
      if (b.group === 'core') st = coreVerbState(b.id as CoreVerbId, this.state, ctx);
      else if (b.group === 'offense') { const o = offense.find((x) => x.key === b.id); st = o ? verbChipState(o.available, o.reason) : 'LOCKED'; }
      else { const bo = build.find((x) => x.key === b.id); st = bo ? (bo.affordable ? 'READY' : 'CONDITIONAL') : 'LOCKED'; }
      const show = !tucked && (b.group !== 'offense' || anyOffense);
      b.label.setVisible(show);
      if (!show) continue;
      if (b.state !== st) { // only re-colour on a state change (protect the rts25 raster budget)
        b.state = st;
        this.setC(b.label, st === 'READY' ? SPEC.brass : st === 'CONDITIONAL' ? NOIR_PALETTE.bone : '#6a6253');
        b.label.setAlpha(st === 'LOCKED' ? 0.5 : 1);
      }
      visible.push(b);
    }
    // centre the visible row along the bottom (positions only — no raster)
    const gap = 6;
    let total = 0; for (const b of visible) total += b.label.width + gap; total = Math.max(0, total - gap);
    let x = this.hudW() / 2 - total / 2;
    const y = this.hudH() - 44;
    for (const b of visible) { b.label.setPosition(x + b.label.width / 2, y); x += b.label.width + gap; }
  }

  private showToolbarTip(b: ToolbarButton): void {
    if (!this.toolbarTip) return;
    this.setT(this.toolbarTip, `${b.name} [${b.hotkey}] — ${b.tip}`);
    const tx = Phaser.Math.Clamp(b.label.x, 170, this.hudW() - 170);
    this.toolbarTip.setPosition(tx, b.label.y - b.label.height - 8).setVisible(true);
    // POLISH v2 · PKG5 — the inspector tip SNAPS open (panelReveal eases scale 0.92→1 + alpha 0→1).
    const from = panelReveal(0), to = panelReveal(1);
    this.toolbarTip.setScale(from.scale).setAlpha(from.alpha);
    this.tweens.add({ targets: this.toolbarTip, scale: to.scale, alpha: to.alpha, duration: 140, ease: 'Quad.Out' });
  }

  // ── RTS-30c-2b: the contextual ACTION-ICON CARD (RTS-30d-4: chip hover → requirement inspector) ──

  /** Build the pooled action-icon chips once (in drawHud, before setupUiCamera → fixed HUD camera). */
  private buildActionCard(): void {
    for (let i = 0; i < 11; i++) {
      const icon = this.add.image(0, 0, actionIconKey('move')).setOrigin(0, 0).setScrollFactor(0).setDepth(100040).setVisible(false);
      const tab = this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '10px', color: '#e3c36a', backgroundColor: '#16130f' })
        .setOrigin(1, 1).setScrollFactor(0).setDepth(100042).setPadding(2, 1, 2, 1).setVisible(false);
      const hit = this.add.rectangle(0, 0, 44, 44, 0x000000, 0.001).setOrigin(0, 0).setScrollFactor(0).setDepth(100043).setVisible(false).setInteractive({ useHandCursor: true });
      const slot: ActionChipSlot = { icon, tab, hit, enabled: false, reason: '' };
      hit.on('pointerdown', () => { this.toolbarClick = true; if (slot.verb && slot.enabled) this.runVerb(slot.verb); else if (slot.verb) { const insp = buildActionInspector(this.state, slot.verb, this.inspectorCtx()); this.setStatus(`${insp.title} — ${insp.nextStep ?? slot.reason}`); } });
      hit.on('pointerover', () => { if (slot.verb && this.actionTip) this.setT(this.actionTip, this.inspectorTipText(slot.verb)).setPosition(Phaser.Math.Clamp(icon.x + 22, 170, this.hudW() - 170), icon.y - 8).setVisible(true); });
      hit.on('pointerout', () => this.actionTip?.setVisible(false));
      this.actionChips.push(slot);
    }
    this.actionTip = this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, backgroundColor: '#0a0807f6', lineSpacing: 3, wordWrap: { width: 340 } })
      .setOrigin(0.5, 1).setScrollFactor(0).setDepth(100045).setPadding(9, 7, 9, 7).setVisible(false);
  }

  /** The scene-side context the inspector can't read off the sim (a focused front / rival racket). RTS-30d-4. */
  private inspectorCtx(): InspectorContext {
    return {
      extortTarget: !!(this.focusBizId && extortProgress(this.state, this.focusBizId)?.extortable),
      attackTarget: !!(this.focusBizId && businessActions(this.state, this.focusBizId, 'player')?.attack.ok),
    };
  }

  /** RTS-30d-4 — the EXPANDED requirement breakdown shown on chip hover: a state badge, one row per
   * requirement (✓ met / ✗ missing / ! risk — symbol PLUS text, never colour alone), then the next step.
   * Built from the PURE inspector; the scene only formats. */
  private inspectorTipText(verb: VerbId): string {
    const insp = buildActionInspector(this.state, verb, this.inspectorCtx());
    const badge = insp.state === 'ready' ? '→ READY' : insp.state === 'conditional' ? '! CONDITIONAL' : '✗ LOCKED';
    const lines = [`${insp.title} — ${insp.summary}`, badge];
    for (const r of insp.rows) {
      const nums = r.current && r.required ? `  ${r.current} / ${r.required}` : r.current ? `  ${r.current}` : '';
      lines.push(`${rowSymbol(r.state)} ${r.label}${nums}${r.detail ? `  — ${r.detail}` : ''}`);
    }
    // RTS-33: RECRUIT teaches the specialist path — each weapon-tier unit + its grease gate / unlock.
    if (insp.specialists && insp.specialists.length > 0) {
      lines.push('SPECIALISTS — build a real crew, not just thugs:');
      for (const s of insp.specialists) lines.push(`${rowSymbol(s.state)} ${s.label}  $${s.cost}  — ${s.detail}`);
    }
    if (insp.nextStep) lines.push(`→ next: ${insp.nextStep}`);
    return lines.join('\n');
  }

  /** The player's COMMANDABLE unit views (excludes the autonomous collectors). RTS-30d. */
  private commandableViews(): UnitView[] {
    return this.units.filter((v) => v.faction === 'player' && isCommandableUnit(v.unit));
  }

  /** The ids of every live commandable player unit — the "still in play" set control groups prune against. */
  private liveCommandableIds(): string[] {
    return this.commandableViews().map((v) => v.unit.id);
  }

  /** SELECTION QoL — TAB selects the next IDLE (no-order) player unit (reverse=Shift+TAB) and centres on
   * it so an idle man off-screen is easy to find. No idle units → a status hint, selection unchanged. */
  private cycleIdleUnit(reverse: boolean): void {
    const next = nextIdleId(idleUnitIds(this.commandableViews().map((v) => v.unit)), this.selection.ids, reverse);
    if (!next) { this.setStatus('no idle units to cycle'); return; }
    this.focusBizId = undefined;
    this.hideCollectorInfo();
    this.selection = selectOnly(next);
    this.centerOnSelection();
    this.refreshSelCount(this.selection.ids.length);
  }

  /** SELECTION QoL — route a digit key for control groups: Ctrl/⌘+digit BINDS the current selection to
   * that group; a bare digit RECALLS a bound group. Returns true when the key was consumed as a group
   * action (so the caller skips its offense/build-verb / audio-bus fallback). */
  private handleGroupDigit(n: number, e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey) { e.preventDefault?.(); this.bindControlGroup(n); return true; }
    return this.recallControlGroup(n);
  }

  /** Bind the current selection to control group `n` (empty selection clears the group). */
  private bindControlGroup(n: number): void {
    this.controlGroups = bindGroup(this.controlGroups, n, this.selection.ids);
    const count = this.selection.ids.length;
    this.setStatus(count ? `control group ${n} ← ${count} unit${count > 1 ? 's' : ''}` : `control group ${n} cleared`);
  }

  /** Recall control group `n`: select its surviving members (stale/dead ids pruned). A double-tap of the
   * same group within the window also centres the camera on it. Returns false (no-op) for an unbound
   * group, so the digit falls through to its verb. */
  private recallControlGroup(n: number): boolean {
    if (!Array.isArray(this.controlGroups[n])) return false; // never bound → let the verb fire
    const live = recallGroup(this.controlGroups, n, this.liveCommandableIds());
    this.controlGroups = pruneGroup(this.controlGroups, n, this.liveCommandableIds()); // drop the dead
    if (live.length === 0) { this.setStatus(`control group ${n} is empty`); return true; }
    const now = this.time.now;
    const center = isCenterRecall(this.lastRecall, n, now);
    this.lastRecall = { group: n, atMs: now };
    this.focusBizId = undefined;
    this.hideCollectorInfo();
    this.selection = selectMany(live);
    this.refreshSelCount(this.selection.ids.length);
    if (center) this.centerOnSelection();
    this.setStatus(`control group ${n} — ${live.length} selected`);
    return true;
  }

  /** RTS-30d-3 — paint the live drag-box marquee: a brass-line rectangle in SCREEN space (scrollFactor 0,
   * so it never drifts with the camera). Corners may be given in any order. */
  private drawMarquee(x0: number, y0: number, x1: number, y1: number): void {
    if (!this.marqueeGfx) {
      this.marqueeGfx = this.add.graphics().setScrollFactor(0).setDepth(100220);
      this.hudFx(this.marqueeGfx);
    }
    // the box renders on the fixed HUD camera → draw it in logical coords so it tracks the cursor under UI-scale.
    x0 = this.hudX(x0); x1 = this.hudX(x1); y0 = this.hudY(y0); y1 = this.hudY(y1);
    const x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
    const brass = hexNum(SPEC.brass);
    this.marqueeGfx.clear().setVisible(true)
      .fillStyle(brass, 0.08).fillRect(x, y, w, h)
      .lineStyle(1.5, brass, 0.9).strokeRect(x, y, w, h);
  }

  /** The on-screen position of a unit (world → screen, accounting for camera scroll + zoom). RTS-30d-3. */
  private unitScreenXY(u: MovableUnit): { x: number; y: number } {
    const sp = unitScreenPos(u);
    const wv = this.cameras.main.worldView, z = this.cameras.main.zoom;
    return { x: (sp.x - wv.x) * z, y: (sp.y - wv.y) * z };
  }

  /** RTS-30d-3 — finish a drag-box: select every COMMANDABLE player unit whose screen position falls inside
   * the marquee rect. Shift ADDS to the current selection; otherwise it replaces. Collectors + non-units are
   * excluded (they are not in commandableViews). */
  private resolveMarquee(p: Phaser.Input.Pointer, shift: boolean): void {
    // Project each commandable unit to screen space, then reuse the pure screen-rect hit math.
    const points = this.commandableViews().map((v) => ({ id: v.unit.id, ...this.unitScreenXY(v.unit) }));
    const hits = idsInScreenRect(points, this.pressX, this.pressY, p.x, p.y);
    this.focusBizId = undefined;
    this.hideCollectorInfo();
    if (shift) { this.selection = selectMany([...this.selection.ids, ...hits]); }
    else { this.selection = selectMany(hits); }
    this.setStatus(hits.length ? `${this.selection.ids.length} selected` : undefined);
  }

  /** Clear the live marquee graphics + flag (the drag is over). RTS-30d-3. */
  private endMarquee(): void {
    this.marqueeActive = false;
    this.marqueeGfx?.clear().setVisible(false);
  }

  /** RTS-30d-3 — the "N selected" readout above the action card; only shown for a real (≥1) selection. */
  private refreshSelCount(n: number): void {
    if (!this.selCountText) {
      this.selCountText = this.mkText(12, 0, '', { fontFamily: NOIR_DISPLAY, fontSize: '13px', color: NOIR_PALETTE.brass, fontStyle: 'bold' })
        .setOrigin(0, 1).setScrollFactor(0).setDepth(100052);
      this.hudFx(this.selCountText);
    }
    this.selCountText.setPosition(12, this.hudH() - 162)
      .setText(n > 1 ? `${n} SELECTED` : '').setVisible(n > 1);
  }

  /** RTS-30d-2 — the collector READ-ONLY popover: carrying $ · ETA to HQ · route SAFE/CONTESTED. No
   * verbs, no control (collectors are autonomous). Builds on a fixed-camera HUD text. */
  private showCollectorInfo(u: MovableUnit): void {
    if (!this.collectorInfo) {
      this.collectorInfo = this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, backgroundColor: '#0a0807f2', align: 'left' })
        .setOrigin(0.5, 1).setScrollFactor(0).setDepth(100210).setPadding(9, 6, 9, 6);
      this.hudFx(this.collectorInfo);
    }
    this.collectorInfoId = u.id;
    const sp = unitScreenPos(u);
    const wv = this.cameras.main.worldView, z = this.cameras.main.zoom;
    // world→real-screen via the main camera, then →logical HUD (÷ uiScale) since this label is on the uiCam.
    const sx = (sp.x - wv.x) * z / this.uiScaleFactor, sy = (sp.y - wv.y) * z / this.uiScaleFactor;
    this.collectorInfo.setPosition(Phaser.Math.Clamp(sx, 120, this.hudW() - 120), Phaser.Math.Clamp(sy - 22, 60, this.hudH() - 12))
      .setText(this.collectorInfoText(u)).setVisible(true);
  }

  private collectorInfoText(u: MovableUnit): string {
    const carrying = u.carrying ?? 0;
    const t = unitTile(u);
    const did = this.world ? this.world.districtOfTile[t.gy * this.world.size + t.gx] : undefined;
    const contested = collectorVulnerableInDistrict(this.state, did);
    const hq = hqTileOf(this.layout, 'player');
    const etaTiles = hq && u.routePhase === 'toBank' ? Math.round(Math.hypot(hq.gx - u.pos.gx, hq.gy - u.pos.gy)) : null;
    const eta = etaTiles != null && u.speed > 0 ? `~${Math.max(1, Math.round(etaTiles / u.speed))}s to HQ` : (u.routePhase === 'toStop' ? 'gathering the take' : 'on route');
    const route = contested ? '⚔ route CONTESTED — robbable' : '✓ route SAFE';
    return `COLLECTOR (runs itself)\ncarrying $${carrying} · ${eta}\n${route}`;
  }

  private hideCollectorInfo(): void { this.collectorInfo?.setVisible(false); this.collectorInfoId = undefined; }

  /** Keep the open collector popover tracking its (moving) collector; hide it if the collector banked +
   * despawned. Read-only — never issues a command. */
  private refreshCollectorInfo(): void {
    if (!this.collectorInfoId || !this.collectorInfo) return;
    const u = this.state.units.find((x) => x.id === this.collectorInfoId);
    if (!u) { this.hideCollectorInfo(); return; }
    const sp = unitScreenPos(u);
    const wv = this.cameras.main.worldView, z = this.cameras.main.zoom;
    const lx = (sp.x - wv.x) * z / this.uiScaleFactor, ly = (sp.y - wv.y) * z / this.uiScaleFactor; // →logical HUD
    this.collectorInfo.setPosition(Phaser.Math.Clamp(lx, 120, this.hudW() - 120), Phaser.Math.Clamp(ly - 22, 60, this.hudH() - 12))
      .setText(this.collectorInfoText(u));
  }

  /** Per-frame: show the action-icon chips for the selected player unit (only its valid verbs; locked
   * ones greyed with a why-tooltip). Hidden when nothing relevant is selected. */
  private refreshActionCard(): void {
    this.refreshCollectorInfo();
    if (this.actionChips.length === 0) return;
    // RTS-30d-3: gather EVERY selected COMMANDABLE view (collectors excluded — autonomous, not commandable).
    const selViews = this.units.filter((v) => this.selection.ids.includes(v.unit.id) && v.faction === 'player' && isCommandableUnit(v.unit));
    this.refreshSelCount(selViews.length);
    if (selViews.length === 0) { for (const s of this.actionChips) { s.icon.setVisible(false); s.tab.setVisible(false); s.hit.setVisible(false); s.verb = undefined; } return; }
    const extortTarget = !!(this.focusBizId && extortProgress(this.state, this.focusBizId)?.extortable);
    const attackTarget = !!(this.focusBizId && businessActions(this.state, this.focusBizId, 'player')?.attack.ok);
    const ctxs: UnitActionContext[] = selViews.map((v) => ({ weapon: v.unit.weapon, role: v.unit.role, extortTarget, attackTarget }));
    // RTS-30d-3: one unit → its full repertoire; many → only the verbs COMMON to the whole selection.
    const chips: ActionChip[] = selViews.length > 1
      ? multiSelectChips(this.state, ctxs, ctxs[0])
      : unitActionChips(this.state, ctxs[0]);
    const patrolling = selViews.every((v) => !!v.unit.patrol); // ACTIVE stance = the WHOLE selection is on patrol
    const size = 44, gap = 6, x0 = 12, y = this.hudH() - 150;
    chips.forEach((ch, i) => {
      const s = this.actionChips[i];
      const cx = x0 + i * (size + gap);
      s.verb = ch.verb; s.enabled = ch.enabled; s.reason = ch.reason;
      const active = ch.verb === 'patrol' && patrolling; // brass-fill highlight = stance engaged
      s.icon.setTexture(actionIconKey(ch.verb)).setPosition(cx, y).setAlpha(ch.enabled ? 1 : 0.4).setVisible(true);
      if (active) s.icon.setTint(0xe3c36a); else s.icon.clearTint();
      s.tab.setText(ch.hotkey).setPosition(cx + size - 2, y + size - 2).setVisible(true);
      s.hit.setPosition(cx, y).setVisible(true);
    });
    for (let i = chips.length; i < this.actionChips.length; i++) { const s = this.actionChips[i]; s.icon.setVisible(false); s.tab.setVisible(false); s.hit.setVisible(false); s.verb = undefined; }
  }

  /** Run a verb chip — EXACTLY what its hotkey does (the dead-button discipline). */
  private runVerb(verb: VerbId): void {
    switch (verb) {
      case 'move': this.setStatus('right-click a tile to move the selected unit there'); break;
      case 'attack': if (this.focusBizId) this.commandAttackBusiness(this.focusBizId); else this.setStatus('right-click a rival racket to attack it'); break;
      case 'extort': this.commandExtort(); break;
      case 'collect': this.commandCollect(); break;
      case 'patrol': this.commandPatrol(); break;
      case 'sabotage': case 'demolish': this.commandSabotage(); break;
      case 'assassinate': this.commandAssassinate(); break;
      case 'raid': this.commandRaid(); break;
      case 'expand': this.commandExpand(); break;
      case 'recruit': this.commandRecruit(); break;
    }
  }

  /** [Q] PATROL — toggle the guard stance on every selected player muscle unit. A patrolling unit loops
   * its current district (steerPatrols) and adds a defensive presence bonus in the contest. */
  private commandPatrol(): void {
    const sel = this.units.filter((v) => this.selection.ids.includes(v.unit.id) && v.faction === 'player' && v.unit.role !== 'collector');
    if (sel.length === 0) { this.setStatus('select a thug, then [Q] to set it on patrol'); return; }
    const turningOn = sel.some((v) => !v.unit.patrol);
    for (const v of sel) v.unit.patrol = turningOn;
    this.setStatus(turningOn ? `${sel.length} on PATROL — holding the beat (adds muscle presence in their district)` : `${sel.length} stood down from patrol`);
  }

  /** Keep patrolling units looping inside their current district (a defensive beat). */
  private steerPatrols(): void {
    if (!this.world) return;
    const size = this.world.size;
    const cl = (v: number) => Math.max(0, Math.min(size - 1, v));
    for (const v of this.units) {
      const u = v.unit;
      if (!u.patrol || v.faction !== 'player' || u.path.length > 0) continue;
      const t = unitTile(u);
      if (t.gx < 0 || t.gy < 0 || t.gx >= size || t.gy >= size) continue;
      const did = this.world.districtOfTile[t.gy * size + t.gx];
      const d = this.world.districts.find((x) => x.id === did);
      if (d) issueMove(u, { gx: cl(d.centroid.gx + Phaser.Math.Between(-3, 3)), gy: cl(d.centroid.gy + Phaser.Math.Between(-3, 3)) }, this.navGrid);
    }
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
      const life = this.ambient ? ` · life ${this.ambient.pedCount}p/${this.ambient.carCount}c` : '';
      this.setT(this.perfText, `FPS ${fps} · frame ${ms}ms · text-raster ${this.rasterPerSec}/s${life} · DPR ${this.textRes}`)
        .setPosition(this.hudW() / 2, 6);
    }
  }

  /** Turf-war readout (RTS-16): trajectory + standings + rival-pressure telegraph, and recolour
   * the district nameplates by who holds them (brass = you, rival-red = a rival, fog = neutral). */
  private refreshStrategy(): void {
    if (!this.strategyPanel || !this.strategyTitle || !this.pressureBanner) return;
    const right = this.hudW() - 18;
    const standing = cityStanding(this.state);
    // RTS-34 — the COMPASS hero line: one read of where you're heading + the top threat.
    if (this.compassText) {
      const compass = winLossCompass(this.state);
      this.setTC(this.compassText, compass.line, compass.threatUrgent ? SPEC.danger : NOIR_PALETTE.brass).setPosition(right, 250);
    }
    this.strategyTitle.setPosition(right, 270);
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
    // Lane E — FOUR TELEGRAPHED VICTORY CONDITIONS. Domination's two triggers (LAST STANDING /
    // DOMINANCE) read as separate tracks alongside GO STRAIGHT and GET ELECTED, so the player always
    // sees four concrete ways to win, how close each is, and — via the stage glyph — which are
    // heating up. The leader is starred; an imminent (≥80%) condition gets a "one move away" banner.
    const conds = victoryConditions(this.state);
    const lead = conds.reduce((a, b) => (b.pct > a.pct ? b : a), conds[0]);
    const brink = imminentVictory(this.state);
    lines.push(brink ? `— ONE MOVE FROM ${brink.label} —` : '— FOUR WAYS TO WIN —');
    for (const w of conds) {
      const glyph = w === lead && w.pct > 0 ? '★' : IsoScene.victoryGlyph(w);
      lines.push(`${glyph} ${w.label} ${w.pct}%`);
      lines.push(`   ${w.read.length > 38 ? w.read.slice(0, 37) + '…' : w.read}`);
    }
    this.setT(this.strategyPanel, lines.join('\n')).setPosition(right, 290);
    this.setC(this.strategyPanel, standing.trajectory === 'dominant' || standing.trajectory === 'ahead' ? NOIR_PALETTE.brass
      : standing.trajectory === 'behind' || standing.trajectory === 'crushed' ? SPEC.danger : NOIR_PALETTE.bone);

    // RTS-28 §4 — the ACTION BOARD (its OWN bottom-right panel, separated from the ledger above).
    this.refreshActionBoard();

    // recolour district nameplates by holder + RTS-25 zoom-gate: hide the small map labels when the
    // camera is pulled back far enough that they'd be an illegible speck (the §-legibility rule).
    const labelsLegible = this.cameras.main.zoom >= 0.5;
    const contested = new Set(contestedDistrictIds(this.state)); // RTS-30c-1: war nameplates read amber
    for (const [id, label] of this.districtLabels) {
      const d = this.state.districts.find((x) => x.id === id);
      const holder = d ? districtHolder(d) : null;
      this.setC(label, contested.has(id) ? WAR_AMBER_HEX
        : holder === 'player' ? SPEC.brass : holder && holder.startsWith('rival') ? SPEC.rival : NOIR_PALETTE.fog);
      label.setVisible(labelsLegible);
    }

    // rival-pressure telegraph: the most urgent push onto your turf (like the run-2 threat).
    const onPlayer = telegraphedPushes(this.state).find((t) => t.onPlayer);
    if (onPlayer) {
      this.setT(this.pressureBanner, `⚔ ${onPlayer.familyName.toUpperCase()} IS PUSHING INTO ${onPlayer.districtName.toUpperCase()} — DEFEND OR GREASE CITY HALL`)
        .setPosition(this.hudW() / 2, 106).setVisible(true).setAlpha(0.7 + 0.3 * Math.abs(Math.sin(this.time.now / 300)));
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
    const bottom = this.hudH() - 12;
    const x = this.hudW() - margin;
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
    // RTS-30e: a CONTROL-FLIP pulse — a ring rides out in the new holder's identity (rival-red on a loss,
    // brass on a gain). Static identity colour expanding = a flip you can read at a glance.
    const ring = this.add.circle(label.x, label.y - 4, 10).setStrokeStyle(3, hexNum(lostByPlayer ? SPEC.rival : SPEC.brass), 0.9).setDepth(100001);
    this.worldFx(ring);
    this.tweens.add({ targets: ring, scale: 5, alpha: 0, duration: 700, ease: 'Quad.Out', onComplete: () => ring.destroy() });
    if (lostByPlayer) this.fxShake(160, 0.004);
  }

  private toggleCrew(): void {
    this.crewVisible = !this.crewVisible;
    this.crewTitle?.setVisible(this.crewVisible);
    for (const r of this.crewRows) r.setVisible(this.crewVisible && r.text !== '');
  }

  private static crewGlyph(status: string): string {
    return status === 'loyal' ? '●' : status === 'wavering' ? '◐' : '○';
  }

  /** Lane E — the telegraph glyph for a victory condition by its escalation stage. */
  private static victoryGlyph(c: VictoryCondition): string {
    return c.stage === 'won' ? '✔' : c.stage === 'imminent' ? '◉' : c.stage === 'closing' ? '◐' : c.stage === 'building' ? '·' : '·';
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
    const baseY = this.hudH() - 30 - rows.length * 18;
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
          .setPosition(this.hudW() / 2, 130).setVisible(true).setAlpha(0.7 + 0.3 * Math.abs(Math.sin(now / 300)));
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
    const W = this.hudW(), now = this.time.now;
    g.clear();
    this.hudRegions = [];

    // ── TOP BAR ──
    const barX = 8, barY = 6, barW = W - 16, barH = 50;
    this.decoFrame(g, barX, barY, barW, barH);
    // a hairline brass deco rule under the title row
    g.lineStyle(1, PAL.brass, 0.25).beginPath(); g.moveTo(barX + 8, barY + 21); g.lineTo(barX + barW - 8, barY + 21); g.strokePath();

    // RTS-34 CASH JUICE — the empire totals ROLL toward their value (count-up) instead of snapping, so a
    // bank/spend reads as the number LANDING. Seeded to the real values on the first frame (no opening roll).
    const dtMs = this.game.loop.delta;
    if (!this.cashInit) { this.shownCash = p.cleanCash; this.shownNet = net; this.cashInit = true; }
    // POLISH v2 · PKG5 — a windfall SPINS up fast then eases (cashRollRate shapes the EXISTING rollToward's
    // rate by the gap size); it still lands exactly. Not a 2nd cash system — just a rate shaper.
    else { this.shownCash = rollToward(this.shownCash, p.cleanCash, dtMs, cashRollRate(p.cleanCash - this.shownCash)); this.shownNet = rollToward(this.shownNet, net, dtMs, cashRollRate(net - this.shownNet)); }
    const cleanShown = Math.round(this.shownCash), netShown = Math.round(this.shownNet);

    const heatCellW = 300;
    const fixed: Record<string, { v: string; c: string; w: number }> = {
      clean: { v: `$${cleanShown}`, c: NOIR_PALETTE.brass, w: 118 },
      dirty: { v: `$${p.dirtyCash}`, c: p.dirtyCash > 4000 ? '#d98a6a' : NOIR_PALETTE.bone, w: 118 },
      net: { v: netShown >= 0 ? `+$${netShown}` : `-$${Math.abs(netShown)}`, c: netShown >= 0 ? SPEC.cashGreen : SPEC.danger, w: 120 },
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
        this.setTC(cell.value, def.v, def.c).setPosition(cx, barY + (cell.key === 'net' ? 18 : 22)).setVisible(true);
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

    // ── LEGACY SIDE STACK (HUD PHASE 1: retired when collapsed — summaries moved to the dossier strip) ──
    if (!this.hudCollapsed) {
      this.drawChannels(g, p);   // FOUR CHANNEL DIALS (→ Finance drawer, later phase)
      this.drawRoutePill(g, p);  // ROUTE PILL (→ Paths drawer, later phase)
      this.drawControl(g);       // CONTROL readout (→ Turf drawer, later phase)
    }

    // ── CONTEXT CARD (selected thug) — kept: a transient selection readout, not part of the side stack ──
    this.drawContextCard(g);

    // ── THE MARKET tab (right dock, when open) ──
    this.drawMarket(g);

    // ── THE WIRE frame (behind the feed, under the top bar) — hidden while the Market replaces the dock ──
    if (!this.hudCollapsed && this.feedVisible && !this.marketOpen) {
      const fw = 306, fx = W - fw - 6, fy = 60;
      this.decoFrame(g, fx, fy, fw, 184, PAL.brass, 0.5);
      if (now < this.wireFlashUntil) { g.lineStyle(2, hexNum(SPEC.danger), 0.4 + 0.4 * Math.abs(Math.sin(now / 120))); g.strokeRect(fx + 1, fy + 1, fw - 2, 182); }
    }

    // Klaxon vignette + warning banner + audio seams
    this.refreshKlaxon(p.federalTier >= 3);
    const warn = p.federalTier > 0 ? this.fedLine(p.federalTier) : danger ? 'A COLLECTOR IS UNDER THREAT — get it to HQ' : null;
    if (this.warningBanner) {
      this.warningBanner.setVisible(!!warn);
      if (warn) this.setT(this.warningBanner, `⚠ ${warn}`).setPosition(12, this.hudH() - 26 - 30).setAlpha(0.7 + 0.3 * Math.abs(Math.sin(now / 280))); // HUD PHASE 1 — above the dossier strip
    }
    this.detectHudBeats(p, phase.phase);
    this.lastHeat = p.federalExposure; // for the next frame's heat-direction arrow
    void shockFlavor; void ISO_TILE_HEIGHT; void heatLabel;
  }

  /** §1D — the LADDERED heat meter: filled to exposure, ENGRAVED ticks at 50/70/85 with their
   * NOTICE/WATCH/RAID labels, a direction arrow, and a named caption. */
  private drawHeatMeter(g: Phaser.GameObjects.Graphics, x: number, barY: number, w: number, _heat: number, exposure: number, tier: number): void {
    // RTS-34.2 — lift the track so the tier labels + caption tuck ONTO it inside the 50px top bar
    // (they were anchored 14px below the track → spilled below the bar frame, reading as detached
    // "floating" labels). Layout within the bar: header(≈13) · meter(26-34) · NOTICE/WATCH/RAID(35) ·
    // caption(45). All y are relative to barY (fixed UI camera) so they re-anchor at every window size.
    const my = barY + 20, mh = 8, mw = w - 8;
    g.fillStyle(PAL.charcoal, 1).fillRect(x, my, mw, mh);
    g.fillStyle(hexNum(federalBarColor(tier)), 1).fillRect(x, my, mw * Phaser.Math.Clamp(exposure / 100, 0, 1), mh);
    // engraved threshold ticks + tiny NOTICE/WATCH/RAID labels
    for (const t of FEDERAL_LADDER) {
      const tx = x + (mw * t.at) / 100;
      const passed = exposure >= t.at;
      g.lineStyle(1, hexNum(passed ? SPEC.brass : SPEC.bone), passed ? 0.95 : 0.7); // static: brass when passed
      g.beginPath(); g.moveTo(tx, my - 2); g.lineTo(tx, my + mh + 2); g.strokePath();
    }
    // the threshold labels engraved right UNDER their ticks (on the meter track)
    this.drawLadderLabels(g, x, my + mh + 1, mw);
    // direction arrow + the named tier caption ("WATCH · exp 72/100 ▲ · raid at 85") below the labels
    const dir = exposure > this.lastHeat + 0.5 ? '▲ rising' : exposure < this.lastHeat - 0.5 ? '▼ cooling' : '◆ steady';
    const name = federalTierLabel(tier);
    const cap = `${name} · exp ${exposure}/100 ${dir} · raid at 85`;
    if (this.heatCaption) this.setTC(this.heatCaption, cap, tier >= 2 ? '#d98a6a' : NOIR_PALETTE.fog).setPosition(x, my + mh + 11);
  }

  /** Tiny engraved NOTICE/WATCH/RAID labels under their ladder ticks (drawn once-per-frame as text
   * cache so we don't allocate; reuses 3 pooled labels). */
  private ladderLabelPool: Phaser.GameObjects.Text[] = [];
  private drawLadderLabels(_g: Phaser.GameObjects.Graphics, x: number, y: number, mw: number): void {
    FEDERAL_LADDER.forEach((t, i) => {
      let lbl = this.ladderLabelPool[i];
      if (!lbl) { lbl = this.mkText(0, 0, '', { fontFamily: NOIR_DISPLAY, fontSize: '9px', color: NOIR_PALETTE.fog }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100000); this.ladderLabelPool[i] = lbl; }
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
    this.channelHitRegions = []; // BALANCE — rebuilt below: each row clicks to grease THAT channel
    const FEDERAL_GREEN = 0x5b7d6a; // §2: The Bureau reads federal-green (canon-checked accent)
    const defs: { ch: BribeChannel; name: string; buys: string }[] = [
      { ch: 'police', name: 'THE BEAT', buys: 'fewer raids' },
      { ch: 'judges', name: 'THE BENCH', buys: 'survive a bust · −raid heat' },
      { ch: 'politicians', name: 'CITY HALL', buys: 'heat cools · hit cover' },
      { ch: 'feds', name: 'THE BUREAU', buys: 'fed shield · arms LOCKOUT [4] ($800 + a rival)' },
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
      this.hudRegions.push({ x: r.x, y: y - 2, w: r.w, h: 21, explain: `${d.name} — ${bracket.name} ($${lvl}/wk): buys ${d.buys}. CLICK to grease this channel +$10/wk ([G] greases the hottest).${fedExtra}` });
      // BALANCE — the row is a click target: grease THIS channel (the player chooses who to pay).
      this.channelHitRegions.push({ ch: d.ch, x: r.x, y: y - 2, w: r.w, h: 21 });
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
    const overWorld = this.hudY(ptr.y) > 60 && this.hudX(ptr.x) < this.hudW() - 320 && this.hudY(ptr.y) < this.hudH() - 96;
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
        const h = viceLine ? 98 : 84, y = this.hudH() - h - 12;
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
    const h = 76, y = this.hudH() - h - 12;
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
    const right = this.hudW() - 18;
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
      // RTS-27 progressive disclosure for the ears: only needs-you slips RING (📞); routine = soft tick.
      // AUDIO PASS — the routine tick is THROTTLED (≥1.5s apart) so an incident BURST (combat downs / rival
      // telegraphs once the war heats up) can't rattle it into a scratchy tick-tick-tick. Crisis rings stay
      // responsive (a needs-you slip always rings + flashes).
      if (needsYou) { this.wireFlashUntil = this.time.now + 900; this.audio?.wire('crisis'); }
      else if (this.time.now - this.lastWireRoutineMs > 1500) { this.audio?.wire('routine'); this.lastWireRoutineMs = this.time.now; }
    }
    if (this.lastPhase && this.lastPhase !== phase) {
      this.flashPhaseChange(phase);
      // RTS-27: a phase STING on the narrative beat change. The BED itself is now requested by the audio
      // CONDUCTOR (updateConductor) so the score swells with the action, not just the stage.
      this.audio?.play(this.audio.stingForPhaseKey(phase as MusicPhase));
      if (phase === 'CONTEST' || phase === 'FIRST BLOOD') this.fireTipOnce('war');
    }
    this.lastPhase = phase;
    // POLISH v2 · PKG5 — request the intensity-driven bed THROUGH the existing RTS-31 conductBeds path.
    this.updateConductor(phase as MusicPhase, p.federalTier);
    // RTS-27/30e: the teletype escalation + a one-shot edge flash only when the federal tier CROSSES
    // up a rung (50/70/85) — amber→danger by tier, motion-only.
    if (p.federalTier > this.lastFederalTier) {
      this.audio?.federal(p.federalTier);
      this.flashFederalCross(p.federalTier); // #3 — the GLOBAL, non-directional federal banner (no arrow/ping)
      // INFO-FEEDBACK — federal.threshold is GLOBAL (#3): log it (no gx/gy → no edge arrow, no minimap ping).
      this.recordInfoEvent('federal.threshold', `FEDERAL ${['', 'NOTICE', 'WATCH', 'RAID'][p.federalTier] ?? ''} — heat crossed a rung`);
    }
    this.lastFederalTier = p.federalTier;
  }

  /** POLISH v2 · PKG5 — the AUDIO CONDUCTOR: blend the EXISTING signals (threat / federal tier 50-70-85 /
   * active combat / week pacing) into a 0..1 intensity and request the matching in-match bed with hysteresis
   * — so the score swells with the action instead of flipping on jitter. Terminal phases (TITLE/GAMEOVER)
   * and FIRST BLOOD are stage-driven directly; the endgame stage floors the bed at DECAPITATE. The bed is
   * ALWAYS requested through AudioManager.setPhase (→ conductBeds): this never starts/stops a bed itself,
   * never bypasses the crossfade lock, and never breaks the ≤1-bed guarantee. */
  private updateConductor(matchPhase: MusicPhase, federalTier: number): void {
    if (!this.audioConductEnabled) return;
    const now = this.time.now;
    let bed: MusicPhase;
    if (!isIntensityBed(matchPhase)) {
      bed = matchPhase; // TITLE / GAMEOVER / FIRST BLOOD — stage-driven (FIRST BLOOD keeps its own bed)
    } else {
      const threat = threatenedCollectors(this.state).reduce(
        (m, t) => Math.max(m, t.level === 'ambush' ? 1 : t.level === 'threatened' ? 0.5 : 0), 0);
      const activeCombat = Math.max(0, 1 - (now - this.lastCombatMs) / 3000);
      const weekPacing = (this.state.weekElapsed ?? 0) / SCENE_WEEK_SECONDS;
      const intensity = conductorIntensity({ threat, federalTier, activeCombat, weekPacing });
      this.conductor = conductWithHysteresis(this.conductor, intensity, now);
      bed = matchPhase === 'DECAPITATE' ? 'DECAPITATE' : this.conductor.phase; // the endgame floors the bed
    }
    // Request the bed EVERY frame: setPhase is idempotent (same bed → no-op) AND sink-dwell-gated, so the
    // stage overrides (FIRST BLOOD / the DECAPITATE floor) can no longer thrash it. No requestedBedPhase
    // guard here — that would desync when the dwell HOLDS a requested change; the retry next frame applies it.
    this.audio?.setPhase(bed);
  }

  // ── RTS-27 audio settings surface ──────────────────────────────────────────────────────────

  private static readonly AUDIO_BUSES: (keyof import('./audio').AudioSettings)[] = ['master', 'music', 'sfx', 'vo', 'ambience'];

  private buildAudioPanel(): void {
    this.audioPanel = this.mkText(12, this.hudH() - 140, '', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, backgroundColor: '#0a0807dd', lineSpacing: 3 })
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

  // ── GLOBAL ACTIVE-PAUSE ───────────────────────────────────────────────────────────────────────

  /** [Space] — toggle the GLOBAL PAUSE. While paused the sim tick is halted (updateUnits skips the whole
   * advancement block), but the camera, HUD and INPUT stay live — an "active pause" where you can look
   * around and issue/queue orders. Resumes at the current speed. */
  private togglePause(): void {
    // Lane G — if the pause MENU is open, [Space] resumes through the same path as the menu's Resume, so
    // the two never desync. Otherwise it's the lightweight active-pause (the small banner) as before.
    if (this.pauseMenu?.isOpen()) { this.resumeFromPause(); return; }
    this.pause = togglePauseState(this.pause);
    this.refreshPausedBanner();
    this.setStatus(this.pause.paused ? 'PAUSED — [Space] resume · you can still look around + give orders' : `resumed — speed ${this.timeScale}×`);
  }

  // ── Lane G — menu/settings shell wiring ───────────────────────────────────────────────────────
  private buildShellOverlays(): void {
    // apply persisted volumes now that the AudioManager exists (lighting/shake/keybind flags were set at
    // construct, before the world drew + input wired).
    this.audio?.setMasterVolume(this.shellSettings.master);
    this.audio?.setSfxVolume(this.shellSettings.sfx);
    this.audio?.setMusicVolume(this.shellSettings.music);

    this.settingsPanel = new SettingsPanel({
      scene: this,
      audio: this.audio,
      register: (o) => this.hudFx(o),
      onKeybindsChange: (m) => { this.keybinds = m; },          // the dispatcher reads this live
      onSettingsChange: (s) => this.applyDisplaySettings(s),    // shake/lighting/ui-scale live
      uiScale: () => this.uiScaleFactor,                        // the panel lays out/hit-tests in logical coords
      depth: 150000,
    });
    this.pauseMenu = new PauseOverlay({
      scene: this,
      register: (o) => this.hudFx(o),
      onResume: () => this.resumeFromPause(),
      onSettings: () => this.settingsPanel?.show(),
      onQuitToMenu: () => this.quitToMenu(),
      depth: 140000,
    });
    // Tear the overlays down on scene shutdown/restart so a pending keybind-capture's window listener
    // (capture-phase) can never outlive the scene and fire against a destroyed panel.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.settingsPanel?.destroy(); this.pauseMenu?.destroy(); });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => { this.settingsPanel?.destroy(); this.pauseMenu?.destroy(); });
  }

  /** Open the pause menu and engage the existing active-pause gate (the sim freezes via this.pause). */
  private openPauseMenu(): void {
    this.pause = setPausedState(this.pause, true);
    this.pauseMenu?.show();     // open FIRST so refreshPausedBanner sees the menu and suppresses the small banner
    this.refreshPausedBanner();
    this.setStatus('PAUSED — Resume / Settings / Quit to menu');
  }

  /** Resume from the pause menu: close the menu (+ any open settings), release the gate. */
  private resumeFromPause(): void {
    this.settingsPanel?.close();
    this.pauseMenu?.close();
    this.pause = setPausedState(this.pause, false);
    this.refreshPausedBanner();
    this.setStatus(`resumed — speed ${this.timeScale}×`);
  }

  /** Quit to the main menu: release the pause gate, then start the menu scene. */
  private quitToMenu(): void {
    this.pause = setPausedState(this.pause, false);
    this.scene.start('MainMenuScene');
  }

  /**
   * Task 4 — the endgame's defined exits (no blank state):
   *   'menu'    → back to the main menu (the dev menu-bypass is one-shot, so the real front door shows).
   *   'restart' → a clean NEW GAME (drop any load handoff, rebuild the scene from a fresh initial state).
   * Either way the pause gate is released first so the next scene starts live.
   */
  private exitEndgame(dest: 'menu' | 'restart'): void {
    this.pause = setPausedState(this.pause, false);
    if (dest === 'menu') { this.scene.start('MainMenuScene'); return; }
    this.registry.remove(LOADED_STATE_KEY); // ensure create() falls through to a fresh new game
    this.scene.restart();
  }

  /** Live-apply the display toggles (screen-shake amplitude + lighting quality). */
  private applyDisplaySettings(s: Settings): void {
    this.shellSettings = s;
    this.shakeScale = s.screenShake ? 1 : 0;
    this.lightingHigh = s.lighting === 'high';
    this.applyUiScale(s.uiScale);
  }

  // ── Floor polish — USER UI-SCALE (HUD/UI only; world + sim untouched) ───────────────────────────
  /** Logical HUD width/height = real screen ÷ uiScale. ALL HUD layout + hit-testing uses these, and the
   * fixed HUD camera (uiCam) zooms by uiScale from the top-left, so the panel always fills the screen and
   * clicks line up with the visuals at any scale. */
  private hudW(): number { return this.scale.width / this.uiScaleFactor; }
  private hudH(): number { return this.scale.height / this.uiScaleFactor; }
  /** Screen pointer → LOGICAL HUD coords (uiCam zooms from origin 0,0, so it's a plain divide). */
  private hudX(px: number): number { return px / this.uiScaleFactor; }
  private hudY(py: number): number { return py / this.uiScaleFactor; }

  /** Apply the user UI-scale to the fixed HUD camera ONLY (origin top-left so the HUD anchors at (0,0) and
   * the logical layout fills the screen). The world/main camera + sim are never touched. Re-applied on boot,
   * settings change, and resize; redraws the FX vignette to the new logical size. */
  private applyUiScale(scale: number): void {
    this.uiScaleFactor = Math.max(0.5, Math.min(2, scale || 1));
    if (!this.uiCam) return;
    this.uiCam.setZoom(this.uiScaleFactor);
    this.uiCam.setOrigin(0, 0);
    if (this.vignette) this.drawVignette(this.vignette, this.hudW(), this.hudH());
    this.panels?.layout(); // re-anchor the dossier drawer to the new logical viewport
  }

  /** Camera shake routed through the screen-shake setting: scales AMPLITUDE only (0 disables the shake).
   * CANON — this never touches the motion-only danger-red loops; it only damps the camera kick. */
  private fxShake(duration: number, intensity: number): void {
    if (this.shakeScale <= 0) return;
    this.cameras.main.shake(duration, intensity * this.shakeScale);
  }

  /** The remappable-action dispatcher: the input layer CONSUMES the central keybind map here. Fires the
   * action bound to the pressed key, unless a modal owns input or a modifier combo is held. */
  private dispatchKeybind(e: KeyboardEvent): void {
    if (this.pauseMenu?.isOpen() || this.settingsPanel?.isOpen()) return; // a modal swallows gameplay verbs
    if (e.altKey || e.ctrlKey || e.metaKey) return;                       // leave Ctrl/Alt/Meta combos alone
    const key = normalizeKey(e.key);
    if (!key) return;
    const action = (Object.keys(this.keybinds) as KeyAction[]).find((a) => this.keybinds[a] === key);
    if (action) this.runAction(action);
  }

  private runAction(a: KeyAction): void {
    switch (a) {
      case 'extort': this.commandExtort(); break;
      case 'collect': this.commandCollect(); break;
      case 'reinvest': this.commandReinvest(); break;
      case 'grease': this.commandGrease(); break;
      case 'frameCity': this.frameCity(); break;
      case 'centerSelection': this.centerOnSelection(); break;
      case 'jumpToAlert': this.jumpToLastAlert(); break;
      case 'skipWeek': this.skipWeek(); break;
    }
  }

  /** Show/hide the PAUSED indicator: a clear centred banner on the fixed HUD camera (top depth). Hidden
   * while the pause MENU is up (the menu shows its own PAUSED title). */
  private refreshPausedBanner(): void {
    if (this.pause.paused && !this.pauseMenu?.isOpen()) {
      if (this.pausedBanner) return;
      const cx = this.hudW() / 2, y = 110;
      const strip = this.add.rectangle(cx, y, 320, 46, PAL.ink, 0.86).setStrokeStyle(2, PAL.brass, 0.9);
      const label = this.mkText(cx, y, '⏸  PAUSED', { fontFamily: NOIR_DISPLAY, fontSize: '22px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(0.5, 0.5);
      const hint = this.mkText(cx, y + 24, '[Space] resume', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone }).setOrigin(0.5, 0.5);
      const c = this.add.container(0, 0, [strip, label, hint]).setScrollFactor(0).setDepth(120000);
      this.hudFx(c); // fixed HUD camera only — never drifts with the world
      this.pausedBanner = c;
    } else {
      this.pausedBanner?.destroy(true);
      this.pausedBanner = undefined;
    }
  }

  // ── SAVE / LOAD ───────────────────────────────────────────────────────────────────────────────

  /** Adopt a deserialized save: stash it in the registry and RESTART the scene so every view layer is
   * cleanly rebuilt from the loaded tree (create() picks it up). */
  /** LANE F — autosave once per settlement (week), gated by lastAutosaveTick so it never fires per-frame.
   * Carries the fog so a resumed autosave restores visibility exactly. Skips a finished game. */
  private advanceAutosave(): void {
    if (this.state.tick === this.lastAutosaveTick) return;
    this.lastAutosaveTick = this.state.tick;
    if (this.state.status !== 'playing') return;
    autoSave(this.state, `Autosave · Week ${this.state.tick}`, this.nowMs(), this.saveView());
  }

  private loadGame(state: GameState, view?: SaveView): void {
    this.registry.set(LOADED_STATE_KEY, state);
    if (view) this.registry.set('lcr_loaded_view', view); // LANE F — restore fog exactly as saved (NO-X-RAY)
    this.scene.restart();
  }

  /** LANE F — the view-layer blob a save carries so visibility restores EXACTLY as saved: the fog set. */
  private saveView(): SaveView {
    return { fog: [...this.fog] };
  }

  private handleLoadResult(r: LoadResult, sourceLabel: string): void {
    if (r.ok) { this.closeSaveMenu(); this.loadGame(r.state, r.file.view); }
    else this.setStatus(`load failed (${sourceLabel}): ${r.reason}`);
  }

  /** The HUD entry-point button (top-left, fixed camera). */
  private buildSaveButton(): void {
    this.saveButton = this.mkText(12, 12, '⛁ SAVE / LOAD', {
      fontFamily: NOIR_DISPLAY, fontSize: '13px', color: NOIR_PALETTE.brass, fontStyle: 'bold', backgroundColor: '#0a0807ee',
    }).setScrollFactor(0).setDepth(100050).setPadding(8, 5, 8, 5).setInteractive({ useHandCursor: true });
    this.saveButton.on('pointerdown', () => this.toggleSaveMenu());
    this.hudFx(this.saveButton);
  }

  private toggleSaveMenu(): void {
    if (this.saveMenu) { this.closeSaveMenu(); return; }
    this.buildSaveMenu();
  }

  private closeSaveMenu(): void {
    this.saveMenu?.destroy(true);
    this.saveMenu = undefined;
  }

  private nowMs(): number {
    return typeof Date !== 'undefined' ? Date.now() : this.time.now;
  }

  /** Build the SAVE/LOAD menu on the fixed HUD camera: quick-save + new-save, the slot list (load/delete),
   * and file export/import. Rebuilt fresh each open so the slot list is current. */
  private buildSaveMenu(): void {
    this.closeSaveMenu();
    const w = this.hudW(), h = this.hudH(), cx = w / 2, cy = h / 2;
    const pw = 460, ph = 380, px = cx - pw / 2, py = cy - ph / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const backdrop = this.add.rectangle(0, 0, w, h, PAL.soot, 0.7).setOrigin(0, 0).setInteractive();
    backdrop.on('pointerdown', () => this.closeSaveMenu()); // click-off closes (the menu is non-destructive)
    objs.push(backdrop);
    objs.push(this.add.rectangle(cx, cy, pw, ph, PAL.ink, 0.98).setStrokeStyle(2, PAL.brass, 0.95).setInteractive()); // swallow clicks on the panel
    objs.push(this.mkText(cx, py + 16, 'SAVE / LOAD', { fontFamily: NOIR_DISPLAY, fontSize: '20px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(0.5, 0));

    const mkBtn = (bx: number, by: number, label: string, color: string, fn: () => void): Phaser.GameObjects.Text => {
      const t = this.mkText(bx, by, label, { fontFamily: NOIR_DISPLAY, fontSize: '13px', color, fontStyle: 'bold', backgroundColor: '#0a0807' })
        .setOrigin(0, 0).setPadding(8, 5, 8, 5).setInteractive({ useHandCursor: true });
      t.on('pointerdown', fn);
      objs.push(t);
      return t;
    };

    // top action row: quick-save / new-save / export / import / close
    mkBtn(px + 16, py + 50, '⚡ QUICK SAVE', NOIR_PALETTE.brass, () => this.doQuickSave());
    mkBtn(px + 150, py + 50, '↺ QUICK LOAD', NOIR_PALETTE.brass, () => this.handleLoadResult(quickLoad(), 'quick'));
    mkBtn(px + 284, py + 50, '＋ NEW', NOIR_PALETTE.brass, () => this.doNewSave());
    mkBtn(px + pw - 44, py + 12, '✕', SPEC.danger, () => this.closeSaveMenu());
    mkBtn(px + 16, py + 84, '⬆ IMPORT FILE', NOIR_PALETTE.bone, () => this.doImport());
    mkBtn(px + 150, py + 84, '⇩ EXPORT FILE', NOIR_PALETTE.bone, () => { exportSaveFile(this.state, 'game', this.nowMs(), this.saveView()); this.setStatus('save exported to a file'); });

    // the slot list
    const slots = listSaveSlots();
    objs.push(this.mkText(px + 16, py + 122, slots.length ? 'SAVED GAMES' : 'no saves yet — QUICK SAVE or NEW SAVE', { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.fog }).setOrigin(0, 0));
    slots.slice(0, 6).forEach((s, i) => {
      const ry = py + 146 + i * 36;
      objs.push(this.mkText(px + 16, ry, this.slotLine(s), { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.bone }).setOrigin(0, 0));
      mkBtn(px + pw - 150, ry - 3, 'LOAD', NOIR_PALETTE.brass, () => this.handleLoadResult(readSaveSlot(s.slot), s.label));
      mkBtn(px + pw - 84, ry - 3, 'DEL', SPEC.danger, () => { deleteSaveSlot(s.slot); this.buildSaveMenu(); });
    });

    const c = this.add.container(0, 0, objs).setScrollFactor(0).setDepth(130000);
    this.hudFx(c);
    this.saveMenu = c;
  }

  private slotLine(s: SlotInfo): string {
    const when = s.savedAt > 0 ? new Date(s.savedAt).toLocaleString() : 'unknown time';
    return `${s.label || s.slot}  ·  ${when}`;
  }

  private doQuickSave(): void {
    const r = quickSave(this.state, this.nowMs(), this.saveView());
    this.setStatus(r.ok ? 'quick-saved' : `save failed: ${r.reason}`);
    if (r.ok) this.buildSaveMenu();
  }

  private doNewSave(): void {
    // auto-named numbered slots (slot-1..N); reuse the lowest free number, else overwrite the oldest.
    const used = new Set(listSaveSlots().map((s) => s.slot));
    let slot = '';
    for (let i = 1; i <= 6; i++) { if (!used.has(`s${i}`)) { slot = `s${i}`; break; } }
    if (!slot) slot = listSaveSlots().sort((a, b) => a.savedAt - b.savedAt)[0]?.slot ?? 's1';
    const r = writeSaveSlot(slot, this.state, `Week ${this.state.tick} · $${Math.round(this.state.player.cash)}`, this.nowMs(), this.saveView());
    this.setStatus(r.ok ? `saved (${slot})` : `save failed: ${r.reason}`);
    if (r.ok) this.buildSaveMenu();
  }

  private doImport(): void {
    if (typeof document === 'undefined') { this.setStatus('file import needs a browser'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) importSaveFile(f).then((r) => this.handleLoadResult(r, 'file'));
    };
    input.click();
  }

  // ── INFO-FEEDBACK — THE WIRE — LOG + screen-edge alerts + minimap ─────────────────────────────

  /** Record a taxonomy event into the session log, and (per the taxonomy) raise an edge ALERT + a minimap
   * PING for positional events. Federal events are non-positional (#3): they log + fire the global federal
   * banner (the existing flashFederalCross), with NO arrow/ping. Combat beats throttle inside pushLog (#4). */
  private recordInfoEvent(kind: EventKind, message: string, gx?: number, gy?: number): void {
    const now = this.time.now;
    this.wireLog = pushLog(this.wireLog, { kind, message, gx, gy, t: now });
    const meta = metaFor(kind);
    const id = this.wireLog.entries[0]?.id ?? 0;
    if (meta.alert && gx !== undefined && gy !== undefined) {
      this.alerts.push({ id, gx, gy, tier: meta.tier, until: meta.tier === 'critical' ? Number.POSITIVE_INFINITY : now + 12000 });
    }
    if (meta.ping && gx !== undefined && gy !== undefined) {
      this.pings.push({ gx, gy, tier: meta.tier, until: now + 6000 });
    }
  }

  /** Centre the world camera on a tile (click-to-jump for a log row / edge arrow / minimap). */
  private jumpToTile(gx: number, gy: number): void {
    const c = gridToScreen(gx, gy);
    this.cameras.main.centerOn(c.x, c.y);
  }

  /** [Q] — jump to the most recent unread POSITIONAL alert (highest-priority unread), and mark it read. */
  private jumpToLastAlert(): void {
    // prefer a live critical alert, else the latest unread positional log entry.
    const crit = this.alerts.filter((a) => a.tier === 'critical');
    const target = crit.length ? crit[crit.length - 1] : undefined;
    if (target) {
      this.jumpToTile(target.gx, target.gy);
      this.wireLog = markRead(this.wireLog, target.id);
      this.alerts = this.alerts.filter((a) => a !== target);
      return;
    }
    const e = latestUnreadPositional(this.wireLog);
    if (e && e.gx !== undefined && e.gy !== undefined) {
      this.jumpToTile(e.gx, e.gy);
      this.wireLog = markRead(this.wireLog, e.id);
      this.alerts = this.alerts.filter((a) => a.id !== e.id);
    } else {
      this.setStatus('no unread alerts');
    }
  }

  /** A district's control status for the minimap (player / rival / contested / neutral). */
  private districtControlStatus(districtId: string): ControlStatus {
    if (new Set(contestedDistrictIds(this.state)).has(districtId)) return 'contested';
    const d = this.state.districts.find((x) => x.id === districtId);
    const holder = d ? districtHolder(d) : undefined;
    if (!holder) return 'neutral';
    return holder === this.state.player.id ? 'player' : 'rival';
  }

  /** Per-frame: draw the minimap (district control, viewport rect, blips, pings) + click-to-move. */
  private drawMinimap(now: number): void {
    if (!this.minimapG) { this.minimapG = this.add.graphics().setScrollFactor(0).setDepth(100040); this.hudFx(this.minimapG); }
    const r = this.minimapRect;
    r.x = this.hudW() - r.w - 12;
    r.y = this.hudH() - r.h - 12;
    const g = this.minimapG;
    g.clear();
    g.fillStyle(hexNum(SPEC.soot), 0.82).fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    g.lineStyle(2, hexNum(SPEC.brass), 0.9).strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    // district control fills (static palette; contested amber)
    for (const wd of this.world.districts) {
      const status = this.districtControlStatus(wd.id);
      const a = worldToMinimap(wd.minX, wd.minY, r, WORLD_SIZE);
      const b = worldToMinimap(wd.maxX + 1, wd.maxY + 1, r, WORLD_SIZE);
      const col = hexNum(districtControlColor(status));
      g.fillStyle(col, status === 'neutral' ? 0.16 : status === 'contested' ? 0.28 + 0.14 * Math.abs(Math.sin(now / 320)) : 0.32);
      g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    // camera POV box (B5) — the iso screen-rect projects to a DIAMOND in grid space, so bound ALL FOUR
    // corners (two opposite corners collapse it to a line). A WHITE outline — the player's own viewport, a
    // non-danger mark (reds stay motion-only); fog-gating is unaffected and it changes no blip-reveal.
    const view = this.cameras.main.worldView;
    const povCorners = [
      screenToGrid(view.x, view.y),
      screenToGrid(view.right, view.y),
      screenToGrid(view.right, view.bottom),
      screenToGrid(view.x, view.bottom),
    ];
    const pov = cameraViewportRect(povCorners, r, WORLD_SIZE);
    g.lineStyle(1.5, 0xffffff, 0.9).strokeRect(pov.x, pov.y, pov.w, pov.h);
    // blips — player always; collectors distinct; ⚠ rivals ONLY if their tile is revealed (#5 — no x-ray)
    const minis: MiniUnit[] = this.units.map((v) => ({ gx: v.unit.pos.gx, gy: v.unit.pos.gy, faction: v.faction, isCollector: v.unit.role === 'collector' }));
    for (const u of minimapPlayerBlips(minis)) {
      const p = worldToMinimap(u.gx, u.gy, r, WORLD_SIZE);
      g.fillStyle(hexNum(u.isCollector ? SPEC.brassDim : SPEC.brass), 1).fillCircle(p.x, p.y, u.isCollector ? 1.6 : 2.2);
    }
    for (const u of minimapRivalBlips(minis, (gx, gy) => this.debugRevealAll || isRevealed(this.fog, gx, gy))) {
      const p = worldToMinimap(u.gx, u.gy, r, WORLD_SIZE);
      g.fillStyle(hexNum(SPEC.rival), 1).fillCircle(p.x, p.y, 2.2); // static rival identity
    }
    // alert pings — MOTION (danger pulse), expire on their own
    this.pings = this.pings.filter((p) => now < p.until);
    for (const ping of this.pings) {
      const p = worldToMinimap(ping.gx, ping.gy, r, WORLD_SIZE);
      const t = 1 - (ping.until - now) / 6000;
      g.lineStyle(1.5, hexNum(ping.tier === 'critical' ? SPEC.danger : '#ff5a2c'), Math.max(0, 1 - t)).strokeCircle(p.x, p.y, 2 + t * 8);
    }
  }

  /** Per-frame: draw the screen-edge alerts (off-screen warning/critical events) — arrow + danger pulse. */
  private drawEdgeAlerts(now: number): void {
    if (!this.edgeAlertG) { this.edgeAlertG = this.add.graphics().setScrollFactor(0).setDepth(100045); this.hudFx(this.edgeAlertG); }
    this.alerts = this.alerts.filter((a) => now < a.until);
    const g = this.edgeAlertG;
    g.clear();
    this.edgeAlertHits = [];
    const W = this.hudW(), H = this.hudH();
    for (const a of this.alerts) {
      const c = gridToScreen(a.gx, a.gy);
      const sp = this.worldToScreenPx(c.x, c.y);
      const m = edgeAlertMarker(sp.x, sp.y, W, H, 34);
      if (m.onScreen) continue; // on-screen events read directly; no edge arrow
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin(now / 130));
      const col = hexNum(a.tier === 'critical' ? SPEC.danger : '#ff5a2c');
      g.fillStyle(col, pulse).fillCircle(m.x, m.y, 9);
      // a little arrowhead pointing toward the event
      const ax = m.x + Math.cos(m.angleRad) * 14, ay = m.y + Math.sin(m.angleRad) * 14;
      const lx = m.x + Math.cos(m.angleRad + 2.5) * 8, ly = m.y + Math.sin(m.angleRad + 2.5) * 8;
      const rx = m.x + Math.cos(m.angleRad - 2.5) * 8, ry = m.y + Math.sin(m.angleRad - 2.5) * 8;
      g.fillStyle(col, pulse).fillTriangle(ax, ay, lx, ly, rx, ry);
      this.edgeAlertHits.push({ x: m.x, y: m.y, r: 16, gx: a.gx, gy: a.gy, id: a.id });
    }
  }

  /** Project a WORLD pixel point to SCREEN pixels (account for camera scroll + zoom) for edge clamping. */
  private worldToScreenPx(wx: number, wy: number): { x: number; y: number } {
    const cam = this.cameras.main;
    return { x: (wx - cam.worldView.x) * cam.zoom, y: (wy - cam.worldView.y) * cam.zoom };
  }

  /** Per-frame: draw THE WIRE — LOG (recent-first, ~8 rows, unread count); rows are click-to-jump. */
  private drawWireLog(): void {
    if (!this.wireLogG) { this.wireLogG = this.add.container(0, 0).setScrollFactor(0).setDepth(100042); this.hudFx(this.wireLogG); }
    this.wireLogG.removeAll(true);
    this.wireLogHits = [];
    const x = 12, top = 64, rowH = 18, rows = 8;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const unread = unreadCount(this.wireLog);
    objs.push(this.mkText(x, top, `THE WIRE — LOG${unread > 0 ? `  · ${unread} new` : ''}`, { fontFamily: NOIR_DISPLAY, fontSize: '12px', color: unread > 0 ? SPEC.danger : NOIR_PALETTE.brass, fontStyle: 'bold', backgroundColor: '#0a0807cc' }).setOrigin(0, 0).setPadding(5, 3, 5, 3));
    this.wireLog.entries.slice(0, rows).forEach((e, i) => {
      const ry = top + 20 + i * rowH;
      const col = e.tier === 'critical' ? SPEC.danger : e.tier === 'warning' ? WAR_AMBER_HEX : NOIR_PALETTE.bone;
      const tag = e.count > 1 ? ` ×${e.count}` : '';
      const t = this.mkText(x, ry, `• ${e.message}${tag}`, { fontFamily: NOIR_FONT, fontSize: '11px', color: e.unread ? col : NOIR_PALETTE.fog, backgroundColor: '#0a080799' }).setOrigin(0, 0).setPadding(4, 1, 4, 1);
      objs.push(t);
      if (e.gx !== undefined && e.gy !== undefined) this.wireLogHits.push({ x, y: ry, w: 280, h: rowH, gx: e.gx, gy: e.gy, id: e.id });
    });
    this.wireLogG.add(objs);
  }

  // ── Lane — THE CONSIGLIERE: an in-world advisor that distils THE WIRE + the player's own readouts into one
  //    actionable nudge. The decision logic is the PURE src/sim/advisor module; the scene only builds the
  //    player-knowable snapshot, feeds it the WIRE rows, and paints the result on the fixed HUD. NO-X-RAY: the
  //    snapshot carries only the player's own facts + an extort target on turf they already control, so a
  //    suggestion can never point at a hidden rival. ─────────────────────────────────────────────────────

  /** Build the PLAYER-KNOWABLE snapshot the advisor reasons over (the same facts already on the HUD/ledger). */
  private buildAdvisorSnapshot(): AdvisorSnapshot {
    const hud = realtimeHudView(this.state, SCENE_WEEK_SECONDS).player;
    const p = this.state.player;
    const b = p.bribes;
    // a genuinely-takeable front on turf the player ALREADY controls (player-knowable opportunity).
    const tgt = suggestedExtortTarget(this.state, p.id);
    let extortTarget: AdvisorPlace | undefined;
    if (tgt) {
      const t = businessTileOf(this.layout, tgt.businessId);
      const name = inspectBusiness(this.state, tgt.businessId)?.name ?? tgt.districtName;
      extortTarget = { name, gx: t?.gx, gy: t?.gy };
    }
    return {
      tick: this.state.tick,
      cleanCash: hud.cleanCash,
      dirtyCash: hud.dirtyCash,
      netPerWeek: playerWeeklyNet(this.state),
      federalExposure: hud.federalExposure,
      federalTier: hud.federalTier,
      districtsHeld: districtsHeld(this.state, p.id).length,
      districtsTotal: this.state.districts.length,
      crewTotal: p.gangsters.length,
      crewIdle: p.gangsters.filter((g) => g.assignment.type === 'idle').length,
      topWinPathPct: victoryConditions(this.state).reduce((m, c) => Math.max(m, c.pct), 0),
      greaseTotal: b.police + b.judges + b.politicians + b.feds,
      extortTarget,
    };
  }

  /** Recompute the top suggestion on a throttle (no per-frame flicker), then paint it. */
  private updateAdvisor(now: number): void {
    if (now >= this.advisorNextMs) {
      this.advisorTop = topSuggestion(this.buildAdvisorSnapshot(), this.wireLog.entries, now);
      this.advisorNextMs = now + 1200;
    }
    this.drawAdvisor();
  }

  /** Paint the single most-urgent suggestion as a compact toast under THE WIRE (one fixed-HUD mount). */
  private drawAdvisor(): void {
    if (!this.advisorG) { this.advisorG = this.add.container(0, 0).setScrollFactor(0).setDepth(100043); this.hudFx(this.advisorG); }
    this.advisorG.removeAll(true);
    const s = this.advisorTop;
    if (!s) { this.advisorG.setVisible(false); return; }
    this.advisorG.setVisible(true);
    const x = 12, y = 240; // just below the 8-row WIRE — LOG; clears the bottom-anchored minimap/toolbar
    const col = s.urgency === 'critical' ? SPEC.danger : s.urgency === 'warning' ? WAR_AMBER_HEX : s.urgency === 'opportunity' ? NOIR_PALETTE.brass : NOIR_PALETTE.bone;
    const label = this.mkText(x, y, '⚜ CONSIGLIERE', { fontFamily: NOIR_DISPLAY, fontSize: '11px', color: NOIR_PALETTE.brass, fontStyle: 'bold', backgroundColor: '#0a0807cc' }).setOrigin(0, 0).setPadding(5, 3, 5, 3);
    const body = this.mkText(x, y + 18, `“${s.text}”`, { fontFamily: NOIR_FONT, fontSize: '11px', color: col, backgroundColor: '#0a080799', wordWrap: { width: 300 } }).setOrigin(0, 0).setPadding(4, 2, 4, 2);
    this.advisorG.add([label, body]);
  }

  // ── Lane — STATUS DASHBOARD: the at-a-glance threat + economy summary (one fixed-HUD mount) ───────────
  /** Build the PLAYER-KNOWABLE dashboard inputs (the same selectors the ledger/advisor read). NO rival
   * positions: rival pressure is the player's OWN contested turf + recent rival-pressure WIRE events seen. */
  private buildStatusInput() {
    const hud = realtimeHudView(this.state, SCENE_WEEK_SECONDS).player;
    const p = this.state.player;
    let contested = 0;
    for (const d of this.state.districts) {
      if (districtStatus(d).status === 'contested' && (d.control[p.id] ?? 0) >= 10) contested++;
    }
    const now = this.time.now;
    const recent = this.wireLog.entries.filter(
      (e) => now - e.t <= 30000 && /rival|hq\.attack|telegraph|robbed|fallen|lost|invad/i.test(e.kind),
    ).length;
    return {
      federalExposure: hud.federalExposure,
      netPerWeek: playerWeeklyNet(this.state),
      cleanCash: hud.cleanCash,
      districtsHeld: districtsHeld(this.state, p.id).length,
      districtsTotal: this.state.districts.length,
      districtsContested: contested,
      rivalPressureEvents: recent,
    };
  }

  /** Recompute (throttled) + paint the dashboard so it never flickers frame-to-frame. */
  private updateStatusDashboard(now: number): void {
    if (now < this.statusDashNextMs) return;
    this.statusDashNextMs = now + 600;
    this.drawStatusDashboard();
  }

  /** Paint the four banded reads (federal / turf / cash / rivals) top-right, above THE CITY panel, on the
   * sacred fixed-HUD camera. Tone → palette; danger stays AMBER (red is MOTION-only); the rival read uses the
   * STATIC rival-red #9E1B1B (SPEC.rival). Read-only. */
  private drawStatusDashboard(): void {
    if (!this.statusDashG) { this.statusDashG = this.add.container(0, 0).setScrollFactor(0).setDepth(100044); this.hudFx(this.statusDashG); }
    this.statusDashG.removeAll(true);
    const view = buildStatusDashboard(this.buildStatusInput());
    const W = 214, rowH = 19, padX = 9;
    const x = this.scale.width - W - 8, y = 64;
    const h = 8 + view.cells.length * rowH + 2;
    const bg = this.add.rectangle(x, y, W, h, PAL.ink, 0.82).setOrigin(0, 0).setStrokeStyle(1, hexNum(NOIR_PALETTE.brass), 0.5);
    this.statusDashG.add(bg);
    const tone = (key: string, t: DashboardTone): string =>
      key === 'rival' ? SPEC.rival // STATIC rival identity, never a danger-red
        : t === 'danger' || t === 'watch' ? WAR_AMBER_HEX : t === 'good' ? NOIR_PALETTE.brass : NOIR_PALETTE.fog;
    view.cells.forEach((c, i) => {
      const ry = y + 6 + i * rowH;
      this.statusDashG!.add([
        this.mkText(x + padX, ry, c.label, { fontFamily: NOIR_DISPLAY, fontSize: '10px', color: NOIR_PALETTE.fog, fontStyle: 'bold' }).setOrigin(0, 0),
        this.mkText(x + padX + 46, ry, c.value, { fontFamily: NOIR_FONT, fontSize: '11px', color: tone(c.key, c.tone), fontStyle: 'bold' }).setOrigin(0, 0),
        this.mkText(x + W - padX, ry + 1, c.detail, { fontFamily: NOIR_FONT, fontSize: '9px', color: NOIR_PALETTE.fog }).setOrigin(1, 0),
      ]);
    });
  }

  /**
   * Floor polish — TARGET RETICLE/NAME. For every SELECTED player fighter engaging an enemy in range, mark
   * that enemy with a subtle reticle ring + its family name. ⭐ NO-X-RAY: a target is marked ONLY when it is
   * already VISIBLE — revealed in the fog AND on-screen (and not occluded away) — so the reticle can never
   * betray a unit the player hasn't discovered (the pure `showTargetReticle` gate enforces it). Red stays
   * motion-only: the ring is bone/brass with a gentle PULSE, never a static danger-red fill. It builds on the
   * combat-readability layer (like the health bar, it's a world-space marker that tracks the unit through
   * zoom/pan, so it is immune to the UI-scale on the fixed HUD camera). Reads sim only; mutates nothing.
   */
  private drawTargetReticles(now: number): void {
    if (!this.reticleG) { this.reticleG = this.add.graphics().setDepth(99500); this.worldFx(this.reticleG); }
    const g = this.reticleG;
    g.clear();
    for (const t of this.reticleNames) t.setVisible(false);

    // the enemies our SELECTED, living fighters are currently engaging (in range).
    const targetIds = new Set<string>();
    if (this.selection.ids.length > 0) {
      for (const v of this.units) {
        if (v.faction !== 'player' || v.unit.downed || !isSelected(this.selection, v.unit.id)) continue;
        const tgt = enemyInRange(v.unit, this.state.units);
        if (tgt && !tgt.downed) targetIds.add(tgt.id);
      }
    }
    if (targetIds.size === 0) return;

    const view = this.cameras.main.worldView;
    const pulse = 0.5 + 0.35 * Math.abs(Math.sin(now / 180)); // motion read (never a static red)
    let nameIdx = 0;
    for (const v of this.units) {
      if (!targetIds.has(v.unit.id)) continue;
      const tile = unitTile(v.unit);
      const revealed = this.debugRevealAll || isRevealed(this.fog, Math.round(tile.gx), Math.round(tile.gy));
      const onScreen = view.contains(v.sprite.x, v.sprite.y);
      // ⭐ NO-X-RAY gate (pure): only mark a living target the player can already see.
      if (!showTargetReticle(v.unit, revealed && onScreen && (v.occA ?? 1) > 0.15)) continue;
      const cx = v.sprite.x, cy = v.sprite.y - 14, r = 15, tk = 5;
      g.lineStyle(1.5, hexNum(SPEC.bone), pulse).strokeCircle(cx, cy, r); // subtle bone ring
      g.lineStyle(1.5, PAL.brass, pulse); // four brass corner ticks (an action mark, not a faction fill)
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const px = cx + dx * r, py = cy + dy * r;
        g.beginPath(); g.moveTo(px, py - dy * tk); g.lineTo(px, py); g.lineTo(px - dx * tk, py); g.strokePath();
      }
      const name = inspectUnit(this.state, v.unit.id)?.ownerName ?? 'rival';
      let label = this.reticleNames[nameIdx];
      if (!label) {
        label = this.mkText(0, 0, '', { fontFamily: NOIR_FONT, fontSize: '10px', color: NOIR_PALETTE.bone, backgroundColor: '#0a0807bb' }).setDepth(99501).setPadding(3, 1, 3, 1);
        this.worldFx(label);
        this.reticleNames.push(label);
      }
      label.setText(name).setOrigin(0.5, 1).setPosition(cx, cy - r - 2).setVisible(true);
      nameIdx++;
    }
  }

  /** OPERATION-OUTCOME PREVIEWS — draw the hover card. The pure formatter resolves tone→colour (the colour
   * law lives there); this only lays out the rows on the fixed camera near the cursor. Nothing here reads or
   * mutates sim state beyond the already-resolved view-model. Clears itself when there is nothing to show. */
  private drawOpPreview(): void {
    if (!this.opPreviewG) { this.opPreviewG = this.add.container(0, 0).setScrollFactor(0).setDepth(100052); this.hudFx(this.opPreviewG); }
    this.opPreviewG.removeAll(true);
    const preview = this.opPreview;
    if (!preview) { this.opPreviewG.setVisible(false); return; }
    this.opPreviewG.setVisible(true);

    const pal: PreviewPalette = { brass: NOIR_PALETTE.brass, amber: WAR_AMBER_HEX, danger: SPEC.danger, bone: NOIR_PALETTE.bone };
    const lines = formatPreviewLines(preview, this.opAltHeld, pal);
    const padX = 8, padY = 7, rowH = 16, cardW = 268;
    const cardH = padY * 2 + lines.length * rowH;
    // place to the lower-right of the cursor, clamped on-screen.
    let x = this.opCursor.x + 18, y = this.opCursor.y + 14;
    x = Math.min(x, this.hudW() - cardW - 8);
    y = Math.min(y, this.hudH() - cardH - 8);

    const bg = this.add.graphics().setScrollFactor(0);
    bg.fillStyle(PAL.ink, 0.92).fillRect(x, y, cardW, cardH);
    bg.lineStyle(1, hexNum(preview.blocked ? SPEC.danger : NOIR_PALETTE.brass), 0.85).strokeRect(x, y, cardW, cardH);
    this.opPreviewG.add(bg);
    lines.forEach((l, i) => {
      const t = this.mkText(x + padX, y + padY + i * rowH, l.text, {
        fontFamily: l.bold ? NOIR_DISPLAY : NOIR_FONT, fontSize: l.bold ? '12px' : '11px',
        color: l.color, fontStyle: l.bold ? 'bold' : 'normal',
      }).setOrigin(0, 0);
      this.opPreviewG!.add(t);
    });
  }

  /** Resolve a HUD click on the minimap / a log row / an edge arrow. Returns true if it consumed the click. */
  private handleInfoClick(sx: number, sy: number): boolean {
    sx = this.hudX(sx); sy = this.hudY(sy); // screen → logical HUD space (UI-scale)
    for (const h of this.edgeAlertHits) {
      if (Math.hypot(sx - h.x, sy - h.y) <= h.r) { this.jumpToTile(h.gx, h.gy); this.wireLog = markRead(this.wireLog, h.id); this.alerts = this.alerts.filter((a) => a.id !== h.id); return true; }
    }
    for (const h of this.wireLogHits) {
      if (sx >= h.x && sx <= h.x + h.w && sy >= h.y && sy <= h.y + h.h && h.gx !== undefined && h.gy !== undefined) {
        this.jumpToTile(h.gx, h.gy); this.wireLog = markRead(this.wireLog, h.id); return true;
      }
    }
    if (isInMinimap(sx, sy, this.minimapRect)) {
      const t = minimapToWorld(sx, sy, this.minimapRect, WORLD_SIZE);
      this.jumpToTile(t.gx, t.gy);
      return true;
    }
    return false;
  }

  /** BALANCE — a click on a FOUR-CHANNELS row greases THAT specific channel (targetable grease). Returns true
   * if the click landed on a channel row (consumed). */
  private handleChannelClick(sx: number, sy: number): boolean {
    for (const h of this.channelHitRegions) {
      if (sx >= h.x && sx <= h.x + h.w && sy >= h.y && sy <= h.y + h.h) { this.commandGrease(h.ch); return true; }
    }
    return false;
  }

  // ── RTS-28 fast-forward / skip-week ─────────────────────────────────────────────────────────

  /** The on-screen button — cycle the real-time speed 1× → 2× → 4×. */
  private cycleFastForward(): void {
    this.timeScale = nextTimeScale(this.timeScale);
    this.refreshFastForward();
    this.setStatus(`speed ${this.timeScale}× — [>] skip week · [Space] pause`);
  }

  /** [>] / the on-screen button — jump straight to the next week settlement (exactly one). */
  private skipWeek(): void {
    this.skipWeekPending = true;
    this.setStatus('skipping to the next week…');
  }

  /** Position + label the FF/skip controls (bottom-centre, always visible). */
  private refreshFastForward(): void {
    if (!this.ffButton || !this.skipButton) return;
    const cy = this.hudH() - 12 - 30, cx = this.hudW() / 2; // HUD PHASE 1 — clear the 28px dossier strip
    const glyph = this.timeScale === 1 ? '▶' : this.timeScale === 2 ? '▶▶' : '▶▶▶';
    this.setT(this.ffButton, `${glyph} ${this.timeScale}× SPEED`).setColor(this.timeScale > 1 ? SPEC.cashGreen : NOIR_PALETTE.brass)
      .setPosition(cx - this.ffButton.width / 2 - 6, cy);
    this.skipButton.setPosition(cx + this.skipButton.width / 2 + 6, cy);
  }

  /** A centred banner when the match phase changes (a clear visual beat for audio/VO to hook). */
  /** RTS-34 — a brief deco PHASE TITLE CARD on a stage change (the phase sting already fires, RTS-30e —
   * this lands the visual). A brass-framed cartouche with the phase name + a one-line read, on the fixed
   * camera, ~1.8s, non-blocking (it fades itself). DECAPITATE flashes danger-red — MOTION, never static. */
  private flashPhaseChange(phase: string): void {
    const labels: Record<string, { title: string; sub: string }> = {
      'ESTABLISH': { title: 'ESTABLISH', sub: 'Shake down the neighbourhood — build your racket' },
      'FIRST BLOOD': { title: 'FIRST BLOOD', sub: 'Make your move on a rival family' },
      'CONTEST': { title: 'CONTEST', sub: 'The turf war is on — hold your ground' },
      'DECAPITATE': { title: 'DECAPITATE', sub: 'Finish a rival — take the city' },
    };
    const meta = labels[phase] ?? { title: phase, sub: '' };
    const danger = phase === 'DECAPITATE';
    const accent = danger ? hexNum(SPEC.danger) : PAL.brass;
    const cx = this.hudW() / 2, cy = 134, cardW = 440, cardH = 78;
    const card = this.add.graphics().setScrollFactor(0).setDepth(100001).setAlpha(0);
    card.fillStyle(PAL.ink, 0.9).fillRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH);
    this.decoFrame(card, cx - cardW / 2, cy - cardH / 2, cardW, cardH, accent, 0.9);
    const title = this.mkText(cx, cy - 11, meta.title, { fontFamily: NOIR_DISPLAY, fontSize: '30px', color: danger ? SPEC.danger : SPEC.brass, fontStyle: 'bold' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(100002).setAlpha(0).setScale(0.7);
    const sub = this.mkText(cx, cy + 19, meta.sub, { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.bone })
      .setOrigin(0.5).setScrollFactor(0).setDepth(100002).setAlpha(0);
    this.hudFx(card, title, sub);
    this.tweens.add({ targets: [card, sub], alpha: 1, duration: 260, ease: 'Quad.Out' });
    this.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 300, ease: 'Back.Out' });
    for (const o of [card, title, sub]) this.tweens.add({ targets: o, alpha: 0, delay: 1500, duration: 500, onComplete: () => o.destroy() });
  }

  /** Klaxon vignette (RTS-15): a danger-red edge that pulses when a federal bust is imminent. */
  private refreshKlaxon(on: boolean): void {
    if (!this.klaxon) return;
    this.klaxon.clear();
    if (!on) return;
    const w = this.hudW(), h = this.hudH();
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
    const base = sel.length === 0 ? 'Click a unit · left-drag to box-select · right-click to move' : `selected: ${sel.join(', ')}`;
    const sh = this.state.activeShocks.map((s) => shockFlavor(s.kind as ShockKind)).join(', ');
    const hint = '  ·  right-click a shop → EXTORT/ATTACK · [T] route · WASD/middle-drag/wheel camera · [F] follow · [6] recruit · [5] expand';
    this.statusText.setText((action ? `${base}  ·  ${action}` : base + hint) + (sh ? `   |  ${sh}` : ''));
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
    const right = this.hudW() - 18;
    const dotX = this.hudW() - 300; // category-dot column at the panel's left edge (§4)
    const flashing = this.time.now < this.wireFlashUntil;
    // §4: unread "NEEDS YOU" count — danger/warning incidents past what the player last focused.
    const unread = this.state.incidents.filter((r) => r.seq > this.lastSeenWireSeq && incidentNeedsYou(r.severity)).length;
    const title = unread > 0 ? `THE WIRE  [L] · ${unread} NEEDS YOU` : (flashing ? 'THE WIRE  [L]  ◂ NEW' : 'THE WIRE  [L]');
    if (this.feedTitle) {
      this.setTC(this.feedTitle, title, unread > 0 || flashing ? SPEC.danger : NOIR_PALETTE.brass).setPosition(right, 66);
      // POLISH v2 · PKG5 — an unread crisis THROBS (crisisPulse) so it pulls the eye; quiet = steady.
      const crisis = unread > 0 || flashing;
      this.feedTitle.setAlpha(crisis ? 0.7 + 0.3 * crisisPulse(this.time.now) : 1);
    }
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
    // B2 — size the panel to its CONTENT so text never overflows the border. We measure the title/body/hint
    // blocks (body wrapped to the viewport so long lines never exceed it), fit a panel around them, then — if
    // the fitted panel is taller than the screen — scale the whole overlay down so it always fits. Uses the
    // LOGICAL HUD dims (hudW/hudH) so it's correct under the UI-scale option (#37).
    const VW = this.hudW(), VH = this.hudH();
    const cx = VW / 2, cy = VH / 2;
    const padX = 30, padY = 22, gap = 10;
    const wrapW = Math.min(760, VW - 64) - padX * 2; // body wraps within the viewport (no horizontal overflow)
    const title = this.mkText(0, 0, GAME_TITLE, { fontFamily: NOIR_FONT, fontSize: '20px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(0.5, 0);
    const body = this.mkText(0, 0, [
      'Prohibition-era Brassmere. Build a protection empire — quietly first, by war later.',
      '',
      'CAMERA — move around and read the city',
      '  ARROW keys / screen-edge pan · left-drag box-select · middle-drag pan · wheel zoom · [F] follow · [Z] frame city · [D] center on selection',
      '',
      'MOUSE — drive your thugs',
      '  LEFT-CLICK a thug to select (SHIFT-click adds more)',
      '  RIGHT-CLICK a storefront → EXTORT (take protection) or ATTACK (shut it down)',
      '  RIGHT-CLICK the street → move the selected thugs',
      '  COMBAT CONTROL — [S] stop (hold tile) · [I] hold (stand & fight, no chase) · [A] then left-click → attack-move',
      '  The coloured plate under a shop = its allegiance: fog new · brass yours · red rival.',
      '',
      'EXTORT-FIRST — the early game',
      '  • Shake down the NEIGHBOURHOOD — every cheap front you can (low heat, steady money).',
      '  • [T] set an automated COLLECTION ROUTE so the take banks itself — but GUARD it,',
      '    a rival enforcer who catches the collector still robs you.',
      '  • [6] recruit more thugs · [5] expand to the next block · [G] grease the hottest channel (or click one).',
      '  • War comes later: [1] raid · [2] sabotage · [3] assassinate · [4] lockout · [V] demolish.',
      '  • Select a thug → its ACTION ICONS show; [Q] set PATROL (hold a block, adds muscle presence).',
      '',
      '  [K] crew · [L] the wire · [H] help · [B] card view',
    ].join('\n'), { fontFamily: NOIR_FONT, fontSize: '12px', color: NOIR_PALETTE.bone, lineSpacing: 3, align: 'left', wordWrap: { width: wrapW } }).setOrigin(0.5, 0);
    const hint = this.mkText(0, 0, 'click anywhere to begin', { fontFamily: NOIR_FONT, fontSize: '13px', color: NOIR_PALETTE.fog }).setOrigin(0.5, 0);

    // fit the border to the measured blocks, then place each block at its computed top.
    const sizes = [title, body, hint].map((t) => ({ w: t.width, h: t.height }));
    const { panelW, panelH, ys } = fitOverlayPanel(sizes, { padX, padY, gap });
    const bg = this.add.rectangle(0, 0, panelW, panelH, PAL.ink, 0.96).setStrokeStyle(2, PAL.brass, 1);
    title.setPosition(0, ys[0]);
    body.setPosition(0, ys[1]);
    hint.setPosition(0, ys[2]);
    this.legend = this.add.container(cx, cy, [bg, title, body, hint]).setScrollFactor(0).setDepth(100100);
    // viewport-safe: if the fitted panel is taller/wider than the screen, scale the whole overlay down to fit
    // (uniform scale preserves containment — the text still never overflows the border).
    const fit = Math.min(1, (VH - 24) / panelH, (VW - 24) / panelW);
    if (fit < 1) this.legend.setScale(fit);
  }

  private toggleLegend(): void {
    if (this.legend?.visible) this.hideLegend(); else this.showLegend();
  }
  private showLegend(): void { this.legend?.setPosition(this.hudW() / 2, this.hudH() / 2).setVisible(true); }
  private hideLegend(): void { this.legend?.setVisible(false); }
}
