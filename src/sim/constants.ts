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

export const HEAT_MAX = 100;
export const HEAT_DECAY = 2; // heat lost per tick (before bribe effects)
export const RAID_THRESHOLD = 60;

export const BANKRUPT_FLOOR = -1000;
export const WIN_DISTRICTS = 0.6; // fraction of districts the player must hold to win
