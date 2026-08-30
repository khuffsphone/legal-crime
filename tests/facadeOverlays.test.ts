import { describe, expect, it } from 'vitest';
import {
  FACADE_OVERLAY_ART_REFS,
  facadeOverlayPlan,
  facadeOverlayStateFor,
  facadeOverlayVisible,
  projectOverlayPoint,
} from '../src/scenes/env/facadeOverlays';

describe('projected facade state overlays', () => {
  const base = { supportedHost: true, shutDown: false, playerFortified: false, viceRung: 0, districtWealth: 2 };

  it('selects shutdown > fortified > wealth and rejects unsupported hosts', () => {
    expect(facadeOverlayStateFor(base)).toBeNull();
    expect(facadeOverlayStateFor({ ...base, districtWealth: 4 })).toBe('wealth');
    expect(facadeOverlayStateFor({ ...base, viceRung: 3 })).toBe('fortified');
    expect(facadeOverlayStateFor({ ...base, playerFortified: true })).toBe('fortified');
    expect(facadeOverlayStateFor({ ...base, shutDown: true, playerFortified: true })).toBe('boarded');
    expect(facadeOverlayStateFor({ ...base, supportedHost: false, shutDown: true })).toBeNull();
  });

  it('projects the authored two-tile plane onto the real lit wall', () => {
    const wall = { cx: 100, cy: 200, hw: 54, hh: 27, h: 100 };
    expect(projectOverlayPoint(wall, 0, 0)).toEqual({ x: 100, y: 227 });
    expect(projectOverlayPoint(wall, 2, 0)).toEqual({ x: 154, y: 200 });
    expect(projectOverlayPoint(wall, 0, 288)).toEqual({ x: 100, y: 127 });
    expect(projectOverlayPoint(wall, 2, 288)).toEqual({ x: 154, y: 100 });
  });

  it('never hides shutdown boards at strategy zoom while suppressing decorative detail', () => {
    expect(facadeOverlayVisible('boarded', true, 0.3, true)).toBe(true);
    expect(facadeOverlayVisible('wealth', true, 0.3, true)).toBe(false);
    expect(facadeOverlayVisible('fortified', true, 0.45, true)).toBe(true);
    expect(facadeOverlayVisible('boarded', false, 0.6, true)).toBe(false);
    expect(facadeOverlayVisible('boarded', true, 0.6, false)).toBe(false);
  });

  it('matches the source motif counts and stays inside the wall', () => {
    const wall = { cx: 100, cy: 200, hw: 54, hh: 27, h: 100 };
    const expected = { boarded: 6, wealth: 5, fortified: 15 } as const;
    for (const state of ['boarded', 'wealth', 'fortified'] as const) {
      const plan = facadeOverlayPlan(state, wall);
      expect(plan.rects.length + plan.strokes.length).toBe(expected[state]);
      for (const point of [...plan.strokes.flatMap((entry) => [entry.from, entry.to]), ...plan.rects.flatMap((entry) => entry.points)]) {
        expect(point.x).toBeGreaterThanOrEqual(wall.cx);
        expect(point.x).toBeLessThanOrEqual(wall.cx + wall.hw);
        expect(point.y).toBeGreaterThanOrEqual(wall.cy - wall.h);
        expect(point.y).toBeLessThanOrEqual(wall.cy + wall.hh);
      }
    }
  });

  it('keeps supplied art provenance explicit for a corrected rerender pass', () => {
    expect(Object.values(FACADE_OVERLAY_ART_REFS)).toHaveLength(3);
    expect(FACADE_OVERLAY_ART_REFS.boarded).toContain('kit_overlay_damage_boarded.png');
  });
});
