// RTS-27 — the AudioManager: the discrete-event + music-state layer the rts22→24 HUD seams were
// built for. Phaser-side (never imported by /src/sim). Preloads the catalogued .m4a clips, plays
// them onto the EXISTING visual beats with per-category volume buses + a master mute, runs the
// adaptive MUSIC state machine (crossfade on phase change, ambience bed underneath, duck under
// stings/VO), and respects a persisted settings surface. Pure mapping/rotation lives in audioMap.ts.
//
// Missing clips degrade gracefully: a key whose file isn't in public/audio/ simply fails to load and
// play() no-ops it — so the seam wiring is complete now and lights up as assets are dropped in.

import Phaser from 'phaser';
import {
  type AudioBus, type MusicPhase, musicBedForPhase, stingForPhase, federalCueKey, greaseCueKey,
  combatCueKey, pickTake, conductBeds, orphanCueKey, holdBed, BED_MIN_INTERVAL_MS,
  // soft-SFX/VO governor (PR #11) — restored: a base merge (codex pass) dropped this import line while
  // keeping the body that uses these, leaving base un-typecheckable. See PR notes.
  type SoftVoice, admitSoftSfx, softBurstActive,
  SOFT_SFX_MAX, SOFT_BURST_WINDOW_MS, SOFT_BURST_THRESHOLD,
} from './audioMap';

interface ClipDef { key: string; file: string; bus: AudioBus; loop?: boolean; vol?: number; urgent?: boolean; }

// The catalogued library (from the Drive ASSET_MANIFEST). Files present in the current drop load and
// sound now; the rest (grease cues, door/typewriter, wire rings, stings, VO) are wired with their
// expected filenames and activate the moment they're dropped into public/audio/.
const LIBRARY: ClipDef[] = [
  // ── SFX (provided) ──
  { key: 'extort', file: 'LCR_sfx_extort.m4a', bus: 'sfx', vol: 0.9 }, // 🥃 a racket folds
  { key: 'cashdrop', file: 'LCR_sfx_cashdrop.m4a', bus: 'sfx', vol: 0.85 }, // 🪙 banked / pickup
  { key: 'tommygun', file: 'LCR_sfx_tommygun.m4a', bus: 'sfx', vol: 0.8, urgent: true }, // 🔫 violence
  { key: 'pistol', file: 'LCR_sfx_pistol.m4a', bus: 'sfx', vol: 0.85, urgent: true }, // a single hit
  { key: 'siren', file: 'LCR_sfx_siren.m4a', bus: 'sfx', vol: 0.7, urgent: true }, // the law at 85 / lockout
  { key: 'warning', file: 'LCR_sfx_warning.m4a', bus: 'sfx', vol: 0.8, urgent: true }, // 🔔 teletype 50/70/85
  { key: 'mutiny', file: 'LCR_sfx_mutiny.m4a', bus: 'sfx', vol: 0.85, urgent: true }, // crew defection stinger
  // ── per-weapon HIT-SFX hooks (attack-commit feedback). Keys are by CONTRACT (weaponFeedback.ts); the
  // real WAVs drop into public/audio/ later and light up automatically (missing-clip graceful no-op). The
  // gun reports ride the EXISTING urgent governor (one-at-a-time + duck, like tommygun/pistol); a fists
  // punch is a soft cue under the soft governor. No conductor/timing change — just catalogued keys. ──
  { key: 'sfx_hit_fists', file: 'sfx_hit_fists.wav', bus: 'sfx', vol: 0.7 }, // a knuckle thud (soft)
  { key: 'sfx_hit_pistol', file: 'sfx_hit_pistol.wav', bus: 'sfx', vol: 0.82, urgent: true },
  { key: 'sfx_hit_shotgun', file: 'sfx_hit_shotgun.wav', bus: 'sfx', vol: 0.85, urgent: true },
  { key: 'sfx_hit_rifle', file: 'sfx_hit_rifle.wav', bus: 'sfx', vol: 0.8, urgent: true }, // the tommy
  { key: 'sfx_hit_hitman', file: 'sfx_hit_hitman.wav', bus: 'sfx', vol: 0.82, urgent: true },
  { key: 'sfx_hit_demolitions', file: 'sfx_hit_demolitions.wav', bus: 'sfx', vol: 0.85, urgent: true },
  // ── grease level-ups / extras — RTS-30e-audio: reconciled to the user's ACTUAL asset filenames (.wav) ──
  { key: 'grease_beat', file: 'sfx_the_beat_whistle.wav', bus: 'sfx', vol: 0.8 }, // a cop's whistle
  { key: 'grease_bench', file: 'sfx_the_bench_gavel.wav', bus: 'sfx', vol: 0.8 }, // a gavel
  { key: 'grease_cityhall', file: 'sfx_city_hall_stamp.wav', bus: 'sfx', vol: 0.8 }, // a wax stamp
  { key: 'grease_bureau', file: 'sfx_the_bureau_receiver_click.wav', bus: 'sfx', vol: 0.8 }, // a phone receiver
  { key: 'wire_routine', file: 'sfx_the_wire_soft_ring.wav', bus: 'sfx', vol: 0.4 }, // soft tick
  { key: 'wire_crisis', file: 'sfx_the_wire_crisis_double_ring.wav', bus: 'sfx', vol: 0.85, urgent: true }, // 📞 needs-you ring
  { key: 'door', file: 'sfx_door_slam.wav', bus: 'sfx', vol: 0.7 },
  { key: 'typewriter', file: 'sfx_typewriter_log.wav', bus: 'sfx', vol: 0.5 },
  // ── federal ladder — RTS-30e-audio: the user shipped DISTINCT 50/70/85 cues, so each rung is its own clip ──
  { key: 'federal_notice', file: 'sfx_federal_50_notice.wav', bus: 'sfx', vol: 0.8, urgent: true }, // NOTICE @ 50
  { key: 'federal_watch', file: 'sfx_federal_70_watch.wav', bus: 'sfx', vol: 0.8, urgent: true }, // WATCH @ 70
  { key: 'federal_raid', file: 'sfx_federal_85_raid.wav', bus: 'sfx', vol: 0.8, urgent: true }, // RAID @ 85
  // ── phase + win/lose stings — RTS-30e-audio: win/lose reconciled to the user's exact assets; the four
  // phase stings ASSUME the user's `sfx_phase_<phase>.wav` convention (confirm the suffixes / see the
  // rename table in the receipt if the real files differ). ──
  { key: 'sting_establish', file: 'sfx_phase_establish.wav', bus: 'sfx', vol: 0.9, urgent: true },
  { key: 'sting_first_blood', file: 'sfx_phase_first_blood.wav', bus: 'sfx', vol: 0.9, urgent: true },
  { key: 'sting_contest', file: 'sfx_phase_contest.wav', bus: 'sfx', vol: 0.9, urgent: true },
  { key: 'sting_decapitate', file: 'sfx_phase_decapitate.wav', bus: 'sfx', vol: 0.9, urgent: true },
  { key: 'sting_win', file: 'sfx_victory_you_took_the_city.wav', bus: 'sfx', vol: 0.95, urgent: true },
  { key: 'sting_lose', file: 'sfx_defeat_the_city_took_you.wav', bus: 'sfx', vol: 0.95, urgent: true },
  // ── VO (expected; rotated takes) ──
  { key: 'vo_confirm_1', file: 'LCR_vo_confirm_1.m4a', bus: 'vo', vol: 1 },
  { key: 'vo_confirm_2', file: 'LCR_vo_confirm_2.m4a', bus: 'vo', vol: 1 },
  { key: 'vo_confirm_3', file: 'LCR_vo_confirm_3.m4a', bus: 'vo', vol: 1 },
  { key: 'vo_tip_extort', file: 'LCR_vo_tip_extort.m4a', bus: 'vo', vol: 1 },
  { key: 'vo_tip_grease', file: 'LCR_vo_tip_grease.m4a', bus: 'vo', vol: 1 },
  { key: 'vo_tip_launder', file: 'LCR_vo_tip_launder.m4a', bus: 'vo', vol: 1 },
  { key: 'vo_tip_war', file: 'LCR_vo_tip_war.m4a', bus: 'vo', vol: 1 },
  { key: 'vo_win', file: 'LCR_vo_win.m4a', bus: 'vo', vol: 1 },
  { key: 'vo_lose', file: 'LCR_vo_lose.m4a', bus: 'vo', vol: 1 },
  // ── MUSIC beds (provided; looped) ──
  { key: 'music_theme', file: 'LCR_music_theme.m4a', bus: 'music', loop: true, vol: 0.7 },
  { key: 'music_menu', file: 'LCR_music_menu.m4a', bus: 'music', loop: true, vol: 0.7 },
  { key: 'music_establish', file: 'LCR_est_calm_build_v1.m4a', bus: 'music', loop: true, vol: 0.7 },
  { key: 'music_contest', file: 'LCR_contest_tension_v1.m4a', bus: 'music', loop: true, vol: 0.7 },
  { key: 'music_war', file: 'LCR_war_high_stakes_v1.m4a', bus: 'music', loop: true, vol: 0.75 },
  { key: 'music_gameover', file: 'LCR_music_gameover.m4a', bus: 'music', loop: false, vol: 0.8 },
  // ── ambience bed (provided; looped under everything) ──
  { key: 'ambience_city', file: 'LCR_city_ambience_night.m4a', bus: 'ambience', loop: true, vol: 0.5 },
];

const DEFS = new Map(LIBRARY.map((d) => [d.key, d]));
const URGENT_DEBOUNCE = 120; // ms — don't stack/retrigger an urgent cue inside this window
const SAME_CLIP_DEBOUNCE = 70; // ms — swallow a retrigger of the SAME clip inside this window
// ── soft-SFX/VO governor knobs (mirrors the urgent governor). The CAP, priority table, and burst
// window/threshold are pure data in audioMap.ts (SOFT_SFX_MAX / SOFT_SFX_PRIORITY / SOFT_BURST_*);
// these two are the Phaser-side durations the manager applies once those pure decisions are made. ──
const SOFT_BURST_DUCK_MS = 450; // a soft burst ducks the beds this long (lighter than an urgent's 700)
const VO_MAX_MS = 6000; // failsafe: forget a still-"playing" VO after this, so one VO can't wedge the gate
const SETTINGS_KEY = 'lcr.audio.settings.v1';

export interface AudioSettings { master: number; sfx: number; vo: number; music: number; ambience: number; muted: boolean; }
const DEFAULT_SETTINGS: AudioSettings = { master: 0.8, sfx: 1, vo: 1, music: 0.8, ambience: 0.7, muted: false };

export class AudioManager {
  private scene: Phaser.Scene;
  private settings: AudioSettings;
  private loaded = new Set<string>();
  private lastPlayed = new Map<string, number>();
  private urgentUntil = 0; // one urgent sound at a time
  // SOFT-SFX GOVERNOR — the non-urgent voices currently sounding (capped at SOFT_SFX_MAX; the lowest
  // priority is dropped/evicted, never stacked) + the recent soft-cue start times for burst detection.
  private activeSoftVoices: { voice: SoftVoice; snd: Phaser.Sound.BaseSound }[] = [];
  private recentSoftStarts: number[] = [];
  // ONE VO AT A TIME — the VO currently speaking (was only caller-convention before). New VO drops while set.
  private voActive?: Phaser.Sound.BaseSound;
  private voUntil = 0;
  private musicSound?: Phaser.Sound.BaseSound;
  private ambienceSound?: Phaser.Sound.BaseSound;
  // RTS-31 — the conductor's live beds (≤1 after a crossfade settles) + the beds mid-fade-out, so a
  // fresh phase change can HARD-CUT a still-fading bed (the crossfade lock) instead of stacking it.
  private liveBeds: { id: number; bed: string; snd: Phaser.Sound.BaseSound }[] = [];
  private retiringBeds: Phaser.Sound.BaseSound[] = [];
  private bedSeq = 0;
  private currentBed = '';
  private bedSinceMs = Number.NEGATIVE_INFINITY; // when the live bed CLIP last switched (the sink-level dwell)
  private currentPhase: MusicPhase = 'TITLE';
  private lastVoIndex = -1;

  /** Register every clip for loading (call from a scene preload). Missing files 404 → graceful. */
  static preload(scene: Phaser.Scene): void {
    scene.load.on('loaderror', () => { /* expected for not-yet-dropped clips */ });
    for (const d of LIBRARY) scene.load.audio(d.key, [`audio/${d.file}`]);
  }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.settings = AudioManager.loadSettings();
  }

  /** After preload: record which clips actually loaded (the rest no-op). */
  ready(): void {
    for (const d of LIBRARY) if (this.scene.cache.audio.exists(d.key)) this.loaded.add(d.key);
  }

  // ── settings (persisted; respected on every play) ──
  private static loadSettings(): AudioSettings {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_KEY) : null;
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
  }
  private save(): void {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ }
  }
  getSettings(): Readonly<AudioSettings> { return this.settings; }
  toggleMute(): void { this.settings.muted = !this.settings.muted; this.applyBedVolumes(); this.save(); }
  setBusVolume(bus: keyof AudioSettings, v: number): void {
    (this.settings[bus] as number) = Math.max(0, Math.min(1, v));
    this.applyBedVolumes(); this.save();
  }

  private busVolume(bus: AudioBus): number {
    if (this.settings.muted) return 0;
    return this.settings.master * (this.settings[bus] as number);
  }

  // ── discrete SFX / VO playback ──
  /** Play a one-shot clip on its bus, honouring mute/volume, a per-clip debounce, and the per-bus
   * governors: ONE urgent at a time (ducks the beds), a concurrency CAP on non-urgent sfx (lowest
   * priority dropped, plus a duck under a burst), and ONE VO at a time. No-op if the clip isn't loaded. */
  play(key: string, opts: { volScale?: number } = {}): void {
    const def = DEFS.get(key);
    if (!def || !this.loaded.has(key) || this.busVolume(def.bus) <= 0) return;
    const now = this.scene.time.now;
    const last = this.lastPlayed.get(key) ?? -1e9;
    if (now - last < SAME_CLIP_DEBOUNCE) return; // debounce rapid repeats of the same clip

    // ── URGENT GOVERNOR (unchanged) — one urgent sound at a time, ducks the beds ──
    if (def.urgent) {
      if (now < this.urgentUntil) return;
      this.urgentUntil = now + URGENT_DEBOUNCE;
      this.duck(700);
      this.lastPlayed.set(key, now);
      this.scene.sound.play(key, { volume: this.voiceVolume(def, opts) });
      return;
    }

    // ── ONE VO AT A TIME — drop a new VO while one is still speaking (was caller-convention only) ──
    if (def.bus === 'vo') {
      if ((this.voActive && this.voActive.isPlaying) || now < this.voUntil) return;
      this.lastPlayed.set(key, now);
      this.duck(900); // VO speaks over a ducked bed — duck only once the gate admits it
      const snd = this.scene.sound.add(key, { volume: this.voiceVolume(def, opts) });
      this.voActive = snd;
      this.voUntil = now + VO_MAX_MS; // failsafe so a missed 'complete' can't wedge the gate forever
      snd.once('complete', () => { if (this.voActive === snd) { this.voActive = undefined; this.voUntil = 0; } });
      snd.play();
      return;
    }

    // ── SOFT-SFX GOVERNOR — cap concurrent non-urgent voices; drop/evict the lowest priority ──
    this.pruneSoftVoices();
    const admission = admitSoftSfx(this.activeSoftVoices.map((v) => v.voice), key, SOFT_SFX_MAX);
    if (!admission.admit) return; // at the cap and outranked → drop rather than stack
    if (admission.evict) {
      const victim = this.activeSoftVoices.find((v) => v.voice === admission.evict);
      if (victim) { this.scene.tweens.killTweensOf(victim.snd); victim.snd.stop(); this.dropSoftVoice(victim.snd); }
    }
    // burst-duck: record this start and, if enough soft cues landed in the window, duck the beds under it
    this.recentSoftStarts = this.recentSoftStarts.filter((t) => now - t < SOFT_BURST_WINDOW_MS);
    this.recentSoftStarts.push(now);
    if (softBurstActive(this.recentSoftStarts, now, SOFT_BURST_WINDOW_MS, SOFT_BURST_THRESHOLD)) this.duck(SOFT_BURST_DUCK_MS);

    this.lastPlayed.set(key, now);
    const snd = this.scene.sound.add(key, { volume: this.voiceVolume(def, opts) });
    const tracked = { voice: { key, startedMs: now }, snd };
    this.activeSoftVoices.push(tracked);
    snd.once('complete', () => this.dropSoftVoice(snd));
    snd.play();
  }

  /** Per-clip output volume = its bus level × the clip's own vol × an optional one-shot scale. */
  private voiceVolume(def: ClipDef, opts: { volScale?: number }): number {
    return this.busVolume(def.bus) * (def.vol ?? 1) * (opts.volScale ?? 1);
  }

  /** Forget a soft voice (on natural completion or eviction). */
  private dropSoftVoice(snd: Phaser.Sound.BaseSound): void {
    this.activeSoftVoices = this.activeSoftVoices.filter((v) => v.snd !== snd);
  }

  /** Drop any tracked soft voice Phaser has already finished (safety net if a 'complete' was missed). */
  private pruneSoftVoices(): void {
    this.activeSoftVoices = this.activeSoftVoices.filter((v) => v.snd.isPlaying);
  }

  /** Rotate a VO take from a list so it doesn't grate. The single-VO gate + the bed-duck now live in
   * play()'s VO branch, so a take dropped by the gate no longer ducks the beds for nothing. */
  vo(takes: string[]): void {
    const pick = pickTake(takes.filter((k) => this.loaded.has(k)), this.lastVoIndex);
    if (!pick) return;
    this.lastVoIndex = pick.index;
    this.play(pick.key);
  }

  // ── named seams (thin wrappers so the scene reads declaratively) ──
  banked(): void { this.play('cashdrop'); }
  extort(): void { this.play('extort'); }
  grease(channel: string): void { this.play(greaseCueKey(channel)); }
  federal(tier: number): void { this.play(federalCueKey(tier)); }
  combat(kind: 'raid' | 'ambush' | 'attack' | 'assassinate' | 'sabotage' | 'lockout'): void { this.play(combatCueKey(kind)); }
  mutiny(): void { this.play('mutiny'); }
  // RTS-34 orphan-clip wiring: door slam under a LOCKOUT (forced entry); typewriter on LAUNDERING.
  lockoutEntry(): void { this.play(orphanCueKey('lockout')); }
  laundering(): void { this.play(orphanCueKey('launder')); }
  // RTS-34.1: the [C] RUSH dispatch beat — a runner heads out the HQ door (reuses the door-slam clip;
  // distinct from the bank's coin so SEND and ARRIVE don't sound alike).
  dispatch(): void { this.play('door'); }
  wire(cue: 'crisis' | 'routine'): void { this.play(cue === 'crisis' ? 'wire_crisis' : 'wire_routine'); }
  confirm(): void { this.vo(['vo_confirm_1', 'vo_confirm_2', 'vo_confirm_3']); }
  tip(which: 'extort' | 'grease' | 'launder' | 'war'): void { this.vo([`vo_tip_${which}`]); }

  // ── adaptive MUSIC state machine ──
  /** Start the looping ambience + the current phase bed (call once audio is unlocked). */
  startBeds(): void {
    if (!this.ambienceSound && this.loaded.has('ambience_city')) {
      this.ambienceSound = this.scene.sound.add('ambience_city', { loop: true, volume: this.bedVol('ambience', 'ambience_city') });
      this.ambienceSound.play();
    }
    this.setPhase(this.currentPhase, true);
  }

  /** Switch the music bed for a match phase, crossfading. ONE conductor: on every change it retires
   * EVERY non-target bed (RTS-31), and HARD-CUTS any bed still fading from a prior change — so rapid
   * skip-week phase flips can never stack orphan beds (the old bug played 3 beds at once). */
  setPhase(phase: MusicPhase, force = false): void {
    const bed = musicBedForPhase(phase);
    // SINK-LEVEL DWELL — hold the current bed unless this is a different clip AND (forced, or the min
    // interval has elapsed). This is what makes transitions RARE even when the caller's requested phase
    // oscillates per-frame (CONTEST↔FIRST BLOOD / the DECAPITATE floor). It GATES conductBeds below; the
    // ≤1-bed crossfade lock is unchanged. A held request leaves currentBed/currentPhase untouched, so the
    // every-frame conductor call simply retries until the dwell elapses (no desync).
    const { hold, changed } = holdBed({ bed: this.currentBed, sinceMs: this.bedSinceMs }, bed, this.scene.time.now, BED_MIN_INTERVAL_MS, force);
    if (!changed) return;
    this.currentPhase = phase;
    this.currentBed = bed;
    this.bedSinceMs = hold.sinceMs;

    // CROSSFADE LOCK — a fresh transition arrived: hard-cut any bed still fading out from the last one
    // so the audible count can't climb past the single outgoing→incoming crossfade pair.
    for (const snd of this.retiringBeds) { this.scene.tweens.killTweensOf(snd); snd.stop(); }
    this.retiringBeds = [];

    // Ask the pure conductor which beds to stop / start (guarantees ≤1 live afterward).
    const decision = conductBeds(
      this.liveBeds.map((b) => ({ id: b.id, bed: b.bed })),
      phase,
      (b) => this.loaded.has(b),
    );
    const stopIds = new Set(decision.stop.map((s) => s.id));
    for (const b of this.liveBeds) {
      if (!stopIds.has(b.id)) continue;
      this.scene.tweens.killTweensOf(b.snd);
      this.retiringBeds.push(b.snd);
      const snd = b.snd;
      this.scene.tweens.add({ targets: snd, volume: 0, duration: 600, onComplete: () => { snd.stop(); this.retiringBeds = this.retiringBeds.filter((x) => x !== snd); } });
    }
    this.liveBeds = this.liveBeds.filter((b) => !stopIds.has(b.id));

    if (decision.start) {
      const target = this.bedVol('music', bed);
      const next = this.scene.sound.add(bed, { loop: DEFS.get(bed)?.loop ?? true, volume: 0 });
      next.play();
      this.scene.tweens.add({ targets: next, volume: target, duration: 900 });
      this.liveBeds.push({ id: ++this.bedSeq, bed, snd: next });
    }
    this.musicSound = this.liveBeds.length > 0 ? this.liveBeds[this.liveBeds.length - 1].snd : undefined;
  }

  /** Briefly duck the music + ambience beds under a sting/VO, then restore. */
  duck(ms: number): void {
    for (const [snd, bus, key] of [[this.musicSound, 'music', this.currentBed], [this.ambienceSound, 'ambience', 'ambience_city']] as const) {
      if (!snd) continue;
      const full = this.bedVol(bus, key);
      this.scene.tweens.killTweensOf(snd);
      (snd as Phaser.Sound.BaseSound & { volume: number }).volume = full * 0.45;
      this.scene.tweens.add({ targets: snd, volume: full, duration: 400, delay: ms });
    }
  }

  private bedVol(bus: AudioBus, key: string): number { return this.busVolume(bus) * (DEFS.get(key)?.vol ?? 0.7); }
  private applyBedVolumes(): void {
    if (this.musicSound) (this.musicSound as Phaser.Sound.BaseSound & { volume: number }).volume = this.bedVol('music', this.currentBed);
    if (this.ambienceSound) (this.ambienceSound as Phaser.Sound.BaseSound & { volume: number }).volume = this.bedVol('ambience', 'ambience_city');
  }

  /** A clip is available to play (loaded). */
  has(key: string): boolean { return this.loaded.has(key); }
  stingForPhaseKey(phase: MusicPhase): string { return stingForPhase(phase); }
}
