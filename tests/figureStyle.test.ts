// PROCEDURAL FIGURE STYLE (BRASSMERE figure guide) — the guide's IMPLEMENTATION TEST LIST, asserted at the
// LOGIC/render-state level (never pixels). Vector-only, height clamps, faction-on-plate-not-body, no rival-red
// or danger on the body, downed desaturated, hidden rival → no draw, shadow-below-plate-below-body, clamped
// line widths, and the seven archetype silhouettes.
import { describe, it, expect } from 'vitest';
import {
  ARCHETYPES, BODY_TONES, DOWNED_TONES, PLATE, DANGER,
  OUTER_OUTLINE_PX, INNER_LINE_PX, OUTER_OUTLINE_RANGE, INNER_LINE_RANGE,
  GLOBAL_HEIGHT_CLAMP, figureHeightFor, clampLineWidth, figurePlan, parseFigScale,
  FIGSCALE_RANGE, type FigureArchetype,
} from '../src/scenes/figureStyle';

const ALL: FigureArchetype[] = ['thug', 'gunner', 'collector', 'boss', 'civilian', 'police', 'rival'];
const FACTION_COLOURS = [PLATE.player, PLATE.playerHi, PLATE.rival];
const DANGER_COLOURS = [DANGER.core, DANGER.muzzle];

/** HSV saturation of a packed RGB int. */
function saturation(rgb: number): number {
  const r = (rgb >> 16) & 0xff, g = (rgb >> 8) & 0xff, b = rgb & 0xff;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

describe('vector-only renderer (no raster assets)', () => {
  it('every figure plan is vector — raster is always false, no texture key on the plan', () => {
    for (const archetype of ALL) {
      const plan = figurePlan({ archetype, faction: 'player', revealed: true });
      expect(plan.raster).toBe(false);
      expect('texture' in plan).toBe(false);
      expect('textureKey' in plan).toBe(false);
    }
  });
});

describe('figure heights clamp to 48..72 by archetype', () => {
  it('each archetype seed + clamped override stays within the global 48..72', () => {
    for (const archetype of ALL) {
      expect(figureHeightFor(archetype)).toBeGreaterThanOrEqual(GLOBAL_HEIGHT_CLAMP[0]);
      expect(figureHeightFor(archetype)).toBeLessThanOrEqual(GLOBAL_HEIGHT_CLAMP[1]);
      expect(figureHeightFor(archetype, 999)).toBeLessThanOrEqual(72); // never above the clamp
      expect(figureHeightFor(archetype, 1)).toBeGreaterThanOrEqual(48); // never below
    }
  });
  it('thug seed is in its guide range', () => {
    expect(ARCHETYPES.thug.heightSeed).toBe(58);
    const [lo, hi] = ARCHETYPES.thug.heightRange;
    expect(58).toBeGreaterThanOrEqual(lo);
    expect(58).toBeLessThanOrEqual(hi);
  });
});

describe('faction colours live on the plate/overlay, NEVER as body fill', () => {
  it('no body tone (lit or downed) is a faction colour', () => {
    for (const tone of [...BODY_TONES, ...DOWNED_TONES]) expect(FACTION_COLOURS).not.toContain(tone);
  });
  it('player/rival plan reads faction from the plate, not the body or hatband', () => {
    expect(figurePlan({ archetype: 'thug', faction: 'player', revealed: true }).plate).toBe(PLATE.player);
    expect(figurePlan({ archetype: 'thug', faction: 'rival', revealed: true }).plate).toBe(PLATE.rival);
    for (const faction of ['player', 'rival'] as const) {
      const plan = figurePlan({ archetype: 'thug', faction, revealed: true });
      expect(FACTION_COLOURS).not.toContain(plan.hatband); // hatband is noir
      for (const tone of plan.bodyTones) expect(FACTION_COLOURS).not.toContain(tone);
    }
  });
});

describe('rival body is not #9E1B1B', () => {
  it('a revealed rival uses noir body tones; red is only the plate', () => {
    const plan = figurePlan({ archetype: 'rival', faction: 'rival', revealed: true });
    expect(plan.bodyTones).not.toContain(0x9e1b1b);
    expect(plan.hatband).not.toBe(0x9e1b1b);
    expect(plan.plate).toBe(0x9e1b1b); // identity is the plate only
  });
});

describe('danger colours absent from the idle figure + plate identity', () => {
  it('no danger colour appears in any body tone, hatband, or plate', () => {
    for (const archetype of ALL) {
      for (const faction of ['player', 'rival', 'neutral'] as const) {
        const plan = figurePlan({ archetype, faction, revealed: true });
        for (const tone of plan.bodyTones) expect(DANGER_COLOURS).not.toContain(tone);
        expect(DANGER_COLOURS).not.toContain(plan.hatband);
        if (plan.plate !== null) expect(DANGER_COLOURS).not.toContain(plan.plate);
      }
    }
  });
});

describe('downed figure is desaturated and never rival-red', () => {
  it('downed body tones are near-neutral greys, no rival-red, plate is grey not red', () => {
    const plan = figurePlan({ archetype: 'thug', faction: 'rival', revealed: true, downed: true });
    expect(plan.downed).toBe(true);
    for (const tone of plan.bodyTones) {
      expect(tone).not.toBe(0x9e1b1b);
      expect(saturation(tone)).toBeLessThan(0.3); // desaturated
    }
    expect(plan.plate).toBe(PLATE.downed);
    expect(plan.plate).not.toBe(PLATE.rival);
  });
});

describe('NO-X-RAY — a hidden rival returns no draw', () => {
  it('un-revealed rival draws nothing (no body, plate, shadow, hover)', () => {
    const hidden = figurePlan({ archetype: 'thug', faction: 'rival', revealed: false });
    expect(hidden.draw).toBe(false);
    expect(hidden.plate).toBeNull();
    expect(hidden.bodyTones).toEqual([]);
  });
  it('a player unit and a REVEALED rival do draw', () => {
    expect(figurePlan({ archetype: 'thug', faction: 'player', revealed: false }).draw).toBe(true); // player always
    expect(figurePlan({ archetype: 'thug', faction: 'rival', revealed: true }).draw).toBe(true);
  });
});

describe('grounding order + camera ownership', () => {
  it('shadow sits below the plate below the body; figures are never on the HUD camera', () => {
    const plan = figurePlan({ archetype: 'thug', faction: 'player', revealed: true });
    expect(plan.depthOrder.shadow).toBeLessThan(plan.depthOrder.plate);
    expect(plan.depthOrder.plate).toBeLessThan(plan.depthOrder.body);
    expect(plan.hudCamera).toBe(false);
  });
});

describe('outline + interior line widths clamp to the guide ranges', () => {
  it('seeds are in range and the clamp bounds out-of-range inputs', () => {
    expect(OUTER_OUTLINE_PX).toBeGreaterThanOrEqual(OUTER_OUTLINE_RANGE[0]);
    expect(OUTER_OUTLINE_PX).toBeLessThanOrEqual(OUTER_OUTLINE_RANGE[1]);
    expect(INNER_LINE_PX).toBeGreaterThanOrEqual(INNER_LINE_RANGE[0]);
    expect(INNER_LINE_PX).toBeLessThanOrEqual(INNER_LINE_RANGE[1]);
    expect(clampLineWidth(10, 'outer')).toBe(OUTER_OUTLINE_RANGE[1]);
    expect(clampLineWidth(0.1, 'outer')).toBe(OUTER_OUTLINE_RANGE[0]);
    expect(clampLineWidth(10, 'inner')).toBe(INNER_LINE_RANGE[1]);
    expect(clampLineWidth(0.1, 'inner')).toBe(INNER_LINE_RANGE[0]);
  });
});

describe('archetype silhouette config covers the seven kinds', () => {
  it('thug, gunner, collector, boss, civilian, police, rival are all present', () => {
    for (const a of ALL) expect(ARCHETYPES[a]).toBeTruthy();
    expect(Object.keys(ARCHETYPES).sort()).toEqual([...ALL].sort());
    expect(ARCHETYPES.civilian.hasPlate).toBe(false); // civilians carry no faction plate
  });
});

describe('?figscale dev knob — K\'s A/B render scale (separate from the canon clamp)', () => {
  it('defaults to the thug seed, parses a value, and clamps to the dev range (allows ~80)', () => {
    expect(parseFigScale('')).toBe(ARCHETYPES.thug.heightSeed);
    expect(parseFigScale('?fig2&figscale=72')).toBe(72);
    expect(parseFigScale('?figscale=80')).toBe(80); // dev knob may exceed the 72 canon clamp
    expect(parseFigScale('?figscale=9999')).toBe(FIGSCALE_RANGE[1]);
    expect(parseFigScale('?figscale=1')).toBe(FIGSCALE_RANGE[0]);
  });
});
