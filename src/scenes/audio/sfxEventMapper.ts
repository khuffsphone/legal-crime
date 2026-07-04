// sfxEventMapper.ts — AUDIO ATMOSPHERE lane, Ticket B: map the sim's REAL event outputs to audio-cue
// DESCRIPTORS. Pure, Phaser-free, read-only — it consumes the realtime wrapper's outputs and state.log
// entries and MUTATES NOTHING (/src/sim, tick(), applyCommand() untouched). Nothing here plays a sound;
// a descriptor is a decision record the gate (Ticket C) filters and the queue (Ticket D) schedules.
//
// BOUND TO THE LIVE SHAPES (Phase-1 recon, not the spec's assumptions):
// - UpdateResult { weeksFired, arrivedUnitIds, interceptions, combat, extortion } (src/sim/realtime.ts)
// - CombatEvent { kind:'hit'|'down', attackerId, unitId, faction, gx, gy, weapon? }   → positional (local)
// - InterceptionEvent { attackerId, collectorId, attackerFaction, victimFaction, amount } — ⚠ carries NO
//   tile, so it can never be a positional cue. Only PLAYER-involving interceptions map (own collector
//   robbed / own ambush landed); a rival-vs-rival robbery emits NOTHING (NO-X-RAY Rule 2: a hidden
//   rival's activity makes no sound — and with no tile we could not gate it anyway).
// - EmbodiedExtortionEvent { …, kind, converted, retook, sabotaged, failed } → player-ISSUED acts (global)
// - EndgameResult { status, kind: 'win-…'|'lose-…', message } → the win/lose stings
// - state.log GameEvent { tick, kind, message, data? } → federal ladder / mutiny / raids / HQ strikes.
//   The caller passes ONLY the NEW log slice (cursor pattern, exactly like ledger.harvestIncidents);
//   this module never tracks state. Log kinds that duplicate a wrapper output (e.g. 'interception',
//   'extort-success') are deliberately NOT mapped here — the wrapper path owns them (richer shape), and
//   Ticket D's cooldown keys are the backstop against any double-fire.
// - Arrivals (arrivedUnitIds) are validated as a source but UNMAPPED in the MVP — the cause/effect table
//   has no arrival cue (footsteps are a future, gated lane).
//
// Reuses the shipped key logic instead of duplicating it: weaponFeedback.hitSfxKey (the 6 contract hit
// keys), weaponAttackPose.rigAttackWeaponFromTier, audioMap.federalCueKey (NOTICE/WATCH/RAID clips).

import type {
  CombatEvent, EmbodiedExtortionEvent, EndgameResult, GameEvent, GridPos, InterceptionEvent, UpdateResult,
} from '../../sim';
import { hitSfxKey } from '../weaponFeedback';
import { rigAttackWeaponFromTier } from '../weaponAttackPose';
import { federalCueKey } from '../audioMap';
import { cueMeta, type AudioCueMeta, type MvpCueKey } from './atmosphereSpine';

/** One mapped cue decision — the shared currency of Tickets B → C → D. */
export interface AudioCueDescriptor extends AudioCueMeta {
  /** Clip key (the Ticket-A MVP vocabulary). */
  key: MvpCueKey;
  /** Dedupe identity for Ticket D's cooldown window (same key ⇒ same spam source). */
  cooldownKey: string;
  /** World tile for a LOCAL cue — REQUIRED for spatial 'local' (the gate suppresses a local cue
   * without one, defensively). Absent for global/hud cues: no tile means nothing to leak. */
  pos?: GridPos;
  /** Provenance — which sim event produced this (diagnostics / ?debugaudio). */
  source: string;
}

/** Build a descriptor for an MVP key (meta looked up from the spine — single source of truth). */
export function cueFor(key: MvpCueKey, cooldownKey: string, source: string, pos?: GridPos): AudioCueDescriptor {
  const meta = cueMeta(key)!; // total over MvpCueKey by construction
  return { key, ...meta, cooldownKey, source, ...(pos ? { pos } : {}) };
}

// ── realtime wrapper outputs ────────────────────────────────────────────────────────────────────

/** Combat beats → per-weapon hit reports + the downed thud. POSITIONAL (spatial 'local' with the struck
 * tile) — Ticket C gates them through the render's own reveal predicate, so a fogged/off-screen fight
 * stays silent. Keys come from the shipped WEAPON_HIT_SFX contract (no duplicate table). */
export function mapCombatEvents(events: readonly CombatEvent[]): AudioCueDescriptor[] {
  const out: AudioCueDescriptor[] = [];
  for (const ev of events) {
    const pos: GridPos = { gx: ev.gx, gy: ev.gy };
    if (ev.kind === 'down') {
      // the audio colour law: downed = a DULL thud, never a kill flourish.
      out.push(cueFor('sfx_down_thud', 'down', 'combat:down', pos));
    } else {
      const weapon = rigAttackWeaponFromTier(ev.weapon);
      out.push(cueFor(hitSfxKey(weapon) as MvpCueKey, `hit:${weapon}`, 'combat:hit', pos));
    }
  }
  return out;
}

/** Ambush resolutions → a report ONLY when the PLAYER is involved (own collector robbed, or own ambush
 * landed). Rival-vs-rival interceptions emit NOTHING — the event carries no tile (recon finding), so it
 * cannot be reveal-gated; silence is the only NO-X-RAY-safe mapping, and it matches the cause/effect
 * table ("collector robbed (YOURS)"). Player-involving cues are global (the player's own information). */
export function mapInterceptions(events: readonly InterceptionEvent[], playerFamilyId: string): AudioCueDescriptor[] {
  const out: AudioCueDescriptor[] = [];
  for (const ev of events) {
    if (ev.victimFaction === playerFamilyId) {
      out.push(cueFor('tommygun', 'robbery:victim', 'interception:robbed'));
    } else if (ev.attackerFaction === playerFamilyId) {
      out.push(cueFor('tommygun', 'robbery:raid', 'interception:ambush'));
    }
    // neither side is the player ⇒ no cue (hidden-rival activity is silent).
  }
  return out;
}

/** Embodied-extortion transitions → player-ISSUED outcomes (global; the player caused them):
 * converted/retook ⇒ the extort menace-thud; sabotaged ⇒ the pistol report. In-progress state churn and
 * `failed` stay silent in the MVP (the render's act feedback carries those). */
export function mapExtortionEvents(events: readonly EmbodiedExtortionEvent[]): AudioCueDescriptor[] {
  const out: AudioCueDescriptor[] = [];
  for (const ev of events) {
    if (ev.converted || ev.retook) {
      out.push(cueFor('extort', `extort:${ev.frontId}`, ev.retook ? 'extortion:retook' : 'extortion:converted'));
    } else if (ev.sabotaged) {
      out.push(cueFor('pistol', `sabotage:${ev.frontId}`, 'extortion:sabotaged'));
    }
  }
  return out;
}

/** The endgame resolution → the win/lose sting (priority 1 — never shed). */
export function mapEndgame(endgame: EndgameResult | null | undefined): AudioCueDescriptor[] {
  if (!endgame) return [];
  const won = endgame.kind.startsWith('win');
  return [cueFor(won ? 'sting_win' : 'sting_lose', 'endgame', `endgame:${endgame.kind}`)];
}

// ── state.log entries (the caller passes the NEW slice — cursor pattern) ───────────────────────

/** Map NEW state.log entries to cues. Covers the log-only causes: the federal ladder ('fed-warning'
 * with data.tier 1..3 → the shipped NOTICE/WATCH/RAID clips via federalCueKey; 'fed-armed' → the RAID
 * cue), 'mutiny', law raids ('raid-bust'/'raid-cash'/'raid-operation' → siren), and 'hq-struck' (siren —
 * the existential alarm). Everything else is silent here by design (wrapper-owned, or visual-only). */
export function mapLogEvents(entries: readonly GameEvent[]): AudioCueDescriptor[] {
  const out: AudioCueDescriptor[] = [];
  for (const e of entries) {
    switch (e.kind) {
      case 'fed-warning': {
        const tier = typeof e.data?.tier === 'number' ? e.data.tier : 1;
        out.push(cueFor(federalCueKey(tier) as MvpCueKey, `fed:${tier}`, 'log:fed-warning'));
        break;
      }
      case 'fed-armed':
        out.push(cueFor('federal_raid', 'fed:armed', 'log:fed-armed'));
        break;
      case 'mutiny':
        out.push(cueFor('mutiny', 'mutiny', 'log:mutiny'));
        break;
      case 'raid-bust':
      case 'raid-cash':
      case 'raid-operation':
        out.push(cueFor('siren', 'raid', `log:${e.kind}`));
        break;
      case 'hq-struck':
        out.push(cueFor('siren', 'hq', 'log:hq-struck'));
        break;
      default:
        break; // silent: wrapper-owned ('interception', 'extort-success'), or visual-only kinds
    }
  }
  return out;
}

// ── the one-call aggregate ──────────────────────────────────────────────────────────────────────

/** Map one frame's worth of sim outputs to cue descriptors, in a stable order (combat → interceptions →
 * extortion → log → endgame). `newLogEntries` is the log slice SINCE the caller's cursor (the caller
 * owns the cursor, exactly like the ledger's harvest). Read-only over every input. */
export function mapFrame(
  result: UpdateResult,
  newLogEntries: readonly GameEvent[],
  endgame: EndgameResult | null | undefined,
  playerFamilyId: string,
): AudioCueDescriptor[] {
  return [
    ...mapCombatEvents(result.combat),
    ...mapInterceptions(result.interceptions, playerFamilyId),
    ...mapExtortionEvents(result.extortion),
    ...mapLogEvents(newLogEntries),
    ...mapEndgame(endgame),
  ];
}
