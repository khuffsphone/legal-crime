// Fog-safe strategic view models for the always-on City HUD and its offensive shortcuts.
//
// The simulation is intentionally omniscient. The renderer is not. Every value returned here is either
// player-owned, earned/scouted, or explicitly marked unknown. Keeping this projection Phaser-free gives the
// NO-X-RAY invariant a behavioral test seam instead of relying on source scans and comments.

import {
  allBusinesses,
  businessEarner,
  controlOf,
  districtHolder,
  districtStatusOf,
  districtsHeldBy,
  dominanceCondition,
  goStraightCondition,
  hqIntegrityOf,
  mayorCondition,
  playerHomeFront,
  type DistrictHoldStatus,
  type GameState,
  type GridPos,
} from '../../sim';
import type { ControlStatus } from './minimapMath';

export interface CityKnowledgeVisibility {
  districtScouted(districtId: string): boolean;
  unitVisible(pos: GridPos): boolean;
  hqVisible(familyId: string): boolean;
  businessVisible(businessId: string): boolean;
  dossierSubjects?: ReadonlySet<string>;
  /** Debug-only veil lift. Production callers leave this false. */
  omniscient?: boolean;
}

/** A district is knowable when it has been scouted or the player has a direct stake there. */
export function districtKnownToPlayer(
  state: GameState,
  districtId: string,
  districtScouted: (districtId: string) => boolean,
): boolean {
  const d = state.districts.find((candidate) => candidate.id === districtId);
  if (!d) return false;
  if (districtScouted(districtId)) return true;
  if (controlOf(d, state.player.id) > 0) return true;
  if (d.businesses.some((business) => businessEarner(business) === state.player.id)) return true;
  // Every live Contest is an invasion of the player's turf, so its existence is player-owned information.
  return !!state.contests?.some((contest) => contest.districtId === districtId);
}

export interface FogSafeDistrictRow {
  id: string;
  name: string;
  known: boolean;
  status: DistrictHoldStatus | 'UNKNOWN';
  bizHeld: number | null;
  bizTotal: number | null;
  tag: string;
  pip: '●' | '◐' | '○' | '?';
}

/** Project the whole-city board without reading rival ownership through sealed fog. */
export function fogSafeCityRows(
  state: GameState,
  districtScouted: (districtId: string) => boolean,
  omniscient = false,
): FogSafeDistrictRow[] {
  return state.districts.map((district) => {
    const known = omniscient || districtKnownToPlayer(state, district.id, districtScouted);
    if (!known) {
      return {
        id: district.id,
        name: district.name,
        known: false,
        status: 'UNKNOWN',
        bizHeld: null,
        bizTotal: null,
        tag: 'unscouted',
        pip: '?',
      };
    }
    const row = districtStatusOf(state, district.id);
    if (!row) {
      return {
        id: district.id,
        name: district.name,
        known: true,
        status: 'UNKNOWN',
        bizHeld: null,
        bizTotal: null,
        tag: 'no report',
        pip: '?',
      };
    }
    return {
      id: row.id,
      name: row.name,
      known: true,
      status: row.status,
      bizHeld: row.bizHeld,
      bizTotal: row.bizTotal,
      tag: row.tag,
      pip: row.pip,
    };
  });
}

export interface FogSafeCitySummary {
  held: number;
  total: number;
  contested: number;
  rivalKnown: number;
  establishing: number;
  unknown: number;
}

export function fogSafeCitySummary(rows: readonly FogSafeDistrictRow[]): FogSafeCitySummary {
  return {
    held: rows.filter((row) => row.status === 'HELD').length,
    total: rows.length,
    contested: rows.filter((row) => row.status === 'CONTESTED').length,
    rivalKnown: rows.filter((row) => row.status === 'RIVAL').length,
    establishing: rows.filter((row) => row.status === 'ESTABLISHING').length,
    unknown: rows.filter((row) => !row.known).length,
  };
}

/** Hidden rival/contest/neutral truth collapses to the same soot fill. */
export function fogSafeDistrictControl(actual: ControlStatus, known: boolean): ControlStatus {
  return known ? actual : 'neutral';
}

/** Has the player legitimately learned that this rival exists as an actionable target? */
export function rivalKnownToPlayer(
  state: GameState,
  rivalId: string,
  visibility: CityKnowledgeVisibility,
): boolean {
  if (visibility.dossierSubjects?.has(rivalId)) return true;
  return rivalCurrentlyObservable(state, rivalId, visibility);
}

/** Current evidence, excluding aged dossier identity. Safe for live availability/death announcements. */
export function rivalCurrentlyObservable(
  state: GameState,
  rivalId: string,
  visibility: CityKnowledgeVisibility,
): boolean {
  if (visibility.omniscient) return true;
  if (visibility.hqVisible(rivalId)) return true;
  if (state.units.some((unit) => unit.factionId === rivalId && visibility.unitVisible(unit.pos))) return true;
  if (state.contests?.some((contest) => contest.invaderId === rivalId)) return true;
  return state.districts.some((district) =>
    districtKnownToPlayer(state, district.id, visibility.districtScouted)
    && (districtHolder(district) === rivalId || controlOf(district, rivalId) > 0));
}

export interface FogSafeRivalRow {
  familyId: string;
  name: string;
  line: string;
  knownHeld: number;
  exact: boolean;
}

/** Rival rows expose lower-bound scouted holdings, never an omniscient citywide total or secret weakness. */
export function fogSafeRivalRows(state: GameState, visibility: CityKnowledgeVisibility): FogSafeRivalRow[] {
  return state.rivals.map((rival) => {
    if (visibility.omniscient) {
      const held = districtsHeldBy(state, rival.id).length;
      const hq = Math.round(hqIntegrityOf(rival));
      const locked = (rival.lockoutTicks ?? 0) > 0 ? ' 🔒' : '';
      return {
        familyId: rival.id,
        name: rival.name,
        line: !rival.alive ? '† finished' : `${held} blk · HQ ${hq}%${locked}`,
        knownHeld: held,
        exact: true,
      };
    }

    const knownHeld = state.districts.filter((district) =>
      districtKnownToPlayer(state, district.id, visibility.districtScouted)
      && districtHolder(district) === rival.id).length;
    const contact = rivalKnownToPlayer(state, rival.id, visibility);
    const hq = visibility.hqVisible(rival.id) ? Math.round(hqIntegrityOf(rival)) : null;
    const dossier = visibility.dossierSubjects?.has(rival.id) ?? false;
    const locked = (rival.lockoutTicks ?? 0) > 0 ? ' · LOCKED BY YOU' : '';

    let line: string;
    if (!contact) line = 'UNKNOWN · scout or build dossier';
    else if (hq !== null) line = `${knownHeld > 0 ? `≥${knownHeld} scouted blk · ` : ''}HQ ${hq}%${locked}`;
    else if (knownHeld > 0) line = `≥${knownHeld} scouted blk · live strength unknown${locked}`;
    else if (dossier) line = `DOSSIER ON FILE · live strength unknown${locked}`;
    else line = `CONTACT · live strength unknown${locked}`;

    // A roster slot is harmless (the match advertises how many rival outfits exist), but its identity is
    // not. Until the player earns contact, never smuggle the live family name into the render view-model.
    return { familyId: rival.id, name: contact ? rival.name : 'Unknown outfit', line, knownHeld, exact: false };
  });
}

/** Player-owned trajectory only. It never compares the player against hidden rival power. */
export function playerCityLine(state: GameState): string {
  const held = districtsHeldBy(state, state.player.id).length;
  const total = state.districts.length;
  const home = playerHomeFront(state);
  if (held > 0) {
    const target = Math.ceil(total * 0.6);
    const need = Math.max(0, target - held);
    return `Your outfit holds ${held}/${total} — ${need} more block${need === 1 ? '' : 's'} to dominance.`;
  }
  if (home) return `${home.districtName} is your corner — build ${home.needed} more control to lock it down.`;
  return 'No block secured — establish a corner and scout the city.';
}

export interface FogSafeVictoryRow {
  id: 'last-standing' | 'dominance' | 'go-straight' | 'mayor';
  label: string;
  pct: number | null;
  read: string;
}

/** Three paths are entirely player-owned. Last-standing stays unknown until the match actually resolves. */
export function fogSafeVictoryRows(state: GameState): FogSafeVictoryRow[] {
  const dominance = dominanceCondition(state);
  const straight = goStraightCondition(state);
  const mayor = mayorCondition(state);
  return [
    { id: 'last-standing', label: 'LAST STANDING', pct: null, read: 'rival status requires scouting and dossiers.' },
    { id: 'dominance', label: dominance.label, pct: dominance.pct, read: dominance.read },
    { id: 'go-straight', label: straight.label, pct: straight.pct, read: straight.read },
    { id: 'mayor', label: mayor.label, pct: mayor.pct, read: mayor.read },
  ];
}

export interface FogSafeCompass {
  line: string;
  urgent: boolean;
}

export interface FogSafeHudPhase {
  phase: 'ESTABLISH' | 'FIRST BLOOD' | 'CONTEST' | 'DECAPITATE';
  read: string;
}

/** Match-stage copy driven only by player-owned progress; hidden rival weakness cannot change it. */
export function fogSafeHudPhase(state: GameState): FogSafeHudPhase {
  const held = districtsHeldBy(state, state.player.id).length;
  if (held === 0) return { phase: 'ESTABLISH', read: 'Extort the neighbourhood — build income before any war.' };
  const ownPeak = fogSafeVictoryRows(state)
    .reduce((peak, row) => row.pct === null ? peak : Math.max(peak, row.pct), 0);
  if (ownPeak >= 80) return { phase: 'DECAPITATE', read: 'One of your victory paths is close — make the finishing move.' };
  return held >= 2
    ? { phase: 'CONTEST', read: 'A real turf war — hold your blocks and take scouted rival ground.' }
    : { phase: 'FIRST BLOOD', read: 'Your corner is secure — scout before striking a rival.' };
}

/** Compass uses only the player's paths, own HQ, and attacks on the player's turf. */
export function fogSafeCompass(state: GameState): FogSafeCompass {
  const paths = fogSafeVictoryRows(state).filter((row): row is FogSafeVictoryRow & { pct: number } => row.pct !== null);
  const best = paths.reduce((a, b) => (b.pct > a.pct ? b : a));
  const hqDamage = Math.round(100 - hqIntegrityOf(state.player));
  const contests = state.contests?.length ?? 0;
  const urgent = hqDamage >= 40 || contests > 0;
  const threat = hqDamage >= 40
    ? `your HQ is ${hqDamage}% damaged`
    : contests > 0
      ? `${contests} block${contests === 1 ? '' : 's'} under attack`
      : 'rival strength unknown — scout the city';
  return { line: `▸ ${best.label} ${best.pct}%   ·   ${urgent ? '⚠ ' : ''}${threat}`, urgent };
}

export interface KnownOffenseTargets {
  raidDistrictId: string | null;
  sabotageBusinessId: string | null;
  rivalId: string | null;
}

/** One shared target resolver for command execution and every READY/LOCKED UI surface. */
export function knownOffenseTargets(state: GameState, visibility: CityKnowledgeVisibility): KnownOffenseTargets {
  const raidDistrict = state.districts.find((district) => {
    if (!districtKnownToPlayer(state, district.id, visibility.districtScouted)) return false;
    const holder = districtHolder(district);
    return (!!holder && holder !== state.player.id)
      || Object.entries(district.control).some(([familyId, value]) => familyId !== state.player.id && value > 0);
  });
  const sabotageBusiness = allBusinesses(state).find((business) => {
    const earner = businessEarner(business);
    return !!earner && earner !== state.player.id && visibility.businessVisible(business.id);
  });
  // A dossier proves identity, not live status. Requiring current observable evidence keeps an off-screen
  // death from toggling HIT/LOCKOUT availability through an aged dossier.
  const rival = state.rivals.find((candidate) => candidate.alive && rivalCurrentlyObservable(state, candidate.id, visibility));
  return {
    raidDistrictId: raidDistrict?.id ?? null,
    sabotageBusinessId: sabotageBusiness?.id ?? null,
    rivalId: rival?.id ?? null,
  };
}
