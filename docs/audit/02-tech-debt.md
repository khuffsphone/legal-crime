# Report 2 — Tech-Debt Ledger

Audit target: Brassmere @ `7e3ddae` · scope `src/` (TypeScript + Phaser 3). Every claim carries a `file:line` citation.

## 1. Debt Markers

### 1a. Hard markers (TODO / FIXME / HACK / XXX / @ts-ignore / @ts-expect-error / eslint-disable)

Command run: `grep -rniE 'TODO|FIXME|HACK|XXX|@ts-ignore|@ts-expect-error|eslint-disable' src`

**ZERO genuine hard markers.** The only hits are false positives: the substring `ToDo` inside the identifier `hitsToDown` in `src/sim/opPreview.ts:79-89`. No `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `FIXME`, `HACK`, or `XXX` exists anywhere in `src`. Type-safety and lint-suppression debt is effectively nil — a genuine strength of this tree.

### 1b. Soft debt signals (superseded / deprecated / legacy / stale / temporary / "for now" / workaround)

| Signal | file:line | Severity |
|---|---|---|
| `⚠ SUPERSEDED (A-D era)` gate module | `src/scenes/audio/noXrayGate.ts:1` | high (dead — see §5) |
| `⚠ SUPERSEDED (A-D era)` cue governance | `src/scenes/audio/cueQueue.ts:1` | high (dead — see §5) |
| `⚠ SUPERSEDED (A-D era)` event→cue mapper | `src/scenes/audio/sfxEventMapper.ts:1` | high (dead — see §5) |
| `⚠ SUPERSEDED (A-D era)` district-bed spine | `src/scenes/audio/atmosphereSpine.ts:57` | high (dead — see §5) |
| SESSION-ONLY log, "for now"; persistence hook deferred | `src/scenes/info/logStore.ts:107` | med |
| `BANKRUPT_FLOOR` legacy, "superseded by DEBT_CEILING in P15" | `src/sim/constants.ts:102` | med |
| Legacy `scatterProps` adapter feeds emitters (pre-streetscape-T4) | `src/scenes/audio/propEmitterCatalog.ts:11-12,107` | med |
| `LEGACY_PROP_FAMILY` map kept for live-map dressing | `src/scenes/audio/propEmitterCatalog.ts:110,131` | med |
| Legacy single-role texture keys "kept for compatibility" | `src/scenes/cityArt.ts:65,729,756` | low |
| `collapseLegacyPanels` / "legacy side panels retired" HUD phase-1 | `src/scenes/IsoScene.ts:4524,4680,4687,4692,5455` | med |
| Legacy `?arm=1` / `?debug=turf` legacy QA forms | `src/scenes/devDebug.ts:79,218` | low |
| Legacy loyaltyDelta path (trait-less) | `src/sim/traits.ts:96`, `src/sim/gangsters.ts:91`, `src/sim/conflict.ts:18` | low |
| Legacy 5-district map special-casing throughout sim | `src/sim/city.ts:4,37,47,61`, `src/sim/state.ts:71`, `src/sim/strategy.ts:6,258`, `src/sim/mapEconomy.ts:77`, `src/sim/realtime.ts:75,131` | low (breadth) |
| Legacy-save resumability fallback | `src/sim/saveLoad.ts:37,73` | low |
| "for now" flavor/temporary states (green trait, federal cooldown) | `src/sim/traits.ts:27`, `src/sim/federal.ts:88`, `src/sim/law.ts:101` | info |
| Settings schema "SANITISED … stale blob" defensive read | `src/scenes/settings.ts:6` | info |

No `kludge` / `stopgap` occurrences found. Most "stale" hits are intentional domain vocabulary (intel staleness bands, stale-id pruning) — not debt.

## 2. God-Files (LOC-ranked)

`find src -name '*.ts' | xargs wc -l | sort -rn` — top 20 (total 34,762 LOC):

| Rank | file | LOC | Note |
|---|---|---|---|
| 1 | `src/scenes/IsoScene.ts` | 6701 | monster scene (see below) |
| 2 | `src/scenes/cityArt.ts` | 1073 | ~24 sprite-bake fns |
| 3 | `src/sim/commands.ts` | 919 | command dispatch + 14 appliers |
| 4 | `src/sim/index.ts` | 731 | pure barrel re-export (low logic risk) |
| 5 | `src/scenes/audio.ts` | 456 | AudioManager |
| 6 | `src/sim/constants.ts` | 402 | tuning table |
| 7 | `src/sim/combatControl.ts` | 396 | |
| 8 | `src/scenes/settingsPanel.ts` | 395 | |
| 9 | `src/sim/extortionEmbodied.ts` | 390 | |
| 10 | `src/sim/mapEconomy.ts` | 357 | |
| 11 | `src/sim/actionInspector.ts` | 348 | |
| 12 | `src/sim/beatCops.ts` | 344 | |
| 13 | `src/scenes/ambientLife.ts` | 342 | |
| 14 | `src/sim/combatResolve.ts` | 339 | |
| 15 | `src/sim/types.ts` | 329 | |
| 16 | `src/scenes/audio/propEmitterPlanner.ts` | 314 | |
| 17 | `src/sim/onboarding.ts` | 309 | |
| 18 | `src/sim/pacing.ts` | 285 | |
| 19 | `src/sim/strategy.ts` | 281 | |
| 20 | `src/scenes/env/streetscapeTaxonomy.ts` | 281 | |

### IsoScene.ts — the #1 risk

- **6701 LOC**, **66 `import` statements** (`src/scenes/IsoScene.ts:1-301`), ~486 `private ` occurrences (fields+methods).
- It is a **god-class** owning at least seven responsibilities in one class body:
  - **Render/tiles**: `drawCity` `IsoScene.ts:1218`, `drawGround` `:1388`, `drawSetDressing` `:1313`, `updateUnits` `:1899`.
  - **Fog/visibility**: `isVisibleTile` `:2950`, `seedFogAroundPlayer` `:1478`, `revealFog` `:1488`.
  - **Input/commands**: `setupSelectionInput` `:2439`, `commandSelect/Contextual/Attack*/Move/FocusFire/…` `:2785-3200`.
  - **Camera**: `setupCameraControls` `:4386`.
  - **HUD**: `drawHud` `:4592`, `refreshHud` `:5385`, `collapseLegacyPanels` `:4692`, dossier strip `:5455`.
  - **Audio wiring**: `audioSink` `:2988`, `buildAtmosphereFrame` `:3002`, `isAudioFeedbackEligible` `:2961`, `atmosphereDistrictAt` `:2971`.
  - **Sim/war orchestration**: `tickWar` `:1635`, `tickRivalOffense` `:1729`, `advanceRivalStrike` `:1781`.
- **Why it's high risk:** any feature branch touching input, HUD, audio, render, or war logic edits this one file → it is a **merge-conflict / serialization bottleneck**; no two contributors can work these subsystems in parallel without collisions. It also defeats unit isolation (the pure sim in `src/sim/*` is testable; this scene is not). Notably, the audit's one critical NO-X-RAY leak (report 4, Finding 1) is inside this file — its size hides exactly this kind of ungated seam.

`src/sim/index.ts` (#4) is a **god-barrel** — 731 lines of `export * / export {…}` re-exports (`src/sim/index.ts:1-30`), no logic; low risk but a wide implicit dependency surface.

## 3. Long Functions (>100 lines)

Worst offenders by estimated span:

| Rank | function | file:line | ~length | Severity |
|---|---|---|---|---|
| 1 | `updateUnits(dt)` | `src/scenes/IsoScene.ts:1899` | ~363 | high — per-frame hot loop mixing sprite sync, fog reveal gating (`:2089,:2141`), occlusion, ambush FX |
| 2 | `drawFedora(...)` | `src/scenes/cityArt.ts:159` | ~157 | med — cohesive sprite baking, but monolithic |
| 3 | `applyExtort(state,cmd)` | `src/sim/commands.ts:208` | ~140 | med — single command applier |
| 4 | `create()` | `src/scenes/IsoScene.ts:941` | ~132 | med — scene bootstrap, many concerns |
| 5 | `setupCameraControls()` | `src/scenes/IsoScene.ts:4386` | ~126 | med |
| 6 | `refreshHud()` | `src/scenes/IsoScene.ts:5385` | ~104 | med |
| 7 | `drawHud()` | `src/scenes/IsoScene.ts:4592` | ~100 | med |

Other big appliers just under threshold: `applyLaunder` `commands.ts:654` (~64), `applyCollect` `:718` (~59). `cityArt.buildCityTextures` `:710` is only ~47 lines — the file's bulk is ~24 discrete `bake*` functions (`cityArt.ts:316-696`), not one long function. `sim/index.ts` has no functions (barrel).

## 4. Duplicated / Parallel Logic

| Duplication | Sites | Severity |
|---|---|---|
| **Fog/visibility closures** — the same `isRevealed(this.fog, round…)` predicate is rebuilt ~17× (`grep -c` = 17 in IsoScene) and threaded as distinct closures: `isVisibleTile` `IsoScene.ts:2950`, combat `combatCtx().isVisible` `:2868`, audio `isAudioFeedbackEligible` `:2961`, bed `atmosphereDistrictAt` `:2972`; the sim mirrors it as the `IsVisible` type + `ALWAYS_VISIBLE` `sim/opPreview.ts:26,28,55`; audio re-expresses the gate via `shouldEmitFeedback(revealed,onScreen)` `atmosphereCoordinator.ts:187`, `propEmitterPlanner.ts:6`, and the **dead** `noXrayGate.ts:49`. One reveal rule, many hand-wired adapters. | med — behavioral drift risk if fog semantics change; and the ungated seam in report 4 is precisely what happens when a new surface forgets to adopt one of these closures |
| **NO-X-RAY gate implemented twice** — live path `weaponFeedback.shouldEmitFeedback` (used at `atmosphereCoordinator.ts:187`, `propEmitterPlanner.ts`) vs the superseded reimplementation `cueSuppressReason`/`cueAllowed`/`gateCues` in `noXrayGate.ts:44,53,63`. | high — dead duplicate of a safety-critical rule (§5) |
| **Legacy prop catalog vs live catalog** — `LEGACY_PROP_FAMILY` adapter `propEmitterCatalog.ts:110-136` parallels the intended streetscape-T4 placement path that "doesn't exist yet" (`propEmitterCatalog.ts:11-12`). | med |
| **Legacy texture-key resolvers** — `figureKeyForRole` `cityArt.ts:757` kept beside preferred `figureKeyFor` `cityArt.ts:95` ("Prefer figureKeyFor" `:756`). Two key-mapping code paths. | low |

**Not duplicated (verified):** iso projection math is centralized in `src/sim/iso.ts` (`gridToScreen` `:26`, `tileCorners` `:49`, `screenToGrid` `:34`, `depthValue` `:60`); IsoScene imports rather than reimplements (`IsoScene.ts:8-11` via `../sim`). No copy-pasted projection found.

## 5. Dead Code

**Confirmed dead cluster — the entire A-D-era audio pipeline (production-dead, but test-covered).** No **live production** module, scene, or sim file imports any of these four; in `src/` they import only each other:

| Module | Live production importers | Test importers | Verdict |
|---|---|---|---|
| `src/scenes/audio/noXrayGate.ts` | **none** | `tests/audioNoXrayGate.test.ts`, `tests/audioSceneAdapter.test.ts` | dead-in-runtime, tested |
| `src/scenes/audio/cueQueue.ts` | **none** | `tests/audioCueQueue.test.ts` | dead-in-runtime, tested |
| `src/scenes/audio/sfxEventMapper.ts` | only `noXrayGate.ts:24`, `cueQueue.ts:22` (both dead) | `tests/audioSfxEventMapper.test.ts` (+ the two above) | dead-in-runtime, tested |
| `src/scenes/audio/atmosphereSpine.ts` | only `cueQueue.ts:21`, `sfxEventMapper.ts:36` (both dead) | `tests/audioAtmosphereSpine.test.ts` | dead-in-runtime, tested |

- `grep -rn noXrayGate src` → **only self-reference** (`noXrayGate.ts:4`); the exports `cueSuppressReason` `:44`, `cueAllowed` `:53`, `gateCues` `:63` have **zero live call sites**. The shipping game gates audio via `shouldEmitFeedback` directly (`atmosphereCoordinator.ts:187`, `propEmitterPlanner.ts:16`), never via `gateCues`.
- **Correction to a first-pass error:** these modules ARE covered by four test files (in `tests/`, not `src/`). They are therefore not "untested dead code" but **dead-in-runtime-yet-green** — ~4 source files + ~4 test files that compile, run, and pass while contributing nothing to the shipped build. `noXrayGate.test.ts` even encodes the *wrong* behavior for the live path: it asserts full suppression, whereas the live coordinator downgrades to non-positional (see report 3, Finding 1).

**Recommendation:** delete `noXrayGate.ts`, `cueQueue.ts`, `sfxEventMapper.ts`, `atmosphereSpine.ts` together (mutually-referential, no live importers) **and** their four test files. Verify `atmosphereSpine`'s `cueMeta`/`AudioCueMeta`/`MvpCueKey` exports have no live consumer before removal (`sfxEventMapper.ts:36` is the only importer and is itself dead).

**Flagged-but-KEEP:** `BANKRUPT_FLOOR` `constants.ts:102` is exported and marked superseded — retained deliberately for legacy-save compat; not provably unused, do not delete. `LEGACY_PROP_FAMILY`/`legacyEmitterSources` are **live** (imported by `IsoScene.ts:248,1053`) — legacy-named but not dead. The `federalCase*` cluster is unwired but deliberate spec-ahead scaffolding (`docs/federal-case/SPEC_GAPS.md`), not dead code — see report 3.

## 6. Master Risk Ledger (high → low)

| # | Finding | file:line | Sev | Rationale |
|---|---|---|---|---|
| 1 | IsoScene god-class, 6701 LOC / 66 imports / 7 responsibilities | `src/scenes/IsoScene.ts:1-301,941,1899,4386,4592,5385` | **high** | merge-conflict bottleneck; any input/HUD/audio/render/war branch serializes here; untestable; hides ungated seams (report 4) |
| 2 | `updateUnits` ~363-line per-frame loop mixing render+fog+FX | `src/scenes/IsoScene.ts:1899` | **high** | hot path, hard to reason about / modify safely |
| 3 | Dead A-D audio cluster (4 files, mutual imports, no live consumers) + 4 green test files | `noXrayGate.ts:1`, `cueQueue.ts:1`, `sfxEventMapper.ts:1`, `atmosphereSpine.ts:57` | **high** | dead runtime weight + duplicate NO-X-RAY gate; tests give false "covered" signal; delete as a unit |
| 4 | NO-X-RAY gate duplicated (live `shouldEmitFeedback` vs dead `gateCues`) | `atmosphereCoordinator.ts:187` vs `noXrayGate.ts:44-63` | **high** | two implementations of a safety-critical fog rule; the dead one encodes different behavior |
| 5 | Visibility predicate rebuilt ~17× as parallel closures | `IsoScene.ts:2950,2868,2961,2972`; `opPreview.ts:26-55` | **med** | drift risk; no single source — the mechanism behind the report-4 leak |
| 6 | cityArt 1073 LOC, ~24 bake fns; `drawFedora` ~157 lines | `src/scenes/cityArt.ts:159,316-696` | **med** | large sprite-bake surface, one long fn |
| 7 | `applyExtort` ~140-line command applier | `src/sim/commands.ts:208` | **med** | monolithic; hard to test branches |
| 8 | `create` / `setupCameraControls` / `refreshHud` / `drawHud` >100 lines | `IsoScene.ts:941,4386,5385,4592` | **med** | oversized scene methods |
| 9 | Legacy prop catalog adapter parallels unbuilt T4 path | `propEmitterCatalog.ts:11-12,110-136` | **med** | transitional dual-path, will need reconciliation |
| 10 | Legacy HUD side-panel retirement leftovers | `IsoScene.ts:4524,4680,4687,4692,5455` | **med** | half-migrated HUD phase-1 |
| 11 | Log persistence deferred ("SESSION-ONLY for now") | `src/scenes/info/logStore.ts:107` | **med** | known missing feature hook |
| 12 | `BANKRUPT_FLOOR` superseded by `DEBT_CEILING` (P15) | `src/sim/constants.ts:102` | **med** | dual cash-floor concepts coexist |
| 13 | Legacy 5-district special-casing spread across sim | `city.ts:4-61`, `state.ts:71`, `strategy.ts:6-258`, `mapEconomy.ts:77`, `realtime.ts:75-131` | **low** | breadth of conditional legacy support |
| 14 | Two figure-key resolvers (`figureKeyForRole` legacy) | `cityArt.ts:757` vs `:95` | **low** | prefer-one duplication |
| 15 | Legacy `?arm`/`?debug=turf` QA flags, legacy loyaltyDelta | `devDebug.ts:79,218`; `traits.ts:96` | **low** | back-compat cruft |
| 16 | `sim/index.ts` 731-line god-barrel | `src/sim/index.ts:1-30` | **low** | wide implicit dep surface, no logic |
| 17 | No hard markers / no `@ts-ignore` / no `eslint-disable` | (`grep` empty) | **info** | positive: zero type/lint suppression debt |
