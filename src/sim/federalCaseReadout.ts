// FEDERAL CASE-BUILDING — NO-X-RAY player readout (spec §3F). Pure; Phaser-free.
// The player sees ONLY banded evidence + player-knowable signals — never exact evidence points, source
// weights, dice, agent plans, or unrevealed witness identities (§26.2). This is the single sanctioned
// projection of the hidden case state to the HUD (a later wiring ticket consumes it).

import { FEDERAL_CASE_CONSTANTS } from './federalCaseConstants';
import type {
  FederalCaseInput, FederalCaseState, PlayerCaseReadout, PlayerCaseSignal,
} from './federalCaseTypes';

/** Band the exact evidence into the five player-facing tiers (§3F). The only place raw evidence is read
 * for player display — and it leaves as a band, never a number. */
export function getPlayerEvidenceBand(evidence: number): PlayerCaseReadout['evidenceBand'] {
  const c = FEDERAL_CASE_CONSTANTS;
  if (evidence < c.NOTICE_EVIDENCE_THRESHOLD.seed * 0.5) return 'none';
  if (evidence < c.NOTICE_EVIDENCE_THRESHOLD.seed) return 'thin';
  if (evidence < c.INVESTIGATION_EVIDENCE_THRESHOLD.seed) return 'building';
  if (evidence < c.INDICTMENT_EVIDENCE_THRESHOLD.seed) return 'strong';
  return 'sealed';
}

/** The player-knowable signals for the current case state (§3F). Signals are qualitative rumors, never
 * exact internals. */
export function getPlayerCaseSignals(input: FederalCaseInput, state: FederalCaseState): PlayerCaseSignal[] {
  const signals: PlayerCaseSignal[] = [];

  if (state.stage === 'notice' || state.stage === 'investigation' || state.stage === 'indictment') {
    signals.push('federalWhispers');
  }
  if (state.stage === 'investigation' || state.stage === 'indictment') {
    signals.push('surveillanceSightings', 'paperTrailConcern');
  }
  if (input.informantPressure >= 25) signals.push('witnessMovement');
  if (state.stage === 'investigation' && input.federalExposure >= FEDERAL_CASE_CONSTANTS.WATCH_EXPOSURE.seed) {
    signals.push('subpoenaRumors');
  }
  if (state.stage === 'indictment') {
    signals.push('grandJuryRumblings');
    if (state.daysInIndictment >= 2) signals.push('warrantsImminent');
  }
  if (
    state.stage === 'indictment' &&
    state.daysInIndictment >= FEDERAL_CASE_CONSTANTS.DEFAULT_INDICTMENT_COUNTDOWN_DAYS.seed - 1
  ) {
    signals.push('raidWarning');
  }

  return signals;
}

/** The full NO-X-RAY readout (§3F). quiet/resolved show nothing; raidArrest is masked to 'indictment' at
 * the player boundary (the raid itself surfaces through its own consequence beat, not this readout). */
export function getPlayerCaseReadout(input: FederalCaseInput, state: FederalCaseState): PlayerCaseReadout {
  if (state.stage === 'quiet' || state.stage === 'resolved') {
    return { visibleStage: 'none', evidenceBand: 'none', signals: [] };
  }
  return {
    visibleStage: state.stage === 'raidArrest' ? 'indictment' : state.stage,
    evidenceBand: getPlayerEvidenceBand(state.accumulatedEvidence),
    signals: getPlayerCaseSignals(input, state),
  };
}
