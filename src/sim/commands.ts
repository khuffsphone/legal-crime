// Command system. All player/rival actions are expressed as Commands and applied through
// applyCommand(state, cmd), the single deterministic entry point for state mutation
// outside of tick(). Stochastic commands draw from the seeded RNG cursor on state and
// write the advanced cursor back, preserving determinism.
//
// Pure — no Phaser, no browser globals.

import {
  CONTEST_REDUCTION,
  CONTROL_MAX,
  EXPAND_BASE_GAIN,
  EXPAND_COST,
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
} from './constants';
import { GANGSTER_NAMES } from './gangsters';
import { Rng } from './rng';
import { controlOf, topRivalControl } from './territory';
import {
  findFamily,
  findGangster,
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

/** Phase 6: raise a family's standing bribe (a per-tick retainer that buys protection). */
export interface BribeCommand {
  type: 'bribe';
  familyId: string;
  amount: number;
}

/** Phase 8: order a hit; queued and resolved at the next tick (conflict step). */
export interface OrderHitCommand {
  type: 'orderHit';
  attackerFamilyId: string;
  targetFamilyId: string;
}

/** Union of all commands. Extended in later phases. */
export type Command =
  | ExtortCommand
  | EstablishOperationCommand
  | RecruitGangsterCommand
  | AssignGangsterCommand
  | ExpandControlCommand
  | BribeCommand
  | OrderHitCommand;

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
 * Probability an extortion attempt succeeds: control/100 plus a muscle bonus, clamped to
 * [0, 1]. With full control (100) and no muscle the chance is exactly 1 (guaranteed); the
 * muscle term lets weaker footholds still push toward success.
 */
export function extortSuccessChance(
  state: GameState,
  familyId: string,
  businessId: string,
): number {
  const found = findBusiness(state, businessId);
  if (!found) return 0;
  const control = controlOf(found.district, familyId);
  const muscle = (() => {
    const fam = findFamily(state, familyId);
    return fam ? muscleInDistrict(fam, found.district.id) : 0;
  })();
  const raw = control / 100 + 0.04 * muscle;
  return raw < 0 ? 0 : raw > 1 ? 1 : raw;
}

function addHeat(family: Family, amount: number): void {
  family.heat = Math.min(HEAT_MAX, family.heat + amount);
}

function applyExtort(state: GameState, cmd: ExtortCommand): GameState {
  const family = findFamily(state, cmd.familyId);
  const found = findBusiness(state, cmd.businessId);

  if (!family || !found) {
    state.log.push({
      tick: state.tick,
      kind: 'extort-invalid',
      message: `Invalid extort: family ${cmd.familyId} or business ${cmd.businessId} not found`,
      data: { ...cmd },
    });
    return state;
  }

  const { business, district } = found;

  if (business.kind !== 'front') {
    state.log.push({
      tick: state.tick,
      kind: 'extort-invalid',
      message: `${business.name} is not a front and cannot be extorted`,
      data: { ...cmd },
    });
    return state;
  }

  if (business.extortedBy === family.id) {
    state.log.push({
      tick: state.tick,
      kind: 'extort-invalid',
      message: `${family.name} already extorts ${business.name}`,
      data: { ...cmd },
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
      data: { ...cmd, control },
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
      data: { ...cmd, chance },
    });
  } else {
    state.log.push({
      tick: state.tick,
      kind: 'extort-fail',
      message: `${family.name} failed to extort ${business.name} in ${district.name}`,
      data: { ...cmd, chance },
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

  const gangster = {
    id: `${family.id}-g-${family.gangsters.length}`,
    name,
    skill,
    loyalty,
    upkeep: skill * GANGSTER_UPKEEP_PER_SKILL,
    assignment: { type: 'idle' as const },
  };
  family.gangsters.push(gangster);

  state.log.push({
    tick: state.tick,
    kind: 'recruit',
    message: `${family.name} recruited ${name} (skill ${skill}, loyalty ${loyalty})`,
    data: { familyId: family.id, gangsterId: gangster.id, skill, loyalty },
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
  // family to be able to cover at least one tick of the new retainer.
  if (family.cash < cmd.amount) {
    state.log.push({
      tick: state.tick,
      kind: 'bribe-denied',
      message: `${family.name} cannot sustain a $${cmd.amount} bribe ($${family.cash} cash)`,
      data: { ...cmd },
    });
    return state;
  }

  family.bribeLevel += cmd.amount;
  state.log.push({
    tick: state.tick,
    kind: 'bribe',
    message: `${family.name} raised its bribe to ${family.bribeLevel}`,
    data: { familyId: family.id, amount: cmd.amount, bribeLevel: family.bribeLevel },
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
