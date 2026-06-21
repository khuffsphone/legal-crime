// Canonical simulation constants. See LEGAL_CRIME_DESIGN.md §6.
// Pure data — no Phaser, no browser globals.

import type { OperationKind } from './types';

export const EXTORT_RATE = 0.3; // fraction of front base income paid to extorter
export const EXTORT_MIN_CONTROL = 20; // min control points to extort in a district
export const EXTORT_HEAT = 3; // heat per tick per extorted business
// RTS-11 onboarding tuning: extortion success scales from EXTORT_BASE_CHANCE (at 0 control) up
// to 1.0 (at full control), plus the muscle bonus. The floor makes a first racket reliably
// achievable in a try or two so a new player establishes income before the failure timers bite.
export const EXTORT_BASE_CHANCE = 0.5; // success floor at zero control (was effectively 0)

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

// Bribery effects (the police channel drives raid mitigation; politicians drive decay).
export const BRIBE_MITIGATION_PER_LEVEL = 0.01; // raid-chance reduction per police-bribe point
export const BRIBE_MAX_MITIGATION = 0.9; // cap on raid-chance reduction
export const BRIBE_DECAY_PER_LEVEL = 0.05; // extra heat decay per politicians-bribe point

// Bribery sliders (Phase 13 / S3): judges buy a chance to spring the boss from a bust.
export const JUDGE_BUST_MITIGATION_PER_LEVEL = 0.01; // bust-avoidance per judges point
export const JUDGE_MAX_BUST_MITIGATION = 0.8; // cap on bust avoidance from judges

// Illegal business tiers (Phase 14 / S4). A tier-N operation earns and throws heat ×N;
// tier 1 is the baseline (×1) so prior operation values are unchanged. Upgrading costs the
// operation kind's base cost times the current tier.
export const TIER_MAX = 3;
export const TIER_UPGRADE_FACTOR = 1.0; // upgrade cost = OPERATION_COST[kind] * factor * tier

// Hits & conflict (Phase 8).
export const HIT_HEAT = 25; // heat the attacker draws for ordering a hit
export const HIT_VARIANCE_MIN = 0.5; // effective strength = strength * [MIN, MIN+1)
export const HIT_CLOSE_MARGIN = 0.25; // below this margin the winner also takes a loss
export const HIT_ROUT_MARGIN = 0.5; // above this margin the loser takes an extra loss

export const BANKRUPT_FLOOR = -1000; // legacy cash floor (superseded by DEBT_CEILING in P15)
export const WIN_DISTRICTS = 0.6; // fraction of districts the player must hold to win

// Mutiny (Phase 15 / S5): a disloyal crew can walk out together rather than one at a time.
export const MUTINY_MIN_CREW = 3; // mutiny needs at least this many gangsters
export const MUTINY_THRESHOLD_FRACTION = 0.5; // ...at least half below desertion loyalty
export const MUTINY_CHANCE = 0.5; // chance a coordinated mutiny fires when the condition holds
export const MUTINY_SKIM = 0.25; // fraction of cash the mutineers steal on the way out

// Auto-loan / debt (Phase 15 / S5): a cash shortfall is floated by a loan shark.
export const LOAN_INTEREST_RATE = 0.1; // per-tick compounding interest on outstanding debt
export const DEBT_CEILING = 5000; // bankrupt when debt exceeds this

// Federal exposure & telegraphing (Phase 18). Exposure = heat + dirty-cash hoard points,
// relieved by The Bureau (feds) bribe, clamped to [0,100]. Escalating warnings fire at the
// tier thresholds; a terminal federal bust requires the imminent tier to have armed (>= 1
// tick after it fires), so a bust is always telegraphed.
export const DIRTY_EXPOSURE_DIVISOR = 200; // exposure points = floor(dirtyCash / divisor)
export const DIRTY_EXPOSURE_CAP = 50; // cap on dirty-cash exposure points
export const FED_RELIEF_PER_LEVEL = 0.5; // exposure relief per The Bureau (feds) bribe point
export const FED_RELIEF_CAP = 40; // cap on The Bureau exposure relief
export const FED_WARN_TIER_1 = 50; // exposure threshold: "asking questions"
export const FED_WARN_TIER_2 = 70; // exposure threshold: "agents near your fronts"
export const FED_WARN_TIER_3 = 85; // exposure threshold: "a bust is imminent"
export const FED_MAX_WARN_LEVEL = 3; // the imminent tier; a bust requires this armed
export const FED_DIRTY_DANGER = 4000; // dirty cash above which the launder prompt appears
// Phase 19 balance: the imminent (tier-3) warning must hold this many ticks before the bust
// arms, guaranteeing several ticks of runway between the warning and a terminal bust.
export const FED_ARM_DELAY = 3;

// Systemic shocks (Phase 16). A seeded world event table that stresses every mechanic.
export const SHOCK_CHANCE = 0.15; // per-tick chance a shock fires (only when enabled)
export const SHOCK_DURATION = 3; // ticks a durational shock (crackdown/boom/bust) stays active
export const CRACKDOWN_HEAT = 8; // heat added to every family each crackdown tick
export const BOOM_MULT = 1.5; // business income multiplier during a boom
export const BUST_MULT = 0.5; // business income multiplier during a bust
export const AUDIT_SEIZE_FRACTION = 0.5; // fraction of dirty cash a federal audit seizes
export const AUDIT_FED_SHIELD_PER_LEVEL = 0.02; // audit shield per feds-bribe point (capped 1)

// Dual economy (Phase 11 / S1). Crime income is dirty; a hoard of dirty cash radiates
// heat, and laundering converts dirty -> clean (safe) through extorted fronts for a fee.
export const DIRTY_CASH_HEAT_DIVISOR = 1000; // per tick: heat += floor(dirtyCash / divisor)
export const DIRTY_HEAT_MAX_PER_TICK = 15; // cap on per-tick dirty-cash heat
// Phase 19 balance: laundering made more accessible — cheaper fee, higher throughput per
// front — so clearing a dangerous dirty hoard is viable before it becomes fatal.
// (was 0.15 / 200.)
export const LAUNDER_FEE_RATE = 0.1; // fee fraction to convert dirty -> clean
export const LAUNDER_CAP_PER_FRONT = 400; // launder capacity granted per extorted front

// Collector units (Phase 12 / S2). Income accrues at businesses as "uncollected" takings;
// a collection run gathers it with a risk — police presence and heat skim/steal the take,
// guarding muscle protects it. The collected fraction = safety * (1 - random skim).
export const COLLECT_BASE_YIELD = 1.0; // collectible fraction in ideal conditions
export const COLLECT_PRESENCE_PENALTY = 0.004; // safety lost per police-presence point
export const COLLECT_HEAT_PENALTY = 0.003; // safety lost per heat point
export const COLLECT_MUSCLE_BONUS = 0.05; // safety gained per guard skill point in district
export const COLLECT_MIN_YIELD = 0.1; // floor on the deterministic safe fraction
export const COLLECT_SKIM_MAX = 0.3; // max random skim taken off the safe fraction
export const COLLECT_HEAT = 2; // heat from running a collection
export const AI_COLLECT_BASE = 55; // rival priority to collect a pending pile

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

// RTS-0 — continuous real-time loop. A "week" (the existing economic settlement) is now a
// real-time interval rather than a keypress. Tunable for pacing/engagement (see plan).
export const WEEK_DURATION_SECONDS = 120; // real seconds between week settlements (~2 min)

// RTS-2 — spatial units & movement. Units travel tile waypoints in real time, on the same
// clock as the week settlement but fully independent of it (a week firing never interrupts a
// move). Speed is in TILES PER SECOND so it is resolution-independent of the iso pixel size.
export const MOVE_SPEED = 2.5; // default unit speed, tiles/second
export const ARRIVE_EPSILON = 1e-6; // tiles; within this distance a waypoint counts as reached

// RTS-3 — selection & command. Click-picking selects the unit within this grid-space radius of
// the click; a generous half-tile-plus so a click anywhere on a unit's tile lands the pick.
export const PICK_RADIUS = 0.7; // tiles

// RTS-4 — interception & ambush. A hostile enforcer that closes within this grid-space radius
// of a carrying collector robs it; the ambush adds this much heat to the attacking family.
export const INTERCEPT_RADIUS = 0.75; // tiles
export const INTERCEPT_HEAT = 4; // heat the attacker draws for the robbery

// RTS-8 — game-feel. Proximity-warning band (wider than INTERCEPT_RADIUS): a carrying collector
// with a hostile enforcer within this distance is flagged "threatened" before the ambush lands.
export const DANGER_RADIUS = 2.5; // tiles

// RTS-13 — onramp polish. Pre-dispatch telegraph: a collector run is "hot" (risky to send) when
// a hostile enforcer is within this distance of a collection source or the HQ, so a new player
// can learn to TIME the run (wait for clear) instead of facing a blind cliff on run #2.
export const ROUTE_DANGER_RADIUS = 4.0; // tiles

// RTS-16 — the turf war. Rival families make a territorial move on this real-time cadence
// (deterministic, telegraphed). Tunable so the contest is a fight, not a stomp.
export const STRATEGY_PULSE_SECONDS = 22; // ~5 rival moves per 120s week
export const RIVAL_PUSH_BASE = 12; // base control a rival pushes into a target each pulse
export const RIVAL_PUSH_PER_STRENGTH = 0.4; // extra push per point of family strength
export const POLITICIAN_DETERRENCE = 6; // City Hall (politicians) bribe deters pushes on your turf
export const TURF_DOMINANCE = 0.6; // fraction of districts that reads as "dominant" in the standings
// Onboarding grace: the seeded tutorial crew works cheap, so the idle upkeep bleed is gentle
// while a new player learns the loop (a recruited gangster still costs skill × upkeep-per-skill).
export const STARTING_CREW_UPKEEP = 15; // cash/week per tutorial guard (was skill×10 = 30)
