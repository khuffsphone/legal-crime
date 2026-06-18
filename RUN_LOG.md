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
