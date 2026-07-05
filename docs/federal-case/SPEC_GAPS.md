# Federal Case-Building — built vs gapped (spec-partial)

Source: brain doc **"Federal Case Building — REV 2"** (`1UEfqbhxeMMUstPj9KfJa8CjtMf1Uy5tipsUa3P3CvSY`).
That draft ships **sections 1–4 + 26 only**; 5–25 and 27–28 are absent. Per the dispatch, this lane builds
**only the fully-specified pure modules** and **flags — does not invent —** everything a referenced-but-absent
section would define.

## Built (fully specified: §1–4 + §26)

| File | Spec | What |
|---|---|---|
| `src/sim/federalCaseTypes.ts` | §3A | stages, signals, disruption/racket enums, input/state/readout/outcome/consequence shapes |
| `src/sim/federalCaseConstants.ts` | §3B, §3G | proposed tunables; the three exposure thresholds **consume** `FED_WARN_TIER_*` (R1) |
| `src/sim/federalCaseMath.ts` | §3C–3E, 3G, 3H | evidence accrual, effective thresholds, stage resolution, timers, disruption, severity, consequences |
| `src/sim/federalCaseReadout.ts` | §3F | NO-X-RAY player readout (bands + signals only) |
| `tests/federalCase.test.ts` | §26 checklist | 26 tests — see below |

All pure, Phaser-free, unreferenced by the runtime (existing outcomes bit-identical).

## Riders applied

- **R1** — `NOTICE/WATCH/RAID_EXPOSURE` alias `FED_WARN_TIER_1/2/3`; 50/70/85 are never re-derived (tested, incl. a source scan).
- **R2** — the pure math reads no clock; time enters only as the caller-supplied `deltaDays`. **Fully satisfying R2 needs §23** (below).
- **R3** — the package emits **no** log kind (emission is deferred); the R3 test guards the case vocab + the reused ladder kinds against the 22-value `IncidentType` enum.
- **R4** — `DisruptionOutcome.streetHeatDelta` (renamed from the spec's `federalHeatDelta`).

## Gapped — needs spec text before the wiring ticket can proceed (do NOT invent)

1. **§23 — tick cadence (R2 bridge).** The math is tuned in **"case-days"** (`*_PER_DAY`, `deltaDays`), but the repo's cadence unit is the **week** (`WEEK_DURATION_SECONDS`) / `dt`. **Needed:** the weeks↔case-days mapping (how many case-days a settlement week advances, or a `dt`→days rule). Until then the wrapper cannot derive `deltaDays`.
2. **Input-source derivations.** `FederalCaseInput` fields are consumed but their derivation from existing state is unspecified. **Needed:** how to compute `recentViolenceScore` (from combat/incidents), `informantPressure` (witness/informant state — does any exist yet?), `judgeProtection` (from `bribes.judges`), `legalDefense` (lawyer/retainer state — new?), `activeRackets` + the **`RacketType` ↔ repo `OperationKind`** mapping (`speakeasy/brewery/casino/protection/smuggling/labor` vs `numbers/smuggling/speakeasy/protection`), `pendingIndictmentDelayDays`.
3. **State placement + the tick step.** Where `FederalCaseState` lives on `GameState`, and the post-tick system that: samples inputs → `computeEvidenceDelta`/`applyEvidenceDelta` → `determineFederalCaseStage` → `advanceCaseTimers`. This is the wrapper (a forbidden file for this lane); it needs its own spec.
4. **Consequence application (§3H) + its RNG.** `computeCompletedCaseConsequences` returns numbers; **applying** them (seize `fundsSeizureFraction` of Funds, freeze income `incomeFrozenDays`, roll `lieutenantArrestChance` per lieutenant, pick `raidTargetCount` "high-profile" sites) is unspecified — including **which separate RNG cursor** the arrest/target rolls draw from and **which sites** count as high-profile.
5. **Disruption issuance.** Commands to trigger the five actions, Funds cost charging, the `REQUIRED_JUDGE_PROTECTION` gate for `bribeJudges`, and the `roll01` cursor. `resolveDisruptionAction` is pure with `roll01` injected — the issuance path is unspecified.
6. **Case-stage log kinds (R3 target).** §26.5 requires validating "proposed event-log kinds", but no case-stage kinds are defined in the present sections. **Needed:** the kind strings for stage transitions (NOTICE/INVESTIGATION/INDICTMENT/RAID) so they can be collision-checked vs `IncidentType` and the untyped log strings before emission. The tier-crossing telegraph already reuses the existing `fed-warning`/`fed-cooldown`/`fed-armed`.
7. **RESOLVED / AFTERMATH exit math (§2).** The stage diagram shows `RESOLVED`, and `FederalCaseState.caseResolvedRecently` exists, but no section defines the raid→resolved transition, the post-case cooldown, or evidence reset.
8. **HUD / scene wire-up.** Explicitly a separate later ticket behind IsoScene (consumes `getPlayerCaseReadout`).
