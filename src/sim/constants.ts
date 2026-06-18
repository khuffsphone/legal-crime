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

export const CONTROL_HOLD = 50; // control points needed to "hold" a district
export const CONTROL_MAX = 100;

export const HEAT_MAX = 100;
export const HEAT_DECAY = 2; // heat lost per tick (before bribe effects)
export const RAID_THRESHOLD = 60;

export const BANKRUPT_FLOOR = -1000;
export const WIN_DISTRICTS = 0.6; // fraction of districts the player must hold to win
