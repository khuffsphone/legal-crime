// Bind the real-time map body to the persistent strategic crew member it embodies. This module is
// pure and additive: old v1 saves have no gangsterId, so load can deterministically backfill links
// without renaming heavily-referenced map-unit ids or invalidating the save schema.

import type { MovableUnit } from './movement';
import type { GameState, Gangster } from './types';

const LEGACY_STARTER_LINKS: Readonly<Record<string, string>> = {
  'muscle-1': 'player-g-0',
  'muscle-2': 'player-g-1',
};

/** Resolve a roster member for a map unit. Explicit links win; same-id links support newer callers. */
export function crewMemberForUnit<T extends Pick<Gangster, 'id'>>(
  family: { gangsters: readonly T[] },
  unit: Pick<MovableUnit, 'id' | 'gangsterId'>,
): T | undefined {
  const members = family.gangsters;
  if (unit.gangsterId) {
    const linked = members.find((member) => member.id === unit.gangsterId);
    if (linked) return linked;
  }
  return members.find((member) => member.id === unit.id);
}

/**
 * Repair player fighter links in an older save. Valid unique links are preserved; remaining live
 * fighters are paired with remaining roster members in stable array order. Collectors are never
 * linked to gangsters. Surplus unlinked fighters in a malformed legacy save are discarded: without
 * a roster identity they are not a valid player actor. Returns the number of repairs performed.
 */
export function bindLegacyPlayerCrewUnits(state: GameState): number {
  const roster = state.player.gangsters;
  const rosterIds = new Set(roster.map((member) => member.id));
  const fighters = state.units.filter(
    (unit) => unit.factionId === state.player.id && unit.role !== 'collector' && !unit.downed,
  );
  const used = new Set<string>();
  const pending: MovableUnit[] = [];
  let changed = 0;

  for (const unit of fighters) {
    const candidate = unit.gangsterId && rosterIds.has(unit.gangsterId)
      ? unit.gangsterId
      : rosterIds.has(unit.id)
        ? unit.id
        : rosterIds.has(LEGACY_STARTER_LINKS[unit.id])
          ? LEGACY_STARTER_LINKS[unit.id]
          : undefined;
    if (candidate && !used.has(candidate)) {
      if (unit.gangsterId !== candidate) { unit.gangsterId = candidate; changed++; }
      used.add(candidate);
    } else {
      pending.push(unit);
    }
  }

  const available = roster.filter((member) => !used.has(member.id));
  for (let i = 0; i < pending.length && i < available.length; i++) {
    const unit = pending[i];
    const member = available[i];
    if (unit.gangsterId !== member.id) { unit.gangsterId = member.id; changed++; }
    if (unit.skill === undefined) unit.skill = member.skill;
  }

  const surplusIds = new Set(pending.slice(available.length).map((unit) => unit.id));
  if (surplusIds.size > 0) {
    state.units = state.units.filter((unit) => !surplusIds.has(unit.id));
    changed += surplusIds.size;
  }

  // An explicit/same-id link from an older save may still lack the roster member's combat skill.
  for (const unit of fighters) {
    const member = crewMemberForUnit<Gangster>(state.player, unit);
    if (member && unit.skill === undefined) unit.skill = member.skill;
  }
  return changed;
}

/** A linked field casualty is permanent in the current rules (there is no recovery system). Remove the
 * same member from the strategic roster and clear ties that reference them. */
export function removeCrewMemberForUnit(
  family: GameState['player'],
  unit: Pick<MovableUnit, 'id' | 'gangsterId'>,
): Gangster | undefined {
  const member = crewMemberForUnit<Gangster>(family, unit);
  if (!member) return undefined;
  family.gangsters = family.gangsters.filter((candidate) => candidate.id !== member.id);
  if (family.ties) family.ties = family.ties.filter((tie) => tie.a !== member.id && tie.b !== member.id);
  return member;
}

/** Linked map bodies whose strategic member has already left via mutiny/abstract conflict. */
export function orphanedPlayerCrewUnitIds(state: GameState): string[] {
  const rosterIds = new Set(state.player.gangsters.map((member) => member.id));
  return state.units
    .filter((unit) =>
      unit.factionId === state.player.id && unit.role !== 'collector' && !!unit.gangsterId && !rosterIds.has(unit.gangsterId),
    )
    .map((unit) => unit.id);
}
