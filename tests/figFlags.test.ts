// PROCEDURAL FIDELITY flags — both default to the identity so the current renderer is unchanged unless
// flagged; ?figscale parses a target px and clamps; the scale factor is base-relative.
import { describe, it, expect } from 'vitest';
import {
  parseFig2Flag, parseFigScalePx, figScaleFactor,
  FIG_BASE_PX, FIG_SCALE_MIN, FIG_SCALE_MAX, FIG2_DEFAULT,
} from '../src/scenes/figFlags';

describe('parseFig2Flag — the A/B renderer toggle', () => {
  it('defaults OFF (current renderer unchanged) when absent', () => {
    expect(FIG2_DEFAULT).toBe(false);
    expect(parseFig2Flag('')).toBe(false);
    expect(parseFig2Flag('?reveal=1&figscale=72')).toBe(false);
  });
  it('turns ON for ?fig2 and affirmative spellings (case-insensitive)', () => {
    for (const s of ['?fig2', '?fig2=on', '?fig2=1', '?fig2=true', '?fig2=YES', '?reveal=1&fig2=on']) {
      expect(parseFig2Flag(s)).toBe(true);
    }
  });
  it('turns OFF for negatives and falls back to default on garbage', () => {
    expect(parseFig2Flag('?fig2=off')).toBe(false);
    expect(parseFig2Flag('?fig2=0')).toBe(false);
    expect(parseFig2Flag('?fig2=banana')).toBe(FIG2_DEFAULT);
  });
});

describe('parseFigScalePx — the figure-height knob', () => {
  it('defaults to FIG_BASE_PX (56 → no-op) when absent or unparseable', () => {
    expect(parseFigScalePx('')).toBe(FIG_BASE_PX);
    expect(parseFigScalePx('?fig2=on')).toBe(FIG_BASE_PX);
    expect(parseFigScalePx('?figscale=abc')).toBe(FIG_BASE_PX);
    expect(parseFigScalePx('?figscale=0')).toBe(FIG_BASE_PX);
    expect(parseFigScalePx('?figscale=-9')).toBe(FIG_BASE_PX);
  });
  it('reads the requested target px (the K test points)', () => {
    expect(parseFigScalePx('?figscale=56')).toBe(56);
    expect(parseFigScalePx('?figscale=72')).toBe(72);
    expect(parseFigScalePx('?figscale=80')).toBe(80);
  });
  it('clamps to [MIN, MAX] so a typo cannot break the board', () => {
    expect(parseFigScalePx('?figscale=5')).toBe(FIG_SCALE_MIN);
    expect(parseFigScalePx('?figscale=999')).toBe(FIG_SCALE_MAX);
  });
});

describe('figScaleFactor — base-relative uniform scale', () => {
  it('is exactly 1.0 at the base height (current figure unchanged)', () => {
    expect(figScaleFactor(FIG_BASE_PX)).toBe(1);
  });
  it('scales up proportionally above base', () => {
    expect(figScaleFactor(72)).toBeCloseTo(72 / 56, 5);
    expect(figScaleFactor(80)).toBeCloseTo(80 / 56, 5);
    expect(figScaleFactor(112)).toBeCloseTo(2, 5);
  });
});
