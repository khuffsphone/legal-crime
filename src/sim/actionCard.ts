// RTS-30c-2b — the CONTEXTUAL ACTION CARD model: which verbs a SELECTED unit can perform right now.
// Pure & Phaser-free. Each unit TYPE has a repertoire (a thug fights + extorts; a hitman assassinates;
// a demolitions man wrecks; a collector only moves + collects), and each verb's READY/LOCKED state is
// derived from the existing gates + a couple of scene context flags. The scene renders these as the
// clickable deco icon chips; this module decides what shows + whether it's enabled (the dead-button
// lesson: the chip's verb + enabled state are unit-tested here).

import type { GameState, WeaponTier } from './types';
import { offenseReadout, buildReadout } from './pacing';
import { verbChipState } from './hudText';
import { canCollect } from './toolbar';

export type VerbId =
  | 'move' | 'attack' | 'extort' | 'collect' | 'patrol'
  | 'sabotage' | 'demolish' | 'assassinate' | 'raid' | 'expand' | 'recruit';

/** The hotkey shown on each chip — the ACTUAL game binding ('·' = right-click / no dedicated key). */
export const VERB_HOTKEYS: Record<VerbId, string> = {
  move: '·', attack: '·', extort: 'E', collect: 'C', patrol: 'Q',
  sabotage: '2', demolish: 'V', assassinate: '3', raid: '1', expand: '5', recruit: '6',
};

export interface ActionChip {
  verb: VerbId;
  hotkey: string;
  enabled: boolean;
  /** Plain reason when disabled (the why-locked tooltip), else 'ready'. */
  reason: string;
}

/** Scene context the card needs that isn't on GameState (resolved view-side). */
export interface UnitActionContext {
  weapon?: WeaponTier;
  role?: string;            // 'collector' | undefined (muscle)
  /** A clicked/onboarding [%] front is currently extortable. */
  extortTarget: boolean;
  /** A rival racket is currently focused (a valid ATTACK / DEMOLISH target). */
  attackTarget: boolean;
}

/** The verbs a unit TYPE offers, in display order. A collector is near-passive; a hitman/demolitions
 * man lead with their specialty; plain muscle gets the full street kit. Pure. */
export function unitRepertoire(ctx: UnitActionContext): VerbId[] {
  // RTS-30d-2: a COLLECTOR is autonomous — it accepts NO orders, so it exposes NO action verbs (it is
  // inspectable, not commandable). The old [move, collect] for a collector was the bug.
  if (ctx.role === 'collector') return [];
  if (ctx.weapon === 'hitman') return ['move', 'assassinate', 'patrol', 'collect', 'recruit'];
  if (ctx.weapon === 'demolitions') return ['move', 'demolish', 'sabotage', 'patrol', 'collect', 'recruit'];
  // plain muscle (thug) + the combat enforcers (pistol/shotgun/rifle)
  return ['move', 'attack', 'extort', 'patrol', 'collect', 'raid', 'expand', 'recruit'];
}

function offenseGate(state: GameState, key: 'raid' | 'sabotage' | 'assassinate'): { ok: boolean; reason: string } {
  const o = offenseReadout(state).find((x) => x.key === key);
  if (!o) return { ok: false, reason: 'unavailable' };
  return { ok: o.available, reason: o.available ? 'ready' : o.reason };
}

/** Resolve every chip for the selected unit: its repertoire + each verb's enabled/reason. Pure. */
/** Resolve ONE verb's chip (enabled/reason) from the existing gates + the scene context. Pure. */
export function resolveChip(state: GameState, verb: VerbId, ctx: UnitActionContext): ActionChip {
  const chip = (ok: boolean, reason: string): ActionChip => ({ verb, hotkey: VERB_HOTKEYS[verb], enabled: ok, reason: ok ? 'ready' : reason });
  switch (verb) {
    case 'move': return chip(true, '');
    case 'patrol': return chip(true, ''); // any muscle can hold a beat
    case 'recruit': return chip(true, '');
    case 'collect': return chip(canCollect(state), 'no takings to rush yet'); // RTS-30d-fix: [C] now RUSHES the accrued take home early
    case 'extort': return chip(ctx.extortTarget, 'focus an un-shaken [%] front');
    case 'attack': return chip(ctx.attackTarget, 'right-click a rival racket');
    case 'demolish': { const g = offenseGate(state, 'sabotage'); return chip(g.ok && ctx.attackTarget, ctx.attackTarget ? g.reason : 'right-click a rival racket'); }
    case 'sabotage': { const g = offenseGate(state, 'sabotage'); return chip(g.ok, g.reason); }
    case 'assassinate': { const g = offenseGate(state, 'assassinate'); return chip(g.ok, g.reason); }
    case 'raid': { const g = offenseGate(state, 'raid'); return chip(g.ok, g.reason); }
    case 'expand': { const e = buildReadout(state).find((b) => b.key === 'expand'); return chip(!!e?.affordable, e ? 'save up / get a foothold' : 'nowhere to expand'); }
    default: return chip(false, 'unavailable');
  }
}

/** The action chips for ONE selected unit (its repertoire). Pure. */
export function unitActionChips(state: GameState, ctx: UnitActionContext): ActionChip[] {
  return unitRepertoire(ctx).map((verb) => resolveChip(state, verb, ctx));
}

/** RTS-30d-3 — the verbs COMMON to a whole multi-selection: the INTERSECTION of each unit's repertoire
 * (Move/Patrol/Collect/Recruit for everyone; a unit-specific verb like Assassinate appears only when that
 * single unit is selected alone). Pure. */
export function commonVerbs(units: ReadonlyArray<UnitActionContext>): VerbId[] {
  if (units.length === 0) return [];
  const reps = units.map(unitRepertoire);
  return reps[0].filter((v) => reps.every((r) => r.includes(v)));
}

/** The action chips for a multi-selection: the common verbs, each resolved against the shared context.
 * Issuing any of these applies to ALL selected (the scene fans the command out). Pure. */
export function multiSelectChips(state: GameState, units: ReadonlyArray<UnitActionContext>, ctx: UnitActionContext): ActionChip[] {
  return commonVerbs(units).map((verb) => resolveChip(state, verb, ctx));
}

/** Whether `verbChipState` reads READY for the chip (re-exported convenience for the scene). */
export function chipReady(c: ActionChip): boolean { return verbChipState(c.enabled, c.reason) === 'READY'; }
