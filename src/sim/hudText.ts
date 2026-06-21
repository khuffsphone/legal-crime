// RTS-23 (to HUD_SPEC.md) — pure HUD TEXT/STATE helpers. No Phaser, no mutation: they only turn
// numbers into the spec's LABELED, named, direction-aware reads so the scene never hard-codes them
// and they stay unit-tested. Honors the canon four channels + the 50/70/85 federal ladder.

import type { IncidentSeverity, IncidentType } from './ledger';

// ── §1D — the federal heat ladder, named (CLEAR / NOTICE / WATCH / RAID@85) ─────────────────────

export type FederalTierName = 'CLEAR' | 'NOTICE' | 'WATCH' | 'RAID';

/** The named tier for a federal-warning tier (0..3 from fedWarningTier). */
export function federalTierLabel(tier: number): FederalTierName {
  if (tier >= 3) return 'RAID';
  if (tier >= 2) return 'WATCH';
  if (tier >= 1) return 'NOTICE';
  return 'CLEAR';
}

/** The engraved ladder ticks for the heat meter: threshold + its label (NOTICE 50 / WATCH 70 / RAID 85). */
export const FEDERAL_LADDER: ReadonlyArray<{ at: number; label: FederalTierName }> = [
  { at: 50, label: 'NOTICE' },
  { at: 70, label: 'WATCH' },
  { at: 85, label: 'RAID' },
];

// ── §2 — the four channels as named BRACKETS (NONE → … → IRON GRIP) ─────────────────────────────

export interface BribeBracket {
  /** The bracket name for the current level. */
  name: string;
  /** 0..N pips filled (out of PIPS) for the dial. */
  pips: number;
  /** The next bracket's name and the $/wk it starts at, or null at the top (IRON GRIP). */
  nextName: string | null;
  nextAt: number | null;
}

const BRACKETS: ReadonlyArray<{ at: number; name: string }> = [
  { at: 0, name: 'NONE' },
  { at: 1, name: 'GREASED' },
  { at: 15, name: 'ON THE TAKE' },
  { at: 30, name: 'IN POCKET' },
  { at: 50, name: 'IRON GRIP' },
];
export const BRIBE_PIPS = 5;

/** The named bracket for a channel's $/wk level (NONE → GREASED → ON THE TAKE → IN POCKET → IRON GRIP). */
export function bribeBracket(level: number): BribeBracket {
  let cur = BRACKETS[0];
  for (const b of BRACKETS) if (level >= b.at) cur = b;
  const next = BRACKETS.find((b) => b.at > level) ?? null;
  const pips = BRACKETS.findIndex((b) => b.name === cur.name);
  return { name: cur.name, pips, nextName: next?.name ?? null, nextAt: next?.at ?? null };
}

// ── §3C — action-verb chip states (READY / CONDITIONAL / LOCKED) ────────────────────────────────

export type VerbState = 'READY' | 'CONDITIONAL' | 'LOCKED';

/**
 * The chip state for an action gate. READY = do it now. CONDITIONAL = only cash or a cooldown away
 * (you'll get there). LOCKED = a structural prerequisite is missing (muscle, a held block, a
 * channel investment). Pure — derived from the gate's ok + plain reason.
 */
export function verbChipState(ok: boolean, reason: string): VerbState {
  if (ok) return 'READY';
  if (/need \$|regroup|afford/i.test(reason)) return 'CONDITIONAL';
  return 'LOCKED';
}

// ── §4 — THE WIRE: alert categories (colored dots) + "needs you" priority ───────────────────────

export type AlertCategory = 'money' | 'threat' | 'law' | 'turf' | 'crew' | 'other';

/** The category (for the Wire's colored dot) of an incident type, with a hex dot colour from the
 * Fedora-Noir palette. */
export function alertCategory(type: IncidentType): { category: AlertCategory; color: string } {
  switch (type) {
    case 'deposit': case 'collector_run': case 'extortion': case 'settlement': case 'market': case 'vice':
      return { category: 'money', color: '#4e8b5a' }; // cash-green
    case 'civic': case 'event':
      return { category: 'law', color: '#b8862b' }; // brass (civic / world events)
    case 'robbery': case 'offense':
      return { category: 'threat', color: '#8a2b22' }; // blood (static; danger-red is motion-only)
    case 'federal_warning': case 'federal_warrant': case 'federal_cooldown': case 'bust': case 'raid': case 'shock': case 'loan':
      return { category: 'law', color: '#b8862b' }; // brass
    case 'territory': case 'family_fallen': case 'game_over':
      return { category: 'turf', color: '#9e1b1b' }; // rival red
    case 'mutiny': case 'desertion':
      return { category: 'crew', color: '#d98a6a' }; // amber
    default:
      return { category: 'other', color: '#9a8f80' }; // fog
  }
}

/** Whether an incident is a "NEEDS YOU" priority (it demands the player react). */
export function incidentNeedsYou(severity: IncidentSeverity): boolean {
  return severity === 'danger' || severity === 'warning';
}
