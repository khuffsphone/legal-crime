// RTS-30e — pure tests for the FEEL mapping (which contact-vfx / attack-motion / corpse-memory an
// event maps to) and the action-motion timing budget. No pixels asserted — only the decisions a real
// FX trigger would branch on, so the verb→effect wiring stays verifiable headlessly.
import { describe, it, expect } from 'vitest';
import {
  combatVfxForVerb,
  attackMotionForWeapon,
  corpseMemoryRole,
  outcomeDownedAMan,
  killNudgePx,
} from '../src/scenes/feelMap';
import { MOTION, DANGER_LOOP_MAX_MS, IDLE_LOOP_MIN_MS, motionIsDanger, SPEC } from '../src/scenes/visualSpec';

describe('RTS-30e — combat contact vfx by verb (motion-only pulses)', () => {
  it('sabotage shatters, demolish dust-mushrooms, the rest muzzle-flash', () => {
    expect(combatVfxForVerb('sabotage')).toBe('shatter');
    expect(combatVfxForVerb('demolish')).toBe('dust');
    for (const v of ['raid', 'attack', 'assassinate', 'ambush']) expect(combatVfxForVerb(v)).toBe('muzzle');
  });
});

describe('RTS-30e — attack motion by weapon (melee wind-up vs ranged recoil)', () => {
  it('bare-handed muscle melees; any weapon tier fires', () => {
    expect(attackMotionForWeapon(undefined)).toBe('melee');
    expect(attackMotionForWeapon('thug')).toBe('melee');
    expect(attackMotionForWeapon('shotgun')).toBe('ranged');
    expect(attackMotionForWeapon('hitman')).toBe('ranged');
    expect(attackMotionForWeapon('demolitions')).toBe('ranged');
  });
});

describe('RTS-30e — corpse faction-memory (dimmed, never danger-red)', () => {
  it('keeps a dimmed faction glint, never the live danger-red', () => {
    expect(corpseMemoryRole('player')).toBe('brassDim');
    expect(corpseMemoryRole('rival')).toBe('rival');
    expect(corpseMemoryRole('civilian')).toBe('fog');
    // none of the memory roles is the danger-red motion colour (the only danger-red is the one-shot flash).
    for (const f of ['player', 'rival', 'civilian'] as const) expect(SPEC[corpseMemoryRole(f)]).not.toBe(SPEC.danger);
  });
});

describe('RTS-30e — kill beat triggers from the resolver flags', () => {
  it('a repelled raid or a failed hit downs a man; a clean win/strike does not', () => {
    expect(outcomeDownedAMan({ repelled: true })).toBe(true);
    expect(outcomeDownedAMan({ success: false })).toBe(true);
    expect(outcomeDownedAMan({ success: true, eliminated: true })).toBe(false); // the RIVAL died, not your man
    expect(outcomeDownedAMan({})).toBe(false);
    expect(outcomeDownedAMan({ captured: true } as never)).toBe(false);
  });

  it('the kill screen-nudge is the spec ~2px', () => {
    expect(killNudgePx()).toBe(2);
  });
});

describe('RTS-30e — action-motion timing budget', () => {
  it('the idle breath is an idle loop (≥1300ms, never reads as danger)', () => {
    expect(MOTION.idleBreath).toBeGreaterThanOrEqual(IDLE_LOOP_MIN_MS);
    expect(motionIsDanger(MOTION.idleBreath)).toBe(false);
  });
  it('the kill flash is the one fast danger beat (≤1100ms) and is fired once, not looped', () => {
    expect(MOTION.killFlash).toBeLessThanOrEqual(DANGER_LOOP_MAX_MS);
    expect(motionIsDanger(MOTION.killFlash)).toBe(true);
  });
  it('locomotion + combat one-shots are short event beats, not ambient loops', () => {
    for (const k of ['walkBob', 'runBob', 'attackRecoil', 'hitFlinch'] as const) {
      expect(MOTION[k]).toBeGreaterThan(0);
      expect(MOTION[k]).toBeLessThan(MOTION.idleBreath); // shorter than the idle breath — they're beats, not idles
    }
  });
});
