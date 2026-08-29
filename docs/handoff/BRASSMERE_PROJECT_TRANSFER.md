# BRASSMERE — Project Transfer Dossier

**Purpose:** a single self-contained briefing that lets a fresh assistant (specifically ChatGPT,
with no access to this repo's history, the Google Drive brain, or the owner's Windows machine)
pick up the Brassmere project cold.

**Compiled:** 2026-08-29, from the live GitHub repo, the live Google Drive brain, and the
references to locally-saved materials found in both.
**Compiled against:** `khuffsphone/legal-crime` @ `0d4581c` (branch `rts/isometric-conversion`)
and Drive folder `Legal Crime Remake - Brain` (`1kO2ToKWZUX6HSvY-Ba4EtMLyTa-g3tpu`).

---

## 0. The one thing to read first: the naming maze

Three different names refer to **one single project**. This is the most common source of
confusion for a new agent and it must be internalised before anything else.

| Name | What it actually is | Status |
|---|---|---|
| **Brassmere** | The **final, locked product name** (ruled in `DECISION — Naming finalized BRASSMERE — 2026-07-09`; user-facing rename shipped in PR #38). | ✅ CURRENT — use this name |
| **Fedora Noir** | The **earlier working title / the name of the art direction**. Still appears in `CANON.md`'s title line and in ~30 Drive filenames. | ⚠️ Legacy label, same project |
| **Legal Crime / Legal Crime Remake** | The **original project name** — the game is a remake of a 1990s-era browser tycoon called *Legal Crime*. Survives as the **GitHub repo slug**, the npm `name`, and the **Drive brain folder name**. | ⚠️ Legacy label, same project |

So: **the repo `khuffsphone/legal-crime` IS Brassmere.** The Drive folder
`Legal Crime Remake - Brain` IS the Brassmere brain. There is no separate "Brassmere" repo
holding the game (see §2.3 for the one empty `brassmere-dashboard` repo).

---

## 1. What the game is

A single-player, real-time **isometric organized-crime RTS/tycoon**, set in an interwar
American industrial city (Chicago-inspired), 1920s–30s Prohibition. Satirical but menacing.
You run a criminal family: extort fronts, run vice operations, recruit and command crew on a
live isometric map, manage police heat via four bribery channels, and beat rival families and
the federal case being built against you.

**Target session length:** a 30–60 minute run.

### Three win paths (the run's spine — all three confirmed reachable in play)
1. **DOMINATION** — last family standing / hold ≥60% of blocks.
2. **GO STRAIGHT** — retire on clean money (target number unsettled: Code shipped ~$25k,
   Design wanted $1M, GPT proposed $50k — "tune on data").
3. **GET ELECTED MAYOR** — City Hall influence against a scandal ceiling; abstract, no election
   sim. (A human has won this way at week 11.)

### Core loop
Extort a legal front → it becomes a paying front and **auto-spawns a Collector** on a fixed
HQ↔business route (walk → collect → return → bank → wait the week → repeat) → many businesses
means a "sea of collectors" → spend on crew, vice upgrades, and bribes → hold districts →
survive rivals and federal exposure → reach a win path.

**Pacing is carried by SPACE**, not by micro-chores: a large sparse ~96² map with wide avenues
and deep building setbacks means the *distance* between buildings is the clock.

---

## 2. Where everything lives

### 2.1 Code — GitHub
- **Repo:** `github.com/khuffsphone/legal-crime` (public).
- **Trunk / active branch:** **`rts/isometric-conversion`** — *protected*, and the base of every
  PR. This is the real default; treat it as `main`.
- **Trunk tip at compile time:** `0d4581c` — *"combat-feedback: T1 manifest + claim-9
  WAV-override-synth fix (#86)"*, 2026-07-14.
- **Frozen fallback:** `claude/legal-crime-remake-qeiy87` — the original Phase 0–20 turn-based
  prototype (27 commits, 274 tests). It is **~500 commits and ~9 RTS passes behind** and has no
  `IsoScene.ts` at all. **Do not treat it as current.** It exists only as a fallback.
  (⚠️ A dispatch harness has mis-pointed lanes at this branch before — see RUN_LOG's
  `Lane fog-leak-fix` STEP-0 note. Always confirm the base is `rts/isometric-conversion`.)
- ~80 branches exist; the naming convention is `rts/*` (engine passes), `claude/*` (Claude Code
  lanes), `codex/*` (Codex lanes), `feat/*`, `fix/*`, `ci/*`, `agent/*`, `spike/*`.

### 2.2 Design brain — Google Drive
- **Folder:** `Legal Crime Remake - Brain`, ID `1kO2ToKWZUX6HSvY-Ba4EtMLyTa-g3tpu`.
- **Contents at compile time:** ~100 files at root + 4 subfolders.
- **Subfolders:** `assets-visual` (6 sub-subfolders: `Meshy Raw`, `Mixamo Raw`, `Misc Raw`,
  `NotebookLM Assets Raw`, `Flow Assets Raw`, `selected-finals`), `assets-audio` (**empty**),
  `research` (3 files: free-asset-source research + `mechanics_idea_bank.md`), `brain trash`.
- **Master index:** `BRASSMERE — SHARED BRAIN MASTER INDEX — 2026-06-28`
  (`1zxEePcYObcUAWhJVi8r3uOnx8mNMELmgTUVlobYVw0U`) — catalogues 129 files/3 folders with per-file
  CURRENT/SUPERSEDED status and one-line summaries. **It is two months stale** (dated 2026-06-28;
  the brain has churned since) but it is still the single best map of the pre-July material.
- Drive is the **model-agnostic source of truth** for design; the repo is the source of truth for
  code. Build-critical specs are *supposed* to be mirrored into the repo's `/docs` so Code reads
  them on `git pull` rather than by paste.

### 2.3 Adjacent repos (context, not part of the game build)
- `khuffsphone/brassmere-dashboard` (private) — **completely empty: zero commits, zero branches.**
  The agent-orchestration dashboard was specced in Drive
  (`BRASSMERE — CLAUDE DESIGN AI ORCHESTRATION DASHBOARD SPEC — 2026-07-03`, plus two v0.4
  decision notes) but **never landed in this repo**. If a dashboard exists, it exists only on the
  owner's machine.
- `khuffsphone/laneops` (private) — lane-operations tooling; adjacent, not read for this dossier.
- `khuffsphone/TinyWest`, `kri-project`, `archon-game`, `independence-west-game` — **separate
  games**, same owner, same multi-lane working method. Not Brassmere. (One historical incident:
  a help-overlay lane was accidentally built in `archon-game` instead of `legal-crime`.)

### 2.4 Locally-saved materials (on the owner's Windows PC — NOT in the repo or Drive)
Referenced throughout the canon and the run log; a remote agent cannot see any of these:
- **`LegalCrimeSync`** — a **Windows scheduled task that auto-commits every ~10 minutes**. It is
  confirmed **still running** and was never turned off. It is scoped to `CANON.md`,
  `ENHANCEMENT_PLAN.md`, `ASSET_SPEC.md`, `RUN_LOG.md`, and `docs/`. It **cannot** push `/src`.
  ⚠️ Known bug: it has been re-pushing a **stale `CANON.md`** from its scoped list. A `.sync-lock`
  file in the repo root makes it skip a cycle.
- **A local clone** on the personal PC; only that clone is mirrored by the scheduler. Claude Code
  running in a sandbox/desktop app is a *separate filesystem* and is unaffected.
- **PowerShell run book** (`BRASSMERE — PowerShell Run Book`, Drive) — boot/refresh/play helpers,
  PS5, one-command-per-line, dev-flag URLs, `.ps1` scripts.
- **Blender + Mixamo + Meshy render pipeline** — run locally by the owner. The repo ships the
  render *jobs* and *scripts* (`tools/blender/*.py`, `tools/blender/render_jobs/*.json`,
  `tools/meshy/prop_glossary.py`) and the *rendered* PNG sheets; the raw `.fbx`/`.glb`/`.blend`
  inputs are **gitignored and never shipped**.
- **Real audio files** — the repo ships 41 files under `public/audio/` but 50 of them were
  committed as **SILENT placeholder WAVs** (PR #78). The real library is produced locally/via
  generation and dropped in.
- Two "K runs it locally" PRs are permanently parked on this: **#73** (Meshy bulk-pull + MCP
  server, "K connects locally") and **#77** (Meshy thumbnail catalog, "K runs the render locally").

---

## 3. Current state of the build

| Metric | Value |
|---|---|
| Stack | TypeScript 5 + Phaser 3 + Vite 5 + Vitest 2 |
| Trunk tip | `0d4581c`, 2026-07-14 |
| Source | 192 `.ts` files, ~36,300 LOC |
| Tests | 170 test files, ~1,929 cases on trunk (a July audit measured 1,821 green in ~23s; PR #93 reports 1,973) |
| Gate | `npm run typecheck && npm run build && npm test` — all three must be green |
| CI | `.github/workflows/ci.yml` on every PR and every push to `rts/isometric-conversion` |
| Build platform | Windows (owner's machine); CI on ubuntu-latest, Node 20 |

### Build history shape
The RUN_LOG (`RUN_LOG.md`, 262 KB, append-only, 73 receipt sections) records two arcs:
1. **Phases 0–20** — the original turn-based sim (scaffold → economy → extortion → gangsters →
   territory → heat/bribery → rival AI → hits → win/loss → Phaser scene; then enhancement phases
   11–20: dual economy, collectors, bribery sliders, business tiers, mutiny/auto-loan, shocks,
   Fedora Noir reskin, feedback/telegraphing, balance, visual reskin).
2. **RTS-0 → RTS-30c** — the **isometric real-time conversion**, which is what actually ships now:
   spatial units, selection/command, interception, economy-on-map, iso art pipeline, game feel,
   living city, crew traits, turf war, offensive verbs + endgame, HUD elevation, vice upgrades,
   procedural gangster art, audio wiring, core-loop reshape, the sparse world, ambient life,
   weapon tiers, contextual action UI, unit-to-world scale.
   After RTS-30c the process shifted from numbered phases to **named parallel lanes** (cop P0/P1,
   audio A–D/E–H, streetscape T1–T4, federal case, status UI, citizen layer, combat control,
   env kit). ⚠️ **The RUN_LOG on trunk stops at the 2026-07-04 fog-leak lane** — receipts for the
   July lanes after that live in Drive STATUS/BUILD-NOTE documents, not in the repo.

### Open pull requests (all 5 open, all against `rts/isometric-conversion`)
| # | Branch | Title | State |
|---|---|---|---|
| **93** | `codex/brassmere-fun-proof-reboot` | **FP-01: Start the Brassmere fun-proof reboot** | **Draft, mergeable-clean, the live frontier** (2026-08-29) |
| 91 | `claude/env-modular-kit` | Env Kit: 24-core spec batch + reconciliation/render-mode report | DO NOT MERGE — K eyeball |
| 87 | `agent/brassmere-conductor-bootstrap` | Bootstrap Brassmere autonomous multi-agent conductor | Draft |
| 77 | `claude/meshy-asset-catalog` | Meshy asset inventory: thumbnail catalog + labeling | DO NOT MERGE — K renders locally |
| 73 | `claude/meshy-mcp` | Meshy integration: bulk-pull script + MCP server | DO NOT MERGE — K connects locally |

### PR #93 — the current direction (read this before proposing anything)
After the July lane wave, the project pivoted to a **"fun-proof reboot"**: FP-01,
*The First Ten Minutes*. It makes the integrated showcase profile the normal launch (with legacy
rollback and per-feature overrides), adds menu music/audio unlock/volume controls and immediate
opening-command feedback, pauses the sim behind the opening card so auto-collection can't steal
the tutorial payday, preserves beat-cop save data when that subsystem is off, adds typed
Meshy/Google/ElevenLabs asset manifests with validation, and adds automated audio quality checks.
67 files, +4,322/−174.

Its stated **intentional blocker:** an audio audit found **16 assets that must be replaced before
expanded atmosphere becomes default — 9 missing physical clips and 7 overlong event effects.**
Its **next gate:** publish an accessible review build, complete visual/audio gameplay UAT, and
repair the first-ten-minute experience *before* merging. It is explicitly a draft checkpoint, not
a release.

**Read: the project's current question is not "add more systems." It is "is the first ten
minutes fun?"**

---

## 4. Locked creative canon

Source: `CANON.md` at repo root (rewritten 2026-06-23; supersedes all prior copies). Quoted here
because it is the law every workstream reads from and no track may contradict it.

### Palette and the RED DISCIPLINE rule
- ~90% weathered brick / soot-stained masonry / charcoal asphalt; art-deco trim.
- **PLAYER = brass/gold** `#B8862B` body / `#E3C36A` highlight.
- **RIVAL = blood-red** `#9E1B1B` (STATIC identity).
- **DANGER = `#E11D1D`** / muzzle `#FF5A2C` (MOTION only).
- **The rule: "a red that sits still is a rival; a red that pulses/moves is a threat."**
- Civic blue-grey `#586B82` (Mayor/police). Federal green `#4E8B5A`.
- **Ambient life = muted greys/browns ONLY** — never brass, never red, so a civilian can never be
  mistaken for a unit.

### Type
Anton (deco display) / Oswald (subheads) / JetBrains Mono (numbers) / Barlow (body).

### Render
**PROCEDURAL / vector — the game draws itself; NO raster sprites in-engine.** (An opt-in
`?sprites` sprite-sheet path exists behind a flag; the sprite-spike experiment was formally
retired in favour of raising procedural fidelity.)

### The FOUR bribery channels — exactly four
**The Beat** (police) · **The Bench** (judges) · **City Hall** (politicians) · **The Bureau**
(feds). Code enum: `BribeChannel = 'police' | 'judges' | 'politicians' | 'feds'`.
There is **no Army channel and no Savings slider**. "Military" means crew equipment/specialist
upgrades routed *through* these four channels — not a fifth channel and not an army.

### Federal pressure
The **EXPOSURE ladder at 50 / 70 / 85** (NOTICE / WATCH / RAID). Constants
`FED_WARN_TIER_1/2/3`. **Never call it "GPO"** — that is model drift.

### CONTROL = DISTRICT STATUS
Control is **not** a spend-to-extort budget (that meter is retired). You **hold** a district at
≥~60% of its businesses. Held districts are the board state for expansion and turf war. Surfaced
as the "THE CITY — WHAT'S YOURS" roster: HELD / ESTABLISHING / NEUTRAL / RIVAL / CONTESTED.
Extortion is gated **only** by walking time/distance and thug availability — never by control.

### The Collector — re-timed
One collector per extorted business on a fixed HQ↔business route. Collectors **are**
interceptable/robbable, but that risk is a **consequence of rival invasion in mid-game**, not a
constant early chore. **EARLY = safe** (rivals dormant ~3 weeks, beyond the fog); **MID/LATE =
vulnerable** (switched on in RTS-30c). The old "interceptable-collector bottleneck from minute
one" framing is retired.

### Vice branches (four)
Bootlegging · Gambling · **Entertainment** (clubs/dance halls — *not* "Adult Club") ·
**Troubleshooting** (the original game's term, deliberately kept over GPT's "Fixer Fronts";
Troubleshooting cools heat). Vice upgrades are themed and channel-gated.

### Unit roster (procedural, period silhouettes)
- **Thug** — double-breasted suit + fedora, broad planted silhouette.
- **Thompson Man** (the enforcer role) — suited, Tommy gun across the body; the drum magazine is
  the recognition key.
- **Collector** — unassuming courier + cash satchel, 3 size tiers by carried cash; auto-spawns on
  extortion.
- **Cadillac** — 1930s sedan, shipped as **parked set-dressing only**. There is no car *unit* in
  the sim; adding one is a logic change, not an art change.

### The world
A large sparse ~96² iso map: wide avenues/streets/alleys, deep setbacks, parks/plazas/fountains
as breathing room and landmarks. **9 districts** (a 3–6 vs 9 count decision is still OPEN).
Ownership reads as a faint wash + a deco nameplate. Fog-of-war shrouds the unexplored map
(`?reveal=1` lifts it for inspection). The **MARKET standing system is CUT** (dormant behind
`?market`, default off); events are de-emphasised to a few scripted shocks.

### ⛔ ANTI-DRIFT LIST — explicitly NOT in this game
Army channel · Savings slider · Accountant · Collection Center · 16:1 ratio · a separate
Suspicion Meter · soup-kitchens · "Adult Club" · "GPO" (say *federal exposure*) · a standing
Market mini-game · a car as a controllable unit.

*(An assistant proposing any of these is drifting. This list exists because models kept
reintroducing them.)*

---

## 5. Architecture law (non-negotiable, enforced by tests)

1. **`/src/sim` is PURE and Phaser-free.** ~90 modules, zero Phaser imports, zero browser globals.
   Enforced by two invariant tests (`tests/adapter.test.ts:123-138` and `tests/theme.test.ts`)
   that read every file under `src/sim` and fail on any `from 'phaser'`.
2. **`/src/scenes` renders the sim and contains no game rules.** Dependency flows one way:
   scenes → sim, never the reverse (verified: zero `from '../scenes'` imports in the sim tree).
3. **`tick()` / `applyCommand()` core math is WRAPPED, never modified.** New systems settle
   *around* the existing tick as additive optional state slices. This is the single most
   important structural rule and the codebase is disciplined about it: `realtime.ts`,
   `combat.ts`, `combatControl.ts` (`state.combatOrders`), `beatCops.ts` (`state.beatCops`) are
   all driven by the real-time wrapper and `tick`/`applyCommand` never see them.
4. **The CAMERA is split** into a WORLD layer (pans/zooms) and a **fixed HUD layer that is never
   transformed**. `setupUiCamera()` partitions the display list by `scrollFactor === 0` and
   cross-`ignore()`s. The HUD must never drift on zoom or pan.
5. **Determinism.** Seeded mulberry32 RNG with a serialisable uint32 cursor on `GameState`. Same
   seed + same commands ⇒ identical state. No `Math.random`, no `Date.now` in `/src/sim`.
   Beat-cops draw from a **separate law cursor** so a copped game stays byte-identical to its
   cop-less twin.
6. **NO-X-RAY is absolute, including UI.** See §6 — this is the project's defining invariant.

### Other locked constants
Tile **128×64** (2:1 dimetric) · camera **60/45** · **`FIGURE_PX = 56`** · sprite anchor exactly
**(0.5, 1.0)** feet-anchored · **`fixedOrthoScale = 2.8284`** (= 2√2; lives in the Blender render
jobs and flows into shipped manifests, CI-locked by tests) · pngquant **banned** on photoreal ·
PR #62 vocabulary is the single source for prop naming.

### Module map (fast orientation)
- **Core loop:** `tick.ts` (fixed order: shocks → accrual → finances → heat → loyalty → rival AI →
  conflict → federal → law → win/loss → clock++), `commands.ts` (919 LOC; a 12-arm `Command`
  union with an exhaustiveness guard), `realtime.ts`, `clock.ts`.
- **Economy:** `economy · laundering · collection · market · mapEconomy · ledger · tiers ·
  extortion · extortionEmbodied`.
- **Spatial:** `iso · movement · pathfinding · interception · selection · cityGraph · worldgen · city`.
- **Combat (hybrid):** `combat` (proximity auto-engage) · `combatResolve` (headless auto-resolve
  that reuses the *production* damage function unmodified on a scratch clone) · `combatControl`
  (attack-move/focus-fire/disengage) · `combatTuning` · `offense` (raid/sabotage/assassinate/lockout).
- **Law/federal:** `beatCops · copBehavior · copBehaviorEngage · law · federal · federalCase*`.
- **Rival AI:** `ai · strategy · rivalStrategy · rivalOffense · rivalArchetype · contest`.
- **Territory:** `territory · territoryWar · turfWar · districtStatus · districtPosture`.
- **Fog/info:** `fog · intel · telegraph · opPreview · inspect`.
- **Pure presentation selectors:** `hud · hudText · gamefeel · toolbar · pacing · advisor · onboarding`.
- **Scenes:** `MainMenuScene`, **`IsoScene.ts` (6,841 LOC — the god-file)**, `BootScene`,
  plus pure/testable bridges `adapter.ts`, `dispatch.ts`, `orderRouting.ts`, and procedural art in
  `cityArt.ts` / `rigDraw.ts` / `figureStyle.ts` / `figureDraw2.ts`.

---

## 6. NO-X-RAY — the defining invariant

**The player must never learn anything about a fogged tile through any channel.** Not the
tooltip, not the cursor, not a preview card, not a right-click verb, not the minimap, not the
Wire event log, not an edge alert, not a sound. A fogged rival must read **byte-identically to
empty ground**.

This is the invariant that has generated the most bugs and the most rework in the project. A
Drive doc, `BRASSMERE VISIBILITY PREDICATE REGISTRY - 2026-07-08`, catalogues **9 predicates
across 235 call-sites**. The July fog-leak lane found 7 confirmed leaks via a 12-agent adversarial
review; 4 were fixed then, 3 more shipped later (PR #89).

**Still open (from the codebase audit, `docs/audit/04-noxray.md`, hand-verified):**
- **P0 — combat info-events leak.** `recordInfoEvent` at `IsoScene.ts:3551` is called
  **unconditionally**, one line *before* the visibility gate at `:3558`. A rival-vs-rival fight in
  the fog pushes its exact tile into the Wire log + a minimap ping + an edge arrow + a
  click-to-jump. **This is the one confirmed live X-ray in the tree and it has zero test coverage.**
- The visibility predicate is rebuilt as ~17 parallel closures rather than one injected predicate.
  **That diffusion is the mechanism behind the P0 leak** — a new surface simply forgot to adopt a
  closure.

---

## 7. How the project is actually run (the operating model)

This matters as much as the code; it is the reason the project moves as fast as it does, and
copying it wrong is the reason it has stalled when it stalled.

### The fleet
| Agent | Role |
|---|---|
| **Claude Code (CC)** | Big autonomous implementation runs; understand-workflows + adversarial review passes. Owns **all** `/src` commits. |
| **GPT-Pro** | Math and specs — **only ever grounded in a CC recon note**, never speculating about the codebase. |
| **Spark** | Brain filing inside the Drive folder, with DRAFT discipline. |
| **Meshy** | Image-to-3D GLB. |
| **Google Flow** | Reference images/video/music; one style recipe, isolated objects. |
| **Cowork** | UAT, with **served-SHA verification** (prove you tested the build you think you tested). |
| **K** (the owner) | **The sole merge gate.** Every gated PR waits on a human eyeball. |

### The build pattern (mandatory sequence)
**recon → spec → pure modules → flag-gated wire-up → K eyeball → merge.**
Tests must be **mutation-verified** (a gutting of the covered code must fail the test). Never
self-certify: the lane that builds a thing does not bless it.

### Lane discipline
- One session = one lane. Declare the lane at session start.
- **STEP 0 collision check in every dispatch** — `.claude/step0-context.md` holds a fenced JSON
  `activeLanes` registry (currently empty) and `tools/step0-check.ts` reads it to detect when a
  new task's declared files collide with a lane another agent already owns.
- **File-disjoint = parallel-safe.** The contention hotspots are **`IsoScene.ts`**, `/src/sim`,
  `realtime.ts`, and `constants.ts`.
- A **HANDOFF note is mandatory at session end**, filed to the brain.

### Merge gating
- Titles/labels carrying **`DO NOT MERGE`** are blocked by `.github/workflows/merge-guard.yml`
  (matches `DO[ _-]NOT[ _-]MERGE` in the title, or the `do-not-merge` label).
- `.github/workflows/enable-automerge.yml` auto-merges PRs labelled `auto-merge`.
  ⚠️ A 2026-07-09 handoff **flagged this as in tension** with K being the sole gate — confirm it
  can never auto-land a gated PR.
- **base-visible changes** (anything altering flag-OFF behaviour) always keep a pre-merge human
  eyeball under the project's HITL canon.
- Drive holds the HITL machinery: `BRASSMERE HITL CADENCE POLICY`, `HITL REVIEW QUEUE SCHEMA`,
  `UAT RUBRIC TEMPLATES` (rubrics A–E), and `review-queue.json`.

### Brain-write discipline
- Every Drive doc opens with a 5-line header: `TYPE / STATUS / DATE / SUPERSEDES / SUMMARY`,
  where TYPE ∈ CANON | SPEC | NOTE | PROMPT | REPORT | PLAYBOOK | DRAFT, and STATUS ∈
  CURRENT | SUPERSEDED | DRAFT | STALE.
- Filenames: `TYPE — <name> — YYYY-MM-DD`.
- **Supersede, never delete.** DECISION notes must state a root cause.
- **Cloud agents writing to Drive are append-only** — writing the same filename produces a
  *second* file (`name (1).md`), not a revision. Revise by creating the next numbered file.
- **The branch-separation law:** the auto-sync and human local edits commit **only** brain/docs
  files; Claude Code owns **all** `/src` commits on its own working branch. *"Violating branch
  separation is the one thing that corrupts this pipeline."*

### Debug / QA flags (dev-only, inert in a production build)
`?debug=turf|mutiny|win|lose` · `?arm=1|pistol|shotgun|rifle|hitman|demolitions|all` ·
`?scenario=rival-contest|fed-watch|save-roundtrip` (deterministic QA boards, NO-X-RAY) ·
`?skipmenu` · `?art=rich|lean` · `?market=on|off` · `?reveal=1` · `?life=low|med|high` ·
`?sprites` · `?status` · `?combat=1` · `?audio=1` · `?debugaudio`.
On a **cold load**, any of `?debug/?arm/?scenario/?skipmenu` auto-starts a fresh game past the
main menu, once per page load.

### Controls (current)
`[E]`xtort · `[C]`ollect · `[R]`einvest · `[G]`rease · `[K]`rew · `[L]` wire · `[H]`elp · `[T]` ·
`[Z]` frame-city · `[F]`ollow · `[M]`arket (off by default) · `[U]` vice-upgrade · `[O]` audio
panel · `[0]` mute · `[Space]` fast-forward (1×/2×/4×) · `[>]` skip-week · `[P]` perf overlay ·
`[Q]` patrol · `[V]` demolish.
Offensive: `[1]` Raid · `[2]` Sabotage · `[3]` Assassinate · `[4]` Lockout · `[5]` Expand ·
`[6]` Recruit. Move/Attack are right-click. Camera: zoom +/− + wheel, WASD/edge/drag pan, three
zoom stops (CLOSE/MID/FAR). Endgame newspaper: `[Enter]` = new game, `[Esc]` = main menu.

---

## 8. Known problems, ranked (the honest debt list)

From `docs/audit/` (a read-only 6-report audit committed to trunk — architecture, tech debt, test
health, NO-X-RAY, canon drift, and a dispatch-ready backlog) plus PR #93's own blocker.

| ID | Problem | Pri |
|---|---|---|
| **FP-blocker** | **16 audio assets must be replaced** before expanded atmosphere can be default: 9 missing physical clips + 7 overlong event effects. | Blocking #93 |
| **BL-01** | **The P0 X-ray leak** — combat info-events bypass the fog gate (§6). Small fix; edits `IsoScene.ts` so it must serialise with every other IsoScene lane. | P0 |
| **BL-02** | No behavioural test for that gating. Must land with BL-01. | P0 |
| **BL-03/04** | **Dead-but-tested audio cluster** — `noXrayGate`, `cueQueue`, `sfxEventMapper`, `atmosphereSpine` have **zero live importers** yet carry 4 green test files (~60 assertions). Worse, `noXrayGate` encodes the *wrong* behaviour (full suppression) vs the live path (downgrade to non-positional). Delete the modules and their tests. Parallel-safe. | P1 |
| **BL-08** | **`IsoScene.ts` is a 6,841-LOC god-file** — render + input + camera + HUD + audio bridge + war-drive in one class, 66 imports, ~486 private members. It is the merge-conflict bottleneck for nearly every lane and it is where BL-01 hid. **Highest structural leverage; needs its own window with no concurrent IsoScene lane.** | P2 |
| **BL-06** | Unify the ~17 fog closures behind one injected predicate. Do it after BL-08. | P2 |
| **BL-07** | `tests/fogLeak.test.ts` half-relies on `readFileSync` + regex **source scanning** — stale in both directions and blind to un-enumerated surfaces (it missed BL-01). Convert to twin-worlds behavioural tests. Parallel-safe. | P2 |
| **BL-09** | **Canon drift (decision needed):** canon says faction colour is plate-only, but the two *live* silhouette renderers (`rigDraw.ts:141,143` and `cityArt.ts:157-158,294`) paint a brass/blood accent on the hatband and pocket-square, while `figureStyle.ts` stays plate-only. Either amend CANON to permit a small body accent, or bring the renderers in line. | P3 |
| **BL-10** | **`federalCase*` is bench code:** pure, ~86 assertions of test coverage, and **unwired at runtime by design** (`docs/federal-case/SPEC_GAPS.md` lists 8 spec gaps). Either wire it into `tick`/`realtime` or mark it explicitly shelved so its tests aren't mistaken for live coverage. | P3 |
| **BL-11/12** | Long-function refactors (`updateUnits` ~363 lines in the per-frame hot loop, `applyExtort` ~140, `drawFedora` ~157) and a legacy-cruft sweep (`BANKRUPT_FLOOR` vs `DEBT_CEILING`, two figure-key resolvers, legacy 5-district special-casing). | P3 |

### Process debt
- The **`LegalCrimeSync` scheduled task is still running** and has been re-pushing a stale
  `CANON.md`. `RUN_LOG.md` is in **both** its scoped file list and written by Claude Code — a real
  concurrency-collision risk that has never been resolved.
- **The trunk RUN_LOG stops at 2026-07-04.** Post-July receipts are only in Drive. There is no
  single chronological build record any more.
- The Drive brain's **own naming/subfolder conventions were specified but never applied**: the
  master index's Rule 3 calls for `/canon`, `/specs`, `/prompts`, `/reports`, `/archive`
  subfolders — none exist. ~100 files sit flat at the root.
- **`CANON.md` references a Drive `writing/` folder that does not exist**, and an
  `assets-audio/` folder that is **empty**.
- The **brain master index is two months stale** (2026-06-28) and predates the entire July lane wave.

---

## 9. What I could not verify

State these limits rather than letting the next assistant assume coverage:
- **Nothing on the owner's Windows machine was inspected** — the local clone, the `LegalCrimeSync`
  scheduler's real state, the PowerShell helpers, Blender/Meshy outputs, and the real audio
  library are all invisible from a remote session.
- **No build or test run was executed** for this dossier. Test counts are from static counting
  (~1,929 cases on trunk), the July audit's live run (1,821 green), and PR #93's own claim (1,973).
- **The 5 open PRs' CI status was not checked**, only their mergeable state.
- **Drive document *contents* were read selectively** — the master index, project instructions,
  the 2026-07-09 handoff, and folder listings. The ~100 root files were catalogued by title/date,
  not all read. In particular the July "GPT WORK DRAFT" content set (World Bible, Master Mechanics
  Glossary, District Map Spec, Economy + Dual-Economy Systems Guide, Prop-Family Glossary, Rival
  Family Archetypes, Combat & Movement Feedback Manifest, Political Capture, Reputation &
  Notoriety) was **not read in full** — that is the richest unread design material and the natural
  first stop for a design-facing successor.
- `khuffsphone/laneops` was not examined.

---

## 10. Suggested opening brief for ChatGPT

Paste this whole file in first, then:

> You are picking up **Brassmere**, a TypeScript/Phaser 3 isometric organized-crime RTS. The
> attached dossier is your ground truth. Three rules before you propose anything:
> 1. **Brassmere = Fedora Noir = Legal Crime.** One project. The repo is
>    `github.com/khuffsphone/legal-crime`; trunk is `rts/isometric-conversion`, not `main`.
> 2. **Never speculate about the codebase.** The house rule is that spec work is grounded in a
>    recon note from an agent that actually read the source. If you need a fact about the code,
>    ask for a recon rather than inventing it.
> 3. **Check the anti-drift list (§4) before proposing any mechanic.** Army channel, Savings
>    slider, "GPO", a Market mini-game, a drivable car, "Adult Club", "Fixer Fronts" — all of
>    these have been proposed by models before and all are explicitly out.
>
> The live question is **PR #93: is the first ten minutes fun?** — not "what system is next."

**Best first tasks for a ChatGPT lane**, given it cannot run the build:
- Design/spec work grounded in this dossier and the unread July design drafts (§9).
- The **BL-09 canon ruling** (faction accent on body vs plate) — a pure decision, no code needed.
- The **BL-10 ruling** (wire or shelve `federalCase*`) — a product decision.
- The **GO STRAIGHT target-number ruling** ($25k vs $50k vs $1M) — an open balance decision.
- The **district count ruling** (3–6 vs 9) — still open in CANON.
- Reviewing/sequencing the first-ten-minutes UAT plan for PR #93.

**Things a ChatGPT lane must not do:** commit to `/src` (Claude Code owns all source commits),
overwrite Drive files (cloud write channels are append-only), or merge anything (K is the sole
merge gate).

---

## Appendix — key file pointers

**In the repo (trunk `rts/isometric-conversion`):**
- `CANON.md` — the law. Read first.
- `RUN_LOG.md` — 262 KB append-only build history (stops 2026-07-04).
- `docs/audit/README.md` + `01`–`06` — the codebase audit and the ranked backlog.
- `docs/federal-case/SPEC_GAPS.md` — why `federalCase*` is unwired.
- `docs/status-ui/DATA_RECON.md`, `docs/env-kit/*`, `docs/audio/H3_WIREUP.md` — lane recons.
- `HUD_SPEC.md`, `UX_UI_DIRECTION.md`, `docs/VISUAL_DIRECTION.md`, `docs/RTS30C_WAR_SPEC.md`.
- `LEGAL_CRIME_DESIGN.md`, `LEGAL_CRIME_PLAN.md`, `ENHANCEMENT_PLAN.md`,
  `ENHANCEMENT_PLAN_RTS.md` — the original phase-plan arc (historical; superseded by the RTS arc).
- `.claude/step0-context.md` + `tools/step0-check.README.md` — the lane collision registry.
- `.github/workflows/{ci,merge-guard,enable-automerge}.yml`.

**In the Drive brain (`1kO2ToKWZUX6HSvY-Ba4EtMLyTa-g3tpu`):**
- `BRASSMERE — SHARED BRAIN MASTER INDEX — 2026-06-28` — the catalogue (stale but invaluable).
- `INSTRUCTIONS — Brassmere project canon (parallel chats, fleet routing, build pattern) — 2026-07-03`
  and `CANON — Project Instructions — parallel chats + fleet routing — 2026-07-03`.
- `BRASSMERE — GLOSSARY & REFERENCE FOR CLAUDE CODE — 2026-07-02`.
- `HANDOFF — session close 2026-07-09` and `LANE BOARD — 2026-07-09`.
- `BRASSMERE VISIBILITY PREDICATE REGISTRY - 2026-07-08` — the 9 predicates / 235 call-sites.
- `BRASSMERE HITL CADENCE POLICY / REVIEW QUEUE SCHEMA / UAT RUBRIC TEMPLATES` (2026-07-04).
- The 2026-07-13 `GPT WORK DRAFT` set — World Bible, Master Mechanics Glossary, District Map Spec,
  Economy + Dual-Economy Systems Guide, Prop-Family Glossary, Asset Production Manifest.
- `DECISION — Naming finalized BRASSMERE — 2026-07-09` and
  `BRASSMERE — DECISION — Art Direction Hybrid + Vocabulary Ruling — 2026-07-13`.
