// DISTRICT RACKET POSTURE — the PRESENTATION model (state/math, never pixels). Icons + labels + plain-number
// effect lines + the collector-risk preview + the 3-option picker. NO green/red — postures read by ICON +
// brass/bone; this test only checks the glyphs/text the renderer paints.
import { describe, it, expect } from 'vitest';
import {
  postureChip, posturePickerOptions, signedPct, postureEffectLines,
} from '../src/scenes/hud/posturePresentation';

describe('posture chips — icon + label per stance', () => {
  it('each stance has a distinct glyph + label', () => {
    expect(postureChip('AGGRESSIVE').icon).toBe('✊');
    expect(postureChip('FORTIFIED').icon).toBe('⛓');
    expect(postureChip('LOW_PROFILE').icon).toBe('▦');
    expect(postureChip('BALANCED').label).toBe('BALANCED');
    const icons = ['BALANCED', 'AGGRESSIVE', 'FORTIFIED', 'LOW_PROFILE'].map((p) => postureChip(p as 'BALANCED').icon);
    expect(new Set(icons).size).toBe(4); // all distinct
  });
  it('the picker offers the three non-default stances', () => {
    expect(posturePickerOptions().map((c) => c.posture)).toEqual(['AGGRESSIVE', 'FORTIFIED', 'LOW_PROFILE']);
  });
});

describe('effect lines — plain signed percents, with a collector-risk preview', () => {
  it('signedPct formats multipliers (real minus, no colour)', () => {
    expect(signedPct(1.25)).toBe('+25%');
    expect(signedPct(0.7)).toBe('−30%');
    expect(signedPct(1)).toBe('');
    expect(signedPct(0.7).includes('-')).toBe(false); // real minus, not a hyphen
  });
  it('AGGRESSIVE lines read the trade + a riskier-haul collector note', () => {
    const e = postureEffectLines('AGGRESSIVE');
    expect(e.lines.some((l) => /Dirty income \+25%/.test(l))).toBe(true);
    expect(e.lines.some((l) => /Local heat \+20%/.test(l))).toBe(true);
    expect(e.collectorRisk).toMatch(/Collectors:/);
    expect(e.collectorRisk).toMatch(/carry \+15%/);
  });
  it('FORTIFIED reads safer runs; LOW_PROFILE cuts heat + evidence; BALANCED is neutral', () => {
    expect(postureEffectLines('FORTIFIED').collectorRisk).toMatch(/safer/);
    const lp = postureEffectLines('LOW_PROFILE');
    expect(lp.lines.some((l) => /Local heat −30%/.test(l))).toBe(true);
    expect(lp.lines.some((l) => /Fed evidence −20%/.test(l))).toBe(true);
    expect(postureEffectLines('BALANCED').lines[0]).toMatch(/neutral/i);
  });
  it('no effect line contains a colour word (icons + brass/bone only)', () => {
    for (const p of ['AGGRESSIVE', 'FORTIFIED', 'LOW_PROFILE', 'BALANCED'] as const) {
      for (const l of postureEffectLines(p).lines) expect(l).not.toMatch(/red|green/i);
    }
  });
});
