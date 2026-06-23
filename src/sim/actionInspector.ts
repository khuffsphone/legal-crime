// RTS-30d-4 — the ACTION REQUIREMENT INSPECTOR. Pure & Phaser-free. This invents NO new sim state:
// it READS the existing gates/readouts (offense.ts gates, pacing.ts readouts, the channel + federal
// ladder helpers) and re-expresses them as a plain-English requirement breakdown the card can render.
// The dead-button lesson, finished: a chip says READY/LOCKED; this says exactly WHICH requirement is
// met or missing and what to do next — so the player never wonders why a button won't fire.
//
// Copy discipline: plain English first; the four channels are named ONLY The Beat / The Bench /
// City Hall / The Bureau; risk rows reference ONLY the 50/70/85 federal ladder; every row carries a
// symbol (✓ met / ✗ missing / ! risk) PLUS text — never colour alone (the scene adds the colour).

import {
  ASSASSINATE_COST,
  ASSASSINATE_MIN_STRENGTH,
  EXPAND_COST,
  HEAT_MAX,
  LOCKOUT_BUREAU_REQ,
  LOCKOUT_COST,
  RAID_COST,
  RAID_MIN_CREW,
  RECRUIT_COST,
  SABOTAGE_COST,
  SABOTAGE_MIN_CREW,
} from './constants';
import { familyStrength } from './conflict';
import { districtsHeld } from './territoryWar';
import { canCollect } from './toolbar';
import { FEDERAL_LADDER } from './hudText';
import { offenseReadout, expandTargetDistrictId, weeksToAfford, type OffenseKey } from './pacing';
import type { VerbId } from './actionCard';
import type { GameState } from './types';

// ── shapes (exactly the RTS-30d-4 spec) ───────────────────────────────────────────────────────

export type RequirementCategory =
  | 'cash' | 'unit' | 'target' | 'district' | 'channel' | 'federal' | 'cooldown' | 'route' | 'hq' | 'phase';

/** A single requirement: MET (have it), MISSING (a blocker), or RISK (a consequence, never a blocker). */
export type RequirementState = 'met' | 'missing' | 'risk';

export interface ActionRequirementRow {
  category: RequirementCategory;
  state: RequirementState;
  /** The plain-English requirement (e.g. "Not enough cash"). */
  label: string;
  /** Optional one-line elaboration / what to do. */
  detail?: string;
  /** What the player has now (e.g. "$320", "1 held"). */
  current?: string;
  /** What's required (e.g. "$500", "≥1"). */
  required?: string;
}

export type InspectorState = 'ready' | 'conditional' | 'locked';

export interface ActionRequirementInspector {
  actionId: string;
  state: InspectorState;
  title: string;
  summary: string;
  rows: ActionRequirementRow[];
  /** The single most useful next move when not READY (the highest-priority missing row's remedy). */
  nextStep?: string;
  /** A one-line read of the federal-heat cost, when the action draws heat. */
  riskSummary?: string;
}

/** The actions the inspector can break down: the per-unit card verbs PLUS the strategic LOCKOUT (bound
 * to [4], not a unit verb) — both gate on existing sim state. */
export type InspectableActionId = VerbId | 'lockout';

/** Scene context the inspector can't read off GameState (a focused front / rival racket under the cursor). */
export interface InspectorContext {
  extortTarget?: boolean;
  attackTarget?: boolean;
}

/** The glyph for a row's state — symbol PLUS text, never colour alone (visual-accessibility rule). */
export function rowSymbol(state: RequirementState): '✓' | '✗' | '!' {
  return state === 'met' ? '✓' : state === 'missing' ? '✗' : '!';
}

// ── row builders (each reads EXISTING state only) ──────────────────────────────────────────────

function cashRow(state: GameState, cost: number): ActionRequirementRow {
  const cash = state.player.cash;
  const met = cash >= cost;
  if (met) return { category: 'cash', state: 'met', label: 'Cash in hand', current: `$${cash}`, required: `$${cost}` };
  const eta = weeksToAfford(state, cost);
  const detail = eta === null ? 'income won’t cover it at this rate — earn more' : eta === 0 ? '' : `~${eta} wk of income away`;
  return { category: 'cash', state: 'missing', label: 'Not enough cash', detail, current: `$${cash}`, required: `$${cost}` };
}

function cooldownRow(state: GameState): ActionRequirementRow {
  const cd = state.offenseCooldown ?? 0;
  const met = cd <= 0;
  return met
    ? { category: 'cooldown', state: 'met', label: 'Crew ready', current: 'ready', required: 'ready' }
    : { category: 'cooldown', state: 'missing', label: 'Crew regrouping', detail: 'the men regroup after a job', current: `${Math.ceil(cd)}s`, required: 'ready' };
}

function crewRow(state: GameState, min: number): ActionRequirementRow {
  const have = state.player.gangsters.length;
  const met = have >= min;
  return met
    ? { category: 'unit', state: 'met', label: 'Crew on hand', current: `${have}`, required: `${min}` }
    : { category: 'unit', state: 'missing', label: 'Not enough crew', detail: 'recruit more muscle ([6])', current: `${have}`, required: `${min}` };
}

function strengthRow(state: GameState): ActionRequirementRow {
  const have = familyStrength(state.player);
  const met = have >= ASSASSINATE_MIN_STRENGTH;
  return met
    ? { category: 'unit', state: 'met', label: 'Muscle for the hit', current: `${have}`, required: `${ASSASSINATE_MIN_STRENGTH}` }
    : { category: 'unit', state: 'missing', label: 'Not enough muscle', detail: 'recruit/upgrade crew toward the hit', current: `${have}`, required: `${ASSASSINATE_MIN_STRENGTH}` };
}

function bureauRow(state: GameState): ActionRequirementRow {
  const have = state.player.bribes.feds ?? 0;
  const met = have >= LOCKOUT_BUREAU_REQ;
  return met
    ? { category: 'channel', state: 'met', label: 'The Bureau is in your pocket', current: `$${have}/wk`, required: `$${LOCKOUT_BUREAU_REQ}/wk` }
    : { category: 'channel', state: 'missing', label: 'The Bureau not greased enough', detail: 'grease The Bureau ([G]) to drop the dime', current: `$${have}/wk`, required: `$${LOCKOUT_BUREAU_REQ}/wk` };
}

function homeBlockRow(state: GameState): ActionRequirementRow {
  const held = districtsHeld(state, state.player.id).length;
  const met = held >= 1;
  return met
    ? { category: 'district', state: 'met', label: 'Home block secured', current: `${held} held`, required: '≥1' }
    : { category: 'district', state: 'missing', label: 'No block of your own yet', detail: 'hold a district before you project force (expand your corner)', current: '0 held', required: '≥1' };
}

function targetRow(category: RequirementCategory, present: boolean, name: string | null, gotLabel: string, missingLabel: string, missingDetail: string): ActionRequirementRow {
  return present
    ? { category, state: 'met', label: gotLabel, current: name ?? 'in sights' }
    : { category, state: 'missing', label: missingLabel, detail: missingDetail };
}

/** The federal-heat RISK row: how much heat the strike draws and where it lands you on the 50/70/85
 * ladder. NEVER a blocker (state 'risk') — it informs, it doesn't lock. */
function federalRiskRow(state: GameState, heat: number): ActionRequirementRow {
  const before = state.player.heat;
  const after = Math.min(HEAT_MAX, before + heat);
  const crosses = FEDERAL_LADDER.find((r) => before < r.at && after >= r.at);
  const rung = [...FEDERAL_LADDER].reverse().find((r) => after >= r.at);
  const detail = crosses
    ? `pushes you past ${crosses.label} (${crosses.at}) — the Feds take notice`
    : rung
      ? `stays in ${rung.label} (${rung.at}+) territory`
      : 'stays clear of the federal ladder (50/70/85)';
  return { category: 'federal', state: 'risk', label: `Draws +${heat} federal heat`, detail, current: `${after}/100`, required: 'under 50 stays clear' };
}

// ── per-verb assembly ──────────────────────────────────────────────────────────────────────────

const TITLES: Partial<Record<InspectableActionId, { title: string; summary: string }>> = {
  lockout: { title: 'LOCKOUT', summary: 'Sic the Bureau on a rival — freeze and bleed them (quiet, no heat).' },
  move: { title: 'MOVE', summary: 'Send the selected crew to a tile.' },
  patrol: { title: 'PATROL', summary: 'Hold a beat — adds defensive presence in the district.' },
  recruit: { title: 'RECRUIT', summary: 'Hire more crew and specialists.' },
  collect: { title: 'COLLECT', summary: 'Gather the takings waiting on your fronts.' },
  extort: { title: 'EXTORT', summary: 'Put a neighbourhood front on your payroll.' },
  attack: { title: 'ATTACK', summary: 'Hit the rival racket under your sights.' },
  raid: { title: 'RAID', summary: 'Force into rival turf — softens their hold (one raid won’t seize).' },
  sabotage: { title: 'SABOTAGE', summary: 'Wreck a rival racket so it stops earning.' },
  demolish: { title: 'DEMOLISH', summary: 'Wreck the rival racket under your sights.' },
  assassinate: { title: 'ASSASSINATE', summary: 'Strike a rival Don’s HQ — the decapitating blow.' },
  expand: { title: 'EXPAND', summary: 'Push your hold deeper into a district you have a foothold in.' },
};

/** Pull one offense option's live cost/heat/target from the existing readout (the same numbers the HUD shows). */
function offenseOption(state: GameState, key: OffenseKey) {
  return offenseReadout(state).find((o) => o.key === key)!;
}

/** The rows for a verb — each requirement read independently from existing state, so the breakdown
 * shows EVERY requirement's status (not just the first gate that failed). */
function rowsFor(state: GameState, verb: InspectableActionId, ctx: InspectorContext): ActionRequirementRow[] {
  switch (verb) {
    case 'lockout': {
      const o = offenseOption(state, 'lockout');
      return [
        cooldownRow(state),
        targetRow('target', o.target !== null, o.target, 'Rival to lock down', 'No rival to lock down', 'a living rival family must remain'),
        bureauRow(state),
        cashRow(state, LOCKOUT_COST),
      ];
    }
    case 'move':
    case 'patrol':
      return [];
    case 'recruit':
      return [cashRow(state, RECRUIT_COST)];
    case 'collect':
      return [targetRow('target', canCollect(state), null, 'Takings waiting', 'No takings to collect', 'wait for protected fronts to bank a take')];
    case 'extort':
      return [targetRow('target', !!ctx.extortTarget, null, 'Front in sights', 'No front focused', 'click an un-shaken [%] front first')];
    case 'attack':
    case 'demolish': {
      const o = offenseOption(state, 'sabotage');
      return [
        targetRow('target', !!ctx.attackTarget, null, 'Rival racket in sights', 'No rival racket focused', 'right-click a rival racket first'),
        cooldownRow(state),
        crewRow(state, SABOTAGE_MIN_CREW),
        cashRow(state, SABOTAGE_COST),
        federalRiskRow(state, o.heat),
      ];
    }
    case 'sabotage': {
      const o = offenseOption(state, 'sabotage');
      return [
        cooldownRow(state),
        targetRow('target', o.target !== null, o.target, 'Rival racket to hit', 'No rival racket to hit', 'a rival must run a racket you can reach'),
        crewRow(state, SABOTAGE_MIN_CREW),
        cashRow(state, SABOTAGE_COST),
        federalRiskRow(state, o.heat),
      ];
    }
    case 'raid': {
      const o = offenseOption(state, 'raid');
      return [
        cooldownRow(state),
        homeBlockRow(state),
        targetRow('target', o.target !== null, o.target, 'Rival turf to raid', 'No rival turf to raid', 'find rival-held or contested ground'),
        crewRow(state, RAID_MIN_CREW),
        cashRow(state, RAID_COST),
        federalRiskRow(state, o.heat),
      ];
    }
    case 'assassinate': {
      const o = offenseOption(state, 'assassinate');
      return [
        cooldownRow(state),
        targetRow('target', o.target !== null, o.target, 'Rival Don in reach', 'No rival Don left', 'a living rival family must remain'),
        strengthRow(state),
        cashRow(state, ASSASSINATE_COST),
        federalRiskRow(state, o.heat),
      ];
    }
    case 'expand': {
      const target = expandTargetDistrictId(state);
      return [
        targetRow('district', target !== null, state.districts.find((d) => d.id === target)?.name ?? null, 'Somewhere to expand', 'Nowhere to expand', 'get a foothold in a district first'),
        cashRow(state, EXPAND_COST),
      ];
    }
    default:
      return [];
  }
}

// ── overall state + summary derivation ─────────────────────────────────────────────────────────

/** A missing cash/cooldown row is CONDITIONAL (you'll get there); any other missing row is a
 * structural LOCK (matches verbChipState: "need $ / regroup" → CONDITIONAL, else LOCKED). */
function isConditionalBlocker(row: ActionRequirementRow): boolean {
  return row.category === 'cash' || row.category === 'cooldown';
}

function overallState(rows: ActionRequirementRow[]): InspectorState {
  const missing = rows.filter((r) => r.state === 'missing');
  if (missing.length === 0) return 'ready';
  return missing.every(isConditionalBlocker) ? 'conditional' : 'locked';
}

function nextStepFor(row: ActionRequirementRow): string {
  switch (row.category) {
    case 'cash': return `Save up ${row.required} (you have ${row.current})`;
    case 'cooldown': return 'Wait for the crew to regroup';
    case 'unit': return row.detail ?? 'Build up your crew';
    case 'district': return row.detail ?? 'Secure a block of your own first';
    case 'channel': return row.detail ?? 'Grease the channel';
    case 'target': case 'route': case 'hq': case 'phase': case 'federal': return row.detail ?? row.label;
  }
}

/**
 * Build the requirement inspector for an action — its READY/CONDITIONAL/LOCKED state plus a row per
 * requirement (met / missing / risk). PURE: reads only existing sim state + the scene context flags.
 * `verb` is one of the action-card VerbIds; unknown/always-ready verbs yield an empty-rows READY card.
 */
export function buildActionInspector(state: GameState, verb: InspectableActionId, ctx: InspectorContext = {}): ActionRequirementInspector {
  const meta = TITLES[verb] ?? { title: verb.toUpperCase(), summary: '' };
  const rows = rowsFor(state, verb, ctx);
  const st = overallState(rows);
  // nextStep: the first MISSING row, structural before conditional (rows are ordered structural-first).
  const firstMissing = rows.find((r) => r.state === 'missing' && !isConditionalBlocker(r)) ?? rows.find((r) => r.state === 'missing');
  const risk = rows.find((r) => r.category === 'federal' && r.state === 'risk');
  return {
    actionId: verb,
    state: st,
    title: meta.title,
    summary: meta.summary,
    rows,
    nextStep: st === 'ready' ? undefined : firstMissing ? nextStepFor(firstMissing) : undefined,
    riskSummary: risk ? `${risk.label} → ${risk.current}` : undefined,
  };
}

/** RTS-30d-4 — inspectors for a MULTI-SELECTION: one per verb COMMON to the whole selection (the
 * intersection from commonVerbs). The scene passes the common verb set; this resolves each. Pure. */
export function multiSelectInspectors(state: GameState, commonVerbIds: ReadonlyArray<InspectableActionId>, ctx: InspectorContext = {}): ActionRequirementInspector[] {
  return commonVerbIds.map((verb) => buildActionInspector(state, verb, ctx));
}
