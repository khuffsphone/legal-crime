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
  loyaltyDelta,
  desertionChance,
  resolveLoyalty,
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
