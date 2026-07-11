# Report 4 — NO-X-RAY Audit

Codebase: Brassmere (`7e3ddae`). Law audited: no information surface may disclose a HIDDEN actor's state/position unless its tile passes the canonical reveal predicate (`isRevealed` ∨ the `?reveal` dev override). Fog is grow-only (`sim/fog.ts` has no re-shroud path; `revealAround` only adds keys).

**Headline:** Every *cursor* and *render* surface is correctly gated, and the whole audio atmosphere lane funnels through one gate. But there is **one critical, untested leak**: the combat info-event path (`playCombatBeat` → `recordInfoEvent`) records positional Wire-log rows, minimap pings, and screen-edge alerts for *any* combat beat — including **rival-vs-rival brawls fought entirely inside the fog** — with **no visibility gate at all**. The flash/SFX beside it are gated; the information channels are not.

> **Auditor hand-verification of Finding 1 (the headline).** This claim was re-checked line-by-line against live source before publication:
> - `IsoScene.ts:3551` — `this.recordInfoEvent(combatEventKind(ev.kind), …, ev.gx, ev.gy)` fires **unconditionally**, ahead of the `visible` gate computed at `:3558`.
> - `IsoScene.ts:3566-3572` — the muzzle flash, hit-SFX, and hit-pip are all wrapped in `if (visible)`; `recordInfoEvent` is not.
> - `IsoScene.ts:6134-6144` — `recordInfoEvent` pushes the Wire-log row and, for positional taxonomy kinds, an edge alert (`:6139`) and a minimap ping (`:6142`), with no fog test.
> - `infoEvents.ts:43` — `'unit.down': { positional:true, alert:true, ping:true }`.
> - `combat.ts:33,93-99` — `hostile()` is `a.factionId !== b.factionId` (permits rival-vs-rival), and each event stamps the **struck unit's** tile (`gx: target.pos.gx`).
>
> The leak is real and reachable. Confirmed CONFIRMED.

---

## 1. Predicate registry (canonical, live-source)

| # | Predicate / helper | Location | Role |
|---|---|---|---|
| 1 | `isRevealed(fog,gx,gy)` | `src/sim/fog.ts:24` | base reveal test (grow-only Set) |
| 2 | `revealAround` | `src/sim/fog.ts:31` | reveal mutator (grow-only) |
| 3 | `revealAllRequested` | `src/sim/fog.ts:60` | `?reveal=1` flag parse |
| 4 | `revealAll` | `src/sim/fog.ts:70` | dev veil-lift mutator |
| 5 | `IsoScene.isVisibleTile` | `src/scenes/IsoScene.ts:2950` | **THE** scene gate = `debugRevealAll ‖ isRevealed(round)` |
| 6 | `shouldEmitFeedback(revealed,onScreen)` | `src/scenes/weaponFeedback.ts:136` | the shipped pass/fail combinator (render + audio) |
| 7 | `pickVisibleUnit` | `src/sim/selection.ts:131` | fog-safe cursor pick |
| 8 | `pickVisibleHostile` | `src/sim/combatControl.ts:169` | fog-safe verb-routing pick (**lives in `combatControl.ts`, not `selection.ts` as the brief states**) |
| 9 | `IsVisible` type + `ALWAYS_VISIBLE` | `src/sim/opPreview.ts:26,28` | injected predicate contract for the four op-previews |
| 10 | `VISIBLE_ONLY` / `UNKNOWN` sentinels | `src/sim/opPreviewTypes.ts` | fog-fallback strings (not a predicate) |
| 11 | `IsoScene.visibleFrontId` / `visibleBusinessAt` | `src/scenes/IsoScene.ts:2526,2537` | fog-safe front pick |
| 12 | `minimapRivalBlips` | `src/scenes/info/minimapMath.ts:89` | fog-gated rival blip filter |
| 13 | `copMarkerVisible` | `src/sim/beatCops.ts:342` | fog-gated cop marker |
| 14 | `isAudioFeedbackEligible` closure | `src/scenes/IsoScene.ts:2960` | audio `{revealed,onScreen}` adapter over #5/#6 |
| 15 | `cueSuppressReason`/`cueAllowed`/`gateCues` | `src/scenes/audio/noXrayGate.ts:47,63,73` | **SUPERSEDED** A–D gate (dead — see notes) |

**Reconciliation against the claimed "9 predicates, 235 callsites":**

Actual distinct *gating* predicate functions in live source: **≈13–14** (rows 1–14 above, excluding the `VISIBLE_ONLY` sentinel and the `revealAll*` dev mutators) — **more than 9**, not fewer. The `pickUnit` foil (`selection.ts:100`, ungated by design) is the deliberate non-predicate.

Raw callsite arithmetic (`grep -rn <name> src | wc -l`, includes defs/imports/comments/tests):

```
isRevealed 33  isVisibleTile 13  shouldEmitFeedback 19  pickVisibleUnit 8
pickVisibleHostile 4  visibleFrontId 3  visibleBusinessAt 5  cueSuppressReason 4
cueAllowed 1  gateCues 1  minimapRivalBlips 3  copMarkerVisible 5  ALWAYS_VISIBLE 4
isAudioFeedbackEligible 4  revealAllRequested 7  revealAll(excl.Requested) 7
IsVisible(type) 19  VISIBLE_ONLY 12  pickUnit(foil) 11
```

Union ≈ **163 name-occurrences** across `src` — inflated by definitions, imports, and doc-comments, so the true *invocation* count is materially lower. **The claimed "235 callsites" is not reconcilable with the tree; the real total is roughly two-thirds of that. The "9 predicates" is also stale — there are ~13–14.** Treat the header numbers as out-of-date.

---

## 2. CONFIRMED-GATED (good)

**RENDER — unit/figure draw loop.** `IsoScene.ts:2089` (sprite path) and `:2141` (occlusion + x-ray rim) gate every rival body on `isRevealed(fog, round(tile))`; a fogged rival draws nothing, and the occlusion x-ray rim is explicitly withheld from unrevealed units (`:2141`, `display` from `occlusionDisplay(occluded,critical,revealed)`). Health bars ride the same unit view (only drawn when the body is, `:2152`), and the faction ring/plate follow.

**RENDER — fronts / coins / plates.** Business coin + ownership glow culled at `IsoScene.ts:2236` (`!isRevealed(...) → setVisible(false); continue`). Dressing/plaza/ground washes all gate (`:1369,:1378,:1425,:1445`). Beat cops gate through `copMarkerVisible` (`:3658`), and even the `?debugCops` patrol edge re-checks the waypoint tile (`:3667`).

**RENDER — reticles / attack-intent telegraphs.** `drawTargetReticles` gates on `revealed && onScreen` via `showTargetReticle` (`IsoScene.ts:6432`). `commandFocusFire`'s intent flash re-uses `shouldEmitFeedback` (`:3082`). `flashAttackIntent` only ever fires against a target the pick already proved visible.

**RENDER — combat flash / muzzle / hit-pip.** `playCombatBeat` gates the *world flash + hit-SFX + hit-pip* behind `shouldEmitFeedback(isRevealed(fog,ev.gx,ev.gy), onScreen)` (`IsoScene.ts:3558,3566-3572`). (The information channels beside them are **not** — see §3, Finding 1.)

**CURSOR — hover / select / verb / op-preview card.** All four funnel through `isVisibleTile`:
- hover tooltip: `pickVisibleUnit` + `visibleBusinessAt` (`IsoScene.ts:4117,4136`).
- left-click select: player picks use ungated `pickUnit` (correct — own units, list pre-filtered to `faction==='player'`), rival/foe hint uses `pickVisibleUnit` (`:2831`), front uses `visibleBusinessAt` (`:2843`).
- right-click verb: `pickVisibleHostile`/`pickVisibleUnit` + `visibleBusinessAt` (`:2867,:2876`).
- op-preview card: `resolveOpPreview` gates the pick and the front tile (`:4055,:4069,:4079`), and the pure selectors return `VISIBLE_ONLY`/`UNKNOWN` for a fogged target (`opPreview.ts:66,124,158`).

This matches `tests/fogLeak.test.ts` — but note the test only covers these *cursor* surfaces (`fogLeak.test.ts:4-16`); it does **not** exercise the combat-log path, so Finding 1 is untested.

**MINIMAP — blips.** Rival blips filtered by `minimapRivalBlips(..., debugRevealAll ‖ isRevealed)` (`IsoScene.ts:6220`; impl `minimapMath.ts:89` — `units.filter(u => u.faction==='rival' && isRevealed(...))`); player blips always shown (own units). Correct — independently re-verified.

**AUDIO — combat SFX.** Gated at `IsoScene.ts:3558/3568` (same `visible` flag as the flash).

**AUDIO — atmosphere E–H lane.** Positional prop emitters pass the one gate inside `candidateFor` → `shouldEmitFeedback` (`propEmitterPlanner.ts`). Tile-carrying event cues **downgrade to non-positional** when the tile fails eligibility (`atmosphereCoordinator.ts:187`). `mapInterceptions` emits nothing for rival-vs-rival (no tile, no cue) (`eventCueMapper.ts:127`). The scene's injected `isAudioFeedbackEligible` correctly rides `isVisibleTile` for `revealed` while keeping `onScreen` on pure camera bounds so `?reveal` can't make off-screen audio audible (`IsoScene.ts:2960`). District bed resolver returns `null` for unexplored tiles (`atmosphereDistrictAt`, `:2969`). The collector-cue source is deliberately `processCollectorArrivals` deposits, never `arrivedUnitIds` (which carries rivals) (`IsoScene.ts:3024`). This lane is clean.

**INTEL / ADVISOR / DOSSIER / STATUS.** Structurally NO-X-RAY: `sim/intel.ts` `DossierEntry` has no coordinate field — only district-level `lastKnownDistrictId`, frozen at learn time and aged (`intel.ts:44-60`). `sim/advisor.ts` reasons only over a player-knowable snapshot + Wire rows. `statusDashboard.ts` is a player-knowable aggregate with no rival-position/count field (`:8-10,:112`).

---

## 3. POTENTIAL-LEAK (ungated)

### Finding 1 — CRITICAL: combat info-events (Wire log + minimap ping + edge alert) leak hidden combat position
**Surface:** `IsoScene.playCombatBeat` → `recordInfoEvent` → Wire log / pings / edge alerts.
**Cite:** `IsoScene.ts:3551` (the record call) sits **before** and **independent of** the visibility test at `:3558`. `recordInfoEvent` itself applies **no fog gate** — it pushes a Wire-log row with `gx,gy` (`:6136`), and (for `alert`/`ping` taxonomy kinds) an edge alert (`:6139-6140`) + minimap ping (`:6142-6143`), purely off `metaFor(kind)`. The loop at `IsoScene.ts:1962` (`for (const ev of obs.result.combat) this.playCombatBeat(ev)`) feeds **every** combat beat unconditionally.

**Why it leaks:** `resolveProximityCombat` pairs *any* two combatants on different families — `hostile()` is `a.factionId !== b.factionId` (`combat.ts:33`) — so **two rival families brawling deep in the fog** emit real `CombatEvent`s at `target.pos` (`combat.ts:93-99`). For a `down`, the taxonomy is `unit.down`: `positional:true, alert:true, ping:true` (`infoEvents.ts:43`). Result on a fully-fogged tile:
- a **Wire-log row** "a rival thug went DOWN", click-to-jump to the exact tile (`drawWireLog` → `wireLogHits` → `handleInfoClick`/`jumpToTile`, `IsoScene.ts:3652,6494`);
- a **minimap ping** at the tile (`:6143` → `drawMinimap:6226`);
- a **screen-edge arrow** pointing at the off-screen fogged tile (`:6141` → `drawEdgeAlerts:6254`).

Even a non-down `hit` (taxonomy `combat.hit`, `positional:true`) still produces a **click-to-jump Wire row** at the fogged tile ("rival thug took a hit") — no mouse-sweep required; the row itself is the X-ray.

**Failure scenario:** Rival-A and Rival-B skirmish over a contested block the player has never scouted. The player sees an edge arrow + minimap ping + a log line naming a rival casualty, and one click teleports the camera onto the hidden fight — a free reveal of enemy positions and inter-rival conflict the fog is supposed to hide. Also reachable when a player thug downs a rival that has stepped just outside `FOG_REVEAL_RADIUS` (`revealFog:1494`), since the event tile is the *struck* unit's tile, not the attacker's.

**Fix shape (not applied — read-only):** gate the combat kinds inside/around `recordInfoEvent` on `isVisibleTile({gx,gy})` before logging/pinging/alerting — the same predicate already computed one line later for the flash. (Own-unit downs — `faction==='player'` — should stay visible.)

**Rank: CRITICAL** (three independent player-facing channels leak a hidden actor's exact tile; untested by `fogLeak.test.ts`; hand-verified above).

### Finding 2 — LOW / SECONDARY: sim-side `state.log` "unit-down" entry names faction unconditionally
**Cite:** `combat.ts:100-104` pushes `state.log { kind:'unit-down', message:"…went down in a brawl", data:{faction,byFaction} }` for every down, fog or not. Today this is **not surfaced**: the on-screen Wire uses the separate `wireLog`, and the audio `mapLogEvents` does not map `'unit-down'` (silent — `eventCueMapper.ts:52`). So no live leak — but a **latent** one: any future surface that renders `state.log` (or a broader audio kind map) would expose hidden-rival casualties by faction. Flag for defense-in-depth.
**Rank: LOW** (dormant; no current reader).

### Finding 3 — LOW / BY-DESIGN divergence: minimap district-control fill is not fog-gated
**Cite:** `drawMinimap` fills every district by `districtControlStatus` (`IsoScene.ts:6195-6200`), which is pure holder-lookup with **no fog test** (`districtControlStatus:6538`). A rival-held district in never-scouted territory paints static rival-red. This is a **second visibility closure that diverges from `isVisibleTile`** — the blips right below it (`:6220`) *are* fog-gated, the fills are not. Per the minimap's own canon note (`minimapMath.ts` header) only *blips* are gated; district-granularity territorial control is treated as player-knowable macro info (Civ-border style), not a unit position. Defensible by design, but it is the one ungated info channel on the minimap and worth an explicit ruling.
**Rank: LOW** (district-granularity, no coordinate; deliberate — but an un-annotated divergence).

### Finding 4 — LOW / accepted: `collector.robbed` / `rival.telegraph` positional events
**Cite:** `IsoScene.ts:1960` (collector robbed) and `:1849` (rival strike telegraph) both `recordInfoEvent` with a tile and are *not* wrapped in an `isVisibleTile` guard. Both are **player-owned information** by canon: the robbed collector is the player's own unit (its route is known; it reveals fog around itself, `revealFog:1494`), and the telegraph is explicitly the player's *own* graded intel window (tier degraded by `targetRevealed`/`friendlyNearby`, `:1841-1846`) — a blind block yields only a district-level "word on the street" rumor, never a coordinate read of a hidden striker. Acceptable, but the telegraph *does* stamp `order.gx,order.gy` into the ping/alert even at the "rumor" tier, so the arrow points at the true tile regardless of tier. Minor — the striker is the player's assailant-to-be, which canon treats as fair warning.
**Rank: LOW** (player-facing by construction; telegraph tier-vs-coordinate mismatch is a polish item, not a hidden-actor leak).

---

## Verification notes

Independent second-pass re-trace of each surface's data flow to the predicate (or its absence):

- **Added the critical finding on adversarial re-trace.** First pass noted `playCombatBeat` gates flash/sound at `:3558` and moved on. Re-tracing the *information* channels (not the A/V ones) exposed that `recordInfoEvent` at `:3551` runs unconditionally and that `resolveProximityCombat`/`hostile()` permit rival-vs-rival pairings (`combat.ts:33,78`) — making fogged combat a real, reachable event source. This is Finding 1, the report's highest-value result. It is **not** covered by `tests/fogLeak.test.ts` (which stops at cursor surfaces, `:4-16`). Re-verified by hand against live source (see the box at the top).
- **Confirmed the cursor cluster is genuinely gated, not just commented so.** Traced each pick to `isVisibleTile` (`:2831,2843,2867,2876,4055,4117,4136`) and the front picks to `visibleFrontId` (`:2528`). `commandSelect`'s use of *ungated* `pickUnit` (`:2812,2821`) is correct — those lists are pre-filtered to `faction==='player'`.
- **Confirmed the audio E–H lane is live and the `noXrayGate.ts` A–D gate is dead.** The shipped path routes through `propEmitterPlanner` and `atmosphereCoordinator.ts:187`, both calling `shouldEmitFeedback` directly. `cueSuppressReason` occurrences are all within the retired module + its tests — not wired into `IsoScene`. No leak, but it inflates the predicate count and should be retired (report 2 §5).
- **`pickVisibleHostile` is in `sim/combatControl.ts:169`, not `sim/selection.ts`** as the brief asserts — verified by `grep`.
- **Predicate/callsite counts:** independent tally is **≈13–14 gating predicate functions** (vs the claimed 9) and **≈163 raw name-occurrences** across `src` (vs the claimed 235 callsites) — the true invocation count is lower still. The header's "9/235" does not match the tree.
- **Two visibility closures diverge from `isVisibleTile`:** (a) minimap district *fills* (`districtControlStatus`, ungated — Finding 3), and (b) the sim-side `state.log` combat push (`combat.ts:100`, ungated but currently unread — Finding 2). Neither is a live coordinate leak, but both are un-annotated divergences from the single-gate ideal.
