# Report 1 — Architecture Map

Brassmere is a two-layer game: a **pure, Phaser-free simulation** in `src/sim` and a **Phaser render/input layer** in `src/scenes`. The browser entry `src/main.ts:1-38` wires Phaser to three scenes (`MainMenuScene`, `IsoScene`, `BootScene`) `src/main.ts:26`. Dependency flows strictly one way: scenes import sim; sim imports nothing from scenes.

Anchors verified: `IsoScene.ts`=6701 LOC, `cityArt.ts`=1073, `sim/commands.ts`=919, `sim/index.ts`=731 (all exact). `sim/iso.ts` `ISO_TILE_WIDTH=128`/`HEIGHT=64` with `gridToScreen` `src/sim/iso.ts:10-30`. `sim/fog.ts` exports `isRevealed`/`revealAround`/`revealAll` `src/sim/fog.ts:18,23,64`. `sim/tick.ts`=153, `beatCops.ts`=344, `combat.ts`=111. `noXrayGate.ts` marked SUPERSEDED `src/scenes/audio/noXrayGate.ts:1-3`.

---

## 1. `/src/sim` — the pure simulation

**Responsibility:** All game rules, state, and math. ~90 modules, none importing Phaser or touching browser globals.

**Phaser-free confirmed.** A tree-wide search for an actual `phaser` module import returns **zero** hits; every match of the word "Phaser" is a comment asserting purity (e.g. `src/sim/index.ts:1-2`, `src/sim/commands.ts:6`, `src/sim/combat.ts:1`). No deep or barrel `from 'phaser'` import exists anywhere under `src/sim`.

**The invariant test that enforces it:** `tests/adapter.test.ts:123-138` — `describe('architecture invariant: /src/sim is Phaser-free')` reads every `.ts` under `src/sim` via `readdirSync`/`readFileSync` and fails if any matches `/\bfrom\s+['"]phaser['"]/i` or a `require('phaser')` `tests/adapter.test.ts:127-136`. The regex deliberately targets the module specifier, not the word in comments `tests/adapter.test.ts:130-132`. (A second purity scan lives at `tests/theme.test.ts:106-124`.)

**Public surface:** `src/sim/index.ts` is the barrel — "Phaser scenes import only from here" `src/sim/index.ts:1`. Re-exports types, constants, RNG, `createInitialState`, economy/laundering/collection selectors, `tick`/`tickN` `src/sim/index.ts:37`, clock, pathfinding, movement, interception, etc.

**Module clusters:**

| Cluster | Modules |
|---|---|
| State / types | `types.ts` `src/sim/types.ts:1`, `state.ts`, `constants.ts`, `rng.ts` `src/sim/rng.ts:1`, `saveLoad.ts` |
| Core loop | `tick.ts`, `commands.ts`, `realtime.ts` `src/sim/realtime.ts:1`, `clock.ts` |
| Economy | `economy.ts`, `laundering.ts`, `collection.ts`, `market.ts`, `mapEconomy.ts`, `ledger.ts`, `tiers.ts`, `extortion.ts`, `extortionEmbodied.ts` |
| Spatial | `iso.ts`, `movement.ts`, `pathfinding.ts`, `interception.ts`, `selection.ts`, `cityGraph.ts`, `worldgen.ts`, `city.ts` |
| Combat | `combat.ts`, `combatResolve.ts`, `combatControl.ts`, `combatTuning.ts`, `offense.ts`, `conflict.ts`, `downedBodies.ts` |
| Law / federal | `beatCops.ts`, `copBehavior.ts`, `copBehaviorEngage.ts`, `law.ts`, `federal.ts` + `federalCase*.ts` |
| Rival AI | `ai.ts`, `strategy.ts`, `rivalStrategy.ts`, `rivalOffense.ts`, `contest.ts` |
| Territory | `territory.ts`, `territoryWar.ts`, `turfWar.ts`, `districtStatus.ts`, `districtPosture.ts` |
| Fog / info | `fog.ts`, `intel.ts`, `telegraph.ts`, `opPreview.ts`, `inspect.ts` |
| Presentation selectors (pure) | `hud.ts`, `hudText.ts`, `gamefeel.ts`, `toolbar.ts`, `pacing.ts`, `advisor.ts`, `onboarding.ts` |

---

## 2. `/src/scenes` — the Phaser layer

**Scene classes** (`extends Phaser.Scene`): `MainMenuScene`, `IsoScene`, `BootScene`, registered in `src/main.ts:26`. `MainMenuScene` is the boot entry; it launches `IsoScene` on New Game/Continue `src/main.ts:24-25`.

**`adapter.ts`** is a **scene-agnostic** bridge — "holds NO Phaser import, fully unit-testable in node" `src/scenes/adapter.ts:1-4`. It imports only from the sim barrel `src/scenes/adapter.ts:6-30`, builds view models (`PlayerView`/`DistrictView`/`RivalView`/`StatusView`) `src/scenes/adapter.ts:31-98`, and exposes `dispatch(state, command)` → `applyCommand` `src/scenes/adapter.ts:210` and `advanceTurn` `src/scenes/adapter.ts:215`. Its own test file houses the purity invariant (§1).

**`main.ts`** is the only Phaser bootstrap: constructs `new Phaser.Game(config)` after fonts settle `src/main.ts:33-38`.

`IsoScene.ts` (6701 LOC) is the god-scene: render, input, camera, HUD, audio bridge, and the real-time drive loop.

---

## 3. IsoScene render path

**Projection:** `gridToScreen` (`src/sim/iso.ts:26`) is the pure grid→screen center; used 44 times across `IsoScene.ts`. Depth-sorting via `compareDepth`/`depthSort` `src/sim/iso.ts:73-90`.

**Procedural art:** `cityArt.ts` — "Phaser-only… generates all city art from vector Graphics at runtime, NO external assets" `src/scenes/cityArt.ts:1-2`. Bakes texture atlases (`TEX` `src/scenes/cityArt.ts:62`), palette `PAL` `src/scenes/cityArt.ts:20`, and `figureKeyFor(role, faction, tier)` `src/scenes/cityArt.ts:95`. `IsoScene` imports `figureKeyFor` and friends `src/scenes/IsoScene.ts:223-233`.

**Figure drawing:** two procedural renderers — `drawThugFig2` (`figureDraw2.ts`) `src/scenes/IsoScene.ts:335` and `drawThugRig` + `PLAYER_RIG`/`RIVAL_RIG` (`rigDraw.ts`) `src/scenes/IsoScene.ts:333`, dispatched in the per-unit draw at `src/scenes/IsoScene.ts:2114-2118`.

**Sprite-sheet path (opt-in `?sprites`):** `src/scenes/render/` — `unitSpriteState.ts` (pure flags) `src/scenes/render/unitSpriteState.ts:1`, `unitSpriteLoader.ts`/`unitSpriteView.ts`/`unitSpriteAnimator.ts` (Phaser-side, "never imported by /src/sim"), `unitFacingQuantize.ts` (pure facing→row math) `src/scenes/render/unitFacingQuantize.ts:1-3`, and `spriteManifest.ts` (pure validation) `src/scenes/render/spriteManifest.ts:1-3`. Wired in `IsoScene.ts:339-342`.

**Occlusion:** `render/isoOcclusion.ts` — pure screen-space hull test that dims/hides units behind taller buildings but keeps an X-ray silhouette for cared-about units `src/scenes/render/isoOcclusion.ts:1-3`. Building hulls computed once in `drawCity()` `src/scenes/IsoScene.ts:547`.

**Draw entry:** `drawCity()` `src/scenes/IsoScene.ts:1218` (called at `:989`); per-frame `update()` runs `drawGround()`/dressing/ambient `src/scenes/IsoScene.ts:4516-4520`.

**Camera split (CANON):** `setupUiCamera()` `src/scenes/IsoScene.ts:4205-4215` — comment: "the CRITICAL world/HUD split: a second FIXED ui camera renders the HUD at 1:1… never transformed by zoom/pan." The WORLD renders on `cameras.main` (pans/zooms, bounds set in `setWorldCameraBounds` `src/scenes/IsoScene.ts:4202`); the HUD is `scrollFactor 0` on `uiCam` `src/scenes/IsoScene.ts:4211-4213`. Layers are partitioned by cross-camera `ignore()` `src/scenes/IsoScene.ts:1567,1574`.

---

## 4. tick / applyCommand / commands.ts — the WRAPPED boundary

**`tick.ts`** advances one economic week, mutating state in place, resolving systems in a fixed documented order (shocks→accrual→finances→heat→loyalty→rival AI→conflict→federal→law→win/loss→clock++) `src/sim/tick.ts:95-147`. Pure/deterministic.

**`commands.ts`** — "the single deterministic entry point for state mutation outside of `tick()`" `src/sim/commands.ts:1-2`. `Command` is a 12-arm union (extort, establishOperation, recruit, assign, expandControl, bribe, orderHit, launder, collect, setBribe, upgradeOperation, repayLoan) `src/sim/commands.ts:146-158`. `applyCommand(state, cmd)` is a total switch over the union with an exhaustiveness guard `src/sim/commands.ts:882-913`; `applyCommands` folds a sequence `src/sim/commands.ts:916-919`.

**The "wrapped, never modified" pattern.** Real-time systems added AROUND `tick`/`applyCommand` without touching them:
- `realtime.ts` `update(state, dt)` drives BOTH units and the week clock; the economic `tick` fires only on week boundaries `src/sim/realtime.ts:1-7`. Within one step it calls `resolveProximityCombat`, `advanceBeatCops`, `advanceCombatOrders` `src/sim/realtime.ts:60,72,77`.
- `combat.ts`: "Settles AROUND the tick… `tick()`/`applyCommand()` are untouched" `src/sim/combat.ts:3-4`.
- `combatControl.ts`: additive optional `state.combatOrders` slice "driven by the real-time WRAPPER… `tick()`/`applyCommand()`/`commands.ts` never see them" `src/sim/combatControl.ts:2-6`.
- `beatCops.ts`: additive `state.beatCops` slice, "`tick()`/`applyCommand()` never see them" `src/sim/beatCops.ts:2-4`.

**How scenes dispatch:**
- Strategic commands go through `applyCommand` directly in `IsoScene` (e.g. `establishOperation` `src/scenes/IsoScene.ts:3263`, `setBribe` `:3294`, `expandControl` `:3326`, `recruitGangster` `:3363`).
- Embodied acts go through a WRAPPER that "proves `applyCommand` is untouched": `applyCommandWithEmbodiedExtortion` for `moveAndShakedown`/`moveAndSabotage` `src/scenes/IsoScene.ts:2622,2797`.
- Target→verb routing is pure: `orderRouting.ts` `orderVerbFor(target)` maps rival→attack, front→extort, ground→move `src/scenes/orderRouting.ts:20-31`; `dispatch.ts` picks the acting muscle (`pickSelectedMuscle`/`pickIdleMuscle`, "selection is authoritative") `src/scenes/dispatch.ts:18-38`. Both are Phaser-free and unit-tested. `combatOrders.ts` is the STOP/HOLD/ATTACK-MOVE input layer over existing `issueMove`/`stopUnit`, adding no sim mechanic `src/scenes/combatOrders.ts:1-8`.

---

## 5. Audio coordinator — `scenes/audio/*`

**Subscription model:** audio consumes the real-time wrapper's outputs; it never mutates sim. `atmosphereCoordinator.ts` `step()` fuses four stages into one ordered intent list "Pure & Phaser-free… /src/sim is type-only (erased)" `src/scenes/audio/atmosphereCoordinator.ts:1-5`. It imports sim event types only (`DepositEvent`, `EmbodiedExtortionEvent`, `GameEvent`, `InterceptionEvent`) `src/scenes/audio/atmosphereCoordinator.ts:12`.

**Wiring:** the ONE touch point is in `IsoScene.update` post-`updateAndObserve` `src/scenes/IsoScene.ts:1997`, feeding `AtmosphereSceneAdapter` (`src/scenes/IsoScene.ts:245`), which owns the only `AudioManager` calls `src/scenes/audio/atmosphereCoordinator.ts:7-9`.

**Live (E-H) modules:** `mixGovernance.ts` — ducking matrix, priority/steal, cue-rate caps `src/scenes/audio/mixGovernance.ts:1-6`; `propEmitterPlanner.ts` — positional emitters with NO-X-RAY gating via `shouldEmitFeedback` `src/scenes/audio/propEmitterPlanner.ts:1-8`; `eventCueMapper.ts` (current event→cue mapping), imported live by `atmosphereCoordinator.ts` + `mixGovernance.ts`.

**Superseded (A-D era, retire at H3):** `cueQueue.ts` `src/scenes/audio/cueQueue.ts:1-3`, `sfxEventMapper.ts` `src/scenes/audio/sfxEventMapper.ts:1-4`, `noXrayGate.ts` `src/scenes/audio/noXrayGate.ts:1-3`, `atmosphereSpine.ts` `src/scenes/audio/atmosphereSpine.ts:57`. Each carries a ⚠ SUPERSEDED banner; live paths route through the E-H equivalents. **These four have ZERO live production importers** (they import only each other) yet are still exercised by four green test files — dead-in-runtime but test-covered. See reports 2 §5 and 3.

---

## 6. beatCops (`sim/beatCops.ts`)

**Responsibility:** the law-patrol marker layer. Cops live in an **additive optional slice** `state.beatCops`; they are **NOT** `MovableUnits` (never enter `state.units`), so movement/interception/combat/selection are structurally untouched `src/sim/beatCops.ts:2-5`.

**Tick/heat plug-in:** driven only by the real-time WRAPPER — `advanceBeatCops(state, dt)` `src/sim/beatCops.ts:237` called from `realtime.update` `src/sim/realtime.ts:72`; `tick()`/`applyCommand()` never see cops `src/sim/beatCops.ts:3-4`. Cop count/placement derives from heat via `desiredCopCount` `src/sim/beatCops.ts:172` and `copDistrictWeights` `src/sim/beatCops.ts:181` (district presence + `COP_THIRD_COP_PRESENCE` `src/sim/beatCops.ts:30`). **RNG discipline:** cop draws use a SEPARATE law cursor so a copped game stays byte-identical to its cop-less twin `src/sim/beatCops.ts:7-9`. Escalation (patrol→loiter→respond→engage `src/sim/beatCops.ts:43`) lives in `copBehavior.ts` with NO-X-RAY sight; ENGAGE damage resolves headlessly through `copBehaviorEngage.resolveCopEngagement` consuming `combatResolve` `src/sim/beatCops.ts:9-10`. Visibility gate: `copMarkerVisible` `src/sim/beatCops.ts:342`.

---

## 7. Combat verbs — sim-side flow

Combat is a **hybrid** model, all Phaser-free:

- **`combat.ts` (proximity auto-engage):** health model + `resolveProximityCombat(state, dt)` — ready combatants swing at the nearest hostile in range, downing/removing units and returning `CombatEvent[]` beats for the render layer `src/sim/combat.ts:63-111`. Auto-engage on proximity, no separate command `src/sim/combat.ts:6-11`. `hostile()` = both combatants on different families `src/sim/combat.ts:33`. Called each real-time step `src/sim/realtime.ts:60`.
- **`combatTuning.ts`:** weapon-tier + skill table (`meleeDamage`/`attackInterval`/`engageRange`) with hard caps; the resolver READS it, does not rewrite the loop `src/sim/combat.ts:14-17`.
- **`combatResolve.ts` (headless auto-resolve):** `resolveEngagement` `src/sim/combatResolve.ts:216` runs the SAME production `resolveProximityCombat` UNMODIFIED on a scratch clone for off-screen fights — "the DAMAGE EXCHANGE is the PRODUCTION function itself" `src/sim/combatResolve.ts:7-13`. Adds only a movement layer around it.
- **`combatControl.ts` (control surface):** attack-move/focus-fire/disengage over the additive `state.combatOrders` slice; `orderAttackMove`/`orderFocusFire`/`orderDisengage`/`advanceCombatOrders` `src/sim/combatControl.ts:189-316`. Every hostile-sensing decision keys off an injected `IsVisible` fog closure (NO-X-RAY) `src/sim/combatControl.ts:8-13`. Also home of `pickVisibleHostile` `src/sim/combatControl.ts:169`. Driven by `realtime.update` `src/sim/realtime.ts:77`.
- **`offense.ts` (player strategic verbs):** raid/sabotage/assassinate/lockout — each a gated command resolved in the real-time wrapper, NOT `tick` `src/sim/offense.ts:1-5`. Gates: `canRaid`/`canSabotage`/`canAssassinate`/`canLockout` `src/sim/offense.ts:80-121`; resolvers: `resolveRaid`/`resolveSabotage`/`resolveAssassinate`/`resolveLockout` `src/sim/offense.ts:140-253`.

**Order flow:** input → `orderRouting.orderVerbFor` picks the verb → `dispatch.pickSelectedMuscle` picks the actor → `IsoScene` calls the sim resolver. Attack goes via `orderAttackMove(this.state, …)` `src/scenes/IsoScene.ts:3061`; the four offense verbs call `resolveRaid`/`resolveSabotage`/`resolveAssassinate`/`resolveLockout` directly `src/scenes/IsoScene.ts:3797,3815,3832,3852`. None route through `applyCommand`, preserving the wrapped boundary.

---

## Dependency-direction summary (sim ← scenes, never reverse)

**Enforced and clean.** Scenes import sim only through the barrel (`import … from '../sim'`, e.g. `src/scenes/adapter.ts:6`, `src/scenes/IsoScene.ts:285`) plus a few deep type imports (`src/sim/intel` `src/scenes/IsoScene.ts:297`).

Grepping `src/sim/**` for any `scenes` import returns **one** hit — a **documentation comment** in `combatControl.ts:31` referencing `src/scenes/combatOrders.ts` for a tuning-radius note, **not an import statement**. There are **zero** `import … from '../scenes'` in the sim tree. Combined with the zero-Phaser result (§1) enforced by `tests/adapter.test.ts:123-138`, the architecture law holds: **the simulation has no compile-time knowledge of the renderer.**

**Tech-debt flags surfaced by this map:** (a) four SUPERSEDED-but-retained, production-dead audio modules (`cueQueue`, `sfxEventMapper`, `noXrayGate`, `atmosphereSpine`) awaiting H3 retirement (see report 2 §5); (b) `IsoScene.ts` at 6701 LOC concentrates render + input + camera + HUD + audio-bridge + sim-drive in one class (see report 2 §2).
