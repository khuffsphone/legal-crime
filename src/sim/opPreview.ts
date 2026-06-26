// OPERATION-OUTCOME PREVIEWS · SELECTORS (pure; Phaser-free). Read-only projections for the four player
// verbs. EVERY number here is one the sim ALREADY computes — combat damage from combatTuning (deterministic,
// no miss roll), the extort/retake gate + state machine from extortionEmbodied, the front income from the
// economy's EXTORT_RATE, the lockout gate + federal ladder from offense/federal. NOTHING is invented and
// NOTHING behind the fog is revealed (the caller passes an `isVisible` predicate; hidden ⇒ 'visible only').
//
// These selectors READ the existing gates and helpers — they do NOT duplicate the combat odds, the
// ownership rules, the federal rules, or the extort/retake state machines, and they NEVER mutate state.

import {
  EXTORT_HEAT, EXTORT_RATE, LOCKOUT_BUREAU_REQ, LOCKOUT_COST, LOCKOUT_DURATION, RETAKE_GUARD_RADIUS,
} from './constants';
import { findBusiness } from './commands';
import { isCombatant, unitHealth } from './combat';
import { attackInterval, engageRange, meleeDamage } from './combatTuning';
import { canIssueMoveAndShakedown, createMoveAndShakedownAct, isRivalHeldFront } from './extortionEmbodied';
import { posturePreviewRow, postureContestRumor, postureOf } from './districtPosture';
import { extortProgress } from './extortion';
import { federalExposure, fedWarningTier } from './federal';
import { canLockout } from './offense';
import { findFamily, type GameState } from './types';
import type { GridPos } from './iso';
import { MAX_GLANCE_ROWS, UNKNOWN, VISIBLE_ONLY, type OpPreview, type OpVerb, type PreviewRow } from './opPreviewTypes';

/** A visibility predicate: true when a tile is currently revealed (fog lives on the scene, so the caller
 * supplies this). Everything it returns false for is treated as fog-hidden — NO-X-RAY. */
export type IsVisible = (pos: GridPos) => boolean;

const ALWAYS_VISIBLE: IsVisible = () => true;

/** DISTRICT RACKET POSTURE — the active posture's modifier line + a NO-X-RAY rival-pressure rumor for the
 * front's district. Empty when the district is BALANCED and not under pressure (so an un-postured front's
 * preview is unchanged). The rumor NEVER carries a rival count/position. Pure. */
function postureDetailRows(state: GameState, frontId: string): PreviewRow[] {
  const found = findBusiness(state, frontId);
  if (!found) return [];
  const d = found.district;
  const rows: PreviewRow[] = [];
  if (postureOf(d) !== 'BALANCED') rows.push(posturePreviewRow(d));
  const rumor = postureContestRumor(state, d.id);
  if (rumor.value !== 'none reported') rows.push(rumor);
  return rows;
}

// ── tiny builders ──────────────────────────────────────────────────────────────────────────────
function row(label: string, value: string, tone?: PreviewRow['tone']): PreviewRow {
  return tone ? { label, value, tone } : { label, value };
}
function secs(t: number): string {
  return `~${t.toFixed(1)}s`;
}
/** A blocked preview: the GLANCE leads with the (existing) gate reason and a what-to-do hint. */
function blockedPreview(verb: OpVerb, title: string, blocker: string, hint?: string): OpPreview {
  const glance: PreviewRow[] = [row('Blocked', blocker, 'block')];
  if (hint) glance.push(row('To unlock', hint, 'neutral'));
  return { verb, title, blocked: true, blocker, glance, detail: [] };
}
function cap(rows: PreviewRow[]): PreviewRow[] {
  return rows.slice(0, MAX_GLANCE_ROWS);
}

// ── ATTACK A RIVAL ───────────────────────────────────────────────────────────────────────────
/**
 * Project the selected thug attacking a rival fighter. The combat damage table is DETERMINISTIC (no miss
 * roll), so hits-to-down and time-to-down are exact — but ONLY for a target the player can actually see;
 * a fogged rival reads 'visible only' (NO-X-RAY). Shows BOTH sides of the trade (the reciprocal is the
 * risk row) and never claims a "win chance" the sim does not compute.
 */
export function previewAttackRival(
  state: GameState, attackerId: string, targetId: string, isVisible: IsVisible = ALWAYS_VISIBLE,
): OpPreview {
  const title = 'Attack rival';
  const attacker = state.units.find((u) => u.id === attackerId);
  const target = state.units.find((u) => u.id === targetId);

  if (!attacker || !isCombatant(attacker)) return blockedPreview('attack_rival', title, 'no fighter selected — pick one of your thugs');
  if (!target || !isCombatant(target) || target.factionId === state.player.id) return blockedPreview('attack_rival', title, 'not a rival fighter');

  // NO-X-RAY — a fogged target cannot be projected; show 'visible only', invent nothing.
  if (!isVisible(target.pos)) {
    return {
      verb: 'attack_rival', title, blocked: false,
      glance: [row('Result', VISIBLE_ONLY, 'neutral'), row('Their condition', UNKNOWN, 'neutral'), row('Note', "can't read a fogged fighter", 'neutral')],
      detail: [row('NO-X-RAY', 'odds appear once the target is in sight', 'neutral')],
    };
  }

  const myHit = meleeDamage(attacker, target);          // deterministic per-swing damage I deal
  const theirHit = meleeDamage(target, attacker);       // deterministic per-swing damage I take
  const tHealth = unitHealth(target);
  const mHealth = unitHealth(attacker);

  // dmg can floor at 0 vs a very skilled defender — say so rather than divide by zero.
  const myHitsToDown = myHit > 0 ? Math.ceil(tHealth / myHit) : Infinity;
  const theirHitsToDown = theirHit > 0 ? Math.ceil(mHealth / theirHit) : Infinity;
  const timeToDown = Number.isFinite(myHitsToDown) ? myHitsToDown * attackInterval(attacker) : Infinity;

  const result = Number.isFinite(myHitsToDown)
    ? row('Result', `down them in ${myHitsToDown} hit${myHitsToDown === 1 ? '' : 's'}`, 'good')
    : row('Result', "can't dent them — outmatched", 'risk');
  const risk = Number.isFinite(theirHitsToDown)
    ? row('They hit back', `${Math.round(theirHit)}/swing — down you in ${theirHitsToDown}`, 'risk')
    : row('They hit back', `${Math.round(theirHit)}/swing`, 'risk');
  const time = row('Time to down', Number.isFinite(timeToDown) ? secs(timeToDown) : '—', 'neutral');
  const hint = row('Commit', 'selected thug closes and trades blows', 'neutral');

  return {
    verb: 'attack_rival', title, blocked: false,
    glance: cap([result, risk, time, hint]),
    detail: [
      row('Your swing', `${Math.round(myHit)} dmg every ${attackInterval(attacker).toFixed(2)}s`, 'good'),
      row('Their swing', `${Math.round(theirHit)} dmg`, 'risk'),
      row('Your reach', `${engageRange(attacker).toFixed(1)} tiles`, 'neutral'),
      row('Assumes', '1v1, both stand and trade, uninterrupted', 'neutral'),
      row('Deterministic', 'damage table has no miss roll — these are exact', 'neutral'),
    ],
  };
}

// ── EXTORT AN UN-TAKEN FRONT ─────────────────────────────────────────────────────────────────
/** Shared income + time projection for a shakedown (un-taken OR retake). Income is read from the front's
 * baseIncome × EXTORT_RATE — but ONLY when the front tile is visible (NO-X-RAY); otherwise 'visible only'.
 * Time is the EXACT shakedown duration the state machine will use (read via createMoveAndShakedownAct). */
function shakedownEconomy(state: GameState, thugId: string, frontId: string, frontTile: GridPos, isVisible: IsVisible) {
  const found = findBusiness(state, frontId);
  const incomeKnown = !!found && isVisible(frontTile);
  const income = incomeKnown ? Math.floor(found!.business.baseIncome * EXTORT_RATE) : null;
  // the exact duration the embodied shakedown will run (resistance-scaled) — read, not re-derived.
  const durationSec = createMoveAndShakedownAct(state, thugId, frontId, state.player.id, frontTile).durationSec;
  const needed = extortProgress(state, frontId)?.needed ?? null;
  return { income, durationSec, needed };
}

/**
 * Project a MOVE-AND-SHAKEDOWN on an un-taken front. The gate (canIssueMoveAndShakedown) decides blocked;
 * the conversion is DETERMINISTIC on completion (the shakedown always folds the front), so the result is a
 * certainty caveated only by "if uninterrupted". Reward is the protection income the economy will accrue;
 * the standing cost is the per-tick federal heat once you hold it.
 */
export function previewExtortFront(
  state: GameState, thugId: string, frontId: string, frontTile: GridPos, isVisible: IsVisible = ALWAYS_VISIBLE,
): OpPreview {
  const title = 'Extort front';
  const gate = canIssueMoveAndShakedown(state, thugId, frontId);
  if (!gate.ok) return blockedPreview('extort_front', title, gate.reason);

  const { income, durationSec, needed } = shakedownEconomy(state, thugId, frontId, frontTile, isVisible);
  const reward = income === null ? row('Reward', VISIBLE_ONLY, 'neutral') : row('Reward', `+$${income}/tick protection`, 'good');

  return {
    verb: 'extort_front', title, blocked: false,
    glance: cap([
      row('Result', 'front folds → it pays you', 'good'),
      reward,
      row('Time', `${secs(durationSec)} leaning on it`, 'neutral'),
      row('Then', `+${EXTORT_HEAT} heat/tick while you hold it`, 'risk'),
    ]),
    detail: [
      row('Resistance', needed === null ? UNKNOWN : `${needed} shakedown${needed === 1 ? '' : 's'}-worth of time`, 'neutral'),
      row('Certainty', '100% on completion — but interruptible (an attack resets it)', 'neutral'),
      row('Commit', 'the selected thug walks there and leans on the door', 'neutral'),
      row('NO-X-RAY', income === null ? 'income shows once the block is in sight' : 'income read from the visible front', 'neutral'),
      ...postureDetailRows(state, frontId),
    ],
  };
}

// ── RETAKE A RIVAL-HELD FRONT ──────────────────────────────────────────────────────────────────
/**
 * Project RETAKING a rival-held front. The gate (canIssueMoveAndShakedown WITH the tile) refuses while a
 * rival GUARD watches the block — that surfaces as the blocker ("clear the guard first"). Once clear, the
 * shakedown muscles ownership rival→player through the EXISTING conversion path (deterministic on
 * completion). Same income/heat economics as a fresh extort, plus the ownership flip.
 */
export function previewRetakeFront(
  state: GameState, thugId: string, frontId: string, frontTile: GridPos, isVisible: IsVisible = ALWAYS_VISIBLE,
): OpPreview {
  const title = 'Retake front';
  if (!isRivalHeldFront(state, frontId)) return blockedPreview('retake_front', title, 'not a rival-held block');
  const gate = canIssueMoveAndShakedown(state, thugId, frontId, frontTile);
  if (!gate.ok) return blockedPreview('retake_front', title, gate.reason, 'clear the rival guard, then shake it back');

  const { income, durationSec, needed } = shakedownEconomy(state, thugId, frontId, frontTile, isVisible);
  const reward = income === null ? row('Reward', VISIBLE_ONLY, 'neutral') : row('Reward', `+$${income}/tick once flipped`, 'good');

  return {
    verb: 'retake_front', title, blocked: false,
    glance: cap([
      row('Result', 'muscle it back → flips rival→you', 'good'),
      reward,
      row('Time', `${secs(durationSec)} shakedown`, 'neutral'),
      row('Then', `+${EXTORT_HEAT} heat/tick while you hold it`, 'risk'),
    ]),
    detail: [
      row('Guard', `cleared within ${RETAKE_GUARD_RADIUS} tiles — a rival walking back contests it again`, 'neutral'),
      row('Ownership', "breaks the rival's claim, then the existing conversion flips it to you", 'neutral'),
      row('Resistance', needed === null ? UNKNOWN : `${needed} shakedown${needed === 1 ? '' : 's'}-worth of time`, 'neutral'),
      row('Certainty', '100% on completion — interruptible (an attack resets it)', 'neutral'),
      ...postureDetailRows(state, frontId),
    ],
  };
}

// ── FEDERAL HEAT ACTION — THE BUREAU LOCKOUT ──────────────────────────────────────────────────
/**
 * Project a federal LOCKOUT on a rival (the Bureau channel). The gate (canLockout) covers cooldown, a valid
 * rival, the Bureau investment, and the cash — its reason is the blocker. The lockout is DETERMINISTIC (it
 * always lands) and notably adds NO heat to the player. The HOLD-ALT detail surfaces the player's own
 * standing on the federal ladder (50/70/85) — self-info, always shown — so the cost-in-attention is legible.
 */
export function previewFederalAction(state: GameState, rivalId: string): OpPreview {
  const title = 'Federal lockout';
  const gate = canLockout(state, rivalId);
  if (!gate.ok) return blockedPreview('federal_heat_action', title, gate.reason);

  const rival = findFamily(state, rivalId);
  const feds = state.player.bribes.feds ?? 0;
  const exposure = federalExposure(state.player);
  const tier = fedWarningTier(exposure);
  const tierLabel = ['clear', 'watched (≥50)', 'agents near (≥70)', 'bust imminent (≥85)'][tier] ?? 'clear';

  return {
    verb: 'federal_heat_action', title, blocked: false,
    glance: cap([
      row('Result', `Bureau locks ${rival?.name ?? 'them'} down ${LOCKOUT_DURATION} pulses`, 'good'),
      row('Cost', `−$${LOCKOUT_COST}`, 'neutral'),
      row('Your heat', 'unchanged — a dime, not a gun', 'good'),
      row('Requires', `Bureau ≥ ${LOCKOUT_BUREAU_REQ} (you: ${feds})`, 'neutral'),
    ]),
    detail: [
      row('Federal ladder', `your exposure ${exposure} — ${tierLabel}`, tier >= 2 ? 'risk' : 'neutral'),
      row('Effect', `freezes the rival's expansion and bleeds them for ${LOCKOUT_DURATION} strategic pulses`, 'neutral'),
      row('Deterministic', 'the lockout always lands (no roll)', 'neutral'),
      row('Aftermath', 'arms the shared crew cooldown and nudges the rival aggro', 'neutral'),
    ],
  };
}
