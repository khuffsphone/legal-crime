// FEDERAL INVESTIGATION / CASE-BUILDING — pure types (spec §3A). Phaser-free, no DOM, no RNG.
// A faithful transcription of the "Federal Case Building — REV 2" brain spec, sections 1–4 + 26 (the
// only sections present in that draft). This models how a fictional federal case advances through the
// EXISTING federal ladder (NOTICE@50 / WATCH@70 / RAID@85) on top of accumulated evidence.
//
// ⚠ SPEC-PARTIAL: this package builds ONLY the fully-specified pure math (§3A–3H). Everything the math
// consumes or feeds that lives in an ABSENT section is flagged in docs/federal-case/SPEC_GAPS.md and is
// NOT invented here — notably §23 (tick cadence: how `deltaDays` maps to repo weeks/dt), the input-source
// derivations (recentViolenceScore / informantPressure / judgeProtection / legalDefense / activeRackets),
// the case-stage log kinds, and the application of consequences (fund seizure / income freeze / arrests).
// This module is pure data + math; nothing wires it into tick/applyCommand (a separate later ticket).

/** The federal case's internal stage machine (§2 stage diagram). */
export type FederalCaseStage =
  | 'quiet'
  | 'notice'
  | 'investigation'
  | 'indictment'
  | 'raidArrest'
  | 'resolved';

/** Player-knowable signals surfaced by the NO-X-RAY readout (§3F). Never exposes hidden internals. */
export type PlayerCaseSignal =
  | 'federalWhispers'
  | 'surveillanceSightings'
  | 'subpoenaRumors'
  | 'witnessMovement'
  | 'paperTrailConcern'
  | 'grandJuryRumblings'
  | 'warrantsImminent'
  | 'raidWarning';

/** The five abstract disruption levers (§3G). Strategic math only — issuance/cost-charging is a wrapper
 * concern (an absent section), out of scope for these pure modules. */
export type DisruptionActionType =
  | 'intimidateWitness'
  | 'eliminateWitness'
  | 'destroyEvidence'
  | 'bribeJudges'
  | 'lawyerUp';

/** The case model's OWN racket taxonomy for evidence weighting (§3A). ⚠ This is NOT the repo's
 * OperationKind ('numbers'|'smuggling'|'speakeasy'|'protection'); mapping repo operations → these racket
 * types is an absent-section concern (flagged). */
export type RacketType =
  | 'speakeasy'
  | 'brewery'
  | 'casino'
  | 'protection'
  | 'smuggling'
  | 'labor';

/** A per-step breakdown of where evidence came from (returned by computeEvidenceDelta). */
export interface EvidenceSourceBreakdown {
  fromHeat: number;
  fromRackets: number;
  fromViolence: number;
  fromInformants: number;
  grossGain: number;
  mitigation: number;
  decay: number;
  /** grossGain − mitigation − decay, scaled by the step's deltaDays. */
  netGain: number;
}

/** All inputs the case math consumes for one step. The wrapper (later ticket) derives these from existing
 * state; the pure math never reaches into GameState. `federalExposure` is the EXISTING
 * federal.ts federalExposure() output (heat + dirty hoard − Bureau relief), consumed — not recomputed. */
export interface FederalCaseInput {
  /** The step's time delta in the spec's tuning unit ("case-days"). ⚠ R2/§23: the wrapper must supply
   * this from the repo cadence (weeks/dt); the weeks↔case-days mapping is an absent section, flagged. */
  deltaDays: number;
  /** 0..100 existing canonical STREET heat (the LOCKED-VOCABULARY streetHeat; replaces "federalHeat"). */
  streetHeat: number;
  /** 0..100, gates thresholds 50/70/85 — the existing federalExposure (heat + dirty hoard − Bureau relief). */
  federalExposure: number;
  activeRackets: { type: RacketType; count: number }[];
  /** 0..100 decayed value from existing combat/incidents (derivation = absent section). */
  recentViolenceScore: number;
  /** 0..100 from existing witness/informant/event state (derivation = absent section). */
  informantPressure: number;
  /** 0..100 from the existing judges bribery channel (derivation = absent section). */
  judgeProtection: number;
  /** 0..100 from lawyer-up / retainer state (derivation = absent section). */
  legalDefense: number;
  pendingIndictmentDelayDays: number;
}

/** The case's persisted internal state. Where this lives on GameState + how it ticks is a wrapper concern. */
export interface FederalCaseState {
  /** PROPOSED operating range 0..200. */
  accumulatedEvidence: number;
  stage: FederalCaseStage;
  daysInInvestigation: number;
  daysInIndictment: number;
  caseResolvedRecently: boolean;
}

/** The NO-X-RAY player-facing projection (§3F). Bands + signals only — never exact evidence/dice/weights. */
export interface PlayerCaseReadout {
  visibleStage: 'none' | 'notice' | 'investigation' | 'indictment';
  evidenceBand: 'none' | 'thin' | 'building' | 'strong' | 'sealed';
  signals: PlayerCaseSignal[];
}

/** The result of resolving one disruption action (§3G).
 * ⚠ R4: the spec's `federalHeatDelta` is renamed here to `streetHeatDelta` — disruption pushes the EXISTING
 * street heat metric (LOCKED VOCABULARY: streetHeat), there is no separate "federal heat" pool. */
export interface DisruptionOutcome {
  evidenceDelta: number;
  informantPressureDelta: number;
  /** Δ to the existing STREET heat metric (renamed from the spec's federalHeatDelta per R4). */
  streetHeatDelta: number;
  pendingIndictmentDelayDaysDelta: number;
  legalDefenseDelta: number;
  severitySoftenDelta: number;
  backfired: boolean;
}

/** The severity-scaled outcome of a completed case (§3H). Pure numbers; APPLYING them (seizing funds,
 * freezing income, lieutenant arrest rolls) is a wrapper concern (absent section). */
export interface CompletedCaseConsequences {
  raidTargetCount: number;
  lieutenantArrestChance: number;
  fundsSeizureFraction: number;
  incomeFrozenDays: number;
}
