// DEV-DEBUG INJECTORS (QA / UAT) — a self-contained, query-param-gated, DEV-ONLY module. The whole module
// is INERT unless BOTH (a) it's a dev build AND (b) the matching param is present, so it can NEVER fire in a
// production / Steam build. Every injector routes through a LEGITIMATE path and changes NO game rule:
//   • ?arm[=tier|all] — equips each SELECTABLE player unit via the real spawnEnforcer equip path (a valid
//                       weapon tier + skill; never an invalid weapon state). ?arm=all round-robins every
//                       tier across the units so QA sees each weapon's animation+feedback in one board.
//   • ?debug=win|lose — flips ONLY the resolved endgame STATUS. It never razes an HQ, kills a family, or
//                       touches cash/turf — so sim state stays consistent (no corruption, no balance change).
//   • ?scenario=…     — primes a deterministic QA board (rival-contest / fed-watch / save-roundtrip) by
//                       reusing existing sim systems; reveals NO hidden rival (NO-X-RAY: fog untouched).
//   • hasDevFlags()   — the MENU-BYPASS guard: lets the front door auto-start a configured game from a
//                       cold dev deep-link (?debug / ?arm / ?scenario / ?skipmenu), inert in production.
// Pure & Phaser-free, so the guard + each injector are unit-tested at the STATE level. The scene calls
// applyDevDebug() once at new-game init and refreshes the armed units' views. No new mechanic; in normal
// play (no param / a production build) every function below is a no-op.

import { spawnEnforcer } from '../sim/movement';
import { resolveStrategicPulse } from '../sim';
import { FED_WARN_TIER_2 } from '../sim/constants';
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
  /** ?arm=all — equip the selectable units with a DIFFERENT tier each (round-robin) so QA can exercise
   *  every weapon's animation + feedback in one board. Takes precedence over `armWeapon` when set. */
  armAll: boolean;
  forceWin: boolean;
  forceLose: boolean;
}

/** ?arm's default loadout: a hit-ready pistol enforcer with solid skill (a VALID weapon tier). */
export const ARM_WEAPON: WeaponTier = 'pistol';
export const ARM_SKILL = 6;

/** Every VALID weapon tier ?arm can equip (canon set). Anything else falls back to the default. */
export const ARM_WEAPONS: readonly WeaponTier[] = ['pistol', 'shotgun', 'rifle', 'hitman', 'demolitions'];

const INERT: DebugFlags = { arm: false, armWeapon: ARM_WEAPON, armAll: false, forceWin: false, forceLose: false };

/**
 * The query-param KEYS that mark a URL as a dev/QA deep-link (the menu-bypass set). Presence of ANY of
 * these — under a dev build — means QA wants to skip the front door and land straight in a configured
 * game. The unrelated inspection flags (?reveal / ?art / ?life / ?market) are deliberately NOT here: they
 * tweak a normal session and must still show the menu. Mirrors CANON's Debug/QA flag list.
 */
export const DEV_FLAG_KEYS: readonly string[] = ['debug', 'arm', 'scenario', 'skipmenu'];

/**
 * THE MENU-BYPASS GUARD (Task 1): true iff it's a dev build AND the URL carries any dev/QA flag. Pure.
 * The MainMenuScene calls this to decide whether to auto-start a fresh game from a COLD load so a dev
 * deep-link (?debug=win, ?arm=…, ?scenario=…, ?skipmenu) reaches the game instead of dead-ending at the
 * menu. Inert (false) in production or without a flag, so the normal boot still shows the front door.
 */
export function hasDevFlags(search: string, isDev: boolean = isDevBuild()): boolean {
  if (!isDev || !search) return false;
  const p = new URLSearchParams(search);
  return DEV_FLAG_KEYS.some((k) => p.has(k));
}

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
    armAll: (p.get('arm') ?? '').toLowerCase() === 'all',
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
 * ?arm=all — equip each SELECTABLE player unit with a DIFFERENT weapon tier, round-robin across the canon
 * set (pistol → shotgun → rifle → hitman → demolitions → pistol …), via the SAME real spawn/equip path.
 * So a board with ≥5 selectable units shows every weapon's silhouette + animation + feedback side-by-side
 * for QA, and the combat caps still hold (each unit is a valid enforcer). Collectors stay autonomous.
 * Returns the ids equipped. Pure (mutates the units in place).
 */
export function armPlayerUnitsVaried(state: GameState, skill: number = ARM_SKILL): string[] {
  const armed: string[] = [];
  let i = 0;
  for (const u of state.units) {
    if (u.factionId !== state.player.id || u.role === 'collector' || u.downed) continue;
    equipAsEnforcer(u, state.player.id, ARM_WEAPONS[i % ARM_WEAPONS.length], skill);
    armed.push(u.id);
    i += 1;
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
  const armed = flags.arm
    ? flags.armAll
      ? armPlayerUnitsVaried(state)
      : armPlayerUnits(state, flags.armWeapon)
    : [];
  const endgame = flags.forceWin ? forceEndgame(state, 'win') : flags.forceLose ? forceEndgame(state, 'lose') : null;
  return { active: true, armed, endgame, dismissIntro: endgame !== null };
}

// ── ?scenario= — deterministic QA board states (Task 3) ────────────────────────────────────────────
// Each scenario PRIMES an interesting situation by exercising EXISTING sim systems only — it changes no
// rule, reveals NO hidden rival (NO-X-RAY: it never touches fog/visibility, which is a view concern), and
// is wholly inert outside a dev build. Pure & deterministic (resolveStrategicPulse draws no RNG).

/** The canon QA scenarios. Anything else → null (inert). */
export const SCENARIOS: readonly string[] = ['rival-contest', 'fed-watch', 'save-roundtrip'];
export type DevScenario = 'rival-contest' | 'fed-watch' | 'save-roundtrip';

/** How many strategic pulses ?scenario=rival-contest fast-forwards (matches the legacy ?debug=turf feel). */
export const SCENARIO_PULSES = 8;

/**
 * Resolve a `?scenario=` value to a known scenario, or null. THE GUARD: null unless `isDev` AND the value
 * is one of SCENARIOS. Case-insensitive. Pure.
 */
export function parseScenario(search: string, isDev: boolean = isDevBuild()): DevScenario | null {
  if (!isDev || !search) return null;
  const v = (new URLSearchParams(search).get('scenario') ?? '').toLowerCase();
  return (SCENARIOS.includes(v) ? (v as DevScenario) : null);
}

export interface ScenarioReport {
  scenario: DevScenario | null;
  /** Whether rival-contest fast-forwarded the strategic clock (so the scene re-harvests incidents). */
  pulsed: boolean;
  /** A QA status line describing what was primed (empty when inert). */
  note: string;
}

/**
 * Apply a parsed scenario to the sim state by reusing the real systems:
 *   • rival-contest  — fast-forward the strategic clock (resolveStrategicPulse ×N) so rival offensives /
 *                      district contests surface against the player. NO reveal (fog is untouched).
 *   • fed-watch      — raise the player's federal heat to the WATCH rung (FED_WARN_TIER_2) so a raid can
 *                      be driven and weathered. The warning tier escalates on the next federal tick.
 *   • save-roundtrip — a MARKER only (no state change): QA saves then Continues to verify the round-trip
 *                      (incl. fog persistence). Kept side-effect-free by design.
 * Pure (mutates `state` for the first two; a no-op marker for the third). Inert for a null scenario.
 */
export function applyScenario(state: GameState, scenario: DevScenario | null): ScenarioReport {
  switch (scenario) {
    case 'rival-contest':
      for (let i = 0; i < SCENARIO_PULSES; i++) resolveStrategicPulse(state);
      return { scenario, pulsed: true, note: 'QA scenario: rival contest seeded — strategic clock fast-forwarded; rival offensives surface.' };
    case 'fed-watch':
      state.player.heat = Math.max(state.player.heat, FED_WARN_TIER_2);
      return { scenario, pulsed: false, note: 'QA scenario: federal heat set to WATCH — drive the raid, then weather it.' };
    case 'save-roundtrip':
      return { scenario, pulsed: false, note: 'QA scenario: save-roundtrip — open the save menu, save, then Continue to verify the restore (fog included).' };
    default:
      return { scenario: null, pulsed: false, note: '' };
  }
}
