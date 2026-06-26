// DISTRICT RACKET POSTURE — PRESENTATION model (pure; Phaser-free, testable). The icon + label + plain-number
// effect summary + collector-risk preview for each posture, and the 3-option picker list. The scene draws
// these on the fixed-HUD camera. COLOUR LAW: NO green/red — postures read by ICON glyph + the brass/bone
// hierarchy (the renderer paints brass/bone; this only supplies glyphs + text).

import { POSTURE_MODS, type DistrictPosture } from '../../sim';

export interface PostureChip {
  posture: DistrictPosture;
  /** A noir glyph standing in for the art (AGGRESSIVE: raised fist/crate; FORTIFIED: barricade/padlock;
   * LOW_PROFILE: closed blinds; BALANCED: an even scale). */
  icon: string;
  label: string;
  /** One-line plain read of the trade. */
  blurb: string;
}

const CHIP: Record<DistrictPosture, PostureChip> = {
  BALANCED: { posture: 'BALANCED', icon: '⚖', label: 'BALANCED', blurb: 'a steady racket — no edge, no extra risk' },
  AGGRESSIVE: { posture: 'AGGRESSIVE', icon: '✊', label: 'AGGRESSIVE', blurb: 'squeeze harder — more dirty money, more heat + rivals' },
  FORTIFIED: { posture: 'FORTIFIED', icon: '⛓', label: 'FORTIFIED', blurb: 'dig in — tougher to take, safer runs, a little less money' },
  LOW_PROFILE: { posture: 'LOW_PROFILE', icon: '▦', label: 'LOW PROFILE', blurb: 'keep quiet — far less heat + evidence, leaner income' },
};

/** The chip (icon/label/blurb) for a posture. Pure. */
export function postureChip(p: DistrictPosture): PostureChip {
  return CHIP[p];
}

/** The 3-option picker (the non-default stances) — what the player can switch TO from the badge. Pure. */
export function posturePickerOptions(): PostureChip[] {
  return [CHIP.AGGRESSIVE, CHIP.FORTIFIED, CHIP.LOW_PROFILE];
}

/** A signed-percent for a multiplier (1.25 → "+25%", 0.7 → "−30%"); '' when neutral. Pure. */
export function signedPct(mult: number): string {
  const d = Math.round((mult - 1) * 100);
  return d === 0 ? '' : `${d > 0 ? '+' : '−'}${Math.abs(d)}%`;
}

export interface PostureEffectLines {
  /** Plain-number effect lines for the district summary (income / heat / defense / evidence). */
  lines: string[];
  /** The collector-risk preview — qualitative, never a hidden number (carry & run-safety direction). */
  collectorRisk: string;
}

/** The district-summary effect read for a posture: plain numbers + a collector-risk preview. Pure. */
export function postureEffectLines(p: DistrictPosture): PostureEffectLines {
  const m = POSTURE_MODS[p];
  const lines: string[] = [];
  const push = (name: string, mult: number) => { const s = signedPct(mult); if (s) lines.push(`${name} ${s}`); };
  push('Dirty income', m.dirtyIncome);
  push('Clean income', m.cleanIncome);
  push('Local heat', m.localHeatGain);
  push('Fed evidence', m.federalEvidenceGain);
  push('Defense', m.defense);
  if (lines.length === 0) lines.push('No modifiers — neutral racket.');
  // collector read: carry direction + run-safety direction (FORTIFIED lowers ambush risk).
  const carry = signedPct(m.collectorCarry);
  const safer = m.collectorAmbushRisk < 1;
  const riskBits: string[] = [];
  if (carry) riskBits.push(`carry ${carry}`);
  riskBits.push(safer ? 'runs are safer' : m.collectorCarry > 1 ? 'fatter, riskier hauls' : 'normal run risk');
  return { lines, collectorRisk: `Collectors: ${riskBits.join(', ')}` };
}
