import { describe, expect, it } from 'vitest';
import {
  WEAPON_ATTACK_POSES,
  rigAttackWeaponFromTier,
  sampleWeaponAttackPose,
  weaponAttackDurationMs,
  type RigAttackWeapon,
} from '../src/scenes/weaponAttackPose';

describe('weapon attack rig pose table', () => {
  it('maps sim weapon tiers into rig attack weapons without touching sim mechanics', () => {
    expect(rigAttackWeaponFromTier(undefined)).toBe('fists');
    expect(rigAttackWeaponFromTier('pistol')).toBe('pistol');
    expect(rigAttackWeaponFromTier('shotgun')).toBe('shotgun');
    expect(rigAttackWeaponFromTier('rifle')).toBe('rifle');
    expect(rigAttackWeaponFromTier('hitman')).toBe('hitman');
    expect(rigAttackWeaponFromTier('demolitions')).toBe('demolitions');
  });

  it('keeps distinct, documented timing and prop choices per weapon', () => {
    const weapons = Object.keys(WEAPON_ATTACK_POSES) as RigAttackWeapon[];
    expect(weapons).toEqual(['fists', 'pistol', 'shotgun', 'rifle', 'hitman', 'demolitions']);
    for (const weapon of weapons) {
      const params = WEAPON_ATTACK_POSES[weapon];
      expect(params.timing.durationMs).toBe(params.timing.windUpMs + params.timing.fireMs + params.timing.recoverMs);
      expect(params.timing.durationMs).toBeGreaterThan(0);
      expect(weaponAttackDurationMs(weapon === 'fists' ? undefined : weapon)).toBe(params.timing.durationMs);
    }
    expect(WEAPON_ATTACK_POSES.pistol.prop).toBe('pistol');
    expect(WEAPON_ATTACK_POSES.shotgun.prop).toBe('longGun');
    expect(WEAPON_ATTACK_POSES.rifle.prop).toBe('tommy');
    expect(WEAPON_ATTACK_POSES.demolitions.prop).toBe('satchel');
    expect(WEAPON_ATTACK_POSES.shotgun.recoilPx).toBeLessThan(WEAPON_ATTACK_POSES.pistol.recoilPx);
  });

  it('samples wind-up, fire, recover, and done phases deterministically', () => {
    const pistol = WEAPON_ATTACK_POSES.pistol;
    expect(sampleWeaponAttackPose('pistol', 0).phase).toBe('windUp');
    const fire = sampleWeaponAttackPose('pistol', pistol.timing.windUpMs + 1);
    expect(fire.phase).toBe('fire');
    expect(fire.bodyKickPx).toBeLessThan(0);
    expect(fire.armR.handDX).toBeGreaterThan(fire.armL.handDX);
    expect(sampleWeaponAttackPose('pistol', pistol.timing.windUpMs + pistol.timing.fireMs + 1).phase).toBe('recover');
    expect(sampleWeaponAttackPose('pistol', pistol.timing.durationMs + 1).phase).toBe('done');
  });

  it('gives the tommy/rifle burst a cyclic shudder during the fire window', () => {
    const rifle = WEAPON_ATTACK_POSES.rifle;
    const a = sampleWeaponAttackPose('rifle', rifle.timing.windUpMs + 5);
    const b = sampleWeaponAttackPose('rifle', rifle.timing.windUpMs + 25);
    expect(a.phase).toBe('fire');
    expect(b.phase).toBe('fire');
    expect(a.armR.handDX).not.toBeCloseTo(b.armR.handDX, 4);
    expect(a.prop.kind).toBe('tommy');
  });
});
