// Public surface of the pure simulation. Phaser scenes import only from here.
// This module must never import Phaser or touch browser globals.

export * from './types';
export * from './constants';
export { Rng, mulberry32, seedToCursor } from './rng';
export { createInitialState } from './state';
export {
  allBusinesses,
  operationHeat,
  businessAccrual,
  isShutDown,
  businessEarner,
  extortionIncome,
  operationIncome,
  familyIncome,
  familyExpenses,
  familyNet,
} from './economy';
export {
  cleanCash,
  clampDirty,
  creditCrimeIncome,
  heatFromDirty,
  launderFee,
  launderCapacity,
} from './laundering';
export {
  uncollectedOf,
  accrueUncollected,
  collectibleBusinesses,
  pendingCollection,
  totalUncollected,
  collectionSafety,
  collectionFraction,
} from './collection';
export { tick, tickN } from './tick';
export { advanceClock, weekProgress, secondsUntilNextWeek } from './clock';
export {
  findPath,
  makeGrid,
  isValidPath,
  type NavGrid,
} from './pathfinding';
export {
  spawnUnit,
  spawnCollector,
  spawnEnforcer,
  unitTile,
  unitArrived,
  unitDestination,
  unitScreenPos,
  setUnitPath,
  issueMove,
  stopUnit,
  advanceUnit,
  advanceUnits,
  type MovableUnit,
  type UnitRole,
} from './movement';
export {
  isCarryingCollector,
  areHostile,
  unitDistance,
  canIntercept,
  detectInterceptions,
  resolveInterceptions,
  type InterceptionEvent,
} from './interception';
export {
  collectorCarryView,
  carryingCollectors,
  isThreatTo,
  threatLevelForDistance,
  collectorThreat,
  threatenedCollectors,
  anyCollectorInDanger,
  hostileEnforcerNear,
  type CollectorCarryView,
  type ThreatView,
  type ThreatLevel,
} from './gamefeel';
export {
  facingFromVector,
  unitFacing,
  facesRight,
  inspectUnit,
  inspectBusiness,
  inspectDistrict,
  type Facing,
  type UnitInspection,
  type BusinessInspection,
  type DistrictInspection,
} from './inspect';
export {
  hasEstablishedIncome,
  suggestedExtortTarget,
  hasCarryingCollector,
  nextRunIsProtected,
  carryingRunIsProtected,
  firstObjective,
  tutorialCard,
  tutorialComplete,
  TUTORIAL_STEPS,
  INITIAL_TUTORIAL_PROGRESS,
  type Objective,
  type ObjectiveStep,
  type ExtortTarget,
  type TutorialCard,
  type TutorialStepId,
  type TutorialProgress,
} from './onboarding';
export {
  formatCountdown,
  familyHudView,
  realtimeHudView,
  topFederalWarning,
  anyMutinyPrimed,
  type FamilyHudView,
  type ShockHudView,
  type HudView,
} from './hud';
export {
  buildMapLayout,
  navGridForLayout,
  businessTileOf,
  hqTileOf,
  businessAtTile,
  hasFootholdForExtort,
  startCollectorRun,
  rushCollection,
  rushCollectorInFlight,
  depositCollector,
  processCollectorArrivals,
  dispatchThreat,
  extortAtTile,
  laidOutBusinessIds,
  type MapLayout,
  type CollectorRunResult,
  type RushOutcome,
  type DepositEvent,
  type DispatchThreat,
  type ExtortAtTileResult,
} from './mapEconomy';
export { update, updateAndObserve, type UpdateResult, type ObserveResult } from './realtime';
export {
  unitHealth, isCombatant, hostile, enemyInRange, damageUnit, resolveProximityCombat, type CombatEvent,
} from './combat';
export {
  meleeDamage, attackInterval, engageRange, unitCombatStrength, WEAPON_TUNING,
  MAX_HIT_DAMAGE, MIN_ATTACK_INTERVAL, SKILL_DMG_PER, SKILL_CADENCE_PER, SKILL_DEF_PER, type WeaponMult,
} from './combatTuning';
export {
  planRivalOffense, RIVAL_OFFENSE_TUNING,
  committedForce, planTelegraph, strikeLeadMs, shouldRetreat,
  RIVAL_TELEGRAPH_LEAD_MIN_MS, RIVAL_TELEGRAPH_LEAD_MAX_MS, RIVAL_RETREAT_TUNING,
  type RivalOffenseTuning, type RivalOrder, type RivalOffenseInput, type RivalOffensePlan,
  type CommittableUnit, type CommittedForce, type RivalStrikeReason, type RivalTelegraph,
  type TelegraphContext, type RivalRetreatTuning,
} from './rivalOffense';
export {
  telegraphTier, countFriendlyNear, targetRevealed, buildTelegraphReport, telegraphLeadMs,
  telegraphPressureRow, severityLabel, resolveStrike,
  TELEGRAPH_TIERS, TELEGRAPH_PRESENCE_RADIUS, TELEGRAPH_SUSPECTED_MUSCLE, TELEGRAPH_CONFIRMED_MUSCLE,
  TELEGRAPH_TIER_LEAD_BONUS_MS,
  type TelegraphTier, type PlayerIntel, type ThreatTarget, type TelegraphReport,
  type RetreatResponse, type StrikeOutcome, type StrikeResolution,
} from './telegraph';
export {
  recordDownedBody, advanceDownedBodies, downedBodyDecay, DOWNED_BODY_PERSIST_SECONDS, type DownedBody,
} from './downedBodies';
export {
  spawnBeatCops, advanceBeatCops, desiredCopCount, copDistrictWeights, buildPatrolWorld,
  copsRequested, debugCopsRequested, copMarkerVisible,
  COP_PATROL_SPEED, COP_CAP_CLEAR,
  type BeatCop, type BeatCopMode, type PatrolWorld, type CopDistrictWeight,
} from './beatCops';
export {
  previewAttackRival, previewExtortFront, previewRetakeFront, previewFederalAction, type IsVisible,
} from './opPreview';
export {
  UNKNOWN, VISIBLE_ONLY, MAX_GLANCE_ROWS,
  type OpVerb, type OpPreview, type PreviewRow, type PreviewTone,
} from './opPreviewTypes';
export {
  serializeGame, serializeToString, deserializeGame, cloneState, migrateSave,
  SAVE_SCHEMA_VERSION, type SaveFile, type LoadResult,
} from './saveLoad';
export {
  tickEmbodiedExtortionAct, advanceEmbodiedExtortion, applyCommandWithEmbodiedExtortion,
  canIssueMoveAndShakedown, createMoveAndShakedownAct, frontInteractionPoint, isAtFront, isPresentForShakedown,
  canIssueMoveAndSabotage, createMoveAndSabotageAct,
  isRivalHeldFront, frontGuard, isRetakeableFront,
  type EmbodiedActKind, type EmbodiedExtortionAct, type EmbodiedExtortionState, type EmbodiedExtortionEvent,
  type ExtortionTickInput, type MoveAndShakedownCommand, type MoveAndSabotageCommand,
} from './extortionEmbodied';
export {
  federalTierLabel,
  bribeBracket,
  verbChipState,
  alertCategory,
  incidentNeedsYou,
  FEDERAL_LADDER,
  BRIBE_PIPS,
  type FederalTierName,
  type BribeBracket,
  type VerbState,
  type AlertCategory,
} from './hudText';
export {
  businessActions,
  resolveAttack,
  earningBusinesses,
  canAttack,
  type ActionGate,
  type BusinessActions,
  type AttackResult,
} from './interdiction';
export {
  routeStops,
  routeCollectorOf,
  createCollectionRoute,
  advanceRoutes,
  routeStatus,
  ensureBusinessCollector,
  businessRouteId,
  collectorsVulnerable,
  type RouteSetup,
  type RouteStatus,
} from './routes';
export {
  CITY_ARCHETYPES,
  GRID3_NEIGHBORS,
  districtIdentity,
  districtNeighbors,
  districtValue,
  isBigCity,
  type DistrictIdentity,
} from './city';
export {
  districtStatus,
  pushPresence,
  applyCapture,
  applyDisruption,
  districtsHeld,
  exposedDistricts,
  districtIncomeFor,
  type DistrictStatus,
  type PushResult,
  type PushOptions,
} from './territoryWar';
export {
  targetScore,
  rivalStrategicTarget,
  rivalPushAmount,
  expansionRamp,
  rampedPushAmount,
  telegraphedPushes,
  familyIsFallen,
  resolveStrategicPulse,
  advanceStrategy,
  rivalsDormant,
  type TelegraphedPush,
  type StrategicEvent,
} from './strategy';
export {
  familyPower,
  cityStanding,
  allRivalsCrushed,
  playerHomeFront,
  type Trajectory,
  type StandingRow,
  type CityStanding,
  type HomeFront,
} from './contest';
export {
  offenseReady,
  canRaid,
  canSabotage,
  canAssassinate,
  canLockout,
  resolveRaid,
  resolveSabotage,
  resolveAssassinate,
  resolveLockout,
  type Gate,
  type RaidResult,
  type SabotageResult,
  type AssassinateResult,
  type LockoutResult,
} from './offense';
export {
  offenseReadout,
  matchPhase,
  hudPhase,
  offensePreview,
  playerWeeklyNet,
  buildReadout,
  weeksToAfford,
  expandTargetDistrictId,
  isNearlyHeld,
  type OffenseKey,
  type OffenseOption,
  type MatchPhase,
  type PhaseReadout,
  type HudPhase,
  type HudPhaseReadout,
  type OffensePreview,
  type BuildKey,
  type BuildOption,
} from './pacing';
export {
  createFog,
  tileKey,
  isRevealed,
  revealAround,
  revealedCount,
  revealAllRequested,
  revealAll,
  type FogState,
} from './fog';
export {
  extortResistance,
  extortProgress,
  recordExtortVisit,
  type ExtortProgress,
  type ExtortVisitResult,
} from './extortion';
export {
  generateWorld,
  districtOfTile as districtOfWorldTile,
  tileKindAt,
  openFraction,
  scatterProps,
  type WorldLayout,
  type WorldDistrict,
  type TileKind,
  type WorldGenOptions,
  type PropKind,
  type PropPlacement,
  type ScatterOptions,
} from './worldgen';
export { Pool } from './pool';
export {
  buildCityGraph,
  pickStep,
  parseLiveliness,
  LIVELINESS_CAPS,
  STEP_DIRS,
  type CityGraph,
  type Liveliness,
  type LifeCaps,
} from './cityGraph';
export {
  canCollect,
  canReinvest,
  coreVerbState,
  type VerbState as ToolbarVerbState,
  type CoreVerbId,
  type CoreVerbContext,
} from './toolbar';
export {
  districtStatusOf,
  cityRoster,
  citySummary,
  type DistrictHoldStatus,
  type DistrictRow,
  type CitySummary,
} from './districtStatus';
export {
  POSTURE_MODS, POSTURES, postureOf, pendingPostureOf, postureMods,
  posturedDirtyIncome, posturedCleanIncome, posturedLocalHeat, posturedControlPressureOut,
  posturedControlDecay, posturedProvocation, posturedExpansionPressure,
  posturedCollectorCarry, posturedCollectorSafety, posturedDefense, posturedFederalEvidence,
  aggressiveBackfireMitigation,
  isPosturable, postureCooldownTicks, canRequestPosture, requestPosture, applyPostureBoundary,
  posturePreviewRow, postureContestRumor,
  type PostureMods, type PostureGate,
} from './districtPosture';
export {
  unitRepertoire,
  unitActionChips,
  resolveChip,
  commonVerbs,
  multiSelectChips,
  chipReady,
  VERB_HOTKEYS,
  type VerbId,
  type ActionChip,
  type UnitActionContext,
} from './actionCard';
export {
  buildActionInspector,
  multiSelectInspectors,
  rowSymbol,
  type ActionRequirementInspector,
  type ActionRequirementRow,
  type RequirementCategory,
  type RequirementState,
  type InspectorState,
  type InspectorContext,
  type InspectableActionId,
} from './actionInspector';
export {
  ENFORCER_SPECS,
  ENFORCER_TIERS,
  enforcerPresenceWeight,
  enforcerUnitSkill,
  unitMusclePresence,
  PATROL_PRESENCE_BONUS,
  totalMusclePresence,
  enforcerGate,
  recruitEnforcer,
  recruitableEnforcers,
  type EnforcerSpec,
  type RecruitGate,
  type RecruitResult,
  type RecruitOption,
} from './enforcers';
export {
  familyShare,
  borderContestTargets,
  desiredContestCount,
  activateContests,
  resolveContestStep,
  contestOf,
  districtContested,
  contestedDistrictIds,
  collectorVulnerableInDistrict,
  type ContestOutcome,
  type ContestResult,
} from './turfWar';
export {
  dominationProgress,
  goStraightProgress,
  mayorProgress,
  winPaths,
  metWinPath,
  advanceCivics,
  influenceOf,
  legitEmpireValue,
  legalFrontCount,
  type WinPath,
  type WinPathProgress,
} from './winpaths';
export {
  viceBranchFor,
  viceLadder,
  applyViceUpgrade,
  type ViceBranch,
  type ViceLadder,
  type ViceRungView,
  type RungState,
  type ViceUpgradeResult,
} from './vice';
export {
  createMarket,
  ensureMarket,
  marketGood,
  supplyDemandRead,
  tradePreview,
  buyGood,
  sellGood,
  advanceMarket,
  shockDemand,
  marketRows,
  type TradeSide,
  type TradePreview,
  type TradeResult,
  type MarketRow,
} from './market';
export {
  advanceEvents,
  advanceWeeklyContent,
  type EventKind,
} from './events';
export {
  hqIntegrityOf,
  damageHQ,
  eliminateFamily,
  playerCollapsed,
  evaluateEndgame,
  rivalWeakness,
  weakestRival,
  victoryProximity,
  type VictoryProximity,
  type EndKind,
  type EndgameResult,
  type RivalWeakness,
} from './endgame';
export {
  victoryConditions,
  victoryStage,
  leadingVictory,
  imminentVictory,
  victoryReport,
  lastStandingCondition,
  dominanceCondition,
  goStraightCondition,
  mayorCondition,
  type VictoryConditionId,
  type VictoryStage,
  type VictoryOutcome,
  type VictoryCondition,
  type VictoryReport,
} from './victory';
export {
  createRunStats,
  ensureRunStats,
  recordFundsBanked,
  recordIncomeEarned,
  recordBribePaid,
  recordRacketRun,
  observeRun,
  runStatsSummary,
  type RunStats,
} from './runStats';
export {
  adviseRun,
  topSuggestion,
  topSuggestions,
  rankScore,
  ADVISOR_RECENT_MS,
  type Urgency,
  type AdvisorPlace,
  type AdvisorSnapshot,
  type AdvisorEvent,
  type Suggestion,
} from './advisor';
export {
  recordIncident,
  harvestIncidents,
  isLedgerKind,
  recentIncidents,
  incidentsByType,
  lastIncident,
  incidentCount,
  INCIDENT_CAP,
  type IncidentRecord,
  type IncidentInput,
  type IncidentType,
  type IncidentSeverity,
} from './ledger';
export {
  emptySelection,
  selectOnly,
  selectMany,
  addToSelection,
  toggleSelection,
  clearSelection,
  isSelected,
  selectedUnits,
  pickUnit,
  unitsInBox,
  resolveMoveCommand,
  isCommandableTile,
  isCommandableUnit,
  type Selection,
  type MoveResolution,
} from './selection';
export {
  ISO_TILE_WIDTH,
  ISO_TILE_HEIGHT,
  ISO_TILE_HALF_WIDTH,
  ISO_TILE_HALF_HEIGHT,
  gridToScreen,
  screenToGrid,
  screenToTile,
  tileCorners,
  depthValue,
  compareDepth,
  depthSort,
  tileNeighbors,
  tileNeighbors8,
  inBounds,
  manhattan,
  tileEquals,
  type Vec2,
  type GridPos,
  type DepthItem,
} from './iso';
export {
  applyCommand,
  applyCommands,
  findBusiness,
  muscleInDistrict,
  extortSuccessChance,
  type Command,
  type ExtortCommand,
  type EstablishOperationCommand,
  type RecruitGangsterCommand,
  type AssignGangsterCommand,
  type ExpandControlCommand,
  type BribeCommand,
  type OrderHitCommand,
  type LaunderCommand,
  type CollectCommand,
  type SetBribeCommand,
  type UpgradeOperationCommand,
  type RepayLoanCommand,
} from './commands';
export {
  raidBaseChance,
  bribeMitigation,
  raidChance,
  bribeDecayBonus,
  effectiveDecay,
  resolveLaw,
} from './law';
export {
  BRIBE_CHANNELS,
  sumBribes,
  recomputeBribeLevel,
  bustAvoidChance,
} from './bribery';
export {
  tierOf,
  tierMultiplier,
  effectiveOperationIncome,
  upgradeCost,
} from './tiers';
export {
  loyaltyDelta,
  desertionChance,
  resolveLoyalty,
  atRiskCount,
  mutinyConditionMet,
  GANGSTER_NAMES,
} from './gangsters';
export {
  TRAIT_DEFS,
  ALL_TRAITS,
  gangsterTraits,
  hasTrait,
  traitUpkeepModifier,
  crewExtortBonus,
  crewCombatBonus,
  crewHeatRelief,
  crewBribeDiscount,
  memberLoyaltyDelta,
  desertionChanceFactor,
  rollTraits,
  type Trait,
  type TraitDef,
} from './traits';
export {
  LOYALTY_EVENT_DELTA,
  loyaltyStatus,
  tiesOf,
  propagateTie,
  adjustMemberLoyalty,
  applyCrewLoyaltyEvent,
  propagateMemberLoss,
  crewReadout,
  type LoyaltyEvent,
  type LoyaltyStatus,
  type CrewTie,
  type CrewMemberReadout,
} from './crew';
export {
  controlOf,
  districtHolder,
  holdsDistrict,
  districtsHeldBy,
  districtsHeldCount,
  topRivalControl,
} from './territory';
export {
  rivalCandidates,
  chooseRivalAction,
  resolveRivalAI,
  strongholdDistrict,
  affordableOperation,
  type ScoredAction,
} from './ai';
export {
  familyStrength,
  decideCasualties,
  resolveConflict,
  type CasualtyOutcome,
} from './conflict';
export {
  resolveWinLoss,
  endTurn,
  isGameOver,
  districtsNeededToWin,
  allRivalsEliminated,
} from './flow';
export {
  SHOCK_KINDS,
  incomeShockMultiplier,
  fedShield,
  auditSeizure,
  triggerShock,
  resolveShocks,
} from './shocks';
export {
  dirtyExposurePoints,
  fedExposureRelief,
  federalExposure,
  fedWarningTier,
  fedWarningMessage,
  resolveFederalWarnings,
} from './federal';
