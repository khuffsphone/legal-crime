# Legal Crime — Run Log

> Append-only. Each phase that passes its gate appends a Completion Receipt. Never
> rewrite or delete prior receipts.

## Bootstrap (2026-06-18)
- Repo arrived EMPTY (no commits, no design/plan/log). Per resume rules, an empty log
  means start at Phase 0.
- Authored `LEGAL_CRIME_DESIGN.md` and `LEGAL_CRIME_PLAN.md` from the canonical phase
  list in the build brief (phases 0–10 verbatim) and the named mechanics. Chose concrete
  constant values (recorded in DESIGN §6) since the brief named mechanics but not numbers.
- Initialized this run log. Beginning Phase 0.

---

## Phase 0 — Scaffold & Harness — GREEN  (2026-06-18)
- Summary: Vite + TypeScript + Phaser + Vitest project scaffolded with the mandated
  `/src/sim` (pure) vs `/src/scenes` (Phaser render) split. Implemented deterministic
  mulberry32 RNG with a serializable uint32 cursor (`Rng` wrapper), the `GameState` data
  model, canonical constants, and `createInitialState(seed)` building a 5-district city
  with fronts and a player + 2 rival families. Placeholder `BootScene` renders state.
- Files: package.json, tsconfig.json, vite.config.ts, index.html, .gitignore,
  src/sim/{rng,types,constants,state,index}.ts, src/scenes/BootScene.ts, src/main.ts,
  tests/{rng,state}.test.ts.
- Decisions: Repo arrived empty so authored DESIGN + PLAN + RUN_LOG first (recorded in
  Bootstrap entry). Installed majors differ slightly from the brief but stay within
  range — recorded as-is, not upgraded: phaser 3.90.0 (brief ^3.80), vite 5.4.21,
  vitest 2.1.9, typescript 5.9.3 (brief ^5.4). Build emits a >500kB chunk warning
  (Phaser bundle); benign, left as-is. Worked around a tooling glitch that appended a
  stray `</content>` tag to written files by stripping it post-write.
- Gate: typecheck ✅  build ✅  test ✅ (16 tests; assert RNG determinism/resume/bounds
  and real initial-state values: district counts, control footholds, deep-equality).
- Commit: phase0: Scaffold & Harness — green

## Phase 1 — Economy & Tick Engine — GREEN  (2026-06-18)
- Summary: Added the economy layer (`src/sim/economy.ts`) — extortion income (floored
  EXTORT_RATE of front base income), operation income, gangster+bribe expenses, and net
  cash flow helpers — and the deterministic tick engine (`src/sim/tick.ts`) resolving
  per-family economy then advancing the clock, per the fixed tick order (DESIGN §5).
  Exposed via `src/sim/index.ts`.
- Files: src/sim/economy.ts, src/sim/tick.ts, src/sim/index.ts, tests/economy.test.ts,
  tests/tick.test.ts.
- Decisions: Income sources (extorted fronts, owned operations) and gangsters are read
  from state directly so the economy is testable before the extort/establish/recruit
  commands exist (Phases 2–4). bribeLevel doubles as a per-tick retainer cost. Economy
  events are only logged when net != 0 to keep the log lean.
- Gate: typecheck ✅  build ✅  test ✅ (34 tests total; +18 this phase asserting exact
  cash deltas, floored extortion, multi-tick accumulation, per-family isolation, and
  deep-equal determinism across two runs).
- Commit: phase1: Economy & Tick Engine — green

## Phase 2 — Extortion — GREEN  (2026-06-18)
- Summary: Introduced the command system (`src/sim/commands.ts`) with the deterministic
  `applyCommand`/`applyCommands` entry point and the `extort` command. Extortion is gated
  by EXTORT_MIN_CONTROL, rolls success via the seeded RNG (chance = control/100 + 0.04·
  muscle, clamped), sets `extortedBy` on success, and adds one-off heat either way. The
  tick engine now applies per-tick extortion heat (step 3). Helpers: findBusiness,
  controlOf, muscleInDistrict, extortSuccessChance.
- Files: src/sim/commands.ts, src/sim/tick.ts (extortion heat), src/sim/index.ts,
  tsconfig.json (lib ES2022 for Array.at), tests/extortion.test.ts.
- Decisions: Success probability is a pure helper so it can be asserted exactly; the
  control gate is checked before any RNG draw so a blocked attempt leaves the cursor
  untouched (verified by test). Failure adds the same one-off heat as success. Per-tick
  extortion income reuses Phase 1 economy; per-tick heat added in tick step 3.
- Gate: typecheck ✅  build ✅  test ✅ (45 total; +11 asserting exact success chances,
  blocked-without-RNG-draw, guaranteed success at full control, seed-scan success/failure
  split, determinism, and per-tick income+heat).
- Commit: phase2: Extortion — green

## Phase 3 — Illegal Businesses — GREEN  (2026-06-18)
- Summary: Added the `establishOperation` command — spends OPERATION_COST[kind], creates
  an illegal operation Business owned by the family in a district, with kind-specific
  income (OPERATION_INCOME) and base heat (OPERATION_HEAT). The tick engine now applies
  per-tick operation heat (step 2) via `operationHeat`, amplified by district police
  presence as base·(1+presence/100) rounded. Income flows through the Phase 1 economy.
- Files: src/sim/commands.ts (command + exhaustiveness fix), src/sim/economy.ts
  (operationHeat), src/sim/tick.ts (operation-heat step), src/sim/index.ts,
  tests/operations.test.ts.
- Decisions: Establishing requires only sufficient cash (no control gate — design §4.3
  specifies none); operations get deterministic ids from district+family+kind+count so
  no RNG is consumed (determinism preserved). Police-presence amplification is computed
  dynamically in the tick rather than baked at creation, so presence changes take effect.
- Gate: typecheck ✅  build ✅  test ✅ (54 total; +9 asserting exact cost deduction,
  denial on insufficient cash, unique ids, per-tick income, presence-amplified heat with
  concrete numbers, and determinism).
- Commit: phase3: Illegal Businesses — green

## Phase 4 — Gangster Management — GREEN  (2026-06-18)
- Summary: Added `recruitGangster` (spends RECRUIT_COST, rolls seeded skill 1–10 /
  loyalty 40–80 / name, upkeep = skill·10) and `assignGangster` (idle/guard/operation
  with target validation). New pure module `src/sim/gangsters.ts` provides `loyaltyDelta`
  (paid/unpaid base minus floor(heat/20)), `desertionChance` (linear to MAX_DESERT_CHANCE
  below threshold), and `resolveLoyalty` — now wired as tick step 4 (drift then seeded
  desertion roll for at-risk gangsters). Added `findGangster` to types.
- Files: src/sim/gangsters.ts, src/sim/commands.ts, src/sim/tick.ts, src/sim/types.ts,
  src/sim/constants.ts, src/sim/index.ts, tests/gangsters.test.ts.
- Decisions: Recruit draws RNG in fixed order (skill, loyalty, name) for determinism.
  resolveLoyalty only draws RNG for gangsters below the desertion threshold, so ticks
  with no at-risk gangsters leave the cursor untouched and prior determinism holds.
- Gate: typecheck ✅  build ✅  test ✅ (69 total; +15 asserting exact cost/upkeep, stat
  bounds, recruit determinism, assignment validation, exact loyalty deltas & chances,
  desertion seed-scan split, and loyal-gangster persistence over 30 ticks).
- Commit: phase4: Gangster Management — green
