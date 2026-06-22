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
  combatCueKey, pickTake,
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
  // ── grease level-ups / extras (expected; silent until dropped) ──
  { key: 'grease_beat', file: 'LCR_sfx_grease_beat.m4a', bus: 'sfx', vol: 0.8 },
  { key: 'grease_bench', file: 'LCR_sfx_grease_bench.m4a', bus: 'sfx', vol: 0.8 },
  { key: 'grease_cityhall', file: 'LCR_sfx_grease_cityhall.m4a', bus: 'sfx', vol: 0.8 },
  { key: 'grease_bureau', file: 'LCR_sfx_grease_bureau.m4a', bus: 'sfx', vol: 0.8 },
  { key: 'wire_routine', file: 'LCR_sfx_wire_routine.m4a', bus: 'sfx', vol: 0.4 }, // soft tick
  { key: 'wire_crisis', file: 'LCR_sfx_wire_crisis.m4a', bus: 'sfx', vol: 0.85, urgent: true }, // 📞 needs-you ring
  { key: 'door', file: 'LCR_sfx_door.m4a', bus: 'sfx', vol: 0.7 },
  { key: 'typewriter', file: 'LCR_sfx_typewriter.m4a', bus: 'sfx', vol: 0.5 },
  // ── phase + win/lose stings (expected) ──
  { key: 'sting_establish', file: 'LCR_sting_establish.m4a', bus: 'sfx', vol: 0.9, urgent: true },
  { key: 'sting_first_blood', file: 'LCR_sting_first_blood.m4a', bus: 'sfx', vol: 0.9, urgent: true },
  { key: 'sting_contest', file: 'LCR_sting_contest.m4a', bus: 'sfx', vol: 0.9, urgent: true },
  { key: 'sting_decapitate', file: 'LCR_sting_decapitate.m4a', bus: 'sfx', vol: 0.9, urgent: true },
  { key: 'sting_win', file: 'LCR_sting_win.m4a', bus: 'sfx', vol: 0.95, urgent: true },
  { key: 'sting_lose', file: 'LCR_sting_lose.m4a', bus: 'sfx', vol: 0.95, urgent: true },
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
const SETTINGS_KEY = 'lcr.audio.settings.v1';

export interface AudioSettings { master: number; sfx: number; vo: number; music: number; ambience: number; muted: boolean; }
const DEFAULT_SETTINGS: AudioSettings = { master: 0.8, sfx: 1, vo: 1, music: 0.8, ambience: 0.7, muted: false };

export class AudioManager {
  private scene: Phaser.Scene;
  private settings: AudioSettings;
  private loaded = new Set<string>();
  private lastPlayed = new Map<string, number>();
  private urgentUntil = 0; // one urgent sound at a time
  private musicSound?: Phaser.Sound.BaseSound;
  private ambienceSound?: Phaser.Sound.BaseSound;
  private currentBed = '';
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
  /** Play a one-shot clip on its bus, honouring mute/volume, a per-clip debounce, and the single
   * urgent-channel rule. No-op if the clip isn't loaded. */
  play(key: string, opts: { volScale?: number } = {}): void {
    const def = DEFS.get(key);
    if (!def || !this.loaded.has(key) || this.busVolume(def.bus) <= 0) return;
    const now = this.scene.time.now;
    const last = this.lastPlayed.get(key) ?? -1e9;
    if (now - last < 70) return; // debounce rapid repeats of the same clip
    if (def.urgent) {
      if (now < this.urgentUntil) return; // one urgent sound at a time
      this.urgentUntil = now + URGENT_DEBOUNCE;
      this.duck(700); // duck the beds under an urgent cue
    }
    this.lastPlayed.set(key, now);
    const volume = this.busVolume(def.bus) * (def.vol ?? 1) * (opts.volScale ?? 1);
    this.scene.sound.play(key, { volume });
  }

  /** Rotate a VO take from a list so it doesn't grate (gated by the caller for spam). */
  vo(takes: string[]): void {
    const pick = pickTake(takes.filter((k) => this.loaded.has(k)), this.lastVoIndex);
    if (!pick) return;
    this.lastVoIndex = pick.index;
    this.duck(900);
    this.play(pick.key);
  }

  // ── named seams (thin wrappers so the scene reads declaratively) ──
  banked(): void { this.play('cashdrop'); }
  extort(): void { this.play('extort'); }
  grease(channel: string): void { this.play(greaseCueKey(channel)); }
  federal(tier: number): void { this.play(federalCueKey(tier)); }
  combat(kind: 'raid' | 'ambush' | 'attack' | 'assassinate' | 'sabotage' | 'lockout'): void { this.play(combatCueKey(kind)); }
  mutiny(): void { this.play('mutiny'); }
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

  /** Switch the music bed for a match phase, crossfading. No-op if already on that bed. */
  setPhase(phase: MusicPhase, force = false): void {
    this.currentPhase = phase;
    const bed = musicBedForPhase(phase);
    if (!force && bed === this.currentBed) return;
    this.currentBed = bed;
    if (!this.loaded.has(bed)) { this.musicSound?.stop(); this.musicSound = undefined; return; }
    const target = this.bedVol('music', bed);
    const next = this.scene.sound.add(bed, { loop: DEFS.get(bed)?.loop ?? true, volume: 0 });
    next.play();
    this.scene.tweens.add({ targets: next, volume: target, duration: 900 });
    const prev = this.musicSound;
    if (prev) {
      this.scene.tweens.add({ targets: prev, volume: 0, duration: 700, onComplete: () => prev.stop() });
    }
    this.musicSound = next;
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
