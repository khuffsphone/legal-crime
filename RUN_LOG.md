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

## Phase 9 — Win/Loss & Game Flow — GREEN  (2026-06-18)
- Summary: Added pure flow module `src/sim/flow.ts`: `resolveWinLoss` (tick step 8) checks
  loss before win — bankruptcy below BANKRUPT_FLOOR, player boss dead → 'dead', preserving
  an already-decided 'busted'/'dead' loss — then wins if every rival is eliminated AND the
  player holds ≥ ceil(districts·WIN_DISTRICTS) districts. `endTurn(state, commands)` applies
  the turn's commands then ticks, and is a no-op once the game is over. tick now guards at
  entry (a decided game does not advance) and runs resolveWinLoss as step 8. Helpers
  districtsNeededToWin, allRivalsEliminated, isGameOver exported.
- Files: src/sim/flow.ts, src/sim/tick.ts (entry guard + step 8), src/sim/index.ts,
  tests/flow.test.ts.
- Decisions: flow.ts ↔ tick.ts form a benign function-level circular import (both bindings
  used only at call time); build/typecheck confirm it resolves. Bankruptcy is strict (<
  floor, not ≤). A decided game freezes: tick returns early so tick count and state stay
  final — prior determinism/economy tests are unaffected because fresh worlds never reach a
  terminal state within their tick budgets.
- Gate: typecheck ✅  build ✅  test ✅ (147 total; +16 asserting win threshold math,
  each loss path (bankrupt strict boundary, dead, busted-preserved), win gating on rivals
  and district count, endTurn apply-then-tick and game-over no-op, tick-integrated win and
  bankruptcy, frozen-after-decision, and endTurn determinism).
- Commit: phase9: Win/Loss & Game Flow — green

## Phase 10 — Integration Scene — GREEN  (2026-06-18)
- Summary: Added a pure, scene-agnostic adapter (`src/scenes/adapter.ts`, no Phaser) with
  selectors (playerView, districtViews, rivalViews, statusView, statusBanner) building a
  display view model from sim state, plus dispatch/advanceTurn/newGame wrappers over the
  sim. Rewrote `src/scenes/BootScene.ts` to render entirely from the adapter's view model
  and dispatch commands on input (SPACE = end week, E = extort home district), re-rendering
  from fresh state — no game rules in the scene. The Vite build includes the scene.
- Files: src/scenes/adapter.ts, src/scenes/BootScene.ts, tests/adapter.test.ts,
  tsconfig.json (+node types), package.json (+@types/node dev dep).
- Decisions: The adapter lives under /src/scenes but imports only the sim public surface,
  so it is unit-tested in node. The "/src/sim is Phaser-free" architecture invariant is now
  an enforced test that scans every sim file for a real phaser import (ignoring the word in
  comments). Holder/operation/strength values are derived in selectors and asserted exactly.
- Gate: typecheck ✅  build ✅  test ✅ (156 total; +9 asserting exact view-model values
  (player stats, holder name resolution, op vs front counts, rival strength/alive, status
  banners), dispatch-without-tick, advanceTurn apply-then-tick, a reproducible mini-game
  through the adapter, and the enforced sim-Phaser-free invariant).
- Commit: phase10: Integration Scene — green

## FINAL SUMMARY — BUILD COMPLETE (2026-06-18)
- All 11 phases (0–10) completed GREEN, in order, each behind the full gate
  (typecheck + build + test). Final suite: 156 tests across 13 files, all green.
- Architecture held throughout: /src/sim is pure and Phaser-free (now enforced by test);
  /src/scenes renders via a pure adapter. The simulation is seeded-RNG deterministic —
  every stochastic system (extortion, recruitment/desertion, raids, rival AI, conflict)
  draws from a single serializable cursor, and determinism is asserted per phase.
- Tick engine resolves systems in the fixed documented order: economy → operation heat →
  extortion heat → loyalty/desertion → rival AI → conflict → law/raids → win/loss → clock.
- Stack as installed (within the brief's majors; recorded, not upgraded): phaser 3.90.0,
  vite 5.4.21, vitest 2.1.9, typescript 5.9.3; added @types/node for a node-fs invariant
  test in Phase 10.
- No blockers encountered. Worked around a tooling glitch that appended a stray
  `</content>` tag to written files by stripping it post-write each phase.

---

## ENHANCEMENT RUN BOOTSTRAP (2026-06-18)
- Resuming after Phases 0–10 (156 tests green, building). Baseline gate re-confirmed
  green before starting: typecheck ✅ build ✅ test ✅ (156).
- CANON.md and ENHANCEMENT_PLAN.md did not exist in the repo (same situation as the
  missing design/plan docs at the 0–10 bootstrap). Per "make the reasonable call and
  record it", authored both as the canonical artifacts: CANON.md defines the locked
  "Fedora Noir" direction + the five signature mechanics (S1 Dual Economy, S2 Collector
  Units, S3 Bribery Sliders, S4 Business Tiers, S5 Mutiny & Auto-Loan) and Systemic
  Shocks; ENHANCEMENT_PLAN.md fixes the strictly-ordered Phase 11–17 sequence + gates,
  matching the brief's priority order verbatim.
- The Ultracode "Workflow" tool is not available in this environment (ToolSearch found no
  match); applying its quality bar manually (exhaustive, correct, methodical).
- Beginning Phase 11 — Dual Economy.

---

## Phase 11 — Dual Economy (S1) — GREEN  (2026-06-18)
- Summary: Added the clean/dirty cash ledger. New `dirtyCash` field on Family (invariant
  0 ≤ dirtyCash ≤ cash; clean = cash − dirtyCash). New pure module `src/sim/laundering.ts`:
  cleanCash, clampDirty, creditCrimeIncome, heatFromDirty (floor(dirty/1000), cap 15),
  launderFee (15%), launderCapacity (#extorted-fronts × 200). Tick now classes crime income
  as dirty inline, adds a "dirty hoard heat" sub-step (step 3.5), and normalizes the ledger
  at end-of-tick (after raids may have cut cash). New `launder` command converts dirty→clean
  through extorted fronts, capped by capacity & dirty, paying the fee from cash. Adapter
  exposes cleanCash/dirtyCash/launderCapacity (player) and dirtyCash (rivals).
- Files: src/sim/laundering.ts (new), src/sim/types.ts (dirtyCash), src/sim/state.ts
  (init 0), src/sim/constants.ts (S1 constants), src/sim/tick.ts (dirty credit + dirty-heat
  step + end-of-tick clamp), src/sim/commands.ts (launder), src/sim/index.ts, adapter.ts,
  tests/dualEconomy.test.ts.
- Decisions: Chose an ADDITIVE model — `cash` stays the spendable total, `dirtyCash` tracks
  the illicit portion (≤ cash) — so all 156 prior cash assertions pass unchanged (verified:
  zero regressions). The in-phase teeth is dirty-hoard heat (divisor 1000 so only large
  hoards radiate heat; short existing tests stay under it) + the laundering fee; the bigger
  payoff (Federal Audit seizing dirty cash) lands in Phase 16 per CANON. Laundering capacity
  is tied to extorted fronts (canon synergy: you launder THROUGH your legit fronts). Rival
  AI does not yet launder (deferred; accruing dirty-heat is an acceptable balancing pressure)
  — noted for a later AI pass. creditCrimeIncome is a pure helper (tested directly) that
  Phase 12 collection will reuse, minimizing future churn.
- Gate: typecheck ✅  build ✅  test ✅ (172 total; +16 asserting ledger invariant, exact
  cleanCash/heatFromDirty/launderFee/launderCapacity math, launder conversion+cap+fee+denial
  with exact clean-cash deltas, dirty income classification, dirty-hoard heat in tick,
  clean-spent-first clamp, and determinism). Phaser-free invariant test green.
- Commit: phase11: Dual Economy — green

## Phase 12 — Collector Units (S2, THE signature mechanic) — GREEN  (2026-06-18)
- Summary: Income no longer auto-credits families — it accrues at each earning business as
  `uncollected` takings (new optional Business field; tick step 1a `accrueUncollected`),
  and must be physically gathered by a Collector run. New pure module `src/sim/collection.ts`:
  businessAccrual/businessEarner (in economy.ts), accrueUncollected, collectibleBusinesses,
  pendingCollection, totalUncollected, collectionSafety (deterministic: 1 − presence·0.004 −
  heat·0.003 + muscle·0.05, clamped [0.1,1]) and collectionFraction (safety·(1 − roll·0.3)).
  New `collect{familyId,districtId}` command: gathers the family's pending takings there,
  applies one seeded skim roll, banks the take as DIRTY cash (creditCrimeIncome, reused from
  Phase 11), sweeps the piles (uncollected lost beyond the take), and adds COLLECT_HEAT. The
  tick economy is now expenses-only (`resolveFamilyExpenses`). Rival AI gained a high-priority
  `collect` candidate (only when a pile is pending) so rivals fund themselves under the new
  model. Adapter exposes per-district `playerUncollected` and total `uncollected`.
- Files: src/sim/collection.ts (new), src/sim/economy.ts (businessAccrual/Earner), types.ts
  (uncollected?), state.ts + commands.ts establishOperation (init 0), src/sim/tick.ts
  (accrual step + expenses-only economy), src/sim/commands.ts (collect), src/sim/ai.ts
  (collect candidate), index.ts, adapter.ts; updated income-timing assertions in
  tests/{tick,extortion,operations,dualEconomy}.test.ts; new tests/collectors.test.ts.
- Decisions: This is THE signature mechanic, so income realization legitimately changes from
  passive to active collection — the 7 earlier per-tick cash/dirty assertions were updated
  (documented here and in-test) to assert accrual-at-business + cash-on-collection; all other
  151 prior assertions untouched and green. `uncollected` is OPTIONAL (absent⇒0) so existing
  Business literals in tests didn't need editing. Risk model is split into a pure,
  exactly-testable deterministic safety fraction plus one seeded skim roll (so an exact
  collected amount is asserted by mirroring the single RNG draw). The skimmed/lost remainder
  is gone (no second chance) — that is the teeth. Rivals collect via AI (collect candidate
  gated on pending>0, so fresh-state ai.test behavior is unchanged — verified).
- Gate: typecheck ✅  build ✅  test ✅ (186 total; +14 collectors asserting accrual math,
  pending/total sums, exact collectionSafety/Fraction, exact collected take at safety 1 via
  RNG mirror, presence/heat slashing the take, muscle monotonicity, own-businesses-only
  sweep, empty no-op, determinism, and rival AI collection). Phaser-free invariant green.
- Commit: phase12: Collector Units — green

## Phase 13 — Bribery Sliders (S3) — GREEN  (2026-06-18)
- Summary: Split the single bribe into a `bribes` channel allocation (police/judges/
  politicians/feds) on Family, with `bribeLevel` kept in sync as the total retainer cost.
  New pure module `src/sim/bribery.ts`: BRIBE_CHANNELS, sumBribes, recomputeBribeLevel,
  bustAvoidChance (judges·0.01, cap 0.8). New `setBribe{channel,amount}` command (absolute
  slider; lowering is free, raising requires cash to sustain the new total; negatives
  rejected). Legacy `bribe` command now raises the Police channel. Channel effects in law:
  police drives raid mitigation (raidChance now fed bribes.police), politicians drive heat
  decay (effectiveDecay fed bribes.politicians), and judges give a seeded chance to spring
  the boss from a bust (downgrading it to a seizure, logged 'raid-averted'). Feds are stored
  as a Phase-16 shock-shield hook. Adapter exposes the bribes map.
- Files: src/sim/bribery.ts (new), types.ts (BribeChannel + bribes map), state.ts (init),
  constants.ts (judges constants; renamed bribe-effect comments), commands.ts (setBribe +
  bribe→police), law.ts (per-channel reads + judges bust mitigation), index.ts, adapter.ts;
  updated 2 law.test cases that drove decay/raid via the flat bribeLevel to use the new
  channels; new tests/bribery.test.ts.
- Decisions: `bribeLevel` retained as the authoritative total cost so economy.familyExpenses
  and its test pass unchanged (no double-charge; channels are cosmetic to cost, functional
  to effect). The pure law helpers (raidChance/effectiveDecay/bribeMitigation/bribeDecayBonus)
  are UNCHANGED — they still take a number — so all law.test helper assertions stay green;
  only which channel feeds them changed in resolveLaw, requiring the 2 documented test
  updates. Judges' bust-avoidance roll is drawn ONLY when judges>0, preserving the existing
  bust-test RNG stream (judges=0 there) and all prior determinism.
- Gate: typecheck ✅  build ✅  test ✅ (197 total; +11 asserting sum/sync, exact
  bustAvoidChance, slider set/lower/deny/negative, bribe→police mapping, politicians decay,
  total-charged-each-tick, judges seed-scan (averted>0, busts reduced vs none), determinism).
  Phaser-free invariant green.
- Commit: phase13: Bribery Sliders — green

## Phase 14 — Illegal Business Tiers (S4) — GREEN  (2026-06-18)
- Summary: Operations gained an upgradeable `tier` (optional Business field, absent⇒1, max
  TIER_MAX=3). New pure module `src/sim/tiers.ts`: tierOf, tierMultiplier (linear ×tier,
  floored at 1), effectiveOperationIncome (baseIncome × tier), upgradeCost (OPERATION_COST
  [kind] × current tier). economy.businessAccrual/operationIncome now use the tier-scaled
  income, and operationHeat scales heatPerTick by tier before police amplification. New
  `upgradeOperation{businessId}` command (own-operation only, costs cash, caps at TIER_MAX).
  Operations are created at tier 1. Adapter exposes per-district playerOperationTiers.
- Files: src/sim/tiers.ts (new), types.ts (tier?), constants.ts (TIER_MAX/factor),
  economy.ts (tier-scaled accrual/income/heat), commands.ts (upgradeOperation + tier:1 on
  establish), index.ts, adapter.ts; new tests/tiers.test.ts.
- Decisions: tierMultiplier is linear (tier N ⇒ ×N income AND ×N heat) so higher tiers are
  pure risk/reward; tier 1 = ×1 leaves every prior operation value intact (verified: the
  Phase 3 operation income/heat tests pass unchanged). `tier` is optional (absent⇒1) so
  existing Business literals in tests needed no edits. "Raid loss scales with tier" is
  honored inherently — a higher-tier op piles up proportionally more uncollected takings, so
  losing it (or its uncollected) in a raid costs more — without touching law.ts. Rival AI
  does not yet upgrade (deferred; rivals operate at tier 1) — noted, no test impact.
- Gate: typecheck ✅  build ✅  test ✅ (208 total; +11 asserting tierOf default, multiplier,
  effective income, upgrade cost, tier-1 baseline unchanged, tier-2 double accrual+heat,
  tier-3 ×3 accrual over a tick, upgrade cost/cap/deny/ownership, determinism). Phaser-free
  invariant green.
- Commit: phase14: Illegal Business Tiers — green

## Phase 15 — Mutiny & Auto-Loan (S5) — GREEN  (2026-06-18)
- Summary: MUTINY — `resolveLoyalty` now drifts loyalty, then (when a crew of ≥
  MUTINY_MIN_CREW is ≥ MUTINY_THRESHOLD_FRACTION below desertion loyalty) rolls a single
  seeded MUTINY_CHANCE: on a mutiny the whole disloyal cohort walks out at once and skims
  MUTINY_SKIM of cash, superseding individual desertion that tick. Pure helpers atRiskCount/
  mutinyConditionMet exported. AUTO-LOAN — new `debt` field on Family; tick finances step
  now compounds LOAN_INTEREST_RATE on carried debt, pays expenses, and auto-loans any cash
  shortfall into debt (cash never goes negative). Bankruptcy redefined: player debt >
  DEBT_CEILING (replaces the cash floor) in resolveWinLoss. New `repayLoan{amount}` command
  (pay debt from cash, capped by both). Adapter exposes debt (player + rivals).
- Files: src/sim/gangsters.ts (mutiny + drift/desert split), src/sim/tick.ts
  (resolveFamilyFinances: interest + auto-loan), src/sim/flow.ts (debt-ceiling bankruptcy),
  src/sim/commands.ts (repayLoan), types.ts (debt), state.ts (init 0), constants.ts, index.ts,
  adapter.ts; updated the 3 Phase-9 bankruptcy assertions in flow.test.ts to the debt model;
  new tests/mutinyLoan.test.ts.
- Decisions: Loyalty drift and desertion were split into two passes so the per-gangster
  desertion RNG draws stay in the exact same order as before — the mutiny roll is drawn ONLY
  when mutinyConditionMet (≥3 crew, ≥50% disloyal), which no existing gangsters.test scenario
  hits, so all prior desertion/determinism tests pass unchanged (verified). Auto-loan applies
  to all families uniformly; debt-bankruptcy elimination is player-only (matches the prior
  player-only cash-floor scope; rival debt is harmless for now). Interest compounds on
  PRIOR debt before new borrowing, so a fresh shortfall isn't double-charged the same tick.
  Debt must be actively repaid (no auto-repay) — that is the spiral. The 3 flow bankruptcy
  tests legitimately changed from cash-floor to debt-ceiling (documented).
- Gate: typecheck ✅  build ✅  test ✅ (219 total; +11 asserting atRiskCount/mutinyCondition,
  mutiny seed-scan (cohort removal + exact 25% skim), no-mutiny under min crew, auto-loan
  shortfall→debt with cash floored at 0, exact interest compounding, repay cap by cash/debt,
  repay denial, debt-ceiling bankruptcy via tick, determinism). Phaser-free invariant green.
- Commit: phase15: Mutiny & Auto-Loan — green

## Phase 16 — Systemic Shocks — GREEN  (2026-06-18)
- Summary: Added a seeded world-event system (`src/sim/shocks.ts`) as tick step 0. New state
  fields `activeShocks` and `shocksEnabled`. When enabled, each tick rolls SHOCK_CHANCE to
  fire one of six shocks (uniform pick): Crackdown (durational, +CRACKDOWN_HEAT to every
  family each tick), Boom/Bust (durational income ×BOOM_MULT/×BUST_MULT applied at accrual
  via incomeShockMultiplier), Federal Audit (instant: seizes a feds-shielded fraction of each
  family's DIRTY cash, leaving clean cash untouched — paying off S1+S3), Gang War (instant:
  every armed living rival queues a hit on the player, resolved at the conflict step the same
  tick), and Speakeasy Raid (instant: shuts one operation). Pure helpers incomeShockMultiplier,
  fedShield, auditSeizure, plus triggerShock (force a kind) exported. Adapter statusView
  exposes active shocks.
- Files: src/sim/shocks.ts (new), types.ts (ShockKind/ActiveShock + state fields), state.ts
  (createInitialState options.shocks; init []), constants.ts (shock table values),
  collection.ts (accrual × incomeShockMultiplier), tick.ts (step 0 resolveShocks), index.ts,
  adapter.ts (statusView shocks + newGame shocks option, default off); new tests/shocks.test.ts.
- Decisions: Shocks are OPT-IN (`shocksEnabled`, default false). When disabled, resolveShocks
  returns immediately and draws NO RNG — so every prior mechanic-isolation and tick-based
  exact test is completely unaffected (verified: 219 prior tests unchanged, zero updates this
  phase). createInitialState gained an optional options arg (additive); newGame keeps shocks
  off so adapter.test is untouched — the live BootScene (Phase 17) will enable them. The
  Federal Audit deliberately seizes only DIRTY cash (clean/laundered survives) and is shielded
  by the Feds bribe channel, the intended S1↔S3↔S16 synergy. Durational shocks age and expire;
  the active set is bounded. Determinism asserted with shocks enabled.
- Gate: typecheck ✅  build ✅  test ✅ (233 total; +14 asserting no-op/no-draw when disabled,
  income multiplier + scaled accrual, exact fedShield/auditSeizure, audit seizes dirty/spares
  clean, feds shield, gangWar hit queueing, speakeasy op removal, crackdown registration +
  ongoing heat, shocks-fire-and-expire over 60 ticks, enabled determinism, disabled-never-fires).
  Phaser-free invariant green.
- Commit: phase16: Systemic Shocks — green

## Phase 17 — Fedora Noir Reskin — GREEN  (2026-06-18)
- Summary: Added the pure presentation layer `src/scenes/theme.ts` (no Phaser, no sim): the
  canonical NOIR_PALETTE + NOIR_FONT and flavor helpers — bribeChannelLabel (The Beat/Bench/
  City Hall/Bureau), shockFlavor, tierName (Street/Block/Empire), heatLabel, moneyLine
  (clean/dirty framing), statusNarration (clipped noir lines per win/loss/playing). The
  adapter re-exports them and adds `narrate`. Rewrote BootScene to render the full enriched
  view model in the noir palette — clean/dirty money, debt, heat band, crew, held vs needed,
  uncollected takings, active shocks, the four bribe channels, and per-district control/
  holder/operation-tiers/uncollected — with SPACE/E/C controls, and turns shocks ON for live
  play (newGame(1,{shocks:true})).
- Files: src/scenes/theme.ts (new), src/scenes/adapter.ts (narrate + theme re-exports),
  src/scenes/BootScene.ts (full noir restyle + enriched HUD), new tests/theme.test.ts.
- Decisions: All reskin work is in /src/scenes; zero sim changes — the Phaser-free invariant
  is re-asserted by theme.test (and the original adapter.test). Flavor helpers are pure and
  asserted exactly. The live scene enables shocks; unit tests keep them opt-in.
- Gate: typecheck ✅  build ✅  test ✅ (243 total; +10 asserting palette/font, every bribe-
  channel/shock/tier/heat label, money framing, narration per state, the enriched player/
  district/status view model, and the sim-Phaser-free + theme-outside-sim invariant).
- Commit: phase17: Fedora Noir Reskin — green

## ENHANCEMENT RUN COMPLETE — DONE (2026-06-18)
- All seven enhancement phases (11–17) completed GREEN, in order, each behind the full gate
  (typecheck + build + test). Final suite: 243 tests across 20 files (up from 156/13 at the
  end of the 0–10 run), all green; production build succeeds.
- The five signature mechanics (CANON §2) are live and tested: S1 Dual Economy (clean/dirty
  ledger + laundering + dirty-hoard heat), S2 Collector Units (income accrues at businesses,
  risky collection runs — THE signature mechanic), S3 Bribery Sliders (police/judges/
  politicians/feds channels with distinct effects), S4 Illegal Business Tiers (upgrade ladder
  scaling income & heat), S5 Mutiny & Auto-Loan (coordinated walkouts + compounding debt
  spiral). Systemic Shocks (Phase 16) stress them all, and the Federal Audit pays off the
  S1↔S3 synergy by seizing only dirty cash, shielded by the Feds bribe. Phase 17 dresses it
  all in Fedora Noir.
- Architecture held throughout: /src/sim stayed pure and Phaser-free (enforced by an
  invariant test every phase); all randomness draws from the single seeded cursor and
  determinism is asserted per phase. Earlier-test updates were confined to the phases that
  legitimately changed a mechanic (Collectors → income realization; Bribery → 2 law cases;
  Mutiny/Auto-Loan → 3 bankruptcy cases) and each is documented in its receipt.
- Decisions of note: CANON.md and ENHANCEMENT_PLAN.md were absent and authored at bootstrap
  (recorded). The Ultracode "Workflow" tool was unavailable; its quality bar was applied
  manually. The stray-`</content>` write glitch from the 0–10 run persisted and was stripped
  after each write. No blockers encountered.

## Phase 18 — Feedback & Telegraphing — GREEN  (2026-06-18)
- Summary: Made the dirty-cash → heat → federal-bust danger chain legible. New pure module
  `src/sim/federal.ts`: federalExposure (heat + dirtyExposurePoints(dirty) − fedExposureRelief
  (The Bureau bribe), clamped 0..100), fedWarningTier (0..3 at thresholds 50/70/85), and the
  tick step `resolveFederalWarnings` (step 6.5, before law) which escalates/de-escalates a
  per-family `fedWarningLevel`, emits surfaced `fed-warning`/`fed-armed`/`fed-cooldown` events
  for the player, and ARMS the bust only one tick after the imminent tier holds. law.ts now
  gates the terminal bust on `family.bustArmed` (bust-level heat without arming lands as a
  seizure, logged `bust-withheld`). Adapter playerView gained federalExposure/federalTier/
  federalWarning (noir flavor via theme.federalWarningLabel), bustArmed, launderPrompt
  (dirty > FED_DIRTY_DANGER) with launderCapacity, and bureauBribe/bureauShield/bureauShielded.
  BootScene shows the exposure meter, active warning, launder prompt, and Bureau shield %.
- Files: src/sim/federal.ts (new), types.ts (fedWarningLevel/bustArmed), state.ts (init),
  constants.ts (federal constants), law.ts (bust gate + withheld log), tick.ts (step 6.5),
  index.ts, src/scenes/theme.ts (federalWarningLabel), src/scenes/adapter.ts (view fields),
  src/scenes/BootScene.ts (HUD); new tests/federal.test.ts; ARMED the bust in 3 earlier
  direct-resolveLaw bust tests (law.test ×2, bribery.test ×1) — documented below.
- Decisions: The terminal federal bust is now structurally telegraphed — it requires
  `bustArmed`, which is only set ≥1 tick AFTER the imminent (tier-3) warning fires and still
  holds, so a loss is always preceded by a warning the player can act on. This is a behavior
  change to the bust mechanic, so the three earlier tests that exercise the raw bust via a
  direct `resolveLaw` call (which bypasses the warning step) now set `s.player.bustArmed =
  true` to opt into a bust — with armed=true they reproduce the exact prior RNG/outcomes
  (verified: same draws, same results). The federal step is deterministic (no RNG), runs for
  all families (so rival busts still work, just telegraphed), and only fires at high exposure
  — low-heat tests are untouched (zero other regressions). The Bureau (feds) bribe now also
  RELIEVES federal exposure (heavy investment can keep exposure below the imminent tier and
  thus prevent the bust entirely) — making the narration ("The Bureau finally made it stick")
  match a discoverable counter, in addition to its existing audit shield. Cooling off (launder
  / lower heat) de-escalates and disarms, so player action visibly removes the danger.
- Gate: typecheck ✅  build ✅  test ✅ (256 total; +13 asserting exact exposure/relief/tier
  math, warning escalation per tier, no-arm-on-first-tick + arm-next-tick, cooldown disarm,
  the gate (unarmed never busts over 80 seeds) + one-tick telegraph via the pipeline, launder
  prompt threshold, Bureau shield flag, and determinism). Phaser-free invariant green.
- Commit: phase18: Feedback & Telegraphing — green

## Phase 19 — Balance Pass — GREEN  (2026-06-18)
- Summary: Conservative, documented constant retune giving the player runway to react to the
  federal-bust danger surfaced in Phase 18. No new systems; tuned values + a federal arming
  delay. Added `fedImminentTicks` counter so arming the bust requires the imminent tier to
  hold for FED_ARM_DELAY ticks.
- EXACT before → after values (rationale):
  • LAUNDER_FEE_RATE: 0.15 → 0.10 — laundering was too costly relative to the danger; a
    cheaper fee makes proactively converting dirty→clean worthwhile.
  • LAUNDER_CAP_PER_FRONT: 200 → 400 — at 200/run, clearing a ~$10k hoard took ~50 runs
    (impractical, the exact playtest trap); doubling throughput lets a few fronts keep pace.
  • FED_ARM_DELAY: (new) = 3 — the tier-3 "bust imminent" warning must persist 3 ticks before
    a bust can arm, guaranteeing ≥3 ticks of runway after the imminent warning (on top of the
    tier1→tier3 climb), so a federal loss is never a surprise and is always actionable.
  • STARTING_CASH: 2000 → 3000 — +50% early-game runway so a run doesn't end abruptly while
    the player is still establishing income and protection.
- Files: src/sim/constants.ts (LAUNDER_FEE_RATE, LAUNDER_CAP_PER_FRONT, FED_ARM_DELAY),
  src/sim/state.ts (STARTING_CASH), types.ts (fedImminentTicks), src/sim/federal.ts (arming
  delay logic); new tests/balance.test.ts; updated 2 dualEconomy launder assertions (fee 0.10,
  capacity-cap path) and 1 federal arming test (delay) — documented earlier-test edits.
- Decisions: All "2000" references in the suite explicitly set cash first, so the STARTING_CASH
  bump touched no test (verified). Income-ramp constants (OPERATION_INCOME, EXTORT_RATE) and
  the dirty-cash heat divisor were reviewed and deliberately LEFT UNCHANGED — they are heavily
  asserted by the verified economy tests and the abrupt-loss problem is addressed by the
  telegraph (P18) + arming delay + laundering accessibility + starting funds; changing income
  risked the foundation for marginal benefit. NOTE: "fun"/feel is validated by HUMAN PLAYTEST,
  not by these tests — the tests assert the new constant RELATIONSHIPS hold (fee ≤ 0.10,
  capacity ≥ 400, arm delay ≥ 3, run-clears ≥ 400, gap(imminent→armed) ≥ FED_ARM_DELAY,
  starting cash = 3000) and that determinism is preserved. The before/after list above is for
  the human to iterate from.
- Gate: typecheck ✅  build ✅  test ✅ (262 total; +6 balance asserting the accessibility/
  runway/pacing relationships and determinism; +updated launder & arming assertions).
  Phaser-free invariant green.
- Commit: phase19: Balance Pass — green

## FEEDBACK & BALANCE RUN COMPLETE — DONE (2026-06-18)
- Phases 18–19 complete GREEN, in order, behind the full gate. Final suite: 262 tests across
  22 files (up from 243/20), all green; production build succeeds; /src/sim Phaser-free
  invariant intact.
- The playtest failure (a no-warning federal bust on a $10,503 dirty / $2 clean hoard) is now
  addressed end to end: (P18) a queryable federal exposure signal, escalating tiered warnings,
  a hard gate that forbids a terminal bust until the imminent warning has armed, a launder
  prompt with capacity, and The Bureau shield surfaced in the view model + HUD — plus The
  Bureau bribe now relieving exposure so it is a discoverable counter; (P19) a 3-tick arming
  delay for guaranteed runway, cheaper/higher-throughput laundering, and more starting funds.
  A federal loss is now always telegraphed with several ticks to launder, bribe The Bureau,
  or cool off.
- Per CANON: bribery channels remained The Beat (police) / The Bench (judges) / City Hall
  (politicians) / The Bureau (feds) throughout. Step 0 sync confirmed both canonical docs
  present (CANON.md had a new repo-sync/concurrency section). Determinism preserved; all
  earlier-test edits were confined to the two phases and documented in their receipts. No
  blockers. "Fun" remains for human playtest validation.

## Phase 20 — Visual Reskin — GREEN  (2026-06-18)
- Summary: Turned the text-readout BootScene into a RENDERED Fedora Noir scene. New pure,
  Phaser-free module `src/scenes/assets.ts`: ASSET_MANIFEST (the exact LCR_ filenames, no
  version suffix), assetUrl, and `resolveSprite(key, loadedKeys)` — the graceful-fallback
  resolver that returns either a sprite (key loaded) or a labeled colored placeholder
  (missing/unknown key), plus view→asset mappings districtEnvKey / buildingKeyForKind /
  unitKeyForSkill. BootScene now preloads every manifest asset, computes which textures
  actually loaded, and renders: a top HUD panel (clean/dirty money, debt, heat band, crew,
  held, uncollected), a federal-exposure meter with the 3-rung warning ladder + launder
  prompt + The Bureau shield %, an active-shocks banner, a 5-card district MAP (env backdrop,
  HQ marker, per-operation building sprites, control/holder/tier/uncollected footer, hover +
  click-to-collect affordance), a crew strip of unit sprites (+ a collector when takings
  wait), four bribe-channel chips, a rivals line, and a game-over/victory overlay — all in
  the noir palette from theme.ts, with every missing PNG shown as a labeled placeholder so
  the scene ALWAYS renders. Interaction preserved: SPACE end week, E extort, C collect (+ a
  click affordance on districts).
- Files: src/scenes/assets.ts (new), src/scenes/BootScene.ts (full rendered rewrite),
  public/assets/{env,buildings,units,screens}/ (folders + .gitkeep), public/assets/README.md,
  tests/assets.test.ts (new). No /src/sim changes.
- Asset drop paths (drop processed PNGs here; they appear automatically, no code change):
  public/assets/env/        LCR_env_industrial.png, LCR_env_downtown.png,
                            LCR_env_waterfront.png, LCR_env_alley.png
  public/assets/buildings/  LCR_bldg_hq.png, LCR_bldg_speakeasy.png, LCR_bldg_gamblinghall.png,
                            LCR_bldg_collectioncenter.png, LCR_bldg_storefront.png
  public/assets/units/      LCR_unit_thug.png, LCR_unit_thompsonman.png, LCR_unit_collector.png,
                            LCR_unit_cadillac.png
  public/assets/screens/    LCR_screen_title.png, LCR_screen_gameover.png
- Decisions: The fallback LOGIC lives in a pure module so it is unit-tested in node without
  Phaser (the brief's "loader test"); the BootScene gates rendering on Phaser's
  textures.exists(key) after preload, so a 404 on a not-yet-dropped PNG simply yields a
  placeholder (loaderror handled, no crash). Filenames/keys carry NO version suffix, matching
  the brief exactly; the authoritative list is ASSET_MANIFEST. Verified `vite build` copies
  public/assets/* into dist/assets/* so dropped art ships. Scene layout uses fixed logical
  coordinates (Phaser RESIZE canvas) — visual polish is human-validated, not tested.
- Gate: typecheck ✅  build ✅ (public/assets copied to dist) test ✅ (274 total; +12 asset
  tests: exact manifest filenames per category, key=filename-without-ext with no _vN suffix,
  assetUrl path, public folders exist, placeholder-on-missing + sprite-on-loaded + unknown-key
  safety + every-key-placeholder-when-nothing-loaded, and the env/building/unit mappings).
  /src/sim Phaser-free invariant green; sim untouched.
- Commit: phase20: Visual Reskin — green

═══════════════════════════════════════════════════════════════════════════════
RTS ARC — branch rts/isometric-conversion (isometric real-time conversion)
═══════════════════════════════════════════════════════════════════════════════

## RTS-0 — Continuous Loop & Week-Timer — GREEN  (2026-06-18)
- Summary: Made the economy CONTINUOUS REAL-TIME by changing the settlement TRIGGER, not
  the settlement. New pure, Phaser-free module `src/sim/clock.ts`: `advanceClock(state,
  dtSeconds, weekDuration?)` accumulates real time on a new `state.weekElapsed` and fires the
  EXISTING economic tick once per full WEEK_DURATION_SECONDS elapsed (returns weeks fired);
  plus `weekProgress` and `secondsUntilNextWeek` for the future real-time countdown HUD. The
  existing weekly tick logic runs exactly as before — only its trigger moves from keypress to
  elapsed time. No rendering, no movement (RTS-0 scope).
- Files: src/sim/clock.ts (new), src/sim/constants.ts (WEEK_DURATION_SECONDS = 120),
  src/sim/types.ts (GameState.weekElapsed), src/sim/state.ts (init weekElapsed: 0),
  src/sim/index.ts (exports); new tests/clock.test.ts. /src/sim stays Phaser-free.
- Decisions: WRAPPED, NOT REWRITTEN — advanceClock calls the verified `tick()`. A deep-equal
  test proves a clock settlement is byte-for-byte identical to a manual tick from the same
  state (same economy + same seeded RNG cursor; weekElapsed returns to 0). The accumulator is
  a single `weekElapsed` field the economic tick never reads or writes, so all 274 prior tests
  pass unchanged (determinism deep-equals see weekElapsed 0 on both sides). Guards: non-positive
  / NaN dt is a no-op; an invalid weekDuration (≤ 0) is a no-op (no infinite loop). A single
  large dt fires multiple weeks (no per-call cap, as required by the multi-week test); the
  renderer/game-loop should pass bounded dt — noted for a later render phase. WEEK_DURATION_
  SECONDS is configurable per call and a tunable pacing knob (the Week-1047/engagement lever).
- Gate: typecheck ✅  build ✅  test ✅ (289 total; +15 clock tests asserting: default 120s;
  accumulation without firing early; ignore non-positive/NaN dt; exact firing at the interval
  (boundary 119+1 and a single 120s dt); a settlement deep-equals the existing tick AND
  produces the real income accrual; multi-week from one long dt (carries remainder) and from a
  long sub-week sequence; configurable weekDuration (+ ≤0 no-op); determinism under a fixed dt
  sequence AND across 1.0s vs 0.5s granularities; weekProgress / secondsUntilNextWeek).
  /src/sim Phaser-free invariant green; 274-test economic sim untouched and all green.
- Commit: rts0: Continuous Loop & Week-Timer — green

## RTS-1 — Isometric World Foundation — GREEN  (2026-06-18)
- Summary: Built the isometric rendering foundation. New PURE, Phaser-free module
  `src/sim/iso.ts`: gridToScreen / screenToGrid (exact inverse) / screenToTile, tileCorners,
  depthValue + compareDepth + depthSort (painter back-to-front), tileNeighbors(4) /
  tileNeighbors8 / inBounds / manhattan / tileEquals. New additive Phaser `IsoScene`
  rendering a 16×16 diamond-tile map (checkerboard placeholder tiles) plus sample box
  "buildings" to demonstrate depth layering, with a pannable (drag + arrow keys) and zoomable
  (wheel) camera centered on the map. main.ts now registers [IsoScene, BootScene] with the iso
  map as the default RTS view; BootScene stays registered and reachable ([B] map→card, [M]
  card→map). /src/sim stays Phaser-free.
- Files: src/sim/iso.ts (new), src/sim/index.ts (iso exports), src/scenes/IsoScene.ts (new),
  src/main.ts (register IsoScene first), src/scenes/BootScene.ts (+[M] return key); new
  tests/iso.test.ts. No /src/sim economic changes.

═══ PROJECTION SPEC — THE ART-PIPELINE CONTRACT (generate iso art against these) ═══
- PROJECTION: 2:1 dimetric ("standard game isometric"). On screen, grid +X goes DOWN-RIGHT,
  grid +Y goes DOWN-LEFT. A tile is a flat diamond (rhombus).
- TILE PIXEL DIMENSIONS: ISO_TILE_WIDTH = 128, ISO_TILE_HEIGHT = 64 (2:1). Half-extents
  64 × 32. A ground tile's diamond has corners (relative to its center): top (0,−32),
  right (+64, 0), bottom (0, +32), left (−64, 0).
- PROJECTION MATH (canonical, in src/sim/iso.ts):
    gridToScreen(gx,gy) = { x: (gx−gy)·64, y: (gx+gy)·32 }  // tile CENTER
    screenToGrid(sx,sy) = { gx: (sx/64 + sy/32)/2, gy: (sy/32 − sx/64)/2 }
- SPRITE ANCHOR / ORIGIN CONVENTION: anchor sprites at the BOTTOM-CENTER (Phaser origin
  x=0.5, y=1.0). Place a sprite at gridToScreen(gx,gy) — i.e. the tile center — so the sprite's
  base sits on the tile and its body rises upward (−y). This makes taller art overlap the
  tiles/objects behind it correctly.
- SIZING: a FOOTPRINT-1×1 building/unit sprite is ISO_TILE_WIDTH (128px) wide at the base;
  height is free (art rises above the diamond). Multi-tile buildings scale the base width by
  the tile footprint (e.g. a 2×2 racket base ≈ 256px wide). Trim transparent margins to the
  128px-wide base so the diamond footprint aligns.
- DEPTH SORTING: draw order key = depthValue = gx + gy (ascending = back→front); ties break
  by gx then by an explicit layer (ground=0 < building < unit). In Phaser, setDepth from this
  key (the scene multiplies by 10 and adds a small per-object offset so a building draws above
  its own ground tile but stays ordered among objects by tile).
═════════════════════════════════════════════════════════════════════════════════════════

- Decisions: Projection math lives in /src/sim (covered by the Phaser-free invariant test and
  unit-testable headlessly). gridToScreen returns the tile CENTER; screenToTile = round(inverse)
  because a unit square centered on a lattice point maps (under the linear transform) exactly
  to that tile's diamond — verified by round-trip + known-point tests. screenToTile normalizes
  −0 → 0 so tile coordinates are canonical (caught by a test). The iso scene is the default on
  the RTS branch (additive, BootScene preserved and reachable). Camera/visual quality is
  human-validated; all projection/depth/neighbor math is asserted.
- Gate: typecheck ✅  build ✅ (IsoScene bundled) test ✅ (304 total; +15 iso tests: 128×64
  2:1 spec; known gridToScreen points; grid→screen→grid exact round-trips over a 17×17 range;
  screenToGrid known fractional; screenToTile lands in the correct tile for centers + interior
  offsets + the −0 edge; tileCorners; depthValue + depthSort exact ordering + tie-breaks +
  no-mutation; tileNeighbors/8, inBounds, manhattan, tileEquals). /src/sim Phaser-free invariant
  green; 289-test sim+clock untouched and all green.
- Commit: rts1: Isometric World Foundation — green

## RTS-2 — Spatial Units & Movement — GREEN  (2026-06-19)
- Summary: Units now exist in space and move in continuous real time, on the SAME clock as the
  RTS-0 week settlement but fully independent of it. Two new PURE, Phaser-free modules:
  `src/sim/pathfinding.ts` (BFS shortest path on a 4-connected grid, routes around blocked
  tiles, deterministic — neighbors always expanded in iso [E,W,S,N] order) and
  `src/sim/movement.ts` (a `MovableUnit` with a continuous grid-space position + a tile-waypoint
  path, advanced by dt at MOVE_SPEED tiles/sec). New `src/sim/realtime.ts` exposes the unified
  driver `update(state, dt[, weekDuration])` that advances units AND the week clock together.
  GameState gains an additive `units: MovableUnit[]` (initialized `[]`). IsoScene renders two
  placeholder patroller markers (disc + shadow + label) that walk between corners and pathfind
  around the demo buildings, depth-sorted above their tile. /src/sim stays Phaser-free.
- Files: src/sim/pathfinding.ts (new), src/sim/movement.ts (new), src/sim/realtime.ts (new),
  src/sim/constants.ts (+MOVE_SPEED, +ARRIVE_EPSILON), src/sim/types.ts (+GameState.units,
  type-only import of MovableUnit), src/sim/state.ts (units: []), src/sim/index.ts (exports),
  src/scenes/IsoScene.ts (patroller markers + nav grid); new tests/pathfinding.test.ts,
  tests/movement.test.ts.

═══ MOVEMENT / PATHFINDING API — THE RTS-2 CONTRACT (RTS-3+ build on these) ═══
- CONSTANTS: MOVE_SPEED = 2.5 (default unit speed, TILES PER SECOND — resolution-independent
  of iso pixel size); ARRIVE_EPSILON = 1e-6 (tiles; within this a waypoint counts as reached).
- PATHFINDING (src/sim/pathfinding.ts):
    NavGrid { cols, rows, isBlocked(gx,gy): boolean }
    makeGrid(cols, rows, blocked?): NavGrid          // blocked = Iterable<GridPos>
    findPath(start, goal, grid): GridPos[] | null    // [start..goal] inclusive, or null if the
                                                     // goal is blocked / OOB / unreachable
    isValidPath(path, grid): boolean                 // contiguous, in-bounds, unblocked walk
  BFS gives a shortest tile path and is byte-deterministic for a given (start, goal, grid).
- MOVEMENT (src/sim/movement.ts):
    MovableUnit { id; pos: GridPos (continuous); path: GridPos[]; speed: number }
    spawnUnit(id, gx, gy, speed=MOVE_SPEED): MovableUnit
    setUnitPath(u, path)        // assigns waypoints; drops a leading waypoint == current tile
    issueMove(u, target, grid): boolean   // findPath + setUnitPath; false ⇒ unreachable, idle
    advanceUnit(u, dt): boolean // walks speed·dt tiles of arc length; true iff arrived this step
    advanceUnits(units, dt): string[]     // batch; returns ids that arrived this step
    stopUnit(u); unitTile(u); unitArrived(u); unitDestination(u); unitScreenPos(u)
  Motion is ARC-LENGTH PARAMETRIZED ⇒ exactly frame-rate independent: the same total time in
  one big dt or many small dt lands the unit in the same place (proven across a waypoint corner).
- REAL-TIME DRIVER (src/sim/realtime.ts):
    update(state, dt, weekDuration=WEEK_DURATION_SECONDS): { weeksFired, arrivedUnitIds }
  Advances units then settles weeks. The economic tick never touches state.units, so a week
  firing cannot reset or interrupt a move — units walk straight through a settlement boundary.
- RENDER (IsoScene, Phaser-only): place a unit at gridToScreen(unit.pos); depth =
  depthValue(round gx, round gy)·10 + 8 (unit layer above ground=0 / building offset).
═════════════════════════════════════════════════════════════════════════════════════════

- Decisions: ALL spatial/movement logic is pure in /src/sim (Phaser-free invariant covers it;
  unit-tested by stepping dt). Position is stored in GRID space (continuous gx,gy) and speed in
  tiles/sec, so the iso pixel size never leaks into the sim; the scene projects via gridToScreen
  at render time. Pathfinding is BFS (uniform-cost shortest path, trivially deterministic with a
  fixed neighbor order) rather than A* — no priority-queue tie-break ambiguity, exact paths in
  tests. `units` is an additive GameState field (`[]` by default) so all prior determinism
  deep-equals still hold (both sides see `units: []`; the economic tick ignores it). MovableUnit
  is imported into types.ts type-only (erased), so the types↔movement↔constants edges carry no
  runtime cycle. The patrollers in IsoScene are placeholder markers (RTS-3 adds real selection/
  command, RTS-4 interception, RTS-5 the economy-on-map collector run); visual quality is
  human-validated, all movement/pathfinding math is asserted.
- Gate: typecheck ✅  build ✅ (IsoScene bundled) test ✅ (328 total; +24: 10 pathfinding —
  straight path, path-to-self, diagonal Manhattan length, detour around a single blocker (never
  steps on it), routing around a wall through the gap, null for blocked/walled-off/OOB goals,
  determinism, isValidPath rejects empty/teleport/onto-blocker; 14 movement — spawn defaults,
  setUnitPath trim, stopUnit, speed·dt per second, arrives exactly on the emptying step then
  idles, arrival across many tiny steps, non-positive dt no-op, frame-rate independence straight
  AND across a corner, issueMove routes-around-blocker-to-arrival + unreachable→idle, batch
  arrival ids, update() week-fires-without-interrupting-movement, update determinism).
  /src/sim Phaser-free invariant green; the 304-test sim+clock+iso base untouched and all green.
- Commit: rts2: Spatial Units & Movement — green

## RTS-3 — Selection & Command — GREEN  (2026-06-20)
- Summary: Built the RTS control layer. New PURE, Phaser-free module `src/sim/selection.ts`:
  an immutable Selection set (emptySelection / selectOnly / selectMany / addToSelection /
  toggleSelection / clearSelection / isSelected / selectedUnits — every helper returns a NEW
  Selection, never mutates), grid-space hit-testing (pickUnit = nearest unit within PICK_RADIUS,
  deterministic ties; unitsInBox = drag-rectangle multi-select), and command resolution
  (resolveMoveCommand routes each selected unit to a target via issueMove, reporting moved/
  failed; isCommandableTile rejects walls / out-of-bounds). IsoScene now wires real input:
  left-click selects the unit under the cursor (shift = toggle/add), right-click issues a move
  of the selection to the clicked tile, a click/drag split (CLICK_SLOP px) keeps camera-pan
  drags from triggering selection, and a brass selection ring + a status line render the
  control state. The RTS-2 auto-patrol demo is replaced by player-driven control. /src/sim
  stays Phaser-free.
- Files: src/sim/selection.ts (new), src/sim/constants.ts (+PICK_RADIUS), src/sim/index.ts
  (selection exports), src/scenes/IsoScene.ts (selection/command input, selection ring, status
  HUD; replaces auto-patrol); new tests/selection.test.ts. No /src/sim economic changes.

═══ SELECTION / COMMAND API — THE RTS-3 CONTRACT (RTS-4/5 build on these) ═══
- CONSTANTS: PICK_RADIUS = 0.7 (tiles; click within this of a unit selects it).
- SELECTION (immutable; src/sim/selection.ts):
    Selection { ids: string[] }
    emptySelection() · selectOnly(id) · selectMany(ids) · addToSelection(sel,id)
    toggleSelection(sel,id) · clearSelection() · isSelected(sel,id) · selectedUnits(sel,units)
- HIT-TESTING (grid space; the scene converts pointer→grid via screenToGrid/screenToTile):
    pickUnit(units, point, radius=PICK_RADIUS): MovableUnit | null   // nearest within radius
    unitsInBox(units, a, b): string[]                                // drag-rectangle select
- COMMAND RESOLUTION:
    resolveMoveCommand(units, selectedIds, target, grid): { moved: string[]; failed: string[] }
    isCommandableTile(target, grid): boolean   // in-bounds && !blocked
  Deterministic (BFS paths); each selected unit routes around blockers, unreachable ⇒ failed,
  left idle (no crash). Missing ids are skipped.
- Decisions: control logic is PURE in /src/sim (covered by the Phaser-free invariant; unit-
  tested headlessly) — the scene only translates pointer events to grid points and renders the
  ring/status. Selection is immutable view-state (returns new objects) so it is asserted by
  value and composes for RTS-5 map-UI. pickUnit is distance-based (works for units mid-tile,
  not just tile-aligned) with deterministic array-order tie-break. Multi-select via shift-click
  (wired) and unitsInBox (pure, ready for a drag-box gesture later). Right-click is the move
  command; disableContextMenu lets it through. Input wiring is human-validated; all selection/
  pick/command logic is asserted.
- Gate: typecheck ✅  build ✅ (IsoScene bundled) test ✅ (343 total; +15 selection: immutable
  set helpers incl. no-op same-ref add + dedupe + drop-missing-ids; pickUnit under-cursor /
  empty-ground null / nearest-of-two / radius boundary; unitsInBox corners-any-order + empty;
  resolveMoveCommand single + multi-unit + unreachable→failed-idle + skip-missing + determinism;
  isCommandableTile open/wall/OOB). /src/sim Phaser-free invariant green; the 328-test base
  untouched and all green.
- Commit: rts3: Selection & Command — green

## RTS-4 — Interception & Ambush — GREEN  (2026-06-20)
- Summary: The S2 collector bottleneck made spatial. New PURE, Phaser-free module
  `src/sim/interception.ts`: a carrying collector in transit can be robbed by a hostile
  enforcer that closes within INTERCEPT_RADIUS — the carried dirty cash is redirected to the
  attacker's family via the SAME crediting path a safe collection uses (creditCrimeIncome),
  the attacker draws INTERCEPT_HEAT, and the collector is stopped and emptied. The take is "in
  transit" (not yet on anyone's books), so an ambush is not a double count — it only changes
  WHO banks it. MovableUnit gains additive optional fields factionId / role / carrying with two
  new constructors (spawnCollector, spawnEnforcer); plain RTS-2/3 movers leave them unset so all
  prior determinism holds. The real-time driver `update(state, dt)` now resolves interceptions
  AFTER movement and BEFORE the week settlement, so a robbed take can never be banked at the
  boundary; UpdateResult gains `interceptions`. IsoScene drives all units through advanceWorld
  and renders a noir "— ROBBED —" flash when an ambush fires (rival enforcer chases a player
  collector across the map). /src/sim stays Phaser-free.
- Files: src/sim/interception.ts (new), src/sim/movement.ts (+UnitRole, factionId/role/carrying,
  spawnCollector, spawnEnforcer), src/sim/realtime.ts (resolve interceptions in update;
  +interceptions in UpdateResult), src/sim/constants.ts (+INTERCEPT_RADIUS, +INTERCEPT_HEAT),
  src/sim/index.ts (exports), src/scenes/IsoScene.ts (world driven by advanceWorld; ambush demo
  + flash); new tests/interception.test.ts. No economic-settlement logic changed — interception
  reuses creditCrimeIncome and feeds the existing dirty-cash ledger.

═══ INTERCEPTION API — THE RTS-4 CONTRACT (RTS-5 spawns the carrying collectors) ═══
- CONSTANTS: INTERCEPT_RADIUS = 0.75 (tiles), INTERCEPT_HEAT = 4 (attacker heat per robbery).
- UNIT MODEL (additive on MovableUnit): factionId?: string · role?: 'collector'|'enforcer' ·
  carrying?: number.  spawnCollector(id,gx,gy,factionId,carrying,speed?) ·
  spawnEnforcer(id,gx,gy,factionId,speed?).  Two units are hostile only if both are owned and
  by different families.
- INTERCEPTION (src/sim/interception.ts):
    areHostile(a,b) · isCarryingCollector(u) · unitDistance(a,b) · canIntercept(enforcer,collector)
    detectInterceptions(units): InterceptionEvent[]      // pure, non-mutating
    resolveInterceptions(state): InterceptionEvent[]      // credits attacker (dirty) + heat,
                                                          // zeroes & stops collector, logs
    InterceptionEvent { attackerId, collectorId, attackerFaction, victimFaction, amount }
- DRIVER: update(state, dt[, weekDuration]) → { weeksFired, arrivedUnitIds, interceptions }.
  Order each step: advance units → resolve interceptions (on new positions) → settle weeks.
- Decisions: full-amount transfer (the collector was caught carrying it; the bottleneck/skim
  already happened when the take was gathered) — the "reuse" of collector-bottleneck rules is
  the dirty-money crediting path (creditCrimeIncome) + heat, identical to a deposit, so the
  ledger stays consistent. No RNG ⇒ deterministic given positions; each collector is robbed at
  most once per pass (carry zeroed), nearest hostile enforcer wins ties by array order. Neutral
  (factionless) and same-faction units never trigger. Interception runs inside the pure driver
  (tested by stepping dt); the scene flash is human-validated.
- Gate: typecheck ✅  build ✅  test ✅ (355 total; +12 interception: hostility/carrying/distance
  predicates; canIntercept in-range vs out-of-range/friendly/empty; resolve transfers-as-dirty +
  clean-unchanged + heat + stop + log; robbed-at-most-once with two enforcers (nearest wins);
  no-fire for friendly/neutral/far; determinism; detect is non-mutating; update-loop ambush under
  stepped dt; intercept-before-settle so a robbed take isn't banked). /src/sim Phaser-free
  invariant green; the 343-test base untouched and all green.
- Commit: rts4: Interception & Ambush — green

## RTS-5 — Economy-on-Map Integration — GREEN  (2026-06-20)
- Summary: The existing economic systems now play out in space — the settlement logic is
  UNCHANGED; only spatial triggers were added. New PURE, Phaser-free module
  `src/sim/mapEconomy.ts`: a deterministic MapLayout places every business on a tile and every
  family HQ in a corner; a COLLECTOR run (startCollectorRun) gathers a family's pending takings
  in a district, empties those businesses into a collector that spawns AT the first business and
  walks a real path to the family HQ (intercept-able via RTS-4); on safe ARRIVAL the take is
  banked (depositCollector / processCollectorArrivals) using the EXACT existing collection rules
  (collectionSafety × collectionFraction skim from the source district's presence/heat/muscle,
  then creditCrimeIncome as dirty money); robbed in transit ⇒ nothing banked. Extortion is
  driven from the map (businessAtTile → extortAtTile → the existing extort command), and map
  actions are control-gated (hasFootholdForExtort, the same EXTORT_MIN_CONTROL rule; the extort
  command itself still enforces it). MovableUnit gains the additive optional originDistrictId
  (set on a run; governs the deposit skim). IsoScene renders HQs + business storefronts on tiles
  and runs a live demo: the player extorts a front, a real collector walks the take to HQ while a
  rival enforcer hunts it — flashing "+ $X BANKED" on a safe deposit or "— ROBBED —" on an
  ambush. /src/sim stays Phaser-free.
- Files: src/sim/mapEconomy.ts (new), src/sim/movement.ts (+originDistrictId), src/sim/index.ts
  (exports), src/scenes/IsoScene.ts (HQ/business rendering, real collector-run demo, deposit
  flash); new tests/mapEconomy.test.ts. No economic-settlement (tick/commands) logic changed —
  deposits reuse collectionSafety/collectionFraction/creditCrimeIncome verbatim; extortion reuses
  the extort command.

═══ ECONOMY-ON-MAP API — THE RTS-5 CONTRACT (RTS-6 surfaces this in the HUD) ═══
- LAYOUT (src/sim/mapEconomy.ts):
    buildMapLayout(state, cols=16, rows=16): MapLayout { cols, rows, hqTiles, businessTiles }
    businessTileOf(layout, id) · hqTileOf(layout, familyId) · businessAtTile(layout, tile)
    laidOutBusinessIds(layout) · navGridForLayout(layout, blocked?)
- CONTROL GATE: hasFootholdForExtort(state, familyId, districtId): boolean  (control ≥ EXTORT_MIN_CONTROL)
- COLLECTOR RUN (existing collection rules, made spatial):
    startCollectorRun(state, layout, familyId, districtId, grid?, unitId?): { unit, carrying }
      — gathers pending, empties businesses, spawns a collector at the business carrying the
        GROSS take with originDistrictId set, paths to HQ; null result if nothing/no HQ/no path.
    depositCollector(state, collector): number   — banks via collectionSafety×collectionFraction
      skim (source district presence/heat/muscle) + creditCrimeIncome + COLLECT_HEAT; empties it.
    processCollectorArrivals(state, layout): DepositEvent[]  — banks every collector that has
      arrived at its own HQ tile still carrying. Call each frame after the world step.
- EXTORTION ON MAP: extortAtTile(state, layout, familyId, tile): { businessId?, targeted } —
  resolves the building under the click and dispatches the existing extort command (control gate
  + success roll unchanged).
- Decisions: the take is carried GROSS and the existing skim is applied at DEPOSIT (so "reaching
  HQ deposits (existing rules)" is literal and a test predicts the banked amount with the same
  functions + RNG cursor). The collector empties its businesses at dispatch (the take is "in the
  bag"), so an ambush (RTS-4) cleanly costs the victim the whole run with no double-count.
  Layout is a SEPARATE deterministic structure (not stored on Business) so the economic types and
  their determinism deep-equals are untouched. Businesses are walkable (occupy, don't block).
  Map UI for bribery/tiers/laundering is the existing commands surfaced by the scene (human-
  validated); the spatial collector/extortion logic is fully asserted.
- Gate: typecheck ✅  build ✅  test ✅ (369 total; +14 mapEconomy: layout assigns every
  business a tile + every family an HQ + tile→business resolution + determinism; foothold control
  gate; collector spawns-at-business / carries / empties-source / routes-to-HQ / null-when-empty /
  determinism; deposit banks via the EXACT existing skim (predicted amount) + dirty crediting +
  no-deposit-before-HQ + full-credit-without-district; intercept-in-transit banks nothing for the
  victim; extortAtTile targets the right building, no-op on empty ground, control-gated block).
  /src/sim Phaser-free invariant green; the 355-test base untouched and all green.
- Commit: rts5: Economy-on-Map Integration — green

## RTS-6 — Real-Time Presentation of Existing Systems — GREEN  (2026-06-20)
- Summary: The existing federal / mutiny / shock / week-settlement systems are now surfaced in
  the live RTS HUD — read-only, via a new PURE selector module `src/sim/hud.ts`. realtimeHudView
  builds a HUD snapshot from the EXISTING selectors (federalExposure + fedWarningTier +
  fedWarningMessage for the 50/70/85 ladder; atRiskCount + mutinyConditionMet for mutiny;
  state.activeShocks for shocks; secondsUntilNextWeek + weekProgress for the week-timer
  countdown), with a formatCountdown("M:SS") helper, plus topFederalWarning / anyMutinyPrimed
  convenience selectors. Nothing recomputes sim logic — the HUD shows exactly what the tick
  resolves. IsoScene paints a screen-fixed HUD (week countdown, clean/dirty ledger, heat label,
  federal exposure + WARRANT flag, crew + MUTINY-brewing alert, active shocks) refreshed each
  frame, plus a noir federal-warning banner. /src/sim stays Phaser-free.
- Files: src/sim/hud.ts (new), src/sim/index.ts (exports), src/scenes/IsoScene.ts (HUD panel +
  warning banner, refreshHud each frame using theme flavor: heatLabel / federalWarningLabel /
  shockFlavor); new tests/hud.test.ts. No federal/mutiny/shock/clock LOGIC changed — the HUD only
  reads the existing selectors.

═══ HUD VIEW-MODEL API — THE RTS-6 CONTRACT (RTS-7 art reads the same model) ═══
- realtimeHudView(state, weekDuration=WEEK_DURATION_SECONDS): HudView {
    week, status, lossReason, secondsUntilNextWeek, weekProgress, weekCountdownLabel,
    player: FamilyHudView, rivals: FamilyHudView[], shocks: { kind, ticksRemaining }[] }
  FamilyHudView { familyId, name, isPlayer, cash, cleanCash, dirtyCash, heat, debt,
    federalExposure, federalTier, federalMessage, bustArmed, mutinyRisk, mutinyImminent, crew }
- formatCountdown(seconds): "M:SS" · topFederalWarning(state): {tier,message}|null ·
  anyMutinyPrimed(state): boolean. All pure reads — realtimeHudView never mutates state.
- Decisions: the HUD is a pure SELECTOR over the existing sim (no new game logic), so federal/
  mutiny/shock behaviour is unchanged and the same numbers the tick computes are surfaced — the
  tests drive the REAL-TIME DRIVER (update with short weeks) and assert the federal ladder arms,
  mutiny flags, and a shock ages out exactly as the existing logic dictates. The week countdown
  is derived from the clock and honors a configured weekDuration (pacing knob). Noir flavor
  (labels/banner) stays in /src/scenes theme; sim-level messages stay terse. HUD rendering is
  human-validated; the view-model is fully asserted.
- Gate: typecheck ✅  build ✅  test ✅ (379 total; +10 hud: formatCountdown incl. clamp; week
  countdown reflects WEEK_DURATION + configured short week + progress; federal ladder tier/message
  at each band + clear state + null banner; federal arming UNDER update() (bustArmed + log);
  mutiny risk count + imminent flag matching mutinyConditionMet + loyal-crew zero; boom shock
  surfaces + ages out under update(); full snapshot shape + pure-read no-mutation). /src/sim
  Phaser-free invariant green; the 369-test base untouched and all green.
- Commit: rts6: Real-Time Presentation — green

## RTS-7 — Isometric Art Pipeline — GREEN  (2026-06-20)
- Summary: The drop-in iso art pipeline at the canonical 2:1 / 128×64 spec locked by RTS-1. New
  PURE, Phaser-free module `src/scenes/isoAssets.ts`: an ISO_ASSET_MANIFEST (tiles / buildings /
  units) carrying each texture's exact filename, public path, placeholder color+label, and the
  anchoring contract (tiles origin 0.5/0.5; buildings & units origin 0.5/1.0 bottom-center; 128px
  base for a 1×1 footprint), plus resolveIsoSprite — the graceful fallback that returns the real
  sprite when its texture loaded and a labeled colored placeholder otherwise (so the scene ALWAYS
  renders). IsoScene now preloads every iso texture (a loaderror handler swallows missing files),
  computes the loaded-key set, and renders ground tiles / buildings / unit markers as sprites when
  present, falling back to the existing RTS-1 placeholder polygons/discs when not. public/assets/
  iso/{tile,building,unit}/ created with a README documenting the projection spec + exact expected
  filenames. /src/sim untouched and Phaser-free.
- Files: src/scenes/isoAssets.ts (new), src/scenes/IsoScene.ts (preload + sprite/placeholder
  rendering for tiles, buildings, unit markers), public/assets/iso/README.md (+ tile/building/unit
  dirs); new tests/isoAssets.test.ts. No /src/sim changes.

═══ ISO ART CONTRACT — THE RTS-7 SPEC (drop real PNGs here; they auto-replace placeholders) ═══
- TILE DIMENSIONS: 128 × 64 px (ISO_TILE_PX_WIDTH × ISO_TILE_PX_HEIGHT), 2:1 dimetric.
- PLACEMENT: sprite drawn at the tile CENTER (gridToScreen(gx,gy)).
- ANCHOR: tiles origin (0.5, 0.5); buildings & units origin (0.5, 1.0) = bottom-center.
- SIZING: 1×1 building base = 128px wide (N×N scales ×N); units ~64px base; trim margins to the
  diamond footprint.
- PATHS (public/, filename == texture key + .png):
    tile/      LCR_iso_tile_cobble · LCR_iso_tile_street
    building/  LCR_iso_bldg_hq · LCR_iso_bldg_storefront · LCR_iso_bldg_speakeasy ·
               LCR_iso_bldg_gamblinghall · LCR_iso_bldg_warehouse
    unit/      LCR_iso_unit_collector · LCR_iso_unit_enforcer · LCR_iso_unit_thug
- API: resolveIsoSprite(key, loaded) → {sprite,def} | {placeholder,def?,color,label} ·
  isoAssetUrl(def) = assets/iso/<kind>/<file> · isoBuildingKeyForKind(kind) · isoUnitKeyForRole(role)
  · allIsoAssetKeys() (preloader). Mirrors the Phase-20 fallback pattern, iso-scoped.
- Decisions: art pipeline lives in /src/scenes (presentation), keeping /src/sim pure; the resolver
  is pure and unit-tested headlessly (loaded-vs-missing-vs-unknown, no throw). Preload uses a
  loaderror no-op so absent PNGs never crash the build/run — placeholders cover them. Final visual
  quality is human-validated; the spec, paths, anchoring, and fallback are asserted.
- Gate: typecheck ✅  build ✅ (renders with placeholders; no art required) test ✅ (389 total;
  +10 isoAssets: 128×64 2:1 spec; tile-centered vs building/unit bottom-center anchors; 128px
  building base; assets/iso/<kind>/ urls + exact filenames; allIsoAssetKeys; resolveIsoSprite
  sprite-when-loaded / placeholder-when-missing / placeholder-for-unknown-no-throw; kind→building
  + role→unit key maps). /src/sim Phaser-free invariant green; the 379-test base untouched and all
  green.
- Commit: rts7: Isometric Art Pipeline — green

## ═══ RTS CONVERSION ARC — COMPLETE (RTS-0 → RTS-7 all GREEN) ═══  (2026-06-20)
- The isometric real-time RTS conversion is fully delivered on branch rts/isometric-conversion,
  built ON TOP of the preserved Phase 0–20 economic simulation (the pure /src/sim engine was
  WRAPPED and driven, never rewritten; the sim-Phaser-free invariant held every phase).
- Arc summary:
    RTS-0 Continuous Loop & Week-Timer — advanceClock fires the existing tick on a real clock.
    RTS-1 Isometric World Foundation — pure 2:1 / 128×64 projection + depth-sort + iso scene.
    RTS-2 Spatial Units & Movement — arc-length movement (frame-rate independent) + BFS pathfinding.
    RTS-3 Selection & Command — pure selection set, hit-testing, click-to-move resolution.
    RTS-4 Interception & Ambush — hostile enforcer robs a carrying collector; cash → attacker.
    RTS-5 Economy-on-Map — businesses/HQ on tiles; collector walks the take to HQ, banks via the
          EXISTING collection rules; extortion targets a building; control-gated.
    RTS-6 Real-Time Presentation — federal ladder / mutiny / shocks / week countdown in a live HUD.
    RTS-7 Isometric Art Pipeline — drop-in 128×64 sprite spec with graceful placeholder fallback.
- Test count: 328 (start of this run) → 389 green (+61 across RTS-3..7: selection 15, interception
  12, mapEconomy 14, hud 10, isoAssets 10). Full suite typecheck + build + test green.
- Architectural law upheld throughout: all real-time spatial logic (clock, movement, pathfinding,
  selection, interception, map-economy, HUD selectors) is PURE in /src/sim, advanced via
  update(state, dt) and unit-tested by stepping dt with seeded-RNG determinism; Phaser only renders
  and captures input. The economic settlement (tick / applyCommand) was never modified — new
  systems wired to spatial triggers and reused the existing crediting/skim/federal/mutiny/shock
  logic verbatim. RUN_LOG remained append-only.

## RTS-8 — Game-Feel & Legibility — GREEN  (2026-06-20)
- Summary: Made the signature collector-run-and-ambush loop READABLE and TENSE — presentation,
  feedback, and feel only; NO new mechanics and NO economy/settlement change. New PURE,
  Phaser-free, unit-tested module `src/sim/gamefeel.ts` exposes READ-ONLY derived views over
  existing spatial state (reusing the RTS-4 interception predicates): collectorCarryView /
  carryingCollectors (the value walking the map + whether it is robbable in transit) and a
  positions-based threat selector — collectorThreat / threatenedCollectors / anyCollectorInDanger
  — that flags a carrying collector with a hostile enforcer in the proximity band (threatLevel:
  safe / threatened ≤ DANGER_RADIUS / ambush ≤ INTERCEPT_RADIUS). IsoScene renders the feel:
    1. COLLECTOR LEGIBILITY — a "$X" cash tag follows a carrying collector (hidden when empty).
    2. TENSION CUES — a throbbing danger ring on a threatened collector, amber when an enforcer
       approaches, blood-red at ambush range; the cash tag recolours with the threat.
    3. THE AMBUSH MOMENT — interception is a beat: an expanding shock ring + a camera shake +
       "— ROBBED  $amount —" called out over the collector (reuses the RTS-4 InterceptionEvent).
    4. COMMAND FEEDBACK — the selection ring throbs; a move drops a brass diamond at the target
       tile (a blood X on a rejected/blocked click) so the command visibly registers.
    5. STATE READABILITY — the HUD adds a "collector under threat" alert and tints the ledger
       toward blood as federal pressure / collector danger climbs.
  /src/sim stays Phaser-free; the economic settlement and all mechanic logic are untouched.
- Files: src/sim/gamefeel.ts (new), src/sim/constants.ts (+DANGER_RADIUS), src/sim/index.ts
  (gamefeel exports), src/scenes/IsoScene.ts (cash tag + danger ring per collector, threat-driven
  cues, ambush burst/shake/amount, move-target marker, selection-ring throb, HUD emphasis); new
  tests/gamefeel.test.ts. No economic/mechanic logic changed.

═══ GAME-FEEL DERIVED-VIEW API — THE RTS-8 SELECTORS (read-only; future HUD/AI can reuse) ═══
- CONSTANTS: DANGER_RADIUS = 2.5 tiles (proximity-warning band, wider than INTERCEPT_RADIUS 0.75).
- CARRY VIEW (src/sim/gamefeel.ts):
    collectorCarryView(unit): { id, carrying, vulnerable }   // vulnerable = collector & carrying>0
    carryingCollectors(state): CollectorCarryView[]           // the values walking the map
- THREAT VIEW (positions-based; reuses areHostile/unitDistance/isCarryingCollector):
    threatLevelForDistance(d): 'ambush'|'threatened'|'safe'   // ≤INTERCEPT_RADIUS / ≤DANGER_RADIUS
    isThreatTo(other, collector): boolean                     // a hostile ENFORCER only
    collectorThreat(collector, units): ThreatView { collectorId, carrying, nearestEnemyId,
        distance, level }                                     // nearest hostile enforcer + level
    threatenedCollectors(state): ThreatView[]                 // carrying collectors not 'safe'
    anyCollectorInDanger(state): boolean                      // HUD alert pip
  All pure reads — never mutate state; deterministic (nearest by distance, ties by array order).
- Decisions: feel is built entirely from READ-ONLY selectors so no mechanic or economy number
  moves — the threat band is a presentation widening of the RTS-4 ambush radius, not a gameplay
  change (interception still fires only at INTERCEPT_RADIUS). Threats come from hostile enforcers
  (who can actually ambush), matching canIntercept. Empty collectors are always 'safe' (nothing at
  stake). The pure selectors are fully asserted; the Phaser rendering (tags, rings, burst, shake,
  markers, HUD tint) is human-validated.
- Gate: typecheck ✅  build ✅  test ✅ (402 total; +13 gamefeel: carry view for carrying/empty/
  non-collector + carryingCollectors filter; threatLevelForDistance band boundaries (inclusive);
  isThreatTo hostile-enforcer-only; collectorThreat threatened/ambush/safe + nearest-of-several +
  empty-always-safe; threatenedCollectors flags-exactly-the-right-ones + none-when-far +
  determinism). /src/sim Phaser-free invariant green; the 389-test base untouched and all green.
- Commit: rts8: Game-Feel & Legibility — green

## RTS-9 — Incident Ledger & Causal Readout — GREEN  (2026-06-20)
- Summary: Made cause-and-effect legible across a playthrough — an OBSERVE/record/display layer
  that records what ALREADY happens; NO new mechanics, NO economy/settlement change. New PURE,
  Phaser-free module `src/sim/ledger.ts`: a bounded, sequence-stamped IncidentRecord list lives
  on GameState (additive: incidents / incidentSeq / incidentLogCursor, all default empty/0 so the
  402 deep-equals still hold). `recordIncident(state, input)` is PURE — returns a NEW state with
  the record appended (monotonic seq, capped to INCIDENT_CAP). `harvestIncidents(state)` PURELY
  projects new `state.log` entries (the structured GameEvents every mechanic already writes) into
  curated incidents via a kind→type/severity map, advancing a cursor so nothing is re-projected.
  Selectors: recentIncidents (newest-first), incidentsByType, lastIncident, incidentCount,
  isLedgerKind. A NON-INVASIVE wrapper `updateAndObserve(state, dt)` in realtime.ts runs the
  UNCHANGED update(), harvests the resulting logs, and — when a week settles — records a curated
  settlement summary with the player's clean/dirty/heat/exposure deltas (snapshotted around the
  untouched tick). IsoScene drives the world through updateAndObserve and renders a toggleable
  ([L]) top-right incident feed, newest-first, colour-coded by severity (danger=blood,
  warning=brass, gain=bone, info=fog). /src/sim stays Phaser-free; tick/applyCommand untouched.
- Files: src/sim/ledger.ts (new), src/sim/realtime.ts (+updateAndObserve/ObserveResult; update()
  unchanged), src/sim/types.ts (+incidents/incidentSeq/incidentLogCursor, type-only IncidentRecord
  import), src/sim/state.ts (init the 3 fields), src/sim/index.ts (exports), src/scenes/IsoScene.ts
  (observe driver + incident-feed panel + [L] toggle); new tests/ledger.test.ts. No mechanic logic
  changed — the ledger reads state.log + player snapshots only.

═══ INCIDENT LEDGER SCHEMA & API — THE RTS-9 CONTRACT (replay / debrief / AI can reuse) ═══
- RECORD: IncidentRecord { seq:number (monotonic, stable across cap), week:number (state.tick),
  type:IncidentType, severity:'info'|'gain'|'warning'|'danger', summary:string, data?:object }.
- TYPES: collector_run · robbery · deposit · settlement · federal_warning · federal_warrant ·
  federal_cooldown · bust · raid · mutiny · desertion · loan · shock · extortion · game_over.
- STATE (additive): incidents:IncidentRecord[] · incidentSeq:number · incidentLogCursor:number.
- PRIMITIVE: recordIncident(state, {type,severity,summary,week?,data?}) → NEW state (pure; capped
  at INCIDENT_CAP=200; seq monotonic).
- HARVEST: harvestIncidents(state) → NEW state — projects new log entries (curated kinds only) and
  advances incidentLogCursor; idempotent. isLedgerKind(kind) exposes the curated set.
  Source-log kinds mapped: collector-dispatched→collector_run, interception→robbery,
  collector-deposit→deposit, fed-warning→federal_warning, fed-armed→federal_warrant,
  fed-cooldown→federal_cooldown, raid-bust→bust, raid-cash/raid-operation→raid, mutiny→mutiny,
  desertion→desertion, auto-loan→loan, shock/shock-audit-seizure/shock-speakeasy-raid→shock,
  extort-success/extort-fail→extortion, game-over→game_over.
- DRIVER: updateAndObserve(state, dt[, weekDuration]) → { result:UpdateResult, state:NEW state }.
  Runs the unchanged update(), harvests logs, and on a week boundary records a `settlement`
  incident with {cleanDelta,dirtyDelta,heatDelta,exposureDelta,heat,exposure,weeksFired}.
- SELECTORS: recentIncidents(state,n) (newest-first) · incidentsByType(state,type) · lastIncident
  · incidentCount(state, type?).
- Decisions: the ledger is a PURE PROJECTION of the event log every mechanic already writes, plus
  a snapshot-based settlement delta — so zero settlement/mechanic code changed and the additive
  GameState fields keep all prior determinism deep-equals (both sides start []/0/0; tick/update
  never touch them; only the ledger functions do). recordIncident returns a NEW state (per spec)
  and the scene reassigns this.state each frame (shallow clone shares units/districts/log refs, so
  the live world continues). Bounded at 200 with a monotonic seq so identities survive the cap.
  The feed rendering ([L] toggle, severity colours) is human-validated; the ledger + selectors +
  observe wiring are fully asserted.
- Gate: typecheck ✅  build ✅  test ✅ (415 total; +13 ledger: recordIncident pure-append +
  original-unchanged + correct record; monotonic seq; default vs explicit week; cap keeps last N
  with seq still climbing + stable first/last; recentIncidents newest-first + n=0 + byType + counts
  + lastIncident undefined-when-empty; harvest projects curated-only + advances cursor + idempotent
  + isLedgerKind; updateAndObserve real robbery (amount+attacker) + deposit + weekly settlement
  delta + federal-warning crossing + determinism). /src/sim Phaser-free invariant green; the
  402-test base untouched and all green.
- Commit: rts9: Incident Ledger & Causal Readout — green

## RTS-10 — Vision Pass: Living City — GREEN  (2026-06-20)
- Summary: Turned the abstract colored-diamond prototype into a readable, atmospheric Fedora-Noir
  crime map — a presentation/UX run on the EXISTING systems (no tick/applyCommand change, sim
  stays Phaser-free). New PURE module `src/sim/inspect.ts` (unit-tested) backs the legibility:
  facing math (facingFromVector / unitFacing / facesRight — 8-way grid compass) so units orient
  to their movement, and tooltip inspection selectors (inspectUnit / inspectBusiness /
  inspectDistrict) that answer "what is this, whose is it, what does it earn/carry, is it in
  danger." New Phaser-only `src/scenes/cityArt.ts` generates ALL art procedurally from vector
  Graphics (no external assets): recognizable unit figures (a courier with a money bag, broad
  muscle, a blood-red rival enforcer with a tommy gun), a rotating brass "%" protection coin,
  and cobbled iso ground tiles, plus a parametric iso-building drawer (brick storefronts, a tall
  brass-trimmed HQ, speakeasies, warehouses). IsoScene was rewritten around them.
  What a player now SEES:
    • A LEGIBLE CITY — cobbled streets vs. lots, five subtly tinted districts, brick buildings
      with lit windows and brass trim, a distinct flagged HQ per family (not bare diamonds).
    • UNITS THAT READ AS UNITS — figures with clear silhouettes + a faction foot-ring (brass=you,
      blood=rival) that FACE their direction (flip), bob as they walk, and idle-breathe.
    • THE PROTECTION STATE — a rotating brass % coin floats over every front you've shaken down
      (the original's green %), driven by inspectBusiness().payingProtection.
    • HOVER TOOLTIPS — hovering any unit/building/district shows a noir tooltip (kind, owner,
      income, takings, cash carried + AMBUSH/danger), the single biggest legibility win.
    • A CLEAR HUD — clean/dirty money, heat label, crew, a week-countdown bar, and a federal
      EXPOSURE LADDER bar with 50/70/85 tick marks that reddens by tier; a warning banner.
    • THE WIRE — the incident ledger ([L]) as a severity-coloured live feed, newest first.
    • JUICE — selection ring throb, a real ROBBED beat (expanding shock ring + camera shake +
      stolen amount), a + $X BANKED beat, move-target markers, a slow day↔night veil so the
      city breathes.
    • ONBOARDING — a noir intro/legend card (extort → collect → protect the collector → bank →
      reinvest → bribe the four channels) dismissed by a click, re-openable with [H].
  /src/sim stays Phaser-free; the economic settlement is untouched.
- Files: src/sim/inspect.ts (new, pure), src/sim/index.ts (inspect exports), src/scenes/cityArt.ts
  (new, procedural art), src/scenes/IsoScene.ts (full vision rewrite); new tests/inspect.test.ts.
  Note: the procedural art now drives the scene; the RTS-7 isoAssets placeholder/real-PNG loader
  module + its tests are retained (still green) but no longer wired into IsoScene — procedural art
  supersedes it and always renders with zero assets.

═══ INSPECTION / FACING API — THE RTS-10 PURE CONTRACT (tooltips / orientation / future UI) ═══
- FACING (src/sim/inspect.ts): Facing = 'E'|'SE'|'S'|'SW'|'W'|'NW'|'N'|'NE'.
    facingFromVector(dx,dy): Facing|null  (null for zero vector) · unitFacing(unit): Facing
    (heads toward next waypoint, default 'S' idle) · facesRight(facing): boolean (flip helper).
- INSPECTION (read-only models over existing state):
    inspectUnit(state,id): { id, kind, ownerId, ownerName, carrying, vulnerable, threat, facing } | null
    inspectBusiness(state,id): { id, name, kind, districtId, districtName, earnerId, earnerName,
        payingProtection, income, uncollected, tier } | null
    inspectDistrict(state,id): { id, name, holderId, holderName, policePresence, playerControl,
        businessCount, operationCount } | null
- Decisions: facing + inspection are PURE and unit-tested (the gated core); all rendering is
  procedural vector art (cityArt.ts) so no asset pipeline is needed and the scene always renders.
  Faction colour is carried by a foot-ring + figure tint rather than per-figure textures (fewer
  bakes). District identity is a subtle tile tint. Visual quality is human-validated; the facing
  math + tooltip models are fully asserted.
- Gate: typecheck ✅  build ✅  test ✅ (425 total; +10 inspect: 8-way facing incl. zero-vector
  null + facesRight; unitFacing toward-waypoint/idle; inspectUnit carrying collector w/ owner +
  threat=ambush + facing, enforcer label, null-unknown; inspectBusiness paying-protection +
  earner + income + takings, un-extorted has no earner, null-unknown; inspectDistrict holder +
  police + control; dispatched-collector integration). /src/sim Phaser-free invariant green; the
  415-test base untouched and all green.
- Commit: rts10: Vision Pass — Living City — green

## RTS-11 — Onboarding & Early-Game Tuning — GREEN  (2026-06-20)
- Summary: Fixed the punishing/opaque opening so a new player can reliably establish income in
  the first minute, WITHOUT dumbing the systems down — onramp tuning + guidance/feedback only;
  the economic settlement (tick) and command correctness are unchanged. Three pure, unit-tested
  levers + scene UX:
  1. EARLY-GAME FAIRNESS — extortion now has a success FLOOR. extortSuccessChance scales from
     EXTORT_BASE_CHANCE (0.5) at zero control up to 1.0 at full control, plus the 0.04/skill
     muscle bonus (was control/100, i.e. ~0.30 at the home front). The home front (control 30)
     is now a 0.65 first roll → ~0.88 cumulative over two tries; with the new starting crew's
     muscle it is ~0.89 on the FIRST press. Full-control (100) is still guaranteed (1.0).
  2. STARTING CREW — createInitialState gains an additive { startingCrew?: boolean } that seeds
     the player with two loyal guards (skill 3, loyalty 70, guarding district-0). FIXED stats,
     no RNG draw → the seeded PRNG cursor and every determinism test are byte-identical with or
     without it; default OFF so all prior tests are untouched. The live scene turns it ON. Gives
     extortion muscle + defense (familyStrength 6) and a non-zero crew; two guards (< MUTINY_MIN_
     CREW 3) cannot mutiny early.
  3. ONBOARDING GUIDANCE (pure src/sim/onboarding.ts + IsoScene render) — firstObjective(state)
     drives a persistent top-centre ▶ objective banner and a pulsing highlight over the suggested
     first target: extort → collect → protect → grow. suggestedExtortTarget points at the first
     legal front; hasEstablishedIncome / hasCarryingCollector gate the steps. The player presses
     [E] to shake down the glowing front and [C] to send a collector — both guided by the
     objective; a successful shakedown seeds a little back-pay so [C] is immediately playable.
  4. READABLE FAILURE — [E] shows a clear beat either way: "NOW PAYS PROTECTION" (brass) on
     success or "RESISTED — try again" (blood) on a failed roll, plus a status line saying
     extortion is a roll; both land in The Wire (ledger extort-success/extort-fail).
  5. PACING SANITY — WEEK_DURATION_SECONDS 120 (2 min, room to breathe), MOVE_SPEED 2.5 (a
     collector crosses the map in ~8s) left as-is; federal exposure stays low for a fresh player
     (low heat/dirty) and the live scene keeps shocks OFF, so no random gang-war "river" death
     ambushes a defenseless opening. Documented, not changed.
- Files: src/sim/constants.ts (+EXTORT_BASE_CHANCE), src/sim/commands.ts (extortSuccessChance
  floor formula), src/sim/state.ts (+startingCrew option, fixed crew), src/sim/onboarding.ts
  (new, pure), src/sim/index.ts (exports), src/scenes/IsoScene.ts (startingCrew on; player-driven
  [E] extort / [C] collect with success/resisted beats; ▶ objective banner + pulsing target
  highlight; rival hunts any carrying collector; legend/hints updated); updated tests/
  extortion.test.ts (new tuned-chance assertions); new tests/onboarding.test.ts. tick/applyCommand
  settlement logic unchanged.

═══ ONBOARDING API — THE RTS-11 PURE CONTRACT (tutorials / objective UI / AI hints) ═══
- TUNING: EXTORT_BASE_CHANCE = 0.5. extortSuccessChance = clamp(BASE + (control/100)*(1-BASE) +
  0.04*muscle, 0, 1). createInitialState(seed, { shocks?, startingCrew? }) — startingCrew seeds
  two fixed guards on the player (no RNG draw; default off).
- ONBOARDING (src/sim/onboarding.ts):
    hasEstablishedIncome(state, familyId): boolean   (extorts a front OR owns an op)
    suggestedExtortTarget(state, familyId): { businessId, districtId, districtName } | null
    hasCarryingCollector(state, familyId): boolean
    firstObjective(state): { step:'extort'|'collect'|'protect'|'grow', title, detail,
        targetBusinessId, done }   — the single next move to teach. Pure read.
- Decisions: the floor is a TUNING constant (not a rewrite) — extortion still gates on control,
  still rolls, still deterministic; only the probability shifts. The starting crew is additive +
  RNG-neutral so it changes the game's ONRAMP without perturbing any determinism test. All new
  logic is pure and asserted; the scene wiring (banner, highlight, [E]/[C], beats) is human-
  validated.
- Gate: typecheck ✅  build ✅  test ✅ (438 total; +13 onboarding: startingCrew seeds 2 loyal
  guards / none by default / RNG cursor unchanged / gives +0.24 home muscle; extort floor scales
  BASE→1.0 + home-front 0.65 favorable; hasEstablishedIncome + suggestedExtortTarget home-front /
  advances after extort / null below gate; firstObjective extort→collect→protect→grow + [E]/[C]
  details + done; empty-collector not carrying). extortion.test retuned (control 40→0.70, 0→0.50,
  muscle 0.95, min-gate now successes>failures). /src/sim Phaser-free invariant green; the
  425-test base otherwise untouched and all green.
- Commit: rts11: Onboarding & Early-Game Tuning — green

## RTS-12 — Defense Tutorial & Cash Legibility — GREEN  (2026-06-20)
- Summary: Fixed two UAT feel-bads from the first minute — the first paycheck being robbed with
  no taught counter, and clean cash bleeding invisibly — plus surfaced the grow actions in the
  iso scene. Observe/guide/tune only; tick/applyCommand settlement untouched, /src/sim Phaser-free.
  1. TUTORIAL DEFENSE / FIRST-RUN SAFE NET — new additive GameState.tutorialFreeRuns (default 0)
     + MovableUnit.protectedRun. createInitialState gains { tutorialFreeRuns? } (RNG-neutral).
     startCollectorRun marks a dispatched run protectedRun and spends one free-run while > 0;
     interception.canIntercept now refuses to rob a protectedRun collector — so a new player's
     FIRST paycheck is guaranteed home even with an enemy on top of it. Normal interception risk
     resumes once the free-run is spent. The defense is TAUGHT: the collect objective tells the
     player the first run is SAFE and that future runs must be timed when the rival is away (the
     danger ring telegraphs it), and the protect objective reads "SAFE PASSAGE — FIRST RUN" with
     the lesson to time/escort. In the scene the protected collector wears a steady brass ring +
     a "$X ✓ SAFE" tag while the rival visibly hunts it (teaching the threat without the loss).
  2. CASH LEGIBILITY — FamilyHudView gains uncollected (totalUncollected) and weeklyUpkeep
     (familyExpenses). The HUD now shows "Upkeep $Y/wk" and a prominent brass "Uncollected $X
     waiting — press [C] to collect" readout, so the player always sees WHY clean cash drifts
     (upkeep) and that money is owed but not yet banked. The collect objective reframes takings
     as "money you're owed but don't have — collect before upkeep outruns income."
  3. GROW IS ACTIONABLE IN THE ISO VIEW — [R] reinvest (opens the priciest affordable racket in
     your strongest district via establishOperation) and [G] grease (cycles the four channels,
     +$10/wk each via setBribe) are wired into IsoScene with status/float beats; the grow
     objective now points at these reachable keys instead of the [B] card view only.
- Files: src/sim/types.ts (+tutorialFreeRuns), src/sim/movement.ts (+protectedRun), src/sim/
  state.ts (+tutorialFreeRuns option/init), src/sim/mapEconomy.ts (mark+spend protected run),
  src/sim/interception.ts (canIntercept skips protected), src/sim/hud.ts (+uncollected, +weekly
  Upkeep), src/sim/onboarding.ts (+nextRunIsProtected/carryingRunIsProtected, defense + first-run
  messaging, grow→[R]/[G]), src/sim/index.ts (exports), src/scenes/IsoScene.ts (tutorialFreeRuns
  on; uncollected/upkeep HUD readout; protected-collector SAFE visual; [R]/[G] actions; legend/
  hints); new tests/tutorialDefense.test.ts. No settlement logic changed.

═══ RTS-12 PURE CONTRACT (tutorial state, cash readouts, defense hints) ═══
- STATE (additive): GameState.tutorialFreeRuns:number (default 0) · MovableUnit.protectedRun?:boolean.
  createInitialState(seed, { shocks?, startingCrew?, tutorialFreeRuns? }) — all RNG-neutral.
- INTERCEPTION: canIntercept(enforcer, collector) is false when collector.protectedRun — so
  detect/resolveInterceptions never rob a protected run. startCollectorRun sets protectedRun and
  decrements tutorialFreeRuns on dispatch while > 0.
- HUD: FamilyHudView.uncollected (totalUncollected) + .weeklyUpkeep (familyExpenses); familyHudView
  (family, uncollected=0).
- ONBOARDING: nextRunIsProtected(state) · carryingRunIsProtected(state, familyId); firstObjective
  collect/protect detail now teach first-run safety + timing, grow detail names [R]/[G].
- Decisions: the safety net is a TUTORIAL flag on the spatial layer (interception lives in the
  real-time driver, not tick), default 0 so every prior interception/determinism test is unchanged;
  the telegraph still SHOWS on a protected run so the player learns the threat without paying for
  it. uncollected/upkeep are pure read selectors. [R]/[G] dispatch the existing establishOperation/
  setBribe commands (correctness unchanged). New logic asserted; scene visuals human-validated.
- Gate: typecheck ✅  build ✅  test ✅ (451 total; +13 tutorialDefense: tutorialFreeRuns default/
  option/RNG-neutral; startCollectorRun marks+spends a protected run, next run unprotected;
  canIntercept + resolveInterceptions refuse a protected collector (vs. an unprotected control);
  the first dispatched run banks even with an enemy point-blank; HUD uncollected + weeklyUpkeep
  (60 for two guards) + default 0; nextRun/carryingRunIsProtected; collect promises SAFE first run,
  protect reads SAFE PASSAGE vs the normal warning, grow names [R]/[G]). /src/sim Phaser-free
  invariant green; the 438-test base untouched and all green.
- Commit: rts12: Defense Tutorial & Cash Legibility — green

## RTS-13 — Onramp Polish — GREEN  (2026-06-20)
- Summary: Closed three UAT watch-items on the first three minutes — the run-2 difficulty cliff,
  the broken "✓ SAFE" dollar promise, and the idle-bleed pacing. Tuning + telegraph/guidance +
  protected-deposit adjustment only; tick/applyCommand settlement untouched, /src/sim Phaser-free.
  1. RUN-2 RAMP (not a cliff) — new pure selectors telegraph route danger BEFORE the cash is on
     the street so the player practices timing under full information. gamefeel.hostileEnforcerNear
     (nearest hostile enforcer to a grid point within a radius) + mapEconomy.dispatchThreat(state,
     layout, familyId) → { hot, enemyId }: "hot" when a rival enforcer is within ROUTE_DANGER_
     RADIUS (4 tiles) of the player's HQ or any business with takings (the run's endpoints). The
     iso collect objective now reads "ROUTE: ⚠ HOT — wait for it to clear, THEN [C]" or "ROUTE:
     ✓ CLEAR — send now", a blood ring pulses over the prowling enforcer, and pressing [C] into a
     hot route flashes "SENT INTO DANGER!". So run #1 rehearses the loop (guaranteed), run #2
     rehearses TIMING with a clear go/no-go read instead of a blind jump to full stakes.
  2. ✓ SAFE PROMISE EXACT — depositCollector now banks a protectedRun's FULL carried amount with
     NO skim and NO RNG draw, so "$320 ✓ SAFE" banks exactly $320 (was ~$305 after the deposit
     skim). Normal (unprotected) runs still skim via the existing collection rules — the contrast
     is asserted. The number promised equals the number received.
  3. GENTLER EARLY BLEED — the seeded tutorial crew works cheap: STARTING_CREW_UPKEEP = 15/wk
     each (was skill×10 = 30), halving the idle bleed to $30/wk while a new player learns the loop
     (~100 weeks of runway on the $3000 start). A recruited gangster still costs skill × upkeep-
     per-skill, so the pressure is real once the family grows — just not punishing in minute one.
- Files: src/sim/constants.ts (+ROUTE_DANGER_RADIUS, +STARTING_CREW_UPKEEP), src/sim/state.ts
  (tutorial crew uses STARTING_CREW_UPKEEP), src/sim/mapEconomy.ts (protectedRun full deposit;
  +dispatchThreat), src/sim/gamefeel.ts (+hostileEnforcerNear), src/sim/index.ts (exports),
  src/scenes/IsoScene.ts (collect-step route telegraph + blood ring + [C] hot warning beat);
  new tests/onrampPolish.test.ts; updated tests/tutorialDefense.test.ts (upkeep now 2×STARTING_
  CREW_UPKEEP). No settlement logic changed.

═══ RTS-13 PURE CONTRACT (pre-dispatch telegraph, exact-safe deposit, upkeep tunables) ═══
- CONSTANTS: ROUTE_DANGER_RADIUS = 4.0 tiles · STARTING_CREW_UPKEEP = 15 cash/wk.
- TELEGRAPH (pure): hostileEnforcerNear(state, familyId, point, radius): MovableUnit | null ·
  dispatchThreat(state, layout, familyId, radius=ROUTE_DANGER_RADIUS): { hot, enemyId } — hot when
  a hostile enforcer is near the HQ or a collectible source. CLEAR when nothing is collectible.
- DEPOSIT: depositCollector banks carried IN FULL for a protectedRun (no skim, no RNG); the
  existing presence/heat/muscle skim still applies to normal runs.
- Decisions: the telegraph is a READ-ONLY positional selector (no mechanic change) so run #2 is a
  legible timing skill, not a surprise; the protected-full deposit keeps the tutorial promise
  honest and is RNG-neutral on that path (existing interception/deposit determinism untouched);
  the upkeep tune is a documented constant on the seeded crew only (recruit economics unchanged).
  New logic asserted; scene telegraph visuals human-validated.
- Gate: typecheck ✅  build ✅  test ✅ (458 total; +7 onrampPolish: protected deposit banks full
  + no-RNG-draw + unprotected-still-skims + full end-to-end via processCollectorArrivals;
  hostileEnforcerNear finds hostile-in-radius / ignores friend/far/non-enforcer; dispatchThreat
  HOT near source + names enemy / CLEAR when far / CLEAR when nothing to collect / HOT near HQ).
  tutorialDefense retuned (upkeep 30). /src/sim Phaser-free invariant green; the 451-test base
  otherwise untouched and all green.
- Commit: rts13: Onramp Polish — green

## RTS-14 — Crew Traits & Loyalties — GREEN  (2026-06-20)
- Summary: Added the first DEPTH mechanic — crew members are now distinct characters with traits,
  individual loyalties shifted by the events the sim already produces, and a light ties layer —
  deepening (not replacing) the existing desertion/mutiny spiral. All pure, additive, seeded, and
  cursor-safe; tick/applyCommand correctness preserved (every modifier is a no-op for a trait/
  tie-less crew, so all prior behaviour and 458 tests are byte-identical without traits).
  1. TRAITS (src/sim/traits.ts) — 6 traits as PURE data + PURE modifier functions over existing
     mechanics: Brutal (+0.08 extort per guarding member, +2 combat strength), Loyal (softens
     loyalty losses by 3, halves desertion chance), Greedy (+15 upkeep), Cool (sheds +1 heat/tick,
     ignores the heat loyalty penalty), Green (−10 upkeep, cheap/weak), Connected (−5/wk bribe
     retainer). Traits are rolled 1–2 per gangster, seeded from the gangster id via its OWN Rng
     (rollTraits) — deterministic but NEVER touches state.rngState, so recruitment's skill/loyalty/
     name draws and every determinism test are unchanged. Greedy+Green can't co-occur.
  2. LOYALTY AS PER-MEMBER, EVENT-DRIVEN (src/sim/crew.ts) — individual loyalty already existed;
     now it shifts on real events: paid/unpaid (resolveLoyalty, via trait-aware memberLoyaltyDelta),
     a SCORE banked (applyCrewLoyaltyEvent on deposit, +4), a run ROBBED (−8 on interception), a
     crewmate KILLED (tie propagation in conflict). Low individual loyalty still feeds the existing
     desertion rolls (now × desertionChanceFactor) and the mutiny cohort — extended, not replaced.
  3. TIES — a minimal Family.ties list ({a,b,kind:'ally'|'rival'}) + pure propagation: a wrong done
     to one member spills half onto a tied ally (same sign) or a rival (opposite), one hop, no
     recursion. The starting crew ships Sal (Loyal) + Vito (Brutal) as allies.
  4. SURFACED — IsoScene shows a bottom-left CREW roster (toggle [K], default on): each member by
     name, [traits], and a loyalty read (● loyal / ◐ wavering / ○ disloyal + value), sorted most-
     disloyal-first and tinted by the unhappiest member, via the pure crewReadout selector.
- Files: src/sim/traits.ts (new), src/sim/crew.ts (new), src/sim/types.ts (+Gangster.traits,
  +Family.ties, type-only imports), src/sim/state.ts (starting crew traits + ally tie),
  src/sim/commands.ts (recruit rolls traits + trait upkeep; extort + Brutal bonus),
  src/sim/conflict.ts (familyStrength + Brutal; removeWeakest propagates a death to allies),
  src/sim/economy.ts (familyExpenses − Connected discount), src/sim/law.ts (resolveLaw − Cool
  heat relief), src/sim/gangsters.ts (resolveLoyalty via memberLoyaltyDelta + Loyal desert
  resist), src/sim/mapEconomy.ts (deposit → 'score' morale), src/sim/interception.ts (ambush →
  'robbed' morale), src/sim/index.ts (exports), src/scenes/IsoScene.ts (crew roster [K]); new
  tests/crewTraits.test.ts; updated tests/gangsters.test.ts (recruit upkeep incl. trait modifier),
  tests/onboarding.test.ts (Brutal +0.08 on the starting-crew extort math). tick/applyCommand
  settlement logic unchanged.

═══ CREW TRAITS & LOYALTIES API — THE RTS-14 PURE CONTRACT ═══
- STATE (additive, default-absent): Gangster.traits?: Trait[] · Family.ties?: CrewTie[].
- TRAITS (src/sim/traits.ts): Trait = brutal|loyal|greedy|cool|green|connected; TRAIT_DEFS,
  ALL_TRAITS; hasTrait/gangsterTraits; traitUpkeepModifier; crewExtortBonus(family,districtId) ·
  crewCombatBonus(family) · crewHeatRelief(family) · crewBribeDiscount(family);
  memberLoyaltyDelta(g,cashPositive,heat) · desertionChanceFactor(g); rollTraits(idKey) (seeded,
  cursor-safe). Magnitudes exported (BRUTAL_*, COOL_HEAT_RELIEF, CONNECTED_BRIBE_DISCOUNT, …).
- CREW (src/sim/crew.ts): LoyaltyEvent = paid|unpaid|score|robbed|memberKilled|overworked +
  LOYALTY_EVENT_DELTA; loyaltyStatus(loyalty) → loyal|wavering|disloyal; applyCrewLoyaltyEvent
  (family,event) (crew-wide, Loyal-shielded) · adjustMemberLoyalty(family,id,delta) (+ties) ·
  propagateTie / propagateMemberLoss · tiesOf · crewReadout(family) → CrewMemberReadout[]
  (name/skill/loyalty/status/traitLabels/upkeep/assignment/ties, most-disloyal-first).
- Decisions: trait assignment uses a per-id sub-Rng so it is deterministic AND never advances the
  shared cursor (the "starting-crew-style" cursor-safety the brief required); all modifiers are
  additive no-ops without traits/ties so the economic settlement is untouched and all prior deep-
  equals hold; loyalty events are wired in the systems that already fire them (deposit/ambush/
  conflict/pay) without changing their core math; 'overworked' is modelled in the event table for
  future wiring. Crew panel is human-validated; every modifier, event, and tie is asserted.
- Gate: typecheck ✅  build ✅  test ✅ (477 total; +19 crewTraits: rollTraits seeded/distinct/
  no-greedy+green/deterministic; every modifier no-op-without-trait + correct-with; familyStrength/
  familyExpenses/resolveLaw wiring; loyalty events move morale + clamp + Loyal-shield; loyaltyStatus
  bands; ties propagate ally/rival one-hop; conflict death shakes a tied ally; crewReadout shape).
  gangsters.test recruit-upkeep retuned; onboarding starting-crew extort retuned (+0.32). /src/sim
  Phaser-free invariant green; the 458-test base otherwise untouched and all green.
- Commit: rts14: Crew Traits & Loyalties — green
