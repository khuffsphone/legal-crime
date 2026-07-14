# Brassmere — Codebase Audit & Tech-Debt Recon

Read-only audit of the Brassmere codebase, branch `claude/brassmere-audit-tech-debt-mxnv43`, based at
`rts/isometric-conversion` @ `7e3ddae`. **This directory is a report — DO NOT MERGE to gate anything;
it is recon that grounds future dispatches.** No source file was modified to produce it (`git diff`
shows only additions under `docs/audit/`).

Method: a parallel understand-workflow — one deep reader per report, every claim cross-checked against
source and cited `file:line`, with an adversarial verification pass on the NO-X-RAY and test-health
sections (where false confidence hides). The highest-value findings were re-verified by hand against
live source before inclusion.

Baseline at audit time (unchanged by this branch): **`tsc --noEmit` clean**, **`vitest run` → 160 files /
1821 tests green** (~23s).

## Reports

| # | Report | What it answers |
|---|---|---|
| 1 | [01-architecture.md](01-architecture.md) | The real module graph — sim/scenes split, IsoScene render path, the wrapped tick/command boundary, audio, beatCops, combat verbs |
| 2 | [02-tech-debt.md](02-tech-debt.md) | Debt markers, god-files, long functions, duplication, dead code — ranked by risk |
| 3 | [03-test-health.md](03-test-health.md) | Test totals, **toothless tests**, red/skipped, source-scan staleness, coverage gaps on load-bearing paths |
| 4 | [04-noxray.md](04-noxray.md) | The visibility-predicate registry vs every state-surfacing path — **the highest-value section** (found one critical latent leak) |
| 5 | [05-canon.md](05-canon.md) | Locked constants/rules vs source — orthoScale, tile, FIGURE_PX, anchor, sim purity, faction-color, fixed HUD camera |
| 6 | [06-backlog.md](06-backlog.md) | Prioritized, dispatch-ready fix list synthesized from 1–5 — the next-iterations menu |

## Headline findings

- **P0 — latent X-ray leak (verified):** combat info-events (`recordInfoEvent`, `IsoScene.ts:3551`) are
  logged/pinged/alerted **unconditionally**, bypassing the fog gate the flash/SFX use one line later
  (`:3558`). Rival-vs-rival combat in the fog leaks its exact tile through the Wire log + minimap ping +
  edge arrow. Untested by `fogLeak.test.ts`. See report 4, Finding 1.
- **God-file:** `IsoScene.ts` at 6701 LOC concentrates render + input + camera + HUD + audio-bridge +
  war-drive in one class — a merge-conflict/serialization bottleneck for nearly every lane. See report 2.
- **Dead-but-tested:** the A–D-era audio cluster (`noXrayGate`, `cueQueue`, `sfxEventMapper`,
  `atmosphereSpine`) has zero live importers yet carries ~4 green test files. See reports 1–3.
- **Bench code under test:** the `federalCase*` subsystem (~86 assertions) is pure, well-tested, and
  **unwired at runtime by design** (`docs/federal-case/SPEC_GAPS.md`). See report 3.
- **Canon drift:** faction accent is painted on the figure body (hatband/pocket-square) in the live
  `rigDraw.ts`/`cityArt.ts` renderers, not plate-only. See report 5, Finding 6.
