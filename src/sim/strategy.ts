// RTS-16 — the living opponent. Pure & deterministic (NO RNG, NO Phaser): rival families pursue
// territory in real time on the strategic clock, pushing presence along adjacency into the
// richest, weakest fronts they can reach — expanding into undefended ground and contesting YOUR
// turf if you leave it open. Every move is telegraphed (the same deterministic target the pulse
// will take), so the player can read and respond. The economic settlement (tick) is untouched;
// this advances in the real-time wrapper. On the legacy 5-district map (no adjacency) it is a
// no-op, so it only comes alive on the big contested city.

import {
  AGGRO_DECAY,
  AGGRO_HQ_STRIKE,
  ASSASSINATE_MIN_STRENGTH,
  HEAT_MAX,
  LOCKOUT_BLEED_CASH,
  LOCKOUT_BLEED_HEAT,
  POLITICIAN_DETERRENCE,
  RIVAL_HQ_STRIKE_DAMAGE,
  RIVAL_PUSH_BASE,
  RIVAL_PUSH_PER_STRENGTH,
  STRATEGY_PULSE_SECONDS,
} from './constants';
import { districtIdentity } from './city';
import { muscleInDistrict } from './commands';
import { familyStrength } from './conflict';
import { allBusinesses, businessEarner } from './economy';
import { damageHQ } from './endgame';
import { clampDirty } from './laundering';
import { controlOf, districtHolder } from './territory';
import { pushPresence, districtsHeld, type PushResult } from './territoryWar';
import { allFamilies, type District, type Family, type GameState } from './types';

// ── target selection (deterministic) ─────────────────────────────────────────────────────────

/** Districts a family can reach to push: the neighbours of any district it has a foothold in.
 * Falls back to every district it does not yet hold (so a routed family can fight back in). */
function reachableTargets(state: GameState, rival: Family): District[] {
  const footholds = state.districts.filter((d) => controlOf(d, rival.id) > 0);
  const ids = new Set<string>();
  for (const d of footholds) for (const n of d.neighbors ?? []) ids.add(n);
  // never target a district you already hold outright
  const out = state.districts.filter((d) => ids.has(d.id) && districtHolder(d) !== rival.id);
  if (out.length > 0) return out;
  return state.districts.filter((d) => districtHolder(d) !== rival.id && (d.neighbors?.length ?? 0) > 0);
}

/** Push value of taking `d` for `rival`: rich + weakly-held is best; the player's City Hall
 * (politicians) bribe deters pushes onto player turf. Higher = more attractive. Deterministic. */
export function targetScore(state: GameState, rival: Family, d: District): number {
  const ident = districtIdentity(d, state.districts.indexOf(d));
  const holder = districtHolder(d);
  const topOther = Math.max(0, ...allFamilies(state).filter((f) => f.id !== rival.id).map((f) => controlOf(d, f.id)));
  let score = ident.wealth * 10 + (100 - topOther) * 0.4;
  if (holder === state.player.id) {
    // Contesting the player: an UNDEFENDED, weakly-held block is the juiciest target of all —
    // expand where you're ignored. Guards make it costly; City Hall (politicians) deters it; a
    // rival you've attacked (aggro) comes for your turf (retaliation).
    const guard = muscleInDistrict(state.player, d.id);
    score += (100 - controlOf(d, state.player.id)) * 0.4 + (guard === 0 ? 14 : -guard * 2);
    score -= state.player.bribes.politicians * (POLITICIAN_DETERRENCE / 10);
    score += (rival.aggro ?? 0) * 0.12;
  } else if (holder === null) {
    score += 8; // open ground is the easiest expansion
  }
  return score;
}

/** The single district `rival` will push next (its highest-scoring reachable target), or null.
 * Deterministic — ties break by district id — so it doubles as the telegraph. */
export function rivalStrategicTarget(state: GameState, rival: Family): District | null {
  const candidates = reachableTargets(state, rival);
  let best: District | null = null;
  let bestScore = -Infinity;
  for (const d of candidates) {
    const s = targetScore(state, rival, d);
    if (s > bestScore || (s === bestScore && best && d.id < best.id)) {
      bestScore = s;
      best = d;
    }
  }
  return best;
}

/** How hard a rival pushes — base plus a strength bonus, sharpened by aggression (retaliation). */
export function rivalPushAmount(rival: Family): number {
  return Math.round(RIVAL_PUSH_BASE + familyStrength(rival) * RIVAL_PUSH_PER_STRENGTH + (rival.aggro ?? 0) * 0.1);
}

/**
 * RTS-21 — early expansion DAMPENER. The un-armed UAT had rivals racing to ~5 blocks by week 2,
 * outrunning the player's establish phase. This curve throttles rival territorial pushes in the
 * opening weeks (week 0 ≈ 0.4×) and ramps to full force by week 3 (1.0×) — so the player gets room
 * to set up, and the turf war becomes a real fight mid/late, not a turn-2 stomp. Pure; keyed on the
 * week counter (state.tick). Only dampens the strategic PUSH, never the player.
 */
export function expansionRamp(tick: number): number {
  return Math.min(1, 0.25 + 0.25 * Math.max(0, tick));
}

/** A rival's push this week — `rivalPushAmount` throttled by the early-game `expansionRamp` (and at
 * least 1 so a move always lands). This is the amount BOTH the telegraph and the pulse use, so the
 * warning stays honest. Pure. */
export function rampedPushAmount(state: GameState, rival: Family): number {
  return Math.max(1, Math.round(rivalPushAmount(rival) * expansionRamp(state.tick)));
}

// ── the telegraph (pure read) ────────────────────────────────────────────────────────────────

export interface TelegraphedPush {
  familyId: string;
  familyName: string;
  districtId: string;
  districtName: string;
  amount: number;
  /** True when the move would push onto a player-held district (the threat the player feels). */
  onPlayer: boolean;
}

/** Every living rival's next intended move — so the UI can warn "Moretti is pushing into The
 * Loop" before it lands. Pure; never mutates. */
export function telegraphedPushes(state: GameState): TelegraphedPush[] {
  const out: TelegraphedPush[] = [];
  for (const rival of state.rivals) {
    if (!rival.alive) continue;
    const target = rivalStrategicTarget(state, rival);
    if (!target) continue;
    out.push({
      familyId: rival.id,
      familyName: rival.name,
      districtId: target.id,
      districtName: target.name,
      amount: rampedPushAmount(state, rival),
      onPlayer: districtHolder(target) === state.player.id,
    });
  }
  return out;
}

// ── family fall ────────────────────────────────────────────────────────────────────────────

/** Whether a rival has been crushed out of the contest: no turf, no crew, no rackets, broke. */
export function familyIsFallen(state: GameState, fam: Family): boolean {
  if (fam.isPlayer || !fam.alive) return false;
  if (districtsHeld(state, fam.id).length > 0) return false;
  if (fam.gangsters.length > 0) return false;
  if (allBusinesses(state).some((b) => businessEarner(b) === fam.id)) return false;
  return fam.cash <= 0 && fam.dirtyCash <= 0;
}

// ── the strategic pulse + clock ───────────────────────────────────────────────────────────────

export interface StrategicEvent {
  pushes: PushResult[];
  captures: PushResult[];
  fallen: string[];
  /** Rival ids that struck the PLAYER's HQ this pulse (escalation / the existential threat). */
  hqStrikes: string[];
}

/** One strategic pulse (RTS-16/17): locked-down rivals bleed and skip their move; the rest decay
 * aggression, make their telegraphed territorial push (sharper if you've provoked them), and a
 * strong, enraged rival STRIKES your HQ. Then any crushed rival falls out. Deterministic. */
export function resolveStrategicPulse(state: GameState): StrategicEvent {
  const pushes: PushResult[] = [];
  const hqStrikes: string[] = [];
  for (const rival of state.rivals) {
    if (!rival.alive) continue;

    // Federal lockout: the Bureau has them pinned — they cannot expand and they bleed.
    if ((rival.lockoutTicks ?? 0) > 0) {
      rival.lockoutTicks = (rival.lockoutTicks ?? 0) - 1;
      rival.cash = Math.max(0, rival.cash - LOCKOUT_BLEED_CASH);
      rival.heat = Math.min(HEAT_MAX, rival.heat + LOCKOUT_BLEED_HEAT);
      clampDirty(rival);
      continue;
    }

    rival.aggro = Math.max(0, (rival.aggro ?? 0) - AGGRO_DECAY);

    const target = rivalStrategicTarget(state, rival);
    if (target) {
      const res = pushPresence(state, rival.id, target.id, rampedPushAmount(state, rival));
      if (res) pushes.push(res);
    }

    // Escalation: an enraged, strong rival strikes your HQ — the threat that can end your run.
    if ((rival.aggro ?? 0) >= AGGRO_HQ_STRIKE && familyStrength(rival) >= ASSASSINATE_MIN_STRENGTH) {
      damageHQ(state, state.player.id, RIVAL_HQ_STRIKE_DAMAGE);
      hqStrikes.push(rival.id);
    }
  }

  const fallen: string[] = [];
  for (const fam of allFamilies(state)) {
    if (familyIsFallen(state, fam)) {
      fam.alive = false;
      fallen.push(fam.id);
      state.log.push({
        tick: state.tick,
        kind: 'family-fallen',
        message: `${fam.name} has been driven out of the city`,
        data: { familyId: fam.id },
      });
    }
  }
  return { pushes, captures: pushes.filter((p) => p.captured), fallen, hqStrikes };
}

/** Advance the strategic clock by `dt`; fire a pulse for each STRATEGY_PULSE_SECONDS crossed.
 * Returns the number of pulses fired and the merged events. A no-op on a map without adjacency
 * (the legacy 5-district world), so it only animates the big contested city. Mutates state. */
export function advanceStrategy(
  state: GameState,
  dt: number,
  pulseSeconds: number = STRATEGY_PULSE_SECONDS,
): { pulses: number; events: StrategicEvent } {
  const merged: StrategicEvent = { pushes: [], captures: [], fallen: [], hqStrikes: [] };
  if (!(dt > 0) || !(pulseSeconds > 0)) return { pulses: 0, events: merged };
  state.strategyElapsed += dt;
  let pulses = 0;
  while (state.strategyElapsed >= pulseSeconds) {
    state.strategyElapsed -= pulseSeconds;
    const ev = resolveStrategicPulse(state);
    merged.pushes.push(...ev.pushes);
    merged.captures.push(...ev.captures);
    merged.fallen.push(...ev.fallen);
    merged.hqStrikes.push(...ev.hqStrikes);
    pulses++;
  }
  return { pulses, events: merged };
}
