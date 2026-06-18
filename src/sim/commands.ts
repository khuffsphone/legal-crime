// Command system. All player/rival actions are expressed as Commands and applied through
// applyCommand(state, cmd), the single deterministic entry point for state mutation
// outside of tick(). Stochastic commands draw from the seeded RNG cursor on state and
// write the advanced cursor back, preserving determinism.
//
// Pure — no Phaser, no browser globals.

import {
  EXTORT_HEAT,
  EXTORT_MIN_CONTROL,
  HEAT_MAX,
  OPERATION_COST,
  OPERATION_HEAT,
  OPERATION_INCOME,
} from './constants';
import { Rng } from './rng';
import {
  findFamily,
  type Business,
  type District,
  type Family,
  type GameState,
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

/** Union of all commands. Extended in later phases. */
export type Command = ExtortCommand | EstablishOperationCommand;

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

/** A family's control points in a district (0 if none). */
export function controlOf(district: District, familyId: string): number {
  return district.control[familyId] ?? 0;
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

/** Apply a single command, returning the (mutated) state. */
export function applyCommand(state: GameState, cmd: Command): GameState {
  switch (cmd.type) {
    case 'extort':
      return applyExtort(state, cmd);
    case 'establishOperation':
      return applyEstablishOperation(state, cmd);
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
