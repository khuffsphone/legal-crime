// Public surface of the pure simulation. Phaser scenes import only from here.
// This module must never import Phaser or touch browser globals.

export * from './types';
export * from './constants';
export { Rng, mulberry32, seedToCursor } from './rng';
export { createInitialState } from './state';
export {
  allBusinesses,
  operationHeat,
  extortionIncome,
  operationIncome,
  familyIncome,
  familyExpenses,
  familyNet,
} from './economy';
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
