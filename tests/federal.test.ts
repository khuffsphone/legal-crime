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
  FED_ARM_DELAY,
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

  it('telegraphs the imminent tier but only arms after FED_ARM_DELAY more ticks', () => {
    const s = createInitialState(1);
    s.player.heat = FED_WARN_TIER_3 + 5; // tier 3
    resolveFederalWarnings(s);
    expect(s.player.fedWarningLevel).toBe(3);
    expect(s.player.bustArmed).toBe(false); // telegraphed, not yet armed
    expect(s.log.some((e) => e.kind === 'fed-warning' && e.data?.tier === 3)).toBe(true);

    // It takes FED_ARM_DELAY additional imminent ticks to arm — guaranteed runway.
    for (let i = 0; i < FED_ARM_DELAY - 1; i++) {
      resolveFederalWarnings(s);
      expect(s.player.bustArmed).toBe(false);
    }
    resolveFederalWarnings(s);
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

describe('RTS-33 — the federal ladder is REACHABLE in normal play', () => {
  /** Extort the first `n` un-shaken fronts for `fid` (a normal expanding outfit). */
  function extortFronts(s: ReturnType<typeof createInitialState>, fid: string, n: number): number {
    let c = 0;
    for (const d of s.districts) for (const b of d.businesses) {
      if (b.kind === 'front' && !b.extortedBy && c < n) { b.extortedBy = fid; c++; }
    }
    return c;
  }

  it('SUSTAINED CRIME climbs the ladder: a modest outfit reaches NOTICE, an aggressive one WATCH+', () => {
    const modest = createInitialState(1, { bigCity: true });
    extortFronts(modest, 'player', 4);
    let modestPeak = 0;
    for (let w = 0; w < 30; w++) { tick(modest); modestPeak = Math.max(modestPeak, fedWarningTier(federalExposure(modest.player))); }
    expect(modestPeak).toBeGreaterThanOrEqual(1); // reaches at least NOTICE — the ladder fires in normal play

    const aggressive = createInitialState(1, { bigCity: true });
    extortFronts(aggressive, 'player', 8);
    let aggrPeak = 0;
    for (let w = 0; w < 30; w++) { tick(aggressive); aggrPeak = Math.max(aggrPeak, fedWarningTier(federalExposure(aggressive.player))); }
    expect(aggrPeak).toBeGreaterThanOrEqual(2); // WATCH / RAID — the reckless path is dangerous
  });

  it('it is NOT instant: a fresh modest outfit has not drawn NOTICE after a single week', () => {
    const s = createInitialState(1, { bigCity: true });
    extortFronts(s, 'player', 4);
    tick(s);
    expect(fedWarningTier(federalExposure(s.player))).toBe(0); // the Bureau hasn't noticed yet
  });

  it('GREASING THE BUREAU cools federal exposure back down (the channel has a real purpose)', () => {
    const s = createInitialState(1, { bigCity: true });
    // 12 fronts (was 8) so exposure is ROBUSTLY hot at the week-12 snapshot — a point-in-time read near the
    // tier-1 threshold is sensitive to the seeded RNG trajectory (which rival-AI changes legitimately shift);
    // a deeper dirty hoard saturates exposure so the precondition holds regardless. The subject under test
    // (greasing feds cools exposure by the relief cap) is unchanged.
    extortFronts(s, 'player', 12);
    for (let w = 0; w < 12; w++) tick(s);
    const hot = federalExposure(s.player);
    expect(fedWarningTier(hot)).toBeGreaterThanOrEqual(1); // the Bureau is onto them
    s.player.bribes.feds = 80; // grease The Bureau to the cap
    const cooled = federalExposure(s.player);
    expect(cooled).toBeLessThan(hot);
    expect(hot - cooled).toBe(FED_RELIEF_CAP); // by the full relief cap
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
