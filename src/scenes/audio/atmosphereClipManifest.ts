// atmosphereClipManifest.ts — AUDIO E-H, R4: the SINGLE-SOURCE clip manifest for every key E/F/G may
// emit (F.3, complete: 18 bed loops + 12 event one-shots + 8 extortion one-shots + 15 prop clips = 53).
// Pure data. This array is simultaneously:
//   1. the F2 registration source (registered into the AudioManager catalog — one array, no drift),
//   2. the manifest-parity contract the tests enforce (catalog keys == keys the modules emit),
//   3. K's AUDIO-MIXER PRODUCTION QUEUE — `file` is the exact deliverable filename (R4: wave delivery,
//      public/audio/<key>.wav), `spec` is the mixer's brief, `lenHint` the target duration.
//
// NB federal_notice / federal_watch / federal_raid already ship in the AudioManager's built-in catalog
// with real assets (sfx_federal_50/70/85_*.wav) — they appear here for PARITY (F.1 maps to them via
// federalCueKey) and the F2 registrar SKIPS already-registered keys rather than overriding them.

import type { AtmosphereBus } from './atmosphereIntents';
import { ALL_BED_KEYS, DISTRICT_BEDS, DISTRICT_BED_ARCHETYPES } from './districtBedCatalog';
import { PROP_CLIP_KEYS } from './propEmitterCatalog';

export interface AtmosphereClipDef {
  key: string;
  /** R4 wave delivery: the exact filename K's mixer exports to public/audio/. */
  file: string;
  bus: AtmosphereBus;
  loop: boolean;
  /** production brief (F.3). */
  spec: string;
  /** target duration, seconds. */
  lenHint: readonly [number, number];
  /** relative clip volume seed (tuned later by ear). */
  vol: number;
}

const wav = (key: string): string => `${key}.wav`;

const def = (key: string, bus: AtmosphereBus, loop: boolean, lenHint: readonly [number, number], vol: number, spec: string): AtmosphereClipDef =>
  ({ key, file: wav(key), bus, loop, spec, lenHint, vol });

// ── bed loops (18) — stereo seamless; base = broad low tone, color = sparse identity detail ───────
const BED_CLIPS: AtmosphereClipDef[] = DISTRICT_BED_ARCHETYPES.flatMap((a) => {
  const bed = DISTRICT_BEDS[a];
  return [
    def(bed.base, 'beds', true, [60, 90], 0.5, `${a} base bed — ${bed.intent} Broad low tone, no semantic speech.`),
    def(bed.color, 'beds', true, [45, 75], 0.4, `${a} color bed — sparse identity detail, no event-like stingers.`),
  ];
});

// ── federal / police / collector / interception / player-offense one-shots (12) ──────────────────
const EVENT_CLIPS: AtmosphereClipDef[] = [
  def('player_offense_raid', 'oneshots', false, [0.8, 1.8], 0.8, "The PLAYER's offensive op landing — muscle, not police-coded (no siren/whistle)."),
  def('police_raid_cash', 'oneshots', false, [1.0, 2.5], 0.85, 'Police raid seizes cash — stereo HUD cue, distinct from the federal bell family.'),
  def('police_raid_operation', 'oneshots', false, [1.0, 2.5], 0.85, 'Police raid shuts an operation — same family as raid_cash, its own read.'),
  def('police_raid_bust', 'oneshots', false, [1.0, 2.5], 0.9, 'Police bust — the heaviest of the police trio.'),
  def('federal_notice', 'oneshots', false, [1.2, 2.2], 0.8, 'Federal NOTICE (50) — already shipped as sfx_federal_50_notice.wav; manifest parity entry.'),
  def('federal_watch', 'oneshots', false, [1.4, 2.5], 0.8, 'Federal WATCH (70) — already shipped as sfx_federal_70_watch.wav; manifest parity entry.'),
  def('federal_raid', 'oneshots', false, [1.8, 3.0], 0.8, 'Federal RAID (85) — already shipped as sfx_federal_85_raid.wav; manifest parity entry.'),
  def('federal_cooldown', 'oneshots', false, [0.8, 1.8], 0.7, 'Federal pressure easing — a settling, de-escalation cue.'),
  def('federal_armed', 'oneshots', false, [1.5, 2.8], 0.85, 'Federal warrant ARMED — tenser than watch, short of the raid klaxon.'),
  def('interception_collector_robbed', 'oneshots', false, [0.9, 1.8], 0.85, "Player's collector robbed — non-positional (the event carries no tile)."),
  def('collector_arrival', 'oneshots', false, [0.5, 1.2], 0.6, 'Collector reaches HQ — light arrival beat.'),
  def('collector_deposit', 'oneshots', false, [0.6, 1.4], 0.7, 'Take banked — a heavier coin/ledger beat than arrival.'),
];

// ── extortion one-shots (8) — mono positional preferred; foley/stinger; no intelligible speech ────
const EXTORTION_CLIPS: AtmosphereClipDef[] = (
  [
    ['extortion_shakedown_converted', 'Shakedown lands — the front folds (door lean + till foley).'],
    ['extortion_shakedown_retook', 'Shakedown muscles a rival front back — same family, a takeback accent.'],
    ['extortion_shakedown_sabotaged', 'Shakedown act flips to damage — glass/wood crack accent.'],
    ['extortion_shakedown_failed', 'Shakedown fails/interrupted — a dropped, unresolved beat.'],
    ['extortion_sabotage_converted', 'Sabotage act converts the front — mechanical/destructive family.'],
    ['extortion_sabotage_retook', 'Sabotage retake — destructive family, takeback accent.'],
    ['extortion_sabotage_sabotaged', 'Sabotage lands — the front is wrecked shut (the loudest of the family).'],
    ['extortion_sabotage_failed', 'Sabotage fails — a fizzled mechanical beat.'],
  ] as const
).map(([key, spec]) => def(key, 'oneshots', false, [0.5, 1.4], 0.8, `${spec} Mono positional preferred; more mechanical/destructive for the sabotage family.`));

// ── prop emitter clips (15) — 4 mono positional loops + 11 mono positional one-shots ─────────────
const PROP_SPEC: Record<string, { loop: boolean; lenHint: readonly [number, number]; spec: string }> = {
  prop_news_stand_loop: { loop: true, lenHint: [20, 45], spec: 'Newsstand — paper rustle, coins, quiet patter (non-semantic).' },
  prop_street_tree_loop: { loop: true, lenHint: [20, 45], spec: 'Street tree — leaves, occasional bird, breeze.' },
  prop_fountain_loop: { loop: true, lenHint: [20, 45], spec: 'Plaza fountain — steady water body, the highest-priority anchor.' },
  prop_statue_monument_loop: { loop: true, lenHint: [20, 45], spec: 'Monument — subtle stone/plaza air, pigeons; the quietest anchor.' },
  prop_street_lamp_tick: { loop: false, lenHint: [0.2, 0.8], spec: 'Gas/electric lamp tick.' },
  prop_utility_pole_buzz: { loop: false, lenHint: [0.4, 1.2], spec: 'Wire buzz swell on a pole.' },
  prop_bench_creak: { loop: false, lenHint: [0.3, 0.9], spec: 'Wood bench creak.' },
  prop_produce_stall_rustle: { loop: false, lenHint: [0.4, 1.1], spec: 'Produce stall rustle/handling.' },
  prop_awning_flap: { loop: false, lenHint: [0.4, 1.2], spec: 'Canvas awning flap in a gust.' },
  prop_hedge_shrub_rustle: { loop: false, lenHint: [0.3, 1.0], spec: 'Hedge rustle.' },
  prop_parked_car_settle: { loop: false, lenHint: [0.4, 1.2], spec: 'Parked car settles — suspension/metal tick. NO engine loop.' },
  prop_traffic_signal_relay: { loop: false, lenHint: [0.2, 0.7], spec: 'Signal relay click — relay only, not traffic simulation.' },
  prop_vendor_cart_clatter: { loop: false, lenHint: [0.4, 1.2], spec: 'Pushcart clatter — non-verbal (no hawking speech).' },
  prop_blade_sign_creak: { loop: false, lenHint: [0.4, 1.4], spec: 'Hanging blade sign creaks on its bracket.' },
  prop_delivery_truck_settle: { loop: false, lenHint: [0.5, 1.5], spec: 'Parked truck settle/tick. NO idling loop.' },
};

const PROP_CLIPS: AtmosphereClipDef[] = PROP_CLIP_KEYS.map((key) => {
  const s = PROP_SPEC[key];
  return def(key, 'emitters', s.loop, s.lenHint, s.loop ? 0.45 : 0.6, `${s.spec} Mono positional.`);
});

/** THE manifest — the one array everything derives from (R4). */
export const ATMOSPHERE_CLIP_MANIFEST: readonly AtmosphereClipDef[] = [
  ...BED_CLIPS, ...EVENT_CLIPS, ...EXTORTION_CLIPS, ...PROP_CLIPS,
];

/** Every registered key (53). */
export const ATMOSPHERE_CLIP_KEYS: readonly string[] = ATMOSPHERE_CLIP_MANIFEST.map((c) => c.key);

const KEY_SET = new Set(ATMOSPHERE_CLIP_KEYS);

/** Is a key in the E-H manifest? (H2 rejects any emitted key that is not.) Pure. */
export function isAtmosphereClipKey(key: string): boolean {
  return KEY_SET.has(key);
}

// compile-shape guard: the manifest must stay in one-to-one agreement with the catalogs it derives from.
if (ATMOSPHERE_CLIP_KEYS.length !== new Set(ATMOSPHERE_CLIP_KEYS).size) {
  throw new Error('atmosphere clip manifest contains duplicate keys');
}
if (ALL_BED_KEYS.some((k) => !KEY_SET.has(k))) {
  throw new Error('atmosphere clip manifest is missing a district bed key');
}
