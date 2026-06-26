// COMBAT DEPTH FINALIZE · PART A — unit.skill WIRING (state/math). The spawn path copies the enforcer's
// spec skill (= the recruited gangster's skill) onto MovableUnit.skill, so the already-built tuning
// modifiers fire on real data. ⭐ The HARD CAP still holds even when a skilled unit's data flows through —
// no burst-delete.
import { describe, it, expect } from 'vitest';
import { spawnEnforcer, spawnUnit } from '../src/sim/movement';
import { enforcerUnitSkill, ENFORCER_SPECS } from '../src/sim/enforcers';
import { meleeDamage, MAX_HIT_DAMAGE } from '../src/sim/combatTuning';
import type { WeaponTier } from '../src/sim/types';

describe('a spawned enforcer inherits its enforcer/gangster combat skill', () => {
  it('enforcerUnitSkill matches the spec skill (which is the recruited gangster skill) for every tier', () => {
    for (const tier of Object.keys(ENFORCER_SPECS) as WeaponTier[]) {
      expect(enforcerUnitSkill(tier)).toBe(ENFORCER_SPECS[tier].skill);
    }
    expect(enforcerUnitSkill(undefined)).toBe(0); // a plain thug — no modifier
  });
  it('spawnEnforcer stamps the weapon + skill onto the unit (additive, default-safe)', () => {
    const hitman = spawnEnforcer('e1', 0, 0, 'rival-a', undefined, { weapon: 'hitman', skill: enforcerUnitSkill('hitman') });
    expect(hitman.weapon).toBe('hitman');
    expect(hitman.skill).toBe(ENFORCER_SPECS.hitman.skill); // 8
    const plain = spawnEnforcer('e2', 0, 0, 'rival-a'); // no opts ⇒ original behaviour
    expect(plain.weapon).toBeUndefined();
    expect(plain.skill).toBeUndefined();
  });
  it('the inherited skill actually changes the hit (the modifier fires)', () => {
    const skilled = spawnEnforcer('a', 0, 0, 'r', undefined, { weapon: 'pistol', skill: 8 });
    const plain = spawnEnforcer('b', 0, 0, 'r', undefined, { weapon: 'pistol', skill: 0 });
    expect(meleeDamage(skilled, spawnUnit('t', 0, 0))).toBeGreaterThan(meleeDamage(plain, spawnUnit('t', 0, 0)));
  });
});

describe('⭐ the cap holds with real skill data flowing through', () => {
  it('even a max-skill hitman never exceeds MAX_HIT_DAMAGE (no one-shot)', () => {
    const worst = spawnEnforcer('a', 0, 0, 'r', undefined, { weapon: 'hitman', skill: 10 });
    expect(meleeDamage(worst, spawnUnit('t', 0, 0))).toBeLessThanOrEqual(MAX_HIT_DAMAGE);
  });
});
