// COMBAT DEPTH · PART 1 — weapon-tier + skill tuning (state/math). Higher tier deals more (within the cap);
// skill modifiers are deterministic; ⭐ the HARD CAP holds — no per-hit damage exceeds MAX_HIT_DAMAGE even at
// max tier + max skill (no one-shots), and the swing interval never drops below the floor.
import { describe, it, expect } from 'vitest';
import { meleeDamage, attackInterval, engageRange, WEAPON_TUNING, MAX_HIT_DAMAGE, MIN_ATTACK_INTERVAL } from '../src/sim/combatTuning';
import { COMBAT_MELEE_DAMAGE, COMBAT_ATTACK_INTERVAL, COMBAT_ENGAGE_RANGE, THUG_MAX_HEALTH } from '../src/sim/constants';
import { spawnUnit, type MovableUnit } from '../src/sim/movement';
import type { WeaponTier } from '../src/sim/types';

const plain = (): MovableUnit => spawnUnit('u', 0, 0);
const armed = (weapon?: WeaponTier, skill?: number): MovableUnit => ({ ...spawnUnit('u', 0, 0), weapon, skill });

describe('tier 0 reproduces the current flat values exactly (unchanged behaviour)', () => {
  it('a plain thug vs a plain thug = the old constants', () => {
    expect(meleeDamage(plain(), plain())).toBe(COMBAT_MELEE_DAMAGE);
    expect(attackInterval(plain())).toBe(COMBAT_ATTACK_INTERVAL);
    expect(engageRange(plain())).toBe(COMBAT_ENGAGE_RANGE);
  });
});

describe('higher tier deals MORE (within the cap), faster cadence, longer reach', () => {
  it('every weapon hits harder than a plain thug', () => {
    for (const w of Object.keys(WEAPON_TUNING) as WeaponTier[]) {
      expect(meleeDamage(armed(w), plain())).toBeGreaterThan(meleeDamage(plain(), plain()));
    }
  });
  it('a rifle out-ranges; a hitman out-damages a pistol', () => {
    expect(engageRange(armed('rifle'))).toBeGreaterThan(engageRange(armed('pistol')));
    expect(meleeDamage(armed('hitman'), plain())).toBeGreaterThan(meleeDamage(armed('pistol'), plain()));
  });
});

describe('skill modifiers are deterministic', () => {
  it('attacker skill raises outgoing damage + speeds cadence; defender skill lowers damage taken', () => {
    const base = meleeDamage(armed('pistol', 0), plain());
    expect(meleeDamage(armed('pistol', 5), plain())).toBeGreaterThan(base);              // more skill → more dmg
    expect(meleeDamage(armed('pistol', 5), armed(undefined, 8))).toBeLessThan(meleeDamage(armed('pistol', 5), plain())); // defender skill mitigates
    expect(attackInterval(armed('pistol', 8))).toBeLessThan(attackInterval(armed('pistol', 0))); // faster
  });
  it('the same inputs always give the same number (pure)', () => {
    expect(meleeDamage(armed('rifle', 4), armed(undefined, 3))).toBe(meleeDamage(armed('rifle', 4), armed(undefined, 3)));
  });
});

describe('⭐ the HARD CAPS hold — no burst-delete, even at max tier + max skill', () => {
  it('no single hit exceeds MAX_HIT_DAMAGE for ANY weapon at ANY skill (defender at 0)', () => {
    for (const w of Object.keys(WEAPON_TUNING) as WeaponTier[]) {
      for (let s = 0; s <= 10; s++) {
        expect(meleeDamage(armed(w, s), plain())).toBeLessThanOrEqual(MAX_HIT_DAMAGE);
      }
    }
  });
  it('the cap means a fresh thug ALWAYS survives ≥3 hits (no one-shot)', () => {
    expect(MAX_HIT_DAMAGE * 2).toBeLessThan(THUG_MAX_HEALTH); // 2 max hits < full health
    const worst = meleeDamage(armed('hitman', 10), plain());  // the deadliest possible swing
    expect(worst).toBeLessThanOrEqual(MAX_HIT_DAMAGE);
    expect(Math.ceil(THUG_MAX_HEALTH / worst)).toBeGreaterThanOrEqual(3);
  });
  it('cadence never drops below the floor (DPS is bounded)', () => {
    for (const w of Object.keys(WEAPON_TUNING) as WeaponTier[]) {
      expect(attackInterval(armed(w, 10))).toBeGreaterThanOrEqual(MIN_ATTACK_INTERVAL);
    }
    // bounded DPS: the worst sustained damage-per-second cannot delete a fresh thug in under ~1s
    const dps = MAX_HIT_DAMAGE / MIN_ATTACK_INTERVAL;
    expect(THUG_MAX_HEALTH / dps).toBeGreaterThanOrEqual(1);
  });
  it('damage never goes negative (a very skilled defender floors at 0, not below)', () => {
    expect(meleeDamage(plain(), armed(undefined, 10))).toBeGreaterThanOrEqual(0);
  });
});
