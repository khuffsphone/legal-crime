// Command system. All player/rival actions are expressed as Commands and applied through
// applyCommand(state, cmd), the single deterministic entry point for state mutation
// outside of tick(). Stochastic commands draw from the seeded RNG cursor on state and
// write the advanced cursor back, preserving determinism.
//
// Pure — no Phaser, no browser globals.

import {
  COLLECT_HEAT,
  CONTEST_REDUCTION,
  CONTROL_MAX,
  EXPAND_BASE_GAIN,
  EXPAND_COST,
  EXTORT_BASE_CHANCE,
  EXTORT_HEAT,
  EXTORT_MIN_CONTROL,
  GANGSTER_UPKEEP_PER_SKILL,
  HEAT_MAX,
  OPERATION_COST,
  OPERATION_HEAT,
  OPERATION_INCOME,
  RECRUIT_COST,
  RECRUIT_LOYALTY_MAX,
  RECRUIT_LOYALTY_MIN,
  RECRUIT_SKILL_MAX,
  RECRUIT_SKILL_MIN,
  TIER_MAX,
} from './constants';
import {
  collectibleBusinesses,
  collectionFraction,
  collectionSafety,
  uncollectedOf,
} from './collection';
import { recomputeBribeLevel, sumBribes } from './bribery';
import { tierOf, upgradeCost } from './tiers';
import { GANGSTER_NAMES } from './gangsters';
import { crewExtortBonus, rollTraits, traitUpkeepModifier } from './traits';
import { cleanCash, clampDirty, creditCrimeIncome, launderCapacity, launderFee } from './laundering';
import { Rng } from './rng';
import { controlOf, topRivalControl } from './territory';
import {
  findFamily,
  findGangster,
  type BribeChannel,
  type Business,
  type District,
  type Family,
  type GameState,
  type GangsterAssignment,
  type OperationKind,
} from './types';

/** Phase 2: extort a front business on behalf of a family. */
export interface ExtortCommand {
  type: 'extort';
  familyId: string;
  businessId: string;
  /** NO-X-RAY seam (option a): the scene stamps this at ISSUE time via its isVisible closure — `false`
   * asserts the front's tile is NOT revealed. Absent/`true` (headless, tests, legacy AI) ⇒ treated as
   * revealed, so numbers stay byte-identical. A `false` assertion collapses the extort to the SAME
   * rejection as a nonexistent target (see applyExtort) — no unrevealed business is ever named. */
  issuedFromRevealed?: boolean;
}

/** Phase 3: establish an illegal operation in a district. */
export interface EstablishOperationCommand {
  type: 'establishOperation';
  familyId: string;
  districtId: string;
  kind: OperationKind;
}

/** Phase 4: recruit a new gangster into a family. */
export interface RecruitGangsterCommand {
  type: 'recruitGangster';
  familyId: string;
}

/** Phase 4: (re)assign a gangster to idle / guard a district / run an operation. */
export interface AssignGangsterCommand {
  type: 'assignGangster';
  gangsterId: string;
  assignment: GangsterAssignment;
}

/** Phase 5: spend cash + muscle to expand a family's control of a district. */
export interface ExpandControlCommand {
  type: 'expandControl';
  familyId: string;
  districtId: string;
}

/** Phase 6: raise a family's standing bribe (a per-tick retainer that buys protection).
 * Phase 13: this now adds to the Police channel. */
export interface BribeCommand {
  type: 'bribe';
  familyId: string;
  amount: number;
}

/** Phase 13: set a single bribery channel to an absolute amount (a slider). */
export interface SetBribeCommand {
  type: 'setBribe';
  familyId: string;
  channel: BribeChannel;
  amount: number;
}

/** Phase 14: upgrade one of a family's illegal operations to the next tier. */
export interface UpgradeOperationCommand {
  type: 'upgradeOperation';
  familyId: string;
  businessId: string;
}

/** Phase 15: pay down loan-shark debt with cash. */
export interface RepayLoanCommand {
  type: 'repayLoan';
  familyId: string;
  amount: number;
}

/** Phase 8: order a hit; queued and resolved at the next tick (conflict step). */
export interface OrderHitCommand {
  type: 'orderHit';
  attackerFamilyId: string;
  targetFamilyId: string;
}

/** Phase 11: launder dirty cash into clean through extorted fronts, paying a fee. */
export interface LaunderCommand {
  type: 'launder';
  familyId: string;
  amount: number;
}

/** Phase 12: send Collectors on a run to gather a family's uncollected takings in a district. */
export interface CollectCommand {
  type: 'collect';
  familyId: string;
  districtId: string;
}

/** Union of all commands. Extended in later phases. */
export type Command =
  | ExtortCommand
  | EstablishOperationCommand
  | RecruitGangsterCommand
  | AssignGangsterCommand
  | ExpandControlCommand
  | BribeCommand
  | OrderHitCommand
  | LaunderCommand
  | CollectCommand
  | SetBribeCommand
  | UpgradeOperationCommand
  | RepayLoanCommand;

/** Locate a business and its containing district. */
export function findBusiness(
  state: GameState,
  businessId: string,
): { business: Business; district: District } | undefined {
  for (const district of state.districts) {
    const business = district.businesses.find((b) => b.id === businessId);
    if (business) return { business, district };
  }
  return undefined;
}

/** Sum of skill of a family's gangsters guarding a district. */
export function muscleInDistrict(family: Family, districtId: string): number {
  return family.gangsters.reduce((sum, g) => {
    if (g.assignment.type === 'guard' && g.assignment.districtId === districtId) {
      return sum + g.skill;
    }
    return sum;
  }, 0);
}

/**
 * Probability an extortion attempt succeeds. Scales from EXTORT_BASE_CHANCE (at zero control)
 * linearly up to 1 (at full control), plus a muscle bonus of 0.04 per guarding-skill point,
 * clamped to [0, 1]. The base floor (RTS-11) makes a first racket reliably achievable in a try
 * or two; with full control (100) the chance is still exactly 1 (guaranteed).
 */
export function extortSuccessChance(
  state: GameState,
  familyId: string,
  businessId: string,
): number {
  const found = findBusiness(state, businessId);
  if (!found) return 0;
  const control = controlOf(found.district, familyId);
  const fam = findFamily(state, familyId);
  const muscle = fam ? muscleInDistrict(fam, found.district.id) : 0;
  // RTS-14: Brutal gangsters guarding the district lean harder on a shakedown.
  const traitBonus = fam ? crewExtortBonus(fam, found.district.id) : 0;
  const raw = EXTORT_BASE_CHANCE + (control / 100) * (1 - EXTORT_BASE_CHANCE) + 0.04 * muscle + traitBonus;
  return raw < 0 ? 0 : raw > 1 ? 1 : raw;
}

function addHeat(family: Family, amount: number): void {
  family.heat = Math.min(HEAT_MAX, family.heat + amount);
}

function applyExtort(state: GameState, cmd: ExtortCommand): GameState {
  const family = findFamily(state, cmd.familyId);
  const found = findBusiness(state, cmd.businessId);
  // NO-X-RAY seam: the reveal assertion never reaches the log (so a revealed extort is byte-identical to
  // today, and an unrevealed one is indistinguishable from a nonexistent target).
  const { issuedFromRevealed, ...cmdLog } = cmd;

  // NO-X-RAY (canon: the sim must not act on an unrevealed tile). An unrevealed front — asserted by the
  // scene's isVisible closure at issue time — COLLAPSES to the exact "not found" result of a nonexistent
  // target: same kind, same message, same data. No unrevealed business is named or otherwise revealed.
  if (!family || !found || issuedFromRevealed === false) {
    state.log.push({
      tick: state.tick,
      kind: 'extort-invalid',
      message: `Invalid extort: family ${cmd.familyId} or business ${cmd.businessId} not found`,
      data: { ...cmdLog },
    });
    return state;
  }

  const { business, district } = found;

  if (business.kind !== 'front') {
    state.log.push({
      tick: state.tick,
      kind: 'extort-invalid',
      message: `${business.name} is not a front and cannot be extorted`,
      data: { ...cmdLog },
    });
    return state;
  }

  if (business.extortedBy === family.id) {
    state.log.push({
      tick: state.tick,
      kind: 'extort-invalid',
      message: `${family.name} already extorts ${business.name}`,
      data: { ...cmdLog },
    });
    return state;
  }

  // Control gate — checked before any RNG draw so the outcome is deterministic and the
  // cursor is untouched when blocked.
  const control = controlOf(district, family.id);
  if (control < EXTORT_MIN_CONTROL) {
    state.log.push({
      tick: state.tick,
      kind: 'extort-blocked',
      message: `${family.name} lacks control in ${district.name} (${control} < ${EXTORT_MIN_CONTROL})`,
      data: { ...cmdLog, control },
    });
    return state;
  }

  // Roll for success using the shared seeded RNG.
  const rng = new Rng(state.rngState);
  const chance = extortSuccessChance(state, family.id, business.id);
  const success = rng.chance(chance);
  state.rngState = rng.state;

  // Extortion is noisy whether or not it lands.
  addHeat(family, EXTORT_HEAT);

  if (success) {
    business.extortedBy = family.id;
    state.log.push({
      tick: state.tick,
      kind: 'extort-success',
      message: `${family.name} now extorts ${business.name} in ${district.name}`,
      data: { ...cmdLog, chance },
    });
  } else {
    state.log.push({
      tick: state.tick,
      kind: 'extort-fail',
      message: `${family.name} failed to extort ${business.name} in ${district.name}`,
      data: { ...cmdLog, chance },
    });
  }

  return state;
}

function applyEstablishOperation(
  state: GameState,
  cmd: EstablishOperationCommand,
): GameState {
  const family = findFamily(state, cmd.familyId);
  const district = state.districts.find((d) => d.id === cmd.districtId);

  if (!family || !district) {
    state.log.push({
      tick: state.tick,
      kind: 'operation-invalid',
      message: `Invalid operation: family ${cmd.familyId} or district ${cmd.districtId} not found`,
      data: { ...cmd },
    });
    return state;
  }

  const cost = OPERATION_COST[cmd.kind];
  if (family.cash < cost) {
    state.log.push({
      tick: state.tick,
      kind: 'operation-denied',
      message: `${family.name} cannot afford a ${cmd.kind} operation ($${family.cash} < $${cost})`,
      data: { ...cmd, cost },
    });
    return state;
  }

  family.cash -= cost;

  // Deterministic unique id: district + kind + count of this family's existing ops here.
  const existing = district.businesses.filter(
    (b) => b.kind !== 'front' && b.ownerFamily === family.id,
  ).length;
  const operation: Business = {
    id: `${district.id}-op-${family.id}-${cmd.kind}-${existing}`,
    name: `${cmd.kind} operation`,
    kind: cmd.kind,
    baseIncome: OPERATION_INCOME[cmd.kind],
    heatPerTick: OPERATION_HEAT[cmd.kind],
    ownerFamily: family.id,
    districtId: district.id,
    uncollected: 0,
    tier: 1,
  };
  district.businesses.push(operation);

  state.log.push({
    tick: state.tick,
    kind: 'operation-established',
    message: `${family.name} established a ${cmd.kind} operation in ${district.name} for $${cost}`,
    data: { ...cmd, cost, businessId: operation.id },
  });
  return state;
}

function applyRecruitGangster(state: GameState, cmd: RecruitGangsterCommand): GameState {
  const family = findFamily(state, cmd.familyId);
  if (!family) {
    state.log.push({
      tick: state.tick,
      kind: 'recruit-invalid',
      message: `Invalid recruit: family ${cmd.familyId} not found`,
      data: { ...cmd },
    });
    return state;
  }

  if (family.cash < RECRUIT_COST) {
    state.log.push({
      tick: state.tick,
      kind: 'recruit-denied',
      message: `${family.name} cannot afford to recruit ($${family.cash} < $${RECRUIT_COST})`,
      data: { ...cmd, cost: RECRUIT_COST },
    });
    return state;
  }

  family.cash -= RECRUIT_COST;

  const rng = new Rng(state.rngState);
  const skill = rng.nextInt(RECRUIT_SKILL_MIN, RECRUIT_SKILL_MAX);
  const loyalty = rng.nextInt(RECRUIT_LOYALTY_MIN, RECRUIT_LOYALTY_MAX);
  const name = rng.pick(GANGSTER_NAMES);
  state.rngState = rng.state;

  // RTS-14: traits are rolled from the gangster's id with their OWN seeded Rng, so they are
  // deterministic but never touch state.rngState (the skill/loyalty/name draws above are intact).
  const id = `${family.id}-g-${family.gangsters.length}`;
  const traits = rollTraits(id);
  const gangster = {
    id,
    name,
    skill,
    loyalty,
    upkeep: Math.max(0, skill * GANGSTER_UPKEEP_PER_SKILL + traitUpkeepModifier(traits)),
    assignment: { type: 'idle' as const },
    traits,
  };
  family.gangsters.push(gangster);

  state.log.push({
    tick: state.tick,
    kind: 'recruit',
    message: `${family.name} recruited ${name} (skill ${skill}, loyalty ${loyalty})`,
    data: { familyId: family.id, gangsterId: gangster.id, skill, loyalty, traits },
  });
  return state;
}

/** Validate that an assignment's target exists in the world. */
function assignmentTargetValid(state: GameState, assignment: GangsterAssignment): boolean {
  switch (assignment.type) {
    case 'idle':
      return true;
    case 'guard':
      return state.districts.some((d) => d.id === assignment.districtId);
    case 'operation': {
      const found = findBusiness(state, assignment.businessId);
      return !!found && found.business.kind !== 'front';
    }
  }
}

function applyAssignGangster(state: GameState, cmd: AssignGangsterCommand): GameState {
  const found = findGangster(state, cmd.gangsterId);
  if (!found) {
    state.log.push({
      tick: state.tick,
      kind: 'assign-invalid',
      message: `Invalid assign: gangster ${cmd.gangsterId} not found`,
      data: { ...cmd },
    });
    return state;
  }

  if (!assignmentTargetValid(state, cmd.assignment)) {
    state.log.push({
      tick: state.tick,
      kind: 'assign-invalid',
      message: `Invalid assignment target for ${cmd.gangsterId}`,
      data: { ...cmd },
    });
    return state;
  }

  found.gangster.assignment = cmd.assignment;
  state.log.push({
    tick: state.tick,
    kind: 'assign',
    message: `${found.gangster.name} assigned to ${cmd.assignment.type}`,
    data: { gangsterId: cmd.gangsterId, assignment: cmd.assignment },
  });
  return state;
}

function applyExpandControl(state: GameState, cmd: ExpandControlCommand): GameState {
  const family = findFamily(state, cmd.familyId);
  const district = state.districts.find((d) => d.id === cmd.districtId);

  if (!family || !district) {
    state.log.push({
      tick: state.tick,
      kind: 'expand-invalid',
      message: `Invalid expand: family ${cmd.familyId} or district ${cmd.districtId} not found`,
      data: { ...cmd },
    });
    return state;
  }

  if (family.cash < EXPAND_COST) {
    state.log.push({
      tick: state.tick,
      kind: 'expand-denied',
      message: `${family.name} cannot afford to expand ($${family.cash} < $${EXPAND_COST})`,
      data: { ...cmd, cost: EXPAND_COST },
    });
    return state;
  }

  family.cash -= EXPAND_COST;

  const muscle = muscleInDistrict(family, district.id);
  const gain = EXPAND_BASE_GAIN + muscle;
  const current = controlOf(district, family.id);
  district.control[family.id] = Math.min(CONTROL_MAX, current + gain);

  // Contest: take a fraction of the gain from the strongest rival in the district.
  const rival = topRivalControl(district, family.id);
  let contested = 0;
  if (rival) {
    contested = Math.floor(gain * CONTEST_REDUCTION);
    district.control[rival.id] = Math.max(0, rival.control - contested);
  }

  state.log.push({
    tick: state.tick,
    kind: 'expand',
    message: `${family.name} expanded control in ${district.name} (+${gain}, -${contested} from rival)`,
    data: {
      ...cmd,
      gain,
      newControl: district.control[family.id],
      contestedFrom: rival?.id,
      contested,
    },
  });
  return state;
}

function applyBribe(state: GameState, cmd: BribeCommand): GameState {
  const family = findFamily(state, cmd.familyId);
  if (!family) {
    state.log.push({
      tick: state.tick,
      kind: 'bribe-invalid',
      message: `Invalid bribe: family ${cmd.familyId} not found`,
      data: { ...cmd },
    });
    return state;
  }

  if (cmd.amount <= 0) {
    state.log.push({
      tick: state.tick,
      kind: 'bribe-invalid',
      message: `Bribe amount must be positive (got ${cmd.amount})`,
      data: { ...cmd },
    });
    return state;
  }

  // The bribe is a standing retainer; its cost is realized per tick by the economy
  // (familyExpenses includes bribeLevel), so it is not deducted up front. Require the
  // family to be able to cover at least one tick of the new total retainer.
  const newTotal = sumBribes(family) + cmd.amount;
  if (family.cash < newTotal) {
    state.log.push({
      tick: state.tick,
      kind: 'bribe-denied',
      message: `${family.name} cannot sustain a $${newTotal} bribe ($${family.cash} cash)`,
      data: { ...cmd },
    });
    return state;
  }

  // Phase 13: the legacy bribe raises the Police channel.
  family.bribes.police += cmd.amount;
  recomputeBribeLevel(family);
  state.log.push({
    tick: state.tick,
    kind: 'bribe',
    message: `${family.name} raised its police bribe to ${family.bribes.police} (total ${family.bribeLevel})`,
    data: { familyId: family.id, amount: cmd.amount, channel: 'police', bribeLevel: family.bribeLevel },
  });
  return state;
}

function applySetBribe(state: GameState, cmd: SetBribeCommand): GameState {
  const family = findFamily(state, cmd.familyId);
  if (!family) {
    state.log.push({
      tick: state.tick,
      kind: 'bribe-invalid',
      message: `Invalid setBribe: family ${cmd.familyId} not found`,
      data: { ...cmd },
    });
    return state;
  }

  if (cmd.amount < 0) {
    state.log.push({
      tick: state.tick,
      kind: 'bribe-invalid',
      message: `Bribe amount cannot be negative (got ${cmd.amount})`,
      data: { ...cmd },
    });
    return state;
  }

  // Slider semantics: set the channel to an absolute amount. Raising the total requires
  // the family to be able to cover the new total retainer for a tick; lowering is free.
  const newTotal = sumBribes(family) - (family.bribes[cmd.channel] ?? 0) + cmd.amount;
  if (newTotal > family.bribeLevel && family.cash < newTotal) {
    state.log.push({
      tick: state.tick,
      kind: 'bribe-denied',
      message: `${family.name} cannot sustain a $${newTotal} total bribe ($${family.cash} cash)`,
      data: { ...cmd, newTotal },
    });
    return state;
  }

  family.bribes[cmd.channel] = cmd.amount;
  recomputeBribeLevel(family);
  state.log.push({
    tick: state.tick,
    kind: 'setBribe',
    message: `${family.name} set ${cmd.channel} bribe to ${cmd.amount} (total ${family.bribeLevel})`,
    data: { familyId: family.id, channel: cmd.channel, amount: cmd.amount, bribeLevel: family.bribeLevel },
  });
  return state;
}

function applyOrderHit(state: GameState, cmd: OrderHitCommand): GameState {
  const attacker = findFamily(state, cmd.attackerFamilyId);
  const target = findFamily(state, cmd.targetFamilyId);

  if (!attacker || !target) {
    state.log.push({
      tick: state.tick,
      kind: 'hit-invalid',
      message: `Invalid hit: attacker ${cmd.attackerFamilyId} or target ${cmd.targetFamilyId} not found`,
      data: { ...cmd },
    });
    return state;
  }

  if (attacker.id === target.id) {
    state.log.push({
      tick: state.tick,
      kind: 'hit-invalid',
      message: `${attacker.name} cannot hit itself`,
      data: { ...cmd },
    });
    return state;
  }

  if (!attacker.alive || !target.alive) {
    state.log.push({
      tick: state.tick,
      kind: 'hit-invalid',
      message: `Hit requires both families alive`,
      data: { ...cmd },
    });
    return state;
  }

  if (attacker.gangsters.length === 0) {
    state.log.push({
      tick: state.tick,
      kind: 'hit-denied',
      message: `${attacker.name} has no muscle to send`,
      data: { ...cmd },
    });
    return state;
  }

  state.pendingHits.push({
    attackerId: attacker.id,
    targetId: target.id,
    orderedTick: state.tick,
  });
  state.log.push({
    tick: state.tick,
    kind: 'hit-ordered',
    message: `${attacker.name} ordered a hit on ${target.name}`,
    data: { attackerId: attacker.id, targetId: target.id },
  });
  return state;
}

function applyLaunder(state: GameState, cmd: LaunderCommand): GameState {
  const family = findFamily(state, cmd.familyId);
  if (!family) {
    state.log.push({
      tick: state.tick,
      kind: 'launder-invalid',
      message: `Invalid launder: family ${cmd.familyId} not found`,
      data: { ...cmd },
    });
    return state;
  }

  if (cmd.amount <= 0) {
    state.log.push({
      tick: state.tick,
      kind: 'launder-invalid',
      message: `Launder amount must be positive (got ${cmd.amount})`,
      data: { ...cmd },
    });
    return state;
  }

  const capacity = launderCapacity(state, family.id);
  const effective = Math.min(cmd.amount, family.dirtyCash, capacity);
  if (effective <= 0) {
    state.log.push({
      tick: state.tick,
      kind: 'launder-denied',
      message: `${family.name} cannot launder (dirty $${family.dirtyCash}, capacity $${capacity})`,
      data: { ...cmd, capacity, dirtyCash: family.dirtyCash },
    });
    return state;
  }

  const fee = launderFee(effective);
  if (family.cash < fee) {
    state.log.push({
      tick: state.tick,
      kind: 'launder-denied',
      message: `${family.name} cannot cover the laundering fee ($${fee})`,
      data: { ...cmd, fee },
    });
    return state;
  }

  family.cash -= fee; // the fee leaves the economy (paid to launderers)
  family.dirtyCash -= effective; // that money is now clean
  clampDirty(family);

  state.log.push({
    tick: state.tick,
    kind: 'launder',
    message: `${family.name} laundered $${effective} (fee $${fee})`,
    data: {
      familyId: family.id,
      laundered: effective,
      fee,
      dirtyCash: family.dirtyCash,
      cleanCash: cleanCash(family),
    },
  });
  return state;
}

function applyCollect(state: GameState, cmd: CollectCommand): GameState {
  const family = findFamily(state, cmd.familyId);
  const district = state.districts.find((d) => d.id === cmd.districtId);

  if (!family || !district) {
    state.log.push({
      tick: state.tick,
      kind: 'collect-invalid',
      message: `Invalid collect: family ${cmd.familyId} or district ${cmd.districtId} not found`,
      data: { ...cmd },
    });
    return state;
  }

  const targets = collectibleBusinesses(state, family.id, district.id);
  const pending = targets.reduce((sum, b) => sum + uncollectedOf(b), 0);
  if (pending <= 0) {
    state.log.push({
      tick: state.tick,
      kind: 'collect-empty',
      message: `${family.name} has nothing to collect in ${district.name}`,
      data: { ...cmd },
    });
    return state;
  }

  // Risk: a seeded skim off the deterministic safe fraction (presence/heat vs. muscle).
  const muscle = muscleInDistrict(family, district.id);
  const safety = collectionSafety(district.policePresence, family.heat, muscle);
  const rng = new Rng(state.rngState);
  const roll = rng.nextFloat();
  state.rngState = rng.state;

  const fraction = collectionFraction(safety, roll);
  const collected = Math.floor(pending * fraction);
  const lost = pending - collected;

  // The run picks the businesses clean — what isn't collected is skimmed/robbed/gone.
  for (const b of targets) b.uncollected = 0;

  creditCrimeIncome(family, collected); // the take is dirty money
  addHeat(family, COLLECT_HEAT);

  state.log.push({
    tick: state.tick,
    kind: 'collect',
    message: `${family.name} collected $${collected} of $${pending} in ${district.name} (lost $${lost})`,
    data: {
      familyId: family.id,
      districtId: district.id,
      pending,
      collected,
      lost,
      safety,
    },
  });
  return state;
}

function applyUpgradeOperation(state: GameState, cmd: UpgradeOperationCommand): GameState {
  const family = findFamily(state, cmd.familyId);
  const found = findBusiness(state, cmd.businessId);

  if (!family || !found) {
    state.log.push({
      tick: state.tick,
      kind: 'upgrade-invalid',
      message: `Invalid upgrade: family ${cmd.familyId} or business ${cmd.businessId} not found`,
      data: { ...cmd },
    });
    return state;
  }

  const { business } = found;
  if (business.kind === 'front' || business.ownerFamily !== family.id) {
    state.log.push({
      tick: state.tick,
      kind: 'upgrade-invalid',
      message: `${business.name} is not an operation owned by ${family.name}`,
      data: { ...cmd },
    });
    return state;
  }

  const tier = tierOf(business);
  if (tier >= TIER_MAX) {
    state.log.push({
      tick: state.tick,
      kind: 'upgrade-maxed',
      message: `${business.name} is already at the maximum tier (${TIER_MAX})`,
      data: { ...cmd, tier },
    });
    return state;
  }

  const cost = upgradeCost(business.kind, tier);
  if (family.cash < cost) {
    state.log.push({
      tick: state.tick,
      kind: 'upgrade-denied',
      message: `${family.name} cannot afford to upgrade ${business.name} ($${family.cash} < $${cost})`,
      data: { ...cmd, cost, tier },
    });
    return state;
  }

  family.cash -= cost;
  clampDirty(family); // spending clean money first is realized by the clamp
  business.tier = tier + 1;
  state.log.push({
    tick: state.tick,
    kind: 'upgrade',
    message: `${family.name} upgraded ${business.name} to tier ${business.tier} for $${cost}`,
    data: { familyId: family.id, businessId: business.id, tier: business.tier, cost },
  });
  return state;
}

function applyRepayLoan(state: GameState, cmd: RepayLoanCommand): GameState {
  const family = findFamily(state, cmd.familyId);
  if (!family) {
    state.log.push({
      tick: state.tick,
      kind: 'repay-invalid',
      message: `Invalid repayLoan: family ${cmd.familyId} not found`,
      data: { ...cmd },
    });
    return state;
  }

  if (cmd.amount <= 0) {
    state.log.push({
      tick: state.tick,
      kind: 'repay-invalid',
      message: `Repay amount must be positive (got ${cmd.amount})`,
      data: { ...cmd },
    });
    return state;
  }

  const pay = Math.min(cmd.amount, family.debt, Math.max(0, family.cash));
  if (pay <= 0) {
    state.log.push({
      tick: state.tick,
      kind: 'repay-denied',
      message: `${family.name} cannot repay (debt $${family.debt}, cash $${family.cash})`,
      data: { ...cmd, debt: family.debt },
    });
    return state;
  }

  family.cash -= pay;
  family.debt -= pay;
  clampDirty(family);
  state.log.push({
    tick: state.tick,
    kind: 'repay',
    message: `${family.name} repaid $${pay} of debt (remaining ${family.debt})`,
    data: { familyId: family.id, repaid: pay, debt: family.debt },
  });
  return state;
}

/** Apply a single command, returning the (mutated) state. */
export function applyCommand(state: GameState, cmd: Command): GameState {
  switch (cmd.type) {
    case 'extort':
      return applyExtort(state, cmd);
    case 'establishOperation':
      return applyEstablishOperation(state, cmd);
    case 'recruitGangster':
      return applyRecruitGangster(state, cmd);
    case 'assignGangster':
      return applyAssignGangster(state, cmd);
    case 'expandControl':
      return applyExpandControl(state, cmd);
    case 'bribe':
      return applyBribe(state, cmd);
    case 'orderHit':
      return applyOrderHit(state, cmd);
    case 'launder':
      return applyLaunder(state, cmd);
    case 'collect':
      return applyCollect(state, cmd);
    case 'setBribe':
      return applySetBribe(state, cmd);
    case 'upgradeOperation':
      return applyUpgradeOperation(state, cmd);
    case 'repayLoan':
      return applyRepayLoan(state, cmd);
    default: {
      const _exhaustive: never = cmd;
      throw new Error(`Unknown command: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** Apply a sequence of commands in order. */
export function applyCommands(state: GameState, cmds: Command[]): GameState {
  for (const cmd of cmds) applyCommand(state, cmd);
  return state;
}
