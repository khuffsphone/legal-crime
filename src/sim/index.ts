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
