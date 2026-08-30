// STATUS / INCIDENT VISIBILITY — one pure NO-X-RAY decision for the curated incident ledger.
// Hidden records never leave this module: callers receive the visible records plus one boolean saying
// only that some unconfirmed activity exists. The boolean deliberately carries no count, type, week,
// severity, summary, family, district or coordinates, so any number of hidden rival events collapses to
// the same public rumor.

import { districtsHeldBy, type GameState, type IncidentRecord, type IncidentType } from '../../sim';

const PLAYER_GLOBAL_INCIDENTS: ReadonlySet<IncidentType> = new Set([
  'settlement',
  'game_over',
  'federal_warning',
  'federal_warrant',
  'federal_cooldown',
  // These ledger categories are produced exclusively by explicit player actions or player-scoped
  // wrappers in the live sim (market.ts, vice.ts, offense.ts, events.ts, winpaths.ts).
  'market',
  'vice',
  'offense',
  'event',
  'civic',
]);

const PLAYER_INVOLVEMENT_KEYS = [
  'familyId',
  'newHolder',
  'oldHolder',
  'attackerId',
  'attackerFaction',
  'victimFamily',
  'victimFaction',
  'ownerFamily',
  'holderId',
  'invaderId',
  'defenderId',
  'byFamily',
] as const;

export type DistrictKnown = (districtId: string) => boolean;

/** Minimal scene-facing visibility seam. StatusVisibility and CityKnowledgeVisibility both satisfy it. */
export interface IncidentKnowledgeVisibility {
  districtScouted(districtId: string): boolean;
}

/** Player involvement is safe to disclose: every comparison is against the player's own family id. */
export function incidentInvolvesPlayer(record: IncidentRecord, playerId: string): boolean {
  const data = record.data ?? {};
  return PLAYER_INVOLVEMENT_KEYS.some((key) => data[key] === playerId);
}

/** A located rival incident is visible only when its district is known. Unlocated rival records stay hidden. */
export function incidentIsVisible(
  record: IncidentRecord,
  playerId: string,
  districtKnown: DistrictKnown,
): boolean {
  if (PLAYER_GLOBAL_INCIDENTS.has(record.type)) return true;
  // `shock` is shared by one global announcement plus per-family consequences. Only the announcement
  // carries `data.shock`; audit/seizure/raid consequences still require player involvement or scouting.
  if (record.type === 'shock' && typeof record.data?.shock === 'string') return true;
  if (incidentInvolvesPlayer(record, playerId)) return true;
  const districtId = typeof record.data?.districtId === 'string' ? record.data.districtId : undefined;
  return districtId !== undefined && districtKnown(districtId);
}

export interface IncidentVisibilityResult {
  /** Original records whose complete contents are player-knowable, in the caller's original order. */
  visible: IncidentRecord[];
  /** True for one or more hidden records. Intentionally no hidden-record count or metadata. */
  hasHiddenActivity: boolean;
}

/** Partition incidents without returning any hidden record or metadata about it. Pure and order-preserving. */
export function resolveIncidentVisibility(
  records: readonly IncidentRecord[],
  playerId: string,
  districtKnown: DistrictKnown,
): IncidentVisibilityResult {
  const visible: IncidentRecord[] = [];
  let hasHiddenActivity = false;
  for (const record of records) {
    if (incidentIsVisible(record, playerId, districtKnown)) visible.push(record);
    else hasHiddenActivity = true;
  }
  return { visible, hasHiddenActivity };
}

/**
 * Return only incidents the player may legitimately observe in scene surfaces such as The Wire and
 * beat detection. Unlike a status panel this intentionally emits no rumor placeholder: callers that
 * drive alerts, unread counts or audio must behave exactly as though hidden rival incidents do not exist.
 */
export function knowableIncidents(
  state: GameState,
  vis: IncidentKnowledgeVisibility,
): IncidentRecord[] {
  const held = new Set(districtsHeldBy(state, state.player.id).map((district) => district.id));
  return resolveIncidentVisibility(
    state.incidents,
    state.player.id,
    (districtId) => held.has(districtId) || vis.districtScouted(districtId),
  ).visible;
}
