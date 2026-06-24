// RTS-34 — pure tests for the make-it-beautiful helpers (no pixels): the cash count-up reaches its
// target, and the win/loss compass names the fastest path + the top threat.
import { describe, it, expect } from 'vitest';
import { rollToward, winLossCompass, ambientShown } from '../src/scenes/fx';
import { createInitialState } from '../src/sim/state';
import { TURF_DOMINANCE } from '../src/sim/constants';
import type { GameState } from '../src/sim/types';

function big(seed = 1): GameState { return createInitialState(seed, { bigCity: true }); }

describe('rollToward — the cash count-up', () => {
  it('eases toward the target and LANDS exactly on it (no asymptotic crawl)', () => {
    let shown = 0;
    const target = 5000;
    for (let i = 0; i < 200; i++) shown = rollToward(shown, target, 16);
    expect(shown).toBe(target); // arrived exactly
  });
  it('moves toward the target each step but does not overshoot', () => {
    const a = rollToward(0, 1000, 16);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1000);
  });
  it('rolls DOWN as well as up (a spend)', () => {
    const a = rollToward(1000, 0, 16);
    expect(a).toBeLessThan(1000);
    expect(a).toBeGreaterThanOrEqual(0);
  });
  it('a no-op when already on target', () => {
    expect(rollToward(777, 777, 16)).toBe(777);
  });
});

describe('winLossCompass — fastest path + top threat', () => {
  it('names the win path closest to done as the heading', () => {
    const s = big();
    // hand the player most of the city → DOMINATION should be the leading path
    const need = Math.ceil(TURF_DOMINANCE * s.districts.length);
    for (let i = 0; i < need; i++) s.districts[i].control.player = 60;
    const c = winLossCompass(s);
    expect(c.pathLabel).toBe('DOMINATION');
    expect(c.pathPct).toBeGreaterThan(0);
    expect(c.line).toContain('DOMINATION');
  });

  it('flags a rival overlord as the urgent threat', () => {
    const s = big();
    const total = s.districts.length;
    const need = Math.ceil(TURF_DOMINANCE * total);
    for (let i = 0; i < need - 1; i++) s.districts[i].control['rival-a'] = 60; // rival one block from the city
    const c = winLossCompass(s);
    expect(c.threatLabel).toContain('rival-a' === s.rivals[0].id ? s.rivals[0].name : 'leads');
    expect(c.threatUrgent).toBe(true);
    expect(c.line).toContain('⚠');
  });

  it('reads calm when no rival holds the city', () => {
    const s = big();
    const c = winLossCompass(s);
    expect(c.threatUrgent).toBe(false);
    expect(c.threatLabel).toMatch(/no rival holds the city/);
  });
});

describe('ambientShown — the fog-gate for ambient life', () => {
  it('hides an agent on an UNREVEALED tile and shows it on a revealed one', () => {
    const revealed = new Set(['5,5', '5,6']);
    const reveal = (gx: number, gy: number) => revealed.has(`${gx},${gy}`);
    expect(ambientShown(reveal, 5, 5)).toBe(true);   // revealed → drawn
    expect(ambientShown(reveal, 9, 9)).toBe(false);  // under fog → hidden
  });
  it('rounds the continuous agent position to a tile before testing', () => {
    const reveal = (gx: number, gy: number) => gx === 5 && gy === 6;
    expect(ambientShown(reveal, 4.7, 5.9)).toBe(true); // rounds to (5,6)
  });
  it('no predicate (e.g. ?reveal=1) ⇒ always shown', () => {
    expect(ambientShown(undefined, 99, 99)).toBe(true);
  });
});
