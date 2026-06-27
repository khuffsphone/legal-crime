// DEV-DEBUG INJECTORS (QA / UAT) — a self-contained, query-param-gated, DEV-ONLY module. The whole module
// is INERT unless BOTH (a) it's a dev build AND (b) the matching param is present, so it can NEVER fire in a
// production / Steam build. Every injector routes through a LEGITIMATE path and changes NO game rule:
//   • ?arm            — equips each SELECTABLE player unit via the real spawnEnforcer equip path (a valid
//                       weapon tier + skill; never an invalid weapon state).
//   • ?debug=win|lose — flips ONLY the resolved endgame STATUS. It never razes an HQ, kills a family, or
//                       touches cash/turf — so sim state stays consistent (no corruption, no balance change).
// Pure & Phaser-free, so the guard + each injector are unit-tested at the STATE level. The scene calls
// applyDevDebug() once at new-game init and refreshes the armed units' views. No new mechanic; in normal
// play (no param / a production build) every function below is a no-op.

import { spawnEnforcer } from '../sim/movement';
import type { MovableUnit } from '../sim/movement';
import type { EndgameResult } from '../sim/endgame';
import type { GameState, WeaponTier } from '../sim';

/**
 * True in a DEV build (the Vite dev server / vitest); false in a production bundle. This is the single switch
 * that keeps every injector out of production / Steam: `import.meta.env.DEV` is `true` under `vite dev` and
 * `false` after `vite build`. Wrapped so a non-Vite / SSR context (no import.meta.env) is treated as NOT dev
 * (inert), never throwing. Tests pass `isDev` explicitly, so they never depend on the ambient build mode.
 */
export function isDevBuild(): boolean {
  try {
    return !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
  } catch {
    return false;
  }
}

export interface DebugFlags {
  arm: boolean;
  /** The weapon tier ?arm should equip (defaults to ARM_WEAPON / pistol; ignored unless `arm`). */
  armWeapon: WeaponTier;
  forceWin: boolean;
  forceLose: boolean;
}

/** ?arm's default loadout: a hit-ready pistol enforcer with solid skill (a VALID weapon tier). */
export const ARM_WEAPON: WeaponTier = 'pistol';
export const ARM_SKILL = 6;

/** Every VALID weapon tier ?arm can equip (canon set). Anything else falls back to the default. */
export const ARM_WEAPONS: readonly WeaponTier[] = ['pistol', 'shotgun', 'rifle', 'hitman', 'demolitions'];

const INERT: DebugFlags = { arm: false, armWeapon: ARM_WEAPON, forceWin: false, forceLose: false };

/**
 * Resolve a `?arm` value to a VALID weapon tier. `?arm` (no value) and `?arm=1` (the legacy form) → the
 * default pistol; `?arm=hitman|shotgun|rifle|demolitions|pistol` → that tier; anything unrecognised → the
 * default. Case-insensitive. Always returns a valid WeaponTier — never an invalid weapon state. Pure.
 */
export function parseArmWeapon(value: string | null): WeaponTier {
  const v = (value ?? '').toLowerCase();
  return (ARM_WEAPONS as readonly string[]).includes(v) ? (v as WeaponTier) : ARM_WEAPON;
}

/**
 * Parse the dev-debug flags from a URL query string. THE GUARD: returns all-false unless `isDev` is true AND
 * the matching param is present — so without a dev build, or without a param, the module is wholly inert.
 * `?debug=win` and `?debug=lose` are mutually exclusive by construction. Pure.
 */
export function parseDebugFlags(search: string, isDev: boolean): DebugFlags {
  if (!isDev || !search) return { ...INERT };
  const p = new URLSearchParams(search);
  const debug = p.get('debug');
  return {
    arm: p.has('arm'),
    armWeapon: parseArmWeapon(p.get('arm')),
    forceWin: debug === 'win',
    forceLose: debug === 'lose',
  };
}

/**
 * Equip one live unit as a proper enforcer by routing through the REAL constructor: build the canonical
 * enforcer with spawnEnforcer (the one place the game stamps weapon + skill) and copy its equip fields onto
 * the existing unit, preserving id / position / path. The unit can therefore never land in an invalid weapon
 * state. Pure (mutates the unit).
 */
export function equipAsEnforcer(
  u: MovableUnit,
  factionId: string,
  weapon: WeaponTier = ARM_WEAPON,
  skill: number = ARM_SKILL,
): void {
  const canonical = spawnEnforcer(u.id, u.pos.gx, u.pos.gy, factionId, u.speed, { weapon, skill });
  u.role = canonical.role; // 'enforcer'
  u.weapon = canonical.weapon; // a valid WeaponTier
  u.skill = canonical.skill;
}

/**
 * ?arm — equip every SELECTABLE player unit (player-faction, non-collector, not downed) via the real path.
 * Collectors stay autonomous (never armed). Returns the ids equipped so the scene can refresh just those
 * views. Pure (mutates the units in place; the units array identity is unchanged).
 */
export function armPlayerUnits(
  state: GameState,
  weapon: WeaponTier = ARM_WEAPON,
  skill: number = ARM_SKILL,
): string[] {
  const armed: string[] = [];
  for (const u of state.units) {
    if (u.factionId !== state.player.id || u.role === 'collector' || u.downed) continue;
    equipAsEnforcer(u, state.player.id, weapon, skill);
    armed.push(u.id);
  }
  return armed;
}

/**
 * ?debug=win|lose — flip ONLY the resolved endgame STATUS. It does NOT raze an HQ, kill a family, or touch
 * cash / turf, so the sim stays internally consistent (no corruption) — it just pre-resolves the result the
 * win/lose readout shows. Mirrors what the real evaluateEndgame `resolve()` writes (status, + a lossReason on
 * a loss) MINUS the elimination side-effects. Returns the synthetic EndgameResult. Pure (sets state.status).
 */
export function forceEndgame(state: GameState, outcome: 'win' | 'lose'): EndgameResult {
  if (outcome === 'win') {
    state.status = 'won';
    return { status: 'won', kind: 'win-last-standing', message: 'DEBUG: forced victory (QA).' };
  }
  state.status = 'lost';
  state.lossReason = 'dead';
  return { status: 'lost', kind: 'lose-hq', message: 'DEBUG: forced defeat (QA).' };
}

export interface DevDebugReport {
  /** Whether any injector fired (false ⇒ wholly inert: not a dev build, or no param). */
  active: boolean;
  /** Ids of the units ?arm equipped (empty unless ?arm fired). */
  armed: string[];
  /** The forced endgame, if ?debug=win|lose fired. */
  endgame: EndgameResult | null;
  /** Whether the scene should DISMISS the intro/help overlay so a forced endgame is reachable. True iff a
   * ?debug=win|lose flip fired — the endgame readout sits behind the opening legend otherwise. */
  dismissIntro: boolean;
}

/**
 * The single guarded entry the scene calls once at new-game init. INERT (a no-op, `active:false`) unless it's
 * a dev build AND a param is present. ?debug=win takes precedence over ?debug=lose if both somehow appear.
 * Never throws outside the browser. Pure aside from the mutations the chosen injectors make to `state`.
 */
export function applyDevDebug(state: GameState, search: string, isDev: boolean = isDevBuild()): DevDebugReport {
  const flags = parseDebugFlags(search, isDev);
  if (!flags.arm && !flags.forceWin && !flags.forceLose) {
    return { active: false, armed: [], endgame: null, dismissIntro: false };
  }
  const armed = flags.arm ? armPlayerUnits(state, flags.armWeapon) : [];
  const endgame = flags.forceWin ? forceEndgame(state, 'win') : flags.forceLose ? forceEndgame(state, 'lose') : null;
  return { active: true, armed, endgame, dismissIntro: endgame !== null };
}
