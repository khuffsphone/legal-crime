// FOOTGUN FIX — the restart-to-Boot confirm gate (state/math only). Locks the rule that a restart requires
// an explicit confirmation: pressing the key only ARMS it, confirm restarts ONLY when armed, cancel disarms.
import { describe, it, expect } from 'vitest';
import { initRestartGate, armRestart, confirmRestart, cancelRestart } from '../src/scenes/restartGate';

describe('the restart confirm gate — one keypress can NOT wipe the game', () => {
  it('starts disarmed', () => {
    expect(initRestartGate().armed).toBe(false);
  });

  it('pressing the restart key ARMS the confirm but NEVER restarts', () => {
    const r = armRestart(initRestartGate());
    expect(r.restart).toBe(false);   // ⭐ the footgun fix — no immediate restart
    expect(r.gate.armed).toBe(true); // now awaiting confirmation
  });

  it('confirm restarts ONLY when armed (a stray confirm is a no-op)', () => {
    // not armed → confirm does nothing
    expect(confirmRestart(initRestartGate()).restart).toBe(false);
    // armed → confirm restarts, and disarms
    const armed = armRestart(initRestartGate()).gate;
    const c = confirmRestart(armed);
    expect(c.restart).toBe(true);
    expect(c.gate.armed).toBe(false);
  });

  it('cancel disarms without restarting', () => {
    const armed = armRestart(initRestartGate()).gate;
    const c = cancelRestart(armed);
    expect(c.restart).toBe(false);
    expect(c.gate.armed).toBe(false);
  });

  it('the full footgun scenario: press → (prompt) → cancel leaves the game running; press → confirm restarts', () => {
    let gate = initRestartGate();
    // a fat-fingered [B] just arms the prompt — game still running
    gate = armRestart(gate).gate;
    expect(gate.armed).toBe(true);
    // [Esc] backs out — no restart, disarmed
    let step = cancelRestart(gate); gate = step.gate;
    expect(step.restart).toBe(false);
    expect(gate.armed).toBe(false);
    // a confirm now (with nothing armed) must NOT restart
    expect(confirmRestart(gate).restart).toBe(false);
    // deliberate restart: arm then confirm
    gate = armRestart(gate).gate;
    expect(confirmRestart(gate).restart).toBe(true);
  });
});
