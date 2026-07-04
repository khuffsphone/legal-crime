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

## RTS-15 — Visual Elevation: Fedora Noir — GREEN  (2026-06-20)
- Summary: Elevated the procedural art to the documented Fedora-Noir visual spec — presentation/
  render only; no economic settlement or mechanic logic touched, no raster assets (all vector/
  procedural). First ingested the spec: /docs/VISUAL_DIRECTION.md committed as the visual bible
  (the brief's paste placeholder arrived EMPTY, so it was distilled faithfully from the spec
  embedded inline in the brief — noted in the doc's provenance header). Then implemented against it.
  1. EXACT PALETTE — new PURE, unit-tested src/scenes/visualSpec.ts encodes the spec's named hex
     ROLES (soot #16130f, brickDark #5a241b, brickLight #7e3326, brass #b8862b player/money, rival
     #9e1b1b identity, danger #e11d1d motion-only, cashGreen #4e8b5a) + motion timings + thresholds.
     cityArt.PAL was remapped to these exact hexes, recolouring the whole world/figures at once
     (~90% soot+brick). The two reds are SPLIT by role — rival-red is static identity, danger-red
     is motion only (muzzle flash, klaxon, ambush, rejected marker); brass/rival/danger/cashGreen
     are state-only. CANON's NOIR_PALETTE (theme.ts, locked + tested) is preserved for HUD text.
  2. THE SIX JUICE BEATS — The Lean (brick-dust puffs + a thumping "NOW PAYING" stamp + coin
     burst), Banked (greenbacks arc to the HQ vault + a 90ms 1.04x camera punch + satchel deflate),
     Cash Trail (greenback breadcrumbs dropped ~5/sec, fading over 2s), Ambush (danger-red muzzle
     flash + 3× 6px shakes + 7 grab-able banknotes scattering), Federal Ladder (bar via
     federalBarColor reddening at 50/70/85 + a pulsing danger-red KLAXON vignette at tier 3),
     Day↔Night veil (kept). New baked effect textures: greenback, banknote, soft radial glow.
  3. CREW/LOYALTY VISUALS — the [K] roster now renders per-member animated rows by loyalty band:
     loyaltyBob 2.4s (loyal), waverRoll 3.2s (wavering), disloyalPulse 1.8s (disloyal); a 1.2s
     crimson wrongedFlash border when a member's loyalty drops; and the MUTINY TELEGRAPH — a
     "<NAME> READY TO BETRAY — ACT NOW (settles in M:SS)" banner with a real countdown (the
     defection resolves at the next week settlement), earned like the run-2 threat telegraph.
  4. STATE INDICATORS — selection ring (brass, ≥1.3s pulse), the protection "%" coin spins on
     MOTION.coinSpin with a soft brass glow, the cash satchel scales in 3 tiers (satchelTier), the
     two-stage danger ring (amber threatened → danger-red ambush via dangerStageColor), move
     markers brass (valid) / danger (rejected).
  5. GEOMETRY/MOTION DISCIPLINE — two flat tones per face + hard edges retained; glows are soft
     radial-alpha textures only; motion budget honoured (only ambush/klaxon run fast ≤1.1s, every
     idle loop ≥1.3s — asserted in the visualSpec tests).
- Files: docs/VISUAL_DIRECTION.md (new, committed separately as `docs: add Fedora Noir visual
  bible`), src/scenes/visualSpec.ts (new, pure + tested), src/scenes/cityArt.ts (spec PAL +
  greenback/note/glow textures), src/scenes/IsoScene.ts (palette routing, the six beats, crew
  animations + mutiny telegraph + klaxon, satchel tiers, two-stage ring); new tests/visualSpec.test.ts.
  No /src/sim changes — sim Phaser-free invariant intact.

═══ VISUAL SPEC API — THE RTS-15 PURE CONTRACT (src/scenes/visualSpec.ts) ═══
- SPEC palette roles (exact hexes) + STATE_ONLY_ROLES + hexNum. MOTION timings (loyaltyBob 2400,
  waverRoll 3200, disloyalPulse 1800, wrongedFlash 1200, coinSpin 2600, cashTrail 2000, bankedPunch
  90, leanBeat 800, dayNight 9000). DANGER_LOOP_MAX_MS 1100 / IDLE_LOOP_MIN_MS 1300; motionIsDanger.
  factionColor · satchelTier (≥250→2, ≥600→3) · dangerStageColor (ambush→danger, else brass) ·
  federalBarColor (tier 0/1/2/3) · loyaltyMotion(status).
- Decisions: the visual spec is a PURE module in /src/scenes (Phaser-free, node-testable like
  theme/assets) so the palette rules ("state-only", "two reds never share a role") and motion
  budget are unit-asserted; cityArt.PAL remaps to the spec hexes so one change recolours every
  figure/building/tile; NOIR_PALETTE (CANON, theme.test-locked) stays for text. All rendering is
  human-validated; the spec module is fully asserted.
- Gate: typecheck ✅  build ✅  test ✅ (488 total; +11 visualSpec: exact role hexes; two-reds-
  distinct; state-only roles ≠ world tones; hexNum; motion budget danger-vs-idle + all loyalty
  loops idle-slow; factionColor; satchelTier bands; dangerStageColor stages; federalBarColor tiers;
  loyaltyMotion). /src/sim Phaser-free invariant green; the 477-test base untouched and all green.
- Commit: rts15: Visual Elevation — Fedora Noir — green

## RTS-16 — The Living City & The Turf War — GREEN  (2026-06-20)
- Summary: Turned the loop into a real-time crime STRATEGY contest — a bigger contested city,
  active rival families that fight for it, real territorial control/conflict, the three tensions
  interlocked, and a readable contest trajectory. Built as ONE interlocking web of NEW PURE
  modules in /src/sim, all unit-tested with seeded determinism; the economic settlement
  (tick/applyCommand) is WRAPPED not modified, and the whole layer is a NO-OP on the legacy
  5-district map (it activates only on the big city), so all 488 prior tests stayed green.
  1. A BIGGER, CONTESTED CITY (src/sim/city.ts) — a 9-district 3×3 city with identity: per-
     district wealth (1..5), heat-sensitivity, Chicago archetype (Dockside…The Loop…The Levee),
     and orthogonal ADJACENCY (the fronts families push along). districtIdentity DERIVES values
     for the legacy map, so nothing breaks. Opt-in via createInitialState({ bigCity }) — default
     stays the 5-district map. buildMapLayout now wraps districts into a 2nd column (back-compatible
     so districts 0–4 keep their exact tiles + tests).
  2. ACTIVE RIVAL FAMILIES (src/sim/strategy.ts) — a real-time, DETERMINISTIC strategic AI on a
     strategic clock (STRATEGY_PULSE_SECONDS, ~5 moves/week). Each pulse every living rival pushes
     PRESENCE into its best reachable target — richest + weakest along adjacency — EXPANDING into
     open ground and CONTESTING your turf when you leave it undefended (an undefended, weakly-held
     player block is the juiciest target of all). Every move is TELEGRAPHED (telegraphedPushes = the
     exact next move) so the player can respond, like the run-2 threat telegraph. A crushed rival
     (no turf/crew/rackets/cash) FALLS out of the contest (familyIsFallen → alive=false).
  3. TERRITORIAL CONTROL & CONFLICT (src/sim/territoryWar.ts) — pushPresence raises control and
     erodes the defender, BLUNTED by guarding muscle (defense matters). When a push DISPLACES a
     holder, the capture bites: the loser's rackets are SEIZED by the captor and their fronts are
     BROKEN (lost protection income). exposedDistricts surfaces where you're overextended — the
     logistics read. Losing a block hurts (lost income + rackets), so limited crew = a real choice.
  4. THE INTERLOCK — the three tensions now bite together: limited crew across offense/defense/
     collection (guards blunt rival pushes AND escort collectors AND give extort muscle — you can't
     do all three); economy under heat (richer districts are worth more but the Loop is heat-
     sensitive; launder-vs-hold while expanding); and the canon four channels matter to the WAR —
     City Hall (politicians) bribes DETER rivals from pushing your turf (POLITICIAN_DETERRENCE),
     while the Bureau still shields the federal ladder. Grab/defend turf vs the Feds is now a live
     tradeoff.
  5. A CONTEST WITH STAKES (src/sim/contest.ts) — cityStanding scores every family (wealth-weighted
     turf + rackets + war chest + muscle), ranks them, and reads the player's trajectory: dominant /
     ahead / contested / behind / crushed / eliminated, with a clipped noir line. allRivalsCrushed +
     the canon flow.ts win condition give the war a real direction to push on.
  Driver: updateAndObserve now also advances the turf war (advanceStrategy) and returns its events;
  district-captured / family-fallen are projected into The Wire. IsoScene renders the big city with
  per-district nameplates recoloured by holder (brass you / rival-red / fog neutral), a turf-war
  STANDINGS panel (trajectory + per-family blocks/power), a rival-PRESSURE telegraph banner ("MORETTI
  IS PUSHING INTO THE LOOP — DEFEND OR GREASE CITY HALL"), and BLOCK LOST/TAKEN beats with a shake.
- Files: src/sim/city.ts, src/sim/territoryWar.ts, src/sim/strategy.ts, src/sim/contest.ts (all new,
  pure), src/sim/types.ts (+District identity/adjacency, +GameState.strategyElapsed), src/sim/state.ts
  (+bigCity 9-district seeding), src/sim/mapEconomy.ts (2-column layout, back-compatible), src/sim/
  realtime.ts (advanceStrategy folded into updateAndObserve; +strategy in ObserveResult), src/sim/
  ledger.ts (+territory/family_fallen incident types), src/sim/constants.ts (+strategy tunables),
  src/sim/index.ts (exports), src/scenes/IsoScene.ts (big-city render, standings panel, pressure
  telegraph, capture beats, district nameplates); new tests/turfWar.test.ts. tick/applyCommand
  settlement logic unchanged.

═══ TURF-WAR API — THE RTS-16 PURE CONTRACT ═══
- CITY: createInitialState(seed, { bigCity }) → 9 districts. districtIdentity(d,index) →
  { wealth, heatSensitivity, archetype }; districtNeighbors; districtValue; isBigCity; CITY_ARCHETYPES.
- TERRITORY: pushPresence(state, familyId, districtId, amount) → { before, after, captured } (erodes
  defender, blunted by muscleInDistrict; displacement seizes rackets/breaks fronts); districtStatus;
  districtsHeld; exposedDistricts; districtIncomeFor.
- STRATEGY (deterministic): targetScore · rivalStrategicTarget · rivalPushAmount · telegraphedPushes
  (the telegraph) · familyIsFallen · resolveStrategicPulse · advanceStrategy(state,dt,pulseSeconds?).
  CONSTANTS: STRATEGY_PULSE_SECONDS 22 · RIVAL_PUSH_BASE 12 · RIVAL_PUSH_PER_STRENGTH 0.4 ·
  POLITICIAN_DETERRENCE 6 · TURF_DOMINANCE 0.6.
- CONTEST: familyPower · cityStanding(state) → { rows, leaderId, playerDominance, trajectory, read } ·
  allRivalsCrushed.
- DRIVER: updateAndObserve(...) → { result, strategy: StrategicEvent, state }.
- Decisions: the entire strategic layer is deterministic (NO RNG) so rivals are fully testable and
  the telegraph is exact; it lives in the real-time WRAPPER (advanceStrategy) so tick is untouched;
  it is gated on adjacency so the legacy map (and every prior test) is unaffected; bigCity/identity/
  strategyElapsed are additive default-safe fields. All systems asserted; scene render human-validated.
- Gate: typecheck ✅  build ✅  test ✅ (507 total; +19 turfWar: 9-district city + identity + adjacency
  + determinism + RNG-neutral default; push/erode/muscle-blunt; capture seizes rackets + breaks fronts;
  districtStatus/exposedDistricts; rival target + telegraph match + City Hall deterrence; rivals expand;
  undefended player block taken; family-fallen; strategic clock fires/legacy-no-op; familyPower +
  trajectory bands + allRivalsCrushed; driver integration captures + ledger territory incidents +
  legacy no-op). /src/sim Phaser-free invariant green; the 488-test base untouched and all green.
- Commit: rts16: The Living City & The Turf War — green

## RTS-17 — The Offensive & The Endgame — GREEN  (2026-06-21)
- Summary: Gave the war a POINT. RTS-16 let you only react and grow; now you take the fight to the
  rivals and can WIN or LOSE the city. Built as NEW PURE modules in /src/sim (offense.ts, endgame.ts)
  plus deterministic escalation in strategy.ts, all wired through the real-time WRAPPER — tick/
  applyCommand's settlement math is untouched, every new field is additive/default-safe, and the
  whole layer is opt-in on the big city, so all 507 prior tests stayed green (now 525).
  1. OFFENSIVE ACTIONS (src/sim/offense.ts, pure; seeded for combat risk) — four EARNED player
     COMMANDS resolved in the wrapper like extort/collect, each gated and each raising the target's
     aggro (→ retaliation):
       • RAID a district — muscle in by force. Costs $500 + heat, needs ≥2 crew + a rival to hit.
         Shoves player presence in (RAID_FORCE + strength/2 → can SEIZE the block) and zeroes the
         defender's takings there; can be REPELLED by guarding muscle (seeded roll), costing a man.
       • SABOTAGE a racket/front — interdict a rival economy. $350 + heat, ≥1 crew, target must earn
         for a rival. A front's protection is BROKEN (extortedBy cleared, takings zeroed); an
         operation is seeded-WRECKED (removed) or torched (uncollected zeroed).
       • ASSASSINATE a rival Don — the decapitating blow. $1500 + heavy heat, needs ≥12 muscle.
         Seeded success vs the rival's strength; on success the HQ takes ASSASSINATE_HQ_DAMAGE 45 and
         may FALL; a botched hit costs you a man.
       • LOCKOUT — sic the Bureau on a rival: pins them for LOCKOUT_DURATION pulses.
  2. THE FOUR CHANNELS UNLOCK OFFENSE — the canon bribery channels gate/empower the bigger moves:
       • The Bench (judges) CUTS raid heat (RAID_BENCH_MITIGATION per point, capped 0.7).
       • City Hall (politicians) buys political COVER on a hit (ASSASSINATE_CITYHALL_COVER, cap 0.6).
       • The Bureau (feds) UNLOCKS the lockout (needs bribes.feds ≥ LOCKOUT_BUREAU_REQ 20).
       • Muscle (crew strength) UNLOCKS assassination (ASSASSINATE_MIN_STRENGTH 12).
     So offense is funded through the economy and earned through the channels you already invest in.
  3. RIVAL RESPONSE & ESCALATION (src/sim/strategy.ts, deterministic) — every attack raises the
     target's AGGRO. On the strategic pulse an aggro'd rival pushes HARDER and targets YOU more
     aggressively (aggro feeds targetScore + rivalPushAmount); an enraged, strong rival STRIKES YOUR
     HQ (RIVAL_HQ_STRIKE_DAMAGE) when aggro ≥ AGGRO_HQ_STRIKE. Aggro decays over time, so a quiet
     spell cools them off. A locked-out rival is FROZEN (skips its pulse) and bled cash + heat while
     pinned. All telegraphed via the standings panel (per-rival HQ% + 🔒 lock state).
  4. WIN / LOSE CONDITIONS (src/sim/endgame.ts, pure) — evaluateEndgame(state) reads the board each
     wrapper step and sets GameStatus:
       • WIN — last family standing (all rivals dead) OR city DOMINANCE (hold ≥ TURF_DOMINANCE 60%).
       • LOSE — your HQ destroyed (hqIntegrity ≤ 0) OR total COLLAPSE (no crew, no cash, no turf —
         bankrupt-and-routed). Mutiny/desertion feed the collapse via the existing crew system.
     Elimination cascades: damageHQ at ≤0 → eliminateFamily (alive=false, logs family-eliminated);
     a 'game-over' event is logged and projected into The Wire.
  5. LEGIBLE & STRATEGIC ENDGAME — rivalWeakness(state) ranks rivals most-vulnerable-first (battered
     HQ + broke + crewless + little turf); weakestRival picks the kill. IsoScene surfaces it: YOUR
     HQ %, each rival's HQ % and lock state, the weakest-target nudge, the [1]raid/[2]sabo/[3]hit/
     [4]lock controls, an "OUR HQ IS UNDER ATTACK" telegraph + shake on a rival strike, and a
     full-screen end-state readout ("YOU TOOK THE CITY" / "THE CITY TOOK YOU") with the game-over line.
  Driver: updateAndObserve now also runs evaluateEndgame and returns endgame: EndgameResult | null
  alongside the strategy events; offense + hq-struck + family-eliminated + game-over are projected
  into The Wire (offense / territory / family_fallen / game_over incident types).
- Files: src/sim/offense.ts, src/sim/endgame.ts (both new, pure), src/sim/strategy.ts (+aggro-driven
  escalation, HQ strikes, lockout freeze/bleed in resolveStrategicPulse; hqStrikes in StrategicEvent),
  src/sim/realtime.ts (+evaluateEndgame folded into updateAndObserve; +endgame in ObserveResult),
  src/sim/types.ts (+Family.hqIntegrity/lockoutTicks/aggro, all optional), src/sim/constants.ts (+raid/
  sabotage/assassinate/lockout/aggro/HQ tunables), src/sim/ledger.ts (+offense incident type + mappings),
  src/sim/index.ts (exports), src/scenes/IsoScene.ts (offense commands [1-4], HQ-strike telegraph,
  endgame overlay, standings panel HQ%/lock/weakest readout); new tests/offensive.test.ts. tick/
  applyCommand settlement logic unchanged.

═══ OFFENSE & ENDGAME API — THE RTS-17 PURE CONTRACT ═══
- OFFENSE (src/sim/offense.ts; seeded for combat): canRaid/canSabotage/canAssassinate/canLockout
  (state,id) → Gate { ok, reason }; resolveRaid → { ok, repelled?, captured? }; resolveSabotage →
  { ok, destroyed? }; resolveAssassinate → { ok, success?, eliminated? }; resolveLockout → { ok }.
- ENDGAME (src/sim/endgame.ts; deterministic): hqIntegrityOf(family) (?? HQ_MAX); damageHQ(state,
  familyId, amount) → { destroyed } (eliminates at ≤0); eliminateFamily(state,family,cause);
  playerCollapsed(state); evaluateEndgame(state) → EndgameResult | null (sets status won/lost);
  rivalWeakness(state) → RivalWeakness[] (most vulnerable first); weakestRival(state).
- ESCALATION (src/sim/strategy.ts): resolveStrategicPulse → { pushes, captures, fallen, hqStrikes }.
  CONSTANTS: RAID_COST 500/HEAT 14/MIN_CREW 2/FORCE 22/BENCH_MITIGATION 0.02/BENCH_CAP 0.7/REPELLED_BASE
  0.15 · SABOTAGE_COST 350/HEAT 9/MIN_CREW 1/DESTROY_CHANCE 0.5 · ASSASSINATE_COST 1500/HEAT 30/MIN_
  STRENGTH 12/HQ_DAMAGE 45/CITYHALL_COVER 0.02/CAP 0.6 · LOCKOUT_COST 800/BUREAU_REQ 20/DURATION 4/
  BLEED_CASH 200/BLEED_HEAT 6 · AGGRO_ON_ATTACK 40/DECAY 8/HQ_STRIKE 60 · RIVAL_HQ_STRIKE_DAMAGE 12 ·
  HQ_MAX 100.
- DRIVER: updateAndObserve(...) → { result, strategy: StrategicEvent, endgame: EndgameResult | null,
  state }.
- Decisions: endgame + escalation are DETERMINISTIC (NO RNG) so win/lose detection and retaliation are
  fully testable; offense uses the serialized state.rngState cursor for combat risk; all of it lives in
  the real-time WRAPPER so tick/applyCommand are untouched; hqIntegrity/lockoutTicks/aggro are additive
  default-safe Family fields; every system asserted; scene render human-validated.
- Gate: typecheck ✅  build ✅  test ✅ (525 total; +18 offensive: gating earned/channel-aware; raid
  cost/heat/Bench-mitigation/force; sabotage break-front + wreck-op; damageHQ + elimination cascade;
  assassinate cost/heat/CityHall-cover/success-or-man-lost; lockout set + freeze + bleed; rival HQ-
  strike escalation; evaluateEndgame win-last-standing/win-dominance/lose-hq/lose-collapse/null-while-
  live; rivalWeakness/weakestRival; driver offense+endgame flow + ledger projection). /src/sim Phaser-
  free invariant green; the 507-test base untouched and all green.
- Commit: rts17: The Offensive & The Endgame — green

## RTS-18 — Cold-Open Fix & Debug Hook — GREEN  (2026-06-21)
- Summary: Two small UAT fixes — an honest, motivating opening read, and a committed QA hook.
  Tune/UI + the hook only; the economic settlement and offense/endgame logic are untouched, and
  /src/sim stays Phaser-free. 525 → 528 green (+3 cold-open assertions).
  1. THE COLD-OPEN FRAMING TRAP (src/sim/contest.ts) — at tick 0 the player holds a 30-control
     home FOOTHOLD in district-0, but holding a block needs CONTROL_HOLD 50, so districtsHeld read
     0 and the trajectory fell to 'behind' → "Take ground or get buried." A player WITH a home base
     read as already losing, with no path shown. Fix is read-only (no settlement/dominance math
     touched): a new 'establishing' trajectory for the FOUNDING phase — you hold no block yet, but
     your home corner is yours to secure AND the city is still wide open (no rival has locked down a
     block either), so the read is "<home> is your corner — build N more control to lock it down."
     It only applies while genuinely founding: the instant a rival secures a block you read honestly
     'behind'/'contested' by power, and a truly stripped player (no foothold, no power) still reads
     'crushed'. New playerHomeFront(state) → { districtId, districtName, control, needed } surfaces
     the exact 30→50 path; cityStanding now carries homeFront, and IsoScene's standings panel shows
     "HOME <district>: 30/50 (+20 to secure)". 'establishing' renders neutral bone (not alarm-red).
  2. THE DEBUG HOOK (src/scenes/IsoScene.ts) — IsoScene.applyDebugScenario(), called once after
     state init. Reads ?debug=turf|mutiny|all[&pulses=N] from the URL and seeds an interesting board
     by exercising EXISTING systems only — turf fast-forwards rival expansion/captures via N
     resolveStrategicPulse() calls (default 8, clamped 1..40) then harvestIncidents(); mutiny starves
     the crew's loyalty so the mutiny telegraph + desertions surface. It changes NO sim rule, is a
     no-op in normal play (no ?debug=) and outside the browser (typeof window guard). Committed as a
     QA tool.
  3. /docs/VISUAL_DIRECTION.md — SKIPPED + FLAGGED: the brain canonical content was not pasted in
     the brief, so the file (incl. its provenance-caveat header) was left untouched to avoid
     guessing at "verbatim". Re-run with the paste to overwrite it.
- Files: src/sim/contest.ts (+'establishing' trajectory, playerHomeFront, HomeFront, homeFront on
  CityStanding), src/sim/index.ts (exports), src/scenes/IsoScene.ts (home-front line in standings,
  applyDebugScenario QA hook), tests/turfWar.test.ts (+3 cold-open assertions). tick/applyCommand +
  offense/endgame unchanged; /src/sim Phaser-free invariant green.
- Gate: typecheck ✅  build ✅  test ✅ (528 total; +3: fresh start reads 'establishing' not
  'behind'/'crushed' with homeFront district-0 30→50; playerHomeFront picks the foothold + clears
  once a block is held; a rival locking down turf ends the founding read). The 525-test base green.
- Commit: rts18: Cold-Open Fix & Debug Hook — green

## RTS-19 — Balance & Economy Pass — GREEN  (2026-06-21)
- Summary: The "make it fun" pass on the UAT-verified foundation. A NORMAL, un-armed match now has
  a satisfying arc — establish → contest → decapitate — paced so offense is EARNED, each attack is
  a costed blow with counterplay (not a steamroll), rivals are a worthy-but-fair opponent, and the
  federal ladder is a real late clock. Primarily TUNING + targeted PURE additions (pacing helpers,
  a rebalanced capture model, a crew cooldown) + HUD legibility. tick/applyCommand core math is
  untouched (wrapped); /src/sim stays Phaser-free; 528 → 542 green (+14 real assertions).

  THE INTENDED MATCH ARC (when a competent player affords each tier):
  • Weeks 0–2 ESTABLISH — extort district-0 fronts (~28–40/wk each), collect, reinvest the $3000
    start into 1–2 rackets (numbers $500→200/wk · speakeasy $1000→400/wk · smuggling $1500→600/wk,
    ~2.5-wk payback, ×N by tier), recruit muscle, expand the home corner 30→50 to HOLD it.
  • ~Weeks 2–4 FIRST BLOOD — once a rival has a racket, SABOTAGE ($350, 1 crew) is the first
    offensive tool. RAID ($500, 2 crew) unlocks the moment you HOLD a block of your own.
  • ~Weeks 4–7 CONTEST — grease The Bureau to 20 → LOCKOUT ($800) pins + bleeds a rival; raid the
    contested borders; defend with guards (they blunt rival erosion); ride the heat.
  • ~Weeks 8–12 DECAPITATE — build to strength ≥12 → ASSASSINATE ($1500, ≈3 hits ≈$4500 + heavy
    heat) under federal pressure; lockouts + raids soften the target; eliminate the Dons or take
    60% of the city for dominance.

  1. ECONOMY→OFFENSE PACING — the four actions are now an UNLOCK LADDER, not all-available-turn-1:
     • SABOTAGE — first/cheapest; needs only 1 crew + $350 + a rival racket to wreck.
     • RAID — needs a SECURED home block (districtsHeld(player) ≥ 1) + 2 crew + $500. NEW gate:
       'secure a home block first' — you establish before you project force. (Stops the turn-1 raid
       a $3000 start used to allow.)
     • LOCKOUT — gated behind The Bureau (feds ≥ 20) + $800 (unchanged, now surfaced).
     • ASSASSINATE — gated behind real muscle (strength ≥ 12) + $1500 (unchanged, now surfaced).
  2. RAID RE-BALANCED (the UAT "3 blocks + an elimination almost instantly" steamroll):
     • RAID_FORCE 22 → 14 — a single raid chips, it doesn't flip a held block in one press.
     • NEW capture model (territoryWar.pushPresence): a TAKEOVER (you actually become the holder)
       seizes the block's rackets; a RAID that only DISPLACES a holder to neutral now DISRUPTS —
       breaks their fronts + scatters their takings (a real economic blow) but does NOT transfer
       ownership. Flipping turf by force is a multi-raid CAMPAIGN. Implemented via a `seizeOnDisplace`
       option (default TRUE preserves the RTS-16 rival/strategy model + all its tests; raids pass
       FALSE). A takeover now seizes from ALL other owners (so a block knocked to neutral first is
       still seized once you finally hold it).
     • OFFENSE_COOLDOWN_SECONDS = 14 (NEW) — a shared crew cooldown after ANY offence; the gates
       refuse ('crew regrouping (Ns)') while it bleeds down in the real-time wrapper, so you cannot
       chain several heavy hits into an instant board flip.
     • ASSASSINATE_HQ_DAMAGE 45 → 40 — still ~3 strikes to topple a Don, a touch more deliberate.
  3. DIFFICULTY ARC & RIVAL BALANCE — left-alone rivals EXPAND across the city (free territorial
     pulses) and build economy (one AI action/week), but an idle player has room: guards blunt the
     weak early pushes to ZERO erosion, so your home holds while defended; a new sim test asserts
     rivals grow their footprint + secure ground over 6 weeks WHILE the idle player stays alive with
     crew intact (worthy, not a turn-1 tyrant). The capture rebalance also makes rival pushes onto
     your turf less swingy. Rival constants left as-is (verified fair empirically rather than
     blind-tuned).
  4. ECONOMIC DEPTH — the economy already carries the arc (district-wealth-scaled fronts; 4 racket
     kinds; the 3-tier upgrade growth curve with ~2.5-wk paybacks; the launder-fee-vs-heat timing
     trade; collection risk). Rather than feature-sprawl, this pass makes reinvestment MATTER (the
     pacing gates force you to build before you strike) and makes the growth LEGIBLE (below).
  5. FEDERAL CLOCK — verified as real late pressure: offense draws heat (raid 14 · sabotage 9 · hit
     30, before channel mitigation), a fat dirty hoard adds exposure points, and the 50/70/85 ladder
     bites; The Bureau buys exposure relief. A test asserts a hot/dirty/aggressive posture crosses
     the tier-1 threshold and that feds-bribe pulls it back.
  6. LEGIBILITY (new pure module src/sim/pacing.ts; HUD) — offenseReadout(state) gives every action's
     live cost + heat (AFTER the channel mitigation you've bought) + availability + the gate reason;
     matchPhase(state) reads establish / contest / endgame; playerWeeklyNet(state) projects the
     net/wk. The HUD now shows a "Net ±$/wk" line and a right-side OFFENCE BOARD (phase header +
     per-action `✓/✗ [key] Label $cost +heat🔥 (reason)`), so the player can see what they can
     afford, what it costs in cash AND heat, and why a move is locked.
- Tuned values (before → after): RAID_FORCE 22 → 14 · ASSASSINATE_HQ_DAMAGE 45 → 40 ·
  OFFENSE_COOLDOWN_SECONDS (new) 14 · canRaid +held-base gate · all gates +cooldown gate · capture
  model: displacement-only-disrupts-for-raids / takeover-seizes-from-all.
- Files: src/sim/constants.ts (raid/hit tuning + cooldown), src/sim/types.ts (+GameState.offenseCooldown,
  optional/default-safe), src/sim/state.ts (init 0), src/sim/realtime.ts (bleed cooldown in update),
  src/sim/territoryWar.ts (seizeOnDisplace + applyDisruption + takeover-seizes-all capture model +
  PushResult.disrupted), src/sim/offense.ts (offenseReady cooldown gate + held-base raid gate + arm
  cooldown + raid disrupt-not-seize), src/sim/ledger.ts (+district-disrupted incident), src/sim/pacing.ts
  (NEW: offenseReadout/matchPhase/playerWeeklyNet), src/sim/index.ts (exports), src/scenes/IsoScene.ts
  (net/wk HUD line + offence board + phase). New tests/balancePass.test.ts; updated tests/offensive.test.ts.
- Gate: typecheck ✅  build ✅  test ✅ (542 total; +12 balancePass: tuned-constant values; the unlock
  ladder sabotage→raid(held)→lockout(Bureau)→assassinate(muscle); the crew cooldown blocks + bleeds;
  raids campaign-to-seize (no single-raid steal); rivals expand-but-don't-wipe-an-idle-player; federal
  exposure crosses a warning tier + Bureau relief; matchPhase/offenseReadout/playerWeeklyNet readouts.
  +2 offensive: cooldown-refuses-next-offence, single-raid-softens-not-seizes). /src/sim Phaser-free
  invariant green; tick/applyCommand settlement untouched; the 528-test base green.
- Commit: rts19: Balance & Economy Pass — green

## RTS-20 — Player Verbs: Expand & Recruit — GREEN  (2026-06-21)
- Summary: Surgical fix for an un-armed UAT blocker — the player was STRUCTURALLY STUCK in
  ESTABLISH. RTS-19 gated RAID behind "secure a home block first" and ASSASSINATE behind "need 12
  muscle", but there was no keybound EXPAND-CONTROL or RECRUIT verb, so those gates could NEVER be
  cleared by a human: the player held 0 blocks forever and the whole offensive arc stayed locked.
  The expandControl + recruitGangster sim commands already existed (the rival AI uses them); this
  round EXPOSES them to the player. No new economic/combat logic, no re-tuning — wiring + legibility
  + the committed QA injectors. tick/applyCommand untouched; /src/sim Phaser-free; 542 → 547 green.
  1. [5] EXPAND (commandExpand) — invokes the existing `expandControl` for the player on the home
     corner that still needs securing (pacing.expandTargetDistrictId → playerHomeFront's district,
     else the strongest foothold). Real cost ($300/EXPAND_COST, +10 control + guarding muscle via the
     unchanged command). When the block crosses CONTROL_HOLD it's HELD → a "BLOCK HELD!" beat + a
     status line "… is YOURS — RAID is unlocked". This is the move that leaves ESTABLISH.
  2. [6] RECRUIT (commandRecruit) — invokes the existing `recruitGangster` for the player. Real cost
     ($400/RECRUIT_COST), seeded skill/loyalty/traits (the AI-tested path). Status reads the muscle
     trajectory "strength X/12 toward a hit"; at ≥12 ASSASSINATE unlocks.
  3. EXISTING commands only — no forked logic. Both verbs surfaced on the right-side BUILD BOARD
     (new pacing.buildReadout → per-verb `✓/✗ [key] Label $cost — effect`, e.g. "secure Dockside
     (+20 to HOLD → unlocks RAID)" and "muscle 6/12 (toward ASSASSINATE)"), drawn above the offence
     board under the match-phase header. Also wired into the status-bar hint, the [H] legend (a new
     "TAKE THE CITY" block + the [5]/[6] controls line), and the onboarding 'grow' objective (now
     "YOU'RE EARNING — NOW TAKE GROUND" naming [R]/[G]/[5]/[6] then [1]–[4]).
  4. QA INJECTORS committed (Cowork) — applyDebugScenario extended, all gated + no-op in normal play
     and outside the browser, NO sim-rule change (pure state seeding / existing systems):
       • ?arm=1     — a funded, established, hit-ready outfit ($12k + $3k dirty, 3 made men guarding
         the home, district-0 HELD at 60, The Bureau greased to 20) so QA drives the full arc at once.
       • ?debug=win — topples every rival (alive=false, HQ 0); the wrapper's evaluateEndgame resolves
         a WIN next frame. ?debug=lose — razes the player HQ → a LOSS next frame.
       • (alongside the existing ?debug=turf|mutiny|all[&pulses=N].)
- Files: src/sim/pacing.ts (+buildReadout/expandTargetDistrictId/isNearlyHeld, pure), src/sim/index.ts
  (exports), src/sim/onboarding.ts ('grow' detail names the new verbs), src/scenes/IsoScene.ts
  (commandExpand [5] + commandRecruit [6] + keybinds + build board + status hint + legend + the
  ?arm=1 / ?debug=win|lose QA injectors). New tests/playerVerbs.test.ts.
- Gate: typecheck ✅  build ✅  test ✅ (547 total; +5 playerVerbs: expandControl raises the home
  block 30→HOLD and UNLOCKS canRaid + leaves ESTABLISH; recruitGangster climbs strength to ≥12 and
  UNLOCKS canAssassinate; buildReadout shows cost + unlock effect and updates once secured / hit-ready;
  the full establish→contest→endgame ramp under the player's own commands). /src/sim Phaser-free
  invariant green; tick/applyCommand + economy/heat/rival balance untouched (next pass); the 542 base green.
- Commit: rts20: Player Verbs — Expand & Recruit — green

## RTS-21 — Economy & Pacing Balance — GREEN  (2026-06-21)
- Summary: RTS-20 unblocked the verbs, but the structural wall became an ECONOMIC one — the un-armed
  UAT flatlined to Clean $0 after ~$900 to expand home + one raid, crew stuck at 2 (ASSASSINATE
  muscle-locked), while rivals raced to ~5 blocks by week 2. This pass makes a NORMAL un-armed match
  WALK THE FULL ARC and stay winnable while keeping pace: build verbs reachable in rhythm, a rival
  early-expansion DAMPENER that ramps to a real fight, and "when can I afford it" legibility. Pure
  TUNING + pure helpers + HUD; tick/applyCommand core math untouched; /src/sim Phaser-free; system
  purity honored (no Accountants/16:1/soup-kitchens; four channels + 50/70/85 ladder intact).
  547 → 555 green.

  INTENDED PACING (a competent un-armed player, ~2-min weeks):
  • Wk 0–2 ESTABLISH — extort district-0 fronts, collect, reinvest the $3500 start; [5] EXPAND
    HOLDS the home block in ONE $250 push (30 + 15 + 6 muscle = 51) → unlocks RAID; open a $500
    racket; [6] RECRUIT ($300) toward muscle. Net: 3500 − 250 − 500 − 300 = $2450 still in hand.
  • ~Wk 2–4 FIRST BLOOD — SABOTAGE ($350) the moment a rival has a racket; RAID ($500) the borders.
  • ~Wk 4–7 CONTEST — grease The Bureau → LOCKOUT ($800); recruit toward strength 12.
  • ~Wk 7–12 DECAPITATE — strength ≥ 12 → ASSASSINATE ($1500, ≈3 hits) under federal pressure;
    lockout + raids soften; eliminate the Dons or take 60% for dominance.

  1. BUILD VERBS REACHABLE IN RHYTHM (tuning):
     • EXPAND_COST 300 → 250, EXPAND_BASE_GAIN 10 → 15 — the home corner 30→50 now HOLDS in ONE
       cheap expand with starting muscle (was ~$900 over multiple), keeping cash for the ladder.
     • RECRUIT_COST 400 → 300 — muscle toward the 12 a hit needs no longer strands the crew at 2.
     • STARTING_CASH 3000 → 3500 — +$500 covers expand + a first racket + a recruit without
       flatlining before income ramps.
     (Chose FLAT cheaper costs over per-count curves to keep applyCommand untouched.)
  2. EARLY RIVAL PACE (pure helper, no constant churn): new expansionRamp(tick) =
     min(1, 0.25 + 0.25·tick) throttles rival territorial PUSHES — week 0 ≈ 0.25×, full force by
     week 3 — applied via rampedPushAmount(state, rival) in BOTH resolveStrategicPulse and
     telegraphedPushes (so the warning stays honest). Effect (measured, seeds 1/2/3/7/11): OUTWARD
     grabs beyond the rivals' two home corners fall to ≤2 by wk2 (was the ~5-block runaway) and
     climb to 5–6 by wk5 — slow opening, real fight mid/late. Never dampens the player.
  3. SMOOTHED ARC — each phase is affordable in turn (see pacing milestones above); the cheaper
     verbs + runway + slower early rivals remove the mid-game stall.
  4. LEGIBILITY — new weeksToAfford(state, cost) (0 in hand · N weeks at current net · null when net
     ≤ 0); surfaced as an ETA tag on the build + offence boards (`✗ [1] Raid $500 ~3wk`,
     `(income-)`), so the player can see WHEN the next tier comes within reach, not just that it's
     locked.
  INJECTOR STATUS: the QA injectors (?arm=1 / ?debug=win / ?debug=lose, alongside ?debug=turf|mutiny|
  all) are ALREADY committed at f07667d (verified via `git show HEAD:src/scenes/IsoScene.ts`) — the
  Cowork "not committed" report is incorrect; no action needed, no re-commit.
- Tuned values (before → after): EXPAND_COST 300 → 250 · EXPAND_BASE_GAIN 10 → 15 · RECRUIT_COST
  400 → 300 · STARTING_CASH 3000 → 3500 · NEW expansionRamp (rival early-push 0.25× → 1.0× by wk3,
  applied to pulse + telegraph) · NEW weeksToAfford + board ETA. No offense/heat/federal/racket
  values changed.
- Files: src/sim/constants.ts (verb/cash tuning), src/sim/state.ts (STARTING_CASH), src/sim/strategy.ts
  (expansionRamp + rampedPushAmount; pulse + telegraph use it), src/sim/pacing.ts (weeksToAfford +
  affordEtaWeeks on both readouts), src/sim/index.ts (exports), src/scenes/IsoScene.ts (board ETA tag).
  New tests/economyPacing.test.ts; updated tests/balance.test.ts, tests/mapEconomy.test.ts,
  tests/turfWar.test.ts, tests/ai.test.ts to the new values with real assertions.
- Gate: typecheck ✅  build ✅  test ✅ (555 total; +8 economyPacing: the tuned values; one-expand home
  HOLD; build-then-not-flatlined-to-$0; expansionRamp curve; week-0 push throttled vs full mid-game;
  rivals ≤2 outward grabs by wk2 then ≥4 by wk5; weeksToAfford contract; boards carry the ETA. Updated
  4 constant-asserting tests to the new values). /src/sim Phaser-free; tick/applyCommand untouched;
  no Gangsters-conflation terms; the 547 base green.
- Commit: rts21: Economy & Pacing Balance — green

## RTS-22 — Readability, Controls & Extort-First Economy — GREEN  (2026-06-21)
- Summary: The human playtest's headline finding — "very difficult to read, camera, controls…
  extremely difficult to follow" — was the wall, not balance. This batch leads with UX (a real
  camera, readable board, the original's mouse scheme) and re-anchors the early game to EXTORT-FIRST
  (war later), fixing the rts21 poverty/heat trap by changing the SHAPE. Camera/input/render are
  Phaser-side in the scene; the temp-shutdown, automated routes, and pacing logic are PURE in
  /src/sim, unit-tested. tick/applyCommand core math untouched; /src/sim Phaser-free; system-pure
  (four channels + 50/70/85 ladder kept; no Gangsters conflations). 555 → 565 green (+10 new sim
  assertions; 3 ramp tests updated to the new curve).
  1. A REAL CAMERA (the #1 blocker) — WASD + arrow PAN, click-DRAG pan, mouse-wheel ZOOM eased
     toward a target for smoothness (wider range MIN_ZOOM 0.45→0.30 so the whole 9-district city
     reads), and [F] CENTRE-ON-SELECTION (smooth pan). The view now opens framed on the player's
     home neighbourhood (homeFocusPoint) instead of the map centre.
  2. READABLE RENDERING — every business gets a coloured ground ALLEGIANCE PLATE read at a glance:
     fog = un-shaken · brass = yours-paying · rival-red (#9E1B1B static identity) = a rival's · dark+
     danger-edge = SHUT DOWN. The selection ring is now brass + thicker + pulsing. The hover tooltip
     names the shop's state AND the right-click affordance ("right-click → EXTORT · ATTACK").
  3. MOUSE CONTROLS (the original's scheme) — LEFT-CLICK a thug to select (SHIFT-click multi-select);
     RIGHT-CLICK a storefront → a context menu with the two moves on an un-owned business, EXTORT
     (send the selected thug, attempt the shakedown) or ATTACK (temp-shutdown); RIGHT-CLICK the
     street → move. Menu click-handling is centralised in the scene pointerup (race-free). The
     keybind accelerators still work.
     • ATTACK / temp-shutdown (src/sim/interdiction.ts, pure): resolveAttack sets shutdownTicks =
       ATTACK_SHUTDOWN_WEEKS (3), scatters the pending take, draws ATTACK_HEAT (6); businessAccrual
       returns 0 while shut (so tick settlement is untouched — a shut business just earns nothing);
       accrueUncollected decrements the timer; it recovers after N weeks. businessActions(state,id,
       fam) drives the menu (EXTORT/ATTACK gates).
  4. AUTOMATED COLLECTOR ROUTES (src/sim/routes.ts, pure) — [T] sets a route over all your protected
     businesses; a collector cycles them automatically (gather → bank at HQ → loop), removing the
     manual-collect tedium. The SIGNATURE BOTTLENECK is kept: a route collector carrying cash is
     STILL interceptable/robbable (resolveInterceptions acts on it exactly like a manual run — a test
     proves a hostile enforcer robs it mid-route). The drawn route + a HUD status ("ROUTE: N stops ·
     banking $X · guard it!") make it legible. Opt-in — advanceRoutes is a no-op without a route, so
     prior behaviour is byte-identical.
  5. EXTORT-FIRST RE-ANCHOR (shape, not just constants) — EXTORTION BREADTH: the big city now seeds a
     NEIGHBOURHOOD of cheap fronts per district (rng 2–4 → 4–7), so the early economy grows by
     extorting MORE low-heat storefronts (+ bribing The Beat + recruiting), not by warring over one
     poor block. Rivals are dampened FURTHER and BUILD THEIR OWN economy early: expansionRamp eased
     (0.25+0.25·wk, full by wk3) → (0.15+0.11·wk, full by ~wk8), AND targetScore now scales the
     appetite for the player's turf by that ramp (+ a neutral-ground preference early), so rivals
     EXPAND INTO OPEN GROUND first and WAR EMERGES ~wk7+. RAID stays a war-phase tool (it's correctly
     too weak to seize alone). Validated by a harness: a competent extort-first player keeps a LOW-
     HEAT (12–23 early) self-funding economy, holds home with a growing crew, and survives where the
     rts21 racket-first player got federally busted by ~wk9; rivals go 1→3→6→8 blocks (build → war).
  6. LEGIBILITY — the onboarding objective now teaches the extort-first loop ("EXTORT THE
     NEIGHBOURHOOD" → "[T] set a COLLECTION ROUTE … guard it" → recruit/expand/grease → war later);
     the legend rewritten around CAMERA / MOUSE / EXTORT-FIRST; the status hint + HUD route line +
     plate colours + tooltip affordances surface the new systems.
- Tuned/added values: MIN_ZOOM 0.45→0.30 · PAN_SPEED 600→720 · ZOOM_STEP 0.12 (new) · bigCity fronts
  rng(2,4)→rng(4,7) · expansionRamp 0.25+0.25t → 0.15+0.11t (war by ~wk8) · targetScore player-turf
  appetite scaled by the ramp (+ early neutral preference) · ATTACK_SHUTDOWN_WEEKS 3 / ATTACK_HEAT 6
  / ATTACK_MIN_CREW 1 (new). No tick/applyCommand settlement math changed.
- Files: NEW src/sim/interdiction.ts (extort/attack + temp-shutdown), src/sim/routes.ts (automated
  routes); src/sim/economy.ts (businessAccrual 0 while shut + isShutDown), src/sim/collection.ts
  (decrement shutdown), src/sim/types.ts (Business.shutdownTicks, GameState.routes, CollectionRoute),
  src/sim/movement.ts (route fields on MovableUnit), src/sim/mapEconomy.ts (skip route collectors in
  processCollectorArrivals), src/sim/strategy.ts (re-anchored ramp + targetScore), src/sim/state.ts
  (front breadth), src/sim/onboarding.ts (extort-first objective), src/sim/index.ts (exports);
  src/scenes/IsoScene.ts (camera, plates, right-click menu, routes UI, legend, HUD). New
  tests/rts22.test.ts; updated tests/economyPacing.test.ts + tests/turfWar.test.ts to the new ramp.
- Gate: typecheck ✅  build ✅  test ✅ (565 total; +10 rts22: extortion breadth; extort/attack gates;
  temp-shutdown produces-nothing-then-recovers + tick-untouched; routes gather+bank+loop; routes
  STILL interceptable; routes opt-in no-op; extort-first rivals leave the player alone early & covet
  turf only in the war phase; earningBusinesses read). /src/sim Phaser-free invariant green; no
  Gangsters conflations; the 555 base green.
- Commit: rts22: Readability, Controls & Extort-First Economy — green

## RTS-23 — HUD/UI Elevation & Camera Polish — GREEN  (2026-06-21)
- Summary: Took the interface from "works" to legible, characterful, RTS-grade — Gangsters' depth +
  City of Gangsters' clarity + Legal Crime's 1920s noir. All Phaser-side render/camera/input; NO sim
  logic added, so tick/applyCommand untouched and the 565-test base stands (HUD reads existing pure,
  already-tested selectors: federalExposure/fedWarningTier, playerWeeklyNet, matchPhase, routeStatus,
  crewReadout). /src/sim Phaser-free; four channels + 50/70/85 ladder kept; no Gangsters conflations.
  NOTE: UX_UI_DIRECTION.md did not exist and no HUD spec was pasted — built to the brief's inline
  anatomy and CREATED docs-style UX_UI_DIRECTION.md as the record (flagged).
  A) RTS-22 NIT FIXES (done first):
     1. ZOOM-TO-CURSOR — the wheel now captures the world point under the cursor and the eased zoom
        keeps it pinned (cam.getWorldPoint re-anchor each frame), so zooming no longer shoves the
        city into the left third. (was: anchored to screen-centre.)
     2. [Z] FRAME-CITY — one press fits + centres all 9 districts (computes the iso bounds from the
        four map corners, sets a clamped zoom with margin, centres).
     3. ISO HIT-TEST — businessAtScreen() makes a right-click/hover hit a building's BASE TILE even
        when you click its drawn ROOF (tests the base tile, else any building whose column contains
        the point; frontmost wins). Used for the right-click menu AND the hover tooltip.
     4. PROMINENT ROUTE PILL — a framed status pill: "◆ ROUTE · N stops · BANKING $X · ⚠ ROB-RISK /
        route clear", reddening + pulsing when the route collector is in danger.
  B) HUD ELEVATION (art-deco brass frames via a shared decoFrame helper; every number labeled +
     direction-aware + hover-inspectable):
     • TOP BAR — labeled cells CLEAN $ / DIRTY $ (warns when hoard is fat) / NET ±/wk (green or
       danger by sign) / a LABELED HEAT METER vs the 50/70/85 ladder (fill = exposure, threshold
       ticks, ▲/▼/◆ direction, "RAID AT 85 — BUST IMMINENT" caption) / CREW / WEEK + countdown, a
       PHASE chip (ESTABLISH/CONTEST/ENDGAME), and a week-progress sliver.
     • THE FOUR CHANNELS as labeled DIALS — name · level $X/wk · a pip ladder · what each concretely
       BUYS (The Beat→fewer raids · The Bench→survive a bust/−raid heat · City Hall→heat cools/hit
       cover · The Bureau→fed shield/unlocks lockout) · the [G] bump.
     • CONTEXT CARD — the selected thug's card (name · skill · loyalty/status · traits) + its valid
       verbs (right-click a shop → EXTORT/ATTACK).
     • THE WIRE — reframed as the single clear alert feed (framed, severity-coloured); its title
       pulses "◂ NEW" on a fresh danger/warning alert.
     • HOVER EXPLAINS — every top-bar cell + channel + route pill registers a screen-space region
       whose plain-English explanation shows on hover (the anti-Gangsters fix). The reflow moved the
       Wire/objective/standings/banners below the full-width top bar.
  C) AUDIO-FEEDBACK SEAMS — a single discrete signalBeat(kind) hook (a future SFX/VO layer reads it)
     fired at each major beat (extort confirm, cash banked, route ambush, attack, phase change),
     plus detectHudBeats() that pulses the Wire on any new danger/warning incident and a centred
     phase-change banner ("THE WAR IS ON — DECAPITATE A RIVAL" etc.) — discrete visual beats audio
     can hook even though no audio ships now.
- Files: src/scenes/IsoScene.ts (camera zoom-to-cursor + frame-city + businessAtScreen; the whole
  elevated HUD — top bar / heat meter / channel dials / route pill / context card / Wire frame +
  pulse / hud-region hover / signalBeat + phase beats; legend + status hint). NEW UX_UI_DIRECTION.md.
  No /src/sim changes.
- Gate: typecheck ✅  build ✅  test ✅ (565 — unchanged; HUD/camera are render-only, no new sim
  logic to assert; the existing pure selectors the HUD reads are already covered). /src/sim
  Phaser-free; no Gangsters conflations.
- Commit: rts23: HUD/UI Elevation & Camera Polish — green

## RTS-23 (completion) — Phase Header, Offense Previews, Win/Loss Proximity & Business Card — GREEN  (2026-06-21)
- Summary: Completes the rts23 HUD elevation against the fuller brief + UX_UI_DIRECTION.md (the base
  — camera nits, top bar, channel dials, Wire, thug card, audio seams — shipped at 257337d). Adds
  the components that brief called out and the base lacked. Pure HUD readouts in /src/sim (unit-
  tested); the rest is render. tick/applyCommand untouched; /src/sim Phaser-free; four channels +
  50/70/85 ladder kept; NO new economic systems (the trade/resource mini-game stays deferred).
  565 → 571 green (+6 real assertions). NOTE: no Design HUD spec / GPT review file was present —
  built to UX_UI_DIRECTION.md + the inline brief.
  • 4-STAGE MATCH-PHASE HEADER (src/sim/pacing.ts hudPhase, pure+tested): ESTABLISH → FIRST BLOOD →
    CONTEST → DECAPITATE, derived from matchPhase + blocks held (FIRST BLOOD = your first secured
    block; CONTEST = ≥2). Drives the top-bar PHASE chip (hover-explained), the standings header, and
    the phase-change banner (renamed to the 4 stages).
  • OFFENSE PREVIEWS (src/sim/pacing.ts offensePreview, pure+tested): each offensive verb now shows
    cost · heat · EFFECT · RETALIATION before commit, grounded in the tuned constants — e.g.
    "[3] Assassinate $1500 +30🔥 ↳ −40 HQ integrity (≈3 hits topple a Don); rival: ENRAGES — strikes
    your HQ". Rendered as a sub-line under each offence-board row.
  • WIN/LOSS PROXIMITY (src/sim/endgame.ts victoryProximity, pure+tested): a readable "how close is
    anyone" — playerWinPct (dominance held/total vs TURF_DOMINANCE, or rivals-eliminated toward
    last-standing), playerLosePct (HQ razed / collapse), and the leading family + blocks-from-the-
    city. Surfaced as "WIN n% · LOSE n%" + a clipped read in the standings.
  • BUSINESS CONTEXT CARD (render): the bottom-left context panel now shows a HOVERED business's
    card — name · state (yours/rival/shut/un-shaken, colour-coded) · yield $/wk · heat/wk ·
    uncollected — and its valid verbs with EXPECTED EFFECT (✓ EXTORT → +30% protection income / ✓
    ATTACK → shut Nwk, +heat, or ✗ + why-locked). Falls back to the selected thug's card.
- Files: src/sim/pacing.ts (hudPhase + offensePreview), src/sim/endgame.ts (victoryProximity),
  src/sim/index.ts (exports), src/scenes/IsoScene.ts (top-bar 4-stage chip + hover, standings
  win/loss + offence previews, business context card, 4-stage phase banner). New tests/hudReadouts.test.ts.
- Gate: typecheck ✅  build ✅  test ✅ (571; +6 hudReadouts: the 4-stage header ESTABLISH→FIRST
  BLOOD→CONTEST→DECAPITATE + reads; offense previews state effect+retaliation from the constants;
  victoryProximity win%/lose%/leader/read). /src/sim Phaser-free; no Gangsters conflations.
- Commit: rts23: HUD/UI Elevation & Camera Polish — green

## RTS-23 (to HUD_SPEC §1–§9) — Named Ladder, Channel Brackets, Verb Chips & The Wire — GREEN  (2026-06-21)
- Summary: Final rts23 elevation pass, built to the HUD_SPEC §-anatomy (camera nits, top bar, dials,
  Wire, context, 4-stage phase, offense previews, win/loss proximity shipped earlier at 82540a3).
  Adds the spec's named/labeled refinements. Pure HUD-text helpers in /src/sim (unit-tested); the
  rest is render. tick/applyCommand untouched; /src/sim Phaser-free; four channels + 50/70/85 kept;
  no Gangsters conflations; §5 Trade/Market explicitly DEFERRED to RTS-24 (needs new pure logic).
  571 → 578 green (+7 hudText assertions). NOTE: HUD_SPEC.md was not in the repo / not pasted —
  built to the brief's inline §-references and CREATED HUD_SPEC.md as the in-repo record (flagged).
  • §1D LADDERED HEAT METER — engraved 50/70/85 ticks (brass when passed), tiny NOTICE/WATCH/RAID
    labels under them, a ▲rising/▼cooling/◆steady arrow, and a named caption ("WATCH · exp 72/100 ▲ ·
    raid at 85"). Pure federalTierLabel + FEDERAL_LADDER (tied to the FED_WARN_TIER constants).
  • §2 CHANNEL BRACKETS — each dial now reads its named bracket (NONE → GREASED → ON THE TAKE → IN
    POCKET → IRON GRIP) with a pip ladder, $X/wk, the plain payoff, and the next-bracket cost
    (→NAME@$N); THE BUREAU rendered in federal-green with a "lowers federal exposure" hover. Pure
    bribeBracket + BRIBE_PIPS.
  • §3C ACTION-VERB CHIPS — offense board + business card verbs now carry a READY / CONDITIONAL /
    LOCKED state (CONDITIONAL = only cash/cooldown away; LOCKED = a structural prereq) with the plain
    reason. Pure verbChipState.
  • §4 THE WIRE — a category DOT per line (money/threat/law/turf/crew, palette-coloured), an unread
    "N NEEDS YOU" count in the title with a brass left-edge tab on each unread danger/warning item,
    title pulse on a fresh alert, and focus-to-mark-read on [L]. Pure alertCategory + incidentNeedsYou.
  • §0 RED DISCIPLINE honoured — static markers moved off motion-danger-red (#E11D1D): threat dots →
    blood #8A2B22, passed heat ticks → brass, the needs-you tab → brass; danger-red stays motion-only
    (the Wire/route/klaxon pulses).
- Files: NEW src/sim/hudText.ts (federalTierLabel/FEDERAL_LADDER/bribeBracket/verbChipState/
  alertCategory/incidentNeedsYou, pure), src/sim/index.ts (exports), src/scenes/IsoScene.ts (heat-meter
  ladder labels, channel brackets + federal-green Bureau, verb-chip states, Wire dots + NEEDS-YOU).
  NEW HUD_SPEC.md (in-repo record). New tests/hudText.test.ts.
- Gate: typecheck ✅  build ✅  test ✅ (578; +7 hudText: named ladder = the 50/70/85 constants;
  channel brackets NONE→IRON GRIP + next cost + pips; READY/CONDITIONAL/LOCKED chip states; Wire
  categories + needs-you). /src/sim Phaser-free; no Gangsters conflations; §5 deferred.
- Commit: rts23: HUD/UI Elevation & Camera Polish — green

## RTS-24 (Content & Engagement) — Win Conditions, Vice Upgrades, The Market & Events — GREEN  (2026-06-21)
- Summary: The content batch that turns "I can play it" into "I want to replay it." Four content
  pillars built as PURE sim logic in /src/sim (seeded, Phaser-free, unit-tested) + one HUD-balance
  nit, all surfaced through the existing readable HUD. tick/applyCommand untouched — every new
  system WRAPS settlement via advanceWeeklyContent(state, weeksFired), called from the real-time
  driver on settled-week boundaries. Additive optional state fields keep determinism tests green;
  the market is opt-in/lazy. 578 → 602 green (+24 content assertions). Four channels + 50/70/85
  ladder kept; no Gangsters conflations; procedural/vector only.
  • A) MULTIPLE WIN CONDITIONS (src/sim/winpaths.ts, pure) — THREE labeled progress paths the HUD
    reads at a glance: DOMINATION (canon force win — ≥60% blocks / last family standing), GO STRAIGHT
    (legit-empire value = clean cash + a value per protected front, toward GO_STRAIGHT_TARGET → retire
    clean), GET ELECTED MAYOR (City Hall greasing AND civic INFLUENCE, the LAGGING gate sets the pace).
    advanceCivics accrues influence weekly from politicians·turf·fronts (wraps, never tick); a Wire
    slip fires the first time you cross the run-for-Mayor bar. evaluateEndgame consults metWinPath →
    new EndKinds win-go-straight / win-mayor; the win overlay prints a per-path headline (YOU WENT
    STRAIGHT / MR. MAYOR / THE CITY IS YOURS). Surfaced in THE CITY panel as ★/· "THREE WAYS TO WIN"
    with pct + the running read for each.
  • B) VICE UPGRADES (src/sim/vice.ts, pure) — each illegal operation climbs a BRANCH with a distinct
    yield/heat profile: BOOTLEGGING (smuggling, loud — +heat, big yield, final rung needs AN
    ALDERMAN'S EAR / City Hall≥20), GAMBLING (numbers, final rung MADE MEN / crew≥8), ENTERTAINMENT
    (speakeasy, final rung A SOCIETY NAME / influence≥30), TROUBLESHOOTING (protection, quiets the
    block — −heat, final rung A CREW OF ENFORCERS / strength≥12). The "The Books" ladder reads
    cost·yield-Δ·heat-Δ·prereq with a READY/CONDITIONAL/LOCKED chip + plain locked reason; applying a
    rung raises baseIncome and shifts heatPerTick. Surfaced in the §3B context card (THE BOOKS line)
    with [U] to upgrade the hovered racket.
  • C) THE MARKET (src/sim/market.ts, pure) — four Prohibition commodities (Bootleg Liquor, Bathtub
    Beer, Cuban Cigars, Sugar) priced off a SUPPLY↔DEMAND gauge that narrates itself in mob English
    ("demand far outstrips supply — prices SOARING" … "a glut on the street — prices CRASHING"). BUY
    low / SELL high with a house SPREAD and a live preview; trades visibly MOVE the price (a footprint
    lifts demand/supply); sale proceeds are DIRTY cash; advanceMarket eases prices back toward base
    each week; shockDemand lets events spike a good. Surfaced as a right-dock "THE MARKET" tab ([M]
    toggle, [N] pick a good, [Y] buy / [J] sell) with per-good rows + a live BUY/SELL preview. Where
    the extort→collect surplus finally has somewhere to go.
  • D) LIGHT SYSTEMIC SHOCKS/EVENTS (src/sim/events.ts, pure) — a small seeded event roll
    (EVENT_WEEKLY_CHANCE) per settled week feeding THE WIRE: LEGALIZATION (booze demand spikes, heat
    eases), FBI LOCKOUT (heat surge), BOOZE GLUT / SHORTAGE (market shocks), NEWSPAPER EXPOSÉ (heat).
    Each = pure trigger + effect + a Wire slip explaining cause→effect; deterministic per seed; tied
    to the existing heat + market systems. Projected to the ledger as 'event' incidents (brass dots).
  • E) HUD LAYOUT-BALANCE NIT — the top bar (CLEAN / DIRTY / NET / HEAT-LADDER / CREW / WEEK) now
    SPREADS across the full top edge (gaps grow to fill, 10px floor on narrow screens; room reserved
    for the PHASE chip) instead of clustering upper-left with an empty centre. Polish only — panels
    stay off the playfield.
- Files: NEW src/sim/winpaths.ts, src/sim/vice.ts, src/sim/market.ts, src/sim/events.ts; edited
  src/sim/{types,constants,endgame,ledger,hudText,index}.ts (additive optional fields, new EndKinds,
  ledger/category maps, exports); src/scenes/IsoScene.ts (weekly content beat wired after
  observeWorld; THREE WAYS TO WIN readout; per-path win headline; §3B vice ladder + [U]; THE MARKET
  tab + [M]/[N]/[Y]/[J]; full-width top bar). NEW tests/content.test.ts (24).
- Gate: typecheck ✅  build ✅  test ✅ (602; +24 content: three win paths + endgame resolution +
  civic accrual; vice branch mapping + ladder cost/yield/heat/state + gated final rung + ownership;
  market narration + buy/sell spread + footprint + drift + rows + glut; events deterministic fire +
  Wire projection + weekly-content beat). PURE sim Phaser-free (invariant test green); tick/
  applyCommand untouched; new systems WRAP settlement; four channels + 50/70/85 kept; no Gangsters
  conflations. §5 Trade/Market (deferred from RTS-23) now SHIPPED.
- Commit: rts24: Content & Engagement — win conditions, vice upgrades, the Market, events — green

## RTS-25 (Readability & Performance) — GREEN  (2026-06-22)
- Summary: A polish pass on two recurring playtest complaints — (1) on-screen TEXT hard to read,
  (2) gameplay felt SLUGGISH. NO new features/systems/content; behaviour-preserving. tick/applyCommand
  untouched; /src/sim stays pure & Phaser-free; all 602 tests still green. The fixes are render-side
  (scene + boot + index.html); the sim is unchanged.
- DIAGNOSIS (perf measured BEFORE changing): a Node micro-benchmark of the pure /src/sim readout work
  the scene rebuilds every frame (realtimeHudView, cityStanding, winPaths, buildReadout, offenseReadout,
  victoryProximity, marketRows, crewReadout, …) costs **0.035 ms/frame** (~28,000 fps of headroom). So
  the update/CPU side was NEVER the bottleneck — sluggishness is RENDER-bound. The cost was Phaser
  TEXT rasterisation: ~40 `setText` + ~30 `setColor` calls ran EVERY frame across the HUD, and each one
  re-renders the label's canvas + re-uploads the GPU texture (setColor re-rasterises too, via
  updateText). That's **~70 text-rasterisations/frame ≈ ~4,200/sec @60fps**, almost all redundant
  because the strings/colours don't change frame-to-frame.
- PERF FIX (the bottleneck): change-gated text — new private setT/setTC/setC helpers only call
  setText/setColor when the string/colour actually CHANGED. Routed all ~28 per-frame HUD text sites
  (top bar, channels, heat caption, route pill, context card, The Wire title+lines, crew rows,
  strategy panel, district nameplates, carry tags, phase chip) through them. Result: **~4,200
  rasterisations/sec → ≈0 on an idle frame** (only the once-a-second week countdown + real state
  changes re-rasterise). Loop structure, animation timing and pulses are untouched (transforms —
  setPosition/setAlpha/setScale — stay per-frame and are cheap), so nothing got choppier.
  • Instrumentation: a live perf overlay toggled with **[P]** — `FPS · frame ms · text-raster /s · DPR`
    — built on this.game.loop.actualFps + a per-second rasterisation counter, so the before/after is
    visible in-app. (Headless FPS can't be sampled here; the rasterisation/sec count is the hard,
    counted proxy and the 0.035 ms readout bench proves the CPU side was already idle.)
  • Throwaway bench kept at scripts/bench-frame.ts (run: npx vite-node scripts/bench-frame.ts).
- TEXT READABILITY (fix the RENDERING, not just layout — this recurred 3 playtests):
  • CRISPNESS: every Text is now created through a single mkText() factory that sets per-Text
    `resolution = devicePixelRatio` (caps at 2) so glyphs rasterise at HiDPI instead of being a blurry
    1× upscale; game config gains `render.roundPixels:true` + `antialias:true` to kill sub-pixel shimmer.
  • FONTS: the HUD was rendering in thin **Courier New**. Now loads real noir type (index.html: Oswald
    display + JetBrains Mono for numbers/body, preconnect + display=swap) and main.ts gates first paint
    on `document.fonts.ready` (1.5 s offline fallback) so Phaser never measures against a fallback and
    fails to reflow. NOIR_FONT → `"JetBrains Mono", "Courier New", monospace` (keeps CANON's mono feel,
    far more legible small); new NOIR_DISPLAY → Oswald condensed for titles/totals. Offline → falls back
    to Courier New (no worse than before).
  • SIZE (to the spec minimums — body ≥11 / labels ≥13 / numbers ≥16 / top-bar totals ≥24): the
    empire-at-a-glance TOTALS 17→**24px** in the display face; section titles (THE WIRE / YOUR CREW /
    THE CITY / THE FOUR CHANNELS / THE MARKET / objective) → 15–18px display; channel rows 11→12,
    context/market body 11→12, top labels 10→13, heat caption 10→11, ladder ticks 8→11, HQ/biz tags
    10→13. Nothing in the dense list panels was pushed past its panel width (kept at 12–13 to avoid
    overflow that can't be eyeballed here).
  • CONTRAST: mkText() gives every label a subtle dark drop-shadow backing so text stays legible over
    the soot/iso playfield + textured plates; the world-floating MAP LABELS (district nameplates, HQ
    tags) get a solid semi-opaque ink plate (`#14110fcc`) behind them.
  • MIN-ZOOM LEGIBILITY (§-rule): district nameplates are zoom-gated — hidden below cam.zoom 0.5 so
    they don't smear into an unreadable speck when the whole city is framed; crisp and plated when
    zoomed in.
- NOT CHANGED: no sim/economy/content/logic; tick & applyCommand & the four channels + 50/70/85 ladder
  untouched; the real-time clock→tick cadence left as-is (diagnosis showed pace wasn't the issue — the
  stutter was dropped frames from text rasterisation, not a slow tick); no panel relayout beyond size;
  canvas-level DPR scaling under Scale.RESIZE was considered but the lower-risk per-Text resolution +
  roundPixels path was chosen (reversible, behaviour-preserving).
- Files: index.html (web fonts + preconnect), src/main.ts (font-gated boot + render flags),
  src/scenes/theme.ts (NOIR_FONT/NOIR_DISPLAY), src/scenes/IsoScene.ts (mkText/setT/setTC/setC,
  size/font bumps, map-label plates + zoom-gate, [P] perf overlay). NEW scripts/bench-frame.ts.
- Gate: typecheck ✅  build ✅  test ✅ (602 — unchanged; no new pure /src/sim helpers, so no new
  tests, per the brief). No behaviour/test regressions.
- Commit: rts25: Readability & Performance — green

## RTS-26 (Procedural Gangster Art) — GREEN  (2026-06-22)
- Summary: A procedural-ART elevation pass — the units and city now read as 1920s Prohibition Chicago,
  still 100% code-drawn vector (no raster assets imported). NO new systems/content/logic; tick &
  applyCommand untouched; /src/sim pure & Phaser-free. Built on the rts25 frame loop (which is left
  byte-for-byte unchanged) so the perf fixes hold. 602 → 607 green (+5 for the extracted pure flag
  parser). All new art is baked to textures or drawn ONCE at create — zero new per-frame work.
- UNIT SILHOUETTES (cityArt.ts drawFigureRich, baked once per faction to 32×48 textures):
  • THUG — fedora with a real brim + pinched crown, DOUBLE-BREASTED suit (broad padded shoulders,
    peaked lapels, two columns of faction-coloured buttons), wide stance, a hand tucked in the coat.
  • THOMPSON MAN (role 'enforcer') — same period dress + a TOMMY GUN held diagonally across the body
    (barrel quad + round drum magazine + wooden stock): the unmistakable "armed" silhouette.
  • COLLECTOR — the unassuming courier: fedora, a shoulder strap, and a fat CASH SATCHEL with a brass
    clasp on the hip, so the interceptable-courier reads on sight.
  • CADILLAC (TEX.car) — a period 1930s sedan (long hood, rounded fenders over the wheels, running
    board, vertical grille, lit headlamp, cabin windows). Shipped as parked SET-DRESSING (no car unit
    exists in the sim; adding one would be a logic change), which also serves the "parked-car" period
    detail the brief asked for.
- FACTION READ: figureKeyFor(role, faction) resolves a faction-specific baked texture — PLAYER figures
  carry BRASS accents (hatband/tie/buttons), RIVAL figures carry static BLOOD-RED #9E1B1B accents —
  on top of the existing brass/blood foot-ring. Player-vs-rival is unmistakable by accent + colour,
  never by text. Danger-red #E11D1D stays motion-only (red discipline preserved).
- BUILDINGS (drawIsoBuilding, drawn once at create): elevated with an art-deco stepped CORNICE, a
  striped door AWNING, and a hanging neon SIGN; windows render warm when lit / dead-dark when shut
  (the lit/shut read), over the existing brick + soot walls and the rts22 ownership PLATE (untouched).
  New 'casino' style = the rts24 vice-morph target: a speakeasy/numbers racket whose viceRung ≥ 2
  MORPHS (taller, brass-trimmed casino silhouette) — redrawn once on the upgrade event via
  morphBuildingIfUpgraded (destroy + re-bake the one Graphics, then static), with a brass camera flash.
- PERIOD DETAILS (drawPeriodDressing, once, rich-only): cast-iron LAMPPOSTS with a warm glow at a few
  street corners + parked CADILLACS along the kerb, placed off building/block tiles.
- MOTION: within budget — figures keep the rts-era idle sway / brass selection ring; the morph + flash
  are ≤1.1s one-shots. No figure is re-rendered per frame (they're GPU-resident baked textures).
- CACHING / PERFORMANCE (non-negotiable, held): every figure/car/lamppost is generateTexture-baked
  ONCE at boot; every building + dressing is drawn ONCE at create; the morph is event-driven (a vice
  upgrade), never per-frame. The rts25 update() loop is unchanged (updateUnits → refreshHud →
  refreshObjective → refreshFeed → refreshCrew → refreshStrategy → refreshNight → samplePerf) — ZERO
  new per-frame work. So FPS is structurally identical to the rts25 baseline; the in-app [P] overlay
  (FPS · frame ms · text-raster/s) verifies it live, and `?art=lean` A/Bs rich-vs-old to isolate any
  perf concern. (Browser FPS can't be sampled in this headless env; the proof is the unchanged frame
  loop + the all-cached art — figures remain the same 32×48 textured quads they were, so per-frame
  GPU cost is unchanged.)
- FEATURE FLAG: parseArtMode() (NEW pure, Phaser-free, src/scenes/artMode.ts; tested) → richArt().
  Default = rich; `?art=lean` (also basic/off/0/false) = the pre-rts26 "shapes" path (drawFigureLean +
  plain buildings), baked to the same keys so both paths are drop-in.
- Files: NEW src/scenes/artMode.ts + tests/artMode.test.ts (5); src/scenes/cityArt.ts (drawFigureRich/
  Lean, faction bakes, bakeCar/bakeLamppost, casino style, rich drawIsoBuilding, figureKeyFor,
  richArt); src/scenes/IsoScene.ts (figureKeyFor for unit textures, bizBuildings tracking +
  morphBuildingIfUpgraded, drawPeriodDressing). No sim changes.
- Gate: typecheck ✅  build ✅  test ✅ (607; +5 artMode). Procedural/vector only; four channels +
  50/70/85 untouched; red discipline kept; behaviour/tests un-regressed.
- Commit: rts26: Procedural Gangster Art — green

## RTS-26 (Procedural Gangster Art — built to PROCEDURAL_ART_SPEC) — GREEN  (2026-06-22)
- Summary: The authoritative PROCEDURAL_ART_SPEC.md (Design canvas) was pasted into this pass, so the
  rts26 draw routines were ELEVATED to its exact layer breakdowns (the first rts26 commit d7027b4
  established the pipeline/flag/morph/caching; this builds the spec-faithful art on top). Still 100%
  code-drawn LAYERED VECTOR, no raster. NO sim/content/logic changes; tick/applyCommand untouched;
  /src/sim Phaser-free. Built on rts25's frame loop (unchanged) so the perf fixes hold. 607 green
  (the +5 artMode tests carried from the first pass). All art baked-once / drawn-once; only two cheap
  per-frame BOOLEAN gates added (satchel-tier change, shut transition) — no new per-frame redraws.
- UNIT SILHOUETTES (cityArt.drawFigureRich, baked once per faction to 38×56 textures; spec §1):
  • THUG — broadest planted block: 26px double-breasted shoulders, pinstripe verticals, lapel-V +
    shirt/tie wedge, two rows of 2 brass-dark buttons, stubby out-held arms+fists, heavy jaw, fedora
    (brim ellipse + pinched crown). Faction reads TWICE high in the silhouette: hatband + chest
    POCKET-SQUARE triangle.
  • THOMPSON MAN — suited mass BROKEN by the gun: a gunmetal barrel quad on the iso diagonal + the
    DRUM-MAGAZINE circle (the recognition key, always visible) + Cutts compensator + wood stock;
    bladed stance, brown suit to vary the crowd. Faction = hatband + a small lapel pin (gun stays the
    read). Muzzle flash stays a motion one-shot (not baked).
  • COLLECTOR — deliberately unimposing: 18px soft shoulders, forward hunch, mid-stride brown
    trousers, no gun. Hero prop = the SATCHEL in THREE size TIERS keyed to the carried cash (Light/
    Heavy/Stuffed; tier-3 gets a brass money-glint notch), swapped by texture only when the tier
    changes (state-driven). Thin MUTED hatband (lightly marked by design).
  • CADILLAC — long low 64px sedan: rounded fender arches over the two near wheels (hub + 4 spoke
    ticks), running boards, long hood + greenhouse cabin (split windscreen), tall vertical-slat grille
    + twin headlamps + chrome bumper. FACTION accent only on the coachline pinstripe + wheel-hub
    centres (never the body): a brass hero ride parked at the player HQ, a blood-red one at rival HQs,
    and a dim faction-NEUTRAL parked variant as street dressing.
- FACTION READ: figureKeyFor(role, faction[, tier]) → faction-specific baked textures; ONE saturated
  accent placed at the silhouette's clearest points (brass player / static blood-red #9E1B1B rival),
  never smeared over the body, plus the existing foot-ring. Danger-red #E11D1D / muzzle #FF5A2C stay
  motion-only (red discipline).
- BUILDINGS (drawIsoBuilding rich, per-KIND facade above the brick massing + the ownership PLATE; §2):
  running-bond brick (mortar courses + offset verticals), stepped deco cornice, soot streaks; then —
  • STOREFRONT: shop window (mullion cross) + striped awning + hanging shingle; warm pavement spill
    when lit.  • SPEAKEASY: discreet — narrow recessed door + 4px grilled PEEPHOLE (the recognition
    detail) + basement-grate amber leak + a contradicting "legit" sign.  • CASINO: a tall deco BLADE
    SIGN off the corner (ziggurat finial) + a bulb-lined marquee canopy + chevron inlays.  • HQ:
    pilaster spine + stepped brass crown cornice + two torchère lamps + a faction CREST (brass player
    / #9E1B1B rival — mirrored seats). Windows render warm amber when LIT, dead-dark + timber X-boards
    when SHUT/raided. The ownership plate keeps doing faction color; the art layers above it.
  • SPEAKEASY→CASINO MORPH (rts24 beat preserved, §2.5): on a vice upgrade (viceRung ≥ 2) the building
    re-bakes to the casino silhouette ONCE + a 0.6s scale-pop (a TRANSFORM tween, not a per-frame
    redraw) + a brass "OPEN" wax-stamp + flash.
- PERIOD SET DRESSING (drawPeriodDressing, once, rich-only, non-buildable tiles; §3): cast-iron deco
  LAMPPOSTS with a hexagon cage + a soft warm pavement glow POOL; a few dim faction-neutral parked
  Cadillacs along the kerb. Soot-dark, low-contrast, faction-neutral so they never muddy the read.
- CACHING / PERFORMANCE (held, non-negotiable): every figure/car/lamppost is generateTexture-baked
  ONCE at boot; every building + dressing is drawn ONCE at create; the morph and the lit/shut relight
  are EVENT-driven re-bakes (vice upgrade / attack), never per-frame. The rts25 update() loop is
  unchanged; the only per-frame additions are two O(1) boolean gates (satchel tier-change → setTexture;
  shut transition → one relight). So FPS is structurally identical to the rts25/rts26 baseline — the
  in-app [P] overlay (FPS · frame ms · text-raster/s) verifies it live, and `?art=lean` A/Bs rich-vs-
  the-old-shapes path. (Headless FPS can't be sampled here; the proof is the unchanged frame loop +
  all-cached art — figures are still single textured quads, now 38×56 vs 32×48.)
- FEATURE FLAG: parseArtMode() (pure, tested, src/scenes/artMode.ts) → richArt(), cached on the scene.
  Default rich; `?art=lean` (basic/off/0/false) = the pre-rts26 shapes path (drawFigureLean + plain
  buildings), baked to the same keys (drop-in).
- Files: src/scenes/cityArt.ts (spec tokens; drawFigureRich + drawFedora; 3-tier collector bakes;
  bakeCar faction/parked variants; bakeLamppost hex cage; BuildingStyle.kind + drawFacade per kind +
  brick texture + lit/shut); src/scenes/IsoScene.ts (figureKeyFor + tier swap; HQ faction crest +
  hero car; relightBuilding on shut transition; morph scale-pop + OPEN stamp; cached art flag).
- Gate: typecheck ✅  build ✅  test ✅ (607). Procedural/vector only; four channels + 50/70/85
  untouched; faction-accent law + red discipline honoured; behaviour/tests un-regressed.
- Commit: rts26: Procedural Gangster Art — green

## RTS-27 (Audio Wiring) — GREEN  (2026-06-22)
- Summary: Wired the full audio library onto the HUD seams designed in across rts22→24 — NO new game
  systems, content, or balance. tick/applyCommand untouched; /src/sim Phaser-free; render+audio
  Phaser-side. Sound hangs on the beats that ALREADY fire (the rts23 signalBeat seam + the existing
  grease/combat/federal/phase/mutiny/endgame visual triggers); no new triggers invented. 607 → 618
  green (+11 for the pure audio-map/rotation helpers). Built on the rts25/rts26 HEAD.
- AUDIOMANAGER (src/scenes/audio.ts, Phaser-side): preloads the catalogued .m4a clips from
  public/audio/ (a missing file 404s → play() no-ops, so the wiring is complete now and lights up as
  assets land). play(key) honours per-CATEGORY buses (sfx / vo / music / ambience) × a master, a
  global mute, a per-clip debounce, and a ONE-URGENT-AT-A-TIME rule (urgent cues don't stack and duck
  the beds). VO takes rotate (no back-to-back repeat). Settings persist to localStorage and are
  respected on every play and on the live beds.
- SEAM → CLIP (hung on the existing visual beats):
  • money banked / collector dispatch → cashdrop 🪙 · extort lands → extort 🥃 · ambush/raid/attack →
    tommygun 🔫 · assassinate/sabotage → pistol · lockout → siren · federal 50/70/85 CROSS-up →
    teletype warning 🔔 (siren at 85) · grease level-up → a distinct cue per channel (whistle/gavel/
    stamp/receiver) · mutiny primed → the mutiny stinger.
  • THE WIRE (progressive disclosure for the ears): only NEEDS-YOU slips (danger/warning) RING (📞
    wire_crisis); routine info/gain slips get a soft tick (wire_routine) — mirrors the visual priority.
  • The provided drop wires immediately (extort, cashdrop, tommygun, pistol, siren, warning, mutiny +
    all music/ambience beds); grease cues, door/typewriter, wire rings, stings and VO are wired with
    their expected filenames and sound the moment they're dropped in public/audio/ (documented in its
    README).
- STINGS: each phase-transition banner → its phase sting + the music crossfade; the win/lose overlay
  → the win/lose sting + a VO one-liner + a music switch (theme swell / defeat bed).
- VO: crew-order confirms on action commands (collect/grease/reinvest/raid/sabotage/assassinate/
  lockout), takes rotated; the consigliere tips on their existing onboarding triggers (extort-first on
  fresh load, grease on first grease, launder on first racket, war on reaching CONTEST/FIRST BLOOD),
  each gated to FIRST-occurrence so they never spam.
- MUSIC STATE MACHINE (audioMap.musicBedForPhase, pure+tested): TITLE→theme, ESTABLISH→calm-build,
  FIRST BLOOD/CONTEST→contest-tension, DECAPITATE→war, GAMEOVER→defeat; crossfades 0.9s on phase
  change; the city-ambience bed loops underneath; urgent stings/VO DUCK music+ambience ~45% then
  restore. Starts on Phaser sound-unlock (first input), so autoplay policy is honoured.
- SETTINGS SURFACE: [O] opens an audio panel (master + the four buses + mute, with volume bars);
  while open, [1–5] cycle each bus 100→75→50→25→0→100; [0] toggles master mute (works anytime).
  Persisted; the live beds re-volume immediately.
- PERFORMANCE: preload-once + reuse; audio is event-driven — NO per-frame audio allocation (the
  mutiny check reuses refreshCrew's already-computed crew rows; the federal/phase/wire checks are O(1)
  int/seq compares that already ran). The rts25 update() loop is otherwise unchanged → FPS unaffected
  (verify live with the [P] overlay).
- Files: NEW src/scenes/audioMap.ts (pure mapping/rotation) + tests/audioMap.test.ts (11); NEW
  src/scenes/audio.ts (AudioManager); NEW public/audio/README.md (the key→file manifest + drop
  instructions); src/scenes/IsoScene.ts (preload audio; route signalBeat + grease/combat/federal/
  phase/mutiny/endgame/VO/tips; the [O] settings panel). No sim changes.
- Gate: typecheck ✅  build ✅  test ✅ (618; +11 audioMap: phase→bed, only-needs-you-rings,
  grease/federal/combat cue maps, VO take-rotation, volume helpers). Four channels + 50/70/85 kept;
  no Gangsters conflations; behaviour/tests un-regressed.
- Commit: rts27: Audio Wiring — green

## RTS-28 (Playability & Pacing) — GREEN  (2026-06-22)
- Summary: A playability pass on the playtest verdict ("barely playable past 5 min + clear bugs"). Seven
  fixes; NO core-loop/economy redesign (that's RTS-29). tick/applyCommand untouched; /src/sim Phaser-
  free; the per-week economy math is identical — only real-time spacing + UX/render change. 618 → 626
  green (+8 pure playability helpers).
- ⭐ #1 PACING (the unblock): the scene now runs a TIGHTER real-time week (SCENE_WEEK 55s, was the sim's
  120s default) with the rival-pulse cadence scaled to match (~5.5 pulses/week, unchanged), so a week
  isn't mostly dead waiting. Added a FAST-FORWARD control — [Space] (and an on-screen ▶/▶▶/▶▶▶ button)
  cycles 1×/2×/4× by scaling the dt fed to the sim — and a SKIP-WEEK control — [>] (and a button) jumps
  straight to the next settlement (exactly one week). Always visible, bottom-centre. Pure helpers
  (nextTimeScale / scaledDt / skipWeekDt) drive it; the HUD countdown uses the same scene week.
- #2 [T] COLLECTOR SPAM: capped at ONE route collector. Repeated [T] REFRESHES the route (to cover
  newly-extorted shops) but never STACKS — the existing collector's sprite view is cleaned before
  recreating (createCollectionRoute already retires the old sim unit), and a collector carrying cash is
  left to bank first. Pure canAddRouteCollector cap (MAX_ROUTE_COLLECTORS = 1).
- #3 BUILDING CLICK OFFSET: businessAtScreen now hit-tests the drawn building COLUMN (height-aware,
  frontmost) FIRST and only falls back to the raw base tile — so a click on a tall building's body
  resolves to THAT building, not the tile one row up-left (the iso offset). A left-click now SELECTS the
  building under the cursor (focusBizId): its card sticks in the context panel and [E]/[U] target it.
- #4 ACTION-VERB LEGIBILITY: the [1]–[6] build + offence verbs moved OUT of THE CITY/ledger text into
  their own labelled, solid-backed "⚔ ACTIONS" board (bottom-right), each a READY/CONDITIONAL/LOCKED
  chip — scannable at a glance, no longer haphazard red text mixed into the standings.
- #5 MARKET PANEL COLLISION: THE MARKET ([M]) now cleanly REPLACES the right dock — opening it hides
  The Wire + The City + the Action board (and their frame) and draws from the top of the dock, so it
  never overlaps their text; closing restores them.
- #6 CAMERA CENTERING: the default resting view now CENTERS the whole play area (centroid of every
  business + HQ) instead of resting up-and-left on the home corner; [Z] frame-city already centres.
- #7 MARKET/EVENTS TOGGLE (cheap): ?market=off (default on) de-emphasises the Market + Events noise —
  the [M] tab is disabled and the weekly content runs civic-influence only (skips the market drift +
  event rolls), pending the RTS-29 re-shape. Default on = behaviour unchanged.
- NOT CHANGED: no sim/economy/balance redesign; tick/applyCommand & the four channels + 50/70/85 ladder
  untouched; the collector MODEL (the full rework) is deferred to RTS-29 — [T] is only capped here; the
  Market/Events FATE is deferred to RTS-29 — only a turn-down flag here. No per-frame audio/alloc added;
  the rts25 frame loop is intact (FPS held — verify [P]).
- Files: NEW src/scenes/playability.ts (pure: time scales, scaledDt, skipWeekDt, flagEnabled,
  collector cap) + tests/playability.test.ts (8); src/scenes/IsoScene.ts (scene week + fast-forward/
  skip controls; [T] cap + destroyUnitView; column-first businessAtScreen + click-select building;
  the ACTION board; market-replaces-dock; centred default camera; ?market=off). No sim changes.
- Gate: typecheck ✅  build ✅  test ✅ (626; +8 playability: fast-forward cycle, scaledDt, skip-week
  math, feature-flag parse, collector cap). Behaviour/economy un-regressed.
- Commit: rts28: Playability & Pacing — green

## RTS-29 (Core-loop reshape — slice 1: the peaceful builder) — GREEN  (2026-06-22)
- Summary: The front-half FOUNDATION of the reshape (REV B spec): a calm, fog-shrouded BUILDER where
  rivals stay dormant and collection is SAFE — built so RTS-30 can switch on war + the re-timed
  collector interception cleanly. NO war content, NO collector interception/theft this slice. Law
  held: /src/sim PURE & Phaser-free; tick/applyCommand WRAP-not-modified (every new system settles
  around the existing tick via additive, default-safe fields + the real-time wrapper). 626 → 637
  green (+11 reshape helpers); NO existing test changed (the dormancy gate is OPT-IN via
  state.rivalWakeWeek, absent ⇒ prior behaviour byte-identical).
- FIXED PER-BUSINESS COLLECTORS + the SEA read (src/sim/routes.ts ensureBusinessCollector): one fixed
  HQ↔business collector auto-spawns per extorted front (route id route-biz-<id>); many fronts → many
  collectors walking their tracks at the slow stroll speed (the rewarding heartbeat). advanceRoutes
  cycles each (collect→bank→loop); travel time is the throttle. The scene seeds them on extort
  conversion + a per-settlement sync sweep (never stacks — ensure no-ops an existing one). Badges:
  DIM [%] coin on an extortable front, FULL [$] + glow on an earner, both hidden under fog.
  ⭐ INTERCEPTION RE-TIMED, RETAINED-BUT-DORMANT: collectorsVulnerable(state) === !rivalsDormant —
  FALSE in this slice, so resolveInterceptions/threatenedCollectors find no hostile units (none are
  spawned) and the red threat-ring never shows. The whole threat/robbery path is KEPT intact; RTS-30
  flips it on as a rival-invasion consequence (NOT deleted — a re-timing of the signature pillar).
- EXTORT AS REPEATED VISITS (src/sim/extortion.ts): a front RESISTS N muscle visits (3 base, +1 per
  wealth tier). [E] / right-click EXTORT now sends a thug who WALKS there (slow) and leans on it
  (recordExtortVisit drops resistance a notch); empty it → it converts to [$] (coin-stamp + Wire slip)
  and its collector spawns. Cost = TIME + a thug occupied, NOT cash. (The old one-roll extortAtTile
  stays in the sim for its tests; the scene drives the new visit model.)
- CONTROL CURRENCY (src/sim/control.ts): caps how much turf you can HOLD. CAP = a starting reach +
  CITY HALL political favour (floor(politicians$/5)) + a slow time-drift floor, clamped — NOT a
  parallel economy. SPENT = the holdings you maintain (each extorted front + each held district);
  returns when released. At the cap EXTORT/EXPAND grey "NO CONTROL LEFT — grease CITY HALL". HUD: a
  brass-bezel meter "CONTROL ███░░ spent/cap" in the freed Market dock tab, with a plain tooltip. The
  chain extort→launder→bribe→favour→cap→expand is the pacing metronome.
- FOG OF WAR (src/sim/fog.ts, pure reveal): the board starts shrouded under a soot veil; a brass-lit
  radius lifts around the HQ + each player unit as they move (incremental — the veil is redrawn ONLY
  when new tiles uncover, never per frame). Rivals/their HQs sit beyond the fog, unseen. The opening
  view frames the player's revealed pocket (centering the whole city would just frame soot).
- DELAYED RIVALS (src/sim/strategy.ts rivalsDormant + the advanceStrategy gate): no rival TERRITORIAL
  pulses fire while state.tick < state.rivalWakeWeek (set to RIVAL_DORMANT_WEEKS=3 in the scene); no
  rival enforcer is spawned; rival HQs hide under the fog → zero #9E1B1B on screen, a guaranteed
  peaceful runway. (resolveRivalAI in tick is left untouched per the law — rivals may build their own
  economy off-screen across the fog, but they make no contact.)
- SPACE = THE CLOCK: player units spawn at STROLL_SPEED (1.15 t/s, vs MOVE_SPEED 2.5) so travel is
  visible ambient time. MOVE_SPEED itself is unchanged (per-unit speed at spawn) so movement tests
  stand. (Building re-spacing kept light this slice — the slow speed carries the "period weight".)
- MARKET OFF by default: the rts28 flag flips — the Market is off unless ?market=on; its dock tab is
  freed for the CONTROL readout; the market code stays dormant behind the flag (not ripped out). The
  weekly content runs civics-only when off (no market drift / events).
- TESTS CHANGED: none updated — all 626 prior stand (the opt-in dormancy flag + additive fields kept
  them byte-identical). ADDED tests/reshape.test.ts (+11): control cap/spent/available/gate/readout;
  fog reveal + incremental delta + bounds; extort-as-visits convert + resist + wealth; rival dormancy
  gate (advanceStrategy fires 0 while dormant, resumes after); fixed per-business collector spawn +
  no-dup + the dormant vulnerability hook.
- PERFORMANCE: fog reveal is cached/incremental (redraw only on a reveal delta); the collector sync +
  extort-arrival handlers are event-driven (settlement / arrival), not per-frame; the badge loop
  short-circuits shrouded businesses. The rts25 update() loop is otherwise intact → FPS held (verify
  [P]). No per-frame allocation added on the steady path.
- Files: NEW src/sim/control.ts, src/sim/fog.ts, src/sim/extortion.ts + tests/reshape.test.ts (11);
  edited src/sim/{constants,types,strategy,routes,index}.ts (additive); src/scenes/IsoScene.ts (slow
  spawn + no rival; rivalWakeWeek; fog layer + reveal; per-business collectors + sync; extort-visits +
  control gate; CONTROL + COLLECTORS readouts; [%]/[$] badges; market off; [T] deprecated).
- Gate: typecheck ✅  build ✅  test ✅ (637; +11 reshape). PURE sim Phaser-free; tick/applyCommand
  untouched; four channels + 50/70/85 kept; procedural/vector.
- Commit: rts29: Core-loop reshape slice 1 — peaceful builder — green

## RTS-29.1 (Hotfix — idle-thug faction resolution; dispatch was dead) — GREEN  (2026-06-22)
- Summary: Surgical fix for the RTS-29 UAT BLOCKER Cowork state-probed: pressing [E] to lean on a [%]
  front always returned "no free muscle" even at a fresh start with two idle thugs, so NOTHING
  converted — the entire earn loop (convert → coin-stamp → Wire slip → per-business collector →
  control spend) was dead. NO new scope / war / tuning. /src/sim untouched; tick/applyCommand
  untouched. 637 → 641 green (+4 dispatch-seam tests).
- ROOT CAUSE (confirmed): sim MUSCLE units (spawnUnit) are shaped { id, pos, path, speed } — they
  carry NO factionId and NO role. Faction lives on the scene's UnitView.faction. But
  idlePlayerThug() matched `u.factionId === 'player' && u.role !== 'collector'` against state.units,
  which is true for ZERO of the two idle thugs → it never found muscle → never dispatched.
- FIX: idlePlayerThug() now resolves faction/role from the VIEW layer — it projects this.units
  (UnitView.faction + unit.role) into candidates and calls a new PURE helper pickIdleMuscle (faction
  from the view, isCollector from the sim role which collectors DO carry, idle from an empty path,
  minus already-tasked ids), then maps the chosen id back to the sim unit. The dispatch decision is
  now testable without Phaser.
- AUDIT (every scene read of unit factionId/role checked for the same wrong-layer mistake):
  • idlePlayerThug() (line 1046) — ✗ WRONG-LAYER (muscle has no factionId) → FIXED. This was the
    ONLY occurrence.
  • playerCarrier() (642) `role==='collector' && factionId==='player'` — ✓ CORRECT: collectors are
    spawned via spawnCollector/ensureBusinessCollector which DO set factionId + role='collector'.
  • drawRoutePill collector count (2186) `role==='collector' && factionId==='player' && routeId` —
    ✓ CORRECT (collectors carry all three).
  • attachView (655/657) `figureKeyFor(unit.role,…)` + `if (unit.role==='collector')` — ✓ CORRECT
    (role is undefined for muscle → thug silhouette / no cashTag; present for collectors).
  • collector satchel-tier swap (732) `figureKeyFor(v.unit.role, v.faction)` — ✓ view-layer faction.
  • context-card role/faction (2262) `view.unit.role / view.faction` — ✓ already view-layer.
  • revealFog `v.faction !== 'player'`, syncBusinessCollectors `businessEarner(b)`, ensureBusinessCollector
    `u.routeId===routeId`, processExtortArrivals by unit id — ✓ none read muscle factionId.
  Conclusion: collectors/enforcers carry factionId+role so those reads are fine; only the
  muscle-dispatch read was wrong-layer.
- NEW SEAM TEST (the real gap — the 11 pure-sim reshape tests never exercised the scene dispatch
  path): NEW src/scenes/dispatch.ts (pure pickIdleMuscle) + tests/dispatch.test.ts (+4): the
  regression (two idle player thugs with NO sim factionId ARE selectable), never picks a collector or
  rival, skips a busy/already-tasked thug, and returns undefined for an honest "no free muscle".
- Files: NEW src/scenes/dispatch.ts + tests/dispatch.test.ts; src/scenes/IsoScene.ts (idlePlayerThug
  rewritten to the view layer + import). No sim changes.
- Gate: typecheck ✅  build ✅  test ✅ (641; +4 dispatch). [E] now dispatches an idle thug to a [%]
  front → the visit → convert → collector → control-spend loop runs.
- Commit: rts29.1: fix idle-thug faction resolution (dispatch was dead) — green

## RTS-30a (World & camera foundation — sparse map · districts · control decoupled) — GREEN  (2026-06-22)
- Summary: The foundation slice of RTS-30 (biggest change since the iso conversion). FOUR build items,
  nothing else (NO turf war, collector interception, war content, or the UI-declutter/toolbar — those
  are 30b/30c). /src/sim stays PURE & Phaser-free; tick/applyCommand CORE MATH untouched (new systems
  are pure reads). 641 → 645 green (−4 retired control-currency tests, +8 new world tests).
- 1) SPARSE LARGER MAP — NEW pure `src/sim/worldgen.ts` (`generateWorld`) supersedes the 16² block
  layout with a 96² sparse iso city (WORLD_SIZE=96, 9216 tiles ≈ 36× the old map). Deterministic from
  `state.seed ^ 0x30a` via the Rng wrapper. Districts arrange into a region grid that PARTITIONS the
  map; each region gets 4-wide AVENUES on its edges + a STREET cross (the negative space), a 4×4 PARK
  + a 3×3 PLAZA (fountain), then business parcels placed sparsely by `findParcel`: an open 'ground'
  tile with a ≥1-tile setback (no building in its 8-neighbourhood) AND the min-gap rule (no two
  footprints within 1 tile). All 51 sim businesses + every HQ get a tile; openFraction ≈ 0.99 per
  district (well past the sparse target — buildings sit far apart so a thug strolls visible seconds
  between them; DISTANCE is the throttle now, not a control spend). WorldLayout EXTENDS MapLayout, so
  the existing pure route/collector/movement code consumes it unchanged.
- 2) DISTRICTS as a first-class spatial unit — every tile carries a `districtOfTile` id (a COMPLETE
  partition: every tile in exactly one district, asserted in tests). On the map: a low-opacity
  ownership wash painted per-tile in drawGround (brass 5% HELD / rival-red 7% RIVAL / none neutral)
  and a plaza nameplate label. Reuses the bigCity district names (Dockside … Uptown).
- 3) CAMERA — the CRITICAL world/HUD split. A second FIXED ui camera (`setupUiCamera`) renders the
  HUD at 1:1 and is NEVER transformed; the main camera owns zoom/pan over the world. Objects are
  partitioned by the scene's long-standing `scrollFactor 0 = HUD` convention (snapshot at create);
  runtime-created WORLD objects are registered via a new `worldFx()` helper (uiCam.ignore) so they
  can't ghost onto the fixed panel — wired into attachView, floatText, leanBeat, relightBuilding,
  morphBuilding, drawTargetMarker, dropGreenback, flashAmbush, flashDeposit, flashTerritory. ZOOM: 3
  stops (CLOSE 1.0× / MID 0.6× resting / FAR 0.35×) smoothly interpolated and anchored to the cursor
  (the world point under the pointer stays pinned), driven by +/- keys, the wheel, and cycleZoom. LOD
  at FAR (zoom < 0.45): a bulk soot fill replaces the per-tile ground draw. PAN: edge/drag/WASD+arrows,
  eased, clamped to the iso world bounds (`setWorldCameraBounds`). Opening frames the player's HQ
  district plaza at MID zoom. Because the HUD lives on a separate untransformed camera, it cannot
  reflow/drift on zoom/pan/resize (the resize handler only resizes the ui camera viewport).
- 4) DECOUPLE EXTORTION FROM CONTROL + REPURPOSE CONTROL — the spend-to-extort meter is RETIRED
  (`src/sim/control.ts` DELETED). commandExtortBusiness/commandExpand no longer consult a control
  budget — extortion is gated ONLY by walking time/distance + a free thug; expand only by cash.
  Control is now DISTRICT STATUS: NEW pure `src/sim/districtStatus.ts` — `districtStatusOf` returns
  HELD (player ≥ HOLD_THRESHOLD=0.6 of a district's businesses) / ESTABLISHING (some, under threshold)
  / NEUTRAL / RIVAL; CONTESTED is reserved for 30c and never produced here. `cityRoster` + `citySummary`
  back the repurposed right-dock panel "THE CITY — WHAT'S YOURS" (row = pip · name · status · held/total
  · tag; a summary line; click a row → camera flies to that district). A read-only status board, not a
  turf war.
- PERFORMANCE: render CULLS to the viewport — drawGround derives the visible tile window from
  cam.worldView corners (→ screenToGrid, padded by 2) and draws ONLY those tiles into one Graphics, so
  cost is bounded by SCREEN size, not map size (96² is no costlier than 16² at a given zoom). The ~51
  buildings are baked-once Graphics (Phaser frustum-culls them); fog is folded into the same culled
  draw; FAR LOD swaps per-tile fills for a bulk soot rect. The structural guarantee: nothing iterates
  the 9216-tile array per frame. FPS can't be sampled in this headless env — the live [P] overlay
  (FPS · frame-ms · text-rasterisations/sec) remains for Cowork to confirm the rts25 baseline holds at
  each zoom; the culling argument says it must.
- TESTS: REMOVED the 4 control-currency tests from tests/reshape.test.ts (their premise — control
  gates/limits extortion — is gone; noted inline) + the control.ts/CONTROL_START imports. ADDED
  tests/world.test.ts (+8): MapLayout-compat (every business+HQ tiled), the district PARTITION
  (complete + exactly-one), SPARSENESS (no building in any 8-neighbourhood; openFraction > 0.85),
  park+plaza per district, determinism, district status NEUTRAL→ESTABLISHING→HELD, roster+summary,
  and CONTESTED-never-produced. 641 − 4 + 8 = 645.
- PLAY-THROUGH (the new map, exercisable): the loop is unchanged in verbs but now spaced out — select
  a thug, right-click a [%] front (or [E] on the onboarding target) → an idle thug walks the avenues
  to it (visible seconds at STROLL_SPEED across the sparse 96² blocks) → on arrival it LEANS
  (processExtortArrivals records a visit; no control checked) → repeat to fold it into a [$] earner →
  the per-business collector spawns. No "NO CONTROL LEFT" can block it. The CITY roster ticks the
  district from NEUTRAL → ESTABLISHING as fronts fold, and HELD once ≥60% of a district pays; clicking
  the row flies the camera there. Through all of it the HUD panels stay pinned (separate fixed camera)
  while the world zooms/pans beneath them.
- Files: NEW src/sim/worldgen.ts, src/sim/districtStatus.ts, tests/world.test.ts; DELETED
  src/sim/control.ts; edited src/sim/constants.ts (WORLD_SIZE, HOLD_THRESHOLD), src/sim/index.ts
  (export swap), tests/reshape.test.ts (retire control tests), src/scenes/IsoScene.ts (worldgen render
  + culled drawGround + two-camera split + zoom stops/anchor + CITY roster + gate removal).
- Gate: typecheck ✅  build ✅  test ✅ (645). Sparse 96² map reads + paces by distance; the anchored
  3-stop camera zooms/pans with a non-drifting HUD; extortion needs no control and control is now the
  district-status board.
- Commit: rts30a: World & camera foundation - sparse map, districts, control decoupled - green

## RTS-30a.1 (Reveal-all flag + scout hint for map UAT) — GREEN  (2026-06-22)
- Summary: A tiny enabling/polish pass so the RTS-30a sparse-map showpiece is viewable. The new 96²
  city is hidden behind fog at a fresh start, so it couldn't be inspected/playtested. NO new systems,
  no turf war, no UI redesign, no economy/content/balance change. /src/sim stays PURE & Phaser-free;
  tick/applyCommand untouched. 645 → 647 green (+2 pure fog-flag tests).
- 1) ⭐ REVEAL-ALL DEBUG FLAG (?reveal=1, default OFF) — lifts the fog over the WHOLE map so the full
  sparse city is inspectable: wide avenues, parks/plazas/fountains, every district with its
  boundaries + nameplates + ownership washes. NEW pure helpers in src/sim/fog.ts:
  `revealAllRequested(search)` (parses the flag; empty/malformed/absent ⇒ false) and
  `revealAll(fog, cols, rows)` (adds every in-bounds tile). The scene parses the flag once into a
  `debugRevealAll` field (mirrors the existing `marketEnabled` pattern) and, in seedFogAroundPlayer,
  reveals the whole map instead of the HQ pocket when set. Normal play (no flag) keeps the fog
  unchanged; the per-frame revealFog only ADDS, so reveal-all persists.
- 2) SCOUTING HINT FOR FLY-TO-UNSEEN — clicking a CITY-roster row for an unscouted district used to
  fly the camera onto plain black fog (a dead-end). flyToDistrict now computes `scouted` (the
  district's plaza/centroid tile isRevealed, or reveal-all on) and calls a new `showScoutCue`:
  • a faint WORLD outline of the district's region (an iso diamond of its bounds) drawn above the fog
    soot so the target isn't just black, fading out;
  • a FIXED, always-readable HUD cartouche naming the district — "▣ {NAME}", plus "— not yet scouted —"
    when under fog — at screen-centre (the fly centres on the district). This is needed because the
    world nameplate is an illegible speck at FAR zoom AND is zoom-gated off below 0.5× (fly-to lands at
    0.35×), so without it the player couldn't even tell WHICH district they flew to (covers fix 3).
  The status line also reflects the scouting state. Purely visual — the district stays unscouted until
  a unit actually walks there; no sim/fog mutation from the cue.
- Two-camera correctness: the cue's world outline is registered via worldFx (uiCam ignores it); the
  HUD cartouche is registered via a NEW symmetric `hudFx` helper (main camera ignores it) so it can't
  double-render in world space — both created after the setupUiCamera snapshot.
- TESTS: +2 pure (tests/reshape.test.ts): revealAllRequested parses ?reveal=1 / rejects
  absent/0/other; revealAll uncovers every in-bounds tile (96² → 9216, off-map stays dark). 645 + 2 = 647.
- Files: src/sim/fog.ts (+revealAllRequested, +revealAll), src/sim/index.ts (exports),
  src/scenes/IsoScene.ts (debugRevealAll field, reveal-all in seedFogAroundPlayer, showScoutCue +
  hudFx + flyToDistrict scouting cue, stale 64²→96² comment), tests/reshape.test.ts (+2).
- Gate: typecheck ✅  build ✅  test ✅ (647). ?reveal=1 shows the full sparse city; fly-to-unseen now
  lands with a named, outlined target instead of a black dead-end.
- Commit: rts30a.1: reveal-all flag + scout hint for map UAT — green

## RTS-30b-ground (Ground plane + static set dressing) — GREEN  (2026-06-22)
- Summary: Render the GROUND PLANE + scatter STATIC SET DRESSING so the sparse 96² city reads as a
  living period city instead of buildings floating in black void (Cowork's ?reveal=1 finding: the
  ground between buildings + the dressing weren't drawn). VISUAL-ONLY — no economy/content/logic/balance
  change; tick/applyCommand untouched; /src/sim stays Phaser-free; procedural/vector only. NO moving
  entities (pedestrians/traffic) and NO new building categories — those are the later Tier-3 / living-
  city passes. 647 → 651 green (+4 pure scatter/sidewalk tests).
- ROOT CAUSE of the "void": GROUND_COLOR painted every kind near-black + undifferentiated (ground
  0x1a1a1a, avenue 0x141210, street 0x1b1917) with no seams/curbs/parks/plazas/fountains or props, so
  with ?reveal=1 the whole map read as black. The data was correct-by-construction; only the render was
  missing.
- 1) THE GROUND PLANE (drawn INTO the existing viewport-culled drawGround) — a new GROUND_TONES
  [lit,shadow] 2-tone per tile kind (low-contrast soot paving, clearly differentiated, never flat
  black), checker-picked per tile. Per-kind detail at CLOSE+MID (dropped at FAR by LOD): AVENUE/STREET
  get a dark lane seam; SIDEWALK (newly classified, see below) gets a light CURB edge; PLAZA gets a deco
  inlay cross; PARK gets grass tufts. FOUNTAINS — each district's plaza landmark — draw as concentric
  basin ellipses + a slow (900ms, calm/ambient) water shimmer, only for the revealed, in-view districts
  (~9 max, never per-tile). The black gaps are now asphalt avenues, curbed sidewalks, grass parks, deco
  plazas + fountains.
- SIDEWALKS: worldgen never classified them. Added a pure paintSidewalks pass — open 'ground' tiles
  orthogonally fronting an avenue/street become 'sidewalk' (derived last, reads only road kinds → no
  cascade, never overwrites a building/park/plaza). This both gives the curb read AND lays the
  sidewalk graph a future pedestrian pass will walk. (~1253 sidewalk tiles at 96².)
- 2) STATIC SET DRESSING — a new PURE scatterProps(layout, seed) in worldgen.ts places faction-NEUTRAL
  scenery driven entirely by the tile classes: lampposts + hydrants/mailboxes on sidewalk corners,
  curbside parked cars on roads (touching a sidewalk), trees/benches in parks + plazas, trees/fences on
  the open yard 'ground' setbacks — NEVER on a 'building' tile, so a prop can never read as interactive.
  ~300 props on the 9216-tile map (3.3% — lived-in, not cluttered; keeps the ~90% soot read). New baked
  cached textures (cityArt): tree, hydrant, mailbox, bench, fence (all muted greys/browns/greens — no
  brass, no rival-red, honoring the colour reservation); lamppost + neutral car reused.
- 3) PLACEMENT — deterministic per (layout, seed) so a city is stable; density tuned sparse; props sit
  only where the ground type allows (cars curbside, trees in yards/parks, hydrants/mailboxes on sidewalk
  corners). At most one prop per tile.
- ⭐ PERFORMANCE (held): the ground enrichment draws through the SAME culled drawGround (only the
  cam.worldView tile window, padded) — cost bounded by SCREEN, not the 96² map; detail is LOD-dropped at
  FAR (the existing bulk-soot path). Props are baked-ONCE cached textures (the established lamppost/car
  pattern), placed as static Images, and kept cheap by: (a) FAR-LOD bulk-hide of ALL props at the
  strategy zoom (one threshold-cross pass), (b) fog-gating — props start hidden and are revealed by an
  in-place swap-remove scan (NO per-frame allocation) that's skipped entirely on frames where the fog
  didn't grow (size-gated → O(1) at rest). No iterating the full tile array per frame; no new hot-loop
  allocation. ~300 cached sprites is trivial for the batcher. FPS can't be sampled headlessly — the
  live [P] overlay remains for Cowork; the culled/cached/LOD'd structure says the baseline holds.
- TESTS (+4, all pure): scatterProps determinism per (layout, seed) + never on a building tile;
  per-kind tile-class legality (cars on roads, trees in parks/yards, lamppost/hydrant/mailbox on
  sidewalks, …); sparseness (≤1 prop/tile, < 10% of tiles); sidewalk classification (every sidewalk
  fronts a road; no business tile became a sidewalk). 647 + 4 = 651.
- Files: src/sim/worldgen.ts (paintSidewalks + scatterProps + PropKind/PropPlacement), src/sim/index.ts
  (exports), src/scenes/cityArt.ts (bakeTree/Hydrant/Mailbox/Bench/Fence + TEX keys), src/scenes/
  IsoScene.ts (GROUND_TONES + groundDetail + drawFountain in the culled drawGround; PROP_SPECS +
  drawSetDressing + updateDressingVisibility + fields), tests/world.test.ts (+4).
- Gate: typecheck ✅  build ✅  test ✅ (651). With ?reveal=1 the map now reads as a city: wide asphalt
  avenues with lane seams, curbed sidewalks, grass parks with tufts/benches/trees, deco plazas with
  fountains, and ~300 scattered neutral props filling the void — culled + cached + LOD'd so the frame
  rate holds, and NOT one moving entity or new building category was added (Tier-3).
- Commit: rts30b-ground: ground plane + static set dressing — green

## RTS-30 LIVING-CITY PASS 1 (Ambient pedestrians + cars) — GREEN  (2026-06-22)
- Summary: The highest life-per-frame layer + THE frame-budget test — pooled ambient PEDESTRIANS + a
  few CARS strolling/rolling the city the RTS-30b ground layer drew. ONLY this: no animals/vendors/
  buses/construction (Pass 3), no new buildings (Pass 2), no gameplay hooks. VISUAL-ONLY — no economy/
  content/logic/balance change; tick/applyCommand untouched; /src/sim Phaser-free; procedural/vector
  only. 651 → 661 green (+10 pure pool/graph/step/liveliness tests).
- THE GOVERNING LAW (honored): ambient life is faction-NEUTRAL (muted greys/browns only — pedestrian
  coats #3A3733/#4A4036/#3A2C20/#5A5043, civilian cars dull #23211E, taxi a MUTED checker
  #4A4036/#2E2B27, never yellow; NO brass, NO rival-red), visually SUBORDINATE (~14px peds / ~24px cars
  vs the 56px units, flatter, lower-contrast, no accent/glow/badge), on non-interactive tiles only
  (sidewalks/roads), calm motion (~⅓ unit speed). A ped/taxi can't be mistaken for a brass thug or a
  red rival.
- 1) GRAPHS (pure src/sim/cityGraph.ts) — buildCityGraph(layout) precomputes ONCE from the ground tile
  classes: a SIDEWALK graph (per-tile 4-bit neighbour adjacency + a node list) for pedestrians + a
  ROAD-LANE graph (avenue/street) for vehicles. O(map) once; no per-frame graph cost. (96²: 1253
  sidewalk nodes, 5100 road nodes, built in ~6ms at map load.)
- 2) PEDESTRIANS — ~14px stick-with-mass figures (coat capsule + flesh head dot + hat brim + a 2-frame
  leg tick, no face; 4 coats × 2 frames baked in cityArt). Walk the sidewalk graph at 0.42 tiles/s,
  pickStep() continues straight 60%, turns at corners, never U-turns unless dead-end, 6% window-shop
  pause. POOLED + capped, spawned within the cull ring on sidewalk tiles, returned to the pool when
  culled offscreen >2s.
- 3) CARS/TAXIS — ~24px simplified cars (body + cabin + window glint + 2 wheels + a faint warm
  headlamp; far smaller/flatter than the 64px hero Cadillac). Follow the road graph, prefer to keep
  heading (lane flow), light spacing (won't step onto a tile another car holds), brief dead-end/traffic
  pause; flipX approximates iso facing. ~28% spawn as the muted-checker taxi. POOLED + capped.
- 4) LOD + CULL — only agents inside the camera worldView + a 1-tile margin (160px) are simulated;
  offscreen ones freeze and return to the pool after 2s. MID (zoom 0.45–0.8): caps halved + ped walk
  frames frozen (static dots). FAR (<0.45): ALL moving life culled — so the most-tiles-in-frame zoom is
  the CHEAPEST for ambient life (the budget self-balances). gridToScreen inlined in the hot loop (no
  Vec2 alloc); reverse-iterate + swap-remove cull (no per-frame allocation).
- POOLING (mandatory, done) — pools pre-allocate ALL sprites at construction (the configured liveliness
  cap); spawn = activate a pooled agent, despawn = return it. ZERO per-frame allocation. Built BEFORE
  setupUiCamera so the pre-allocated sprites land in the world-camera partition (the fixed HUD camera
  ignores them — no ghosting).
- LIVELINESS SETTING — ?life=low|med|high (default MED), the single perf dial: low 15p/4c, MED 30p/8c
  (the recommended ship), high 45p/12c. Pure parseLiveliness + LIVELINESS_CAPS (tested).
- ⭐ PERF GATE (the whole point of Pass 1): the per-frame cost is N moving agents translating. Measured
  the agent-logic CPU on the real 96² graph: at the MED cap (30p+8c = 38 agents) it is ~3 µs/frame
  (~0.018% of a 16.6ms/60fps frame); at HIGH (57 agents) ~0.7 µs/frame post-warmup. The render side
  adds ≤38 cached sprites to the batcher (trivial — it batches thousands) and FAR culls them entirely.
  CONCLUSION: ambient life cannot move FPS off the rts30b baseline — the moving-agent budget is
  effectively free at MED. (A true browser-composited FPS can't be sampled in this headless env; the
  live [P] overlay now reads `life Np/Mc` so Cowork can confirm the GPU FPS at CLOSE with full caps.)
- DEFERRED (noted, not Pass 1): per-car night headlamp GLOW object (the baked lamp is a faint static
  dot for now); edge-only spawning (agents currently spawn anywhere in the cull ring so the city fills
  immediately for the ?reveal=1 showcase) — both cheap polish for a later pass.
- TESTS (+10 pure): Pool (pre-alloc/activate/return/exhaust + the reverse-iterate-release cull pattern);
  graph build (nodes match the tile classes, adjacency links only same-kind, deterministic); pickStep
  (dead-end −1, straight-bias, no-U-turn-unless-forced, only returns set bits); parseLiveliness +
  caps ordering. 651 + 10 = 661.
- Files: NEW src/sim/pool.ts, src/sim/cityGraph.ts, src/scenes/ambientLife.ts, tests/livingCity.test.ts;
  src/sim/index.ts (exports), src/scenes/cityArt.ts (bakePed ×8 + bakeCarLite/taxi + PED_COATS/
  pedTexKey), src/scenes/IsoScene.ts (instantiate AmbientLife before setupUiCamera; update() tick; [P]
  overlay life counts).
- Gate: typecheck ✅  build ✅  test ✅ (661). With ?reveal=1 the city now breathes — tiny grey
  pedestrians stroll the sidewalks and a few dull cars/taxis roll the avenues, all muted/subordinate,
  culled at FAR; measured agent CPU ~3 µs/frame at the MED cap (≈0.018% of a frame) so the baseline FPS
  holds. No moving entity can be mistaken for a unit; no animals/buses/buildings added (later passes).
- Commit: living-pass1: pedestrians + cars — green

## RTS-30b-ui (HUD declutter + clickable hotkey toolbar) — GREEN  (2026-06-23)
- Summary: Make the HUD mouse-first + less cluttered (the human playtest flagged: too many options eating
  screen, keyboard forced). UI-ONLY — no economy/content/logic/balance change; tick/applyCommand
  untouched; /src/sim Phaser-free; the camera world/HUD split preserved (HUD on the fixed UI camera).
  661 → 667 green (+6 pure toolbar-state tests).
- ⭐ CLICKABLE HOTKEY TOOLBAR — every key verb is now a mouse button. A centred bottom strip of buttons,
  each `icon NAME [hotkey]`, clicking runs EXACTLY what the key does (verified: all 12 run() targets are
  real methods, pointerdown-wired):
  • CORE: ⊕ EXTORT [E]→commandExtort · $ COLLECT [C]→commandCollect · ▲ REINVEST [R]→commandReinvest ·
    ✦ GREASE [G]→commandGrease · ♣ VICE [U]→commandViceUpgrade · ☷ KREW [K]→toggleCrew.
  • OFFENSE: ⚔ RAID [1] · ✷ SABOTAGE [2] · ☠ HIT [3] · ⛒ LOCKOUT [4] (→commandRaid/Sabotage/Assassinate/
    Lockout). • BUILD: ⬢ EXPAND [5]→commandExpand · ＋ RECRUIT [6]→commandRecruit.
  Each button shows its hotkey (teaches the shortcut, doesn't require it) + a READY/CONDITIONAL/LOCKED
  chip (brass / bone / dim) reusing the verb-chip treatment, and a plain-English hover TOOLTIP (what it
  does + how/cost). Keyboard still works as an accelerator. A toolbar press swallows the next world-click
  so it never box-selects/deselects beneath the HUD.
- ⭐ DECLUTTER / PROGRESSIVE DISCLOSURE — the text "⚔ ACTIONS [1-6]" board is RETIRED (its actionTitle/
  actionBody are no longer created; refreshActionBoard early-returns) and fully replaced by the more
  compact, clickable toolbar — a net reduction in always-on text + a mouse surface. The OFFENSE group
  (Raid/Sabotage/Hit/Lockout) is HIDDEN until at least one unlocks (early game shows only the relevant
  core + build verbs, not four locked war verbs). The whole bar tucks while the Market is open. Hotkey
  hints that cluttered panel titles now live on the buttons. Legibility held — declutter is by HIDING/
  GROUPING, not shrinking text (button labels are the 12px display face; chips re-colour ONLY on state
  change to protect the rts25 raster budget).
- INTUITIVENESS — the chip makes the primary action obvious (an idle thug + a focused [%] front ⇒ EXTORT
  goes brass/READY; nothing to bank ⇒ COLLECT dims/LOCKED). Mouse-first throughout; tooltips on every
  button.
- HUD-ANCHOR PRESERVED — the toolbar + tooltip are scrollFactor-0 objects built in drawHud BEFORE
  setupUiCamera, so the world/HUD camera snapshot puts them on the FIXED UI camera (main.ignore'd). They
  do not drift/reflow on zoom or pan (same split as every other panel). ?reveal / ?life / ?market flags +
  all existing functionality intact.
- TESTS (+6 pure, tests/toolbar.test.ts): the core-verb chip states — KREW always READY; COLLECT
  LOCKED→READY on pending takings; REINVEST gated on affordable racket; GREASE on cash; EXTORT/VICE the
  LOCKED→CONDITIONAL→READY context ladder. New pure src/sim/toolbar.ts (canCollect/canReinvest/
  coreVerbState). 661 + 6 = 667.

### STEP 0 housekeeping
- ⚠ CANON.md repo-fix — NOT done, BLOCKED: the prompt's "CANON.md (overwrite …)" section was an empty
  placeholder (`[paste the full rewritten CANON.md text here …]`) — no actual replacement text was
  provided. I did NOT overwrite the repo's CANON.md (overwriting canon from a placeholder would destroy
  it). NOTE: the staleness markers the prompt cites (Army/Savings bribery sliders, "156 tests") are NOT
  present in the current repo CANON.md (it's the original Fedora-Noir canon, brass #c79a4b, Phases
  11–17) — so the "stale copy" being auto-committed may be a DIFFERENT artifact than what's in the repo
  now. → Please paste the rewritten CANON.md content next turn and I'll overwrite + commit it.
- ⚠ RUN_LOG concurrency finding — YES, the LegalCrimeSync scheduler and I CAN collide on RUN_LOG.md (and
  CANON.md), two ways: (1) both append to RUN_LOG.md on the same branch → near-tail `git merge`/pull
  CONFLICTS + push races (a scheduler commit landing between my pull and push makes my push a
  non-fast-forward REJECT — my retry logic only re-tries NETWORK errors, so it wouldn't auto-resolve a
  reject; it needs a pull --rebase). (2) CANON.md: the scheduler re-committing its stale copy would
  REVERT any CANON fix I push (the fix won't stick). RECOMMENDED FIX (reported, NOT implemented — no
  scheduler change made): remove RUN_LOG.md AND CANON.md from the scheduler's scoped file list (both are
  engineer-owned artifacts) — this resolves both the revert-war and the RUN_LOG conflict; secondarily,
  give the scheduler (and my push) a pull --rebase-before-push so a race degrades to a rebase, not a
  reject.
- /docs MOVE — created docs/HUD_SPEC.md (the only one of the five specs whose content exists in the repo,
  copied from the root HUD_SPEC.md). docs/VISUAL_DIRECTION.md already present (left intact). COULD NOT
  populate (content not pasted + not in repo): WORLD_REWORK_SPEC.md, LIVING_CITY_SPEC.md,
  RTS29_RESHAPE_SPEC.md, PROCEDURAL_ART_SPEC.md, and the new CANON.md — please paste these next turn and
  I'll add them to /docs so RTS-30c's spec can live there instead of a paste.
- Gate: typecheck ✅  build ✅  test ✅ (667).
- Commit: rts30b-ui: HUD declutter + clickable hotkey toolbar — green

## RTS-30c-1 (Turf war core + collector interception switched on) — GREEN  (2026-06-23)
- Summary: The mid-game depth — rival activation, contested districts, the presence-based contest,
  attack/defend, and the per-district interception switch-on. CORE ONLY (no raids-as-content,
  demolitions, specializations, scripted events, or arc tuning — those are 30c-2/3). LAW held:
  tick/applyCommand untouched (the war settles AROUND the tick in the real-time wrapper / scene);
  /src/sim PURE & Phaser-free; war UI on the fixed HUD camera / worldFx(); 50/70/85 ladder + four
  channels unchanged. 667 → 674 green (+7 pure turf-war tests; +1 premise-changed test updated).
- 1) RIVAL ACTIVATION — once dormancy lifts (wk3, RIVAL_DORMANT_WEEKS), `activateContests` opens a
  contest on a BORDER district (a district the player has a stake in, adjacent to a rival foothold —
  foothold = legacy control presence OR an earned business, so it triggers as a rival expands toward
  you). Escalates gradually: 1 contest at the wake, +1 every CONTEST_ESCALATE_WEEKS, capped at
  CONTEST_MAX (3). The scene moves VISIBLE blood-red rival muscle (enforcer units) into the block.
- 2) CONTESTED STATUS — new pure `state.contests`; `districtStatusOf` now emits CONTESTED while a
  contest is active (the status reserved since RTS-30a). Reads on the MAP — an AMBER district wash with
  a ~1.6s pulse in the culled drawGround + an amber nameplate — AND in the "THE CITY — WHAT'S YOURS"
  roster (status + `⚔ contested NN%`). Amber is neither brass nor rival-red (red discipline held).
- 3) THE CONTEST MECHANIC (presence-based, READABLE) — pure `resolveContestStep(state, presence)`:
  each pulse shifts a per-district pressure meter by NET MUSCLE (rival enforcers minus player thugs
  physically IN the district, counted by unit position). Cross +CONTEST_FLIP → one player business
  FLIPS to the invader (extortedBy/ownerFamily → rival) so the roster hold % visibly drops (the
  inspectable truth — no dice mystery). Bleed-back after a flip means each block must be re-earned.
- 4) ATTACK / DEFEND — DEFEND: send thugs into your contested district (right-click move) → player
  presence rises → net goes negative → pressure falls; cross −CONTEST_PUSHOUT and you REPEL the invader
  (contest ends "held") AND claw one block back. ATTACK: flooding muscle into a contested block is what
  drives the pushout. A stalemate (equal muscle) holds the line (pressure parks at 0). Reuses the
  positional muscle the player already commands; no parallel system invented.
- 5) ⭐ COLLECTOR INTERCEPTION SWITCHED ON, PER DISTRICT — `collectorVulnerableInDistrict(state, id)
  === districtContested(...)`. Mechanically: rival enforcers exist ONLY inside contested districts and
  are steered to chase player CARRIERS within that district (targets clamped in-district), so the
  EXISTING interception (resolveInterceptions, already running in updateAndObserve) robs a collector
  that routes through a war zone → its cash transfers to the rival; UNCONTESTED districts have no
  enforcers → stay SAFE (early game unaffected). The endangered collector reads via the existing
  DANGER-RED pulsing threat ring (threatenedCollectors) + the ROBBED ambush beat (flashAmbush). The
  global `collectorsVulnerable === !rivalsDormant` is kept as the "is the war on at all" flag (the
  reshape test premise stands); the NEW per-district flag is the actual gate.
- 6) READABILITY — CONTESTED amber (map wash pulse + nameplate + roster), rival invaders static
  blood-red identity, the active rob threat pulsing danger-red, the player always brass; hold % in the
  roster says who's winning.
- TESTS: +7 pure (tests/turfContest.test.ts) — border activation + escalation (dormant→1→cap); the
  presence contest (more rival muscle erodes hold % then flips a business; out-mustering repels "held";
  stalemate holds); per-district vulnerability (contested robbable, uncontested + undefined safe);
  districtStatusOf emits CONTESTED only while contested. CHANGED: tests/world.test.ts "CONTESTED never
  produced" → "not produced AT REST" (premise legitimately changed — the war slice now produces it; the
  contest-driven behaviour moved to turfContest.test.ts). The legacy tests/turfWar.test.ts (RTS-16
  engine) is untouched + green.
- PLAY-THROUGH (exercisable, what a human/Cowork will see): extort a couple of fronts so you hold a
  border district → around wk3 a rival's expansion reaches your border → a CONTEST opens: the district
  flashes AMBER (map + nameplate + roster CONTESTED) and 2 blood-red rival enforcers march in → a
  collector whose route crosses that block lights up DANGER-RED and, if it gets close to an enforcer,
  is ROBBED (cash to the rival, the "ROBBED" beat) → you right-click your thugs into the district;
  once your muscle outnumbers theirs the pressure falls, you REPEL the invasion (it clears amber, you
  claw a block back); if you ignore it, the pressure climbs and your blocks flip to the rival (roster
  hold % drops) until the district falls.
- HOUSEKEEPING: (b) push is now rebase-safe — `git pull --rebase` before every push (degrades a
  LegalCrimeSync race to a rebase, not a reject). (c) CANON via Drive — SUCCEEDED: read file id
  18R37GKeapj9scGnFvR6ABIox4yUGMlhF, un-escaped it, and OVERWROTE the repo's stale /CANON.md (the repo
  copy was the original "Phases 11–17 / five mechanics" canon; replaced with the 2026-06-23 rewrite —
  four channels Beat/Bench/City Hall/Bureau, re-timed collector, control = district status, sparse 96²
  world, three win paths). The new canon's own §2 CONFIRMS the RUN_LOG concurrency bug: RUN_LOG.md is
  in BOTH the LegalCrimeSync scope AND written by Code — so the rebase-safe push (b) is the mitigation
  on Code's side. (d) committed the embedded spec to docs/RTS30C_WAR_SPEC.md for 30c-2/3.
- Gate: typecheck ✅  build ✅  test ✅ (674).
- Commit: rts30c-1: turf war core + collector interception switched on — green

## RTS-30c-1.1 (Reconcile turf-war authority + resolve stuck state) — GREEN  (2026-06-23)
- Summary: A RECONCILE/tuning pass fixing a design-integrity bug a UAT found by PLAY (not the gate): the
  VISIBLE pressure meter sat at 0 for a whole war while the contested district's blocks STILL flipped to
  the rival — a BACKGROUND strategic-capture pulse was taking blocks off-board during skipped/advanced
  weeks while the on-screen meter froze. Two systems decided a contested district's fate; the hidden one
  won — breaking the pillar "the hold % is the inspectable truth" and leaving contests STUCK open
  (pressure never hit FLIP, enforcers parked forever). No new content/units/war-actions (that's 30c-2).
  tick/applyCommand untouched; /src/sim pure. 674 → 676 green (+2 net; 1 premise-changed test updated).
- ROOT CAUSE: the contest meter (scene `tickWar`) ran on RAW real-time `dt`, but `observeWorld`
  (economy + the legacy `advanceStrategy` capture) ran on the SCALED/skip-week `stepDt`. So a skipped or
  fast-forwarded week advanced the background capture many sim-weeks (flipping blocks via applyCapture)
  while the contest meter barely moved → "meter shows 0, blocks vanish."
- ⭐ FIX 1 — ONE AUTHORITY, AND IT'S VISIBLE (approach: SUSPEND the background capture in contested
  districts). `rivalStrategicTarget` now EXCLUDES any district with an active contest (reads
  state.contests directly — no import cycle), so the legacy strategic-capture pulse can't target/flip a
  contested district off-board. In a contested district the ONLY thing that flips blocks is
  `resolveContestStep` — the visible presence meter. The rival still expands into NON-contested ground
  (the legacy engine + Domination feed are intact).
- ⭐ FIX 2 — RESOLVE THE STUCK STATE (two parts):
  (a) The contest pulse now runs on the SIMULATED `stepDt` (a capped while-loop), so it keeps pace with
      skipped/fast weeks — a skipped week fires the pulses it should, and the meter moves with the clock
      instead of freezing.
  (b) New `CONTEST_INVADER_DRIFT` (1) is added to net presence each pulse: the invader has the
      INITIATIVE, so the meter can NEVER sit at a dead 0 — an even match slowly climbs to FLIP →
      resolves "lost"; the player must OUT-muster the invader (player > rival) to drive it down to
      −PUSHOUT → "held". Either way the contest always trends to a resolution (no parked-enforcers limbo).
- FIX 3 — STRONGER AMBER WASH: the contested map wash went from alpha 0.06–0.13 (too faint; the HUD
  carried the read) to 0.20–0.34 pulsing, on a brighter amber (#e8a53a). The war now reads on the MAP at
  the resting zoom, still soot-friendly and neither brass nor rival-red (red discipline held).
- FIX 4 — ACTIVATION TIMING: dormancy = 3 weeks is correct (canon). The first contest now opens at
  ~wk3, not the UAT's ~wk6 — the wk6 was the OLD real-time-gated pulse lagging the sim clock; the FIX-2a
  stepDt drive pulls activation back in step. Verified by a deterministic probe: PATH A (player extorts
  toward a rival) opens at wk3; PATH B (player turtles in the home district) also opens at wk3 (rival-a
  expands into the adjacent district within the first awake week, so the home district borders a rival
  foothold by wk3). No timing code change beyond the stepDt drive.
- TESTS: +2 net (tests/turfContest.test.ts now 9). CHANGED: the "stalemate (equal muscle) parks at 0"
  test → "INVADER INITIATIVE: an even match trends to the invader (never a dead 0); out-mustering holds"
  (premise legitimately changed — the drift removed the dead-0 by design). ADDED: "ALWAYS RESOLVES" (a
  sustained even match reaches a resolution within bounded pulses — the stuck-state guarantee); and "ONE
  visible authority" (running resolveStrategicPulse 20× leaves a contested district's hold % UNCHANGED —
  no off-board flip — while resolveContestStep DOES flip it: the meter is the sole authority). The legacy
  tests/turfWar.test.ts is unaffected (those setups have no contests → the exclusion is a no-op).
- PLAY-THROUGH (what it now shows): a border district goes CONTESTED at ~wk3 and reads clearly amber on
  the map; the VISIBLE meter climbs under the invader's initiative (even if you match their muscle), and
  it is THAT number that flips your blocks — nothing changes off-board. Skip/fast-forward a week and the
  meter advances with the clock instead of freezing. Send MORE thugs than the invaders and the meter
  falls and the contest RESOLVES "held" (amber clears, enforcers leave, you claw a block back); ignore it
  and it climbs to FLIP and resolves "lost" (the district falls) — no stuck-at-0 limbo either way. (The
  ROB + recruit-and-REPEL paths are the human-playtest items this headless gate structurally can't force.)
- Gate: typecheck ✅  build ✅  test ✅ (676).
- Commit: rts30c-1.1: reconcile turf-war authority + resolve stuck state — green

## RTS-30c-2a (Weapon-tier enforcers + demolitions specialist, channel-gated) — GREEN  (2026-06-23)
- Summary: Add the CANON REV-b roster's combat/specialist units as channel-gated, ABSTRACT mechanics
  plugging into the validated turf war. NOT building the patrol behavior, the contextual action-icon UI,
  or deeper demolition visuals (that's 30c-2b — needs Design's icons). tick/applyCommand untouched;
  /src/sim pure; balance CANDIDATE + centralized. 676 → 684 green (+8 pure enforcer tests).
- ⭐ ABSTRACTION RULE HELD: each unit is a costed, channel-gated, heat-bearing strategy ROLE — cost /
  eligibility / gate / heat / presence / outcome ONLY. NO procedural depiction of violence/weapons/
  evasion; the "weapon" is a stat + a readable silhouette (the Thompson Man already carries a gun shape
  in canon), never an instruction.
- THE FIVE UNITS (CANDIDATE balance, centralized in src/sim/enforcers.ts ENFORCER_SPECS — tune on data):
  • PISTOL MAN — The Beat (police) ≥ $10/wk · $350 · +2🔥 · skill 4 · presence 1.4 (light early pressure).
  • SHOTGUN MAN — The Beat ≥ $25/wk · $500 · +3🔥 · skill 5 · presence 2.2 (STRONG in-district presence).
    Bandolier silhouette is BRASS-DARK, never rival-red (red discipline).
  • RIFLE MAN — The Beat ≥ $40/wk · $650 · +4🔥 · skill 6 · presence 1.8 (district-edge; a readable
    strategy unit, not a sniper sim — a long gun across the body, gunmetal).
  • HITMAN — The Bench (judges) ≥ $30/wk · $1500 · +10🔥 (very high) · skill 8 · presence 1.6 → powers
    [3] Assassinate (its skill feeds familyStrength → the ASSASSINATE_MIN_STRENGTH gate). Its ONLY accent
    is BONE-WHITE (motion-discipline — no static danger colour).
  • DEMOLITIONS — City Hall (politicians) ≥ $30/wk · $900 · +8🔥 (very high) · skill 5 · presence 1.5 →
    powers the wreck ([2] Sabotage). Dynamite-cluster silhouette is BRASS-DARK, never rival-red.
- CHANNEL GATE: pure `enforcerGate(state, tier)` — LOCKED below the channel's grease level with a clear
  reason ("needs The Beat ≥ $N/wk"), reusing the locked-affordance treatment; then a cash gate. Modelled
  exactly on the existing canLockout `bribes.feds ≥ REQ` pattern.
- RECRUIT (pure `recruitEnforcer`): checks the gate, deducts the cost, adds the heat, and adds a skilled
  crew member (joins the krew roster + feeds familyStrength). The scene then spawns the on-map unit.
- TURF-WAR PARTICIPATION: a new `weapon?: WeaponTier` on MovableUnit; the contest's player presence is
  now a WEIGHTED sum (`enforcerPresenceWeight`: thug 1, pistol 1.4, rifle 1.8, shotgun 2.2…) instead of
  a head-count — so fielding a Shotgun Man in a contested district pushes the meter harder. Pure
  `totalMusclePresence` is unit-tested; the scene's contestPresence uses the same weights.
- DISTINCT SILHOUETTES (cityArt `bakeEnforcer`): each tier reuses the period rich body (player BRASS)
  with one readable "tell" — pistol sidearm, shotgun bandolier+stub, rifle long-gun, hitman bone-white
  hat + long coat, demolitions dynamite pack — all tellable apart at unit scale. Verified: NO rival-red
  / danger colour anywhere in the player enforcer art (red discipline: player = brass; danger = motion).
- SURFACED + EXERCISABLE: [6] / the toolbar RECRUIT button now opens a RECRUIT MENU (mouse-first, reuses
  the context-menu infra) listing a plain Thug + the 5 specialists, each with its $cost + channel + heat
  and a READY (brass) / LOCKED (fog + "needs The Beat ≥ $N/wk") chip. Clicking a ready row recruits it:
  it joins the crew AND spawns a fieldable, selectable on-map unit at HQ (so you can march it into a
  contested district to defend). Wiring verified end-to-end (key + toolbar → commandRecruit →
  openRecruitMenu → recruitThug/recruitSpecialist → recruitEnforcer + spawnPlayerMuscle → addUnit →
  attachView w/ the baked silhouette).
- TESTS (+8 pure, tests/enforcers.test.ts): the channel gate (locked under threshold w/ the channel name
  in the reason, unlocked at/above), the cash gate, recruit cost deduction + heat contribution + crew/
  strength gain, a locked recruit is a no-op, the Hitman's high-heat, the presence-weight ordering +
  totalMusclePresence (ignores collectors), and recruitableEnforcers lists all five. 676 + 8 = 684.
- PLAY-THROUGH: grease The Beat to $25/wk → in the RECRUIT menu the SHOTGUN MAN flips from LOCKED ("needs
  The Beat ≥ $25/wk") to READY → click it: $500 spent, heat +3, a Shotgun Man joins the crew and appears
  on the map at HQ with its distinct bandolier silhouette (brass, no red) → select it, march it into your
  CONTESTED district → it adds 2.2 to your muscle presence (more than a thug), helping the visible meter
  fall toward "held." Grease The Bench → the HITMAN unlocks; recruiting it (very high heat) pushes crew
  strength toward the [3] Assassinate gate.
- Gate: typecheck ✅  build ✅  test ✅ (684).
- Commit: rts30c-2a: weapon-tier enforcers + demolitions specialist (channel-gated) — green

## RTS-30c-2b (Contextual action-icon UI + patrol behavior) — GREEN  (2026-06-23)
- Summary: The selected-unit action-icon CARD + the PATROL stance + folding in two of Design's signature
  silhouette tells. No deferred living-city hooks / no new combat systems. tick/applyCommand untouched;
  /src/sim pure; render Phaser-side; HUD on the fixed UI camera. 684 → 692 green (+8 pure tests).
- ⭐ CONTEXTUAL ACTION-ICON CARD — select a player unit and a row of clickable DECO ICON CHIPS appears
  (bottom-left, above the context card, on the fixed HUD camera — no drift). It shows ONLY the verbs in
  THAT unit's repertoire (pure `unitRepertoire`/`unitActionChips`):
  • combat muscle (thug/pistol/shotgun/rifle): move · attack · extort · patrol · collect · raid · expand · recruit
  • HITMAN: move · assassinate · patrol · collect · recruit   • DEMOLITIONS: move · demolish · sabotage · patrol · collect · recruit
  • COLLECTOR: move · collect (near-passive).
  Each chip is a brass-line deco glyph on an aged-paper chip (stepped-deco corners + a soot hotkey tab),
  ENABLED when valid or GREYED (alpha 0.4) with a why-LOCKED hover tooltip (reusing the action-chip
  treatment). Clicking a chip runs EXACTLY what its hotkey runs — verified end-to-end: chip pointerdown →
  runVerb(verb) → the real command (commandExtort/Collect/Sabotage/Assassinate/Raid/Expand/Recruit/
  AttackBusiness/Patrol). Supplements the global toolbar; does not replace it.
- ⭐ KEY DISCIPLINE HELD IN THE UI — the violent-verb glyphs (attack = crossed chevrons, sabotage =
  cracked gear, demolish = plunger + deco shards, assassinate = reticle) are all CALM BRASS-LINE on
  paper. NO red, no danger colour, no gore in any static icon (grep-verified) — the danger lives only in
  the motion beat on the board when the action fires. Danger stays motion-only, even in the UI.
- ⭐ PATROL (the approved small mechanic) — a guard STANCE: [Q] (or the Patrol chip) toggles `patrol` on
  the selected muscle; a patrolling unit LOOPS its current district (steerPatrols) and contributes a
  flat `PATROL_PRESENCE_BONUS` (0.8, CANDIDATE) ON TOP of its weapon weight to the turf-war contest in
  that district (pure `unitMusclePresence`; contestPresence now sums it). So setting a Shotgun Man to
  patrol a CONTESTED block pushes the visible meter harder toward "held". Canon-neutral — no economy/
  channel touch; a collector contributes nothing (patrol or not).
- ASSIGNED HOTKEYS — the two glyphs that shipped with an empty "·" tab now have keys: PATROL = [Q],
  DEMOLISH = [V] (the wreck of a rival income node → commandSabotage). Shown on the chips + added to the
  help legend. (Move/Attack remain right-click; their chips show "·" and a hint.)
- SILHOUETTE REFINEMENTS (folded from Design) — the 30c-2a tiers already obeyed the red rules; added the
  two missing UNIQUE TELLS from Design's matrix: the HITMAN's bone-white EMBER dot (static bone-white —
  the fast pulse "when working" is motion-only, not a static danger dot) and the DEMOLITIONS man's
  TOOL-CASE (gunmetal box + brass-dark handle) in the off hand. Bandolier + dynamite stay brass-dark
  (#7A5A1E)/gunmetal — never rival-red. Verified: no red/danger colour token in any player silhouette or
  any action icon (the only "danger" string is a code comment).
- TESTS (+8 pure): the per-unit repertoire (collector = move+collect; hitman leads assassinate, no
  extort/raid; demolitions has demolish+sabotage; muscle gets the street kit); per-verb enabled/locked
  (move/patrol/recruit always; collect locks with no takings; extort/attack reflect the target context;
  the hitman chip carries the real [3] hotkey); and the patrol presence bonus (patrol > idle by the
  bonus; a collector contributes 0). tests/actionCard.test.ts. 684 + 8 = 692.
- PLAY-THROUGH: select a Shotgun Man → its valid action icons appear (move/attack/extort/patrol/collect/
  raid/expand/recruit), greyed where not applicable with a why-tooltip → click the PATROL chip (or [Q]):
  it starts looping its district and its muscle presence rises by +0.8 on top of its 2.2 weapon weight,
  so if that block is CONTESTED the visible contest meter falls faster toward "held". Click EXTORT with a
  [%] front focused → it runs exactly the [E] command. Select a Hitman → the ASSASSINATE icon leads (real
  [3]); select a Demolitions man → DEMOLISH ([V]) + SABOTAGE show.
- Gate: typecheck ✅  build ✅  test ✅ (692).
- Commit: rts30c-2b: contextual action-icon UI + patrol behavior — green

## RTS-30c-2b.1 (Action-chip ACTIVE state — patrol read) — GREEN  (2026-06-23)
- Context: RTS-30c-2b (the contextual action-icon card + patrol + silhouette tells) already shipped at
  29aacc7, 692 green — the re-sent task carried the full Design spec, which the slice already builds to.
  Verified all ⭐ deliverables present (11 deco glyphs, per-unit action card, patrol + presence bonus +
  [Q], demolish [V], hitman bone-white ember + demolitions tool-case, red discipline; +8 pure tests).
- Gap closed: item 1's chip-state list (ready/hover/ACTIVE/disabled/cooldown-sweep) was only ready/hover/
  disabled. Added the ACTIVE state — the PATROL chip now lights brass (#E3C36A tint) while the selected
  unit is actually on patrol, so you can see at a glance which units hold a beat. Visual-only; no logic
  change. (The animated cooldown sweep-arc stays deferred — cooldown is already reflected as the
  disabled chip + its plain reason from offenseReadout.)
- Gate: typecheck ✅  build ✅  test ✅ (692). No new tests (render-only).
- Commit: rts30c-2b.1: action-chip ACTIVE (patrol) state — green

## RTS-30c-scale (Unit-to-world proportion fix) — GREEN  (2026-06-23)
- Summary: A focused ART/SCALE fix — units rendered far too large vs the environment (a gangster towered
  over lampposts and buildings). Applied Design's "KEEP the unit (~56px anchor), GROW the world" spec.
  Visual/render-tuning ONLY — no gameplay/economy/logic change; tick/applyCommand untouched; /src/sim
  pure. 692 green held (render-side; no pure scale logic to test).
- BUILDINGS (the most-broken, tuned first) — a single tunable `ENV_HEIGHT_SCALE = 3.4` (cityArt)
  multiplies a building's VERTICAL MASSING (`h = style.height * ENV_HEIGHT_SCALE` in drawIsoBuilding);
  the iso FOOTPRINT (hw/hh) is unchanged, so each building still sits on its parcel — it just rises to
  real-street proportion. The whole facade (walls/windows/cornice/trim) derives from `h`, so it scales
  together. Resulting total heights vs the 56px man:
  • storefront ~190px (3.4× the man) · speakeasy ~170px (3.0×) · warehouse ~162px (2.9×) ·
    casino ~231px (4.1×) · HQ ~278px (5.0×, the man = 20% of it). Hits the headline: a man reads ≈18–20%
    of a 2-story (HQ ~5×) and ~⅓ of a 1-story (~3×).
- PROPS — per-class `scale` added to PROP_SPECS (tunable), applied in drawSetDressing:
  lamppost ×3.1 → ~149px (≈2.7× the man) · tree ×2.6 → ~88px canopy · parked car ×1.7 → ~51px tall
  (roof ≈ the man's shoulder, 0.91×) · hydrant ×1.9 → ~27px · mailbox ×1.9 → ~30px · bench/fence ×1.8.
  The HQ hero Cadillac also ×1.7 to match.
- AMBIENT LIFE — `PED_SCALE 2.3` / `CAR_SCALE 2.8` (ambientLife) so the living city stays subordinate to
  the bigger world: pedestrian ~46px (0.82× the man — still clearly smaller, per the rule) · ambient car
  ~39px tall.
- Units UNTOUCHED — the ~56px baked silhouettes stay the anchor (they carry the brass faction read + the
  8-silhouette recognition; FAR-LOD unchanged). Canon intact: brass-only player read, red discipline,
  and the FAR-zoom behaviour are all unchanged (geometry-only edits).
- Occlusion note: taller buildings now occlude a unit standing directly "behind" them (south side) — the
  existing depth-sort keeps units in FRONT reading, and the brass faction base-ring reads at the foot;
  this is correct iso behaviour. No z-lift added (out of scope for a tuning pass).
- Deferred (NOT bundled, per instruction): there is no separate `PLAYER_UNIT_SCALE` shrink in this pass —
  the kaiju fix is "grow the world," and any unit-scale *= 0.7–0.85 tweak remains a separate later art
  item. The `fedoraNoirSpriteGenerator.ts` package is still absent (no sprite swap this pass).
- Gate: typecheck ✅  build ✅  test ✅ (692).
- Commit: rts30c-scale: unit-to-world proportion fix — green

---

## Lane fog-leak-fix — NO-X-RAY cursor repair — GREEN  (2026-07-04)
- Branch: `claude/fog-leak-fix-a22e4g` off `rts/isometric-conversion` (da8f710). **base-visible
  (changes flag-off behaviour) ⇒ under HITL CANON A1 this KEEPS a pre-merge K eyeball — DO NOT MERGE.**
- Summary: Canon-critical NO-X-RAY repair of the pre-existing leak CC flagged on #67 — the hover
  tooltip / left-click "that's a rival" hint / cursor op-preview card / right-click verb routing all
  fog-gated rival identity ONLY under `?combat=1`, so in the shipping base build (flag OFF) a fogged
  rival under the cursor still tooltipped its kind+family, fired the attack hint, popped a preview
  card, and routed 'attack' (crew marches in + a reticle blooms on the fogged tile). A mouse sweep
  over the dark was a free X-ray — independent of `?combat=1`.
- Fix: one fog predicate `IsoScene.isVisibleTile(pos)` (= `debugRevealAll || isRevealed(fog,…)`); every
  cursor channel routes through it UNCONDITIONALLY via two pure fog-safe picks — `pickVisibleUnit`
  (units) and `visibleBusinessAt` (fronts), the twins of `pickUnit`/`businessAtScreen`. `combatCtx`
  reuses the single predicate; `resolveOpPreview`'s parallel `isVis` closure collapses into it — one
  visibility rule, no parallel check. A fogged rival/front now reads byte-identically to empty ground.
  Public district tooltips (base info) untouched.
- Surfaces closed (all cursor/hover/tooltip/click — the dispatch scope): unit hover tooltip,
  left-click hint, cursor op-preview, right-click verb routing; + the fogged-FRONT sibling family
  (hoverText business branch, the persistent context card incl. its sticky `focusBizId`, left-click
  building selection, right-click EXTORT menu) — all leaked a fogged front's rival earner + the exact
  income/uncollected the opPreview selectors hide.
- STEP-4 adversarial review (12-agent workflow, every finding independently verified): 7 confirmed
  leaks. The 4 cursor surfaces above are fixed here. ⚠ THREE remain, OUT of the cursor-dispatch scope —
  FLAGGED FOR K (separate rendering/feed lanes, deliberately NOT scope-crept into this PR):
    1. Allegiance PLATE (`refreshBizPlates` ~2222) — per-frame recolour to rival-red vs fog-grey with
       no fog gate; plate depth > the veil (0), so a fogged rival-held front's ownership shows through.
    2. Default UNIT RIG body + blood faction ring / FAR-LOD sprite (~2067) — the base-build (non-
       `?sprites`) draw has NO fog gate; `occlusionDisplay` returns 'normal' (alpha 1) for a NON-
       occluded unit BEFORE consulting `revealed`, so a fogged rival in the open draws at full opacity.
       (Most severe — a directly visible fogged rival; the rendering lane must route `revealed` into alpha.)
    3. Combat info-feed (`playCombatBeat → recordInfoEvent` ~3405) — a rival 'down' beat pushes the
       live tile into the WIRE row + minimap ping + edge arrow + [Q]-jump with no fog check; the
       `shouldEmitFeedback` gate (~3412) guards only the flash/SFX, not the report. Rival-vs-rival
       brawls in unexplored fog leak position. (+ `rival.telegraph` ~1809 needs K's learned-vs-raw ruling.)
- Tests: mutation-verified fog-probe twin worlds (`tests/fogLeak.test.ts`, `tests/selection.test.ts`)
  — a fogged-rival tile deep-equals empty ground at the pick that drives hover/hint/preview; the
  ungated `pickUnit` leaks (witness); source-scan wiring proves all cursor channels route through the
  one gate and the `combatEnabled ?` leak pattern is gone. The stale #67 assertion that FROZE the
  flag-off leak (`combatControl.test.ts`) is updated to the fixed invariant. Numbers-frozen unaffected.
- STEP-0 note: the harness handed this branch based on `legal-crime-remake` (no `IsoScene.ts` at all);
  re-pointed onto the dispatched base `rts/isometric-conversion`@da8f710. Only open PR is #68 (audio),
  which does not touch `IsoScene.ts` and rebases AFTER this lands — this goes first.
- Gate: typecheck ✅  build ✅  test ✅ (1527; +22 this lane).
- Commits: `NO-X-RAY fog-leak fix: gate rival identity on hover/cursor/tooltip/click`;
  `NO-X-RAY: fog-gate the fogged-front cursor surfaces (earner + economics)`.
