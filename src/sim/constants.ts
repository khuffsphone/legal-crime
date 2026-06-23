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

// RTS-21 balance: muscle toward the 12 strength a hit needs must be affordable alongside the
// economy (was 400 — the player stalled at crew 2, ASSASSINATE muscle-locked). 400 → 300.
export const RECRUIT_COST = 300;
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
// RTS-21 balance: holding your home block must be reachable in rhythm (the un-armed UAT flatlined
// to $0 after ~$900 to expand home + one raid). Cheaper pushes (300 → 250) and a bigger base gain
// (10 → 15) so the home corner 30→50 is secured in ONE expand with starting muscle (15 + 6), or two
// without — keeping cash for the offensive ladder.
export const EXPAND_COST = 250; // cash per expandControl action
export const EXPAND_BASE_GAIN = 15; // control points gained before muscle bonus
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

// RTS-22 — the ATTACK interaction: right-click a business → temporarily SHUT IT DOWN (it stops
// producing). The intended use is to interdict a neighbouring RIVAL's economy. Cheap and quiet (a
// thug job, not a war crime): no cash, modest heat, a few weeks of lost production.
export const ATTACK_SHUTDOWN_WEEKS = 3; // weeks a struck business stays shut
export const ATTACK_HEAT = 6; // heat the attacker draws
export const ATTACK_MIN_CREW = 1; // a thug to send

// RTS-16 — the turf war. Rival families make a territorial move on this real-time cadence
// (deterministic, telegraphed). Tunable so the contest is a fight, not a stomp.
export const STRATEGY_PULSE_SECONDS = 22; // ~5 rival moves per 120s week
export const RIVAL_PUSH_BASE = 12; // base control a rival pushes into a target each pulse
export const RIVAL_PUSH_PER_STRENGTH = 0.4; // extra push per point of family strength
export const POLITICIAN_DETERRENCE = 6; // City Hall (politicians) bribe deters pushes on your turf
export const TURF_DOMINANCE = 0.6; // fraction of districts that reads as "dominant" in the standings

// RTS-17 — the offensive. Each player attack costs money + crew and draws heat; the canon four
// channels gate or ease the bigger moves. Tuned so offense is an earned strategic choice.
// RTS-19 balance: each action is a meaningful, costed blow with counterplay — NOT a steamroll. A
// raid SOFTENS (disrupts the rival's economy + chips control); it only SEIZES a block once you
// actually take and hold it, so flipping turf is a campaign, not a one-press win. A shared crew
// COOLDOWN stops chaining several heavy hits in one breath. Bigger moves are gated behind a built
// economy/territory and the canon channels, pacing offense to the mid–late game.
export const RAID_COST = 500; // cash to muscle into a rival district by force
export const RAID_HEAT = 14; // heat a raid draws (before The Bench mitigation)
export const RAID_MIN_CREW = 2; // crew needed to mount a raid
// RTS-19: a raid shoves LESS control (22 → 14) so a single $500 raid no longer knocks a holder off
// their block and grabs the rackets for free; it chips + disrupts, and a takeover takes sustained
// pressure (or a rival already softened/locked-out).
export const RAID_FORCE = 14;
export const RAID_BENCH_MITIGATION = 0.02; // heat cut per The Bench (judges) point, capped
export const RAID_BENCH_CAP = 0.7; // max raid-heat reduction from The Bench
export const RAID_REPELLED_BASE = 0.15; // base chance a raid is repelled (rises with rival guard)

export const SABOTAGE_COST = 350;
export const SABOTAGE_HEAT = 9;
export const SABOTAGE_MIN_CREW = 1;
export const SABOTAGE_DESTROY_CHANCE = 0.5; // chance a sabotaged operation is wrecked outright

export const ASSASSINATE_COST = 1500; // the decapitating blow is expensive
export const ASSASSINATE_HEAT = 30; // ...and loud (before City Hall political cover)
export const ASSASSINATE_MIN_STRENGTH = 12; // muscle enables the hit
// RTS-19: a hit razes 40 (was 45) HQ — still ~3 successful strikes to topple a Don, but a touch
// more deliberate; the crew cooldown stops chaining the hits instantly.
export const ASSASSINATE_HQ_DAMAGE = 40;
export const ASSASSINATE_CITYHALL_COVER = 0.02; // heat cut per City Hall point, capped
export const ASSASSINATE_CITYHALL_CAP = 0.6;

export const LOCKOUT_COST = 800;
export const LOCKOUT_BUREAU_REQ = 20; // The Bureau (feds) investment needed to drop the dime
export const LOCKOUT_DURATION = 4; // strategic pulses a rival stays locked down
export const LOCKOUT_BLEED_CASH = 200; // cash a locked rival loses per pulse
export const LOCKOUT_BLEED_HEAT = 6; // heat a locked rival gains per pulse

// RTS-19: a shared crew cooldown after ANY offensive action — your men must regroup before the
// next job, so you cannot chain raids/hits into an instant board flip. Decremented in the
// real-time wrapper; the gates (canRaid/…) refuse while it is hot. ~0.6 of a strategic pulse.
export const OFFENSE_COOLDOWN_SECONDS = 14;

// Rival retaliation / escalation (RTS-17).
export const AGGRO_ON_ATTACK = 40; // aggression a rival gains when you hit it
export const AGGRO_DECAY = 8; // aggression shed per strategic pulse
export const AGGRO_HQ_STRIKE = 60; // aggression above which a strong rival strikes YOUR HQ
export const RIVAL_HQ_STRIKE_DAMAGE = 12; // HQ integrity a rival strike costs you
export const HQ_MAX = 100;
// Onboarding grace: the seeded tutorial crew works cheap, so the idle upkeep bleed is gentle
// while a new player learns the loop (a recruited gangster still costs skill × upkeep-per-skill).
export const STARTING_CREW_UPKEEP = 15; // cash/week per tutorial guard (was skill×10 = 30)

// ── RTS-24 — Content & Engagement ──────────────────────────────────────────────────────────────

// Multiple win conditions (besides DOMINATION). Each is a pure progress metric; the match resolves
// when one reaches 100%. Tuned to be a long-game alternative to taking the city by force.
export const GO_STRAIGHT_TARGET = 25000; // "legit empire value" (clean cash + legal fronts) to retire
export const GO_STRAIGHT_FRONT_VALUE = 800; // legit value credited per protected legal storefront
export const MAYOR_CITYHALL_REQ = 40; // City Hall ($/wk) needed to run for mayor
export const MAYOR_INFLUENCE_REQ = 100; // civic influence needed to win the seat
// Civic influence accrues each week from City Hall greasing + turf + legit fronts (wrapped, not tick).
export const INFLUENCE_PER_CITYHALL = 0.15; // influence/wk per City Hall point
export const INFLUENCE_PER_DISTRICT = 2; // influence/wk per held district
export const INFLUENCE_PER_FRONT = 0.5; // influence/wk per protected front
export const INFLUENCE_MAX = 200;

// Vice upgrades — each racket converts along a branch with distinct yield/heat. A rung raises the
// operation's base income by the bump and shifts its heat; later rungs gate on a prerequisite.
export const VICE_RUNG_INCOME_BUMP = 180; // +baseIncome per rung
export const VICE_RUNG_COST_BASE = 700; // cash for the first rung (rises per rung)
export const VICE_RUNG_MAX = 3; // rungs per branch

// The Market (trade mini-game). Prices drift toward equilibrium; your trades move them (footprint);
// a spread is the house's cut on every buy/sell.
export const MARKET_SPREAD = 0.06; // 6% — buy above / sell below mid
export const MARKET_FOOTPRINT = 0.6; // how hard a unit traded moves supply/demand
export const MARKET_DRIFT = 0.12; // fraction prices ease back toward base each week
export const MARKET_PRICE_MIN = 5; // a good never goes worthless

// Light events feeding THE WIRE (wrapped, weekly). A handful, legible, tied to existing systems.
export const EVENT_WEEKLY_CHANCE = 0.35; // per-week chance an event fires (when enabled)

// ── RTS-29 — Core-loop reshape (slice 1: the peaceful builder) ───────────────────────────────────

// SPACE = THE CLOCK: a slow period stroll so travel is visible ambient time (was MOVE_SPEED 2.5).
// Applied per-unit at spawn in the scene; MOVE_SPEED itself is unchanged so movement tests stand.
export const STROLL_SPEED = 1.15; // tiles/second

// DELAYED RIVALS: weeks of zero rival TERRITORIAL contact (the calm runway). Opt-in via
// state.rivalWakeWeek (absent ⇒ 0 ⇒ no dormancy, so prior states/tests are unchanged).
export const RIVAL_DORMANT_WEEKS = 3;

// EXTORT AS REPEATED VISITS: muscle visits to convert a front (rich blocks resist more). Cost is
// TIME + a thug occupied, not cash.
export const EXTORT_VISITS_BASE = 3;
export const EXTORT_VISITS_PER_WEALTH = 1; // +visits per wealth tier above 1

// CONTROL currency — caps how much you can actively HOLD; raised by CITY HALL political favor (NOT a
// parallel economy) + a slow time-drift floor; SPENT on the holdings you maintain (returns when
// released). The chain extort→launder→bribe→favor→cap→expand is the pacing metronome.
export const CONTROL_START = 3; // starting cap (room for the first rackets)
export const CONTROL_PER_FAVOR = 5; // +1 cap per $5/wk greased into City Hall (politicians)
export const CONTROL_DRIFT_PER_WEEK = 0.05; // slow cap floor so a stuck player isn't hard-locked
export const CONTROL_CAP_MAX = 30;
export const CONTROL_COST_BUSINESS = 1; // control spent per extorted front held
export const CONTROL_COST_DISTRICT = 2; // control spent per held district

// FOG-OF-WAR: tiles revealed in this radius around the HQ + each player unit (slow brass dissolve).
export const FOG_REVEAL_RADIUS = 3.2; // tiles

// ── RTS-30a — World & camera foundation ──────────────────────────────────────────────────────────
// The sparse larger map edge (tiles square). ~an order of magnitude more tiles than the old 16² —
// the render CULLS to the viewport so it stays performant regardless of map size.
export const WORLD_SIZE = 96;
// DISTRICT STATUS (the reworked control): you HOLD a district at ≥ this share of its businesses.
export const HOLD_THRESHOLD = 0.6;

// ── RTS-30c-1 — Turf war CORE (presence-based contest + collector interception switch-on) ──────────
export const CONTEST_PULSE_SECONDS = 6;   // real-time cadence of a turf-war presence pulse
export const CONTEST_PRESSURE_STEP = 9;   // pressure shift per pulse, per net muscle (rival − player)
export const CONTEST_FLIP = 100;          // pressure at which one player business flips to the invader
export const CONTEST_PUSHOUT = -60;       // pressure at which the player repels the invader (held)
export const CONTEST_PRESSURE_MAX = 130;  // clamp magnitude
export const CONTEST_MAX = 3;             // most simultaneous contests (gradual escalation)
export const CONTEST_ESCALATE_WEEKS = 3;  // a new contest can open every N weeks after the rivals wake
export const CONTEST_MUSCLE_PER_INVASION = 2; // rival muscle units moved into a freshly contested block
// RTS-30c-1.1: the invader's INITIATIVE — added to net presence each pulse so a contest always trends
// toward a resolution (it can never sit at a dead 0). To REPEL, the player must OUT-muster the invader
// by more than this; an even match still slowly falls (the rival is on the offensive). The meter is the
// single visible authority for a contested district's block flips (the background capture is suspended).
export const CONTEST_INVADER_DRIFT = 1;
