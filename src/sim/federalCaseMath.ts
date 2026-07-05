// FEDERAL CASE-BUILDING — pure evidence / stage / disruption / consequence math (spec §3C–3E, 3G, 3H).
// Phaser-free, deterministic, NO RNG inside: any randomness enters as an injected `roll01` parameter, so
// the wrapper (later ticket) draws it from a SEPARATE cursor and these functions stay pure + numbers-frozen.
// A faithful transcription of the brain spec; the only deltas from the doc are the four riders:
//   R1 — ladder thresholds come from FED_WARN_TIER_* via FEDERAL_CASE_CONSTANTS (not literal 50/70/85).
//   R2 — time enters only as the caller-supplied `deltaDays`; no real-world clock is read here.
//   R4 — DisruptionOutcome carries `streetHeatDelta` (renamed from the spec's federalHeatDelta).

import { FEDERAL_CASE_CONSTANTS, DISRUPTION_CONSTANTS } from './federalCaseConstants';
import type {
  CompletedCaseConsequences, DisruptionActionType, DisruptionOutcome, EvidenceSourceBreakdown,
  FederalCaseInput, FederalCaseStage, FederalCaseState, RacketType,
} from './federalCaseTypes';

// ── §3C utility helpers ────────────────────────────────────────────────────────────────────────
export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

export function sum(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

// ── §3D evidence-accrual model ─────────────────────────────────────────────────────────────────
/** Passive evidence/day from street heat: zero below the NOTICE threshold, then lerps up to the 100-heat
 * ceiling. §26.6 requires streetHeat to drive accrual above 50 — this is that driver. */
export function computeHeatEvidencePerDay(streetHeat: number): number {
  const c = FEDERAL_CASE_CONSTANTS;
  if (streetHeat < c.NOTICE_EXPOSURE.seed) return 0; // NOTICE threshold (R1: FED_WARN_TIER_1)
  const t = (streetHeat - c.NOTICE_EXPOSURE.seed) / (100 - c.NOTICE_EXPOSURE.seed);
  return lerp(c.HEAT_EVIDENCE_MIN_PER_DAY_AT_NOTICE.seed, c.HEAT_EVIDENCE_MAX_PER_DAY_AT_100.seed, t);
}

export function getRacketEvidenceWeight(type: RacketType): number {
  return FEDERAL_CASE_CONSTANTS.RACKET_TYPE_WEIGHT[type].seed;
}

export function computeRacketEvidencePerDay(activeRackets: { type: RacketType; count: number }[]): number {
  const c = FEDERAL_CASE_CONSTANTS;
  const weightedSiteCount = sum(activeRackets.map((r) => Math.max(0, r.count) * getRacketEvidenceWeight(r.type)));
  return weightedSiteCount * c.RACKET_EVIDENCE_PER_WEIGHT_PER_DAY.seed;
}

export function computeViolenceEvidencePerDay(recentViolenceScore: number): number {
  return Math.max(0, recentViolenceScore) * FEDERAL_CASE_CONSTANTS.VIOLENCE_EVIDENCE_PER_SCORE.seed;
}

export function computeInformantEvidencePerDay(informantPressure: number): number {
  return Math.max(0, informantPressure) * FEDERAL_CASE_CONSTANTS.INFORMANT_EVIDENCE_PER_SCORE.seed;
}

export function computeLegalMitigationPerDay(legalDefense: number): number {
  return clamp01(legalDefense / 100) * FEDERAL_CASE_CONSTANTS.LEGAL_DEFENSE_MAX_MITIGATION_PER_DAY.seed;
}

export function computeEvidenceDecayPerDay(stage: FederalCaseStage): number {
  const c = FEDERAL_CASE_CONSTANTS;
  return stage === 'quiet' ? c.QUIET_DECAY_PER_DAY.seed : c.ACTIVE_DECAY_PER_DAY.seed;
}

/** The full per-step evidence breakdown: four gross sources, minus legal mitigation and stage decay,
 * scaled by the step's deltaDays. Pure. */
export function computeEvidenceDelta(input: FederalCaseInput, state: FederalCaseState): EvidenceSourceBreakdown {
  const fromHeat = computeHeatEvidencePerDay(input.streetHeat);
  const fromRackets = computeRacketEvidencePerDay(input.activeRackets);
  const fromViolence = computeViolenceEvidencePerDay(input.recentViolenceScore);
  const fromInformants = computeInformantEvidencePerDay(input.informantPressure);

  const grossGain = fromHeat + fromRackets + fromViolence + fromInformants;
  const mitigation = computeLegalMitigationPerDay(input.legalDefense);
  const decay = computeEvidenceDecayPerDay(state.stage);

  const netPerDay = grossGain - mitigation - decay;

  return {
    fromHeat, fromRackets, fromViolence, fromInformants,
    grossGain, mitigation, decay,
    netGain: netPerDay * input.deltaDays,
  };
}

/** Apply a step's netGain to the running total, floored at zero. Pure. */
export function applyEvidenceDelta(currentEvidence: number, delta: EvidenceSourceBreakdown): number {
  return Math.max(0, currentEvidence + delta.netGain);
}

// ── §3E effective thresholds + stage resolution ────────────────────────────────────────────────
export function getEffectiveIndictmentThreshold(legalDefense: number): number {
  const base = FEDERAL_CASE_CONSTANTS.INDICTMENT_EVIDENCE_THRESHOLD.seed;
  const bonus = clamp01(legalDefense / 100) * FEDERAL_CASE_CONSTANTS.LEGAL_DEFENSE_RAISES_INDICTMENT_THRESHOLD_BY.seed;
  return base + bonus;
}

export function getEffectiveRaidThreshold(legalDefense: number): number {
  const base = FEDERAL_CASE_CONSTANTS.RAID_EVIDENCE_THRESHOLD.seed;
  const bonus = clamp01(legalDefense / 100) * FEDERAL_CASE_CONSTANTS.LEGAL_DEFENSE_RAISES_RAID_THRESHOLD_BY.seed;
  return base + bonus;
}

/** Resolve the case stage for a step (§3E). federalExposure STRICTLY gates the ladder crossings
 * (50/70/85, from FED_WARN_TIER_* via the constants); evidence + timers gate the case-build depth. */
export function determineFederalCaseStage(input: FederalCaseInput, state: FederalCaseState): FederalCaseStage {
  const c = FEDERAL_CASE_CONSTANTS;
  const evidence = state.accumulatedEvidence;
  const indictmentThreshold = getEffectiveIndictmentThreshold(input.legalDefense);
  const raidThreshold = getEffectiveRaidThreshold(input.legalDefense);

  const raidEligible =
    (input.federalExposure >= c.RAID_EXPOSURE.seed && evidence >= raidThreshold) ||
    (state.stage === 'indictment' &&
      state.daysInIndictment >= c.DEFAULT_INDICTMENT_COUNTDOWN_DAYS.seed + input.pendingIndictmentDelayDays &&
      evidence >= indictmentThreshold);

  if (raidEligible) return 'raidArrest';

  const indictmentEligible =
    input.federalExposure >= c.WATCH_EXPOSURE.seed &&
    evidence >= indictmentThreshold &&
    state.daysInInvestigation >= c.MIN_DAYS_IN_INVESTIGATION_FOR_INDICTMENT.seed;

  if (indictmentEligible) return 'indictment';

  const investigationEligible =
    input.federalExposure >= c.WATCH_EXPOSURE.seed &&
    evidence >= c.INVESTIGATION_EVIDENCE_THRESHOLD.seed;

  if (investigationEligible) return 'investigation';

  const noticeEligible =
    input.federalExposure >= c.NOTICE_EXPOSURE.seed ||
    evidence >= c.NOTICE_EVIDENCE_THRESHOLD.seed;

  if (noticeEligible) return 'notice';
  return 'quiet';
}

/** Advance the two stage timers given the resolved next stage (§3E). Investigation time accumulates across
 * investigation→indictment→raid; indictment time across indictment→raid; both reset on de-escalation. */
export function advanceCaseTimers(
  prior: FederalCaseState,
  nextStage: FederalCaseStage,
  deltaDays: number,
): Pick<FederalCaseState, 'daysInInvestigation' | 'daysInIndictment'> {
  const inInvestigation = nextStage === 'investigation' || nextStage === 'indictment' || nextStage === 'raidArrest';
  const wasInInvestigation = prior.stage === 'investigation' || prior.stage === 'indictment' || prior.stage === 'raidArrest';
  const inIndictment = nextStage === 'indictment' || nextStage === 'raidArrest';
  const wasInIndictment = prior.stage === 'indictment' || prior.stage === 'raidArrest';
  return {
    daysInInvestigation: inInvestigation ? (wasInInvestigation ? prior.daysInInvestigation + deltaDays : deltaDays) : 0,
    daysInIndictment: inIndictment ? (wasInIndictment ? prior.daysInIndictment + deltaDays : deltaDays) : 0,
  };
}

// ── §3G player disruption options (strategic math; roll01 injected — no RNG here) ────────────────
/** Resolve one disruption action from an injected [0,1) roll (§3G). Pure: the caller draws roll01 from a
 * separate cursor. R4: the heat field is `streetHeatDelta` (the spec's federalHeatDelta) — it pushes the
 * existing street-heat metric. */
export function resolveDisruptionAction(action: DisruptionActionType, roll01: number): DisruptionOutcome {
  if (action === 'intimidateWitness') {
    const r = DISRUPTION_CONSTANTS.intimidateWitness;
    const backfired = roll01 < r.BACKFIRE_CHANCE.seed;
    return backfired
      ? { evidenceDelta: +r.BACKFIRE_EVIDENCE_ADD.seed, informantPressureDelta: +8, streetHeatDelta: +5, pendingIndictmentDelayDaysDelta: 0, legalDefenseDelta: 0, severitySoftenDelta: 0, backfired: true }
      : { evidenceDelta: -r.EVIDENCE_REDUCTION.seed, informantPressureDelta: -r.INFORMANT_PRESSURE_REDUCTION.seed, streetHeatDelta: +r.HEAT_CHANGE_ON_SUCCESS.seed, pendingIndictmentDelayDaysDelta: 0, legalDefenseDelta: 0, severitySoftenDelta: 0, backfired: false };
  }

  if (action === 'eliminateWitness') {
    const r = DISRUPTION_CONSTANTS.eliminateWitness;
    const backfired = roll01 < r.BACKFIRE_CHANCE.seed;
    return backfired
      ? { evidenceDelta: +r.BACKFIRE_EVIDENCE_ADD.seed, informantPressureDelta: +12, streetHeatDelta: +12, pendingIndictmentDelayDaysDelta: 0, legalDefenseDelta: 0, severitySoftenDelta: 0, backfired: true }
      : { evidenceDelta: -r.EVIDENCE_REDUCTION.seed, informantPressureDelta: -r.INFORMANT_PRESSURE_REDUCTION.seed, streetHeatDelta: +r.HEAT_CHANGE_ON_SUCCESS.seed, pendingIndictmentDelayDaysDelta: 0, legalDefenseDelta: 0, severitySoftenDelta: 0, backfired: false };
  }

  if (action === 'destroyEvidence') {
    const r = DISRUPTION_CONSTANTS.destroyEvidence;
    const backfired = roll01 < r.BACKFIRE_CHANCE.seed;
    return backfired
      ? { evidenceDelta: +r.BACKFIRE_EVIDENCE_ADD.seed, informantPressureDelta: 0, streetHeatDelta: +7, pendingIndictmentDelayDaysDelta: 0, legalDefenseDelta: 0, severitySoftenDelta: 0, backfired: true }
      : { evidenceDelta: -r.EVIDENCE_REDUCTION.seed, informantPressureDelta: 0, streetHeatDelta: +r.HEAT_CHANGE_ON_SUCCESS.seed, pendingIndictmentDelayDaysDelta: 0, legalDefenseDelta: 0, severitySoftenDelta: 0, backfired: false };
  }

  if (action === 'bribeJudges') {
    const r = DISRUPTION_CONSTANTS.bribeJudges;
    const backfired = roll01 < r.BACKFIRE_CHANCE.seed;
    return backfired
      ? { evidenceDelta: +r.BACKFIRE_EVIDENCE_ADD.seed, informantPressureDelta: 0, streetHeatDelta: +4, pendingIndictmentDelayDaysDelta: 0, legalDefenseDelta: 0, severitySoftenDelta: 0, backfired: true }
      : { evidenceDelta: 0, informantPressureDelta: 0, streetHeatDelta: +1, pendingIndictmentDelayDaysDelta: +r.INDICTMENT_DELAY_DAYS.seed, legalDefenseDelta: 0, severitySoftenDelta: r.RAID_SOFTEN_SEVERITY.seed, backfired: false };
  }

  // lawyerUp — deterministic (no backfire): buy legal defense + a seizure-softening retainer.
  return {
    evidenceDelta: 0,
    informantPressureDelta: 0,
    streetHeatDelta: 0,
    pendingIndictmentDelayDaysDelta: 0,
    legalDefenseDelta: DISRUPTION_CONSTANTS.lawyerUp.LEGAL_DEFENSE_GAIN.seed,
    severitySoftenDelta: DISRUPTION_CONSTANTS.lawyerUp.SEIZURE_SOFTEN_SEVERITY.seed,
    backfired: false,
  };
}

// ── §3H completed-case consequences ──────────────────────────────────────────────────────────────
/** Case severity in [0,1] (§3H): a 40/60 blend of over-RAID street heat and over-raid-threshold evidence,
 * minus any legal soften fraction. Pure. */
export function computeCaseSeverity01(
  streetHeat: number,
  accumulatedEvidence: number,
  legalSoftenFrac: number,
): number {
  const c = FEDERAL_CASE_CONSTANTS;
  const heatT = clamp01((streetHeat - c.RAID_EXPOSURE.seed) / (100 - c.RAID_EXPOSURE.seed));
  const evidenceT = clamp01((accumulatedEvidence - c.RAID_EVIDENCE_THRESHOLD.seed) / c.MAX_SEVERITY_EVIDENCE_ABOVE_RAID.seed);
  const raw = heatT * 0.4 + evidenceT * 0.6;
  return clamp01(raw - legalSoftenFrac);
}

/** Severity-scaled consequences of a completed case (§3H). Pure numbers; the wrapper applies them
 * (seizing funds, freezing income, rolling lieutenant arrests). */
export function computeCompletedCaseConsequences(severity01: number): CompletedCaseConsequences {
  const c = FEDERAL_CASE_CONSTANTS;
  return {
    raidTargetCount: Math.round(lerp(c.RAID_TARGETS_MIN.seed, c.RAID_TARGETS_MAX.seed, severity01)),
    lieutenantArrestChance: lerp(c.LIEUTENANT_ARREST_CHANCE_MIN.seed, c.LIEUTENANT_ARREST_CHANCE_MAX.seed, severity01),
    fundsSeizureFraction: lerp(c.ASSET_SEIZURE_FUNDS_FRAC_MIN.seed, c.ASSET_SEIZURE_FUNDS_FRAC_MAX.seed, severity01),
    incomeFrozenDays: Math.round(lerp(c.ASSET_SEIZURE_INCOME_DAYS_MIN.seed, c.ASSET_SEIZURE_INCOME_DAYS_MAX.seed, severity01)),
  };
}
