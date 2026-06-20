// RTS-14 — crew loyalty events, interpersonal ties, and the crew readout. Pure & deterministic;
// imports NO Phaser. Extends (does not replace) the existing per-member loyalty + mutiny system:
// events the sim already produces shift individual loyalties, a light ties layer propagates a
// wrong done to one member onto their allies/rivals, and low individual loyalty feeds the
// existing desertion/mutiny spiral. All additive — a trait/tie-less crew behaves exactly as before.

import { DESERT_LOYALTY, LOYALTY_MAX, LOYALTY_MIN } from './constants';
import { LOYAL_DRIFT_SHIELD, hasTrait } from './traits';
import type { Family } from './types';

/** Crew-morale events the sim already produces; each shifts member loyalty. */
export type LoyaltyEvent = 'paid' | 'unpaid' | 'score' | 'robbed' | 'memberKilled' | 'overworked';

/** Loyalty delta per event (before trait shields / tie propagation). */
export const LOYALTY_EVENT_DELTA: Record<LoyaltyEvent, number> = {
  paid: 2,
  unpaid: -5,
  score: 4, // a successful collection lands — morale up
  robbed: -8, // a run lost to an ambush — morale down
  memberKilled: -6, // a crewmate killed — the crew shaken
  overworked: -3,
};

/** A directed-but-symmetric tie between two crew members. */
export interface CrewTie {
  a: string;
  b: string;
  kind: 'ally' | 'rival';
}

/** How much of a wrong done to one member spills onto a tied ally (rival gets the opposite). */
export const TIE_PROPAGATION = 0.5;

export type LoyaltyStatus = 'loyal' | 'wavering' | 'disloyal';

/** A readable loyalty band: loyal (≥60), wavering (≥ desertion line), disloyal (below it). */
export function loyaltyStatus(loyalty: number): LoyaltyStatus {
  if (loyalty >= 60) return 'loyal';
  if (loyalty >= DESERT_LOYALTY) return 'wavering';
  return 'disloyal';
}

function clampLoyalty(v: number): number {
  return v < LOYALTY_MIN ? LOYALTY_MIN : v > LOYALTY_MAX ? LOYALTY_MAX : v;
}

/** Ties involving `gangsterId`. */
export function tiesOf(family: Family, gangsterId: string): CrewTie[] {
  return (family.ties ?? []).filter((t) => t.a === gangsterId || t.b === gangsterId);
}

/** Apply a raw loyalty delta directly to one member (clamped). No trait shield, no propagation. */
function bump(family: Family, gangsterId: string, delta: number): void {
  const g = family.gangsters.find((x) => x.id === gangsterId);
  if (g) g.loyalty = clampLoyalty(g.loyalty + delta);
}

/**
 * Propagate a wrong/right done to `gangsterId` onto its ties (one hop, no recursion): an ALLY
 * feels a fraction of the same delta, a RIVAL feels the opposite. Pure.
 */
export function propagateTie(family: Family, gangsterId: string, delta: number): void {
  for (const tie of tiesOf(family, gangsterId)) {
    const other = tie.a === gangsterId ? tie.b : tie.a;
    const share = Math.round(delta * TIE_PROPAGATION);
    if (share === 0) continue;
    bump(family, other, tie.kind === 'ally' ? share : -share);
  }
}

/**
 * Shift ONE member's loyalty by `delta` (Loyal softens negatives), then propagate to its ties.
 * Used for member-specific events (a crewmate killed). Pure.
 */
export function adjustMemberLoyalty(family: Family, gangsterId: string, delta: number): void {
  const g = family.gangsters.find((x) => x.id === gangsterId);
  if (!g) return;
  let d = delta;
  if (d < 0 && hasTrait(g, 'loyal')) d = Math.min(0, d + LOYAL_DRIFT_SHIELD);
  g.loyalty = clampLoyalty(g.loyalty + d);
  propagateTie(family, gangsterId, delta);
}

/**
 * Apply a CREW-WIDE morale event (paid/unpaid/score/robbed/overworked) to every member, with
 * Loyal members shielded from losses. Crew-wide events do not propagate ties (they already hit
 * everyone). Returns the family for chaining. Pure.
 */
export function applyCrewLoyaltyEvent(family: Family, event: LoyaltyEvent): Family {
  const delta = LOYALTY_EVENT_DELTA[event];
  for (const g of family.gangsters) {
    let d = delta;
    if (d < 0 && hasTrait(g, 'loyal')) d = Math.min(0, d + LOYAL_DRIFT_SHIELD);
    g.loyalty = clampLoyalty(g.loyalty + d);
  }
  return family;
}

/** Note a crewmate's death: their tied allies lose heart (rivals are unmoved or relieved). Call
 * before the member is removed so the tie still resolves. Pure. */
export function propagateMemberLoss(family: Family, gangsterId: string): void {
  propagateTie(family, gangsterId, LOYALTY_EVENT_DELTA.memberKilled);
}

export interface CrewMemberReadout {
  id: string;
  name: string;
  skill: number;
  loyalty: number;
  status: LoyaltyStatus;
  traitLabels: string[];
  upkeep: number;
  assignment: string;
  ties: CrewTie[];
}

/** A readable, sorted (most disloyal first) snapshot of a family's crew for the HUD. */
export function crewReadout(family: Family): CrewMemberReadout[] {
  const rows = family.gangsters.map((g) => ({
    id: g.id,
    name: g.name,
    skill: g.skill,
    loyalty: g.loyalty,
    status: loyaltyStatus(g.loyalty),
    traitLabels: (g.traits ?? []).map((t) => t[0].toUpperCase() + t.slice(1)),
    upkeep: g.upkeep,
    assignment: g.assignment.type,
    ties: tiesOf(family, g.id),
  }));
  return rows.sort((a, b) => a.loyalty - b.loyalty);
}
