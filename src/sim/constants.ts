// Canonical simulation constants. See LEGAL_CRIME_DESIGN.md §6.
// Pure data — no Phaser, no browser globals.

import type { OperationKind } from './types';

export const EXTORT_RATE = 0.3; // fraction of front base income paid to extorter
export const EXTORT_MIN_CONTROL = 20; // min control points to extort in a district
export const EXTORT_HEAT = 3; // heat per tick per extorted business

export const OPERATION_COST: Record<OperationKind, number> = {
  numbers: 500,
  smuggling: 1500,
  speakeasy: 1000,
  protection: 800,
};

export const OPERATION_INCOME: Record<OperationKind, number> = {
  numbers: 200,
  smuggling: 600,
  speakeasy: 400,
  protection: 300,
};

export const OPERATION_HEAT: Record<OperationKind, number> = {
  numbers: 4,
  smuggling: 10,
  speakeasy: 6,
  protection: 5,
};

export const RECRUIT_COST = 400;
export const DESERT_LOYALTY = 20;

// Gangster stat ranges at recruitment and upkeep scaling.
export const RECRUIT_SKILL_MIN = 1;
export const RECRUIT_SKILL_MAX = 10;
export const RECRUIT_LOYALTY_MIN = 40;
export const RECRUIT_LOYALTY_MAX = 80;
export const GANGSTER_UPKEEP_PER_SKILL = 10;

// Per-tick loyalty drift.
export const LOYALTY_GAIN_PAID = 2; // gained when the family can pay (cash >= 0)
export const LOYALTY_DROP_UNPAID = 5; // lost when the family is broke (cash < 0)
export const LOYALTY_HEAT_DIVISOR = 20; // loyalty also drops by floor(heat / divisor)
export const LOYALTY_MAX = 100;
export const LOYALTY_MIN = 0;

// Desertion probability scales up to this as loyalty falls toward 0 below the threshold.
export const MAX_DESERT_CHANCE = 0.5;

export const CONTROL_HOLD = 50; // control points needed to "hold" a district
export const CONTROL_MAX = 100;

// Territory expansion.
export const EXPAND_COST = 300; // cash per expandControl action
export const EXPAND_BASE_GAIN = 10; // control points gained before muscle bonus
export const CONTEST_REDUCTION = 0.5; // fraction of the gain taken from the top rival

export const HEAT_MAX = 100;
export const HEAT_DECAY = 2; // heat lost per tick (before bribe effects)
export const RAID_THRESHOLD = 60;

// Law / raid model.
export const RAID_MAX_CHANCE = 0.8; // raid probability at HEAT_MAX with no bribe
export const BUST_HEAT = 90; // a raid at or above this heat busts the boss
export const RAID_CASH_SEIZE_FRACTION = 0.3; // cash seized on a non-bust raid
export const RAID_HEAT_RELIEF = 0.5; // fraction of heat shed after a non-bust raid

// Bribery effects.
export const BRIBE_MITIGATION_PER_LEVEL = 0.01; // raid-chance reduction per bribe point
export const BRIBE_MAX_MITIGATION = 0.9; // cap on raid-chance reduction
export const BRIBE_DECAY_PER_LEVEL = 0.05; // extra heat decay per bribe point

export const BANKRUPT_FLOOR = -1000;
export const WIN_DISTRICTS = 0.6; // fraction of districts the player must hold to win

// Rival AI scoring heuristic (Phase 7). Base scores are deterministic; a small seeded
// jitter breaks ties and adds variety.
export const AI_RECRUIT_BASE = 60;
export const AI_RECRUIT_PER_GANGSTER = 15; // recruit score falls as the roster grows
export const AI_OP_BASE = 45;
export const AI_OP_PER_OP = 12; // operation score falls as a family owns more
export const AI_EXPAND_BASE = 30;
export const AI_BRIBE_AMOUNT = 20; // standing bribe a rival buys when heat is high
export const AI_BRIBE_HEAT_THRESHOLD = 40; // rivals only bribe above this heat
export const AI_JITTER = 8; // max additive random jitter on a candidate score
