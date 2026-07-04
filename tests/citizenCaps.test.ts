// Citizen Life P0 — T7 mutation-verified tests: LOD / cap enforcement. Mutation table (spec §12.2): mutating
// the FAR cap away from 0 fails; a top-up > 3 fails. The zoom thresholds and cull constants MIRROR
// ambientLife.ts (FAR 0.45 / MID 0.8 / CULL_MARGIN 160 / OFFSCREEN_RETIRE 2) so the citizen layer never
// diverges from the ped layer it lives inside (recon §5).
import { describe, it, expect } from 'vitest';
import {
  FAR_ZOOM, MID_ZOOM, CULL_MARGIN, OFFSCREEN_RETIRE, TOP_UP_MAX,
  zoomBand, citizenCapForZoom, topUpBudget, perDistrictVisibleCap, softDistrictCeiling,
  PER_DISTRICT_VISIBLE_CAP,
} from '../src/scenes/citizens/caps';
import { LIVELINESS_CAPS } from '../src/sim';

describe('T7 — constants mirror AmbientLife (recon §5)', () => {
  it('zoom thresholds + cull constants match the ped layer', () => {
    expect(FAR_ZOOM).toBe(0.45);
    expect(MID_ZOOM).toBe(0.8);
    expect(CULL_MARGIN).toBe(160);
    expect(OFFSCREEN_RETIRE).toBe(2.0);
    expect(TOP_UP_MAX).toBe(3);
  });
});

describe('T7 — zoom band + per-zoom cap (spec §4.1/§4.2)', () => {
  it('zoomBand splits at 0.45 and 0.8', () => {
    expect(zoomBand(0.2)).toBe('far');
    expect(zoomBand(0.44)).toBe('far');
    expect(zoomBand(0.45)).toBe('mid');
    expect(zoomBand(0.79)).toBe('mid');
    expect(zoomBand(0.8)).toBe('close');
    expect(zoomBand(1.5)).toBe('close');
  });

  it('MUTATION: FAR cap is exactly 0 (all culled); MID is half; CLOSE is full', () => {
    for (const tier of ['low', 'med', 'high'] as const) {
      const base = LIVELINESS_CAPS[tier].peds; // 15 / 30 / 45
      expect(citizenCapForZoom(base, 0.2)).toBe(0);            // FAR must be zero
      expect(citizenCapForZoom(base, 0.6)).toBe(base >> 1);    // MID half
      expect(citizenCapForZoom(base, 1.0)).toBe(base);         // CLOSE full
    }
    // the spec's exact cap-table rows (§4.1): med close 30 / mid 15 / far 0
    expect(citizenCapForZoom(30, 1.0)).toBe(30);
    expect(citizenCapForZoom(30, 0.6)).toBe(15);
    expect(citizenCapForZoom(30, 0.2)).toBe(0);
    expect(citizenCapForZoom(45, 0.6)).toBe(22); // high mid target
  });
});

describe('T7 — top-up budget never exceeds 3 (spec §4.3)', () => {
  it('small steady deficit tops up 1/frame; a camera jump or big deficit tops up up to 3', () => {
    expect(topUpBudget(0)).toBe(0);
    expect(topUpBudget(4)).toBe(1);              // small, steady
    expect(topUpBudget(6)).toBe(1);
    expect(topUpBudget(6, true)).toBe(3);        // camera jump
    expect(topUpBudget(20)).toBe(3);             // large deficit
    expect(topUpBudget(2, true)).toBe(2);        // jump but only 2 missing
  });

  it('MUTATION: the budget is capped at TOP_UP_MAX for every input', () => {
    for (let d = 0; d < 100; d++) {
      expect(topUpBudget(d)).toBeLessThanOrEqual(TOP_UP_MAX);
      expect(topUpBudget(d, true)).toBeLessThanOrEqual(TOP_UP_MAX);
    }
  });
});

describe('T7 — per-district visible soft caps (spec §4.4)', () => {
  it('table matches the spec rows and FAR is always 0', () => {
    expect(PER_DISTRICT_VISIBLE_CAP.low).toEqual({ close: 5, mid: 2, far: 0 });
    expect(PER_DISTRICT_VISIBLE_CAP.med).toEqual({ close: 8, mid: 4, far: 0 });
    expect(PER_DISTRICT_VISIBLE_CAP.high).toEqual({ close: 12, mid: 6, far: 0 });
    expect(perDistrictVisibleCap('med', 1.0)).toBe(8);
    expect(perDistrictVisibleCap('med', 0.6)).toBe(4);
    expect(perDistrictVisibleCap('high', 0.2)).toBe(0);
  });

  it('a single visible district may stretch the soft cap by +25%, but not otherwise', () => {
    expect(softDistrictCeiling(8, false)).toBe(8);
    expect(softDistrictCeiling(8, true)).toBe(10); // ceil(8×1.25)
  });
});
