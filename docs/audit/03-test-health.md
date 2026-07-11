# Report 3 — Test-Health Report

Codebase: Brassmere @ `7e3ddae`. Read-only audit. Every claim carries a `file:line` citation. Two-pass: findings below survived an adversarial "would a gutting of the covered code still pass this?" re-check (see Verification notes).

## 1. Totals

| Metric | Source | Value |
|---|---|---|
| Test files | `ls tests/*.test.ts \| wc -l` | **160** |
| `it`/`test` cases (grep estimate) | `grep -rhcE '^[[:space:]]*(it\|test)\(' tests/*.test.ts \| paste -sd+ \| bc` | 1812 |
| **`it`/`test` cases (authoritative — live run)** | `npx vitest run` at audit time | **1821 passed (160 files)** |

The grep undercounts by 9 (it misses `it`/`test` calls that wrap across lines or use `it.each`). The
authoritative figure from the actual green run is **1821 tests / 160 files, 0 failed, 0 skipped** (~23s).

## 2. Toothless / misdirected tests (ranked by severity)

| # | Test | Sev | Category | Mutation that survives it |
|---|---|---|---|---|
| 1 | `tests/audioNoXrayGate.test.ts:6,17-76` | **HIGH** | dead-code target | The covered module `src/scenes/audio/noXrayGate.ts` is imported by **no live production code** (only tests). Deleting `noXrayGate.ts` entirely leaves runtime byte-identical — the shipping game gates audio via `shouldEmitFeedback` directly (`src/scenes/audio/atmosphereCoordinator.ts:187`, `src/scenes/audio/propEmitterPlanner.ts:16`), never via `gateCues`/`cueAllowed`. The test's ~60 assertions of the audio NO-X-RAY law prove a parallel abstraction the build never runs. It even encodes the *wrong* behavior: it asserts full **suppression** of a hidden cue (`:19-21`), whereas the live coordinator **downgrades** to non-positional playback (`tests/audioAtmosphereCoordinator.test.ts:99`). Companion dead-target suites: `tests/audioCueQueue.test.ts`, `tests/audioSfxEventMapper.test.ts`, `tests/audioAtmosphereSpine.test.ts` (report 2 §5). |
| 2 | `tests/federalCase.test.ts` (whole file, ~86 assertions) | **HIGH** | unwired subsystem | `src/sim/federalCaseMath.ts` / `federalCaseReadout.ts` / `federalCaseConstants.ts` are consumed **only** by `src/sim/index.ts:719-731` (re-export), never by `tick`/`realtime`/`commands`/`federal.ts`. This is confirmed **and documented as intentional**: `docs/federal-case/SPEC_GAPS.md` — "All pure, Phaser-free, **unreferenced by the runtime** (existing outcomes bit-identical)." Gutting every case-math function to `return 0` breaks these tests but changes **zero live behavior** — the shipping federal ladder is `src/sim/federal.ts` (covered separately by `federal.test.ts`). Not negligent dead code: spec-ahead scaffolding whose tests lock the math for a future wiring lane. But today ~86 assertions cover code the game never runs. |
| 3 | `tests/federalCase.test.ts:266-284` | **MED** | (b) frozen-copy tautology | R3 "no collision with IncidentType" hand-copies the 22 enum values into a literal `INCIDENT_TYPES` array, then asserts case-vocab isn't in *that array*. `IncidentType` is a TS type (`src/sim/ledger.ts:14-36`) so it can't be imported at runtime — but the guard is self-referential: adding a 23rd `IncidentType` that collides with case vocab stays **green**. `:271` `toHaveLength(22)` pins the count of its own copy, not the real enum. |
| 4 | `tests/fogLeak.test.ts:90-177` | **MED** | (e) source-scan | The SCENE-WIRING + FRONT-INFO blocks `readFileSync('IsoScene.ts')` (`:91,:140`) and `.toMatch`/`.toContain` the source **text**. Green iff a string literal is present, decoupled from runtime. Any of the wiring assertions passes on a build where the string exists but the surrounding logic is dead — **and, critically, the scan only enumerates the *cursor* channels; it does not cover the combat-log leak that report 4 Finding 1 found**. See §3 for the exact staleness math. |
| 5 | `tests/quickloadRestartTeardown.test.ts:74-130` | **MED** | (e) source-scan | Layer 3 asserts literal substrings (`this.units = []`, `this.${n} = undefined`) exist in the `resetRestartCaches`/`create` method bodies. A refactor to `this.units.length = 0` or a rename keeps restart **correct** yet fails; conversely a cache that is reset textually but never actually driven passes. Behavior is only truly exercised by the single corpse unit-test (`:67-72`) and the real save round-trip (`:54-64`). |
| 6 | `tests/combatTuning.test.ts:15-17` | **LOW** | (a) constant-echo | `expect(meleeDamage(plain(),plain())).toBe(COMBAT_MELEE_DAMAGE)` etc. assert the no-modifier path returns the base constant. Weak (function echoes its own default), but the hard-cap tests in the same file are strong, so not headline. |

### Strong tests (credited, NOT toothless — verified they have teeth)

- `tests/combatResolve.test.ts:58-82` FIDELITY byte-compares the headless resolver against hand-stepping the **production** `resolveProximityCombat` (not a re-implementation) — gutting the resolver's routing fails it. Purity/RNG-isolation (`:85-115,:272-299`) real. `resolveEngagement` **is** wired live (`src/sim/copBehaviorEngage.ts`).
- `tests/saveLoadRoundTrip.test.ts:88-116` byte-identical reload **and** identical next-tick on both copies — a real determinism proof, not a shape check.
- `tests/saveFog.test.ts:34-56` and `tests/extortFog.test.ts:31-72` are genuine mutation-collapse tests (fogged target deep-equals nonexistent target; RNG cursor untouched).
- `tests/fogLeak.test.ts:48-88` — the TWIN-WORLDS pure half, incl. the `pickUnit` MUTATION WITNESS (`:74-78`) — is the part with real teeth.
- `tests/restartGate.test.ts` and `tests/federal.test.ts:100-202` (bust-gate over 80 seeds, ladder reachability) are behavioral.

## 3. Red / skipped + the fogLeak / queue_004 investigation

**Skipped/only:** `grep -rnE '\.skip|\.todo|xit\(|xdescribe|\.only' tests/` returns **no test modifiers** — the three hits (`tests/tutorialFtue.test.ts:88`, `tests/audioAtmosphereCoordinator.test.ts:206,215`) are `.skipped` **data properties** inside assertions, not `it.skip`. **Zero red/skipped tests** (confirmed by the live run: 1821 passed, 0 skipped).

**queue_004:** not present anywhere — `grep -rn 'queue_004'` over the repo, `*.md`, `*.ts`, and `RUN_LOG.md` all return nothing. It is **not a live test failure or a real symbol** in this tree; treat any external reference to it as stale/out-of-band. The fog work it likely alludes to is logged at `RUN_LOG.md:2987` ("Lane fog-leak-fix — NO-X-RAY cursor repair — GREEN, 2026-07-04"), tied to CC report #67 (`tests/fogLeak.test.ts:3`), which shipped `tests/fogLeak.test.ts` + `tests/selection.test.ts` (`RUN_LOG.md:3020`). **Conclusion: `fogLeak` is a stale-prone source-scan, not a live leak — but note the scan is also *incomplete* (report 4 Finding 1 is a real leak the scan does not cover).**

**fogLeak is a source-scan (confirmed).** Block 2 (`:90-133`) and block 3 (`:135-178`) `readFileSync('src/scenes/IsoScene.ts')` (`:91,:140`) and regex the source **text** — coupled to source TEXT, decoupled from live runtime. Exact regexes and verdicts:

1. `:99-101` `/private isVisibleTile\(pos: \{ gx: number; gy: number \}\): boolean \{\s*\n\s*return this\.debugRevealAll \|\| isRevealed\(this\.fog, …\);/` — verifies a **string shape**, not behavior. Currently green (marker exists at `src/scenes/IsoScene.ts:2950`). Reformatting the method body (line break, param rename) reds it though the predicate is correct.
2. `:131` `.not.toMatch(/this\.combatEnabled \? \w+\.filter\(\(u\) => (this\.combatCtx\(\)\.isVisible|isVis)\(u\.pos\)\)/)` — a NEGATIVE text guard. Green as long as that *exact* leak spelling is absent; a semantically identical leak written differently passes clean.
3. `:113` `from('private commandSelect(', 2800).toContain('pickVisibleUnit(foeCandidates, point, (pos) => this.isVisibleTile(pos))')` — asserts a literal call **substring**. If `commandSelect` kept the call but the picked unit were later re-read ungated, this still passes.

**Staleness risk (both directions):** (a) **Green while code drifts** — because these assert only that a literal exists, real runtime behavior can regress (someone bypasses `isVisibleTile` at a *new* surface not enumerated here — exactly what happened at the combat-log path, report 4 Finding 1) and the suite stays green; the source-scan freezes the *known* channels, not the invariant. (b) **Red on a benign refactor** — a rename (`isVisibleTile`→`tileVisible`), a Prettier reflow, or a `slice` window drift (`from('private hoverText(', 900)`, `:109`) breaks a green build with no behavior change. The pure TWIN-WORLDS half (`:48-88`) is the part with real teeth; the source-scan half is decorative coupling.

## 4. Coverage gaps on load-bearing paths

| Seam | Covered (cite) | NOT covered / risk |
|---|---|---|
| **Save/load restart lifecycle** | Byte-identical + deterministic-continue round-trip `saveLoadRoundTrip.test.ts:88-116`; additive state (federal/extortion/bodies/rng) `:37-52`; version/corruption refusal `:69-86`; real F9 quickLoad entry `quickloadRestartTeardown.test.ts:54-64`; one destroyed-sprite corpse throws `:67-72`. | The actual `scene.restart()` Phaser redraw is **never executed** (can't run under node) — everything past the corpse unit-test is source-scan (`:74-130`). No behavioral proof that a real cache actually gets nulled and re-driven safely; a cache reset textually present but functionally wrong ships green. |
| **NO-X-RAY (audio)** | The SHIPPING gate **is** behaviorally covered: coordinator downgrade `audioAtmosphereCoordinator.test.ts:99-109`, emitter gating truth-table `audioPropEmitters.test.ts:94-102`. | The behavioral module `audioNoXrayGate.test.ts` exercises `noXrayGate.ts`, which is **dead code** (Finding #1) — so the "audio no-x-ray is well-tested" signal is split across the wrong module. No test asserts the two implementations agree (suppress vs downgrade divergence unguarded). |
| **NO-X-RAY (cursor/front)** | Pure pick collapse `fogLeak.test.ts:48-88`; extort both paths `extortFog.test.ts`; save-fog `saveFog.test.ts`. Minimap-blip fog exclusion **is** covered `infoFeedback.test.ts:126`. | Scene-level cursor wiring proven only by source-scan (§3). **Combat info-event fog gating is NOT covered at all** — the leak in report 4 Finding 1 (`recordInfoEvent` at combat beats) has no test, behavioral or source-scan. Event-feed/Wire-log fog gating: only a partial single case `intel.test.ts:143` — no dedicated behavioral suite for log/feed leakage. |
| **Combat resolution** | Fidelity-vs-production, purity, caps, outcomes, RNG isolation `combatResolve.test.ts` (full); health/engagement `combat.test.ts`; caps `combatTuning.test.ts`. | Strong. Gap: the `?autoresolve=1` path is wired via `copBehaviorEngage.ts` but only the URL-parse gate is unit-tested (`combatResolve.test.ts:47-56`); no integration test that the cop-engage flow actually invokes the resolver in a live tick. |
| **Heat / federal** | Live ladder: exposure math, tier crossings, arm-delay telegraph, 80-seed bust gate, ladder reachability `federal.test.ts:26-202`; determinism `:205-216`. | The heavily-tested `federalCase*` case-building layer is **not wired** (Finding #2), so ~86 assertions cover heat math that never runs. The live `federal.ts` ladder is well-covered; the aspirational case system is all bench, no game. |

## Verification notes

- **Overturned my first-pass "audio no-x-ray seam is untested behaviorally."** Re-checking found `audioAtmosphereCoordinator.test.ts:99-109` and `audioPropEmitters.test.ts:94-102` **do** cover the shipping `shouldEmitFeedback` gate. Corrected: the seam is covered; the problem is that `noXrayGate.ts` + its test are a redundant **dead-code** parallel (Finding #1) that even encodes different behavior (suppress vs downgrade).
- **Confirmed Finding #1 by re-grep:** `grep -rn noXrayGate src/` yields only the module's own header — zero live importers. Not a guess.
- **Overturned a draft "combatResolve FIDELITY is a self-comparison tautology."** Reopened `:58-82`: it steps the *unmodified production* `resolveProximityCombat` on twin clones and compares — genuine cross-check, has teeth. Kept out of the toothless table.
- **Added Finding #3** on second pass after reading `ledger.ts:14-36`: the R3 collision guard compares against a hand-frozen 22-value literal, not the enum — a real drift blind spot.
- **Strengthened Finding #2** with the documented-intent citation `docs/federal-case/SPEC_GAPS.md` ("unreferenced by the runtime") — the unwired state is a deliberate spec-ahead decision, not accidental.
- **Cross-linked the coverage gap to report 4's live leak:** the combat info-event path (`recordInfoEvent` at combat beats) is a real fog leak with **zero** test coverage — the biggest single coverage hole on the NO-X-RAY seam.
- **queue_004:** re-ran the search across code + `RUN_LOG.md` + `docs/`; genuinely absent. Reported as not-a-live-failure rather than inventing a cause.
