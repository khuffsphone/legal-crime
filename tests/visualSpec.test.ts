import { describe, it, expect } from 'vitest';
import {
  SPEC,
  STATE_ONLY_ROLES,
  hexNum,
  MOTION,
  DANGER_LOOP_MAX_MS,
  IDLE_LOOP_MIN_MS,
  motionIsDanger,
  factionColor,
  satchelTier,
  dangerStageColor,
  federalBarColor,
  loyaltyMotion,
} from '../src/scenes/visualSpec';

describe('SPEC palette — exact spec hexes', () => {
  it('uses the documented role hexes', () => {
    expect(SPEC.soot).toBe('#16130f');
    expect(SPEC.brickDark).toBe('#5a241b');
    expect(SPEC.brickLight).toBe('#7e3326');
    expect(SPEC.brass).toBe('#b8862b');
    expect(SPEC.rival).toBe('#9e1b1b');
    expect(SPEC.danger).toBe('#e11d1d');
    expect(SPEC.cashGreen).toBe('#4e8b5a');
  });

  it('the two reds never share a value (rival identity ≠ danger motion)', () => {
    expect(SPEC.rival).not.toBe(SPEC.danger);
  });

  it('state-only roles are distinct from the world tones (earned, not decoration)', () => {
    const world = [SPEC.soot, SPEC.brickDark, SPEC.brickLight, SPEC.fog, SPEC.bone, SPEC.shadow];
    for (const role of STATE_ONLY_ROLES) {
      expect(world).not.toContain(SPEC[role]);
    }
  });

  it('hexNum parses to a Phaser colour number', () => {
    expect(hexNum('#16130f')).toBe(0x16130f);
    expect(hexNum(SPEC.brass)).toBe(0xb8862b);
  });
});

describe('motion budget — one fast loop = danger', () => {
  it('classifies a danger loop vs an idle loop by the budget thresholds', () => {
    expect(motionIsDanger(DANGER_LOOP_MAX_MS)).toBe(true);
    expect(motionIsDanger(DANGER_LOOP_MAX_MS + 1)).toBe(false);
    expect(IDLE_LOOP_MIN_MS).toBeGreaterThan(DANGER_LOOP_MAX_MS);
  });

  it('all idle loyalty loops idle slow (≥ IDLE_LOOP_MIN_MS); none of them read as danger', () => {
    for (const k of ['loyaltyBob', 'waverRoll', 'disloyalPulse', 'selectionPulse', 'coinSpin'] as const) {
      expect(MOTION[k]).toBeGreaterThanOrEqual(IDLE_LOOP_MIN_MS);
      expect(motionIsDanger(MOTION[k])).toBe(false);
    }
  });
});

describe('role helpers', () => {
  it('factionColor maps player→brass, rival→rival-red', () => {
    expect(factionColor('player')).toBe(SPEC.brass);
    expect(factionColor('rival')).toBe(SPEC.rival);
  });

  it('satchelTier grows in three bands with the carried amount', () => {
    expect(satchelTier(0)).toBe(1);
    expect(satchelTier(249)).toBe(1);
    expect(satchelTier(250)).toBe(2);
    expect(satchelTier(599)).toBe(2);
    expect(satchelTier(600)).toBe(3);
  });

  it('dangerStageColor is amber until ambush, then danger-red', () => {
    expect(dangerStageColor('threatened')).toBe(SPEC.brass);
    expect(dangerStageColor('safe')).toBe(SPEC.brass);
    expect(dangerStageColor('ambush')).toBe(SPEC.danger);
  });

  it('federalBarColor reddens by tier (50/70/85)', () => {
    expect(federalBarColor(0)).toBe(SPEC.brassDim);
    expect(federalBarColor(1)).toBe(SPEC.brass);
    expect(federalBarColor(2)).toBe('#b5502a');
    expect(federalBarColor(3)).toBe(SPEC.danger);
  });

  it('loyaltyMotion picks the band animation', () => {
    expect(loyaltyMotion('loyal')).toBe('loyaltyBob');
    expect(loyaltyMotion('wavering')).toBe('waverRoll');
    expect(loyaltyMotion('disloyal')).toBe('disloyalPulse');
  });
});
