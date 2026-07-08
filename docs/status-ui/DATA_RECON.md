# Status UI — Data-Source Recon (top-10 MVP screens)

Read-only recon (PART B) for the *Status Screens and Command UI* spec section-8 top-10. Each required field is mapped to its ACTUAL source in `/src/sim`, verified against live code (file:line). **Nothing was modified.** This is the data map that unblocks the screen-body dispatch: selector rows are readable today, state rows need a thin selector, MISSING rows need new plumbing.

**Totals:** 114 fields — 94 selector-backed / 12 in-state-no-selector / 8 MISSING / **39 fog-sensitive** (must read through the NO-X-RAY seam).

### Status legend
- **selector** — an existing exported sim selector returns it (use as-is).
- **state, no selector** — the value is on `GameState`/types but no selector exposes it; needs a thin pure selector.
- **MISSING** — does not exist; needs new sim plumbing before the body can show it.

### NO-X-RAY (load-bearing)
Every row flagged **fog** surfaces rival / cop / other-family / not-yet-scouted district or incident state. Those bodies MUST read through the existing predicate `opPreview.IsVisible = (pos: GridPos) => boolean` with the `VISIBLE_ONLY` / `UNKNOWN` tokens (`src/sim/opPreviewTypes.ts`) — never a new visibility rule. The player's OWN cash/heat/crew/fronts are not fogged.


## 1. Main Command Dashboard  (`commandDashboard`)

| Field | Source | Selector / path | file:line | Fog |
|---|---|---|---|:-:|
| cash | selector | `familyHudView` | src/sim/hud.ts:80 |  |
| dirtyCash | selector | `familyHudView` | src/sim/hud.ts:83 |  |
| income | selector | `familyIncome` | src/sim/economy.ts:72 |  |
| expenses | selector | `familyExpenses` | src/sim/economy.ts:78 |  |
| weeklyNet | selector | `playerWeeklyNet` | src/sim/pacing.ts:161 |  |
| heat | selector | `familyHudView` | src/sim/hud.ts:84 |  |
| federalExposure | selector | `federalExposure` | src/sim/federal.ts:31 |  |
| control% | selector | `cityStanding` | src/sim/contest.ts:91 |  |
| districtsHeld | selector | `districtsHeld` | src/sim/territoryWar.ts:154 |  |
| contestedCount | selector | `citySummary` | src/sim/districtStatus.ts:94 | FOG |
| uncollectedPending | selector | `totalUncollected` | src/sim/collection.ts:59 |  |
| federalTier | selector | `fedWarningTier` | src/sim/federal.ts:37 |  |
| raid/bust warning | selector | `topFederalWarning` | src/sim/hud.ts:120 |  |
| activeAlerts(top3) | selector | `topSuggestions` | src/sim/advisor.ts:170 |  |
| currentObjective | selector | `firstObjective` | src/sim/onboarding.ts:101 |  |
| recentIncidentSummary | selector | `recentIncidents` | src/sim/ledger.ts:162 | FOG |
| cashDelta (recent) | state, no selector | `GameState.incidents[].data.cleanDelta/dirtyDelta` | src/sim/realtime.ts:154 |  |
| heatDelta (recent) | state, no selector | `GameState.incidents[].data.heatDelta` | src/sim/realtime.ts:156 |  |
| exposureDelta (recent) | state, no selector | `GameState.incidents[].data.exposureDelta` | src/sim/realtime.ts:157 |  |
| controlDelta (recent) | MISSING | `MISSING` | — |  |

<details><summary>notes</summary>

- **contestedCount** — citySummary.contested; alt contestedDistrictIds (turfWar.ts:173), desiredContestCount (turfWar.ts:68). Surfaces rival-invasion state, and cityRoster enumerates EVERY district incl rival shares with NO fog gate — route through isVisible.
- **recentIncidentSummary** — Newest-first feed; single via lastIncident (ledger.ts:173). Ledger harvests ALL curated log kinds incl rival-vs-rival captures/positions — filter to player-visible incidents.
- **cashDelta (recent)** — NO delta selector. Computed only in updateAndObserve (realtime.ts:143-144) and buried in the last 'settlement' IncidentRecord.data (cleanDelta+dirtyDelta). Cash delta = clean+dirty. Own.
- **heatDelta (recent)** — NO delta selector. In settlement incident data only (computed realtime.ts:141). Own.
- **exposureDelta (recent)** — NO delta selector. In settlement incident data only (computed realtime.ts:142). Own.
- **controlDelta (recent)** — Not tracked anywhere. snapshotPlayer (realtime.ts:101) only captures cleanCash/dirtyCash/heat/exposure — no control/districtsHeld prior-week snapshot exists, so no control delta can be derived.

</details>

## 2. Control Map  (`controlMap`)

| Field | Source | Selector / path | file:line | Fog |
|---|---|---|---|:-:|
| district control share — PLAYER | selector | `districtStatusOf` | src/sim/districtStatus.ts:47 |  |
| district control share — RIVAL | selector | `topRivalControl` | src/sim/territory.ts:52 | FOG |
| contested zones | selector | `districtContested` | src/sim/turfWar.ts:170 | FOG |
| fronts | selector | `inspectBusiness` | src/sim/inspect.ts:113 | FOG |
| rackets (illegal ops / rival-owned) | selector | `businessEarner` | src/sim/economy.ts:45 | FOG |
| HQs | selector | `hqTileOf` | src/sim/mapEconomy.ts:98 | FOG |
| police density | selector | `inspectDistrict` | src/sim/inspect.ts:146 | FOG |
| cop markers (beat cops on the map) | selector | `copMarkerVisible` | src/sim/beatCops.ts:342 | FOG |
| expansion routes — PLAYER | selector | `expandTargetDistrictId` | src/sim/pacing.ts:186 |  |
| expansion routes — RIVAL (telegraphed pushes) | selector | `telegraphedPushes` | src/sim/strategy.ts:150 | FOG |
| district boundaries / tile→district partition | selector | `districtOfWorldTile` | src/sim/worldgen.ts:157 |  |

<details><summary>notes</summary>

- **district control share — RIVAL** — topRivalControl (legacy control points) + rivalShare (PRIVATE fn districtStatus.ts:32) surfaced via districtStatusOf owner/ownerName when RIVAL/CONTESTED (districtStatus.ts:64-71); districtHolder (territory.ts:16); districtsHeld (territoryWar.ts:154); districtIncomeFor (territoryWar.ts:168); territoryWar.districtStatus holderId (territoryWar.ts:17). NONE gate on fog — must be read through IsVisible (opPreview.ts:26)/isRevealed (fog.ts:18) or rival/unscouted holdings are X-ray.
- **contested zones** — districtContested / contestedDistrictIds (turfWar.ts:173) / contestOf (turfWar.ts:167, returns Contest with invaderId+pressure) over state.contests (types.ts:274; Contest shape types.ts:300). Also districtStatusOf status='CONTESTED' (districtStatus.ts:61). A contest is an active RIVAL invasion (invaderId, pressure, muscleIds) → gate through the IsVisible seam; these selectors don't.
- **fronts** — Placement = businessTileOf (mapEconomy.ts:94) / businessAtTile (mapEconomy.ts:103) / laidOutBusinessIds (mapEconomy.ts:352). Detail = inspectBusiness (kind, earnerId/earnerName, payingProtection, income, uncollected). Business.kind='front'/extortedBy (types.ts:100/103). Player's OWN fronts are safe, but earnerId/extortedBy reveals RIVAL protection and unscouted fronts → fog-gate; inspectBusiness does not.
- **rackets (illegal ops / rival-owned)** — businessEarner returns a front's extorter OR an op's ownerFamily (Business.ownerFamily types.ts:104, kind types.ts:100); earningBusinesses (interdiction.ts:87) filters by family; inspectBusiness.earnerName (inspect.ts:118); rivalShare counts rival earners (districtStatus.ts:32). RIVAL rackets/ownership are X-ray unless gated by IsVisible/isRevealed.
- **HQs** — hqTileOf over MapLayout.hqTiles (mapEconomy.ts:48) / WorldLayout.hqTiles stamped by generateWorld (worldgen.ts:49,108). Rival HQ integrity = hqIntegrityOf (endgame.ts:14) over Family.hqIntegrity (types.ts:80); rivalWeakness/weakestRival (endgame.ts:163/179). Player HQ safe; a RIVAL HQ location + integrity is rival state → fog-gate (layout + hqIntegrityOf do not).
- **police density** — inspectDistrict.policePresence (inspect.ts:155) over District.policePresence (types.ts:149); cop spawn weighting = copDistrictWeights (beatCops.ts:181) / desiredCopCount (beatCops.ts:172). Unscouted-district detail → fog-gate. Distinct from the live beat-cop markers (next row).
- **cop markers (beat cops on the map)** — BeatCop positions/mode/suspicion/focusUnitId/lastSeen = state.beatCops (types.ts:285; BeatCop shape beatCops.ts:46). copMarkerVisible (beatCops.ts:342) IS the built-in fog gate (revealAll ∨ isRevealed fog.ts:18) — the scene must call exactly this before drawing a cop; never render an unrevealed cop or its focus.
- **expansion routes — RIVAL (telegraphed pushes)** — telegraphedPushes (rival→district targets) + rivalStrategicTarget (strategy.ts:79) + rivalPushAmount (strategy.ts:95) expose RIVAL expansion intent. This is meant to reach the player only via the deliberate TELEGRAPH seam (telegraph.ts buildTelegraphReport/targetRevealed, gated by presence/scouting) — the raw strategic target is rival state; anything beyond the telegraph must pass IsVisible/isRevealed.

</details>

## 3. Money Ledger  (`moneyLedger`)

| Field | Source | Selector / path | file:line | Fog |
|---|---|---|---|:-:|
| cleanCash | selector | `cleanCash` | src/sim/laundering.ts:17 |  |
| dirtyCash | selector | `familyHudView` | src/sim/hud.ts:81 |  |
| weeklyIncome | selector | `familyIncome` | src/sim/economy.ts:72 |  |
| weeklyIncome / source: extortion | selector | `extortionIncome` | src/sim/economy.ts:50 |  |
| weeklyIncome / source: operations | selector | `operationIncome` | src/sim/economy.ts:61 |  |
| weeklyExpenses | selector | `familyExpenses` | src/sim/economy.ts:78 |  |
| weeklyExpenses / itemized: upkeep | state, no selector | `Family.gangsters[].upkeep` | src/sim/types.ts:42 |  |
| weeklyExpenses / itemized: bribe retainers | state, no selector | `Family.bribeLevel` | src/sim/types.ts:59 |  |
| weeklyNet | selector | `playerWeeklyNet` | src/sim/pacing.ts:161 |  |
| debt / loan | selector | `familyHudView` | src/sim/hud.ts:83 |  |
| uncollectedCash / pending | selector | `totalUncollected` | src/sim/collection.ts:59 |  |
| launderingCapacity | selector | `launderCapacity` | src/sim/laundering.ts:55 |  |

<details><summary>notes</summary>

- **weeklyExpenses / itemized: upkeep** — Upkeep is summed INLINE inside familyExpenses (economy.ts:79: gangsters.reduce(sum+g.upkeep)); no dedicated upkeep-only selector. Per-gangster field Gangster.upkeep (types.ts:42). Player-own.
- **weeklyExpenses / itemized: bribe retainers** — Retainer computed INLINE in familyExpenses (economy.ts:81: max(0, bribeLevel - crewBribeDiscount(family))); no dedicated retainer selector. bribeLevel = total standing bribe (types.ts:59); per-channel breakdown Family.bribes (types.ts:63); crewBribeDiscount exported (index.ts). Player-own.

</details>

## 4. Heat / Beat Meter  (`heatBeatMeter`)

| Field | Source | Selector / path | file:line | Fog |
|---|---|---|---|:-:|
| currentHeat | selector | `familyHudView` | src/sim/hud.ts:84 |  |
| heat-source: extorted fronts | MISSING | `MISSING` | — |  |
| heat-source: illegal operations | selector | `operationHeat` | src/sim/economy.ts:18 |  |
| heat-source: dirty-cash hoard | selector | `heatFromDirty` | src/sim/laundering.ts:40 |  |
| heat-source: collections | MISSING | `MISSING` | — |  |
| heat-source: offensive actions | MISSING | `MISSING` | — |  |
| heat-source: sabotage-violence | MISSING | `MISSING` | — |  |
| heat-source: cop reports [later] | MISSING | `MISSING` | — | FOG |
| heat-source: systemic shocks [later] | MISSING | `MISSING` | — |  |
| districtPolicePresence | selector | `inspectDistrict` | src/sim/inspect.ts:156 | FOG |
| beatCopReports | MISSING | `MISSING` | — | FOG |
| raidRisk | selector | `raidChance` | src/sim/law.ts:40 |  |
| heat decay/mitigation | selector | `effectiveDecay` | src/sim/law.ts:50 |  |

<details><summary>notes</summary>

- **heat-source: extorted fronts** — No heat-source breakdown selector exists — heat is a single scalar. Extort heat = EXTORT_HEAT(4, constants.ts:8) x extorted-front count, applied INLINE in tick.ts:85 (resolveExtortionHeat) and folded into Family.heat, never stored per-source. No selector returns 'heat from extorted fronts' (only extortionIncome/launderCapacity count fronts). Own heat source.
- **heat-source: collections** — No selector. Collection heat = COLLECT_HEAT(2, constants.ts:160), applied inline on deposit in mapEconomy.ts:251 and in the collect command commands.ts:748 — never stored per-source. Own heat source.
- **heat-source: offensive actions** — No selector. Offense heat added inline via offense.ts:43 (family.heat += amount for raid/sabotage/assassinate). Not exposed or stored per-source. Own heat source.
- **heat-source: sabotage-violence** — No selector. Violence heat applied inline: HIT_HEAT(25) conflict.ts:119, ATTACK_HEAT(6) interdiction.ts:74, INTERCEPT_HEAT interception.ts:102. Constants only; no per-source breakdown selector. Own heat source.
- **heat-source: cop reports [later]** — Does not exist. Beat cops (state.beatCops, types.ts:285; copBehavior suspicion/mode) are numbers-frozen and add NO heat and emit NO player-facing 'report'. If built, this surfaces COP state and MUST read through the fog seam (copBehavior.copSees / beatCops.copMarkerVisible), never x-ray. fogSensitive.
- **heat-source: systemic shocks [later]** — No heat-contribution selector. Crackdown shock adds CRACKDOWN_HEAT(8) to every family inline in shocks.ts:124. The active-shock LIST is on state.activeShocks (types.ts:224) and exposed via realtimeHudView.shocks (hud.ts:114) / incomeShockMultiplier, but the heat contribution is not. Shocks are global/systemic (not hidden rival state), player's own crackdown heat.
- **districtPolicePresence** — District.policePresence (state, types.ts:149). inspectDistrict(...).policePresence returns it (also drives operationHeat, copDistrictWeights, collectionSafety). WARNING: inspectDistrict reads d.policePresence with NO isVisible gate — district detail is fog-sensitive (not-yet-scouted districts), so surfacing it MUST route through the opPreview IsVisible seam; the current selector does not.
- **beatCopReports** — No player-facing 'report' concept/selector. BeatCop state exists (beatCops.ts:46: suspicion/mode/focusUnitId/lastSeen) but is observation-only. Any surfaced cop report is fog-sensitive and must gate on copBehavior.copSees / beatCops.copMarkerVisible (isRevealed) — reuse the visibility seam, do not x-ray cop positions/witnessing.

</details>

## 5. Federal Ladder  (`federalLadder`)

| Field | Source | Selector / path | file:line | Fog |
|---|---|---|---|:-:|
| federalExposure | selector | `federalExposure` | src/sim/federal.ts:31 |  |
| currentTier (CLEAR/NOTICE/WATCH/RAID) | selector | `federalTierLabel` | src/sim/hudText.ts:12 |  |
| thresholds 50/70/85 | selector | `FEDERAL_LADDER` | src/sim/hudText.ts:20 |  |
| heatContribution | selector | `familyHudView` | src/sim/hud.ts:84 |  |
| dirtyCashContribution | selector | `dirtyExposurePoints` | src/sim/federal.ts:20 |  |
| fedsBribeRelief | selector | `fedExposureRelief` | src/sim/federal.ts:26 |  |
| bustArmed | selector | `familyHudView` | src/sim/hud.ts:85 |  |
| bustArmTimer (fedImminentTicks) | state, no selector | `player.fedImminentTicks` | src/sim/types.ts:75 |  |
| recentFederalLogEvents | selector | `incidentsByType` | src/sim/ledger.ts:168 |  |

<details><summary>notes</summary>

- **bustArmTimer (fedImminentTicks)** — Family.fedImminentTicks counts consecutive ticks at the imminent tier; arm fires at > FED_ARM_DELAY(3, constants.ts:130) (federal.ts:96-100). Exists on state but NO selector exposes it — familyHudView surfaces bustArmed only, not the countdown/timer. Own.

</details>

## 6. Thug Roster  (`thugRoster`)

| Field | Source | Selector / path | file:line | Fog |
|---|---|---|---|:-:|
| name / id | selector | `crewReadout` | src/sim/crew.ts:118 |  |
| role | selector | `inspectUnit` | src/sim/inspect.ts:82 |  |
| skill | selector | `crewReadout` | src/sim/crew.ts:118 |  |
| loyalty | selector | `crewReadout` | src/sim/crew.ts:118 |  |
| upkeep | selector | `crewReadout` | src/sim/crew.ts:118 |  |
| weaponTier | state, no selector | `state.units[].weapon` | src/sim/movement.ts:33 |  |
| currentAssignment | selector | `crewReadout` | src/sim/crew.ts:118 |  |
| map position | selector | `unitTile` | src/sim/movement.ts:98 |  |
| health / downed state | selector | `unitHealth` | src/sim/combat.ts:22 |  |
| (rival units — the fog seam if the roster ever lists non-player units) | selector | `pickVisibleUnit` | src/sim/selection.ts:108 | FOG |

<details><summary>notes</summary>

- **weaponTier** — MovableUnit.weapon (WeaponTier) EXISTS but NO selector returns a unit's tier — inspectUnit omits it; enforcerUnitSkill/enforcerPresenceWeight (enforcers.ts:46/51) read it but return skill/weight; CombatEvent.weapon (combat.ts:69) carries the attacker's. NOT on Gangster (types.ts:38): recruitEnforcer stores the tier only in the name label (enforcers.ts:104), so per-crew-member weaponTier is effectively MISSING. Tier table = ENFORCER_SPECS (enforcers.ts:32).
- **(rival units — the fog seam if the roster ever lists non-player units)** — THE No-X-ray seam for units: pickVisibleUnit (selection.ts:108), pickVisibleHostile (combatControl.ts:169), nearestVisibleHostile (combatControl.ts:132), visibleThreats (combatControl.ts:151) — all keyed on IsVisible (opPreview.ts:26) = isRevealed (fog.ts:18), with UNKNOWN/VISIBLE_ONLY tokens (opPreviewTypes.ts:47-48). inspectUnit/unitTile/unitHealth/crewReadout do NOT gate fog, so any non-player unit surfaced there must be filtered through this predicate first.

</details>

## 7. Racket Operations  (`racketOperations`)

| Field | Source | Selector / path | file:line | Fog |
|---|---|---|---|:-:|
| type (operation kind) | selector | `inspectBusiness` | src/sim/inspect.ts:113 | FOG |
| district | selector | `inspectBusiness` | src/sim/inspect.ts:113 | FOG |
| owner | selector | `businessEarner` | src/sim/economy.ts:45 | FOG |
| tier | selector | `tierOf` | src/sim/tiers.ts:9 | FOG |
| income | selector | `businessAccrual` | src/sim/economy.ts:30 | FOG |
| heatPerTick | selector | `operationHeat` | src/sim/economy.ts:18 | FOG |
| uncollectedTakings | selector | `uncollectedOf` | src/sim/collection.ts:19 | FOG |
| shutdownStatus | selector | `isShutDown` | src/sim/economy.ts:40 | FOG |
| upgradeStatus/affordability | selector | `viceLadder` | src/sim/vice.ts:74 |  |

<details><summary>notes</summary>

- **type (operation kind)** — inspectBusiness returns .kind at inspect.ts:122 (raw Business.kind types.ts:100). Screen lists rival-owned rackets too, so a rival op's kind must gate through opPreview IsVisible; no dedicated 'list operations' selector — enumerate via allBusinesses (economy.ts:10) filtered kind!=='front'.
- **district** — .districtId/.districtName at inspect.ts:123-124 (raw Business.districtId types.ts:105). A rival op's location is un-scouted district detail — gate via IsVisible.
- **owner** — For an op returns ownerFamily; also inspectBusiness.earnerId/earnerName (inspect.ts:117,125-126). Reveals which family owns a rival racket — fog-gated.
- **tier** — Also inspectBusiness.tier (inspect.ts:130); raw Business.tier types.ts:111. Rival racket strength — gate via IsVisible.
- **income** — businessAccrual = current per-tick take (0 while shut); surfaced by inspectBusiness.income (inspect.ts:128). Tier-scaled nominal = effectiveOperationIncome (tiers.ts:19); per-family sum = operationIncome (economy.ts:61). Rival racket income — fog-gated.
- **heatPerTick** — Effective heat = base × tierMultiplier × (1+policePresence/100); raw base = Business.heatPerTick (types.ts:101). Rival racket heat output — fog-gated.
- **uncollectedTakings** — Per-business takings; also inspectBusiness.uncollected (inspect.ts:129); aggregates pendingCollection (collection.ts:51) / totalUncollected (collection.ts:59). A rival racket's piled takings are prime x-ray — MUST gate via IsVisible.
- **shutdownStatus** — isShutDown returns boolean only; the numeric weeks-remaining is Business.shutdownTicks (types.ts:115) with NO selector exposing the count (state-no-selector for the number). Rival racket state — fog-gated.

</details>

## 8. Fronts / Extortion  (`frontsExtortion`)

| Field | Source | Selector / path | file:line | Fog |
|---|---|---|---|:-:|
| unshaken fronts | selector | `extortProgress` | src/sim/extortion.ts:29 | FOG |
| extorted fronts | selector | `earningBusinesses` | src/sim/interdiction.ts:87 |  |
| rival-held fronts | selector | `isRivalHeldFront` | src/sim/extortionEmbodied.ts:98 | FOG |
| resistance/visit progress | selector | `extortProgress` | src/sim/extortion.ts:29 | FOG |
| district control | selector | `districtStatusOf` | src/sim/districtStatus.ts:47 | FOG |
| income potential | selector | `previewExtortFront` | src/sim/opPreview.ts:125 | FOG |
| current embodied-shakedown acts | state, no selector | `GameState.extortionActs` | src/sim/types.ts:247 |  |

<details><summary>notes</summary>

- **unshaken fronts** — Per-front flag extortProgress(...).extortable (front && extortedBy===undefined; raw Business.extortedBy types.ts:104). No 'list all unshaken fronts' selector — enumerate via allBusinesses filtered. Un-shaken fronts in un-scouted districts are district detail — gate via IsVisible.
- **rival-held fronts** — isRivalHeldFront (front extortedBy a non-player family). Retake seam: frontGuard (extortionEmbodied.ts:106) + isRetakeableFront (extortionEmbodied.ts:122). No list-selector. Explicit rival state — MUST gate through opPreview IsVisible; frontGuard's nearest-hostile scan should also read through the fog seam.
- **resistance/visit progress** — extortProgress → visits/needed/remaining; resistance = extortResistance (extortion.ts:13, wealth-scaled); raw Business.extortVisits types.ts:123. Block/district detail (a rival-held front's visit count is other-family progress) — gate via IsVisible. NOTE the sim's own previews (opPreview) show 'needed' even when fogged and gate only income — the seam-correct render should gate un-scouted blocks.
- **district control** — districtStatusOf returns player pct/bizHeld/bizTotal AND rival owner+share (rivalShare, districtStatus.ts:32); underlying control points controlOf (territory.ts:7), holder districtHolder (territory.ts:16), rival share topRivalControl (territory.ts:52). Rival control shares are explicitly fog-sensitive — gate via IsVisible.
- **income potential** — previewExtortFront reward row = +$floor(baseIncome×EXTORT_RATE)/tick, already gated behind the IsVisible predicate (opPreview.ts:112 shakedownEconomy → VISIBLE_ONLY when fogged); rival-held variant previewRetakeFront (opPreview.ts:159). Realized income for already-extorted fronts = businessAccrual (economy.ts:30). No plain numeric front-potential selector exists outside the fog-aware preview — this IS the correct seam usage.
- **current embodied-shakedown acts** — Active acts live on state.extortionActs (shape EmbodiedExtortionAct, extortionEmbodied.ts:40); only WRITTEN/advanced by advanceEmbodiedExtortion (extortionEmbodied.ts:308) and the applyCommand wrapper — NO read-only getter selector exports them. These are the PLAYER's own thug orders — not fog-sensitive.

</details>

## 9. Incident Ledger  (`incidentLedger`)

| Field | Source | Selector / path | file:line | Fog |
|---|---|---|---|:-:|
| incident list | selector | `recentIncidents` | src/sim/ledger.ts:162 | FOG |
| severity | selector | `recentIncidents` | src/sim/ledger.ts:44 |  |
| category/type | selector | `incidentsByType / alertCategory` | src/sim/ledger.ts:41 |  |
| time/week | selector | `recentIncidents` | src/sim/ledger.ts:42 |  |
| summary | selector | `recentIncidents` | src/sim/ledger.ts:45 | FOG |
| linkedEntity | state, no selector | `GameState.incidents[].data` | src/sim/ledger.ts:48 | FOG |
| location | state, no selector | `GameState.incidents[].data.districtId` | src/sim/ledger.ts:48 | FOG |

<details><summary>notes</summary>

- **incident list** — recentIncidents(state,n) / incidentsByType (ledger.ts:168) over state.incidents (types.ts:265). Contains rival/cop/territory incidents projected from log regardless of what the player saw — gate to visible.
- **summary** — IncidentRecord.summary — human one-liner copied from the source event message; embeds rival family names + district names (e.g. district-captured message), so it leaks rival/location detail.
- **linkedEntity** — No typed field/selector. Lives in IncidentRecord.data (Record<string,unknown>) as familyId/newHolder/oldHolder/victim/businessId etc. Rival/other-family linkage — fog-gate.
- **location** — No typed field/selector; data.districtId (and unit/tile) only on some records (territory/capture/disruption). No selector filters incidents by location. Incident location = fog-sensitive per spec.

</details>

## 10. District Dossier  (`districtDossier`)

| Field | Source | Selector / path | file:line | Fog |
|---|---|---|---|:-:|
| wealth | selector | `districtValue` | src/sim/city.ts:57 | FOG |
| archetype | selector | `districtIdentity` | src/sim/city.ts:38 | FOG |
| control shares | selector | `districtStatusOf` | src/sim/districtStatus.ts:47 | FOG |
| businesses | selector | `inspectDistrict` | src/sim/inspect.ts:158 | FOG |
| rackets | selector | `inspectDistrict` | src/sim/inspect.ts:159 | FOG |
| police presence | selector | `inspectDistrict` | src/sim/inspect.ts:157 | FOG |
| heat sensitivity | selector | `districtIdentity` | src/sim/city.ts:38 | FOG |
| collectors | state, no selector | `GameState.units` | src/sim/types.ts:234 |  |
| citizens/prop density[later] | selector | `scatterProps / parseLiveliness` | src/sim/worldgen.ts:211 |  |
| current incidents | state, no selector | `GameState.incidents (data.districtId)` | src/sim/ledger.ts:48 | FOG |

<details><summary>notes</summary>

- **wealth** — districtValue(d,index)=districtIdentity(d,i).wealth (city.ts:38); District.wealth (types.ts:153) or derived from index. Static identity, but 'not-yet-scouted district detail' is fog-sensitive per spec.
- **archetype** — districtIdentity(d,i).archetype; District.archetype (types.ts:158) or CITY_ARCHETYPES fallback (city.ts:17). Static identity; fog-gate for un-scouted districts.
- **control shares** — DistrictRow: pct/bizHeld/bizTotal (player) + owner/ownerName (RIVAL id via internal rivalShare, districtStatus.ts:32). Per-family fraction via familyShare (turfWar.ts:27). Rival share = classic x-ray — MUST fog-gate; districtStatusOf itself has no visibility check.
- **businesses** — inspectDistrict.businessCount (count only). Full per-district list is District.businesses (types.ts:150) — no district-scoped list selector (allBusinesses/earningBusinesses aren't per-district). Reveals a district's composition regardless of fog.
- **rackets** — inspectDistrict.operationCount (kind!=='front'). Player's own rackets via earningBusinesses (interdiction.ts:87). A rival district's rackets are rival state — fog-gate.
- **police presence** — inspectDistrict.policePresence = District.policePresence (types.ts:149). District law-detail (also drives cop spawn weights, beatCops.ts:181) — fog-gate for un-scouted districts.
- **heat sensitivity** — districtIdentity(d,i).heatSensitivity; District.heatSensitivity (types.ts:155) or derived. Static identity; fog-gate for un-scouted districts.
- **collectors** — No per-district collector selector. state.units filtered by role==='collector'+factionId exists, but unit→district needs the WorldLayout partition (districtOfTile, worldgen.ts:157) which is scene-side. Player's own collectors — not fog.
- **current incidents** — No selector filters incidents by district. state.incidents (types.ts:265) records carry data.districtId (ledger.ts:48); recentIncidents/incidentsByType key on recency/type only. Incident location + rival-linked → fog-gate.

</details>

## Needs new plumbing (before those rows can render)

### MISSING (new sim work)
- `heatBeatMeter` -> **heat-source: extorted fronts** — No heat-source breakdown selector exists — heat is a single scalar. Extort heat = EXTORT_HEAT(4, constants.ts:8) x extorted-front count, applied INLINE in tick.ts:85 (resolveExtortionHeat) and folded into Family.heat, never stored per-source. No selector returns 'heat from extorted fronts' (only extortionIncome/launderCapacity count fronts). Own heat source.
- `heatBeatMeter` -> **heat-source: collections** — No selector. Collection heat = COLLECT_HEAT(2, constants.ts:160), applied inline on deposit in mapEconomy.ts:251 and in the collect command commands.ts:748 — never stored per-source. Own heat source.
- `heatBeatMeter` -> **heat-source: offensive actions** — No selector. Offense heat added inline via offense.ts:43 (family.heat += amount for raid/sabotage/assassinate). Not exposed or stored per-source. Own heat source.
- `heatBeatMeter` -> **heat-source: sabotage-violence** — No selector. Violence heat applied inline: HIT_HEAT(25) conflict.ts:119, ATTACK_HEAT(6) interdiction.ts:74, INTERCEPT_HEAT interception.ts:102. Constants only; no per-source breakdown selector. Own heat source.
- `heatBeatMeter` -> **heat-source: cop reports [later]** — Does not exist. Beat cops (state.beatCops, types.ts:285; copBehavior suspicion/mode) are numbers-frozen and add NO heat and emit NO player-facing 'report'. If built, this surfaces COP state and MUST read through the fog seam (copBehavior.copSees / beatCops.copMarkerVisible), never x-ray. fogSensitive.
- `heatBeatMeter` -> **heat-source: systemic shocks [later]** — No heat-contribution selector. Crackdown shock adds CRACKDOWN_HEAT(8) to every family inline in shocks.ts:124. The active-shock LIST is on state.activeShocks (types.ts:224) and exposed via realtimeHudView.shocks (hud.ts:114) / incomeShockMultiplier, but the heat contribution is not. Shocks are global/systemic (not hidden rival state), player's own crackdown heat.
- `heatBeatMeter` -> **beatCopReports** — No player-facing 'report' concept/selector. BeatCop state exists (beatCops.ts:46: suspicion/mode/focusUnitId/lastSeen) but is observation-only. Any surfaced cop report is fog-sensitive and must gate on copBehavior.copSees / beatCops.copMarkerVisible (isRevealed) — reuse the visibility seam, do not x-ray cop positions/witnessing.
- `commandDashboard` -> **controlDelta (recent)** — Not tracked anywhere. snapshotPlayer (realtime.ts:101) only captures cleanCash/dirtyCash/heat/exposure — no control/districtsHeld prior-week snapshot exists, so no control delta can be derived.

### In state, needs a thin selector
- `moneyLedger` -> **weeklyExpenses / itemized: upkeep** (`Family.gangsters[].upkeep`, src/sim/types.ts:42)
- `moneyLedger` -> **weeklyExpenses / itemized: bribe retainers** (`Family.bribeLevel`, src/sim/types.ts:59)
- `federalLadder` -> **bustArmTimer (fedImminentTicks)** (`player.fedImminentTicks`, src/sim/types.ts:75)
- `thugRoster` -> **weaponTier** (`state.units[].weapon`, src/sim/movement.ts:33)
- `frontsExtortion` -> **current embodied-shakedown acts** (`GameState.extortionActs`, src/sim/types.ts:247)
- `commandDashboard` -> **cashDelta (recent)** (`GameState.incidents[].data.cleanDelta/dirtyDelta`, src/sim/realtime.ts:154)
- `commandDashboard` -> **heatDelta (recent)** (`GameState.incidents[].data.heatDelta`, src/sim/realtime.ts:156)
- `commandDashboard` -> **exposureDelta (recent)** (`GameState.incidents[].data.exposureDelta`, src/sim/realtime.ts:157)
- `incidentLedger` -> **linkedEntity** (`GameState.incidents[].data`, src/sim/ledger.ts:48)
- `incidentLedger` -> **location** (`GameState.incidents[].data.districtId`, src/sim/ledger.ts:48)
- `districtDossier` -> **collectors** (`GameState.units`, src/sim/types.ts:234)
- `districtDossier` -> **current incidents** (`GameState.incidents (data.districtId)`, src/sim/ledger.ts:48)
