// Pure tests for the Environment Modular Kit (Phase 1, low-tier). State/math/data — never pixels. The
// corrected canon constants are HARD targets; the composer must stack them seamlessly and tile-calibrated.
import { describe, it, expect } from 'vitest';
import {
  composeLowTierFacade, doorClears, PIECE_HEIGHT_PX, LOW_TIER,
  FLOOR_GROUND, FLOOR_UPPER, FLOOR_SERVICE, DOOR_RESIDENTIAL, DOOR_COMMERCIAL,
  STOREFRONT_BULKHEAD, STOREFRONT_GLASS, STOREFRONT_TRANSOM, STOREFRONT_SIGN_BAND,
  CORNICE_DEFAULT, CORNICE_LARGE, PARAPET_DEFAULT, PARAPET_TALL, FASCIA_SIGN,
  V_SNAP, PX_PER_FT, FIGURE_PX, BAY_RUN_PX, TILE_W, TILE_H,
  type FacadePlan,
} from '../src/scenes/env/facadeKit';
import { facadeElevationSvg } from '../src/scenes/env/facadeElevationSvg';

describe('corrected canon constants (post-validation — HARD targets)', () => {
  it('scale + snap match the corrected values (not the pre-correction 8px/ft, 8px snap, 46–50px char)', () => {
    expect(TILE_W).toBe(128);
    expect(TILE_H).toBe(64);
    expect(FIGURE_PX).toBe(56);
    expect(PX_PER_FT).toBeCloseTo(9.3, 5);
    expect(V_SNAP).toBe(4);
    expect(BAY_RUN_PX).toBe(64);
  });
  it('floor / opening / roofline heights are the corrected values', () => {
    expect([FLOOR_GROUND, FLOOR_UPPER, FLOOR_SERVICE]).toEqual([132, 116, 76]);
    expect([DOOR_RESIDENTIAL, DOOR_COMMERCIAL]).toEqual([68, 76]);
    expect([STOREFRONT_BULKHEAD, STOREFRONT_GLASS, STOREFRONT_TRANSOM]).toEqual([20, 56, 20]);
    expect([CORNICE_DEFAULT, CORNICE_LARGE, PARAPET_DEFAULT, PARAPET_TALL]).toEqual([28, 40, 40, 56]);
  });
  it('every canon height sits on the 4px vertical snap grid', () => {
    const all = [FLOOR_GROUND, FLOOR_UPPER, FLOOR_SERVICE, DOOR_RESIDENTIAL, DOOR_COMMERCIAL,
      STOREFRONT_BULKHEAD, STOREFRONT_GLASS, STOREFRONT_TRANSOM, STOREFRONT_SIGN_BAND,
      CORNICE_DEFAULT, CORNICE_LARGE, PARAPET_DEFAULT, PARAPET_TALL, FASCIA_SIGN];
    for (const h of all) expect(h % V_SNAP).toBe(0);
  });
  it('the ground-floor storefront zone sums to exactly FLOOR_GROUND', () => {
    expect(STOREFRONT_BULKHEAD + STOREFRONT_GLASS + STOREFRONT_TRANSOM + STOREFRONT_SIGN_BAND).toBe(FLOOR_GROUND);
  });
  it('the 7 MVP pieces expose their corrected heights', () => {
    expect(PIECE_HEIGHT_PX).toEqual({
      brickUpper: FLOOR_UPPER, storefrontGlass: FLOOR_GROUND, storefrontBar: FLOOR_GROUND,
      doorCommercial: DOOR_COMMERCIAL, doorResidential: DOOR_RESIDENTIAL, parapet: PARAPET_DEFAULT, fasciaSign: FASCIA_SIGN,
    });
  });
});

const contiguous = (plan: FacadePlan) => {
  const bands = [...plan.bands].sort((a, b) => a.yTopPx - b.yTopPx);
  expect(bands[0].yTopPx).toBe(0); // first band starts at the roofline top
  let y = 0;
  for (const b of bands) {
    expect(b.yTopPx).toBe(y); // no gap, no overlap ⇒ no seam
    y += b.hPx;
  }
  expect(y).toBe(plan.heightPx); // last band ends exactly at the ground
};

describe('composeLowTierFacade — tile-calibrated, seamless stack', () => {
  it('2-storey glass front: correct total height, width, and a seamless band stack', () => {
    const plan = composeLowTierFacade({ floors: 2, frontageTiles: 2, storefront: 'glass' });
    expect(plan.widthPx).toBe(2 * BAY_RUN_PX); // 128
    expect(plan.heightPx).toBe(PARAPET_DEFAULT + FLOOR_UPPER + FLOOR_GROUND); // 40 + 116 + 132 = 288
    contiguous(plan);
  });
  it('1-storey bar front: ground floor + parapet only', () => {
    const plan = composeLowTierFacade({ floors: 1, frontageTiles: 3, storefront: 'bar' });
    expect(plan.widthPx).toBe(3 * BAY_RUN_PX); // 192
    expect(plan.heightPx).toBe(PARAPET_DEFAULT + FLOOR_GROUND); // 40 + 132 = 172
    contiguous(plan);
    // an opaque/bar front has NO display-glass panes
    expect(plan.openings.filter((o) => o.role === 'glass')).toHaveLength(0);
  });
  it('total height ties back to the doc low-tier range once the parapet is swapped for the default cornice', () => {
    for (const floors of [1, 2] as const) {
      const plan = composeLowTierFacade({ floors });
      const asCornice = plan.heightPx - PARAPET_DEFAULT + CORNICE_DEFAULT;
      expect(asCornice).toBeGreaterThanOrEqual(LOW_TIER.heightRangePx[0]); // 160
      expect(asCornice).toBeLessThanOrEqual(LOW_TIER.heightRangePx[1]);    // 276
    }
    expect(composeLowTierFacade({ floors: 1 }).heightPx - PARAPET_DEFAULT + CORNICE_DEFAULT).toBe(160);
    expect(composeLowTierFacade({ floors: 2 }).heightPx - PARAPET_DEFAULT + CORNICE_DEFAULT).toBe(276);
  });
  it('window rhythm: one window per bay per upper floor; glass panes per bay on a glass front', () => {
    const plan = composeLowTierFacade({ floors: 2, frontageTiles: 3, storefront: 'glass' });
    expect(plan.openings.filter((o) => o.role === 'window' && o.bayIndex >= 0)).toHaveLength(3); // 1 upper floor × 3 bays
    expect(plan.openings.filter((o) => o.role === 'glass')).toHaveLength(3);                       // 3 bays of display glass
  });
  it('entry door sits in bay 0 on the ground with the corrected door height', () => {
    const comm = composeLowTierFacade({ door: 'commercial' }).openings.find((o) => o.role === 'doorCommercial')!;
    expect(comm.hPx).toBe(DOOR_COMMERCIAL);
    expect(comm.bayIndex).toBe(0);
    expect(comm.yBottomPx).toBe(composeLowTierFacade({ door: 'commercial' }).heightPx); // feet on the ground
    const res = composeLowTierFacade({ door: 'residential' }).openings.find((o) => o.role === 'doorResidential')!;
    expect(res.hPx).toBe(DOOR_RESIDENTIAL);
  });
  it('rejects out-of-tier input', () => {
    expect(() => composeLowTierFacade({ floors: 4 as unknown as 2 })).toThrow(/floors/);
    expect(() => composeLowTierFacade({ frontageTiles: 5 as unknown as 3 })).toThrow(/frontage/);
  });
});

describe('doorClears — the 56px character source-of-truth (doc §9.3)', () => {
  it('both corrected doors clear the 56px thug', () => {
    expect(doorClears('doorCommercial')).toBe(true);  // 76 ≥ 56
    expect(doorClears('doorResidential')).toBe(true);  // 68 ≥ 56
  });
  it('a taller figure than the door would NOT clear (guards the pre-correction 46–50 assumption)', () => {
    expect(doorClears('doorResidential', 72)).toBe(false); // 68 < 72
  });
});

describe('facadeElevationSvg — pure preview render', () => {
  it('produces a well-formed SVG sized to the plan, with no NaN/undefined', () => {
    const plan = composeLowTierFacade({ floors: 2, frontageTiles: 2, storefront: 'glass' });
    const svg = facadeElevationSvg(plan, { title: 'low · 2fl · glass' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).not.toMatch(/NaN|undefined/);
    expect(svg).toContain(`y1="${plan.heightPx}"`); // the ground line sits at the plan height
  });
});
