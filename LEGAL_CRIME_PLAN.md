# Legal Crime — Phase Plan

> Authoritative, strictly-ordered phase sequence and gates. Phases are executed in order,
> one at a time, never skipped or reordered. After each phase the GATE must pass fully
> green before proceeding. On green, append a Completion Receipt (template below) to
> `RUN_LOG.md` and commit `phaseN: <name> — green`.

## Gate (run after every phase)

```
npm run typecheck   # tsc --noEmit, zero errors
npm run build       # vite build succeeds
npm test            # vitest run, all tests green
```

Proceed only on full green. Tests must assert on real output values (no vacuous tests).

## Stack

- Phaser ^3.80, Vite ^5, Vitest ^2, TypeScript ^5.4.
- If an installed major differs, record the actual version in the Phase 0 receipt and
  proceed (do not blind-upgrade).

## Architectural invariants (enforced every phase)

- `/src/sim` contains NO Phaser import and no browser globals. Pure + unit-tested.
- `/src/scenes` renders sim state and dispatches commands; contains no game rules.
- Seeded-RNG determinism: same seed + same commands ⇒ identical state. Tests assert it.

## Phases

### Phase 0 — Scaffold & Harness
Set up Vite + TS + Phaser + Vitest. Create the `/src/sim` vs `/src/scenes` split. Implement
the seeded RNG (`src/sim/rng.ts`) and a minimal `GameState` skeleton + `createInitialState`.
Harness test: RNG determinism (same seed ⇒ identical sequence; different seed ⇒ different).
**Scope:** config files, `src/sim/rng.ts`, `src/sim/types.ts`, `src/sim/state.ts`,
`src/sim/constants.ts`, `src/sim/index.ts`, `src/main.ts`, placeholder scene, tests.

### Phase 1 — Economy & Tick Engine
`tick(state)` resolving income/expenses; cash math; deterministic. Districts/businesses
seeded into initial state. **Tests:** income/expense math, multi-tick accumulation,
determinism across two runs.

### Phase 2 — Extortion
`extort` command, control gating, success roll, per-tick extortion income + heat.
**Tests:** successful/failed extortion, income flows to extorter, heat added.

### Phase 3 — Illegal Businesses
`establishOperation` command, operation cost/yield/heat, police-presence amplification.
**Tests:** cost deducted, yield per tick, heat scales with presence.

### Phase 4 — Gangster Management
`recruitGangster`, `assignGangster`, loyalty drift, desertion. **Tests:** recruit cost &
stats bounds, assignment, loyalty rises when paid/low-heat, desertion below threshold.

### Phase 5 — Territory Control
`expandControl`, control points, holding a district, contesting rivals. **Tests:** control
gain capped at 100, rival reduction, hold detection at threshold.

### Phase 6 — Heat, Bribery & Law
Heat decay, `bribe` command, raid checks (seeded): cash seizure / operation loss / bust.
**Tests:** decay, bribe reduces heat gain & raid odds, raid at high heat, bust path.

### Phase 7 — Rival AI
Deterministic rival policy executed each tick. **Tests:** rival takes expected scored
action from a constructed state; determinism across runs; draws come from shared RNG.

### Phase 8 — Hits & Conflict
`orderHit`, strength comparison, casualties, boss kill on decisive win, heat. **Tests:**
stronger attacker wins on average over seeds, casualties applied, boss-kill path, heat.

### Phase 9 — Win/Loss & Game Flow
`endTurn` flow, win (district fraction + rivals dead), loss (bankrupt/dead/busted).
**Tests:** each win and loss path triggers correct `status`/`lossReason`.

### Phase 10 — Integration Scene
Phaser scene wiring sim → UI and command dispatch. **Tests:** scene-agnostic adapter
(selectors/command dispatch) unit-tested; build includes the scene; sim stays Phaser-free.

## Completion Receipt template (append to RUN_LOG.md)

```
## Phase N — <name> — GREEN  (YYYY-MM-DD)
- Summary: <what was built>
- Files: <key files added/changed>
- Decisions: <any judgment calls / chosen values>
- Gate: typecheck ✅  build ✅  test ✅ (<n> tests, <m> assertions of real values)
- Commit: <hash/message>
```

## Blocker Receipt template

```
## Phase N — <name> — BLOCKER  (YYYY-MM-DD)
- Gate that failed: <typecheck|build|test>
- Exact error: <paste>
- Fix attempts (3): <1> / <2> / <3>
- WIP isolated on branch: blocker/phaseN
- Last green commit on main working branch: <hash>
```
