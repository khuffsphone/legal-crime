import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { applyCommand } from '../src/sim/commands';
import { launderCapacity } from '../src/sim/laundering';
import { resolveFederalWarnings } from '../src/sim/federal';
import { tick } from '../src/sim/tick';
import {
  LAUNDER_FEE_RATE,
  LAUNDER_CAP_PER_FRONT,
  FED_ARM_DELAY,
  FED_MAX_WARN_LEVEL,
  FED_WARN_TIER_3,
} from '../src/sim/constants';
import type { Business } from '../src/sim/types';

function front(id: string, extortedBy: string): Business {
  return { id, name: id, kind: 'front', baseIncome: 100, heatPerTick: 0, districtId: 'district-0', extortedBy, uncollected: 0 };
}

describe('Phase 19 — laundering is more accessible', () => {
  it('the new constants meet the accessibility targets (cheaper, higher throughput)', () => {
    expect(LAUNDER_FEE_RATE).toBeLessThanOrEqual(0.1); // was 0.15
    expect(LAUNDER_CAP_PER_FRONT).toBeGreaterThanOrEqual(400); // was 200
  });

  it('a single launder run clears a much larger hoard than the prior cap', () => {
    const s = createInitialState(1);
    s.player.cash = 20000;
    s.player.dirtyCash = 10000;
    s.districts[0].businesses = [front('f1', 'player')];
    expect(launderCapacity(s, 'player')).toBe(LAUNDER_CAP_PER_FRONT);

    applyCommand(s, { type: 'launder', familyId: 'player', amount: 99999 });
    // One run now clears at least the new per-front capacity (≥ 400, vs the old 200).
    expect(10000 - s.player.dirtyCash).toBeGreaterThanOrEqual(400);
  });
});

describe('Phase 19 — federal escalation is slowed (runway guaranteed)', () => {
  it('the imminent-tier arming delay is at least 3 ticks', () => {
    expect(FED_ARM_DELAY).toBeGreaterThanOrEqual(3);
  });

  it('there are at least FED_ARM_DELAY ticks between the imminent warning and an armed bust', () => {
    const s = createInitialState(1);
    s.player.heat = FED_WARN_TIER_3 + 5; // exposure stays at the imminent tier (no heat change here)
    s.player.dirtyCash = 0;

    let firstImminentTick = -1;
    let armedTick = -1;
    for (let t = 0; t < 20 && armedTick < 0; t++) {
      resolveFederalWarnings(s);
      if (firstImminentTick < 0 && s.player.fedWarningLevel >= FED_MAX_WARN_LEVEL) firstImminentTick = t;
      if (armedTick < 0 && s.player.bustArmed) armedTick = t;
    }
    expect(firstImminentTick).toBe(0);
    expect(armedTick - firstImminentTick).toBeGreaterThanOrEqual(FED_ARM_DELAY);
  });
});

describe('Phase 19 — early-game pacing', () => {
  it('starts every family with more runway than the prior 2000', () => {
    const s = createInitialState(1);
    expect(s.player.cash).toBe(3000);
    expect(s.player.cash).toBeGreaterThan(2000);
    for (const r of s.rivals) expect(r.cash).toBe(3000);
  });
});

describe('Phase 19 — determinism preserved under the rebalanced constants', () => {
  it('same seed yields a deeply equal state over many ticks', () => {
    const build = (seed: number) => {
      const s = createInitialState(seed);
      s.player.cash = 20000;
      s.player.dirtyCash = 12000;
      s.player.heat = 70;
      for (let i = 0; i < 12; i++) tick(s);
      return s;
    };
    expect(build(9)).toEqual(build(9));
  });
});
