// ATTACK-COMMIT FEEDBACK — the pure (Phaser-free) half of the weapon-feedback lane. When an attack
// RESOLVES (the sim's resolveProximityCombat beat), the render layer builds ONE synced event and drives
// three frame-aligned channels off it: a per-weapon MUZZLE FLASH, a per-weapon HIT-REACT severity, and a
// per-weapon HIT-SFX key. This module owns the testable decisions — the event payload, the weaponType→
// feedback-params table, the exact SFX key set, and the NO-FOG-X-RAY visibility gate. The Phaser drawing /
// tween / audio playback stays in IsoScene; it just reads what these return so body + muzzle + hit + sound
// all fire from the SAME resolved-attack signal (composing with the already-merged weaponAttackPose timing).

import type { WeaponTier } from '../sim';
import { type RigAttackWeapon, rigAttackWeaponFromTier } from './weaponAttackPose';

export type HitResult = 'hit' | 'down';

/** The ONE synced attack-commit event. Emitted render-side when an attack resolves; every channel (muzzle,
 * hit-react, SFX) reads the SAME payload so they stay frame-aligned. `worldPos` is the struck unit's
 * screen-space point (where the muzzle flashes / the body reacts). */
export interface AttackCommitEvent {
  attackerId: string;
  targetId: string;
  weaponType: RigAttackWeapon;
  hitResult: HitResult;
  worldPos: { x: number; y: number };
}

/** The slice of a resolved sim CombatEvent this lane needs (kept structural so it's testable without the
 * full sim type — the real CombatEvent is a superset). */
export interface ResolvedAttack {
  attackerId: string;
  unitId: string; // the struck / downed unit
  kind: HitResult;
  weapon?: WeaponTier;
}

/** Build the synced attack-commit event from a resolved combat beat + the struck unit's screen point.
 * Pure: the WeaponTier is mapped to its render weapon (an absent/melee tier ⇒ fists). */
export function attackCommitFromCombat(ev: ResolvedAttack, worldPos: { x: number; y: number }): AttackCommitEvent {
  return {
    attackerId: ev.attackerId,
    targetId: ev.unitId,
    weaponType: rigAttackWeaponFromTier(ev.weapon),
    hitResult: ev.kind,
    worldPos,
  };
}

// ── per-weapon HIT-SFX keys (EXACT, by contract — real WAVs drop into public/audio/ later) ──────────
/** The fire-this-key table. The rifle IS the tommy → `sfx_hit_rifle`. There is no knife/bat/firebomb/
 * vehicle weapon, so the set is exactly these six. */
export const WEAPON_HIT_SFX: Record<RigAttackWeapon, string> = {
  fists: 'sfx_hit_fists',
  pistol: 'sfx_hit_pistol',
  shotgun: 'sfx_hit_shotgun',
  rifle: 'sfx_hit_rifle', // the tommy
  hitman: 'sfx_hit_hitman',
  demolitions: 'sfx_hit_demolitions',
};

/** The HIT-SFX key for a weapon (one of the six contract keys). Pure. */
export function hitSfxKey(weapon: RigAttackWeapon): string {
  return WEAPON_HIT_SFX[weapon];
}

// ── per-weapon FEEDBACK params (muzzle + hit-react) ────────────────────────────────────────────────
/** A transient danger flash — MOTION-ONLY (it flashes and fades; never a static danger mark). `flashScale`
 * 0 ⇒ no gun-flash (a fists punch lands contact sparks only). `hot` picks the hotter live-danger frame. */
export interface MuzzleFlashParams {
  flashScale: number; // peak glow scale (0 = no muzzle glow, e.g. fists)
  flashMs: number;    // flash lifetime
  sparkCount: number; // spark streaks thrown
  sparkSpreadPx: number;
  hot: boolean;       // the hotter danger frame (a sharp crack) vs the standard danger orange
}

/** Per-weapon hit-react severity — how hard the struck body flinches/staggers/knocks back. A tommy burst
 * shoves harder + lingers longer than a pistol tap. `flinchScale` multiplies the base flinch dwell. */
export interface HitReactParams {
  flinchScale: number; // ×base flinch dwell (visualSpec MOTION.hitFlinch)
  knockbackPx: number; // lateral shove away from the attacker
  staggerMs: number;   // extra dwell on top of the base flinch
}

export interface WeaponFeedbackParams {
  weapon: RigAttackWeapon;
  hitSfx: string;
  muzzle: MuzzleFlashParams;
  hitReact: HitReactParams;
}

/** The tuning table. Ordered light→heavy (fists < pistol/hitman < rifle < shotgun < demolitions), mirroring
 * the weaponAttackPose recoil/duration ordering so body + muzzle + hit read as one weight. Tunable; the feel
 * is PLAYTEST-GATED while the param math here is unit-tested. */
export const WEAPON_FEEDBACK: Record<RigAttackWeapon, WeaponFeedbackParams> = {
  fists: {
    weapon: 'fists', hitSfx: WEAPON_HIT_SFX.fists,
    muzzle: { flashScale: 0, flashMs: 90, sparkCount: 2, sparkSpreadPx: 12, hot: false },
    hitReact: { flinchScale: 0.8, knockbackPx: 2, staggerMs: 0 },
  },
  pistol: {
    weapon: 'pistol', hitSfx: WEAPON_HIT_SFX.pistol,
    muzzle: { flashScale: 0.40, flashMs: 120, sparkCount: 4, sparkSpreadPx: 22, hot: false },
    hitReact: { flinchScale: 1.0, knockbackPx: 4, staggerMs: 40 },
  },
  hitman: {
    weapon: 'hitman', hitSfx: WEAPON_HIT_SFX.hitman,
    muzzle: { flashScale: 0.36, flashMs: 110, sparkCount: 3, sparkSpreadPx: 18, hot: true }, // a tight, sharp crack
    hitReact: { flinchScale: 1.1, knockbackPx: 5, staggerMs: 60 },
  },
  rifle: { // the tommy — a burst: many sparks, a lingering stagger
    weapon: 'rifle', hitSfx: WEAPON_HIT_SFX.rifle,
    muzzle: { flashScale: 0.50, flashMs: 140, sparkCount: 8, sparkSpreadPx: 26, hot: true },
    hitReact: { flinchScale: 1.3, knockbackPx: 6, staggerMs: 90 },
  },
  shotgun: { // the heaviest knockback short of a blast
    weapon: 'shotgun', hitSfx: WEAPON_HIT_SFX.shotgun,
    muzzle: { flashScale: 0.62, flashMs: 150, sparkCount: 7, sparkSpreadPx: 30, hot: true },
    hitReact: { flinchScale: 1.5, knockbackPx: 9, staggerMs: 120 },
  },
  demolitions: { // a blast — the biggest flash + shove
    weapon: 'demolitions', hitSfx: WEAPON_HIT_SFX.demolitions,
    muzzle: { flashScale: 0.72, flashMs: 160, sparkCount: 10, sparkSpreadPx: 34, hot: true },
    hitReact: { flinchScale: 1.6, knockbackPx: 10, staggerMs: 140 },
  },
};

/** The feedback params for a weapon. Pure. */
export function weaponFeedback(weapon: RigAttackWeapon): WeaponFeedbackParams {
  return WEAPON_FEEDBACK[weapon];
}

/**
 * NO-FOG-X-RAY gate. A muzzle flash or hit-SFX is emitted ONLY when the struck tile is BOTH fog-revealed
 * AND on-screen — so combat never leaks a hidden or off-screen rival's position through a flash or a sound.
 * The attacker's own body motion + the struck unit's flinch ride the unit views (already fog-culled), so
 * this conservative gate covers the two channels that would otherwise leak (world flash + audio). Pure.
 */
export function shouldEmitFeedback(revealed: boolean, onScreen: boolean): boolean {
  return revealed && onScreen;
}
