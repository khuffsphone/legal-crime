import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  dirtyExposurePoints,
  fedExposureRelief,
  federalExposure,
  fedWarningTier,
  resolveFederalWarnings,
} from '../src/sim/federal';
import { resolveLaw } from '../src/sim/law';
import { tick } from '../src/sim/tick';
import { playerView } from '../src/scenes/adapter';
import {
  HEAT_MAX,
  DIRTY_EXPOSURE_CAP,
  DIRTY_EXPOSURE_DIVISOR,
  FED_RELIEF_CAP,
  FED_RELIEF_PER_LEVEL,
  FED_WARN_TIER_1,
  FED_WARN_TIER_2,
  FED_WARN_TIER_3,
  FED_DIRTY_DANGER,
} from '../src/sim/constants';

describe('exposure helpers', () => {
  it('dirtyExposurePoints is floor(dirty / divisor), capped', () => {
    expect(dirtyExposurePoints(0)).toBe(0);
    expect(dirtyExposurePoints(DIRTY_EXPOSURE_DIVISOR)).toBe(1);
    expect(dirtyExposurePoints(DIRTY_EXPOSURE_DIVISOR * 5)).toBe(5);
    expect(dirtyExposurePoints(DIRTY_EXPOSURE_DIVISOR * 10000)).toBe(DIRTY_EXPOSURE_CAP);
  });

  it('fedExposureRelief is feds * per-level, capped', () => {
    expect(fedExposureRelief(0)).toBe(0);
    expect(fedExposureRelief(10)).toBe(10 * FED_RELIEF_PER_LEVEL);
    expect(fedExposureRelief(100000)).toBe(FED_RELIEF_CAP);
  });

  it('federalExposure combines heat + dirty hoard − Bureau relief, clamped [0,100]', () => {
    const s = createInitialState(1);
    s.player.heat = 40;
    s.player.dirtyCash = DIRTY_EXPOSURE_DIVISOR * 10; // +10 points
    expect(federalExposure(s.player)).toBe(50);
    s.player.bribes.feds = 20; // relief 10
    expect(federalExposure(s.player)).toBe(40);
    s.player.heat = 100;
    s.player.dirtyCash = DIRTY_EXPOSURE_DIVISOR * 50;
    s.player.bribes.feds = 0;
    expect(federalExposure(s.player)).toBe(100); // clamped
  });

  it('fedWarningTier maps exposure to 0..3 at the thresholds', () => {
    expect(fedWarningTier(FED_WARN_TIER_1 - 1)).toBe(0);
    expect(fedWarningTier(FED_WARN_TIER_1)).toBe(1);
    expect(fedWarningTier(FED_WARN_TIER_2)).toBe(2);
    expect(fedWarningTier(FED_WARN_TIER_3)).toBe(3);
    expect(fedWarningTier(100)).toBe(3);
  });
});

describe('resolveFederalWarnings — escalation', () => {
  it('emits a player warning when exposure crosses a higher tier', () => {
    const s = createInitialState(1);
    s.player.heat = FED_WARN_TIER_1 + 2; // tier 1
    resolveFederalWarnings(s);
    expect(s.player.fedWarningLevel).toBe(1);
    expect(s.log.some((e) => e.kind === 'fed-warning' && e.data?.tier === 1)).toBe(true);
  });

  it('does not arm the bust on the tick the imminent tier first fires, but arms the next', () => {
    const s = createInitialState(1);
    s.player.heat = FED_WARN_TIER_3 + 5; // tier 3
    resolveFederalWarnings(s);
    expect(s.player.fedWarningLevel).toBe(3);
    expect(s.player.bustArmed).toBe(false); // telegraphed, not yet armed
    expect(s.log.some((e) => e.kind === 'fed-warning' && e.data?.tier === 3)).toBe(true);

    resolveFederalWarnings(s); // a tick later, still imminent
    expect(s.player.bustArmed).toBe(true);
  });

  it('cooling off below the imminent tier disarms the bust', () => {
    const s = createInitialState(1);
    s.player.fedWarningLevel = 3;
    s.player.bustArmed = true;
    s.player.heat = 10; // exposure now well below tier 1
    resolveFederalWarnings(s);
    expect(s.player.fedWarningLevel).toBe(0);
    expect(s.player.bustArmed).toBe(false);
    expect(s.log.some((e) => e.kind === 'fed-cooldown')).toBe(true);
  });
});

describe('the bust gate guarantees the telegraph', () => {
  it('an unarmed player can NEVER be federally busted, even at max heat (80 seeds)', () => {
    for (let seed = 0; seed < 80; seed++) {
      const s = createInitialState(seed);
      s.player.heat = HEAT_MAX; // bust-level heat
      // bustArmed defaults false — the danger has not been telegraphed to its terminal point
      resolveLaw(s);
      expect(s.player.alive).toBe(true);
      expect(s.log.some((e) => e.kind === 'raid-bust')).toBe(false);
    }
  });

  it('one tick through the pipeline telegraphs (tier 3) without busting; the next tick arms', () => {
    const s = createInitialState(1);
    s.player.cash = 12000;
    s.player.dirtyCash = 10000; // a fat dirty hoard drives exposure to the imminent tier
    s.player.heat = 45;
    tick(s);
    expect(s.player.fedWarningLevel).toBe(3);
    expect(s.player.bustArmed).toBe(false);
    expect(s.player.alive).toBe(true); // no bust on the warning tick
    expect(s.log.some((e) => e.kind === 'fed-warning' && e.data?.tier === 3)).toBe(true);
  });
});

describe('view-model feedback for the danger chain', () => {
  it('exposes federal exposure, tier, and the active warning', () => {
    const s = createInitialState(1);
    s.player.heat = FED_WARN_TIER_1 + 5; // tier 1
    const v = playerView(s);
    expect(v.federalExposure).toBe(s.player.heat); // no dirty/feds here
    expect(v.federalTier).toBe(1);
    expect(v.federalWarning).toMatch(/Bureau/);
  });

  it('the launder prompt appears only when dirty exceeds the danger threshold', () => {
    const s = createInitialState(1);
    s.player.cash = 20000;
    s.player.dirtyCash = FED_DIRTY_DANGER;
    expect(playerView(s).launderPrompt).toBe(false);
    s.player.dirtyCash = FED_DIRTY_DANGER + 1;
    const v = playerView(s);
    expect(v.launderPrompt).toBe(true);
    expect(v.launderCapacity).toBeGreaterThanOrEqual(0);
  });

  it('the Bureau shield flag reflects the feds bribe', () => {
    const s = createInitialState(1);
    expect(playerView(s).bureauShielded).toBe(false);
    s.player.bribes.feds = 30;
    const v = playerView(s);
    expect(v.bureauBribe).toBe(30);
    expect(v.bureauShield).toBeGreaterThan(0);
    expect(v.bureauShielded).toBe(true);
  });
});

describe('determinism with federal telegraphing active', () => {
  it('same seed yields a deeply equal state over many ticks', () => {
    const build = (seed: number) => {
      const s = createInitialState(seed);
      s.player.cash = 20000;
      s.player.dirtyCash = 15000;
      s.player.heat = 60;
      for (let i = 0; i < 10; i++) tick(s);
      return s;
    };
    expect(build(7)).toEqual(build(7));
  });
});
