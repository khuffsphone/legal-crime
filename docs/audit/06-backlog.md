# Report 6 — Recommended-Fixes Backlog

> **2026-08-30 status:** PR #93's current FP-01 candidate completes BL-01/02 and the minimap half of BL-05,
> then extends the same fix across City/Wire/hover/world-label/HQ/offense surfaces with behavioral twin-world
> tests. BL-03/04/06/07/08 remain structural follow-up work; see Report 4's remediation update and Claude UAT Test I.

Dispatch-ready synthesis of reports 1–5. No fix is implemented here — this is the next-iterations menu.
Every item traces to a `file:line`-cited finding upstream. **Parallel-safety** is judged against the known
open lanes (#80 cop-p1-heat, #75, #73, #77) and, above all, against **`IsoScene.ts`** — the 6701-LOC
god-file (report 2 §2) that is the repo's merge-conflict bottleneck: anything editing it must serialize
with every other `IsoScene.ts` lane.

## Ranked summary

| ID | Title | Pri | Size | Lane | Parallel-safe? |
|---|---|---|---|---|---|
| BL-01 | Gate combat info-events through `isVisibleTile` | **P0** | S | no-xray / IsoScene | ❌ serialize on IsoScene |
| BL-02 | Behavioral test for combat info-event fog gating | **P0** | S | test | ⚠ pairs with BL-01 |
| BL-03 | Delete dead A–D audio cluster + its 4 test files | P1 | M | audio / dead-code | ✅ isolated (coord. w/ audio lane) |
| BL-04 | Close the dead-gate duplicate of the NO-X-RAY rule | P1 | S | audio / no-xray | ✅ (subset of BL-03) |
| BL-05 | Explicit rulings/gates for latent leaks (state.log, minimap fills) | P2 | S | no-xray | ❌ touches IsoScene + combat.ts |
| BL-06 | Unify the ~17 fog closures behind one injected predicate | P2 | M | IsoScene / no-xray | ❌ serialize on IsoScene |
| BL-07 | Replace `fogLeak` source-scan with behavioral tests | P2 | M | test | ✅ test-only |
| BL-08 | Decompose `IsoScene.ts` god-class | P2 | L | IsoScene | ❌ THE bottleneck — schedule alone |
| BL-09 | Canon reconciliation: faction-on-body accent | P3 | S→M | canon / render | ⚠ decision first |
| BL-10 | Wire or shelve the `federalCase*` subsystem | P3 | L | sim-core | ✅ (until wired into tick) |
| BL-11 | Long-function refactors (`updateUnits`, `applyExtort`, …) | P3 | M | mixed | ❌ IsoScene half serializes |
| BL-12 | Legacy-cruft sweep | P3 | S→M | mixed | ⚠ mostly ✅, some IsoScene |

**Serialization note:** BL-01, BL-05, BL-06, BL-08, BL-11 all edit `IsoScene.ts` and therefore cannot run
in parallel with each other or with any open lane that touches it (#80 cop-p1-heat touched IsoScene for cop
rendering; confirm #75/#73/#77 scopes before dispatch). BL-03/04/07/10 are genuinely parallel-safe.

---

## P0 — latent leak / correctness

### BL-01 — Gate combat info-events through `isVisibleTile`
- **From:** report 4, Finding 1 (CRITICAL, hand-verified). `IsoScene.ts:3551` calls `recordInfoEvent` unconditionally, ahead of the `visible` gate at `:3558`; `recordInfoEvent` (`:6134-6144`) pushes a click-to-jump Wire row + edge alert + minimap ping with the struck tile, for `unit.down`/`combat.hit` (`infoEvents.ts:43`), including rival-vs-rival fights in fog (`combat.ts:33,93-99`).
- **Scope:** `src/scenes/IsoScene.ts` (`playCombatBeat` ~3546, and/or `recordInfoEvent` ~6134). Keep own-unit downs (`faction==='player'`) visible.
- **Size:** S (a one-predicate guard the file already computes one line later).
- **Lane:** no-xray / render-IsoScene.
- **Parallel-safe:** ❌ — edits `IsoScene.ts`; serialize with all IsoScene lanes.
- **Priority:** **P0** — three player-facing channels leak a hidden actor's exact tile; the one confirmed X-ray in the tree.

### BL-02 — Behavioral test for combat info-event fog gating
- **From:** report 3 §4 (the combat info-event path has **zero** coverage) + report 4 Finding 1.
- **Scope:** new `tests/*.test.ts` — a pure/twin-worlds test that a `down`/`hit` event on a fogged tile produces **no** Wire row / ping / alert, mirroring the `fogLeak.test.ts:48-88` TWIN-WORLDS pattern (behavioral, not source-scan). If `recordInfoEvent` is refactored to a pure gating helper by BL-01, test that helper directly.
- **Size:** S. **Lane:** test. **Parallel-safe:** ⚠ new file, but must land with BL-01 (it asserts BL-01's fix). **Priority:** **P0**.

## P1 — dead weight & duplicate safety-rule

### BL-03 — Delete the dead A–D audio cluster + its four test files
- **From:** reports 1 §5, 2 §5, 3 Finding 1. `noXrayGate.ts`, `cueQueue.ts`, `sfxEventMapper.ts`, `atmosphereSpine.ts` have **zero live production importers** (they import only each other); each is exercised only by a green test (`audioNoXrayGate`, `audioCueQueue`, `audioSfxEventMapper`, `audioAtmosphereSpine`).
- **Scope:** delete 4 `src/scenes/audio/*.ts` + 4 `tests/*.test.ts`. Verify `atmosphereSpine`'s `cueMeta`/`AudioCueMeta`/`MvpCueKey` have no live consumer first (`sfxEventMapper.ts:36` is the only importer, itself dead). `audioSceneAdapter.test.ts` also imports `noXrayGate` — check it doesn't rely on it.
- **Size:** M. **Lane:** audio / dead-code. **Parallel-safe:** ✅ isolated; coordinate only with an open audio lane. **Priority:** P1 (removes a duplicate NO-X-RAY implementation that encodes *different* behavior from the live gate — a future double-wire hazard).

### BL-04 — Close the dead-gate duplicate of the NO-X-RAY rule
- **From:** report 2 §4/§5. `noXrayGate.cueSuppressReason/gateCues` reimplements the fog rule the live path already enforces via `shouldEmitFeedback` (`atmosphereCoordinator.ts:187`, `propEmitterPlanner.ts`).
- **Scope:** subsumed by BL-03 (deleting the module removes the duplicate). Listed separately so the *reason* (one safety rule, one implementation) is explicit if BL-03 is deferred. **Size:** S. **Lane:** no-xray. **Parallel-safe:** ✅. **Priority:** P1.

## P2 — structural risk & test hardening

### BL-05 — Explicit rulings/gates for the two latent leaks
- **From:** report 4, Findings 2 & 3. (a) `combat.ts:100-104` pushes a faction-named `unit-down` into `state.log` unconditionally (dormant — no reader today, but any future `state.log` surface leaks). (b) `drawMinimap` fills districts by `districtControlStatus` with no fog test (`IsoScene.ts:6195-6200,6538`) — deliberate per the minimap header, but an un-annotated divergence from `isVisibleTile`.
- **Scope:** `src/sim/combat.ts` (gate or annotate the log push), `src/scenes/IsoScene.ts` (annotate/ratify the district-fill ruling). Decision + small guard/comment.
- **Size:** S. **Lane:** no-xray. **Parallel-safe:** ❌ (combat.ts + IsoScene.ts). **Priority:** P2 (defense-in-depth; no live leak).

### BL-06 — Unify the ~17 fog closures behind one injected predicate
- **From:** report 2 §4 (visibility predicate rebuilt ~17× as parallel closures: `isVisibleTile`, `combatCtx().isVisible`, `isAudioFeedbackEligible`, `atmosphereDistrictAt`, plus `opPreview.IsVisible`). This diffusion is the *mechanism* behind BL-01's leak — a new surface simply forgot to adopt a closure.
- **Scope:** `src/scenes/IsoScene.ts` (thread one canonical `isVisibleTile` closure into every consumer). **Size:** M. **Lane:** IsoScene / no-xray. **Parallel-safe:** ❌ serialize on IsoScene. **Priority:** P2 (do after BL-01/BL-08 to reduce future leak surface).

### BL-07 — Replace the `fogLeak` source-scan with behavioral tests
- **From:** report 3 §2 Finding 4 + §3. The scene-wiring blocks (`fogLeak.test.ts:90-177`) `readFileSync` + regex source text — stale in both directions (green while code drifts; red on benign refactor) and blind to un-enumerated surfaces (it missed BL-01).
- **Scope:** `tests/fogLeak.test.ts` — convert the six source-scan assertions into twin-worlds behavioral checks (the `:48-88` half already shows the pattern) or scene-level harness tests. **Size:** M. **Lane:** test. **Parallel-safe:** ✅ test-only. **Priority:** P2.

### BL-08 — Decompose the `IsoScene.ts` god-class
- **From:** report 2 §2 (6701 LOC, 66 imports, ~486 private members, 7 responsibilities). It is the serialization bottleneck for nearly every lane and it hides ungated seams (BL-01 lived here).
- **Scope:** extract cohesive modules — input/commands, HUD draw, audio-bridge, war-drive orchestration, fog/visibility — out of `IsoScene.ts` behind thin Phaser-facing shims (mirror how `adapter.ts`/`dispatch.ts`/`orderRouting.ts` are already pure and testable). **Size:** L. **Lane:** IsoScene. **Parallel-safe:** ❌ — this IS the bottleneck; schedule it in its own window with no concurrent IsoScene lane. **Priority:** P2 (highest structural leverage; unblocks parallelism for everything else).

## P3 — cleanup & decisions

### BL-09 — Canon reconciliation: faction-on-body accent
- **From:** report 5, Finding 6 (⚠ DRIFT). `figureStyle.ts` is plate-only, but the live `rigDraw.ts` (`:141,143`) and `cityArt.ts` (`:157-158,294`) paint a brass/blood accent on hatband + pocket-square.
- **Scope:** a **decision** first — amend `CANON.md` to permit a small body accent (arguably the "silhouette reads faction" intent), or bring `rigDraw`/`cityArt` in line with `figureStyle`. Then a small render edit if the latter. **Size:** S (decision) → M (if code). **Lane:** canon / render. **Parallel-safe:** ⚠ decision-gated. **Priority:** P3.

### BL-10 — Wire or shelve the `federalCase*` subsystem
- **From:** report 3, Finding 2. `federalCaseMath/Readout/Constants` are pure, ~86-assertion-tested, and **unreferenced by the runtime by design** (`docs/federal-case/SPEC_GAPS.md`). Either a feature lane to wire it into `tick`/`realtime`, or an explicit "shelved" marker so the tests aren't mistaken for live coverage.
- **Scope:** `src/sim/federalCase*.ts`, `src/sim/tick.ts`/`realtime.ts` (if wiring). **Size:** L (feature). **Lane:** sim-core. **Parallel-safe:** ✅ until it touches `tick`. **Priority:** P3 (product decision, not debt).

### BL-11 — Long-function refactors
- **From:** report 2 §3. `updateUnits` (~363 lines, per-frame hot loop mixing render+fog+FX, `IsoScene.ts:1899`), `drawFedora` (~157, `cityArt.ts:159`), `applyExtort` (~140, `commands.ts:208`), and the >100-line `create`/`setupCameraControls`/`refreshHud`/`drawHud`.
- **Scope:** split by concern; `applyExtort`/`drawFedora` are parallel-safe (not IsoScene); the IsoScene methods serialize (ideally folded into BL-08). **Size:** M. **Lane:** mixed. **Parallel-safe:** ❌ for the IsoScene half. **Priority:** P3.

### BL-12 — Legacy-cruft sweep
- **From:** report 2 §1b/§4/§6. `BANKRUPT_FLOOR` vs `DEBT_CEILING` (`constants.ts:102`), legacy prop-catalog dual path (`propEmitterCatalog.ts:11-12,110-136`), two figure-key resolvers (`cityArt.ts:95` vs `:757`), legacy 5-district special-casing (across `city.ts`/`state.ts`/`strategy.ts`/`mapEconomy.ts`/`realtime.ts`), deferred log persistence (`logStore.ts:107`).
- **Scope:** per-item; most are sim-side and parallel-safe, a few touch IsoScene/scenes. **Size:** S→M. **Lane:** mixed. **Parallel-safe:** ⚠ mostly ✅. **Priority:** P3.

---

## Suggested dispatch order

1. **BL-01 + BL-02 together** (P0 leak + its test) — a single small IsoScene lane, land first.
2. **BL-03/BL-04** (dead audio) and **BL-07** (fogLeak behavioral tests) — parallel-safe, run alongside anything.
3. **BL-08** (IsoScene decomposition) — its own window; it unblocks BL-05/BL-06/BL-11 by breaking the bottleneck.
4. **BL-05/BL-06** — after BL-08, cheaper once IsoScene is modular.
5. **BL-09/BL-10** — product/canon decisions; queue behind an owner ruling.
6. **BL-11/BL-12** — opportunistic cleanup, fold IsoScene-touching parts into BL-08.
