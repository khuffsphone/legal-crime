// POLISH-PASS v2 · PACKAGE 4 — iso-occlusion math (no pixels). Locks the painter-depth + screen-AABB hull
// test, the critical-visual-state x-ray rule (never x-ray a fog-hidden unit), the dim→hide alphas, and the
// faction rim colours (downed desaturated, never rival-red).
import { describe, it, expect } from 'vitest';
import {
  occludedBy, isOccluded, criticalVisualState, occlusionDisplay, occlusionTargetAlpha, xRayRim,
  OCCLUDED_DIM_ALPHA, type BuildingHull,
} from '../src/scenes/render/isoOcclusion';

// a tall building whose silhouette covers screen x∈[100±60], y∈[40..200], at painter depth 20.
const TOWER: BuildingHull = { cx: 100, footY: 200, roofY: 40, halfW: 60, depth: 20 };

describe('occludedBy — nearer building + inside the silhouette', () => {
  it('a unit BEHIND the building (lower depth) under its silhouette is occluded', () => {
    expect(occludedBy(100, 120, 10, TOWER)).toBe(true);
  });
  it('a unit NEARER than the building (higher depth) is never occluded by it', () => {
    expect(occludedBy(100, 120, 25, TOWER)).toBe(false);
    expect(occludedBy(100, 120, 20, TOWER)).toBe(false); // equal depth → not occluded
  });
  it('a unit outside the silhouette x/y extent is not occluded', () => {
    expect(occludedBy(170, 120, 10, TOWER)).toBe(false); // x past the half-width
    expect(occludedBy(100, 220, 10, TOWER)).toBe(false); // y below the foot
    expect(occludedBy(100, 20, 10, TOWER)).toBe(false);  // y above the roof
  });
  it('isOccluded scans the whole hull set', () => {
    expect(isOccluded(100, 120, 10, [TOWER])).toBe(true);
    expect(isOccluded(300, 300, 10, [TOWER])).toBe(false);
    expect(isOccluded(100, 120, 10, [])).toBe(false);
  });
});

describe('criticalVisualState — keep these units findable', () => {
  it('any of fighting/shakedown/selected/hovered makes it critical', () => {
    expect(criticalVisualState({ fighting: true, shakedown: false, selected: false, hovered: false })).toBe(true);
    expect(criticalVisualState({ fighting: false, shakedown: true, selected: false, hovered: false })).toBe(true);
    expect(criticalVisualState({ fighting: false, shakedown: false, selected: true, hovered: false })).toBe(true);
    expect(criticalVisualState({ fighting: false, shakedown: false, selected: false, hovered: true })).toBe(true);
    expect(criticalVisualState({ fighting: false, shakedown: false, selected: false, hovered: false })).toBe(false);
  });
});

describe('occlusionDisplay — dim→hide, or x-ray for critical (but NEVER x-ray a fog-hidden unit)', () => {
  it('a visible, un-occluded unit is normal', () => {
    expect(occlusionDisplay(false, false, true)).toBe('normal');
    expect(occlusionDisplay(false, true, true)).toBe('normal');
  });
  it('occluded + NOT critical → hidden', () => {
    expect(occlusionDisplay(true, false, true)).toBe('hidden');
  });
  it('occluded + critical + REVEALED → x-ray (stay findable)', () => {
    expect(occlusionDisplay(true, true, true)).toBe('xray');
  });
  it('⭐ occluded + critical but FOG-HIDDEN → hidden, NEVER x-ray (a shrouded rival stays shrouded)', () => {
    expect(occlusionDisplay(true, true, false)).toBe('hidden');
  });
  it('the target alphas: normal full, hidden gone, x-ray a faint ghost under its rim', () => {
    expect(occlusionTargetAlpha('normal')).toBe(1);
    expect(occlusionTargetAlpha('hidden')).toBe(0);
    expect(occlusionTargetAlpha('xray')).toBe(OCCLUDED_DIM_ALPHA);
  });
});

describe('xRayRim — faction colours; downed desaturated, never rival-red', () => {
  it('player rims brass, rival rims the STATIC #9E1B1B (not a motion danger-red)', () => {
    expect(xRayRim('player', false)).toBe('#E3C36A');
    const r = xRayRim('rival', false);
    expect(r).toBe('#9E1B1B');
    expect(r).not.toBe('#E11D1D');
    expect(r).not.toBe('#FF5A2C');
  });
  it('a DOWNED body is desaturated — never rival-red', () => {
    const d = xRayRim('rival', true);
    expect(d).toBe('#6B6358');
    expect(d).not.toBe('#9E1B1B');
    expect(d).not.toBe('#E11D1D');
  });
});
