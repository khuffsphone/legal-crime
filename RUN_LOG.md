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

## Phase 5 — Territory Control — GREEN  (2026-06-18)
- Summary: Added pure territory module `src/sim/territory.ts` (controlOf, districtHolder,
  holdsDistrict, districtsHeldBy/Count, topRivalControl) and the `expandControl` command:
  spends EXPAND_COST, adds EXPAND_BASE_GAIN + guarding-muscle control (capped at
  CONTROL_MAX), and contests the strongest rival by floor(gain·CONTEST_REDUCTION) without
  going below zero. A family holds a district when its control is the strict max and ≥
  CONTROL_HOLD (ties = contested = no holder).
- Files: src/sim/territory.ts, src/sim/commands.ts (expandControl; controlOf moved to
  territory), src/sim/constants.ts, src/sim/index.ts, tests/territory.test.ts,
  tests/extortion.test.ts (controlOf import moved).
- Decisions: Consolidated the duplicate controlOf into territory.ts as the single source.
  expandControl is fully deterministic (no RNG). Holding requires a strict maximum so a
  tie leaves a district contested.
- Gate: typecheck ✅  build ✅  test ✅ (84 total; +15 asserting holder/tie/threshold
  logic, held-district counting, exact gain with/without muscle, cap, rival contest math,
  zero-floor, denial, hold-after-expansion, and determinism).
- Commit: phase5: Territory Control — green

## Phase 6 — Heat, Bribery & Law — GREEN  (2026-06-18)
- Summary: Added pure law module `src/sim/law.ts` — raidBaseChance (linear from
  RAID_THRESHOLD to RAID_MAX_CHANCE at HEAT_MAX), bribeMitigation (1%/point, cap 90%),
  raidChance, bribeDecayBonus / effectiveDecay — and `resolveLaw` as tick step 7: rolls a
  seeded raid against each living family above threshold (bust at ≥ BUST_HEAT → player
  loses 'busted'; otherwise seize 30% cash or shut an operation + heat relief), then
  decays heat (base + bribe bonus). Added the `bribe` command (raises bribeLevel, a
  per-tick retainer; no upfront deduction; denied if cash < amount).
- Files: src/sim/law.ts, src/sim/tick.ts (step 7), src/sim/commands.ts (bribe),
  src/sim/constants.ts, src/sim/index.ts, tests/law.test.ts; updated two heat-per-tick
  assertions in tests/extortion.test.ts and tests/operations.test.ts to net out the
  newly-added decay.
- Decisions: Bribe is modeled as a standing retainer whose cost flows through the Phase 1
  economy each tick (no double-charge), and whose effect is BOTH reduced raid chance and
  faster heat decay — interpreting "reduces effective heat gain" as net decay so earlier
  per-step heat code is untouched. Decay's introduction legitimately changes per-tick heat
  totals, so the two earlier heat assertions were updated to subtract HEAT_DECAY (still
  asserting the exact gain, now net). resolveLaw draws RNG only above threshold, so
  low-heat ticks keep the cursor untouched and all prior determinism holds.
- Gate: typecheck ✅  build ✅  test ✅ (102 total; +18 asserting exact raid/mitigation/
  decay math, no-draw-below-threshold, bust path → player loss, both non-bust raid
  outcomes via seed-scan, exact 30% seizure, and bribe command behavior + per-tick cost).
- Commit: phase6: Heat, Bribery & Law — green

## Phase 7 — Rival AI — GREEN  (2026-06-18)
- Summary: Added pure AI module `src/sim/ai.ts`. `rivalCandidates` builds the affordable/
  valid action set with deterministic base scores (bribe = heat when heat>threshold;
  recruit = 60 − 15·roster; operation = 45 − 12·ownedOps for the most expensive affordable
  kind; expand = 30 (+10 if stronghold unheld)). `chooseRivalAction` adds a seeded jitter
  (≤8) and picks the max, or null if nothing is affordable. `resolveRivalAI` (tick step 5)
  runs each living rival's choice and applies it, sharing the single RNG cursor. Helpers
  strongholdDistrict and affordableOperation exported.
- Files: src/sim/ai.ts, src/sim/tick.ts (step 5), src/sim/index.ts, tests/ai.test.ts;
  updated one Phase 1 rival-income test to keep rival cash below the cheapest AI action so
  the income credit can be isolated now that rivals act each tick.
- Decisions: Rivals never extort (per the brief's listed action set: recruit / expand /
  establish / bribe). Base scores are a separate pure function from the jittered choice so
  scores are asserted exactly; constructed test scenarios keep the score gap above the
  jitter range for deterministic action selection. Each rival uses its own Rng snapshot of
  the shared cursor so the stream stays coherent through any command randomness.
- Gate: typecheck ✅  build ✅  test ✅ (116 total; +14 asserting exact base scores per
  situation, candidate availability gates, dominant-action selection, null on broke,
  real action application (roster/cash), RNG advance, determinism, dead-rival skip).
- Commit: phase7: Rival AI — green

## Phase 8 — Hits & Conflict — GREEN  (2026-06-18)
- Summary: Added the `orderHit` command (validates both families alive, no self-hit,
  attacker has muscle; queues a HitOrder on the new GameState.pendingHits) and pure
  conflict module `src/sim/conflict.ts`: `familyStrength` (sum of skill), `decideCasualties`
  (deterministic from the two effective strengths — attacker wins ties, loser loses 1 or 2
  in a rout, winner loses 1 in a close fight, clamped to roster), and `resolveConflict`
  (tick step 6) applying seeded variance (strength·[0.5,1.5)), removing the weakest
  gangsters first, adding HIT_HEAT to the attacker, and killing the boss of any family left
  with no muscle (player boss death → loss 'dead'). Queue cleared each resolution.
- Files: src/sim/conflict.ts, src/sim/commands.ts (orderHit), src/sim/tick.ts (step 6),
  src/sim/types.ts (HitOrder + pendingHits), src/sim/state.ts (pendingHits: []),
  src/sim/constants.ts, src/sim/index.ts, tests/conflict.test.ts.
- Decisions: Hits are queued (per design "pending hits" in tick step 6) and resolved at
  the next tick, so added pendingHits to GameState (additive — initialized [] so all prior
  deep-equal determinism tests still pass). Both sides can lose their boss; the boss of any
  family reduced to zero muscle after losing is killed. resolveConflict draws RNG only when
  hits are queued, preserving prior determinism.
- Gate: typecheck ✅  build ✅  test ✅ (131 total; +15 asserting exact strength/casualty
  math across win/rout/loss/close/clamp, order-hit validation, stronger-attacker-always-
  wins over 40 seeds → boss kill, weakest-first removal, player-death loss, queue clear,
  dead-target skip without RNG draw, and determinism).
- Commit: phase8: Hits & Conflict — green
