// FOOTGUN FIX — a confirmation gate for the restart-to-Boot action (pure, Phaser-free, so the "one keypress
// can't wipe the game" rule is unit-tested). [B] used to call scene.start('BootScene') directly — a single
// keypress that ended the player's whole game with no prompt. This state machine forces an explicit confirm:
// the restart key only ARMS the gate; a separate confirm actually restarts; cancel disarms.

export interface RestartGate {
  /** Whether a restart has been requested and is awaiting confirmation. */
  armed: boolean;
}

export function initRestartGate(): RestartGate {
  return { armed: false };
}

/**
 * Press the restart key ([B]): NEVER restarts immediately — it ARMS the confirm prompt. Returns the armed
 * gate + `restart: false` (the footgun fix: one press can no longer wipe the game). Pure.
 */
export function armRestart(_gate: RestartGate): { gate: RestartGate; restart: boolean } {
  return { gate: { armed: true }, restart: false };
}

/**
 * Confirm ([Y]): restarts ONLY if the gate was armed. Returns `restart: true` exactly when an armed gate is
 * confirmed (and disarms it); a stray confirm with no pending restart is a no-op. Pure — the caller does the
 * actual scene.start only when `restart` is true.
 */
export function confirmRestart(gate: RestartGate): { gate: RestartGate; restart: boolean } {
  return gate.armed ? { gate: { armed: false }, restart: true } : { gate, restart: false };
}

/** Cancel ([Esc]): disarm the gate without restarting. Pure. */
export function cancelRestart(_gate: RestartGate): { gate: RestartGate; restart: boolean } {
  return { gate: { armed: false }, restart: false };
}
