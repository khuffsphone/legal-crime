// GLOBAL ACTIVE-PAUSE — the pure gate (Phaser-free, unit-tested). Pause is a RENDER/LOOP-level decision,
// NOT a sim change: while paused the scene simply STOPS feeding the sim tick (the dt it passes is 0), so the
// world freezes — but the camera + HUD keep their own real-time clock and input still flows, so the player
// can look around and issue/queue orders (an "active pause"). tick()/applyCommand() are untouched.

export interface PauseState {
  paused: boolean;
}

export function initPause(): PauseState {
  return { paused: false };
}

/** Flip the pause. Pure. */
export function togglePause(s: PauseState): PauseState {
  return { paused: !s.paused };
}

export function setPaused(_s: PauseState, paused: boolean): PauseState {
  return { paused };
}

/**
 * The sim dt the loop should feed the tick this frame: 0 while paused (so NOTHING in the sim advances),
 * else the real (already speed-scaled) dt. The keystone of the gate — stepping the loop while paused can
 * never advance sim state. Pure.
 */
export function simStepDt(s: PauseState, dt: number): number {
  return s.paused ? 0 : Math.max(0, dt);
}
