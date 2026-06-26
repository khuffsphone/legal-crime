// GLOBAL ACTIVE-PAUSE — the gate (state/math) + the keystone property: stepping the loop while paused does
// NOT advance sim state. The integration drives the REAL realtime update() with the paused step-dt and
// asserts the world clock / units don't move; unpaused, they do.
import { describe, it, expect } from 'vitest';
import { initPause, togglePause, setPaused, simStepDt } from '../src/scenes/pauseGate';
import { createInitialState } from '../src/sim/state';
import { spawnUnit, type MovableUnit } from '../src/sim/movement';
import { update } from '../src/sim/realtime';

describe('the pause gate — pure decisions', () => {
  it('starts unpaused and toggles', () => {
    let p = initPause();
    expect(p.paused).toBe(false);
    p = togglePause(p);
    expect(p.paused).toBe(true);
    p = togglePause(p);
    expect(p.paused).toBe(false);
    expect(setPaused(p, true).paused).toBe(true);
  });
  it('simStepDt is 0 while paused, the real dt while running', () => {
    expect(simStepDt({ paused: true }, 0.5)).toBe(0);
    expect(simStepDt({ paused: false }, 0.5)).toBe(0.5);
    expect(simStepDt({ paused: false }, -1)).toBe(0); // never negative
  });
});

describe('⭐ stepping the loop while PAUSED does not advance sim state', () => {
  function world() {
    const s = createInitialState(1, { bigCity: true });
    // a unit walking east — its position is a clean "did the sim advance?" probe.
    const u: MovableUnit = { ...spawnUnit('p', 5, 5), path: [{ gx: 6, gy: 5 }, { gx: 7, gy: 5 }] };
    s.units = [u];
    s.weekElapsed = 0;
    return { s, u };
  }

  it('PAUSED: the week clock + the unit position are FROZEN', () => {
    const { s, u } = world();
    const beforeWeek = s.weekElapsed;
    const beforePos = { ...u.pos };
    const paused = initPause(); // not paused…
    const p = togglePause(paused); // …now paused
    for (let i = 0; i < 20; i++) update(s, simStepDt(p, 0.2), 1e9); // feed the gated (0) dt
    expect(s.weekElapsed).toBe(beforeWeek);      // clock did not advance
    expect(s.units[0].pos).toEqual(beforePos);   // unit did not move
  });

  it('RUNNING: the same steps DO advance the world (the gate is the only difference)', () => {
    const { s } = world();
    const running = initPause(); // not paused
    for (let i = 0; i < 20; i++) update(s, simStepDt(running, 0.2), 1e9);
    expect(s.weekElapsed).toBeGreaterThan(0);    // clock advanced
    expect(s.units[0].pos).not.toEqual({ gx: 5, gy: 5 }); // unit moved along its path
  });
});
