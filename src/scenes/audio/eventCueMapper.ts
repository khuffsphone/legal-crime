// eventCueMapper.ts — AUDIO E-H, Ticket F1: the pure VERIFIED event→cue mapper. Phaser-free; reads sim
// OUTPUTS only (state.log slices, realtime wrapper event arrays, processCollectorArrivals deposits) and
// mutates nothing. Emits EventCueIntent records; playback is the (deferred) H3 adapter's job.
//
// F.1 law, bound to the LIVE shapes (recon-verified):
// - log kind 'raid' is the PLAYER's offensive operation (ledger type 'offense') → player_offense_raid.
//   It is NEVER police-coded. The police trio comes ONLY from 'raid-cash' / 'raid-operation' / 'raid-bust'.
// - Police raid log entries carry data.familyId. They map ONLY when that exact id is the player;
//   missing/malformed ownership fails closed so an off-screen rival raid can never become an audio
//   reveal. federal tiers route through audioMap.federalCueKey (never hardcoded per-tier keys here);
//   'fed-cooldown' → federal_cooldown and 'fed-armed' → federal_armed are explicit new keys.
// - InterceptionEvent carries NO tile (verified) → interception_collector_robbed is NEVER positional.
// - Collector beats come from processCollectorArrivals' DepositEvent[] — NEVER from the realtime
//   wrapper's arrivedUnitIds (which no consumer reads). DepositEvent yields RIVAL collectors too
//   (IsoScene:1909 precedent) → player-only here.
// - EmbodiedExtortionEvent outcomes are EXHAUSTIVE: kind ('shakedown'|'sabotage') × outcome
//   (converted|retook|sabotaged|failed) → 8 keys. The event carries no tile; a cue is positional ONLY
//   when the caller supplies a tile resolver (e.g. the front's tile) — no tile, no positional intent.
// - Combat SFX are NOT remapped (the shipped per-weapon path owns them); F only exposes the combat
//   DUCKING side-chain trigger for H.

import type { DepositEvent, EmbodiedExtortionEvent, GameEvent, GridPos, InterceptionEvent } from '../../sim';
import { federalCueKey } from '../audioMap';
import { cuePriority } from './atmosphereIntents';

/** One mapped event cue (pre-governance). `dedupeKey` is the H.4 duplicate-cooldown identity. */
export interface EventCueIntent {
  key: string;
  priority: number;
  positional: boolean;
  tile?: GridPos;
  source: string;
  dedupeKey: string;
}

function cue(key: string, source: string, dedupeKey: string, tile?: GridPos): EventCueIntent {
  return {
    key,
    priority: cuePriority(key),
    positional: tile !== undefined,
    ...(tile !== undefined ? { tile } : {}),
    source,
    dedupeKey,
  };
}

/** Extract an explicit tile from a log event's data payload — positional ONLY on verified fields. */
function tileOfLogEvent(e: GameEvent): GridPos | undefined {
  const gx = e.data?.gx, gy = e.data?.gy;
  return typeof gx === 'number' && typeof gy === 'number' ? { gx, gy } : undefined;
}

// ── state.log slice (caller passes the NEW entries — cursor pattern) ─────────────────────────────
export function mapLogEvents(entries: readonly GameEvent[], playerFamilyId: string): EventCueIntent[] {
  const out: EventCueIntent[] = [];
  for (const e of entries) {
    switch (e.kind) {
      case 'raid': // the PLAYER's offensive op — never police-coded
        out.push(cue('player_offense_raid', 'log:raid', 'evt:player_offense_raid', tileOfLogEvent(e)));
        break;
      case 'raid-cash':
        if (e.data?.familyId !== playerFamilyId) break;
        out.push(cue('police_raid_cash', 'log:raid-cash', 'evt:police_raid_cash'));
        break;
      case 'raid-operation':
        if (e.data?.familyId !== playerFamilyId) break;
        out.push(cue('police_raid_operation', 'log:raid-operation', 'evt:police_raid_operation'));
        break;
      case 'raid-bust':
        if (e.data?.familyId !== playerFamilyId) break;
        out.push(cue('police_raid_bust', 'log:raid-bust', 'evt:police_raid_bust'));
        break;
      case 'fed-warning': {
        const tier = typeof e.data?.tier === 'number' ? e.data.tier : 1;
        // through the SHIPPED tier→clip mapping — never hardcoded here (F.4 federal reuse).
        out.push(cue(federalCueKey(tier), 'log:fed-warning', `evt:fed:${tier}`));
        break;
      }
      case 'fed-cooldown':
        out.push(cue('federal_cooldown', 'log:fed-cooldown', 'evt:federal_cooldown'));
        break;
      case 'fed-armed':
        out.push(cue('federal_armed', 'log:fed-armed', 'evt:federal_armed'));
        break;
      default:
        break; // every other kind is silent in F (combat/economy feedback owned elsewhere)
    }
  }
  return out;
}

// ── extortion transitions (exhaustive kind × outcome; positional only via a supplied tile) ────────
export type ExtortionOutcome = 'converted' | 'retook' | 'sabotaged' | 'failed';

/** The single outcome of one transition event, in flag-precedence order; null while in progress. */
export function extortionOutcome(ev: EmbodiedExtortionEvent): ExtortionOutcome | null {
  if (ev.converted) return 'converted';
  if (ev.retook) return 'retook';
  if (ev.sabotaged) return 'sabotaged';
  if (ev.failed) return 'failed';
  return null;
}

export function mapExtortionEvents(
  events: readonly EmbodiedExtortionEvent[],
  tileOfFront?: (frontId: string) => GridPos | undefined,
): EventCueIntent[] {
  const out: EventCueIntent[] = [];
  for (const ev of events) {
    const outcome = extortionOutcome(ev);
    if (outcome === null) continue; // in-progress state churn is silent
    const key = `extortion_${ev.kind}_${outcome}`;
    const tile = tileOfFront ? tileOfFront(ev.frontId) : undefined;
    // dedupe identity carries kind+outcome: two DIFFERENT extortion results on the same front inside the
    // duplicate window (e.g. thug A's shakedown fails, thug B's sabotage lands 0.8 s later) are distinct
    // sounds, not spam — only a repeat of the SAME outcome on the same front is suppressed.
    out.push(cue(key, `extortion:${ev.kind}:${outcome}`, `evt:extortion:${ev.frontId}:${ev.kind}:${outcome}`, tile));
  }
  return out;
}

// ── interceptions (NEVER positional — the event has no tile) ─────────────────────────────────────
export function mapInterceptions(events: readonly InterceptionEvent[], playerFamilyId: string): EventCueIntent[] {
  const out: EventCueIntent[] = [];
  for (const ev of events) {
    if (ev.victimFaction !== playerFamilyId) continue; // rival-vs-rival / own-ambush: silent in F1
    out.push(cue('interception_collector_robbed', 'interception:robbed', 'evt:interception'));
  }
  return out;
}

// ── collector beats (source: processCollectorArrivals — NEVER arrivedUnitIds) ────────────────────
/** DepositEvent has no tile and includes rivals; map PLAYER deposits only (NO-X-RAY precedent
 * IsoScene:1909). The live processCollectorArrivals emits only banked deposits; a distinct ARRIVAL
 * beat has no source yet, so `arrivals` is an explicit optional input for when the scene supplies one
 * — the key stays registered and mapped, but nothing fakes it from arrivedUnitIds. */
export function mapCollectorBeats(
  deposits: readonly DepositEvent[],
  playerFamilyId: string,
  arrivals: readonly { collectorId: string; familyId: string }[] = [],
): EventCueIntent[] {
  const out: EventCueIntent[] = [];
  for (const a of arrivals) {
    if (a.familyId !== playerFamilyId) continue;
    out.push(cue('collector_arrival', 'collector:arrival', 'evt:collector_arrival'));
  }
  for (const d of deposits) {
    if (d.familyId !== playerFamilyId || d.banked <= 0) continue;
    out.push(cue('collector_deposit', 'collector:deposit', 'evt:collector_deposit'));
  }
  return out;
}

// ── combat: ducking side-chain ONLY (the shipped per-weapon SFX path is untouched by E-H) ─────────
/** True when this frame's combat beats should trigger the H.2 combat duck. Never emits a cue. */
export function combatDuckTriggered(combatEventCount: number): boolean {
  return combatEventCount > 0;
}
