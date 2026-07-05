// FEDERAL CASE-BUILDING (spec-partial, pure) — mutation-verified + numbers-frozen tests. Canon guards:
// the modules stay Phaser-free and never touch tick/applyCommand/realtime; the ladder thresholds are
// CONSUMED from FED_WARN_TIER_* (R1, never re-derived); streetHeat drives accrual above 50 and
// federalExposure strictly gates the 50/70/85 crossings (§26.6); and no proposed log kind collides with
// the 22-value IncidentType enum (R3). Nothing here wires the modules in, so existing behavior is untouched.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FED_WARN_TIER_1, FED_WARN_TIER_2, FED_WARN_TIER_3 } from '../src/sim/constants';
import { FEDERAL_CASE_CONSTANTS, DISRUPTION_CONSTANTS } from '../src/sim/federalCaseConstants';
import {
  computeHeatEvidencePerDay, computeRacketEvidencePerDay, computeViolenceEvidencePerDay,
  computeInformantEvidencePerDay, computeLegalMitigationPerDay, computeEvidenceDecayPerDay,
  computeEvidenceDelta, applyEvidenceDelta, getEffectiveIndictmentThreshold, getEffectiveRaidThreshold,
  determineFederalCaseStage, advanceCaseTimers, resolveDisruptionAction, computeCaseSeverity01,
  computeCompletedCaseConsequences,
} from '../src/sim/federalCaseMath';
import {
  getPlayerEvidenceBand, getPlayerCaseSignals, getPlayerCaseReadout,
} from '../src/sim/federalCaseReadout';
import type { FederalCaseInput, FederalCaseState } from '../src/sim/federalCaseTypes';

const baseInput = (over: Partial<FederalCaseInput> = {}): FederalCaseInput => ({
  deltaDays: 1, streetHeat: 0, federalExposure: 0, activeRackets: [], recentViolenceScore: 0,
  informantPressure: 0, judgeProtection: 0, legalDefense: 0, pendingIndictmentDelayDays: 0, ...over,
});
const st = (over: Partial<FederalCaseState> = {}): FederalCaseState => ({
  accumulatedEvidence: 0, stage: 'quiet', daysInInvestigation: 0, daysInIndictment: 0,
  caseResolvedRecently: false, ...over,
});

describe('R1 — ladder thresholds are CONSUMED from FED_WARN_TIER_*, never re-derived', () => {
  it('the three exposure thresholds ARE the canonical ladder constants (50/70/85)', () => {
    expect(FEDERAL_CASE_CONSTANTS.NOTICE_EXPOSURE.seed).toBe(FED_WARN_TIER_1);
    expect(FEDERAL_CASE_CONSTANTS.WATCH_EXPOSURE.seed).toBe(FED_WARN_TIER_2);
    expect(FEDERAL_CASE_CONSTANTS.RAID_EXPOSURE.seed).toBe(FED_WARN_TIER_3);
    expect([FED_WARN_TIER_1, FED_WARN_TIER_2, FED_WARN_TIER_3]).toEqual([50, 70, 85]); // the shipped ladder
  });

  it('the constants module imports the ladder + hardcodes no bare 50/70/85 for the exposure thresholds', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'sim', 'federalCaseConstants.ts'), 'utf8');
    expect(src).toMatch(/import \{[^}]*FED_WARN_TIER_1[^}]*\} from '\.\/constants'/);
    // the *_EXPOSURE lines reference FED_WARN_TIER_*, not literals
    for (const line of src.split('\n').filter((l) => /_EXPOSURE:/.test(l))) {
      expect(line, `EXPOSURE line must consume the ladder: ${line.trim()}`).toMatch(/FED_WARN_TIER_/);
      expect(line).not.toMatch(/\b(50|70|85)\b/);
    }
  });
});

describe('§26.6 mathematical integrity — streetHeat drives accrual above 50', () => {
  it('heat evidence/day is ZERO below the NOTICE threshold and rises monotonically to the 100 ceiling', () => {
    expect(computeHeatEvidencePerDay(0)).toBe(0);
    expect(computeHeatEvidencePerDay(49)).toBe(0);            // below 50 → no passive accrual
    expect(computeHeatEvidencePerDay(50)).toBeCloseTo(0.8, 10); // exactly at NOTICE → the floor rate
    expect(computeHeatEvidencePerDay(75)).toBeCloseTo(2.65, 10);
    expect(computeHeatEvidencePerDay(100)).toBeCloseTo(4.5, 10); // the 100-heat ceiling
    expect(computeHeatEvidencePerDay(80)).toBeGreaterThan(computeHeatEvidencePerDay(60));
  });

  it('the other three sources scale linearly with their scores (numbers-frozen)', () => {
    expect(computeRacketEvidencePerDay([{ type: 'speakeasy', count: 2 }])).toBeCloseTo(1.1, 10); // 2·1.0·0.55
    expect(computeRacketEvidencePerDay([{ type: 'smuggling', count: 1 }])).toBeCloseTo(0.77, 10); // 1·1.4·0.55
    expect(computeViolenceEvidencePerDay(50)).toBeCloseTo(11, 10);   // 50·0.22
    expect(computeInformantEvidencePerDay(40)).toBeCloseTo(12, 10);  // 40·0.30
    expect(computeLegalMitigationPerDay(100)).toBeCloseTo(2.2, 10);
    expect(computeLegalMitigationPerDay(50)).toBeCloseTo(1.1, 10);
    expect(computeEvidenceDecayPerDay('quiet')).toBe(1.4);
    expect(computeEvidenceDecayPerDay('investigation')).toBe(0.4); // any non-quiet stage → active decay
  });

  it('computeEvidenceDelta assembles gross − mitigation − decay, scaled by deltaDays', () => {
    const d = computeEvidenceDelta(
      baseInput({ streetHeat: 75, activeRackets: [{ type: 'speakeasy', count: 2 }], recentViolenceScore: 50, informantPressure: 40, deltaDays: 2 }),
      st({ stage: 'notice' }),
    );
    expect(d.fromHeat).toBeCloseTo(2.65, 10);
    expect(d.fromRackets).toBeCloseTo(1.1, 10);
    expect(d.fromViolence).toBeCloseTo(11, 10);
    expect(d.fromInformants).toBeCloseTo(12, 10);
    expect(d.grossGain).toBeCloseTo(26.75, 10);
    expect(d.mitigation).toBe(0);
    expect(d.decay).toBe(0.4);
    expect(d.netGain).toBeCloseTo((26.75 - 0.4) * 2, 8); // (gross − decay) · deltaDays
  });

  it('applyEvidenceDelta floors accumulated evidence at zero (decay cannot go negative)', () => {
    const d = computeEvidenceDelta(baseInput({ streetHeat: 0, deltaDays: 5 }), st({ stage: 'quiet' }));
    expect(d.netGain).toBeLessThan(0);                       // pure decay
    expect(applyEvidenceDelta(2, d)).toBe(0);                // floored, not negative
    expect(applyEvidenceDelta(100, d)).toBeCloseTo(100 + d.netGain, 8);
  });
});

describe('§3E stage resolution — federalExposure STRICTLY gates the 50/70/85 crossings', () => {
  it('NOTICE boundary at 50: exposure 49 stays quiet, 50 crosses to notice', () => {
    expect(determineFederalCaseStage(baseInput({ federalExposure: 49 }), st())).toBe('quiet');
    expect(determineFederalCaseStage(baseInput({ federalExposure: 50 }), st())).toBe('notice');
  });

  it('WATCH boundary at 70: 69 stays notice, 70 (+evidence≥45) crosses to investigation', () => {
    expect(determineFederalCaseStage(baseInput({ federalExposure: 69 }), st({ accumulatedEvidence: 45 }))).toBe('notice');
    expect(determineFederalCaseStage(baseInput({ federalExposure: 70 }), st({ accumulatedEvidence: 45 }))).toBe('investigation');
  });

  it('RAID boundary at 85: 84 (built case) stays indictment, 85 crosses to raidArrest', () => {
    const built = st({ accumulatedEvidence: 110, stage: 'indictment', daysInInvestigation: 6, daysInIndictment: 1 });
    expect(determineFederalCaseStage(baseInput({ federalExposure: 84 }), built)).toBe('indictment');
    expect(determineFederalCaseStage(baseInput({ federalExposure: 85 }), built)).toBe('raidArrest');
  });

  it('indictment needs WATCH exposure + indictment-evidence + minimum investigation maturity', () => {
    // evidence at threshold but not enough investigation days → still investigation
    expect(determineFederalCaseStage(baseInput({ federalExposure: 72 }), st({ accumulatedEvidence: 80, daysInInvestigation: 3 }))).toBe('investigation');
    expect(determineFederalCaseStage(baseInput({ federalExposure: 72 }), st({ accumulatedEvidence: 80, daysInInvestigation: 4 }))).toBe('indictment');
  });

  it('evidence alone (≥ NOTICE evidence threshold) can surface NOTICE even below 50 exposure', () => {
    expect(determineFederalCaseStage(baseInput({ federalExposure: 10 }), st({ accumulatedEvidence: 20 }))).toBe('notice');
    expect(determineFederalCaseStage(baseInput({ federalExposure: 10 }), st({ accumulatedEvidence: 19 }))).toBe('quiet');
  });

  it('legal defense raises the effective indictment + raid thresholds', () => {
    expect(getEffectiveIndictmentThreshold(0)).toBe(80);
    expect(getEffectiveIndictmentThreshold(100)).toBeCloseTo(90, 10); // +10 at full defense
    expect(getEffectiveRaidThreshold(0)).toBe(110);
    expect(getEffectiveRaidThreshold(100)).toBeCloseTo(118, 10);      // +8 at full defense
    // a raid that would fire at defense 0 is held off by a strong defense
    const s = st({ accumulatedEvidence: 112 });
    expect(determineFederalCaseStage(baseInput({ federalExposure: 90, legalDefense: 0 }), s)).toBe('raidArrest');
    expect(determineFederalCaseStage(baseInput({ federalExposure: 90, legalDefense: 100 }), s)).not.toBe('raidArrest');
  });

  it('advanceCaseTimers accumulates across stages and resets on de-escalation', () => {
    // investigation time carries into indictment + raid
    expect(advanceCaseTimers(st({ stage: 'investigation', daysInInvestigation: 3 }), 'indictment', 2))
      .toEqual({ daysInInvestigation: 5, daysInIndictment: 2 });
    // dropping back to notice resets both
    expect(advanceCaseTimers(st({ stage: 'indictment', daysInInvestigation: 9, daysInIndictment: 4 }), 'notice', 1))
      .toEqual({ daysInInvestigation: 0, daysInIndictment: 0 });
  });
});

describe('§3G disruption — roll-injected (no RNG), R4 streetHeatDelta, numbers-frozen', () => {
  it('backfire fires strictly below BACKFIRE_CHANCE; outcomes match the spec constants', () => {
    const r = DISRUPTION_CONSTANTS.intimidateWitness;
    const back = resolveDisruptionAction('intimidateWitness', r.BACKFIRE_CHANCE.seed - 0.001);
    expect(back.backfired).toBe(true);
    expect(back.evidenceDelta).toBe(+r.BACKFIRE_EVIDENCE_ADD.seed); // +10
    const win = resolveDisruptionAction('intimidateWitness', r.BACKFIRE_CHANCE.seed); // exactly at ⇒ NOT backfire
    expect(win.backfired).toBe(false);
    expect(win.evidenceDelta).toBe(-r.EVIDENCE_REDUCTION.seed);     // −8
    expect(win.informantPressureDelta).toBe(-r.INFORMANT_PRESSURE_REDUCTION.seed);
  });

  it('R4: the heat field is streetHeatDelta (never federalHeatDelta) on every outcome', () => {
    const outcomes = (['intimidateWitness', 'eliminateWitness', 'destroyEvidence', 'bribeJudges', 'lawyerUp'] as const)
      .flatMap((a) => [resolveDisruptionAction(a, 0.99), resolveDisruptionAction(a, 0.0)]);
    for (const o of outcomes) {
      expect(o).toHaveProperty('streetHeatDelta');
      expect(o).not.toHaveProperty('federalHeatDelta');
      expect(typeof o.streetHeatDelta).toBe('number');
    }
  });

  it('lawyerUp is deterministic (no backfire) — buys legal defense + seizure soften', () => {
    const a = resolveDisruptionAction('lawyerUp', 0.0);
    const b = resolveDisruptionAction('lawyerUp', 0.99);
    expect(a).toEqual(b);
    expect(a.legalDefenseDelta).toBe(DISRUPTION_CONSTANTS.lawyerUp.LEGAL_DEFENSE_GAIN.seed);
    expect(a.severitySoftenDelta).toBe(DISRUPTION_CONSTANTS.lawyerUp.SEIZURE_SOFTEN_SEVERITY.seed);
    expect(a.backfired).toBe(false);
  });

  it('bribeJudges (success) delays the indictment + softens the raid without touching evidence', () => {
    const r = DISRUPTION_CONSTANTS.bribeJudges;
    const win = resolveDisruptionAction('bribeJudges', 0.99);
    expect(win.evidenceDelta).toBe(0);
    expect(win.pendingIndictmentDelayDaysDelta).toBe(+r.INDICTMENT_DELAY_DAYS.seed);
    expect(win.severitySoftenDelta).toBeCloseTo(r.RAID_SOFTEN_SEVERITY.seed, 10);
  });
});

describe('§3H completed-case consequences — numbers-frozen', () => {
  it('severity is a 40/60 heat/evidence blend, clamped, minus the legal soften', () => {
    expect(computeCaseSeverity01(85, 110, 0)).toBe(0);          // exactly at both thresholds
    expect(computeCaseSeverity01(100, 170, 0)).toBeCloseTo(1, 10); // both maxed
    expect(computeCaseSeverity01(100, 170, 0.5)).toBeCloseTo(0.5, 10); // soften subtracts
    expect(computeCaseSeverity01(100, 170, 5)).toBe(0);        // over-soften clamps at 0
    expect(computeCaseSeverity01(85, 170, 0)).toBeCloseTo(0.6, 10); // evidence-only ⇒ 0.6 weight
  });

  it('consequences lerp between the seed floors and ceilings across severity 0..1', () => {
    expect(computeCompletedCaseConsequences(0)).toEqual({
      raidTargetCount: 1, lieutenantArrestChance: 0.18, fundsSeizureFraction: 0.10, incomeFrozenDays: 2,
    });
    expect(computeCompletedCaseConsequences(1)).toEqual({
      raidTargetCount: 4, lieutenantArrestChance: 0.60, fundsSeizureFraction: 0.35, incomeFrozenDays: 7,
    });
  });
});

describe('§3F NO-X-RAY readout — bands + signals only, never raw internals', () => {
  it('evidence bands at their boundaries', () => {
    expect(getPlayerEvidenceBand(9)).toBe('none');    // < 20·0.5
    expect(getPlayerEvidenceBand(10)).toBe('thin');
    expect(getPlayerEvidenceBand(19)).toBe('thin');
    expect(getPlayerEvidenceBand(20)).toBe('building');
    expect(getPlayerEvidenceBand(44)).toBe('building');
    expect(getPlayerEvidenceBand(45)).toBe('strong');
    expect(getPlayerEvidenceBand(79)).toBe('strong');
    expect(getPlayerEvidenceBand(80)).toBe('sealed');
    expect(getPlayerEvidenceBand(9999)).toBe('sealed');
  });

  it('the readout NEVER exposes a raw evidence number — only a band + qualitative fields', () => {
    const readout = getPlayerCaseReadout(baseInput({ federalExposure: 75, informantPressure: 30 }),
      st({ stage: 'investigation', accumulatedEvidence: 63.4 }));
    // structural NO-X-RAY: no numeric evidence leaks; only banded + string vocab
    expect(JSON.stringify(readout)).not.toContain('63.4');
    expect(readout.evidenceBand).toBe('strong');
    expect(Object.keys(readout).sort()).toEqual(['evidenceBand', 'signals', 'visibleStage']);
  });

  it('raidArrest is masked to indictment; quiet/resolved show nothing', () => {
    expect(getPlayerCaseReadout(baseInput(), st({ stage: 'raidArrest', accumulatedEvidence: 120 })).visibleStage).toBe('indictment');
    expect(getPlayerCaseReadout(baseInput(), st({ stage: 'quiet' }))).toEqual({ visibleStage: 'none', evidenceBand: 'none', signals: [] });
    expect(getPlayerCaseReadout(baseInput(), st({ stage: 'resolved' }))).toEqual({ visibleStage: 'none', evidenceBand: 'none', signals: [] });
  });

  it('signals gate on stage + informant pressure + indictment maturity', () => {
    expect(getPlayerCaseSignals(baseInput(), st({ stage: 'notice' }))).toEqual(['federalWhispers']);
    const inv = getPlayerCaseSignals(baseInput({ federalExposure: 72, informantPressure: 30 }), st({ stage: 'investigation' }));
    expect(inv).toEqual(expect.arrayContaining(['federalWhispers', 'surveillanceSightings', 'paperTrailConcern', 'subpoenaRumors', 'witnessMovement']));
    const late = getPlayerCaseSignals(baseInput(), st({ stage: 'indictment', daysInIndictment: 4 }));
    expect(late).toEqual(expect.arrayContaining(['grandJuryRumblings', 'warrantsImminent', 'raidWarning']));
    // informant pressure below 25 ⇒ no witnessMovement
    expect(getPlayerCaseSignals(baseInput({ informantPressure: 24 }), st({ stage: 'notice' }))).not.toContain('witnessMovement');
  });
});

describe('purity + determinism + R3 log-kind namespace', () => {
  it('same inputs ⇒ deep-equal outputs (deterministic; no hidden state / clock / RNG)', () => {
    const i = baseInput({ streetHeat: 88, federalExposure: 90, activeRackets: [{ type: 'casino', count: 3 }], recentViolenceScore: 40, informantPressure: 55, legalDefense: 20, deltaDays: 1 });
    const s = st({ stage: 'investigation', accumulatedEvidence: 96, daysInInvestigation: 5 });
    expect(computeEvidenceDelta(i, s)).toEqual(computeEvidenceDelta(i, s));
    expect(determineFederalCaseStage(i, s)).toBe(determineFederalCaseStage(i, s));
    expect(getPlayerCaseReadout(i, s)).toEqual(getPlayerCaseReadout(i, s));
  });

  it('the fed-case modules are Phaser-free, never touch tick/applyCommand/realtime, and emit NO log kind', () => {
    const dir = join(process.cwd(), 'src', 'sim');
    for (const f of readdirSync(dir).filter((f) => f.startsWith('federalCase') && f.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, `${f} imports phaser`).not.toMatch(/from\s+['"]phaser['"]/i);
      expect(src, `${f} imports tick/commands/realtime`).not.toMatch(/from '\.\/(tick|commands|realtime)'/);
      // pure math: no log emission, no RNG, no clock (randomness is the injected roll01 parameter)
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, `${f} emits a log kind`).not.toMatch(/kind:\s*['"]/);
      expect(code, `${f} uses Math.random`).not.toMatch(/Math\.random/);
    }
  });

  it('R3: no fed-case vocabulary collides with the 22-value IncidentType enum or the base ladder log kinds', () => {
    // Snapshot of the 22 IncidentType values (src/sim/ledger.ts) + the base federal ladder's raw log kinds.
    const INCIDENT_TYPES = [
      'collector_run', 'robbery', 'deposit', 'settlement', 'federal_warning', 'federal_warrant',
      'federal_cooldown', 'bust', 'raid', 'mutiny', 'desertion', 'loan', 'shock', 'extortion', 'territory',
      'family_fallen', 'offense', 'market', 'vice', 'event', 'civic', 'game_over',
    ];
    expect(INCIDENT_TYPES).toHaveLength(22);
    const LADDER_LOG_KINDS = ['fed-warning', 'fed-cooldown', 'fed-armed']; // what tier-crossing emission reuses
    // the ladder kinds (hyphen namespace) are distinct from the IncidentType enum (underscore namespace)
    for (const k of LADDER_LOG_KINDS) expect(INCIDENT_TYPES).not.toContain(k);
    // this package introduces NO new log kind (emission is a later wiring ticket); every stage/band/signal
    // string it DOES define must also avoid the IncidentType namespace so a future emitter can't collide.
    const CASE_VOCAB = [
      'quiet', 'notice', 'investigation', 'indictment', 'raidArrest', 'resolved',
      'none', 'thin', 'building', 'strong', 'sealed',
      'federalWhispers', 'surveillanceSightings', 'subpoenaRumors', 'witnessMovement', 'paperTrailConcern',
      'grandJuryRumblings', 'warrantsImminent', 'raidWarning',
    ];
    for (const v of CASE_VOCAB) expect(INCIDENT_TYPES, `case vocab '${v}' collides with IncidentType`).not.toContain(v);
  });
});
