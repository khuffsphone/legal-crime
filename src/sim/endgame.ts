// RTS-17 — the endgame. Pure & deterministic; imports NO Phaser. HQ integrity, family
// elimination, the canon win/lose evaluation, and the "who is vulnerable" read that lets the
// player form a finishing plan. Runs in the real-time WRAPPER (evaluateEndgame) — it only sets
// state.status when the contest resolves; the economic settlement (tick) is untouched, and its
// own bankruptcy/bust losses still stand.

import { HQ_MAX, TURF_DOMINANCE } from './constants';
import { allBusinesses, businessEarner } from './economy';
import { districtsHeld } from './territoryWar';
import { metWinPath } from './winpaths';
import { findFamily, type Family, type GameState } from './types';

/** A family's HQ integrity (0..100). Absent ⇒ full. */
export function hqIntegrityOf(family: Family): number {
  return family.hqIntegrity ?? HQ_MAX;
}

/** Eliminate a family: HQ razed, boss gone. A player elimination is a 'dead' loss. Logged. */
export function eliminateFamily(state: GameState, family: Family, cause: string): void {
  if (!family.alive) return;
  family.alive = false;
  family.hqIntegrity = 0;
  state.log.push({
    tick: state.tick,
    kind: 'family-eliminated',
    message: `${family.name} has been wiped out (${cause})`,
    data: { familyId: family.id, cause },
  });
  if (family.isPlayer) {
    state.status = 'lost';
    state.lossReason = 'dead';
  }
}

export interface HqDamageResult {
  integrity: number;
  destroyed: boolean;
}

/** Damage a family's HQ; at 0 the HQ is razed and the family eliminated. Pure (mutates state). */
export function damageHQ(state: GameState, familyId: string, amount: number): HqDamageResult {
  const fam = findFamily(state, familyId);
  if (!fam || !fam.alive || amount <= 0) return { integrity: fam ? hqIntegrityOf(fam) : 0, destroyed: false };
  fam.hqIntegrity = Math.max(0, hqIntegrityOf(fam) - amount);
  state.log.push({
    tick: state.tick,
    kind: 'hq-struck',
    message: `${fam.name}'s HQ was hit — integrity ${fam.hqIntegrity}`,
    data: { familyId: fam.id, integrity: fam.hqIntegrity, damage: amount },
  });
  if (fam.hqIntegrity <= 0) {
    eliminateFamily(state, fam, 'HQ destroyed');
    return { integrity: 0, destroyed: true };
  }
  return { integrity: fam.hqIntegrity, destroyed: false };
}

/** Total collapse: the player has no crew, no turf, no rackets, and is broke (the bottom of a
 * mutiny/bankruptcy spiral) — a loss even before the debt ceiling. */
export function playerCollapsed(state: GameState): boolean {
  const p = state.player;
  if (!p.alive) return true;
  if (p.gangsters.length > 0) return false;
  if (districtsHeld(state, p.id).length > 0) return false;
  if (allBusinesses(state).some((b) => businessEarner(b) === p.id)) return false;
  return p.cash <= 0 && p.dirtyCash <= 0;
}

export type EndKind = 'win-last-standing' | 'win-dominance' | 'win-go-straight' | 'win-mayor' | 'lose-hq' | 'lose-collapse' | 'lose-city';

/**
 * RTS-31 — EARN THE WIN. Has the player exercised real AGENCY (built or earned something) so a win is
 * EARNED rather than handed to them by a self-destructing AI? True if they HOLD a district, EARN from
 * any racket (an extorted front / owned operation), or have accrued civic INFLUENCE. A do-nothing
 * player — 0 districts, $0 earned, 0 influence — has none, so they cannot be crowned "last standing".
 */
export function playerHasAgency(state: GameState): boolean {
  const p = state.player;
  if (districtsHeld(state, p.id).length > 0) return true;
  if (allBusinesses(state).some((b) => businessEarner(b) === p.id)) return true;
  if ((p.influence ?? 0) > 0) return true;
  return false;
}

export interface EndgameResult {
  status: GameState['status'];
  kind: EndKind;
  message: string;
}

/**
 * Evaluate the canon endgame and resolve the match if it is over (RTS-17). WIN = last family
 * standing OR city dominance. LOSE = HQ destroyed OR total collapse (bankruptcy/bust still come
 * from tick). No-op once decided. Pure — mutates state.status only when it resolves.
 */
export function evaluateEndgame(state: GameState): EndgameResult | null {
  if (state.status !== 'playing') return null;
  const p = state.player;

  const total = state.districts.length;

  // ── losses ──
  if (!p.alive || hqIntegrityOf(p) <= 0) {
    return resolve(state, 'lost', 'lose-hq', 'Your HQ was razed. The city is theirs.');
  }
  if (playerCollapsed(state)) {
    return resolve(state, 'lost', 'lose-collapse', 'You have nothing left. The outfit is finished.');
  }
  // RTS-31 — a rival has taken the city out from under you. Doing NOTHING while the rivals expand is a
  // LOSS, not a safe stalemate: the moment a living rival holds the dominance threshold, you're buried.
  if (total > 0) {
    const overlord = state.rivals.find((r) => r.alive && districtsHeld(state, r.id).length / total >= TURF_DOMINANCE);
    if (overlord) {
      return resolve(state, 'lost', 'lose-city', `${overlord.name} has taken the city. You were too slow.`);
    }
  }

  // ── wins ──
  const rivalsLeft = state.rivals.filter((r) => r.alive).length;
  // RTS-31 EARN THE WIN: outlasting a self-destructing AI is not a victory — the player must have
  // exercised real agency (held turf / earned a racket / built influence) to be crowned last standing.
  if (rivalsLeft === 0 && playerHasAgency(state)) {
    return resolve(state, 'won', 'win-last-standing', 'The last family standing. The city is yours.');
  }
  const held = districtsHeld(state, p.id).length;
  if (total > 0 && held / total >= TURF_DOMINANCE) {
    return resolve(state, 'won', 'win-dominance', `You hold the city — ${held} of ${total} blocks. Dominance.`);
  }
  // RTS-24: the two NEW win paths — retire clean, or take the seat.
  const met = metWinPath(state);
  if (met?.path === 'go-straight') {
    return resolve(state, 'won', 'win-go-straight', 'You went straight — a clean, respectable empire. You retire on top.');
  }
  if (met?.path === 'mayor') {
    return resolve(state, 'won', 'win-mayor', 'You took City Hall — the city is yours, legally. Mr. Mayor.');
  }
  return null;
}

function resolve(state: GameState, status: GameState['status'], kind: EndKind, message: string): EndgameResult {
  state.status = status;
  if (status === 'lost' && !state.lossReason) state.lossReason = 'dead';
  state.log.push({ tick: state.tick, kind: 'game-over', message, data: { kind } });
  return { status, kind, message };
}

// ── vulnerability read (form a finishing plan) ──────────────────────────────────────────────

export interface RivalWeakness {
  familyId: string;
  name: string;
  alive: boolean;
  hqIntegrity: number;
  districtsHeld: number;
  crew: number;
  broke: boolean;
  locked: boolean;
  /** 0..100 — higher means closer to elimination (a softer target). */
  vulnerability: number;
}

/** Per-rival weakness, most-vulnerable first — the targeting board for the endgame. Pure read. */
export function rivalWeakness(state: GameState): RivalWeakness[] {
  const rows = state.rivals.map((r) => {
    const hq = hqIntegrityOf(r);
    const held = districtsHeld(state, r.id).length;
    const broke = r.cash + r.dirtyCash < 200;
    const locked = (r.lockoutTicks ?? 0) > 0;
    // soft target = battered HQ, no turf, no crew, broke, locked down.
    const vulnerability = !r.alive
      ? 100
      : Math.min(100, Math.round((HQ_MAX - hq) * 0.5 + (held === 0 ? 20 : 0) + (r.gangsters.length === 0 ? 15 : 0) + (broke ? 15 : 0) + (locked ? 15 : 0)));
    return { familyId: r.id, name: r.name, alive: r.alive, hqIntegrity: hq, districtsHeld: held, crew: r.gangsters.length, broke, locked, vulnerability };
  });
  return rows.sort((a, b) => b.vulnerability - a.vulnerability);
}

/** The softest living rival to finish off, if any (drives the endgame nudge). */
export function weakestRival(state: GameState): RivalWeakness | null {
  const living = rivalWeakness(state).filter((r) => r.alive);
  return living.length > 0 ? living[0] : null;
}

// ── RTS-23 — WIN/LOSS PROXIMITY: how close is anyone to winning or losing ───────────────────────

export interface VictoryProximity {
  /** 0..100 — how close the PLAYER is to a WIN (dominance held/total vs TURF_DOMINANCE, OR the
   * share of rivals already eliminated toward last-family-standing). */
  playerWinPct: number;
  /** 0..100 — how close the PLAYER is to LOSING (HQ damage toward razed, the primary failure). */
  playerLosePct: number;
  /** The family holding the most turf right now (the looming threat) + how dominant it is. */
  leaderId: string;
  leaderName: string;
  leaderHeld: number;
  total: number;
  /** A clipped, plain-English readout of the race. */
  read: string;
}

/** Read how close the match is to resolving — the player's progress toward a win, their proximity
 * to a loss, and the leading family's grip on the city. Pure; never mutates. (RTS-23 HUD readout.) */
export function victoryProximity(state: GameState): VictoryProximity {
  const total = state.districts.length;
  const playerHeld = districtsHeld(state, state.player.id).length;
  const playerDom = total > 0 ? playerHeld / total : 0;
  const rivals = state.rivals;
  const rivalsDead = rivals.filter((r) => !r.alive).length;
  const lastStandingPct = rivals.length > 0 ? rivalsDead / rivals.length : 0;
  const playerWinPct = Math.round(Math.min(1, Math.max(playerDom / TURF_DOMINANCE, lastStandingPct)) * 100);

  const playerHq = hqIntegrityOf(state.player);
  const playerLosePct = Math.round(Math.min(1, Math.max((HQ_MAX - playerHq) / HQ_MAX, playerCollapsed(state) ? 1 : 0)) * 100);

  // the family (incl. player) holding the most blocks = the looming leader.
  let leaderId = state.player.id, leaderName = state.player.name, leaderHeld = playerHeld;
  for (const f of [state.player, ...rivals]) {
    if (!f.alive) continue;
    const h = districtsHeld(state, f.id).length;
    if (h > leaderHeld) { leaderHeld = h; leaderId = f.id; leaderName = f.name; }
  }
  const need = Math.max(0, Math.ceil(TURF_DOMINANCE * total) - leaderHeld);
  const read = leaderId === state.player.id
    ? (playerHeld === 0 ? 'No one holds the city yet — establish your corner.' : `You lead ${leaderHeld}/${total} — ${need} more block${need === 1 ? '' : 's'} to dominance.`)
    : `${leaderName} leads ${leaderHeld}/${total} — ${need} from taking the city. Don't let them.`;

  return { playerWinPct, playerLosePct, leaderId, leaderName, leaderHeld, total, read };
}
