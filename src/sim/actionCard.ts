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
  if (ctx.role === 'collector') return ['move', 'collect'];
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
export function unitActionChips(state: GameState, ctx: UnitActionContext): ActionChip[] {
  const expand = buildReadout(state).find((b) => b.key === 'expand');
  const chip = (verb: VerbId, ok: boolean, reason: string): ActionChip => ({ verb, hotkey: VERB_HOTKEYS[verb], enabled: ok, reason: ok ? 'ready' : reason });
  return unitRepertoire(ctx).map((verb): ActionChip => {
    switch (verb) {
      case 'move': return chip('move', true, '');
      case 'patrol': return chip('patrol', true, ''); // any muscle can hold a beat
      case 'recruit': return chip('recruit', true, '');
      case 'collect': return chip('collect', canCollect(state), 'no takings waiting');
      case 'extort': return chip('extort', ctx.extortTarget, 'focus an un-shaken [%] front');
      case 'attack': return chip('attack', ctx.attackTarget, 'right-click a rival racket');
      case 'demolish': {
        const g = offenseGate(state, 'sabotage');
        return chip('demolish', g.ok && ctx.attackTarget, ctx.attackTarget ? g.reason : 'right-click a rival racket');
      }
      case 'sabotage': { const g = offenseGate(state, 'sabotage'); return chip('sabotage', g.ok, g.reason); }
      case 'assassinate': { const g = offenseGate(state, 'assassinate'); return chip('assassinate', g.ok, g.reason); }
      case 'raid': { const g = offenseGate(state, 'raid'); return chip('raid', g.ok, g.reason); }
      case 'expand': return chip('expand', !!expand?.affordable, expand ? 'save up / get a foothold' : 'nowhere to expand');
      default: return chip(verb, false, 'unavailable');
    }
  });
}

/** Whether `verbChipState` reads READY for the chip (re-exported convenience for the scene). */
export function chipReady(c: ActionChip): boolean { return verbChipState(c.enabled, c.reason) === 'READY'; }
