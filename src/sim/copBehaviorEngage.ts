// BEAT-COP P1 — ENGAGE (headless auto-resolve of a cop-vs-crime confrontation). Pure & Phaser-free.
// This is the CONSUME half of "detect → respond → ENGAGE": when a cop is in contact (copBehavior sets
// mode 'engage'), resolveCopEngagement runs the confrontation through combatResolve.resolveEngagement —
// the EXISTING headless resolver — and returns a compact report. It adds NO combat mechanic and computes
// NO damage of its own: the swing table, the HARD CAPS (MAX_HIT_DAMAGE 45 / MIN_ATTACK_INTERVAL 0.45), the
// tie-breaks, the outcome taxonomy — all inherited byte-for-byte from resolveEngagement (which itself runs
// the production resolveProximityCombat). "Never re-implement damage" is enforced structurally: the only
// thing this module contributes is the LAW COMBATANT it synthesizes to stand in for the cop.
//
// COPS ARE NEVER MovableUnits (the P0 load-bearing invariant): the law fighter exists ONLY inside a scratch
// GameState handed to resolveEngagement — it never enters the real state.units, so movement / interception /
// selection / the live combat step stay structurally blind to it, exactly as in P0/P1-detect.
//
// PURITY (numbers-frozen): resolveCopEngagement mutates NOTHING — not the passed state, not its units, not
// the cop, not state.rngState. It reads the suspects, clones the fight into a scratch, and returns a report.
// So it is safe to call between frames; the live game is byte-identical whether or not it ran. Wiring the
// report back into a live consequence (downing a suspect, surfacing a fog-gated arrest in the event feed) is
// a LATER PR — this ships the resolver pure + unwired, mirroring combat PR B.

import { isCombatant } from './combat';
import { spawnEnforcer, type MovableUnit } from './movement';
import { resolveEngagement, type EngagementOutcome, type ResolveOptions, type ResolveResult } from './combatResolve';
import type { GridPos } from './iso';
import type { GameState } from './types';
import type { BeatCop } from './beatCops';

/** The law's family id — DISTINCT from 'player' / any rival, so combat.hostile treats a cop and a crook as
 * enemies (different families) while it can never collide with a real family. The cop is the law, not a gang. */
export const LAW_FACTION_ID = 'law';
/** A beat cop's sidearm + training as a combatant: a trained officer, not a hitman. Feeds the SAME tuning
 * table the crooks use, so the cop's swings are capped identically (pistol·skill-4 ≈ 34.8/hit ⇒ ≥3 to down
 * a fresh 100-HP thug — no one-shot, inherited straight from the cap in combatTuning). */
export const COP_WEAPON = 'pistol' as const;
export const COP_SKILL = 4;
/** Reach (tiles) the cop sweeps suspects into the confrontation — the focus PLUS any hunted-family fighters
 * already at the scene (a cop wading into a brawl fights the crew there, not just the one it chased). */
export const COP_ENGAGE_GATHER_RADIUS = 6;

export interface CopEngageOptions {
  /** Whose fighters the cop hauls in (default state.player.id). */
  lawTargetFamilyId?: string;
  /** Reach for sweeping extra suspects into the fight (default COP_ENGAGE_GATHER_RADIUS). */
  gatherRadius?: number;
  /** Forwarded to resolveEngagement (dt / caps / jitter). Default deterministic, no jitter. */
  resolve?: ResolveOptions;
}

export interface CopEngageResult {
  /** False when the cop found no live suspect to resolve against (a stale focus / empty scene). */
  resolved: boolean;
  /** resolveEngagement's verdict for the confrontation. */
  outcome: EngagementOutcome;
  /** True if the LAW fighter itself went down (outnumbered — a later PR decides the consequence). */
  copDowned: boolean;
  /** Suspect unit ids the law put down, in the order they fell. */
  suspectsDowned: string[];
  /** The full underlying resolve report (fog-gated newsreel seed — never rendered raw; see combatResolve). */
  report: ResolveResult;
  /** The synthesized law fighter's id (so a caller can read the report without re-deriving it). */
  lawUnitId: string;
}

/** The law fighter that stands in for `cop` inside the scratch fight. A fresh MovableUnit on the LAW family
 * at the cop's position — id `law:<copId>` so it can never collide with a real unit id. Pure (reads the cop,
 * mutates nothing). NB: this object is for the scratch ONLY; it must never be pushed into state.units. */
export function lawCombatant(cop: BeatCop): MovableUnit {
  return spawnEnforcer(`law:${cop.id}`, cop.pos.gx, cop.pos.gy, LAW_FACTION_ID, cop.speed, {
    weapon: COP_WEAPON,
    skill: COP_SKILL,
  });
}

function dist(a: GridPos, b: GridPos): number {
  return Math.hypot(a.gx - b.gx, a.gy - b.gy);
}

/**
 * Headlessly resolve a cop's confrontation with the crime it caught. Gathers the live hunted-family fighters
 * at the scene (the focus suspect + any within `gatherRadius` of the cop), stands the cop up as a LAW fighter,
 * and runs the whole thing through combatResolve.resolveEngagement on a SCRATCH state. Returns the verdict and
 * who fell. Deterministic; PURE — the passed state, its units, the cop, and state.rngState are all untouched.
 */
export function resolveCopEngagement(state: GameState, cop: BeatCop, opts: CopEngageOptions = {}): CopEngageResult {
  const targetFamily = opts.lawTargetFamilyId ?? state.player.id;
  const gatherRadius = opts.gatherRadius ?? COP_ENGAGE_GATHER_RADIUS;

  // Gather the suspects: the focus first (so it heads the roster deterministically), then anyone else of the
  // hunted family already at the scene. Only live fighters count (isCombatant drops collectors + the downed).
  const suspects: MovableUnit[] = [];
  const seen = new Set<string>();
  const add = (u: MovableUnit | undefined): void => {
    if (u && !seen.has(u.id) && u.factionId === targetFamily && isCombatant(u)) { seen.add(u.id); suspects.push(u); }
  };
  add(cop.focusUnitId ? state.units.find((u) => u.id === cop.focusUnitId) : undefined);
  for (const u of state.units) if (dist(cop.pos, u.pos) <= gatherRadius) add(u);

  const law = lawCombatant(cop);
  // The scratch fight: the law fighter + the suspects (resolveEngagement clones internally, so the real
  // suspect objects are never mutated). Law leads the roster ⇒ deterministic array-first swing order.
  const scratch: GameState = { ...state, units: [law, ...suspects] };
  const report = resolveEngagement(scratch, [law.id, ...suspects.map((u) => u.id)], opts.resolve);

  const copDowned = report.casualties.includes(law.id);
  const suspectsDowned = report.casualties.filter((id) => id !== law.id);
  return {
    resolved: suspects.length > 0,
    outcome: report.outcome,
    copDowned,
    suspectsDowned,
    report,
    lawUnitId: law.id,
  };
}
