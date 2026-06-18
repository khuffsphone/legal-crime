# ENHANCEMENT_PLAN_RTS.md — Legal Crime: Isometric Real-Time RTS Conversion

This is a NEW ARC on a dedicated branch (rts/isometric-conversion), built on the
verified Phase 0–20 foundation (274 tests green). The strategic economic simulation
in /src/sim is PRESERVED — it is wrapped and driven by a real-time clock, NOT
rewritten. The card-based BootScene is replaced by an isometric real-time renderer.

Creative direction: CANON.md ("Fedora Noir"). Channels: The Beat / The Bench /
City Hall / The Bureau. Mechanics follow the original Legal Crime.

## CORE DESIGN DECISION (settles the hardest question)
The economy is CONTINUOUS REAL-TIME. A "week" is a configurable real-time interval
(WEEK_DURATION_SECONDS, default 120 ≈ 2 min, like the original). The existing
weekly-tick economic logic is preserved and FIRED BY A TIMER instead of by a keypress.
Units move continuously in real space between week-settlements. This means:
- The riskiest conceptual piece (real-time economy) is a TRIGGER change, not a rewrite.
- Movement/pathing/interception are continuous; the books settle every WEEK_DURATION.

## ARCHITECTURAL LAW (preserves testability — non-negotiable)
- The real-time SPATIAL SIMULATION (unit positions, movement, pathfinding, interception,
  the week-clock) is STILL PURE LOGIC. It lives in /src/sim (or /src/rts-sim), advances
  via a pure `update(state, dtSeconds)` function, imports NO Phaser, and is unit-tested
  by stepping dt manually. Determinism preserved (seeded RNG + fixed dt steps).
- Phaser ONLY renders and captures input. The game loop calls `update(dt)` then draws.
- This is what makes a real-time RTS testable the same way the tick game was. Every
  phase keeps the sim-Phaser-free invariant test green.

## GATING (unchanged from prior runs)
Each phase: implement → real-assertion tests → GATE (typecheck + build + test) →
COMPLETION RECEIPT in RUN_LOG.md → commit `rtsN: <name> — green`. WIP checkpoints with
`wip:`. Strict order. Partial success acceptable. Halt-with-BLOCKER over corruption.

## PHASES

### RTS-0 — Continuous Loop & Week-Timer (prove the real-time economy FIRST)
Wrap the existing economic tick in a real-time clock. Add WEEK_DURATION_SECONDS
(default 120). A pure `advanceClock(state, dtSeconds)` accumulates elapsed time and
fires the EXISTING week-settlement (the current tick logic) when the interval elapses.
No rendering yet — this proves the conceptual core headlessly.
- Tests: clock accumulates dt; week fires exactly at WEEK_DURATION; firing runs the
  existing economic resolution unchanged; multiple weeks over a long dt sequence;
  WEEK_DURATION is configurable; determinism holds under fixed dt steps.

### RTS-1 — Isometric World Foundation (renderer + projection)
Pure iso projection math (grid<->screen), a tile grid, depth-sorting order, and a
Phaser scene rendering an iso map with a pannable/zoomable camera. DEFINES the
canonical projection and tile dimensions (record them in the receipt — the art
pipeline depends on these exact numbers).
- Tests: grid<->screen projection round-trips; depth-sort ordering correct; tile
  neighbor math. Build renders an iso ground grid (placeholder tiles ok).

### RTS-2 — Spatial Units & Movement (pure, continuous)
Units gain world positions. A pure movement system + pathfinding (A* or grid-step)
moves units toward targets in `update(dt)`. No Phaser in the movement logic.
- Tests: a unit reaches its target over stepped dt; pathfinding routes around blocked
  tiles; arrival detection; deterministic paths under fixed seed/dt.

### RTS-3 — Selection & Command (RTS control layer)
Click-to-select units, click-to-move, selection rendering, command issuing. Phaser
input → pure command intents → movement system.
- Tests: selection state logic; command translates to a movement target; multi-select
  logic. (Input wiring validated by human; logic by tests.)

### RTS-4 — Interception & Collision (THE signature mechanic, made real)
Continuous interception detection: when a hostile unit reaches a collector's path/
position, resolve the ambush — carried cash transfers to the attacker (reusing the
existing collector-bottleneck rules). Pure logic in update(dt).
- Tests: interception fires when paths/positions intersect under fixed dt; carried
  cash transfers to attacker; non-hostiles don't trigger; determinism holds.

### RTS-5 — Economy-on-Map Integration
Map actions in space: businesses occupy tiles; extortion targets a building; the
COLLECTOR spawns at a business and walks a real path to HQ/Collection Center
(intercept-able via RTS-4). Bribery/tiers/laundering invoked from map UI. The existing
economic systems now play out spatially.
- Tests: collector spawns at business and paths to HQ; reaching HQ deposits (existing
  rules); extortion command targets the right building; control gates map actions.

### RTS-6 — Real-Time Presentation of Existing Systems
Port federal exposure + the 50/70/85 warning ladder, mutiny, shocks, and the week-
settlement summary into the real-time HUD. The week-timer shows a visible countdown.
- Tests: existing federal/mutiny/shock logic still green under the real-time driver;
  warning ladder surfaces; week countdown reflects WEEK_DURATION.

### RTS-7 — Isometric Art Pipeline
NOW that RTS-1 fixed the exact projection/dimensions, define the iso sprite spec
(angle, pixel sizes, directional facings) and wire real sprites in via the same
placeholder-fallback pattern (scene always renders; sprites slot in as dropped).
- Gate: build renders the iso scene with real or placeholder sprites; sim-Phaser-free
  invariant intact. Final visual quality validated by human.

## RESUME / TERMINATION: identical to prior runs.
Tunable from day one: WEEK_DURATION_SECONDS (pace), movement speeds. The Week-1047 /
engagement problem is partly a function of WEEK_DURATION — keep it a constant to tune
by feel during playtest.
