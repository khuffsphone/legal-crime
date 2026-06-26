// Per-weapon bone-rig ATTACK body language. Pure timing/pose table; Phaser drawing stays in rigDraw.
// This is the attacker's BODY animation lane only (wind-up → fire → recover), distinct from muzzle flash,
// hit-react and SFX feedback.

import type { WeaponTier } from '../sim';

export type RigAttackWeapon = 'fists' | 'pistol' | 'shotgun' | 'rifle' | 'hitman' | 'demolitions';
export type RigWeaponProp = 'none' | 'pistol' | 'tommy' | 'longGun' | 'satchel';

export interface WeaponAttackTiming {
  durationMs: number;
  windUpMs: number;
  fireMs: number;
  recoverMs: number;
  burstHz: number;
}

export interface WeaponAttackParams {
  weapon: RigAttackWeapon;
  timing: WeaponAttackTiming;
  prop: RigWeaponProp;
  frontHandDX: number;
  frontHandLift: number;
  backHandDX: number;
  backHandLift: number;
  brace: number;
  leanPx: number;
  recoilPx: number;
  liftPx: number;
  propLength: number;
}

export interface WeaponAttackPoseSample {
  weapon: RigAttackWeapon;
  phase: 'windUp' | 'fire' | 'recover' | 'done';
  bodyKickPx: number;
  bodyLiftPx: number;
  leanPx: number;
  shoulderTwistPx: number;
  armL: { handDX: number; handLift: number };
  armR: { handDX: number; handLift: number };
  prop: { kind: RigWeaponProp; length: number; brace: number };
}

/** Tunable third-person pose table for ~56px dimetric rigs. Values are local pose offsets: +DX aims
 * forward in the figure's facing direction, lift raises hands up from the shoulder line. */
export const WEAPON_ATTACK_POSES: Record<RigAttackWeapon, WeaponAttackParams> = {
  fists: {
    weapon: 'fists', timing: { durationMs: 180, windUpMs: 70, fireMs: 45, recoverMs: 65, burstHz: 0 }, prop: 'none',
    frontHandDX: 13, frontHandLift: 4, backHandDX: 0, backHandLift: 0, brace: 0, leanPx: 4, recoilPx: -2, liftPx: -2, propLength: 0,
  },
  pistol: {
    weapon: 'pistol', timing: { durationMs: 210, windUpMs: 80, fireMs: 45, recoverMs: 85, burstHz: 0 }, prop: 'pistol',
    frontHandDX: 18, frontHandLift: 12, backHandDX: 5, backHandLift: 7, brace: 0.25, leanPx: 2, recoilPx: -5, liftPx: -1, propLength: 8,
  },
  shotgun: {
    weapon: 'shotgun', timing: { durationMs: 330, windUpMs: 110, fireMs: 70, recoverMs: 150, burstHz: 0 }, prop: 'longGun',
    frontHandDX: 20, frontHandLift: 10, backHandDX: 8, backHandLift: 8, brace: 0.75, leanPx: 5, recoilPx: -8, liftPx: -2, propLength: 22,
  },
  rifle: {
    weapon: 'rifle', timing: { durationMs: 290, windUpMs: 95, fireMs: 75, recoverMs: 120, burstHz: 12 }, prop: 'tommy',
    frontHandDX: 22, frontHandLift: 11, backHandDX: 7, backHandLift: 8, brace: 0.65, leanPx: 3, recoilPx: -6, liftPx: -1.5, propLength: 24,
  },
  hitman: {
    weapon: 'hitman', timing: { durationMs: 240, windUpMs: 80, fireMs: 45, recoverMs: 115, burstHz: 0 }, prop: 'pistol',
    frontHandDX: 19, frontHandLift: 13, backHandDX: 8, backHandLift: 12, brace: 0.45, leanPx: 1, recoilPx: -4, liftPx: -1, propLength: 8,
  },
  demolitions: {
    weapon: 'demolitions', timing: { durationMs: 360, windUpMs: 135, fireMs: 80, recoverMs: 145, burstHz: 0 }, prop: 'satchel',
    frontHandDX: 14, frontHandLift: 7, backHandDX: -4, backHandLift: 2, brace: 0.35, leanPx: 6, recoilPx: -7, liftPx: -3, propLength: 12,
  },
};

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }
function easeOut(v: number): number { return 1 - Math.pow(1 - clamp01(v), 2); }
function easeInOut(v: number): number { const t = clamp01(v); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

export function rigAttackWeaponFromTier(weapon?: WeaponTier): RigAttackWeapon {
  switch (weapon) {
    case 'pistol': return 'pistol';
    case 'shotgun': return 'shotgun';
    case 'rifle': return 'rifle';
    case 'hitman': return 'hitman';
    case 'demolitions': return 'demolitions';
    default: return 'fists';
  }
}

export function weaponAttackDurationMs(weapon?: WeaponTier): number {
  return WEAPON_ATTACK_POSES[rigAttackWeaponFromTier(weapon)].timing.durationMs;
}

export function sampleWeaponAttackPose(weapon: RigAttackWeapon, elapsedMs: number): WeaponAttackPoseSample {
  const p = WEAPON_ATTACK_POSES[weapon];
  const { windUpMs, fireMs, durationMs, burstHz } = p.timing;
  let phase: WeaponAttackPoseSample['phase'] = 'done';
  let aim = 0;
  let fire = 0;
  if (elapsedMs < windUpMs) { phase = 'windUp'; aim = easeInOut(elapsedMs / windUpMs); }
  else if (elapsedMs < windUpMs + fireMs) { phase = 'fire'; aim = 1; fire = 1 - (elapsedMs - windUpMs) / fireMs; }
  else if (elapsedMs < durationMs) { phase = 'recover'; aim = 1 - easeOut((elapsedMs - windUpMs - fireMs) / p.timing.recoverMs); }

  const burst = burstHz > 0 && phase === 'fire' ? Math.sin((elapsedMs / 1000) * Math.PI * 2 * burstHz) * 1.8 : 0;
  const frontDX = p.frontHandDX * aim + burst;
  const backDX = p.backHandDX * aim - burst * p.brace;
  return {
    weapon,
    phase,
    bodyKickPx: p.recoilPx * fire,
    bodyLiftPx: p.liftPx * fire,
    leanPx: p.leanPx * aim,
    shoulderTwistPx: p.brace * 2.5 * aim,
    armL: { handDX: backDX, handLift: p.backHandLift * aim },
    armR: { handDX: frontDX, handLift: p.frontHandLift * aim },
    prop: { kind: p.prop, length: p.propLength * aim, brace: p.brace * aim },
  };
}
