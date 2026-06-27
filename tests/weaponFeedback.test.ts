// ATTACK-COMMIT FEEDBACK — the pure half: the synced event payload, the weaponType→feedback-params table,
// the EXACT hit-SFX key set, and the NO-FOG-X-RAY gate. The on-screen flash/hit-react FEEL is playtest-gated;
// this only checks the testable decisions the renderer reads.
import { describe, it, expect } from 'vitest';
import {
  attackCommitFromCombat, weaponFeedback, hitSfxKey, shouldEmitFeedback,
  WEAPON_HIT_SFX, WEAPON_FEEDBACK, type ResolvedAttack,
} from '../src/scenes/weaponFeedback';
import type { RigAttackWeapon } from '../src/scenes/weaponAttackPose';

const ALL: RigAttackWeapon[] = ['fists', 'pistol', 'shotgun', 'rifle', 'hitman', 'demolitions'];

describe('attack-commit event — one synced payload from a resolved combat beat', () => {
  it('maps attacker/target/kind and resolves the weapon tier to its render weapon', () => {
    const ev: ResolvedAttack = { attackerId: 'A', unitId: 'B', kind: 'hit', weapon: 'shotgun' };
    const commit = attackCommitFromCombat(ev, { x: 12, y: 34 });
    expect(commit).toEqual({
      attackerId: 'A', targetId: 'B', weaponType: 'shotgun', hitResult: 'hit', worldPos: { x: 12, y: 34 },
    });
  });
  it('an absent/melee weapon tier resolves to fists; a down carries hitResult "down"', () => {
    const commit = attackCommitFromCombat({ attackerId: 'A', unitId: 'B', kind: 'down' }, { x: 0, y: 0 });
    expect(commit.weaponType).toBe('fists');
    expect(commit.hitResult).toBe('down');
  });
});

describe('hit-SFX key set — EXACTLY the six contract keys (the rifle IS the tommy)', () => {
  it('each weapon fires its contract key', () => {
    expect(hitSfxKey('pistol')).toBe('sfx_hit_pistol');
    expect(hitSfxKey('shotgun')).toBe('sfx_hit_shotgun');
    expect(hitSfxKey('rifle')).toBe('sfx_hit_rifle'); // the tommy keys as rifle
    expect(hitSfxKey('hitman')).toBe('sfx_hit_hitman');
    expect(hitSfxKey('demolitions')).toBe('sfx_hit_demolitions');
    expect(hitSfxKey('fists')).toBe('sfx_hit_fists');
  });
  it('the key set is exactly those six, all distinct, no knife/bat/firebomb/vehicle', () => {
    const keys = ALL.map(hitSfxKey);
    expect(new Set(keys).size).toBe(6);
    expect(new Set(Object.values(WEAPON_HIT_SFX))).toEqual(new Set([
      'sfx_hit_fists', 'sfx_hit_pistol', 'sfx_hit_shotgun', 'sfx_hit_rifle', 'sfx_hit_hitman', 'sfx_hit_demolitions',
    ]));
  });
});

describe('feedback param table — every weapon covered; severity scales with weapon weight', () => {
  it('every render weapon has a complete entry whose hitSfx matches the key table', () => {
    for (const w of ALL) {
      const fb = weaponFeedback(w);
      expect(fb.weapon).toBe(w);
      expect(fb.hitSfx).toBe(WEAPON_HIT_SFX[w]);
      expect(fb.muzzle.sparkCount).toBeGreaterThanOrEqual(0);
      expect(fb.hitReact.knockbackPx).toBeGreaterThan(0);
    }
  });
  it('hit-react knockback orders light→heavy: fists < pistol < rifle < shotgun ≤ demolitions', () => {
    const kb = (w: RigAttackWeapon) => weaponFeedback(w).hitReact.knockbackPx;
    expect(kb('fists')).toBeLessThan(kb('pistol'));
    expect(kb('pistol')).toBeLessThan(kb('rifle'));
    expect(kb('rifle')).toBeLessThan(kb('shotgun'));
    expect(kb('shotgun')).toBeLessThanOrEqual(kb('demolitions'));
  });
  it('fists has NO gun-flash (flashScale 0) but still lands contact sparks; guns all flash', () => {
    expect(WEAPON_FEEDBACK.fists.muzzle.flashScale).toBe(0);
    expect(WEAPON_FEEDBACK.fists.muzzle.sparkCount).toBeGreaterThan(0);
    for (const w of ALL.filter((x) => x !== 'fists')) {
      expect(weaponFeedback(w).muzzle.flashScale).toBeGreaterThan(0);
    }
  });
  it('a tommy burst (rifle) lingers longer than a pistol tap', () => {
    expect(weaponFeedback('rifle').hitReact.staggerMs).toBeGreaterThan(weaponFeedback('pistol').hitReact.staggerMs);
  });
});

describe('NO-FOG-X-RAY gate — flash/SFX only when revealed AND on-screen', () => {
  it('emits only when both visibility conditions hold', () => {
    expect(shouldEmitFeedback(true, true)).toBe(true);
    expect(shouldEmitFeedback(true, false)).toBe(false);  // off-screen → no leak
    expect(shouldEmitFeedback(false, true)).toBe(false);  // fogged → no leak
    expect(shouldEmitFeedback(false, false)).toBe(false);
  });
});
