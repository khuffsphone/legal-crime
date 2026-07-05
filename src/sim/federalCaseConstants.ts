// FEDERAL CASE-BUILDING — PROPOSED tunables (spec §3B + §3G). Pure data; Phaser-free.
//
// ⚠ ALL values are PROPOSED seeds for tuning (the spec marks them so). The one hard invariant: the three
// ladder thresholds are NOT re-derived here — per R1 they CONSUME the canonical FED_WARN_TIER_* constants
// (NOTICE@50 / WATCH@70 / RAID@85), so the case model can never drift from the shipped federal ladder.

import { FED_WARN_TIER_1, FED_WARN_TIER_2, FED_WARN_TIER_3 } from './constants';

/** §3B — the case-building tunables. Every `{ seed, range }` is a proposed default + its tuning band.
 * The three *_EXPOSURE thresholds alias the canonical ladder constants (R1) — do NOT hardcode 50/70/85. */
export const FEDERAL_CASE_CONSTANTS = {
  // Ladder thresholds — CONSUMED from FED_WARN_TIER_* (R1), never re-derived. Fixed (not a tuning knob).
  NOTICE_EXPOSURE: { seed: FED_WARN_TIER_1, range: [FED_WARN_TIER_1, FED_WARN_TIER_1] },
  WATCH_EXPOSURE: { seed: FED_WARN_TIER_2, range: [FED_WARN_TIER_2, FED_WARN_TIER_2] },
  RAID_EXPOSURE: { seed: FED_WARN_TIER_3, range: [FED_WARN_TIER_3, FED_WARN_TIER_3] },

  NOTICE_EVIDENCE_THRESHOLD: { seed: 20, range: [12, 30] },
  INVESTIGATION_EVIDENCE_THRESHOLD: { seed: 45, range: [32, 60] },
  INDICTMENT_EVIDENCE_THRESHOLD: { seed: 80, range: [60, 100] },
  RAID_EVIDENCE_THRESHOLD: { seed: 110, range: [90, 140] },

  QUIET_DECAY_PER_DAY: { seed: 1.4, range: [0.5, 2.5] },
  ACTIVE_DECAY_PER_DAY: { seed: 0.4, range: [0.0, 1.0] },

  HEAT_EVIDENCE_MIN_PER_DAY_AT_NOTICE: { seed: 0.8, range: [0.3, 1.5] },
  HEAT_EVIDENCE_MAX_PER_DAY_AT_100: { seed: 4.5, range: [2.5, 6.5] },

  RACKET_EVIDENCE_PER_WEIGHT_PER_DAY: { seed: 0.55, range: [0.30, 0.85] },
  RACKET_TYPE_WEIGHT: {
    speakeasy: { seed: 1.0, range: [0.7, 1.3] },
    brewery: { seed: 1.3, range: [1.0, 1.7] },
    casino: { seed: 1.1, range: [0.8, 1.4] },
    protection: { seed: 0.8, range: [0.5, 1.1] },
    smuggling: { seed: 1.4, range: [1.0, 1.8] },
    labor: { seed: 0.9, range: [0.6, 1.2] },
  },

  VIOLENCE_EVIDENCE_PER_SCORE: { seed: 0.22, range: [0.12, 0.35] },
  INFORMANT_EVIDENCE_PER_SCORE: { seed: 0.30, range: [0.18, 0.45] },

  LEGAL_DEFENSE_MAX_MITIGATION_PER_DAY: { seed: 2.2, range: [1.0, 3.5] },
  LEGAL_DEFENSE_RAISES_INDICTMENT_THRESHOLD_BY: { seed: 10, range: [4, 18] },
  LEGAL_DEFENSE_RAISES_RAID_THRESHOLD_BY: { seed: 8, range: [3, 15] },
  JUDGE_DELAY_MAX_DAYS_PER_USE: { seed: 3, range: [1, 5] },

  MIN_DAYS_IN_INVESTIGATION_FOR_INDICTMENT: { seed: 4, range: [2, 7] },
  DEFAULT_INDICTMENT_COUNTDOWN_DAYS: { seed: 5, range: [3, 8] },

  MAX_SEVERITY_EVIDENCE_ABOVE_RAID: { seed: 60, range: [40, 90] },
  RAID_TARGETS_MIN: { seed: 1, range: [1, 2] },
  RAID_TARGETS_MAX: { seed: 4, range: [3, 6] },
  LIEUTENANT_ARREST_CHANCE_MIN: { seed: 0.18, range: [0.10, 0.28] },
  LIEUTENANT_ARREST_CHANCE_MAX: { seed: 0.60, range: [0.40, 0.75] },
  ASSET_SEIZURE_FUNDS_FRAC_MIN: { seed: 0.10, range: [0.05, 0.15] },
  ASSET_SEIZURE_FUNDS_FRAC_MAX: { seed: 0.35, range: [0.25, 0.50] },
  ASSET_SEIZURE_INCOME_DAYS_MIN: { seed: 2, range: [1, 3] },
  ASSET_SEIZURE_INCOME_DAYS_MAX: { seed: 7, range: [4, 10] },
} as const;

/** §3G — per-disruption tunables. Costs are in existing Funds; reductions/adds are evidence points.
 * Issuing these actions (charging Funds, gating on channel state) is a wrapper concern (absent section). */
export const DISRUPTION_CONSTANTS = {
  intimidateWitness: {
    FUNDS_COST: { seed: 1200, range: [700, 1800] },
    EVIDENCE_REDUCTION: { seed: 8, range: [4, 12] },
    INFORMANT_PRESSURE_REDUCTION: { seed: 18, range: [10, 25] },
    HEAT_CHANGE_ON_SUCCESS: { seed: 3, range: [1, 5] },
    BACKFIRE_CHANCE: { seed: 0.18, range: [0.10, 0.28] },
    BACKFIRE_EVIDENCE_ADD: { seed: 10, range: [6, 16] },
  },
  eliminateWitness: {
    FUNDS_COST: { seed: 2600, range: [1600, 3800] },
    EVIDENCE_REDUCTION: { seed: 18, range: [10, 26] },
    INFORMANT_PRESSURE_REDUCTION: { seed: 35, range: [24, 45] },
    HEAT_CHANGE_ON_SUCCESS: { seed: 8, range: [5, 12] },
    BACKFIRE_CHANCE: { seed: 0.30, range: [0.18, 0.40] },
    BACKFIRE_EVIDENCE_ADD: { seed: 22, range: [14, 32] },
  },
  destroyEvidence: {
    FUNDS_COST: { seed: 1800, range: [1100, 2800] },
    EVIDENCE_REDUCTION: { seed: 14, range: [8, 22] },
    HEAT_CHANGE_ON_SUCCESS: { seed: 4, range: [2, 7] },
    BACKFIRE_CHANCE: { seed: 0.22, range: [0.12, 0.32] },
    BACKFIRE_EVIDENCE_ADD: { seed: 14, range: [8, 20] },
  },
  bribeJudges: {
    FUNDS_COST: { seed: 2200, range: [1400, 3600] },
    REQUIRED_JUDGE_PROTECTION: { seed: 35, range: [20, 50] },
    INDICTMENT_DELAY_DAYS: { seed: 2, range: [1, 4] },
    RAID_SOFTEN_SEVERITY: { seed: 0.12, range: [0.06, 0.20] },
    BACKFIRE_CHANCE: { seed: 0.16, range: [0.08, 0.26] },
    BACKFIRE_EVIDENCE_ADD: { seed: 8, range: [4, 12] },
  },
  lawyerUp: {
    FUNDS_UPFRONT_COST: { seed: 1500, range: [900, 2400] },
    RETAINER_PER_DAY: { seed: 180, range: [100, 260] },
    LEGAL_DEFENSE_GAIN: { seed: 30, range: [18, 40] },
    EVIDENCE_MITIGATION_PER_DAY_BONUS: { seed: 1.1, range: [0.6, 1.8] },
    SEIZURE_SOFTEN_SEVERITY: { seed: 0.15, range: [0.08, 0.24] },
  },
} as const;
